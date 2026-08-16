/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0f',
        violet: '#a855f7',
        cyan: '#22d3ee',
        magenta: '#ec4899',
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  corePlugins: {
    // Kita sudah punya reset sendiri di global.css; matikan preflight
    // agar tidak menimpa styling komponen yang sudah ada.
    preflight: false,
  },
  plugins: [],
}
