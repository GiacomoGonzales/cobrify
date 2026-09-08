/**
 * VARIOS NOMBRES COMERCIALES POR CLIENTE.
 *
 * Una empresa (un RUC, una razón social) atiende con varias tiendas o marcas:
 * "Bambú Picota", "Bambú Tarapoto". Al vender hay que decir A CUÁL se le
 * vende: ese nombre sale en el comprobante como "Nombre comercial" (y su
 * dirección, si la tiene); a SUNAT sigue yendo la razón social y el RUC.
 *
 * En la ficha, el "Nombre" del cliente con RUC ya era su nombre comercial
 * principal; acá se agregan los demás en `tradeNames[]`:
 *   { id, name, address, phone }
 * Se gestionan SOLO desde la ficha (pedido de Giacomo, 8-set-2026).
 */

const nuevoId = () => `nc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

/** Id de la opción que representa el nombre de la ficha. */
export const PRINCIPAL = 'principal'

export const crearNombreComercialVacio = () => ({ id: nuevoId(), name: '', address: '', phone: '' })

const limpio = (v) => String(v ?? '').trim()

/** Lista lista para guardar: sin filas sin nombre, con id, solo los 4 campos. */
export function limpiarNombresComercialesParaGuardar(lista = []) {
  return (lista || [])
    .filter((t) => t && limpio(t.name))
    .map((t) => ({ id: t.id || nuevoId(), name: limpio(t.name), address: limpio(t.address), phone: limpio(t.phone) }))
}

/**
 * Las opciones para el desplegable: primero la de la ficha (principal), luego
 * las adicionales. La principal lleva el domicilio fiscal y el teléfono de la
 * ficha, que es lo que el POS ya cargaba.
 */
export function opcionesDeNombreComercial(cliente) {
  if (!cliente) return []
  const principal = {
    id: PRINCIPAL,
    name: limpio(cliente.name) || limpio(cliente.businessName),
    address: limpio(cliente.address),
    phone: limpio(cliente.phone),
    principal: true,
  }
  const extras = (Array.isArray(cliente.tradeNames) ? cliente.tradeNames : [])
    .filter((t) => t && limpio(t.name))
    .map((t) => ({ id: t.id || limpio(t.name), name: limpio(t.name), address: limpio(t.address), phone: limpio(t.phone), principal: false }))
  return [principal, ...extras]
}

export const tieneVariosNombres = (cliente) => opcionesDeNombreComercial(cliente).length > 1

/** Los nombres adicionales, para que "Buscar cliente" los encuentre. */
export function nombresParaBuscar(cliente) {
  return (Array.isArray(cliente?.tradeNames) ? cliente.tradeNames : []).map((t) => limpio(t?.name)).filter(Boolean)
}

// Sin tildes, como el buscador del sistema: 'bambu' tiene que dar con 'Bambú'.
const normal = (v) => limpio(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ')

/**
 * Si el cliente se encontró escribiendo uno de sus nombres comerciales, ese
 * queda elegido; si no (se buscó por RUC, razón social, celular), la principal.
 * Coincide cuando todas las palabras buscadas están en el nombre.
 */
export function opcionQueCoincide(cliente, termino) {
  const opciones = opcionesDeNombreComercial(cliente)
  const palabras = normal(termino).split(' ').filter(Boolean)
  if (palabras.length === 0) return opciones[0] || null
  return opciones.find((o) => { const n = normal(o.name); return palabras.every((p) => n.includes(p)) }) || opciones[0] || null
}

/**
 * Aplica la opción elegida a los datos del cliente del POS: nombre siempre;
 * dirección y teléfono propios si los tiene. La principal vuelve al domicilio
 * fiscal aunque esté vacío, porque esa es la verdad de la ficha.
 */
export function aplicarNombreComercial(customerData, opcion) {
  if (!opcion) return customerData
  const base = customerData || {}
  return {
    ...base,
    name: opcion.name || base.name || '',
    address: opcion.principal ? opcion.address : (opcion.address || base.address || ''),
    phone: opcion.principal ? opcion.phone : (opcion.phone || base.phone || ''),
    tradeNameId: opcion.principal ? null : opcion.id,
  }
}
