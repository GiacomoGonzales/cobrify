/**
 * Las marcas de las tiendas, dibujadas como SVG.
 *
 * Van vectoriales y no como imagen para que no dependan de una descarga: esta
 * pantalla es lo último que ve alguien que acaba de pagar, y un logo que no
 * carga ahí se ve peor que no ponerlo.
 *
 * Si algún día quieres los distintivos oficiales ("Disponible en Google Play",
 * "Descárgalo en el App Store"), Apple y Google los publican como imagen con
 * sus reglas de uso; se cambian aquí y en ningún otro sitio.
 */

/** La manzana de Apple. Silueta, sin degradado: se lee a 20 px. */
export function LogoAppStore({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.76c.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.29-.88-2.31-3.5zM14.2 5.9c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.56 1.31-.56.65-1.06 1.69-.93 2.69.97.07 1.97-.49 2.59-1.22z" />
    </svg>
  )
}

/**
 * El triángulo de Google Play, con sus cuatro colores.
 *
 * Se construye con cuatro triángulos que comparten el vértice de la derecha y
 * el pliegue central, que es como está hecho el original: verde arriba a la
 * izquierda, azul abajo, amarillo abajo a la derecha y rojo arriba a la derecha.
 */
export function LogoPlayStore({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3.6 2.4 13.5 12 3.6 21.6A1.5 1.5 0 0 1 3 20.4V3.6c0-.47.24-.9.6-1.2z" fill="#00A0FF" />
      <path d="M3.6 2.4 13.5 12l3.1-3-11.2-6.4a1.5 1.5 0 0 0-1.8-.2z" fill="#00E27A" />
      <path d="m16.6 9 3.6 2.1c.9.5.9 1.8 0 2.3L16.6 15l-3.1-3z" fill="#FFBC00" />
      <path d="M13.5 12 3.6 21.6c.5.4 1.2.5 1.8.1L16.6 15z" fill="#FF3A44" />
    </svg>
  )
}

/** La ventanita del navegador, para "entrar desde la computadora". */
export function LogoNavegador({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="15" rx="2" />
      <path d="M2.5 8.5h19" />
      <circle cx="5.6" cy="6.2" r=".7" fill="currentColor" stroke="none" />
      <circle cx="8" cy="6.2" r=".7" fill="currentColor" stroke="none" />
    </svg>
  )
}
