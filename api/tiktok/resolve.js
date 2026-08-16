import {
  resolveTikTokLibrary,
  resolveTikTokMusicV2,
  resolveTikTok,
  canonicalTikTokUrl,
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

  // Pecahkan link pendek agar /photo/ terdeteksi, lalu resolve via library.
  const canonical = await canonicalTikTokUrl(url)
  let r = await resolveTikTokLibrary(canonical)

  // Lengkapi musik via v2 bila v3 tidak menyertakannya.
  if (r && !r.music) {
    r.music = await resolveTikTokMusicV2(canonical)
  }

  // Cadangan: resolver tiktokio — HANYA untuk video, karena tiktokio
  // salah mengira slideshow foto sebagai video (tidak mendukung foto).
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
}
