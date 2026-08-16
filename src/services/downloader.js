const TIKTOK_ENDPOINT = 'https://bintangapi.my.id/api/downloader/tiktok'
const INSTAGRAM_ENDPOINT = 'https://api.ikyyxd.my.id/download/igv2'
const ALLINONE_ENDPOINT = 'https://api.ikyyxd.my.id/download/all-in-one'
const TWITTER_ENDPOINT = 'https://api.ikyyxd.my.id/download/twitterdl?apikey=kyzz'
const FACEBOOK_ENDPOINT = 'https://api.ikyyxd.my.id/download/facebook?apikey=kyzz'

export function detectPlatform(url) {
  const u = url.trim().toLowerCase()
  if (/tiktok\.com|douyin\./.test(u)) return 'tiktok'
  if (/youtube\.com|youtu\.be/.test(u)) return 'youtube'
  if (/instagram\.com/.test(u)) return 'instagram'
  if (/facebook\.com|fb\.watch/.test(u)) return 'facebook'
  if (/twitter\.com|x\.com/.test(u)) return 'twitter'
  return null
}

const SUPPORTED = ['tiktok', 'instagram', 'youtube', 'twitter', 'facebook']
export const isSupported = (platform) => SUPPORTED.includes(platform)

/**
 * Bungkus URL media agar diunduh lewat proxy /api/stream kita.
 * Sebagian CDN (tikwm, indown, fbcdn) menolak fetch lintas-origin dari
 * browser — lewat proxy, unduhan menjadi paksa-unduh dengan progress.
 */
const proxyUrl = (url) => `/api/stream?url=${encodeURIComponent(url)}`

/** Ubah "4.04 MB" / "512 KB" menjadi angka MB, atau null bila tak dikenali. */
function parseSizeMb(size) {
  if (typeof size === 'number') return size
  if (typeof size !== 'string') return null
  const m = size.match(/([\d.]+)\s*(kb|mb|gb)?/i)
  if (!m) return null
  const val = parseFloat(m[1])
  const unit = (m[2] || 'mb').toLowerCase()
  if (unit === 'kb') return val / 1024
  if (unit === 'gb') return val * 1024
  return val
}

