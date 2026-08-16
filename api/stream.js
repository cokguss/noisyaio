import { isStreamAllowedHost, STREAM_HOST_HEADERS } from '../serverlib/shared.js'

/**
 * GET /api/stream?url=...&filename=...
 * Proxy unduhan untuk CDN tanpa CORS (snapcdn utk Twitter, ssscdn utk
 * Facebook). Body diteruskan sebagai response STREAMING per-chunk —
 * response serverless yang di-bufer dibatasi ~4.5 MB dan di atas itu
 * dikosongkan (file 0 byte).
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
    const len = upstream.headers.get('content-length')
    const name = String(req.query.filename || 'download').replace(/[^\w.\-()]/g, '_')

    res.setHeader('Content-Type', type)
    if (len) res.setHeader('Content-Length', len)
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.setHeader('Cache-Control', 'no-store')

    const reader = upstream.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
    res.end()
  } catch {
    if (!res.headersSent) res.status(502).json({ error: 'Gagal men-stream file' })
    else res.end()
  }
}
