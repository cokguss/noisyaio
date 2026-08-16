import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLang } from '../i18n/LanguageContext.jsx'
import './FAQ.css'

function Item({ item, isOpen, onToggle }) {
  return (
    <div className={`faq-item glass ${isOpen ? 'is-open' : ''}`}>
      <button className="faq-q" onClick={onToggle} aria-expanded={isOpen}>
        <span>{item.q}</span>
        <span className="faq-plus" aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            className="faq-a-wrap"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <p className="faq-a">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function FAQ() {
  const { t } = useLang()
  const [open, setOpen] = useState(0)

  return (
    <section id="faq">
      <div className="container faq-container">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{t.faq.eyebrow}</span>
          <h2 className="section-title">{t.faq.title1}<span className="gradient-text">{t.faq.title2}</span></h2>
        </div>

        <div className="faq-list" data-reveal>
          {t.faq.items.map((item, i) => (
            <Item
              key={i}
              item={item}
              isOpen={open === i}
              onToggle={() => setOpen(open === i ? -1 : i)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
