/**
 * NOMBRES COMERCIALES DE UN CLIENTE = SUS SEDES.
 *
 * Una empresa (un RUC, una razón social) atiende con varias tiendas o marcas:
 * "Bambú Picota", "Bambú Tarapoto". Al vender hay que decir A CUÁL se le
 * vende: ese nombre sale en el comprobante como "Nombre comercial" (y su
 * dirección, si la tiene); a SUNAT sigue yendo la razón social y el RUC.
 *
 * Las sedes viven en la lista de siempre de la ficha, `deliveryAddresses[]`
 * ({ id, label, address, phone, ubigeo, ... }): la misma que usan las guías
 * de remisión como punto de llegada. Una sede CON nombre (`label`) es una
 * opción para vender; una dirección sin nombre es solo un punto de entrega.
 * El "Nombre" de la ficha es el principal. Todo se gestiona desde la ficha
 * (pedido de Giacomo, 8-set-2026); el POS solo elige.
 *
 * La primera versión, de unas horas ese mismo día, guardaba una lista aparte
 * en `tradeNames[]` ({ id, name, address, phone }): se sigue leyendo y la ficha
 * la funde en las sedes al abrir el cliente (sedesDeCliente).
 */

/** Id de la opción que representa el nombre de la ficha. */
export const PRINCIPAL = 'principal'

const limpio = (v) => String(v ?? '').trim()

// Sin tildes, como el buscador del sistema: 'bambu' tiene que dar con 'Bambú'.
const normal = (v) => limpio(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ')

const sedesConNombre = (cliente) =>
  (Array.isArray(cliente?.deliveryAddresses) ? cliente.deliveryAddresses : []).filter((d) => d && limpio(d.label))

const nombresViejos = (cliente) =>
  (Array.isArray(cliente?.tradeNames) ? cliente.tradeNames : []).filter((t) => t && limpio(t.name))

/**
 * Las sedes que edita la ficha: la lista de siempre, más lo que alguien haya
 * cargado en el bloque "nombres comerciales" de la primera versión, fundido
 * como sede manual sin repetir un nombre que ya esté.
 */
export function sedesDeCliente(cliente) {
  const base = Array.isArray(cliente?.deliveryAddresses) ? cliente.deliveryAddresses : []
  const nombres = new Set(base.map((d) => normal(d?.label)).filter(Boolean))
  const fundidos = nombresViejos(cliente)
    .filter((t) => !nombres.has(normal(t.name)))
    .map((t) => ({
      id: t.id || `nc_${normal(t.name)}`,
      label: limpio(t.name),
      address: limpio(t.address),
      phone: limpio(t.phone),
      ubigeo: '',
      source: 'manual',
      establishmentCode: '',
    }))
  return [...base, ...fundidos]
}

/**
 * Las opciones para el desplegable: primero la de la ficha (principal, con el
 * domicilio fiscal y el teléfono de siempre), luego las sedes con nombre. Un
 * mismo nombre no aparece dos veces.
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
  const vistos = new Set()
  const extras = []
  const agregar = (id, name, address, phone) => {
    const k = normal(name)
    if (!k || vistos.has(k)) return
    vistos.add(k)
    extras.push({ id: id || k, name: limpio(name), address: limpio(address), phone: limpio(phone), principal: false })
  }
  for (const d of sedesConNombre(cliente)) agregar(d.id, d.label, d.address, d.phone)
  for (const t of nombresViejos(cliente)) agregar(t.id, t.name, t.address, t.phone)
  return [principal, ...extras]
}

export const tieneVariosNombres = (cliente) => opcionesDeNombreComercial(cliente).length > 1

/** Los nombres de las sedes, para que "Buscar cliente" los encuentre. */
export function nombresParaBuscar(cliente) {
  return [
    ...sedesConNombre(cliente).map((d) => limpio(d.label)),
    ...nombresViejos(cliente).map((t) => limpio(t.name)),
  ]
}

/**
 * Si el cliente se encontró escribiendo el nombre de una sede, esa queda
 * elegida; si no (se buscó por RUC, razón social, celular), la principal.
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
