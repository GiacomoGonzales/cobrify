// El polyfill de structuredClone para WebViews Android < 98 está inline en
// index.html (script síncrono que corre antes de este bundle de módulos).
// Allí está la implementación robusta que soporta Uint8Array, Date, Map, etc.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import '@/lib/globalAudio' // Desbloquear audio con el primer click (login, etc.)
import { restaurarEscala } from '@/utils/escalaInterfaz'

// El tamaño de interfaz elegido en ESTE dispositivo, antes del primer
// render: aplicarlo después haría que la app salte de chica a grande.
restaurarEscala()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
