import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import {
  byItagMap,
  videoChoices,
  getYouTubeStreams,
  fetchStreamFast,
  safeTitle,
  AAC_ITAG,
  PROGRESSIVE_ITAG,
} from '../../serverlib/shared.js'

/**
 * Cari binary ffmpeg. Di serverless, file tracing kadang tidak ikut
 * menyertakan binary ffmpeg-static — kalau tidak ditemukan, kita fallback
 * ke mode tanpa-remux (stream langsung itag 18: H.264+AAC 360p yang sudah
 * tergabung) supaya unduhan tetap berhasil.
 */
function findFfmpeg() {
  const candidates = [
    ffmpegPath,
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    join(process.cwd(), 'api', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) || null
}

/**
 * GET /api/youtube/download?url=...&height=720
 * Ambil video H.264 + audio AAC per-potongan paralel (anti-throttle),
 * remux lokal via ffmpeg tanpa re-encode, lalu stream ke klien.
 * Bila ffmpeg tak tersedia: kirim itag 18 (progressive H.264+AAC) utuh.
 */
export default async function handler(req, res) {
  const url = String(req.query.url || '')
  const wantHeight = parseInt(String(req.query.height || '720'), 10)
  if (!/youtube\.com|youtu\.be/i.test(url)) {
    return res.status(400).json({ error: 'URL YouTube tidak valid' })
  }

  const r = await getYouTubeStreams(url)
  if (!r) return res.status(502).json({ error: 'Gagal mengambil data dari sumber' })

  const byItag = byItagMap(r.medias)
  const ranked = videoChoices(byItag)
  const pick = ranked.find((x) => x.h <= wantHeight) || ranked[ranked.length - 1]
  const audio = byItag[AAC_ITAG]

  const disposition = `attachment; filename="${safeTitle(r.title)}.mp4"`

  // ---- Mode fallback tanpa ffmpeg: kirim progressive itag 18 langsung. ----
  const ffBin = findFfmpeg()
  if (!ffBin) {
    const prog = byItag[PROGRESSIVE_ITAG]
    if (!prog) return res.status(422).json({ error: 'Tidak ada format H.264 yang tersedia' })
    const buf = await fetchStreamFast(prog.url)
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(buf.length))
    res.setHeader('Content-Disposition', disposition)
    res.end(buf)
    return
  }

  let tmp
  try {
    tmp = await mkdtemp(join(tmpdir(), 'noisy-yt-'))

    let inputs
    if (pick && audio) {
      const [vBuf, aBuf] = await Promise.all([
        fetchStreamFast(byItag[pick.itag].url),
        fetchStreamFast(audio.url),
      ])
      const vPath = join(tmp, 'v.mp4')
      const aPath = join(tmp, 'a.m4a')
      await Promise.all([writeFile(vPath, vBuf), writeFile(aPath, aBuf)])
      inputs = ['-i', vPath, '-i', aPath, '-map', '0:v:0', '-map', '1:a:0']
    } else if (byItag[PROGRESSIVE_ITAG]) {
      const pBuf = await fetchStreamFast(byItag[PROGRESSIVE_ITAG].url)
      const pPath = join(tmp, 'p.mp4')
      await writeFile(pPath, pBuf)
      inputs = ['-i', pPath]
    } else {
      await rm(tmp, { recursive: true, force: true })
      return res.status(422).json({ error: 'Tidak ada format H.264 yang tersedia' })
    }

    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Disposition', disposition)

    const args = [
      '-hide_banner', '-loglevel', 'error',
      ...inputs,
      '-c', 'copy',
      '-movflags', 'frag_keyframe+empty_moov+faststart',
      '-f', 'mp4', 'pipe:1',
    ]
    const ff = spawn(ffBin, args)
    ff.stdout.pipe(res)

    ff.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.end() })
    ff.on('close', (code) => {
      if (code !== 0 && !res.writableEnded) res.end()
      rm(tmp, { recursive: true, force: true }).catch(() => {})
    })
    res.on('close', () => {
      ff.kill('SIGKILL')
      rm(tmp, { recursive: true, force: true }).catch(() => {})
    })
  } catch (err) {
    if (tmp) await rm(tmp, { recursive: true, force: true }).catch(() => {})
    if (!res.headersSent) res.status(502).json({ error: 'Gagal mengunduh stream' })
    else res.end()
  }
}
