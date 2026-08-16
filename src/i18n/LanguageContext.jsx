import { createContext, useContext, useEffect, useState } from 'react'
import { translations } from './translations.js'

const LangContext = createContext(null)

const getInitialLang = () => {
  if (typeof window === 'undefined') return 'id'
  const saved = localStorage.getItem('noisy-lang')
  if (saved === 'id' || saved === 'en') return saved
  return navigator.language?.startsWith('en') ? 'en' : 'id'
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(getInitialLang)

  useEffect(() => {
    localStorage.setItem('noisy-lang', lang)
    document.documentElement.lang = lang
  }, [lang])

  const toggle = () => setLang((l) => (l === 'id' ? 'en' : 'id'))

  return (
    <LangContext.Provider value={{ lang, setLang, toggle, t: translations[lang] }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LanguageProvider')
  return ctx
}
