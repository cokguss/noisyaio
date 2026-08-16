import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Aurora from '../components/Aurora.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'
import { legalContent } from '../i18n/legalContent.js'
import './LegalPage.css'

export default function LegalPage({ doc }) {
  const { t, lang, toggle } = useLang()
  const data = legalContent[doc][lang]

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [doc])

  return (
    <>
      <Aurora />
      <div className="legal-wrap">
        <div className="container legal-inner">
          <div className="legal-top">
            <Link to="/" className="legal-back">{t.legal.back}</Link>
            <button
              className="lang-toggle"
              onClick={toggle}
              aria-label="Switch language"
            >
              <span className={lang === 'id' ? 'active' : ''}>ID</span>
              <span className="lang-sep">/</span>
              <span className={lang === 'en' ? 'active' : ''}>EN</span>
            </button>
          </div>

          <Link to="/" className="brand legal-brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path d="M12 4v11m0 0l-4-4m4 4l4-4M7 19h10" fill="none"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="brand-name">Noisy<span className="gradient-text"> AIO</span></span>
          </Link>

          <h1 className="legal-title gradient-text">{data.title}</h1>
          <p className="legal-updated">{t.legal.updated}</p>
          <p className="legal-intro">{data.intro}</p>

          <div className="legal-sections">
            {data.sections.map((s, i) => (
              <section className="legal-section glass" key={i}>
                <h2>{s.h}</h2>
                <p>{s.p}</p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
