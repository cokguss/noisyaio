import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useLang } from '../i18n/LanguageContext.jsx'
import { getHistory, removeHistory, clearHistory } from '../services/history.js'
import './History.css'

const PLATFORM_COLORS = {
  tiktok: '#22d3ee',
  instagram: '#ec4899',
  youtube: '#ef4444',
  twitter: '#38bdf8',
  facebook: '#60a5fa',
}

function timeAgo(ts, lang) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return lang === 'id' ? `${d} hari lalu` : `${d}d ago`
  if (h > 0) return lang === 'id' ? `${h} jam lalu` : `${h}h ago`
  if (m > 0) return lang === 'id' ? `${m} menit lalu` : `${m}m ago`
  return lang === 'id' ? 'baru saja' : 'just now'
}

export default function History({ open, onClose }) {
  const { t, lang } = useLang()
  const [items, setItems] = useState([])
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (open) {
      setItems(getHistory())
      setConfirmClear(false)
    }
  }, [open])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleRemove = (id) => {
    removeHistory(id)
    setItems(getHistory())
  }

  const handleClear = () => {
    if (!confirmClear) { setConfirmClear(true); return }
    clearHistory()
    setItems([])
  }

  const handleRedo = (url) => {
    window.dispatchEvent(new CustomEvent('noisy:redo', { detail: url }))
    onClose()
  }

  // Portal ke body: overlay fixed tidak boleh berada di dalam navbar,
  // karena backdrop-filter/transform pada navbar mengubah containing block
  // elemen fixed (bug posisi panel "terlalu ke atas" saat halaman discroll).
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="history-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="history-panel glass"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="history-head">
              <h3>{t.history.title}</h3>
              {items.length > 0 && (
                <button
                  className={`history-clear ${confirmClear ? 'is-confirm' : ''}`}
                  onClick={handleClear}
                >
                  {confirmClear ? t.history.confirmClear : t.history.clear}
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="history-empty">
                <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5M12 7v5l3 3" />
                </svg>
                <p>{t.history.empty}</p>
              </div>
            ) : (
              <ul className="history-list">
                {items.map((e) => (
                  <li key={e.id} className="history-item">
                    {e.thumbnail ? (
                      <img
                        className="history-thumb"
                        src={e.thumbnail}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(ev) => { ev.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <span
                        className="history-thumb is-placeholder"
                        style={{ '--pc': PLATFORM_COLORS[e.platform] || '#a855f7' }}
                        aria-hidden="true"
                      >
                        {e.title?.charAt(0).toUpperCase() || '?'}
                      </span>
                    )}
                    <div className="history-info">
                      <span
                        className="history-platform"
                        style={{ '--pc': PLATFORM_COLORS[e.platform] || '#a855f7' }}
                      >
                        {e.platform}
                      </span>
                      <p className="history-title">{e.title || e.sourceUrl}</p>
                      <p className="history-meta">
                        {timeAgo(e.at, lang)}
                        {e.fileCount > 0 && ` · ${t.history.files.replace('{n}', e.fileCount)}`}
                      </p>
                    </div>
                    <div className="history-actions">
                      <button
                        className="history-redo"
                        onClick={() => handleRedo(e.sourceUrl)}
                        title={t.history.redo}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                          <path d="M21 3v5h-5" />
                        </svg>
                        {t.history.redo}
                      </button>
                      <button
                        className="history-del"
                        onClick={() => handleRemove(e.id)}
                        aria-label={t.history.delete}
                        title={t.history.delete}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
