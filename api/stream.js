import { isStreamAllowedHost, STREAM_HOST_HEADERS } from '../serverlib/shared.js'

// Cache media kecil (<=8MB, TTL 10 menit): preview di kartu hasil dan
// unduhan memakai byte yang sama, sehingga token URL sekali-pakai di CDN
// (snapcdn/savetube-style) tidak "habis" dimakan preview.
const mediaCache = new Map()
const MEDIA_CACHE_TTL = 10 * 60 * 1000
const MEDIA_CACHE_MAX = 8 * 1024 * 1024

function cacheGet(key) {
  const e = mediaCache.get(key)
  if (!e) return null
  if (Date.now() - e.at > MEDIA_CACHE_TTL) { mediaCache.delete(key); return null }
  return e
}

function cacheSet(key, buf, type) {
  if (!buf || buf.length > MEDIA_CACHE_MAX) return
  if (mediaCache.size > 60) mediaCache.clear()
  mediaCache.set(key, { buf, type, at: Date.now() })
}


// Deteksi Content-Type dari byte file (magic numbers). CDN seperti
// fastdl.muscdn mengirim "application/octet-stream" — elemen <video>
// menolak MIME salah, jadi mode preview perlu tipe yang benar.
function sniffType(buf, fallback) {
  if (!buf || buf.length < 12) return fallback
  if (buf.subarray(4, 8).toString() === 'ftyp') return 'video/mp4'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf.subarray(0, 4).toString() === 'RIFF') return 'video/webm'
  if (buf.subarray(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'audio/mpeg'
  if (buf.subarray(0, 4).toString() === 'OggS') return 'audio/ogg'
  return fallback
}

function serveMedia(req, res, entry, name, preview) {
  const type = preview ? sniffType(entry.buf, entry.type) : (entry.type || 'application/octet-stream')
  res.setHeader('Content-Type', type)
  res.setHeader('Accept-Ranges', 'bytes')

  // Dukungan Range: elemen <video> (khususnya Safari/iOS) memintanya.
  const range = req.headers.range
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/)
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0
      const end = m[2] ? Math.min(parseInt(m[2], 10), entry.buf.length - 1) : entry.buf.length - 1
      if (start <= end) {
        res.statusCode = 206
        res.setHeader('Content-Range', `bytes ${start}-${end}/${entry.buf.length}`)
        res.setHeader('Content-Length', String(end - start + 1))
        if (!preview) res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
        res.setHeader('Cache-Control', 'no-store')
        res.end(entry.buf.subarray(start, end + 1))
        return
      }
    }
  }

  res.setHeader('Content-Length', String(entry.buf.length))
  if (!preview) res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
  res.setHeader('Cache-Control', 'no-store')
  res.end(entry.buf)
}

/**
 * GET /api/stream?url=...&filename=...[&preview=1]
 * Proxy unduhan/preview untuk CDN tanpa CORS (snapcdn, ssscdn, tikwm,
 * tiktokcdn, fbcdn, dl.tiktokio, dl.snapcdn). Media <=8MB di-cache agar
 * preview + unduhan tidak berebut token sekali pakai.
 */
export default async function handler(req, res) {
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
  if (hit) return serveMedia(req, res, hit, name, preview)

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
    serveMedia(req, res, { buf, type }, name, preview)
  } catch {
    if (!res.headersSent) res.status(502).json({ error: 'Gagal men-stream file' })
    else res.end()
  }
}
