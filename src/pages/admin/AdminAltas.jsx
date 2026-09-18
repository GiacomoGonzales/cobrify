import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pestanas } from '@/components/admin/ui'
import FormulariosDeAlta from '@/components/admin/altas/FormulariosDeAlta'
import PruebasGratuitas from '@/components/admin/altas/PruebasGratuitas'

/**
 * ALTAS: los formularios de alta que se mandaron y las pruebas gratuitas, en
 * dos pestañas. Eran dos paginas del menu y el 17-set-2026 Giacomo pidio
 * juntarlas: son el mismo camino, porque una prueba nace de un formulario de
 * alta con el plan «Prueba gratuita».
 *
 * La pestaña va en la direccion (?vista=pruebas): la ruta vieja /pruebas llega
 * directo, y al volver de una ficha se abre la misma pestaña.
 */

const PESTANAS = [
  { id: 'formularios', etiqueta: 'Formularios' },
  { id: 'pruebas', etiqueta: 'Pruebas' },
]

export default function AdminAltas() {
  const [searchParams, setSearchParams] = useSearchParams()
  const vista = searchParams.get('vista') === 'pruebas' ? 'pruebas' : 'formularios'

  // Cada pestaña carga lo suyo la primera vez que se abre y despues se queda
  // montada, escondida: ir y volver no repite las lecturas ni pierde el filtro.
  const [abiertas, setAbiertas] = useState([vista])
  if (!abiertas.includes(vista)) setAbiertas([...abiertas, vista])

  const pestanas = (
    <Pestanas
      opciones={PESTANAS}
      valor={vista}
      // Con `replace`, cambiar de pestaña no llena el historial del navegador.
      onCambiar={v => setSearchParams(v === 'pruebas' ? { vista: 'pruebas' } : {}, { replace: true })}
    />
  )

  return (
    <>
      {abiertas.includes('formularios') && (
        <div hidden={vista !== 'formularios'}><FormulariosDeAlta pestanas={pestanas} /></div>
      )}
      {abiertas.includes('pruebas') && (
        <div hidden={vista !== 'pruebas'}><PruebasGratuitas pestanas={pestanas} /></div>
      )}
    </>
  )
}
