/**
 * Logika bersama untuk proxy unduhan.
 * Dipakai oleh dua "kemasan" berbeda:
 *  - server/index.js   → Express lokal (npm run dev)
 *  - api/*.js          → Vercel serverless functions (deploy)
 */

import TiktokPkg from '@tobyg74/tiktok-api-dl'

const TiktokDL = TiktokPkg.default || TiktokPkg
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

async function getYouTubeStreams(url, tries = 4) {
  const cached = streamCache.get(url)
  if (cached && cached.expires > Date.now()) return cached.data

  for (let i = 0; i < tries; i++) {
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

/**
 * Resolver YouTube via ssyou.online (ssyoutube) — merge video H.264 +
 * audio AAC di server mereka, hasil MP4 H.264 muxed di CDN flashydl:
 * kompatibel semua perangkat (iPhone/Android/WMP). Merge ~5-15 detik.
 * Return { downloadUrl, title } atau null.
 */
async function resolveYouTubeSsyou(url, wantHeight = 720) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://ssyou.online',
      'Referer': 'https://ssyou.online/en12/',
    }
    const r = await fetch('https://ssyou.online/yt-video-detail/', {
      method: 'POST',
      headers,
      body: new URLSearchParams({ videoURL: url }).toString(),
    })
    const html = await r.text()

    const fm = html.match(/let cachedFormatUrls = ({[\s\S]*?});/)
    const videoId = (html.match(/name="video_id" value="([^"]+)"/) || [])[1]
    const nonce = (html.match(/'X-WP-Nonce':\s*'([^']+)'/) || [])[1]
    const audioUrl = (html.match(/(?:let|const|var)\s+audioUrl\s*=\s*'([^']+)'/) || [])[1]
    if (!fm || !videoId || !nonce || !audioUrl) return null

    const formats = {}
    const urlRegex = /'([^']+)'\s*:\s*'([^']+)'/g
    let m
    while ((m = urlRegex.exec(fm[1])) !== null) formats[m[1]] = m[2]

    // Pilih kualitas terdekat <= yang diminta (atau terkecil).
    const heights = Object.keys(formats)
      .map((k) => parseInt(k, 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => b - a)
    if (!heights.length) return null
    const pick = heights.find((h) => h <= wantHeight) || heights[heights.length - 1]
    const resKey = pick + 'p'

    const serverReq = await fetch('https://fpa-balancer.flashydl.space/get-server')
    const wsHost = (await serverReq.text()).trim()

    const renderId = `${videoId}_${resKey}`
    const mergeData = {
      id: renderId,
      ttl: 3600000,
      inputs: [
        { url: formats[resKey], ext: 'mp4', chunkDownload: { type: 'header', size: 52428800, concurrency: 3 } },
        { url: audioUrl, ext: 'm4a' },
      ],
      output: { ext: 'mp4', downloadName: 'noisy.mp4', chunkUpload: { size: 209715200, concurrency: 3 } },
      operation: { type: 'replace_audio_in_video' },
    }
    const ajaxHeaders = { ...headers, Accept: 'application/json, text/javascript, */*; q=0.01', 'x-wp-nonce': nonce }
    await fetch('https://ssyou.online/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: ajaxHeaders,
      body: new URLSearchParams({ action: 'process_video_merge', nonce, request_data: JSON.stringify(mergeData) }).toString(),
    })

    const outUrl = await new Promise((resolve) => {
      const ws = new WebSocket('wss://' + wsHost + '/pub/render/status_ws/' + renderId)
      const to = setTimeout(() => { try { ws.close() } catch {} ; resolve(null) }, 40000)
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)
          if (d.status === 'done' && d.output) { clearTimeout(to); ws.close(); resolve(d.output.url) }
          else if (d.error) { clearTimeout(to); ws.close(); resolve(null) }
        } catch {}
      }
      ws.onerror = () => {}
    })
    if (!outUrl) return null

    const pr = await fetch('https://ssyou.online/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: ajaxHeaders,
      body: new URLSearchParams({ action: 'wp_get_proxied_url', targetUrl: outUrl }).toString(),
    })
    const pj = await pr.json().catch(() => null)
    const finalUrl = pj?.data?.proxiedUrl || outUrl

    const title = (html.match(/videoTitle[^>]*>\s*(.*?)\s*<\/div>/) || [])[1] || null
    return { downloadUrl: finalUrl, title }
  } catch {
    return null
  }
}

