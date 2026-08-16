import {
  resolveTikTokLibrary,
  resolveTikTokMusicV2,
  resolveTikTok,
  canonicalTikTokUrl,
  getYouTubeStreams,
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
}
