export const YouTubeIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
  </svg>
)

export const TikTokIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M16.6 5.8a4.9 4.9 0 0 1-3-2.8h-3.1v12.9a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V7.9a6 6 0 1 0 5.1 5.9V9.1a8 8 0 0 0 4.6 1.5V7.4a4.9 4.9 0 0 1-1.6-.2 4.9 4.9 0 0 1 0-1.4z" />
  </svg>
)

export const InstagramIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
)

export const FacebookIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z" />
  </svg>
)

export const TwitterIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M18.9 2h3.3l-7.2 8.3L23.5 22h-6.6l-5.2-6.8L5.8 22H2.5l7.7-8.8L1.5 2h6.8l4.7 6.2L18.9 2zm-1.2 18h1.8L7.4 3.9H5.5L17.7 20z" />
  </svg>
)

export const platforms = [
  { id: 'youtube', name: 'YouTube', Icon: YouTubeIcon, color: '#ff0033' },
  { id: 'tiktok', name: 'TikTok', Icon: TikTokIcon, color: '#22d3ee' },
  { id: 'instagram', name: 'Instagram', Icon: InstagramIcon, color: '#ec4899' },
  { id: 'facebook', name: 'Facebook', Icon: FacebookIcon, color: '#3b82f6' },
  { id: 'twitter', name: 'Twitter / X', Icon: TwitterIcon, color: '#e2e8f0' },
]