/**
 * Resolver YouTube via hub.convert1s.com (ssvid.cc) — hasil MP4 H.264
 * muxed hasil konversi server-side: kompatibel semua pemutar termasuk
 * iPhone/iPad, dan file dilayani tanpa blokir IP datacenter.
 * Return { downloadUrl, title } atau null.
 */
async function resolveYouTubeConvert1s(url, { audio = false, quality = '720p' } = {}) {
  try {
    const headers = {
      'accept': 'application/json',
      'content-type': 'application/json',
      'origin': 'https://ssvid.cc',
      'referer': 'https://ssvid.cc/',
      'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    }
    const payload = audio
      ? { url, audio: { bitrate: '128k' }, output: { type: 'audio', format: 'mp3' } }
      : { url, video: { quality, codec: 'h264' }, output: { type: 'video', format: 'mp4' } }

    const initRes = await fetch('https://hub.convert1s.com/api/download', {
      method: 'POST', headers, body: JSON.stringify(payload),
    })
    const init = await initRes.json()
    if (!init?.statusUrl) return null

    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      const st = await (await fetch(init.statusUrl, { headers })).json()
      if (st.status === 'completed' && st.downloadUrl) {
        return { downloadUrl: st.downloadUrl, title: init.title || st.title || null }
      }
      if (st.status === 'error') return null
    }
    return null
  } catch {
    return null
  }
}

/** Pecahkan link pendek vt.tiktok.com menjadi URL kanonik (path /photo/ terlihat). */
async function canonicalTikTokUrl(url) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36' },
    })
    return r.url || url
  } catch {
    return url
  }
}

/**
 * Resolver YouTube MP3 via ytmp4.is (ht.flvto.online) — instan tanpa
 * polling, file di-host CDN 123tokyo.xyz (bukan googlevideo, bebas
 * blokir IP datacenter). Hanya untuk audio; MP4-nya googlevideo.
 * Return { downloadUrl, title } atau null.
 */
async function resolveYouTubeYtmp4is(url) {
  try {
    const m = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|embed|watch|shorts)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    const id = m ? m[1] : null
    if (!id) return null

    const res = await fetch('https://ht.flvto.online/converter', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'Content-Type': 'application/json',
        'Origin': 'https://ht.flvto.online',
        'Referer': `https://ht.flvto.online/button?url=https://www.youtube.com/watch?v=${id}&fileType=mp3`,
      },
      body: JSON.stringify({ id, fileType: 'mp3' }),
    })
    const data = await res.json()
    if (!data?.link) return null
    return { downloadUrl: data.link, title: data.title || null }
  } catch {
    return null
  }
}

/**
 * Resolver TikTok utama via library @tobyg74/tiktok-api-dl (v3).
 * Menangani video (SD H.264 / HD HEVC / watermark) maupun slideshow foto,
 * lengkap dengan judul, author, thumbnail, dan musik.
 * Return bentuk ternormalisasi atau null bila gagal.
 */
async function resolveTikTokLibrary(url) {
  try {
    const r = await TiktokDL.Downloader(url, { version: 'v3' })
    if (r?.status !== 'success' || !r?.result) return null
    const d = r.result

    const out = {
      type: d.type === 'image' ? 'image' : 'video',
      title: d.desc || null,
      author: d.author?.nickname || null,
      avatar: d.author?.avatar || null,
      thumbnail: null,
      videos: [],
      images: Array.isArray(d.images) ? d.images.filter(Boolean) : [],
      music: null,
    }

    if (out.type === 'video') {
      // SD (H.264) dulu — paling kompatibel; lalu HD (HEVC); lalu watermark.
      if (d.videoSD) out.videos.push({ url: d.videoSD, hd: false, wm: false })
      if (d.videoHD) out.videos.push({ url: d.videoHD, hd: true, wm: false })
      if (d.videoWatermark) out.videos.push({ url: d.videoWatermark, hd: false, wm: true })
    }

    // Musik: coba field v3/v1 (objek/array), lalu v2 sebagai cadangan.
    const pickMusic = (m) => {
      if (!m) return null
      if (typeof m === 'string') return m
      if (Array.isArray(m?.playUrl) && m.playUrl[0]) return m.playUrl[0]
      if (typeof m?.playUrl === 'string') return m.playUrl
      if (typeof m?.play === 'string') return m.play
      return null
    }
    out.music = pickMusic(d.music)

    return out
  } catch {
    return null
  }
}

