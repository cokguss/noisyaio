import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import {
  byItagMap,
  resolveYouTubeConvert1s,
  videoChoices,
  getYouTubeStreams,
  fetchStreamFast,
  getSaveTubeVideo,
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

  // ---- MP3: konversi convert1s (H.264-free, cepat). ----
  if (String(req.query.format || '') === 'mp3') {
    const c1 = await resolveYouTubeConvert1s(url, { audio: true })
    if (c1?.downloadUrl) {
      const st = await fetch(c1.downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (st.ok) {
        const buf = Buffer.from(await st.arrayBuffer())
        if (buf.length > 0) {
          res.setHeader('Content-Type', 'audio/mpeg')
          res.setHeader('Content-Disposition', `attachment; filename="${safeTitle(c1.title || r.title)}.mp3"`)
          res.end(buf)
          return
        }
      }
    }
    return res.status(502).json({ error: 'Gagal mengonversi MP3' })
  }

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

      let written = 0
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
        ff.stdout.on('data', (c) => { written += c.length; res.write(c) })
        ff.stderr.on('data', (d) => { err += d.toString() })
        ff.on('error', reject)
        ff.on('close', (code) => {
          if (code === 0 && written > 0) resolve()
          else reject(new Error(`ffmpeg exit ${code} (${written}B): ${err.slice(0, 200)}`))
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

  // ---- Fallback 1: progressive itag 18 (H.264+AAC 360p), streamed. ----
  if (prog) {
    try {
      const buf = await fetchStreamFast(prog.url)
      if (buf && buf.length > 0) {
        return sendBufferStreamed(res, buf, disposition)
      }
    } catch {
      /* lanjut ke fallback savetube */
    }
  }

  // ---- Fallback 2: convert1s — MP4 H.264 hasil konversi server-side.
  //      Kompatibel semua pemutar (termasuk iPhone/iPad). ----
  const q = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p']
    .filter((x) => parseInt(x) <= Math.max(wantHeight, 144))
    .pop() || '360p'
  const c1 = await resolveYouTubeConvert1s(url, { quality: q })
  if (c1?.downloadUrl) {
    try {
      const st = await fetch(c1.downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (st.ok) {
        const buf = Buffer.from(await st.arrayBuffer())
        if (buf.length > 0) {
          res.setHeader('Content-Type', 'video/mp4')
          res.setHeader('Content-Length', String(buf.length))
          res.setHeader('Content-Disposition', `attachment; filename="${safeTitle(c1.title || r.title)}.mp4"`)
          res.end(buf)
          return
        }
      }
    } catch {
      /* lanjut savetube */
    }
  }

  // ---- Fallback 3: savetube (muxed video+audio, codec AV1; tidak bisa
  //      diputar di sebagian pemutar lawas). ----
  const stUrl = await getSaveTubeVideo(url)
  if (stUrl) {
    try {
      const st = await fetch(stUrl)
      if (st.ok) {
        const buf = Buffer.from(await st.arrayBuffer())
        if (buf.length > 0) {
          return sendBufferStreamed(res, buf, disposition)
        }
      }
    } catch {
      /* lanjut ke error */
    }
  }

  if (!res.headersSent) res.status(502).json({ error: 'Gagal mengunduh stream' })
  else res.end()
}
