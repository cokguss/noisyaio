# Noisy AIO — All-in-One Downloader

Downloader all-in-one untuk video & foto sosial media: **TikTok, Instagram, YouTube, Twitter/X, dan Facebook** — dalam satu tampilan glassmorphism gelap dengan animasi.

## Fitur

- **Multi-platform**: video, foto/carousel (TikTok slideshow, IG post), audio
- **YouTube**: MP4 H.264 + AAC (kompatibel semua player) hingga 1080p — di-remux server-side dari stream terpisah, unduhan per-potongan paralel untuk melewati throttle
- **Twitter/X**: pilihan kualitas hingga 2160p
- **Riwayat unduhan** per perangkat (localStorage) dengan tombol ulangi
- **Dua bahasa** (ID/EN), responsif desktop & mobile
- Progress bar unduhan nyata (blob streaming dengan Content-Length)

## Menjalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Script `dev` menjalankan Vite **dan** server proxy Express (port 8787) sekaligus.

> **Penting:** server proxy wajib jalan untuk unduhan YouTube, Twitter, dan Facebook (CDN-nya butuh header khusus / tanpa CORS). TikTok & Instagram berjalan langsung dari browser.

## Struktur

```
├── server/index.js      # Proxy Express: remux YouTube (ffmpeg), /api/stream
├── src/
│   ├── services/        # downloader.js (API tiap platform), history.js
│   ├── components/      # Hero, Navbar, History, Footer, dll.
│   ├── i18n/            # terjemahan ID/EN
│   └── pages/           # Terms, Privacy
└── vite.config.js       # proxy /api/* -> localhost:8787
```

## Deploy

Frontend bisa di-hosting statis (Vercel/Netlify/GitHub Pages), tapi **server proxy harus di-host terpisah** (Render/Railway/Fly/VPS) agar YouTube/Twitter/Facebook tetap berfungsi:

1. Deploy `server/index.js` sebagai service Node (set `PORT`).
2. Set environment variable `VITE_API_BASE` … atau ubah proxy `/api` di platform frontend agar mengarah ke URL server tersebut.
3. Build frontend dengan `npm run build`, hosting folder `dist/`.

## Catatan

Hormati hak cipta — unduh hanya konten yang kamu miliki izinnya. API pihak ketiga yang dipakai dapat berubah sewaktu-waktu.

---

**Developer:** Instagram [fagubitch.exe](https://instagram.com/fagubitch.exe) · Telegram [noisy05](https://t.me/noisy05)
