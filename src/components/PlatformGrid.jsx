import { useRef } from 'react'
import { platforms } from './icons.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'
import './PlatformGrid.css'

function TiltCard({ p, formats }) {
  const ref = useRef(null)
  const frame = useRef(0)

  const onMove = (e) => {
    const el = ref.current
    if (!el) return
    const { clientX, clientY } = e
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const r = el.getBoundingClientRect()
      const px = (clientX - r.left) / r.width - 0.5
      const py = (clientY - r.top) / r.height - 0.5
      el.style.setProperty('--rx', `${-py * 10}deg`)
      el.style.setProperty('--ry', `${px * 10}deg`)
      el.style.setProperty('--mx', `${(px + 0.5) * 100}%`)
      el.style.setProperty('--my', `${(py + 0.5) * 100}%`)
    })
  }

  const onLeave = () => {
    const el = ref.current
    if (!el) return
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  return (
    <div
      ref={ref}
      className="pf-card glass"
      style={{ '--pc': p.color }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="pf-glow" />
      <div className="pf-icon"><p.Icon width={26} height={26} /></div>
      <h3>{p.name}</h3>
      <p>{formats}</p>
      <span className="pf-arrow" aria-hidden="true">→</span>
    </div>
  )
}

export default function PlatformGrid() {
  const { t } = useLang()
  return (
    <section id="platforms">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{t.platforms.eyebrow}</span>
          <h2 className="section-title">{t.platforms.title1}<span className="gradient-text">{t.platforms.title2}</span></h2>
          <p className="section-sub">{t.platforms.sub}</p>
        </div>

        <div className="pf-grid" data-reveal>
          {platforms.map((p) => <TiltCard key={p.id} p={p} formats={t.platforms.formats[p.id]} />)}
        </div>
      </div>
    </section>
  )
}
