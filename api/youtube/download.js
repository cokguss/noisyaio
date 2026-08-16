import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
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
 * ke mode tanpa-remux (kirim langsung itag 18: H.264+AAC 360p yang sudah
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

/** Jalankan ffmpeg menulis ke file output, selesai saat proses exit 0. */
function runFfmpeg(ffBin, inputs, outPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffBin, [
      '-hide_banner', '-loglevel', 'error',
      ...inputs,
      '-c', 'copy',
      '-movflags', 'frag_keyframe+empty_moov+faststart',
      '-f', 'mp4', '-y', outPath,
    ])
    let err = ''
    ff.stderr.on('data', (d) => { err += d.toString() })
    ff.on('error', reject)
    ff.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(0, 300)}`))
    })
  })
}

/**
 * GET /api/youtube/download?url=...&height=720
 * Alur serverless yang deterministik: unduh stream per-potongan paralel
 * (anti-throttle) → remux ffmpeg ke file sementara → kirim buffer utuh.
 * Pipe langsung ke response TIDAK dipakai di serverless karena event
 * 'close' bisa terpicu lebih awal dan membunuh ffmpeg → file 0 byte.
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
  const prog = byItag[PROGRESSIVE_ITAG]

  const disposition = `attachment; filename="${safeTitle(r.title)}.mp4"`
  const sendBuffer = (buf) => {
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(buf.length))
    res.setHeader('Content-Disposition', disposition)
    res.end(buf)
  }

  let tmp = null
  try {
    const ffBin = findFfmpeg()

    // ---- Mode utama: remux H.264 video + AAC audio via ffmpeg. ----
    if (ffBin && pick && audio) {
      tmp = await mkdtemp(join(tmpdir(), 'noisy-yt-'))
      const [vBuf, aBuf] = await Promise.all([
        fetchStreamFast(byItag[pick.itag].url),
        fetchStreamFast(audio.url),
      ])
      const vPath = join(tmp, 'v.mp4')
      const aPath = join(tmp, 'a.m4a')
      const outPath = join(tmp, 'out.mp4')
      await Promise.all([writeFile(vPath, vBuf), writeFile(aPath, aBuf)])
      await runFfmpeg(ffBin, ['-i', vPath, '-i', aPath, '-map', '0:v:0', '-map', '1:a:0'], outPath)
      const out = await readFile(outPath)
      await rm(tmp, { recursive: true, force: true })
      tmp = null
      return sendBuffer(out)
    }

    // ---- Fallback: kirim progressive itag 18 (H.264+AAC 360p) utuh. ----
    if (!prog) return res.status(422).json({ error: 'Tidak ada format H.264 yang tersedia' })
    const buf = await fetchStreamFast(prog.url)
    sendBuffer(buf)
  } catch (err) {
    // Remux gagal → coba fallback progressive supaya pengguna tetap dapat file.
    try {
      if (tmp) { await rm(tmp, { recursive: true, force: true }); tmp = null }
      if (prog) {
        const buf = await fetchStreamFast(prog.url)
        return sendBuffer(buf)
      }
    } catch {
      /* lanjut ke error */
    }
    if (!res.headersSent) res.status(502).json({ error: 'Gagal mengunduh stream' })
    else res.end()
  } finally {
    if (tmp) rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}
