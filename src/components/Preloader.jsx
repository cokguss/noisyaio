import { useEffect, useRef, useState } from 'react'
import './Preloader.css'

const FADE_MS = 650
const GLITCH_MS = 700

/**
 * Layar pembuka bergaya glitch (mirip Noisy Uploader): label "MEMUAT",
 * teks brand ber-efek glitch, progress bar gradient, dan penghitung persen.
 * Setelah 100% panel memudar, lalu situs "pecah sinyal" sebentar
 * (kelas .is-booting-glitch di <html> + overlay scanline) sebelum tenang.
 */
export default function Preloader() {
  // Hanya tampil sekali per sesi tab (tidak muncul lagi saat pindah ke
  // halaman Terms/Privacy dalam sesi yang sama).
  const seen = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('noisy-preloaded')
  const [progress, setProgress] = useState(0)
  const [gone, setGone] = useState(!!seen)
  const [fade, setFade] = useState(false)
  const [glitch, setGlitch] = useState(false)
  const raf = useRef(0)
  const timers = useRef([])

  useEffect(() => {
    if (seen) return
    const start = performance.now()
    const DURATION = 1900
    timers.current = []

    const tick = (now) => {
      const t = Math.min(1, (now - start) / DURATION)
      // easing: cepat di awal, sedikit tertahan menjelang akhir
      const eased = 1 - Math.pow(1 - t, 2)
      setProgress(Math.round(eased * 100))
      if (t < 1) {
        raf.current = requestAnimationFrame(tick)
        return
      }
      setFade(true)
      timers.current.push(setTimeout(() => {
        setGone(true)
        setGlitch(true)
        document.documentElement.classList.add('is-booting-glitch')
        try { sessionStorage.setItem('noisy-preloaded', '1') } catch { /* ignore */ }
      }, FADE_MS))
      timers.current.push(setTimeout(() => {
        setGlitch(false)
        document.documentElement.classList.remove('is-booting-glitch')
        document.body.style.overflow = ''
      }, FADE_MS + GLITCH_MS))
    }
    raf.current = requestAnimationFrame(tick)

    // Kunci scroll selama preloader + glitch aktif, supaya guncangan
    // terbaca sebagai satu momen dan halaman tidak ikut bergeser.
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf.current)
      timers.current.forEach(clearTimeout)
      document.body.style.overflow = ''
      document.documentElement.classList.remove('is-booting-glitch')
    }
  }, [seen])

  if (gone) return glitch ? <div className="boot-glitch" aria-hidden="true" /> : null

  return (
    <div className={`preloader ${fade ? 'is-hidden' : ''}`} aria-hidden="true">
      <div className="pre-inner">
        <span className="pre-label">MEMUAT</span>
        <h1 className="pre-title glitch" data-text="Noisy AIO">
          Noisy <span className="pre-accent">AIO</span>
        </h1>
        <div className="pre-bar">
          <div className="pre-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="pre-percent">{progress}%</span>
      </div>
    </div>
  )
}
