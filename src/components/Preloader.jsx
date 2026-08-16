import { useEffect, useRef, useState } from 'react'
import './Preloader.css'

/**
 * Layar pembuka bergaya glitch (mirip Noisy Uploader): label "MEMUAT",
 * teks brand ber-efek glitch, progress bar gradient, dan penghitung persen.
 * Menghilang mulus setelah mencapai 100%.
 */
export default function Preloader() {
  // Hanya tampil sekali per sesi tab (tidak muncul lagi saat pindah ke
  // halaman Terms/Privacy dalam sesi yang sama).
  const seen = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('noisy-preloaded')
  const [progress, setProgress] = useState(0)
  const [gone, setGone] = useState(!!seen)
  const [fade, setFade] = useState(false)
  const raf = useRef(0)

  useEffect(() => {
    if (seen) return
    const start = performance.now()
    const DURATION = 1900

    const tick = (now) => {
      const t = Math.min(1, (now - start) / DURATION)
      // easing: cepat di awal, sedikit tertahan menjelang akhir
      const eased = 1 - Math.pow(1 - t, 2)
      setProgress(Math.round(eased * 100))
      if (t < 1) {
        raf.current = requestAnimationFrame(tick)
      } else {
        setFade(true)
        setTimeout(() => {
          setGone(true)
          try { sessionStorage.setItem('noisy-preloaded', '1') } catch { /* ignore */ }
        }, 650)
      }
    }
    raf.current = requestAnimationFrame(tick)

    // Kunci scroll selama preloader aktif
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf.current)
      document.body.style.overflow = ''
    }
  }, [seen])

  useEffect(() => {
    if (gone) document.body.style.overflow = ''
  }, [gone])

  if (gone) return null

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
