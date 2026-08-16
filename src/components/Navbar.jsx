import { useEffect, useState } from 'react'
import { useLang } from '../i18n/LanguageContext.jsx'
import { getHistory } from '../services/history.js'
import History from './History.jsx'
import './Navbar.css'

export default function Navbar() {
  const { t, lang, toggle } = useLang()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyCount, setHistoryCount] = useState(0)

  const links = [
    { label: t.nav.platforms, href: '#platforms' },
    { label: t.nav.how, href: '#how' },
    { label: t.nav.features, href: '#features' },
    { label: t.nav.faq, href: '#faq' },
  ]

  useEffect(() => {
    const refreshCount = () => setHistoryCount(getHistory().length)
    refreshCount()
    window.addEventListener('noisy:history-changed', refreshCount)
    return () => window.removeEventListener('noisy:history-changed', refreshCount)
  }, [])

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 20)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`navbar ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container nav-inner">
        <a href="#top" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M12 4v11m0 0l-4-4m4 4l4-4M7 19h10" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="brand-name">Noisy<span className="gradient-text"> AIO</span></span>
        </a>

        <nav className={`nav-links ${open ? 'is-open' : ''}`}>
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
          ))}

          <button
            className="lang-toggle"
            onClick={toggle}
            aria-label="Switch language"
            title={lang === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
          >
            <span className={lang === 'id' ? 'active' : ''}>ID</span>
            <span className="lang-sep">/</span>
            <span className={lang === 'en' ? 'active' : ''}>EN</span>
          </button>

          <button
            className="nav-history"
            onClick={() => setHistoryOpen(true)}
            aria-label={t.history.title}
            title={t.history.title}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5M12 7v5l3 3" />
            </svg>
            {historyCount > 0 && <span className="nav-history-badge">{historyCount > 99 ? '99+' : historyCount}</span>}
          </button>

          <a href="#top" className="nav-cta" onClick={() => setOpen(false)}>{t.nav.start}</a>
        </nav>

        <button
          className={`burger ${open ? 'is-open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
        >
          <span /><span /><span />
        </button>
      </div>

      <History open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </header>
  )
}
