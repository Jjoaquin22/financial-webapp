import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'

// Configure reCAPTCHA v2 to work with localhost development
const reCaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || ''

// Log for debugging
console.log('reCAPTCHA v2 Setup:', {
  key: reCaptchaKey ? '✓ Key loaded' : '✗ No key',
  hostname: window.location.hostname,
  version: 'v2 (Checkbox)',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
