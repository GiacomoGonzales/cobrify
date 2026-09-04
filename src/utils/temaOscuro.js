import { useState } from 'react'

/**
 * Claro u oscuro, compartido por el panel de administración y la bandeja del
 * chat. Las reglas de color viven en `src/index.css`, bajo
 * `:is(.admin,.chat-cobrify).oscuro`; acá solo se decide cuál va puesto.
 *
 * Por defecto sigue lo que tenga el sistema operativo. En cuanto alguien toca
 * el interruptor, esa elección manda y se recuerda.
 *
 * Cada pantalla guarda su preferencia por separado. No es un descuido: el
 * panel lo usa Giacomo y la bandeja la usa el personal del cliente. Compartir
 * la elección haría que uno le cambiara el tema al otro sin pedirlo.
 */

const temaDelSistema = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    ? 'oscuro'
    : 'claro'

const temaGuardado = (llave) => {
  try {
    const guardado = localStorage.getItem(llave)
    if (guardado === 'claro' || guardado === 'oscuro') return guardado
  } catch { /* sin localStorage: manda el sistema */ }
  return temaDelSistema()
}

/** @returns {[('claro'|'oscuro'), () => void]} el tema puesto y cómo cambiarlo. */
export function useTema(llave) {
  const [tema, setTema] = useState(() => temaGuardado(llave))

  const cambiar = () => {
    const nuevo = tema === 'claro' ? 'oscuro' : 'claro'
    setTema(nuevo)
    try { localStorage.setItem(llave, nuevo) } catch { /* no se recuerda, y ya */ }
  }

  return [tema, cambiar]
}
