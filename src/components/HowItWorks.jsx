import { useLang } from '../i18n/LanguageContext.jsx'
import './HowItWorks.css'

export default function HowItWorks() {
  const { t } = useLang()
  const nums = ['01', '02', '03']

  return (
    <section id="how">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{t.how.eyebrow}</span>
          <h2 className="section-title">{t.how.title1}<span className="gradient-text">{t.how.title2}</span></h2>
          <p className="section-sub">{t.how.sub}</p>
        </div>

        <div className="steps" data-reveal>
          <div className="steps-line" aria-hidden="true" />
          {t.how.steps.map((s, i) => (
            <div className="step glass" key={i}>
              <span className="step-num gradient-text">{nums[i]}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
