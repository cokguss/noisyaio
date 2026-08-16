import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { platforms } from './icons.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'
import { detectPlatform, isSupported, fetchMedia, downloadFile } from '../services/downloader.js'
import { addHistory } from '../services/history.js'
import './Hero.css'

const STATES = { IDLE: 'idle', LOADING: 'loading', DONE: 'done' }

export default function Hero() {
  const { t } = useLang()
  const [url, setUrl] = useState('')
  const [state, setState] = useState(STATES.IDLE)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(null)
  const [progress, setProgress] = useState(0)
  const runRef = useRef(() => {})

  const processUrl = async (value) => {
    setError('')
    setResult(null)

    if (!value) {
      setError(t.hero.errors.empty)
      return
    }

    const platform = detectPlatform(value)
    if (!platform) {
      setError(t.hero.errors.unsupported)
      return
    }
    if (!isSupported(platform)) {
      const name = platform.charAt(0).toUpperCase() + platform.slice(1)
      setError(t.hero.errors.soon.replace('{platform}', name))
      return
    }

    setState(STATES.LOADING)
    try {
      const data = await fetchMedia(platform, value)
      setResult(data)
      setState(STATES.DONE)
      addHistory({
        id: `${platform}-${Date.now()}`,
        platform,
        sourceUrl: value,
        title: data.author?.name || value,
        thumbnail: data.thumbnail || null,
        fileCount: data.downloads?.length || 0,
      })
      window.dispatchEvent(new Event('noisy:history-changed'))
    } catch (err) {
      setError(t.hero.errors.failed)
      setState(STATES.IDLE)
    }
  }

  const handleDownload = async (e) => {
    e.preventDefault()
    if (state === STATES.LOADING) return
    await processUrl(url.trim())
  }

  // "Ulangi" dari riwayat: isi input lalu proses otomatis.
  useEffect(() => {
    runRef.current = processUrl
    const onRedo = (e) => {
      setUrl(e.detail)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      runRef.current(e.detail)
    }
    window.addEventListener('noisy:redo', onRedo)
    return () => window.removeEventListener('noisy:redo', onRedo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reset = () => {
    setResult(null)
    setState(STATES.IDLE)
    setError('')
    setUrl('')
  }

  const handleFileDownload = async (file, index) => {
    if (downloading !== null) return
    setDownloading(index)
    setProgress(0)
    setError('')
    const base = result?.author?.username || result?.videoId || 'noisy-aio'
    const suffix = file.kind === 'audio' ? 'audio'
      : file.kind === 'image' ? `foto-${index + 1}`
      : file.hd ? 'hd' : 'video'
    const filename = `${base}-${suffix}.${file.ext}`
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    try {
      const ok = await downloadFile(file.url, filename, (ratio) => {
        setProgress(ratio < 0 ? -1 : Math.round(ratio * 100))
      }, !!file.direct)
      // Di iOS hasil unduhan masuk app Files, bukan galeri — beri petunjuk.
      if (isIOS && ok) {
        setError(t.hero.errors.iosSaved)
      }
    } catch (err) {
      if (err?.code === 'BAD_FILE') {
        setError(t.hero.errors.expired)
      }
    } finally {
      setDownloading(null)
      setProgress(0)
    }
  }

  return (
    <section className="hero" id="top">
      <div className="container hero-inner">
        <motion.div
          className="hero-badge"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="pulse-dot" /> {t.hero.badge}
        </motion.div>

        <motion.h1
          className="hero-title"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08 }}
        >
          {t.hero.titleLine1}
          <br />
          <span className="gradient-text">{t.hero.titleLine2}</span>
        </motion.h1>

        <motion.p
          className="hero-sub"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.16 }}
        >
          {t.hero.sub}
        </motion.p>

        <motion.form
          className="downloader glass"
          onSubmit={handleDownload}
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.24 }}
        >
          <div className="input-wrap">
            <svg className="link-icon" viewBox="0 0 24 24" width="20" height="20"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
              <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
            </svg>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t.hero.placeholder}
              spellCheck="false"
            />
          </div>
          <button type="submit" className={`dl-btn state-${state}`} disabled={state === STATES.LOADING}>
            <span className="dl-btn-shine" />
            {state === STATES.LOADING ? (
              <span className="dl-loading"><span className="spinner" /> {t.hero.processing}</span>
            ) : (
              <span>{t.hero.download}</span>
            )}
          </button>
        </motion.form>

        <AnimatePresence>
          {error && (
            <motion.p
              className="hero-error"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {result && (
            <motion.div
              className="result glass"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.4 }}
            >
              {(() => {
                // Prioritas preview: video yang bisa diputar (lewat proxy,
                // mode preview tanpa header attachment) dengan thumbnail
                // sebagai poster; kalau tidak ada, gambar thumbnail; kalau
                // tetap tidak ada, gambar/foto pertama dari daftar unduhan.
                const videoFile = result.downloads.find((d) => d.kind === 'video')
                const imageFile = result.downloads.find((d) => d.kind === 'image')
                const previewUrl = (u) => (u && u.startsWith('/api/stream?') ? `${u}&preview=1` : u)

                if (videoFile) {
                  return (
                    <div className="result-thumb">
                      <video
                        src={previewUrl(videoFile.url)}
                        poster={result.thumbnail || undefined}
                        muted
                        loop
                        playsInline
                        autoPlay
                        preload="metadata"
                        referrerPolicy="no-referrer"
                        onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
                      />
                    </div>
                  )
                }
                if (result.thumbnail || imageFile) {
                  return (
                    <div className="result-thumb">
                      <img
                        src={result.thumbnail || previewUrl(imageFile.url)}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
                      />
                    </div>
                  )
                }
                return null
              })()}
              <div className="result-body">
                {(result.author.avatar || result.author.name || result.author.username) && (
                  <div className="result-author">
                    {result.author.avatar && (
                      <img
                        className="result-avatar"
                        src={result.author.avatar}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    )}
                    <div>
                      <p className="result-name">{result.author.name || result.author.username}</p>
                      {result.author.username && (
                        <p className="result-username">@{result.author.username}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="result-actions">
                  {result.downloads.map((f, i) => {
                    const active = downloading === i
                    const indeterminate = active && progress === -1
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleFileDownload(f, i)}
                        disabled={downloading !== null}
                        className={`result-dl ${f.kind === 'audio' ? 'is-audio' : ''} ${active ? 'is-downloading' : ''}`}
                      >
                        {active && (
                          <span
                            className={`result-dl-progress ${indeterminate ? 'is-indeterminate' : ''}`}
                            style={indeterminate ? undefined : { width: `${progress}%` }}
                          />
                        )}
                        <span className="result-dl-content">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
                          </svg>
                          <span className="result-dl-label">
                            {active
                              ? indeterminate
                                ? t.hero.processing
                                : `${t.hero.processing} ${progress}%`
                              : f.label}
                          </span>
                          {!active && f.sizeMb ? <em>{f.sizeMb.toFixed(1)} MB</em> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <button type="button" className="result-reset" onClick={reset}>
                  {t.hero.result.another}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className="hero-platforms"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.36 }}
        >
          <span className="hp-label">{t.hero.supported}</span>
          {platforms.map((p, i) => (
            <motion.span
              key={p.id}
              className="hp-chip"
              style={{ '--pc': p.color }}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.25, ease: 'easeInOut' }}
              title={p.name}
            >
              <p.Icon width={20} height={20} />
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
