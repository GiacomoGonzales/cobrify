// El polyfill de structuredClone para WebViews Android < 98 está inline en
// index.html (script síncrono que corre antes de este bundle de módulos).
// Allí está la implementación robusta que soporta Uint8Array, Date, Map, etc.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import '@/lib/globalAudio' // Desbloquear audio con el primer click (login, etc.)
import { restaurarEscala } from '@/utils/escalaInterfaz'
import RecuperacionDeCarga from '@/components/RecuperacionDeCarga'
import { esFalloDeDescarga, decidirRecarga, CLAVE_RECARGA } from '@/utils/fallosDeCarga'

// El tamaño de interfaz elegido en ESTE dispositivo, antes del primer
// render: aplicarlo después haría que la app salte de chica a grande.
restaurarEscala()

/**
 * Falta el archivo de una pantalla y el fallo NO pasa por React.
 *
 * Vite avisa por `vite:preloadError` cuando no puede bajar un archivo que
 * estaba precargando, y eso ocurre fuera de cualquier componente: la red de
 * seguridad de abajo no se entera. Pasa por lo mismo de siempre —hubo un
 * despliegue nuevo con la pestaña abierta— y se arregla igual: una recarga,
 * una sola vez (ver src/utils/fallosDeCarga.js).
 */
window.addEventListener('vite:preloadError', (evento) => {
  if (!esFalloDeDescarga(evento)) return
  let anotado = null
  try { anotado = sessionStorage.getItem(CLAVE_RECARGA) } catch (e) { /* modo privado */ }
  if (!decidirRecarga(Date.now(), anotado).recargar) return
  // Sin `preventDefault` Vite vuelve a lanzar el error; se evita para que la
  // recarga salga limpia y no quede un error suelto en la consola.
  evento.preventDefault?.()
  try { sessionStorage.setItem(CLAVE_RECARGA, String(Date.now())) } catch (e) { /* idem */ }
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RecuperacionDeCarga>
      <App />
    </RecuperacionDeCarga>
  </React.StrictMode>
)
