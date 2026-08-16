import { STREAM_ALLOWED_HOSTS, STREAM_HOST_HEADERS } from '../serverlib/shared.js'

/**
 * GET /api/stream?url=...&filename=...
 * Proxy unduhan untuk CDN tanpa CORS (snapcdn utk Twitter, ssscdn utk
 * Facebook). Di serverless, file di-buffer penuh dulu lalu dikirim utuh
 * dengan Content-Length — pipe langsung berisiko terpotong saat event
 * 'close' terpicu lebih awal oleh platform (hasil: file 0 byte).
 */
export default async function handler(req, res) {
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
    if (!upstream.ok) {
      return res.status(502).json({ error: `Gagal mengambil file (HTTP ${upstream.status})` })
    }

    const type = upstream.headers.get('content-type') || 'application/octet-stream'
    const name = String(req.query.filename || 'download').replace(/[^\w.\-()]/g, '_')
    const buf = Buffer.from(await upstream.arrayBuffer())

    res.setHeader('Content-Type', type)
    res.setHeader('Content-Length', String(buf.length))
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.end(buf)
  } catch {
    if (!res.headersSent) res.status(502).json({ error: 'Gagal men-stream file' })
    else res.end()
  }
}