// Musik via v2 bila v3 tidak menyertakannya.
async function resolveTikTokMusicV2(url) {
  try {
    const r = await TiktokDL.Downloader(url, { version: 'v2' })
    const m = r?.result?.music
    if (Array.isArray(m?.playUrl) && m.playUrl[0]) return m.playUrl[0]
    return null
  } catch {
    return null
  }
}

/**
 * Resolver TikTok via tiktokio.com (server-side, kompatibel undici/fetch).
 * Hasil unduhan di-host dl.tiktokio.com — proxy CDN milik mereka, tidak
 * memblokir IP datacenter (Vercel), berbeda dengan tikwm.
 * Return: { links: [{url, kind, hd, wm}], thumbnail, title } atau null.
 */
async function resolveTikTok(url) {
  try {
    const home = await fetch('https://tiktokio.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    })
    const cookie = home.headers.get('set-cookie') || ''

    const res = await fetch('https://tiktokio.com/api/v1/tk/html', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'Origin': 'https://tiktokio.com',
        'Referer': 'https://tiktokio.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ vid: url, prefix: 'tiktokio.com' }),
    })
    if (!res.ok) return null
    const html = await res.text()

    const hrefs = [...html.matchAll(/href="(https:\/\/dl\.tiktokio\.com[^"]+)"/g)].map((m) => m[1])
    if (hrefs.length < 2) return null

    // Urutan tetap dari template tiktokio: [0] SD no-wm (H.264),
    // [1] HD (HEVC), [2] watermark (H.264), [3] musik MP3 (bila ada).
    // SD diletakkan duluan karena H.264 kompatibel semua pemutar.
    const links = [
      hrefs[0] && { url: hrefs[0], kind: 'video', hd: false, wm: false },
      hrefs[1] && { url: hrefs[1], kind: 'video', hd: true, wm: false },
      hrefs[2] && { url: hrefs[2], kind: 'video', hd: false, wm: true },
      hrefs[3] && { url: hrefs[3], kind: 'audio', hd: false, wm: false },
    ].filter(Boolean)

    const title = (html.match(/<h3[^>]*>([^<]{5,120})</) || [])[1]?.trim() || null
    const img = (html.match(/<img[^>]+src="(https?:\/\/p[^"]+)"/) || [])[1] || null

    return { links, thumbnail: img, title }
  } catch {
    return null
  }
}

/** Host yang boleh di-stream via /api/stream + header wajib per host. */
const STREAM_ALLOWED_EXACT = new Set([
  'dl.snapcdn.app',    // Twitter
  'ssscdn.io',         // Facebook
  'tikwm.com',         // TikTok (jalur lama, hanya IP rumahan)
  'indown.io',         // Instagram (proxy foto igv2)
  'dl.tiktokio.com',   // TikTok (cadangan)
  'fastdl.muscdn.app', // TikTok via library tiktok-api-dl (utama)
  'tikcdn.io',         // TikTok via library v2 (musik)
])
const STREAM_ALLOWED_SUFFIX = [
  '.tikwm.com',          // TikTok video
  '.tiktokio.com',       // TikTok (cadangan)
  '.muscdn.app',         // TikTok library (fastdl.muscdn.app)
  '.tikcdn.io',          // TikTok library v2
  '.tiktokcdn.com',      // TikTok CDN (foto slideshow, musik)
  '.tiktokcdn-us.com',   // TikTok CDN (varian AS)
  '.fbcdn.net',          // Instagram video/foto CDN
  '.cdninstagram.com',   // Instagram CDN (varian scontent)
  '.indown.io',          // Instagram proxy foto (d3.indown.io dst.)
]

function isStreamAllowedHost(host) {
  const h = (host || '').toLowerCase()
  if (STREAM_ALLOWED_EXACT.has(h)) return true
  return STREAM_ALLOWED_SUFFIX.some((s) => h.endsWith(s))
}

const STREAM_HOST_HEADERS = {
  'ssscdn.io': {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'Origin': 'https://fget.io',
    'Referer': 'https://fget.io/',
  },
}

export {
  resolveYouTubeSsyou,
  resolveYouTubeYtmp4is,
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
  resolveYouTubeConvert1s,
  resolveTikTok,
  canonicalTikTokUrl,
  resolveTikTokLibrary,
  resolveTikTokMusicV2,
  safeTitle,
  isStreamAllowedHost,
  STREAM_HOST_HEADERS,
}