/** Dispatcher: memanggil fetcher yang sesuai dengan platform. */
export async function fetchMedia(platform, url) {
  if (platform === 'tiktok') return fetchTikTok(url)
  if (platform === 'instagram') return fetchInstagram(url)
  if (platform === 'youtube') return fetchYouTube(url)
  if (platform === 'twitter') return fetchTwitter(url)
  if (platform === 'facebook') return fetchFacebook(url)
  throw new Error('UNSUPPORTED')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(endpoint) {
  const res = await fetch(endpoint)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * Endpoint serba-guna (all-in-one) menangani foto TikTok, carousel,
 * dan Instagram foto/video — tetapi kadang membalas error acak,
 * jadi dicoba beberapa kali sampai `result.medias` terisi.
 */
async function fetchAllInOne(url, tries = 4) {
  const endpoint = `${ALLINONE_ENDPOINT}?url=${encodeURIComponent(url.trim())}`
  for (let i = 0; i < tries; i++) {
    try {
      const json = await fetchJson(endpoint)
      const r = json?.result
      if (json?.status && r && typeof r === 'object' && Array.isArray(r.medias) && r.medias.length) {
        return r
      }
    } catch {
      /* coba lagi */
    }
    if (i < tries - 1) await sleep(700)
  }
  return null
}

/** Ubah result all-in-one menjadi bentuk ternormalisasi. */
function normalizeAllInOne(r, platform) {
  const medias = Array.isArray(r.medias) ? r.medias : []
  const videos = medias.filter((m) => m.type === 'video')
  const images = medias.filter((m) => m.type === 'image')
  const audios = medias.filter((m) => m.type === 'audio')

  const qualityLabel = {
    hd_no_watermark: 'MP4 · HD no watermark',
    no_watermark: 'MP4 · No watermark',
    watermark: 'MP4 · Watermark',
  }

  const downloads = []
  videos.forEach((m) => {
    downloads.push({
      label: qualityLabel[m.quality] || 'MP4 · Video',
      url: proxyUrl(m.url), raw: m.url,
      hd: m.quality === 'hd_no_watermark',
      kind: 'video',
      ext: 'mp4',
    })
  })
  images.forEach((m, i) => {
    downloads.push({
      label: images.length > 1 ? `Foto ${i + 1}` : 'Foto',
      url: proxyUrl(m.url), raw: m.url,
      kind: 'image',
      ext: (m.extension === 'png' || m.extension === 'webp') ? m.extension : 'jpg',
    })
  })
  audios.forEach((m) => {
    downloads.push({ label: 'MP3 · Audio', url: proxyUrl(m.url), raw: m.url, kind: 'audio', ext: 'mp3' })
  })

  return {
    platform,
    videoId: r.id ?? r.shortcode ?? null,
    thumbnail: r.thumbnail ?? null,
    duration: r.duration || null,
    author: {
      name: r.author ?? null,
      username: r.unique_id ?? null,
      avatar: null,
    },
    downloads: downloads.filter((d) => d.url),
  }
}

/**
 * Ambil metadata & tautan unduhan TikTok.
 * Jalur utama: /api/tiktok/resolve (library tiktok-api-dl) — menangani
 * video (SD H.264 / HD HEVC / watermark), slideshow FOTO per slide, dan
 * MP3. Cadangan: bintangapi → all-in-one (tikwm; hanya IP rumahan).
 */
export async function fetchTikTok(url) {
  const isPhoto = /\/photo\//i.test(url)

  try {
    const r = await fetchJson(`/api/tiktok/resolve?url=${encodeURIComponent(url.trim())}`)
    if (r?.images?.length || r?.videos?.length) {
      const downloads = []

      if (r.type === 'image') {
        r.images.forEach((u, i) => {
          downloads.push({
            label: r.images.length > 1 ? `Foto ${i + 1}` : 'Foto',
            url: proxyUrl(u), raw: u,
            kind: 'image',
            ext: 'jpg',
          })
        })
      } else {
        r.videos.forEach((v) => {
          const label = v.hd ? 'MP4 · HD (HEVC)' : v.wm ? 'MP4 · Watermark' : 'MP4 · No watermark'
          downloads.push({ label, url: proxyUrl(v.url), raw: v.url, hd: !!v.hd, kind: 'video', ext: 'mp4' })
        })
      }

      if (r.music) {
        downloads.push({ label: 'MP3 · Audio', url: proxyUrl(r.music), raw: r.music, kind: 'audio', ext: 'mp3' })
      }

      return {
        platform: 'tiktok',
        videoId: null,
        thumbnail: r.images?.[0] || r.thumbnail || null,
        duration: null,
        author: { name: r.author || r.title || null, username: null, avatar: r.avatar || null },
        downloads,
      }
    }
  } catch {
    /* jatuh ke jalur lama di bawah */
  }

  if (!isPhoto) {
    try {
      const endpoint = `${TIKTOK_ENDPOINT}?url=${encodeURIComponent(url.trim())}`
      const json = await fetchJson(endpoint)
      if (json?.success && json?.data) {
        const d = json.data
        const noWm = d.video_no_watermark || {}
        const wm = d.video_watermark || {}
        return {
          platform: 'tiktok',
          videoId: d.video_id ?? null,
          thumbnail: d.thumbnail ?? null,
          duration: d.duration ?? null,
          author: {
            name: d.user?.name ?? null,
            username: d.user?.username ?? null,
            avatar: d.user?.avatar ?? null,
          },
          downloads: [
            noWm.url && { label: 'MP4 · No watermark', url: proxyUrl(noWm.url), raw: noWm.url, sizeMb: noWm.size_mb, hd: !!noWm.hd, kind: 'video', ext: 'mp4' },
            wm.url && { label: 'MP4 · Watermark', url: proxyUrl(wm.url), raw: wm.url, sizeMb: wm.size_mb, hd: !!wm.hd, kind: 'video', ext: 'mp4' },
            d.audio_url && { label: 'MP3 · Audio', url: proxyUrl(d.audio_url), raw: d.audio_url, kind: 'audio', ext: 'mp3' },
          ].filter(Boolean),
        }
      }
    } catch {
      /* jatuh ke all-in-one di bawah */
    }
  }

  const r = await fetchAllInOne(url)
  if (!r) throw new Error('NO_DATA')
  return normalizeAllInOne(r, 'tiktok')
}

/**
 * Ambil tautan unduhan Instagram.
 * Prioritas all-in-one (memberi author, thumbnail, & multi-media untuk
 * foto maupun carousel); bila gagal, fallback ke igv2 yang sudah teruji.
 */
export async function fetchInstagram(url) {
  const r = await fetchAllInOne(url, 3)
  if (r) return normalizeAllInOne(r, 'instagram')

  const endpoint = `${INSTAGRAM_ENDPOINT}?url=${encodeURIComponent(url.trim())}`
  const json = await fetchJson(endpoint)
  const items = Array.isArray(json?.result) ? json.result : []
  if (!json?.status || items.length === 0) {
    throw new Error('NO_DATA')
  }

  const multiple = items.length > 1
  const downloads = items.map((item, i) => {
    const isImage = /\.(jpe?g|png|webp)(\?|$)/i.test(item.url || '')
    const kind = isImage ? 'image' : 'video'
    const ext = isImage ? 'jpg' : 'mp4'
    const base = kind === 'image' ? 'Foto' : 'MP4 · Video'
    return {
      label: multiple ? `${base} ${i + 1}` : base,
      url: proxyUrl(item.url), raw: item.url,
      sizeMb: parseSizeMb(item.size),
      kind,
      ext,
    }
  }).filter((d) => d.url)

  return {
    platform: 'instagram',
    videoId: null,
    thumbnail: null,
    duration: null,
    author: { name: null, username: null, avatar: null },
    downloads,
  }
}

/**
 * Ambil metadata YouTube dari proxy lokal kita sendiri.
 * Unduhan diarahkan ke endpoint proxy yang me-remux menjadi MP4 H.264+AAC
 * (kompatibel dengan semua pemutar, termasuk Windows Media Player).
 * Ditandai `direct: true` karena proxy mengirim Content-Disposition
 * dan streaming ffmpeg tidak punya Content-Length untuk progress.
 */
export async function fetchYouTube(url) {
  const q = encodeURIComponent(url.trim())
  const info = await fetchJson(`/api/youtube/info?url=${q}`).catch(() => null)
  if (!info || (!info.videoChoices?.length && !info.hasProgressive)) {
    throw new Error('NO_DATA')
  }

  const downloads = []

  // 360p H.264 langsung dari googlevideo perangkat pengguna: IP rumahan
  // selalu diizinkan Google, file progresif (video+audio) kompatibel semua
  // perangkat termasuk iPhone/Android — jadi jangkar kalau konversi server
  // gagal/AV1.
  if (info.progressiveUrl) {
    downloads.push({
      label: 'MP4 · 360p (semua perangkat)',
      url: info.progressiveUrl,
      kind: 'video',
      ext: 'mp4',
      direct: true,
    })
  }

  const choices = info.videoChoices?.length
    ? info.videoChoices
    : [{ itag: '18', height: 360 }]

  choices.forEach((c) => {
    downloads.push({
      label: `MP4 · ${c.height ? c.height + 'p' : 'Video'} (with audio)`,
      url: `/api/youtube/download?url=${q}&height=${c.height || 720}`,
      kind: 'video',
      ext: 'mp4',
      // Unduh via download-manager bawaan browser: mulai seketika, tanpa
      // buffer di RAM, dan progres tampil di shelf unduhan browser. Cocok
      // untuk stream ffmpeg yang tak punya Content-Length.
      direct: true,
    })
  })

  return {
    platform: 'youtube',
    videoId: null,
    thumbnail: info.thumbnail ?? null,
    duration: info.duration ?? null,
    author: { name: info.author || info.title || null, username: null, avatar: null },
    downloads,
  }
}

/**
 * Ambil tautan unduhan Twitter/X via endpoint twitterdl (apikey kyzz).
 * Respons: { status, result: { title, duration, thumbnail, mp4: [{quality, url}] } }.
 * CDN snapcdn TIDAK mengirim CORS, jadi file disalurkan lewat proxy lokal
 * (/api/stream) agar bisa diunduh blob dengan progress bar.
 */
export async function fetchTwitter(url) {
  const endpoint = `${TWITTER_ENDPOINT}&url=${encodeURIComponent(url.trim())}`
  const json = await fetchJson(endpoint)

  const r = json?.result
  const mp4s = Array.isArray(r?.mp4) ? r.mp4 : []
  if (!json?.status || mp4s.length === 0) {
    throw new Error('NO_DATA')
  }

  const rank = { '2160p': 0, '1440p': 1, '1080p': 2, '720p': 3, '480p': 4, '360p': 5, '270p': 6, '180p': 7 }
  const downloads = mp4s
    .filter((m) => m.url)
    .sort((a, b) => (rank[a.quality] ?? 99) - (rank[b.quality] ?? 99))
    .map((m) => ({
      label: `MP4 · ${m.quality || 'Video'}`,
      url: `/api/stream?url=${encodeURIComponent(m.url)}`,
      kind: 'video',
      ext: 'mp4',
    }))

  return {
    platform: 'twitter',
    videoId: null,
    thumbnail: r.thumbnail ?? null,
    duration: r.duration ?? null,
    author: { name: r.title || null, username: null, avatar: null },
    downloads,
  }
}

/**
 * Ambil tautan unduhan Facebook via endpoint facebook (apikey kyzz).
 * Respons lengkap dengan metadata (judul, author, durasi, resolusi) dan
 * link 720p HD / 360p SD / Mp3 di CDN ssscdn.io. CDN itu mewajibkan
 * header Origin/Referer fget.io yang tidak bisa dikirim browser, jadi
 * unduhan disalurkan lewat proxy lokal (/api/stream).
 */
export async function fetchFacebook(url) {
  const endpoint = `${FACEBOOK_ENDPOINT}&url=${encodeURIComponent(url.trim())}`
  const json = await fetchJson(endpoint)

  const r = json?.result
  const links = Array.isArray(r?.downloads?.links) ? r.downloads.links : []
  if (!json?.status || links.length === 0) {
    throw new Error('NO_DATA')
  }

  const downloads = links
    .filter((l) => l.url)
    .map((l) => {
      const isAudio = /mp3/i.test(l.quality || '') || /audio/i.test(l.type || '')
      const label = isAudio
        ? 'MP3 · Audio'
        : `MP4 · ${l.quality}${l.type ? ' · ' + l.type : ''}`
      return {
        label,
        url: `/api/stream?url=${encodeURIComponent(l.url)}`,
        kind: isAudio ? 'audio' : 'video',
        ext: isAudio ? 'mp3' : 'mp4',
      }
    })

  return {
    platform: 'facebook',
    videoId: null,
    thumbnail: r.downloads?.thumbnail ?? null,
    duration: r.metadata?.duration ?? null,
    author: {
      name: r.metadata?.author || r.metadata?.title || null,
      username: null,
      avatar: null,
    },
    downloads,
  }
}

/**
 * Unduh file secara paksa (save-as), bukan membuka tab baru.
 * CDN TikTok mengirim CORS `*`, jadi kita bisa ambil sebagai blob.
 * `onProgress(ratio)` dipanggil dengan nilai 0..1 saat progres diketahui,
 * atau -1 bila total ukuran tidak tersedia (indeterminate).
 * Jika fetch blob gagal (mis. CDN memblokir), fallback ke navigasi langsung.
 */
export async function downloadFile(url, filename, onProgress, direct = false) {
  // Sebagian CDN (mis. googlevideo untuk YouTube) tidak mengirim CORS,
  // sehingga fetch blob pasti gagal. Untuk itu langsung buka di browser.
  // PECUALIAN iOS: Safari iPhone/iPad sering gagal menyimpan hasil
  // navigasi unduhan (file tidak tersimpan / format kacau) — di sana
  // kita paksa lewat blob agar bisa tersimpan dengan benar.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (direct && !isIOS) {
    onProgress?.(-1)
    // URL proxy sendiri (/api/...) mengirim Content-Disposition: attachment,
    // jadi unduh di tab yang sama tanpa membuka tab baru.
    const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin)
    triggerAnchor(url, filename, !sameOrigin)
    onProgress?.(1)
    return false
  }
  try {
    const res = await fetch(url)
    if (!res.ok) {
      // 4xx/5xx dari proxy = token kedaluwarsa / server bermasalah.
      // JANGAN fallback-anchor: responsnya JSON error, akan tersimpan
      // sebagai file sampah (.txt) alih-alih video.
      throw Object.assign(new Error(`HTTP ${res.status}`), { code: 'BAD_FILE' })
    }

    // Tolak respons HTML/JSON (mis. halaman fallback SPA saat server mati)
    // supaya tidak tersimpan sebagai file "video" yang isinya teks.
    const type = (res.headers.get('content-type') || '').toLowerCase()
    const looksLikeFile = type === '' || /^(video|audio|image|application\/octet-stream)/.test(type)
    if (!looksLikeFile) {
      throw Object.assign(new Error(`Bad content-type: ${type}`), { code: 'BAD_FILE' })
    }

    const total = Number(res.headers.get('content-length')) || 0
    let blob

    if (res.body && total > 0) {
      const reader = res.body.getReader()
      const chunks = []
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        onProgress?.(received / total)
      }
      blob = new Blob(chunks)
    } else {
      // Ukuran tidak diketahui: tidak bisa hitung persentase
      onProgress?.(-1)
      blob = await res.blob()
    }

    onProgress?.(1)
    const objectUrl = URL.createObjectURL(blob)
    triggerAnchor(objectUrl, filename, false)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
    return true
  } catch (err) {
    // File rusak/kedaluwarsa: lempar agar UI menampilkan pesan error yang jelas.
    if (err?.code === 'BAD_FILE') throw err
    // Fallback jaringan/CORS: biarkan browser menangani (buka tab baru).
    triggerAnchor(url, filename, true)
    return false
  }
}

function triggerAnchor(href, filename, external) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  if (external) {
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
  }
  document.body.appendChild(a)
  a.click()
  a.remove()
}
