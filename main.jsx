import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

/* Register the service worker that makes the app openable without a signal.
   Deliberately after render and on `load`, so a slow or failed registration
   can never delay first paint — and a browser without service workers (or a
   plain http:// origin) just carries on online-only. */
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Nosh: offline mode unavailable —', err.message)
    })
  })
}
