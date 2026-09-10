import { useState } from 'react'

/**
 * UN CAMPO DE CANTIDAD QUE SE PUEDE ESCRIBIR.
 *
 * Parece una tontería y no lo es. La forma "obvia" de escribir uno de estos:
 *
 *     value={cantidad}
 *     onChange={e => setCantidad(parseInt(e.target.value) || 1)}
 *
 * lo vuelve imposible de usar con el teclado. Al borrar el 1 para escribir otro
 * número, `parseInt('')` es NaN, el `|| 1` lo devuelve a 1 en la misma tecla, y
 * lo que se teclea después se pega adelante: quien quería 13 termina con 113.
 * La única salida es seleccionar todo antes de escribir, y nadie tiene por qué
 * saber eso. Lo reportó un usuario que imprime etiquetas todos los días
 * (10-set-2026): "es incómodo, no se puede poner 0, se borra y sale 1".
 *
 * Acá se separan dos cosas que no son la misma:
 *  - **Mientras se escribe**, el campo puede estar vacío o a medias. Es un
 *    estado transitorio y legítimo: alguien borrando para teclear de nuevo.
 *  - **Al salir del campo** recién se decide el número final y se ajusta al
 *    mínimo y al máximo.
 *
 * Y al entrar se selecciona el contenido, para escribir la cantidad encima sin
 * borrar primero.
 *
 * ⚠️ Va como `type="text"` con teclado numérico, NO como `type="number"`:
 *  - En un `number`, `select()` y `selectionStart` no son de fiar (el estándar
 *    no obliga a soportarlos), así que ni se puede seleccionar con confianza ni
 *    se puede comprobar que funcionó.
 *  - Un `number` acepta "e", "+" y "-" —son números válidos para el navegador—
 *    y cambia de valor si alguien pasa la rueda del mouse por encima sin querer.
 * Las flechas ↑ ↓ se conservan a mano, que es lo único que se pierde.
 */
export default function CampoCantidad({
  value,
  onChange,
  min = 0,
  max = 100,
  className = '',
  title,
  'aria-label': ariaLabel,
}) {
  // null = no se está editando; el campo muestra el valor de verdad.
  const [tecleando, setTecleando] = useState(null)
  const mostrado = tecleando !== null ? tecleando : String(value ?? min)

  const escribir = (e) => {
    const crudo = e.target.value.trim()
    if (crudo === '') {
      // Se deja vacío a propósito. El valor de verdad no cambia todavía: si se
      // va sin escribir nada, al salir vuelve el que había.
      setTecleando('')
      return
    }
    if (!/^\d+$/.test(crudo)) return // solo dígitos; ni signos ni comas
    // El máximo sí se aplica al vuelo (teclear 999 con tope 100 no tiene
    // sentido en ningún momento); el mínimo NO, porque "0" puede ser el
    // principio de "10".
    const n = Math.min(max, parseInt(crudo, 10))
    setTecleando(String(n))
    onChange(n)
  }

  const salir = () => {
    const n = parseInt(tecleando ?? mostrado, 10)
    const final = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
    setTecleando(null)
    onChange(final)
  }

  const flechas = (e) => {
    if (e.key === 'Enter') { e.currentTarget.blur(); return }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const actual = parseInt(mostrado, 10)
    const base = Number.isFinite(actual) ? actual : min
    const n = Math.min(max, Math.max(min, base + (e.key === 'ArrowUp' ? 1 : -1)))
    setTecleando(String(n))
    onChange(n)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={mostrado}
      onChange={escribir}
      // Seleccionar al entrar, pero UN TICK DESPUÉS. En el mismo instante no
      // sirve: al hacer clic el navegador coloca el cursor al soltar el botón y
      // deshace la selección recién hecha.
      onFocus={(e) => { const campo = e.target; setTimeout(() => campo.select(), 0) }}
      onBlur={salir}
      onKeyDown={flechas}
      className={className}
      title={title}
      aria-label={ariaLabel}
    />
  )
}
