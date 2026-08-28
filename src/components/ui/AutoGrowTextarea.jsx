import { useCallback } from 'react'

/**
 * Caja de texto que crece con el contenido.
 *
 * Existe porque las descripciones largas no entran en un campo de una línea: en
 * varios rubros el nombre del producto ES la descripción del servicio ("RECOJO,
 * TRANSPORTE Y DISPOSICIÓN FINAL DE RESIDUOS SÓLIDOS BIOCONTAMINADOS...") y el
 * usuario no puede leer ni verificar lo que va a salir impreso en el
 * comprobante. Y como es lo que viaja al XML de SUNAT, verlo entero importa.
 *
 * Crece sola en vez de traer una barra de desplazamiento: dentro de un formulario
 * apretado, una caja con scroll esconde el problema en vez de resolverlo.
 *
 * Acepta las mismas props que un <textarea>; `className` se suma a la base.
 */
export default function AutoGrowTextarea({ className = '', onChange, rows = 1, ...props }) {
  // Ajustar en cada render y en cada tecla: al abrir un modal con texto ya
  // cargado, sin el ajuste inicial arrancaría en una línea.
  const ajustar = useCallback((el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  return (
    <textarea
      {...props}
      rows={rows}
      ref={ajustar}
      onChange={(e) => {
        ajustar(e.target)
        onChange?.(e)
      }}
      className={`resize-none overflow-hidden leading-snug ${className}`}
    />
  )
}
