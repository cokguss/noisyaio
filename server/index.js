import express from 'express'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

const app = express()
const PORT = process.env.PORT || 8787
const ALLINONE = 'https://api.ikyyxd.my.id/download/all-in-one'

// H.264 (avc1) video-only itags dari terbaik ke terendah, semua kompatibel
// dengan Windows Media Player / player lawas. AV1 (av01) & VP9 sengaja dihindari.
const H264_ITAGS = ['137', '136', '135', '134', '133', '160']
const AAC_ITAG = '140'
const PROGRESSIVE_ITAG = '18' // 360p H.264 + AAC sudah tergabung

function itagOf(url) {
  try {
    return new URL(url).searchParams.get('itag')
  } catch {
    return null
  }
}

/**
 * Unduh sebuah stream googlevideo cepat.
 * YouTube MELAMBATKAN unduhan sekuensial (bisa cuma ~3 KB/s), tetapi
 * permintaan Range per potongan tidak di-throttle (~4 MB/s). Jadi kita
 * ambil per potongan ~2 MB secara paralel lalu gabung.
 */
async function fetchStreamFast(url, chunkSize = 2 * 1024 * 1024, concurrency = 6) {
  // Ukuran total via Range 0-0.
  const head = await fetch(url, { headers: { Range: 'bytes=0-0' } })
  const cr = head.headers.get('content-range')
  const total = cr ? Number(cr.split('/')[1]) : Number(head.headers.get('content-length')) || 0
  if (!total) {
    // Tak diketahui: ambil sekaligus (kemungkinan file kecil).
    const r = await fetch(url)
    return Buffer.from(await r.arrayBuffer())
  }

  const ranges = []
  for (let start = 0; start < total; start += chunkSize) {
    ranges.push([start, Math.min(start + chunkSize - 1, total - 1)])
  }

  const buffers = new Array(ranges.length)
  let next = 0
  async function worker() {
    while (next < ranges.length) {
      const i = next++
      const [s, e] = ranges[i]
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(url, { headers: { Range: `bytes=${s}-${e}` } })
          if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
          buffers[i] = Buffer.from(await res.arrayBuffer())
          break
        } catch (err) {
          if (attempt === 2) throw err
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ranges.length) }, worker))
  return Buffer.concat(buffers)
}

// Cache hasil metadata (URL stream berumur pendek dari sumber). Menghindari
// panggilan ganda ke API upstream yang lambat (~7 detik) antara /info & /download.
const streamCache = new Map() // url -> { data, expires }
const CACHE_TTL = 5 * 60 * 1000

async function getYouTubeStreams(url) {
  const cached = streamCache.get(url)
  if (cached && cached.expires > Date.now()) return cached.data

  // all-in-one kadang balas error acak; coba beberapa kali.
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(`${ALLINONE}?url=${encodeURIComponent(url)}`)
      if (res.ok) {
        const json = await res.json()
        const r = json?.result
        if (json?.status && r && Array.isArray(r.medias) && r.medias.length) {
          streamCache.set(url, { data: r, expires: Date.now() + CACHE_TTL })
          return r
        }
      }
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, 700))
  }
  return null
}

/** Metadata + daftar itag yang tersedia untuk sebuah video. */
app.get('/api/youtube/info', async (req, res) => {
  const url = String(req.query.url || '')
  if (!/youtube\.com|youtu\.be/i.test(url)) {
    return res.status(400).json({ error: 'URL YouTube tidak valid' })
  }

  const r = await getYouTubeStreams(url)
  if (!r) return res.status(502).json({ error: 'Gagal mengambil data dari sumber' })

  const byItag = {}
  for (const m of r.medias) {
    const it = itagOf(m.url)
    if (it) byItag[it] = m
  }

  const videoChoices = H264_ITAGS
    .filter((it) => byItag[it])
    .map((it) => ({
      itag: it,
      height: parseInt((byItag[it].quality.match(/(\d+)p/) || [])[1] || '0', 10),
    }))
    .sort((a, b) => b.height - a.height)

  res.json({
    title: r.title || null,
    author: r.author || null,
    thumbnail: r.thumbnail || null,
    duration: r.duration || null,
    hasAudioItag: Boolean(byItag[AAC_ITAG]),
    hasProgressive: Boolean(byItag[PROGRESSIVE_ITAG]),
    videoChoices,
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

  const byItag = {}
  for (const m of r.medias) {
    const it = itagOf(m.url)
    if (it) byItag[it] = m
  }

  // Pilih video H.264 dengan tinggi <= yang diminta (atau terkecil di atasnya).
  const ranked = H264_ITAGS
    .filter((it) => byItag[it])
    .map((it) => ({ it, h: parseInt((byItag[it].quality.match(/(\d+)p/) || [])[1] || '0', 10) }))
    .sort((a, b) => b.h - a.h)

  const pick = ranked.find((x) => x.h <= wantHeight) || ranked[ranked.length - 1]
  const audio = byItag[AAC_ITAG]

  const safeName = (r.title || 'youtube')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'youtube'

  // Ambil stream dengan cepat (per-potongan paralel) ke file sementara,
  // baru remux lokal. Ini menghindari throttle unduhan sekuensial YouTube
  // yang bikin proses terasa macet di ~250 KB.
  let tmp
  try {
    tmp = await mkdtemp(join(tmpdir(), 'noisy-yt-'))

    let inputs
    if (pick && audio) {
      const [vBuf, aBuf] = await Promise.all([
        fetchStreamFast(byItag[pick.it].url),
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
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.mp4"`)

    // Remux tanpa re-encode dari file lokal (sangat cepat).
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
 * Proxy unduhan generik untuk CDN tanpa CORS (mis. snapcdn untuk Twitter).
 * Meneruskan Content-Length agar progress bar browser/aplikasi akurat.
 * Hanya host terdaftar yang diizinkan agar tidak jadi open proxy.
 * Sebagian CDN mewajibkan header tertentu (ssscdn minta Origin/Referer fget.io).
 */
const STREAM_ALLOWED_HOSTS = new Set(['dl.snapcdn.app', 'ssscdn.io'])
const STREAM_HOST_HEADERS = {
  'ssscdn.io': {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'Origin': 'https://fget.io',
    'Referer': 'https://fget.io/',
  },
}

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

    // response.body fetch adalah Web Stream; ubah ke Node Stream agar bisa dipipe.
    const nodeStream = Readable.fromWeb(upstream.body)
    nodeStream.pipe(res)
    req.on('close', () => nodeStream.destroy())
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: 'Gagal men-stream file' })
    else res.end()
  }
})

app.listen(PORT, () => {
  console.log(`Noisy AIO proxy listening on http://localhost:${PORT}`)
})
