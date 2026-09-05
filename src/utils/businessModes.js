/**
 * Preguntas sobre el RUBRO del negocio que se responden igual en varias
 * pantallas.
 *
 * La idea es no repartir `businessMode === 'x' || businessMode === 'y'` por el
 * código: cuando ese criterio queda copiado, tarde o temprano una pantalla se
 * actualiza y la otra no, y el usuario ve la función a medias.
 */

/**
 * ¿Este rubro maneja fichas de MEDICAMENTO?
 *
 * Farmacia y veterinaria venden lo mismo desde el punto de vista del producto:
 * principio activo, concentración, laboratorio, registro sanitario, condición de
 * venta y control de lotes con vencimiento. Cambia a quién se le vende, no lo
 * que se registra.
 *
 * Este criterio ya vivía suelto dentro del modal de importación —que arma la
 * plantilla "de medicamentos" para los dos rubros— mientras el FORMULARIO de
 * producto solo lo aplicaba a farmacia. Resultado: un veterinario descargaba una
 * plantilla con columnas de medicamento que su ficha de producto no tenía dónde
 * mostrar, así que esos datos solo podían cargarse importando.
 *
 * @param {string} businessMode
 * @returns {boolean}
 */
export const isPharmaLikeMode = (businessMode) =>
  businessMode === 'pharmacy' || businessMode === 'veterinary'

/**
 * LOS MODOS DE NEGOCIO, con su nombre.
 *
 * Vive aca porque la lista estaba copiada en cinco pantallas y ninguna decia lo
 * mismo: el filtro de Usuarios ofrecia cinco modos de los nueve que existen
 * —faltaban hotel, veterinaria, logistica y prestamos—, asi que esas cuentas no
 * se podian filtrar. Cada vez que se agrego un modo nuevo, alguna copia se
 * quedo atras.
 *
 * `retail` se muestra como "General": no es un rubro, es la plantilla para
 * cualquier negocio que no tiene una propia. El valor guardado no cambia.
 *
 * El orden es el de la lista: General primero por ser el mas comun.
 */
export const MODOS_NEGOCIO = [
  { id: 'retail', nombre: 'General' },
  { id: 'restaurant', nombre: 'Restaurante' },
  { id: 'pharmacy', nombre: 'Farmacia' },
  { id: 'veterinary', nombre: 'Veterinaria' },
  { id: 'clinic', nombre: 'Clínica' },
  { id: 'hotel', nombre: 'Hotel' },
  { id: 'transport', nombre: 'Transporte' },
  { id: 'logistics', nombre: 'Logística' },
  { id: 'real_estate', nombre: 'Inmobiliaria' },
  { id: 'lending', nombre: 'Préstamos' },
]

/** El nombre de un modo, con el id como respaldo si aparece uno desconocido. */
export const nombreModo = (id) =>
  MODOS_NEGOCIO.find((m) => m.id === id)?.nombre || id || '—'

/**
 * ¿Este negocio ATIENDE CON CITA?
 *
 * Decide si la Agenda está en el menú y si el catálogo online puede recibir
 * reservas. Veterinaria y Clínica la traen de fábrica; General la enciende
 * con `appointmentsEnabled`, porque la mayoría de las tiendas no agenda nada.
 *
 * El mismo criterio vive en el servidor, en functions/booking/publicAgenda.js:
 * la function pública no puede importar esto, así que si cambia acá, cambia
 * allá. Antes estaba copiado en el Sidebar y en Configuración > Catálogo, y
 * el modo Clínica lo habría tenido que agregar en tres lugares.
 *
 * @param {string} businessMode
 * @param {object} [businessSettings]
 * @returns {boolean}
 */
export const atiendeConCita = (businessMode, businessSettings) =>
  businessMode === 'veterinary' ||
  businessMode === 'clinic' ||
  (businessMode === 'retail' && businessSettings?.appointmentsEnabled === true)

/**
 * ¿Este rubro RECUERDA sus servicios? El baño al mes, la limpieza facial a
 * los treinta días. Gobierna el plazo por defecto de Configuración > Punto de
 * venta y el campo "Recordar servicio (días)" de la ficha del producto: los
 * dos alimentan la pantalla de Recordatorios, que solo está en estos menús.
 *
 * @param {string} businessMode
 * @returns {boolean}
 */
export const recuerdaServicios = (businessMode) =>
  businessMode === 'veterinary' || businessMode === 'clinic'

/**
 * ¿Este negocio lleva FICHA DE ATENCIÓN en el cliente? (alergias, antecedentes
 * e historial de visitas). En Clínica viene de fábrica; General la enciende
 * con "Ficha de atención en el cliente" (Configuración > Punto de venta), que
 * es como la usaban podólogas y consultorios antes de que existiera el modo.
 *
 * @param {string} businessMode
 * @param {object} [businessSettings]
 * @returns {boolean}
 */
export const tieneFichaDeAtencion = (businessMode, businessSettings) =>
  businessMode === 'clinic' || businessSettings?.posCustomFields?.showServiceCardFields === true
