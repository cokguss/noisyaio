import { useLang } from '../i18n/LanguageContext.jsx'
import './Features.css'

const meta = [
  { span: 'big', icon: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z' },
  { icon: 'M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z' },
  { icon: 'M4 4h16v12H5.2L4 17.2V4z' },
  { icon: 'M12 1L3 5v6c0 5 3.8 9.7 9 11 5.2-1.3 9-6 9-11V5l-9-4z', span: 'wide' },
  { icon: 'M4 4h16v16H4zM4 9h16M9 9v11' },
  { icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20' },
]

export default function Features() {
  const { t } = useLang()

  return (
    <section id="features">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{t.features.eyebrow}</span>
          <h2 className="section-title">{t.features.title1}<span className="gradient-text">{t.features.title2}</span></h2>
          <p className="section-sub">{t.features.sub}</p>
        </div>

        <div className="bento" data-reveal>
          {t.features.items.map((f, i) => (
            <article key={i} className={`bento-card glass ${meta[i].span || ''}`}>
              <div className="bento-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={meta[i].icon} />
                </svg>
              </div>
              <span className="bento-tag">{f.tag}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
