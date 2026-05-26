// Polyfill de structuredClone para WebViews antiguas de Android (< 98).
// La librería capacitor-thermal-printer (y el receipt-printer-encoder que usa
// internamente) llama a structuredClone() para clonar configuraciones. En
// tablets con Android System WebView desactualizado falla con "structuredClone
// is not defined". Este fallback con JSON funciona para objetos planos (que es
// el caso de las configs del printer). DEBE estar al inicio, antes de cualquier
// import que pudiera usar la función.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = function structuredClonePolyfill(value) {
    if (value === undefined || value === null) return value
    return JSON.parse(JSON.stringify(value))
  }
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import '@/lib/globalAudio' // Desbloquear audio con el primer click (login, etc.)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
