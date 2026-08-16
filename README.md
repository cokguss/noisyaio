<div align="center">

# Noisy AIO

**All-in-One Downloader untuk video & foto sosial media**

TikTok · Instagram · YouTube · Twitter/X · Facebook

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)](https://vitejs.dev)
[![Node](https://img.shields.io/badge/Node-Express-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/Penggunaan-pribadi-a855f7)](#)

</div>

---

## ✨ Fitur

| Platform | Kemampuan |
|----------|-----------|
| **TikTok** | Video tanpa watermark (HD), slideshow foto, MP3 |
| **Instagram** | Reel, video, foto & carousel |
| **YouTube** | MP4 H.264 + AAC (kompatibel semua player) hingga 1080p |
| **Twitter/X** | Video hingga 2160p, multi kualitas |
| **Facebook** | Video HD/SD + MP3, lengkap dengan metadata |

**Fitur umum**

- 🎨 Tampilan dark glassmorphism dengan animasi (GSAP + Framer Motion)
- 📊 Progress bar unduhan nyata berbasis streaming
- 🕘 Riwayat unduhan per perangkat dengan tombol *Ulangi*
- 🌐 Dua bahasa: Indonesia & English
- 📱 Responsif penuh — desktop maupun mobile
- 📄 Halaman Ketentuan & Privasi terpisah

## 🚀 Menjalankan Secara Lokal

**Prasyarat:** Node.js 18+

```bash
# 1. Install dependensi
npm install

# 2. Jalankan (web + server proxy sekaligus)
npm run dev
```

Buka **http://localhost:5173** — selesai.

> ⚠️ **Penting:** selalu gunakan `npm run dev` (bukan `vite` saja).
> Server proxy di port 8787 wajib berjalan agar unduhan **YouTube, Twitter, dan Facebook** berfungsi — CDN mereka menuntut header khusus yang hanya bisa dikirim dari sisi server. TikTok & Instagram berjalan langsung dari browser.

### Script yang tersedia

| Perintah | Fungsi |
|----------|--------|
| `npm run dev` | Vite + server proxy sekaligus (untuk pengembangan) |
| `npm run dev:web` | Hanya Vite (tanpa proxy) |
| `npm run server` | Hanya server proxy |
| `npm run build` | Build produksi ke folder `dist/` |

## 🧠 Cara Kerja

```
Browser ──► Vite (frontend)
   │
   ├── TikTok / Instagram ──► API publik langsung (CORS terbuka)
   │
   └── /api/* ──► Express proxy (port 8787)
                    ├── YouTube  : remux video H.264 + audio AAC via ffmpeg
                    │             (unduhan per-potongan paralel, anti-throttle)
                    └── Twitter/Facebook : streaming CDN dengan header khusus
```

**Kenapa perlu proxy untuk YouTube?** Format H.264 YouTube terpisah menjadi stream video-only dan audio-only — proxy menggabungkannya tanpa re-encode (cepat, kualitas utuh) sekaligus melewati pembatasan kecepatan unduhan sekuensial dengan mengambil per-potongan secara paralel.

## 📁 Struktur Proyek

```
noisy-aio/
├── server/
│   └── index.js          # Proxy Express + remux ffmpeg + /api/stream
├── src/
│   ├── components/       # Hero, Navbar, History, Footer, dll.
│   ├── i18n/             # Terjemahan ID/EN + konten legal
│   ├── pages/            # Ketentuan & Privasi
│   ├── services/         # downloader.js, history.js
│   └── styles/           # Variabel & global CSS
├── vite.config.js        # Proxy /api/* → localhost:8787
└── package.json
```

## ☁️ Deploy

Aplikasi ini terdiri dari dua bagian dengan kebutuhan hosting berbeda:

| Bagian | Hosting | Platform yang cocok |
|--------|---------|---------------------|
| Frontend (statis) | Static hosting | Vercel, Netlify, GitHub Pages |
| Server proxy | Node.js runtime | Render (free tier), Railway, Fly.io, VPS |

**Langkah deploy penuh (semua fitur aktif):**

1. Deploy `server/index.js` sebagai layanan Node (set environment variable `PORT` bila disediakan platform).
2. Ubah proxy `/api` di platform frontend agar mengarah ke URL server proxy.
3. Jalankan `npm run build`, lalu hosting folder `dist/`.

> Bila hanya di-hosting statis tanpa proxy, fitur **TikTok & Instagram tetap berfungsi**; YouTube, Twitter, dan Facebook membutuhkan proxy.

## ⚠️ Catatan

- Hormati hak cipta — unduh hanya konten yang kamu miliki izinnya.
- Aplikasi ini mengandalkan API pihak ketiga yang dapat berubah sewaktu-waktu di luar kendali kita.
- Tautan unduhan dari sebagian CDN berumur pendek; gunakan tombol *Ulangi* di Riwayat bila kedaluwarsa.

---

<div align="center">
Dibuat dengan 💜 — Noisy AIO
</div>
