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

function serveMedia(res, entry, name, preview) {
  res.setHeader('Content-Type', entry.type || 'application/octet-stream')
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
}
