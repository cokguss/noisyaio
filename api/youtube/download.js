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
 * Cari binary ffmpeg. Bila tidak tersedia di bundle serverless, unduhan
 * otomatis jatuh ke mode progressive (itag 18: H.264+AAC 360p tergabung).
 */
function findFfmpeg() {
  const candidates = [
    ffmpegPath,
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    join(process.cwd(), 'api', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) || null
}

const CHUNK = 1024 * 1024

function sendBufferStreamed(res, buf, disposition) {
  // Tulis per-chunk tanpa Content-Length → response chunked/streaming,
  // melewati batas ukuran response ter-buffer di serverless (~4.5 MB).
  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Content-Disposition', disposition)
  for (let i = 0; i < buf.length; i += CHUNK) {
    res.write(buf.subarray(i, i + CHUNK))
  }
  res.end()
}

/**
 * GET /api/youtube/download?url=...&height=720
 * Alur: unduh stream per-potongan paralel (anti-throttle) → remux ffmpeg
 * → kirim sebagai response STREAMING (bukan buffer utuh), karena response
 * serverless yang di-bufer dibatasi ~4.5 MB — di atas itu body dikosongkan
 * (file jadi 0 byte meski status 200).
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
  const ffBin = findFfmpeg()

  let tmp = null
  try {
    // ---- Mode utama: remux H.264 + AAC, stream output ffmpeg. ----
    if (ffBin && pick && audio) {
      tmp = await mkdtemp(join(tmpdir(), 'noisy-yt-'))
      const [vBuf, aBuf] = await Promise.all([
        fetchStreamFast(byItag[pick.itag].url),
        fetchStreamFast(audio.url),
      ])
      const vPath = join(tmp, 'v.mp4')
      const aPath = join(tmp, 'a.m4a')
      await Promise.all([writeFile(vPath, vBuf), writeFile(aPath, aBuf)])

      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Content-Disposition', disposition)

      await new Promise((resolve, reject) => {
        const ff = spawn(ffBin, [
          '-hide_banner', '-loglevel', 'error',
          '-i', vPath, '-i', aPath,
          '-map', '0:v:0', '-map', '1:a:0',
          '-c', 'copy',
          '-movflags', 'frag_keyframe+empty_moov+faststart',
          '-f', 'mp4', 'pipe:1',
        ])
        let err = ''
        ff.stdout.on('data', (c) => res.write(c))
        ff.stderr.on('data', (d) => { err += d.toString() })
        ff.on('error', reject)
        ff.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`ffmpeg exit ${code}: ${err.slice(0, 300)}`))
        })
      })

      res.end()
      await rm(tmp, { recursive: true, force: true })
      tmp = null
      return
    }
  } catch (err) {
    if (res.headersSent) {
      // Sebagian body sudah terkirim — tidak bisa fallback; akhiri.
      res.end()
      if (tmp) { await rm(tmp, { recursive: true, force: true }).catch(() => {}); tmp = null }
      return
    }
    // Belum ada body terkirim → lanjut ke fallback progressive di bawah.
    if (tmp) { await rm(tmp, { recursive: true, force: true }).catch(() => {}); tmp = null }
  } finally {
    if (tmp) rm(tmp, { recursive: true, force: true }).catch(() => {})
  }

  // ---- Fallback: progressive itag 18 (H.264+AAC 360p), streamed. ----
  if (!prog) return res.status(422).json({ error: 'Tidak ada format H.264 yang tersedia' })
  try {
    const buf = await fetchStreamFast(prog.url)
    sendBufferStreamed(res, buf, disposition)
  } catch {
    if (!res.headersSent) res.status(502).json({ error: 'Gagal mengunduh stream' })
    else res.end()
  }
}
