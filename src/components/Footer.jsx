import { Link } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext.jsx'
import './Footer.css'

export default function Footer() {
  const { t } = useLang()

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-cta glass" data-reveal>
          <h2>{t.footer.ctaTitle1}<span className="gradient-text">{t.footer.ctaTitle2}</span></h2>
          <p>{t.footer.ctaSub}</p>
          <a href="#top" className="footer-btn">{t.footer.ctaBtn}</a>
        </div>

        <div className="footer-grid">
          <div className="footer-brand">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path d="M12 4v11m0 0l-4-4m4 4l4-4M7 19h10" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="brand-name">Noisy<span className="gradient-text"> AIO</span></span>
            </div>
            <p>{t.footer.brandDesc}</p>
          </div>

          <div className="footer-col">
            <h4>{t.footer.colPlatform}</h4>
            <a href="#platforms">YouTube</a>
            <a href="#platforms">TikTok</a>
            <a href="#platforms">Instagram</a>
            <a href="#platforms">Twitter / X</a>
          </div>

          <div className="footer-col">
            <h4>{t.footer.colLinks}</h4>
            <a href="#how">{t.footer.linkHow}</a>
            <a href="#features">{t.footer.linkFeatures}</a>
            <a href="#faq">{t.footer.linkFaq}</a>
          </div>

          <div className="footer-col">
            <h4>{t.footer.colLegal}</h4>
            <Link to="/terms">{t.footer.terms}</Link>
            <Link to="/privacy">{t.footer.privacy}</Link>
          </div>
        </div>

        <div className="footer-contact" data-reveal>
          <h3>{t.footer.contactTitle1}<span className="gradient-text">{t.footer.contactTitle2}</span></h3>
          <p>{t.footer.contactSub}</p>
          <div className="footer-contact-btns">
            <a
              className="contact-btn is-ig"
              href="https://instagram.com/fagubitch.exe"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              {t.footer.contactIg}
              <small>fagubitch.exe</small>
            </a>
            <a
              className="contact-btn is-tg"
              href="https://t.me/noisy05"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.5 4.5L2.9 11.7c-1 .4-1 1.5.1 1.8l4.6 1.4 1.7 5.2c.3.9 1.2 1.1 1.8.5l2.6-2.6 4.8 3.5c.8.6 1.9.2 2.1-.8l3-14.4c.2-1.1-.8-2-1.9-1.6z" />
              </svg>
              {t.footer.contactTg}
              <small>noisy05</small>
            </a>
            <a
              className="contact-btn is-gh"
              href="https://github.com/cokguss"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.33.85 0 1.7.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z" />
              </svg>
              {t.footer.contactGh}
              <small>cokguss</small>
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>{t.footer.copyright}</p>
          <p className="footer-note">{t.footer.note}</p>
        </div>
      </div>
    </footer>
  )
}
