import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import App from './App.jsx'
import LegalPage from './pages/LegalPage.jsx'
import Preloader from './components/Preloader.jsx'
import './styles/variables.css'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <Preloader />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/terms" element={<LegalPage doc="terms" />} />
          <Route path="/privacy" element={<LegalPage doc="privacy" />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
)
