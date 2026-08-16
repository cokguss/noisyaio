import { resolveTikTok } from '../../serverlib/shared.js'

/**
 * GET /api/tiktok/resolve?url=...
 * Resolve link TikTok via snaptik (server-side) → link unduhan snapcdn.
 */
export default async function handler(req, res) {
  const url = String(req.query.url || '')
  if (!/tiktok\.com|douyin\./i.test(url)) {
    return res.status(400).json({ error: 'URL TikTok tidak valid' })
  }
  const r = await resolveTikTok(url)
  if (!r || r.links.length === 0) {
    return res.status(502).json({ error: 'Gagal me-resolve video' })
  }
  res.json(r)
}
