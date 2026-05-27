// El polyfill de structuredClone para WebViews Android < 98 está inline en
// index.html (script síncrono que corre antes de este bundle de módulos).
// Allí está la implementación robusta que soporta Uint8Array, Date, Map, etc.
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
