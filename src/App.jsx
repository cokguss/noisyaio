import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Aurora from './components/Aurora.jsx'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import PlatformGrid from './components/PlatformGrid.jsx'
import HowItWorks from './components/HowItWorks.jsx'
import Features from './components/Features.jsx'
import FAQ from './components/FAQ.jsx'
import Footer from './components/Footer.jsx'

gsap.registerPlugin(ScrollTrigger)

export default function App() {
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%' },
        })
      })
    })

    return () => ctx.revert()
  }, [])

  return (
    <>
      <Aurora />
      <Navbar />
      <main>
        <Hero />
        <PlatformGrid />
        <HowItWorks />
        <Features />
        <FAQ />
      </main>
      <Footer />
    </>
  )
}
