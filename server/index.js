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
  resolveYouTubeConvert1s,
  resolveYouTubeSsyou,
  resolveYouTubeYtmp4is,
  resolveTikTok,
  canonicalTikTokUrl,
  resolveTikTokLibrary,
  resolveTikTokMusicV2,
  AAC_ITAG,
  PROGRESSIVE_ITAG,
  isStreamAllowedHost,
  STREAM_HOST_HEADERS,
} from '../serverlib/shared.js'

const app = express()
const PORT = process.env.PORT || 8787

/** Resolve link TikTok (video & slideshow) via library tiktok-api-dl. */
app.get('/api/tiktok/resolve', async (req, res) => {
  const url = String(req.query.url || '')
  if (!/tiktok\.com|douyin\./i.test(url)) {
    return res.status(400).json({ error: 'URL TikTok tidak valid' })
  }

  // Pecahkan link pendek agar /photo/ terdeteksi, lalu resolve via library.
  const canonical = await canonicalTikTokUrl(url)

  // Jalankan dua sumber paralel: library (v3) + all-in-one (metadata).
  // all-in-one dipakai untuk MEMVALIDASI tipe: kalau di sana ada media
  // image berarti post ini slideshow — library kadang salah mengembalikan
  // video untuk slide di beberapa kondisi jaringan.
  const [lib, aio] = await Promise.all([
    resolveTikTokLibrary(canonical),
    getYouTubeStreams(url).catch(() => null),
  ])

  // Thumbnail video dari all-in-one (library v3 tanpa cover).
  if (lib && !lib.thumbnail && aio?.thumbnail) {
    lib.thumbnail = aio.thumbnail
  }

  const aioMedias = Array.isArray(aio?.medias) ? aio.medias : []
  const aioImages = aioMedias.filter((m) => m.type === 'image').map((m) => m.url).filter(Boolean)
  const aioAudio = (aioMedias.find((m) => m.type === 'audio') || {}).url || null

  let r = lib
  if (r && !r.music) {
    r.music = await resolveTikTokMusicV2(canonical).catch(() => null)
  }

  // Post terbukti slideshow (all-in-one melihat gambar) → pakai foto.
  if (aioImages.length) {
    res.json({
      type: 'image',
      title: r?.title || aio?.title || null,
      author: r?.author || null,
      avatar: r?.avatar || null,
      thumbnail: aioImages[0],
      videos: [],
      images: aioImages,
      music: r?.music || aioAudio,
    })
    return
  }

  // Cadangan: resolver tiktokio — HANYA untuk video (tidak dukung foto).
  const looksPhoto = /\/photo\//i.test(canonical)
  if ((!r || (!r.videos?.length && !r.images?.length)) && !looksPhoto) {
    const alt = await resolveTikTok(url)
    if (alt?.links?.length) {
      r = {
        type: 'video',
        title: alt.title,
        author: null,
        avatar: null,
        thumbnail: alt.thumbnail,
        videos: alt.links.filter((l) => l.kind === 'video'),
        images: [],
        music: (alt.links.find((l) => l.kind === 'audio') || {}).url || null,
      }
    }
  }
  if (!r || (!r.videos?.length && !r.images?.length)) {
    return res.status(502).json({ error: 'Gagal me-resolve video' })
  }
  res.json(r)
})

