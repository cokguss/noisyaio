import express from 'express'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
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
  STREAM_ALLOWED_HOSTS,
  STREAM_HOST_HEADERS,
} from '../serverlib/shared.js'

const app = express()
const PORT = process.env.PORT || 8787

/** Metadata + daftar itag yang tersedia untuk sebuah video. */
app.get('/api/youtube/info', async (req, res) => {
  const url = String(req.query.url || '')
  if (!/youtube\.com|youtu\.be/i.test(url)) {
    return res.status(400).json({ error: 'URL YouTube tidak valid' })
  }

  const r = await getYouTubeStreams(url)
  if (!r) return res.status(502).json({ error: 'Gagal mengambil data dari sumber' })

  const byItag = byItagMap(r.medias)

  res.json({
    title: r.title || null,
    author: r.author || null,
    thumbnail: r.thumbnail || null,
    duration: r.duration || null,
    hasAudioItag: Boolean(byItag[AAC_ITAG]),
    hasProgressive: Boolean(byItag[PROGRESSIVE_ITAG]),
    videoChoices: videoChoices(byItag),
  })
})

/**
 * Unduh & remux menjadi MP4 H.264+AAC yang jalan di semua player.
 * ?url=...&height=720 (opsional). Streaming langsung ke browser via ffmpeg.
 */
app.get('/api/youtube/download', async (req, res) => {
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
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle(r.title)}.mp4"`)

    const args = [
      '-hide_banner', '-loglevel', 'error',
      ...inputs,
      '-c', 'copy',
      '-movflags', 'frag_keyframe+empty_moov+faststart',
      '-f', 'mp4', 'pipe:1',
    ]
    const ff = spawn(ffmpegPath, args)
    ff.stdout.pipe(res)

    let errBuf = ''
    ff.stderr.on('data', (d) => { errBuf += d.toString() })
    ff.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.end() })
    ff.on('close', (code) => {
      if (code !== 0 && !res.writableEnded) {
        console.error('ffmpeg error:', errBuf.slice(0, 500))
        res.end()
      }
      rm(tmp, { recursive: true, force: true }).catch(() => {})
    })

    req.on('close', () => {
      ff.kill('SIGKILL')
      rm(tmp, { recursive: true, force: true }).catch(() => {})
    })
  } catch (err) {
    if (tmp) await rm(tmp, { recursive: true, force: true }).catch(() => {})
    console.error('download error:', err.message)
    if (!res.headersSent) res.status(502).json({ error: 'Gagal mengunduh stream' })
    else res.end()
  }
})

/**
 * Proxy unduhan generik untuk CDN tanpa CORS (mis. snapcdn untuk Twitter,
 * ssscdn untuk Facebook). Meneruskan Content-Length agar progress bar akurat.
 */
app.get('/api/stream', async (req, res) => {
  const target = String(req.query.url || '')
  let host
  try {
    host = new URL(target).hostname
  } catch {
    return res.status(400).json({ error: 'URL tidak valid' })
  }
  if (!STREAM_ALLOWED_HOSTS.has(host)) {
    return res.status(403).json({ error: 'Host tidak diizinkan' })
  }

  try {
    const upstream = await fetch(target, { headers: STREAM_HOST_HEADERS[host] || {} })
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: `Gagal mengambil file (HTTP ${upstream.status})` })
    }

    const len = upstream.headers.get('content-length')
    const type = upstream.headers.get('content-type') || 'application/octet-stream'
    const name = String(req.query.filename || 'download').replace(/[^\w.\-()]/g, '_')
    res.setHeader('Content-Type', type)
    if (len) res.setHeader('Content-Length', len)
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.setHeader('Cache-Control', 'no-store')

    const nodeStream = Readable.fromWeb(upstream.body)
    nodeStream.pipe(res)
    req.on('close', () => nodeStream.destroy())
  } catch {
    if (!res.headersSent) res.status(502).json({ error: 'Gagal men-stream file' })
    else res.end()
  }
})

app.listen(PORT, () => {
  console.log(`Noisy AIO proxy listening on http://localhost:${PORT}`)
})
