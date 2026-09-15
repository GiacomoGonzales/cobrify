import { useEffect, useRef, useState } from 'react'

/**
 * Input de búsqueda que muestra cada tecla al instante y le avisa a la página
 * recién cuando se deja de escribir.
 *
 * Para páginas grandes: si el texto vive en la página, CADA tecla la redibuja
 * entera y en un celular modesto las letras aparecen tarde (Productos con 4,460
 * productos, DHANY MEGAFIESTA, 15/09/2026). Acá cada tecla solo redibuja este
 * input; la página se entera a los `espera` ms sin teclear.
 *
 * `valor` manda cuando cambia desde afuera (el escáner pone un código, algo
 * limpia la búsqueda). Lo que este mismo campo avisó vuelve por `valor` y no
 * debe pisar lo que se siguió escribiendo mientras tanto.
 */
export default function CampoDeBusqueda({ valor, onCambio, espera = 250, ...props }) {
  const externo = valor ?? ''
  const [texto, setTexto] = useState(externo)
  const ultimoAvisado = useRef(externo)
  const temporizador = useRef(null)

  useEffect(() => {
    if (externo === ultimoAvisado.current) return
    ultimoAvisado.current = externo
    clearTimeout(temporizador.current)
    setTexto(externo)
  }, [externo])

  useEffect(() => () => clearTimeout(temporizador.current), [])

  const alEscribir = (e) => {
    const nuevo = e.target.value
    setTexto(nuevo)
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => {
      ultimoAvisado.current = nuevo
      onCambio(nuevo)
    }, espera)
  }

  return <input type="text" {...props} value={texto} onChange={alEscribir} />
}
