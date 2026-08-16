/**
 * Logika bersama untuk proxy unduhan.
 * Dipakai oleh dua "kemasan" berbeda:
 *  - server/index.js   → Express lokal (npm run dev)
 *  - api/*.js          → Vercel serverless functions (deploy)
 */

const ALLINONE = 'https://api.ikyyxd.my.id/download/all-in-one'

// H.264 (avc1) video-only itags dari terbaik ke terendah — kompatibel
// dengan semua pemutar (termasuk Windows Media Player).
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

function byItagMap(medias) {
  const map = {}
  for (const m of medias) {
    const it = itagOf(m.url)
    if (it) map[it] = m
  }
  return map
}

/** Daftar pilihan video H.264 (tinggi ↓) dari map itag. */
function videoChoices(byItag) {
  return H264_ITAGS
    .filter((it) => byItag[it])
    .map((it) => ({
      itag: it,
      height: parseInt((byItag[it].quality.match(/(\d+)p/) || [])[1] || '0', 10),
    }))
    .sort((a, b) => b.height - a.height)
}

/**
 * Cache hasil metadata (URL stream berumur pendek). Menghindari panggilan
 * ganda ke API upstream yang lambat (~7 detik). Catatan: pada serverless,
 * cache hidup per-instance dan hilang saat cold start — tetap berguna.
 */
const streamCache = new Map()
const CACHE_TTL = 5 * 60 * 1000

async function getYouTubeStreams(url) {
  const cached = streamCache.get(url)
  if (cached && cached.expires > Date.now()) return cached.data

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

/**
 * Unduh stream googlevideo dengan cepat: unduhan sekuensial di-throttle
 * (~3 KB/s), permintaan Range per potongan tidak. Ambil ~2 MB per potongan,
 * 6 potongan paralel, lalu gabung.
 */
async function fetchStreamFast(url, chunkSize = 2 * 1024 * 1024, concurrency = 6) {
  const head = await fetch(url, { headers: { Range: 'bytes=0-0' } })
  const cr = head.headers.get('content-range')
  const total = cr ? Number(cr.split('/')[1]) : Number(head.headers.get('content-length')) || 0
  if (!total) {
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

/**
 * Ambil URL video muxed (video+audio) dari savetube via endpoint ytmp4.
 * Savetube menarik video lewat server mereka sendiri, sehingga tidak
 * terkena pembatasan IP googlevideo terhadap jaringan datacenter
 * (mis. Vercel/AWS). Catatan: hasilnya codec AV1.
 */
async function getSaveTubeVideo(url) {
  try {
    const res = await fetch(`https://api.ikyyxd.my.id/download/ytmp4?q=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const json = await res.json()
    if (!json?.status) return null
    return json?.result?.VideoUrl?.url || null
  } catch {
    return null
  }
}

/** Nama file aman dari judul video. */
function safeTitle(name) {
  return (name || 'youtube')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'youtube'
}

/** Host yang boleh di-stream via /api/stream + header wajib per host. */
const STREAM_ALLOWED_HOSTS = new Set(['dl.snapcdn.app', 'ssscdn.io'])
const STREAM_HOST_HEADERS = {
  'ssscdn.io': {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'Origin': 'https://fget.io',
    'Referer': 'https://fget.io/',
  },
}

export {
  ALLINONE,
  H264_ITAGS,
  AAC_ITAG,
  PROGRESSIVE_ITAG,
  itagOf,
  byItagMap,
  videoChoices,
  getYouTubeStreams,
  fetchStreamFast,
  getSaveTubeVideo,
  safeTitle,
  STREAM_ALLOWED_HOSTS,
  STREAM_HOST_HEADERS,
}
