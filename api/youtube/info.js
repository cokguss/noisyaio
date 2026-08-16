import { byItagMap, videoChoices, getYouTubeStreams, AAC_ITAG, PROGRESSIVE_ITAG } from '../../serverlib/shared.js'

/** GET /api/youtube/info?url=... — metadata + daftar kualitas H.264. */
export default async function handler(req, res) {
  const url = String(req.query.url || '')
  if (!/youtube\.com|youtu\.be/i.test(url)) {
    return res.status(400).json({ error: 'URL YouTube tidak valid' })
  }

  const r = await getYouTubeStreams(url)
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
    videoChoices: videoChoices(byItag),
  })
}