/** Metadata + daftar itag yang tersedia untuk sebuah video. */
app.get('/api/youtube/info', async (req, res) => {
  const url = String(req.query.url || '')
  if (!/youtube\.com|youtu\.be/i.test(url)) {
    return res.status(400).json({ error: 'URL YouTube tidak valid' })
  }

  const r = await getYouTubeStreams(url, 2)
  if (!r) return res.status(502).json({ error: 'Gagal mengambil data dari sumber' })

  const byItag = byItagMap(r.medias)

  res.json({
    title: r.title || null,
    author: r.author || null,
    thumbnail: r.thumbnail || null,
    duration: r.duration || null,
    hasAudioItag: Boolean(byItag[AAC_ITAG]),
    hasProgressive: Boolean(byItag[PROGRESSIVE_ITAG]),
    progressiveUrl: byItag[PROGRESSIVE_ITAG]?.url || null,
    audioUrl: byItag[AAC_ITAG]?.url || null,
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

  // ---- MP3: ytmp4is (instan) -> convert1s (cadangan). ----
  if (String(req.query.format || '') === 'mp3') {
    const y1 = await resolveYouTubeYtmp4is(url)
    if (y1?.downloadUrl) {
      const st = await fetch(y1.downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (st.ok) {
        const buf = Buffer.from(await st.arrayBuffer())
        if (buf.length > 1000) {
          res.setHeader('Content-Type', 'audio/mpeg')
          res.setHeader('Content-Length', String(buf.length))
          res.setHeader('Content-Disposition', `attachment; filename="${safeTitle(y1.title)}.mp3"`)
          res.end(buf)
          return
        }
      }
    }
    const c1 = await resolveYouTubeConvert1s(url, { audio: true })
    if (c1?.downloadUrl) {
      const st = await fetch(c1.downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (st.ok) {
        const buf = Buffer.from(await st.arrayBuffer())
        if (buf.length > 0) {
          res.setHeader('Content-Type', 'audio/mpeg')
          res.setHeader('Content-Length', String(buf.length))
          res.setHeader('Content-Disposition', `attachment; filename="${safeTitle(c1.title)}.mp3"`)
          res.end(buf)
          return
        }
      }
    }
    return res.status(502).json({ error: 'Gagal mengonversi MP3' })
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
    // Fallback serverless-style: ssyou merge H.264 → convert1s → savetube.
    try {
      const ss = await resolveYouTubeSsyou(url, wantHeight)
      if (ss?.downloadUrl) {
        const st = await fetch(ss.downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        if (st.ok) {
          const buf = Buffer.from(await st.arrayBuffer())
          if (buf.length > 0) {
            res.setHeader('Content-Type', 'video/mp4')
            res.setHeader('Content-Length', String(buf.length))
            res.setHeader('Content-Disposition', `attachment; filename="${safeTitle(ss.title)}.mp4"`)
            res.end(buf)
            return
          }
        }
      }
    } catch {}
    if (!res.headersSent) res.status(502).json({ error: 'Gagal mengunduh stream' })
    else res.end()
  }
})

/**
 * Proxy unduhan generik untuk CDN tanpa CORS (mis. snapcdn untuk Twitter,
 * ssscdn untuk Facebook). Meneruskan Content-Length agar progress bar akurat.
 */
// Cache media kecil (<=8MB): preview & unduhan berbagi byte (token
// sekali pakai tidak habis dimakan preview).
const mediaCache = new Map()
const MEDIA_CACHE_TTL = 10 * 60 * 1000
const MEDIA_CACHE_MAX = 8 * 1024 * 1024
function cacheGet(k) {
  const e = mediaCache.get(k)
  if (!e) return null
  if (Date.now() - e.at > MEDIA_CACHE_TTL) { mediaCache.delete(k); return null }
  return e
}
function cacheSet(k, buf, type) {
  if (!buf || buf.length > MEDIA_CACHE_MAX) return
  if (mediaCache.size > 60) mediaCache.clear()
  mediaCache.set(k, { buf, type, at: Date.now() })
}
function serveMedia(res, e, name, preview) {
  res.setHeader('Content-Type', e.type || 'application/octet-stream')
  res.setHeader('Content-Length', String(e.buf.length))
  if (!preview) res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
  res.setHeader('Cache-Control', 'no-store')
  res.end(e.buf)
}

app.get('/api/stream', async (req, res) => {
  const target = String(req.query.url || '')
  let host
  try {
    host = new URL(target).hostname
  } catch {
    return res.status(400).json({ error: 'URL tidak valid' })
  }
  if (!isStreamAllowedHost(host)) {
    return res.status(403).json({ error: 'Host tidak diizinkan' })
  }

  const preview = req.query.preview === '1'
  const name = String(req.query.filename || 'download').replace(/[^\w.\-()]/g, '_')

  const hit = cacheGet(target)
  if (hit) return serveMedia(res, hit, name, preview)

  try {
    // Coba 2x — CDN sesekali menolak sesaat (rate limit transien).
    let upstream = null
    for (let attempt = 0; attempt < 2; attempt++) {
      upstream = await fetch(target, { headers: STREAM_HOST_HEADERS[host] || {} })
      if (upstream.ok) break
      if (attempt === 0) await new Promise((r) => setTimeout(r, 900))
    }
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: `Gagal mengambil file (HTTP ${upstream.status})` })
    }

    const type = upstream.headers.get('content-type') || 'application/octet-stream'
    const buf = Buffer.from(await upstream.arrayBuffer())
    if (buf.length === 0) {
      return res.status(502).json({ error: 'File sumber kosong' })
    }
    cacheSet(target, buf, type)
    serveMedia(res, { buf, type }, name, preview)
  } catch {
    if (!res.headersSent) res.status(502).json({ error: 'Gagal men-stream file' })
    else res.end()
  }
})

app.listen(PORT, () => {
  console.log(`Noisy AIO proxy listening on http://localhost:${PORT}`)
})
