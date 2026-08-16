import {
  resolveTikTokLibrary,
  resolveTikTokMusicV2,
  resolveTikTok,
} from '../../serverlib/shared.js'

/**
 * GET /api/tiktok/resolve?url=...
 * Resolve link TikTok (video maupun slideshow foto) via library
 * tiktok-api-dl → link unduhan di fastdl.muscdn.app (bebas blokir IP).
 */
export default async function handler(req, res) {
  const url = String(req.query.url || '')
  if (!/tiktok\.com|douyin\./i.test(url)) {
    return res.status(400).json({ error: 'URL TikTok tidak valid' })
  }

  let r = await resolveTikTokLibrary(url)

  // Lengkapi musik via v2 bila v3 tidak menyertakannya.
  if (r && !r.music) {
    r.music = await resolveTikTokMusicV2(url)
  }

  // Cadangan: resolver tiktokio (hanya video).
  if (!r || (!r.videos?.length && !r.images?.length)) {
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
}
