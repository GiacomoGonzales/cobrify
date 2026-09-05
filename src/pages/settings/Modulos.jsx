/**
 * CONFIGURACIÓN > MÓDULOS — qué partes de la app existen para este negocio.
 *
 * Reemplaza a la pestaña "Preferencias". Acá vive lo que enciende o apaga
 * PARTES del sistema: el tipo de negocio, los módulos opcionales (Obras,
 * Préstamos, Cobranza de servicios, Guías de Remisión, Nota de Salida,
 * Descarga de stock), lo que cambia con más de una sucursal o más de un
 * precio, la moneda extranjera y el menú lateral. Lo que ajusta el
 * COMPORTAMIENTO de una parte (cómo vende el POS, qué imprime el ticket) está
 * en las otras pestañas.
 *
 * ── Un solo botón Guardar ───────────────────────────────────────────────────
 * Todo lo de esta pestaña se guarda junto, al pie, con `useGuardado`, y el
 * payload lleva SOLO estos campos. La excepción es el tamaño de la interfaz:
 * es de este dispositivo (localStorage), se aplica al elegirlo y no viaja a
 * Firestore.
 *
 * ── Estado: un objeto, inicializado desde `businessSettings` ────────────────
 * `businessSettings` es el documento `businesses/{id}` completo. Se lee en
 * `leerCampos` (con la misma normalización que hacía Settings.jsx) y se
 * re-sincroniza cuando cambia alguno de NUESTROS campos en el documento — no
 * cuando cambia el objeto, que en modo demo se construye nuevo en cada render
 * y haría un bucle infinito (ver el efecto más abajo).
 *
 * ── El menú lateral sale de UN catálogo ─────────────────────────────────────
 * `getMenuModuleGroups` (src/data/sidebarMenuModules.js) es la única fuente.
 * Antes el catálogo estaba escrito siete veces dentro de Settings.jsx, una
 * por modo, con un color distinto cada una.
 */
import { useState, useEffect } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useGuardado } from '@/components/settings/useGuardado'
import { Seccion, Ajuste, Campo, Fila, Nota, BarraGuardar, Separador } from '@/components/settings/kit'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { ESCALAS, leerEscala, aplicarEscala } from '@/utils/escalaInterfaz'
import { getMenuModuleGroups, tieneCatalogoDeMenu } from '@/data/sidebarMenuModules'

/**
 * Los campos de esta pestaña, leídos del documento del negocio con la misma
 * normalización que usaba Settings.jsx al cargar. Es también la lista
 * cerrada de lo que se guarda: nada que no esté acá sale en el payload.
 *
 * @param {object|null} settings  `businessSettings` del contexto
 * @param {string|null} modoEfectivo  `businessMode` del contexto
 */
function leerCampos(settings, modoEfectivo) {
  const d = settings || {}
  return {
    // Manda el modo del DOCUMENTO, no el efectivo del contexto: una sucursal
    // puede tener su propio modo y eso no se edita acá. El efectivo solo cubre
    // el demo, cuyos ajustes sintéticos no siempre traen el campo.
    businessMode: d.businessMode || modoEfectivo || 'retail',
    hiddenMenuItems: Array.isArray(d.hiddenMenuItems) ? d.hiddenMenuItems : [],
    appointmentsEnabled: d.appointmentsEnabled || false,
    obrasEnabled: d.obrasEnabled === true,
    lendingEnabled: d.lendingEnabled === true,
    serviciosEnabled: d.serviciosEnabled === true,
    servicioTituloRecibo: d.servicioTituloRecibo || '',
    servicioFirma: d.servicioFirma || '',
    servicioLema: d.servicioLema || '',
    dispatchGuidesEnabled: d.dispatchGuidesEnabled || false,
    exitNoteEnabled: d.exitNoteEnabled || false,
    stockDischargeEnabled: d.stockDischargeEnabled || false,
    branchPricingEnabled: d.branchPricingEnabled || false,
    branchCatalogEnabled: d.branchCatalogEnabled || false,
    // `?? true`: el mismo default que aplica AuthContext (encendido si nunca
    // se configuró). Con `|| false` el interruptor salía apagado mientras la
    // función seguía activa en el modal de productos.
    multiplePricesEnabled: d.multiplePricesEnabled ?? true,
    priceLabels: {
      price1: d.priceLabels?.price1 || 'Público',
      price2: d.priceLabels?.price2 || 'Mayorista',
      price3: d.priceLabels?.price3 || 'VIP',
      price4: d.priceLabels?.price4 || 'Especial',
    },
    multiCurrencyEnabled: d.multiCurrencyEnabled === true,
    defaultCurrency: d.defaultCurrency === 'USD' ? 'USD' : 'PEN',
    reportsCurrency: d.reportsCurrency === 'USD' ? 'USD' : 'PEN',
  }
}

const NIVELES_DE_PRECIO = [
  { key: 'price1', n: 1, ph: 'Público' },
  { key: 'price2', n: 2, ph: 'Mayorista' },
  { key: 'price3', n: 3, ph: 'VIP' },
  { key: 'price4', n: 4, ph: 'Especial' },
]

export default function Modulos() {
  const { businessSettings, businessMode, isDemoMode } = useAppContext()
  const { guardar, guardando } = useGuardado()

  // Tamaño de la interfaz. Por DISPOSITIVO (localStorage), no por negocio: es
  // la vista de una persona, no una preferencia de la empresa. Por eso no
  // entra en el payload — se aplica y se guarda al elegirlo.
  const [escalaUi, setEscalaUi] = useState(leerEscala)

  const [ajustes, setAjustes] = useState(() => leerCampos(businessSettings, businessMode))

  // Re-sincronización con el documento. La dependencia es la FIRMA (los
  // campos serializados) y no `businessSettings`: en modo demo el contexto
  // arma ese objeto nuevo en cada render, y un efecto que dependiera de él
  // haría setState → render → objeto nuevo → efecto… sin fin. Con la firma el
  // efecto corre solo cuando cambia de verdad alguno de nuestros campos; el
  // corte por demo es la segunda traba, por si algún demo trajera valores que
  // no serializan igual dos veces. Todos los campos son JSON puros, así que
  // parsear la firma devuelve exactamente lo que `leerCampos` calculó.
  const firma = JSON.stringify(leerCampos(businessSettings, businessMode))
  useEffect(() => {
    if (isDemoMode) return
    setAjustes(JSON.parse(firma))
  }, [firma, isDemoMode])

  const poner = (campo, valor) => setAjustes(prev => ({ ...prev, [campo]: valor }))

  const modo = ajustes.businessMode

  // El catálogo del menú para el modo ELEGIDO en el selector (aunque todavía
  // no esté guardado), con las páginas de Obras y Servicios solo si el módulo
  // está encendido.
  const grupos = getMenuModuleGroups(modo, {
    obrasEnabled: ajustes.obrasEnabled,
    serviciosEnabled: ajustes.serviciosEnabled,
  })

  /** ¿Se ve este ítem del menú? */
  const itemVisible = (item) => (
    item.flag ? ajustes[item.flag] === true : !ajustes.hiddenMenuItems.includes(item.id)
  )

  /**
   * Marca o desmarca un ítem del menú. La lista de ocultos funciona por
   * exclusión (todo visible salvo lo desmarcado), así que un ítem que NACE
   * apagado — la Agenda de Citas de General — no puede vivir ahí: su casilla
   * escribe el flag que lo gobierna (`appointmentsEnabled`) en vez de la
   * lista. Un solo control, que es lo que el usuario espera al ver una sola
   * casilla. El flag tiene que ser un campo de esta pestaña: si el catálogo
   * trajera otro, guardarlo sería escribir un campo ajeno.
   */
  const alternarItem = (item, visible) => {
    if (item.flag) {
      if (!Object.prototype.hasOwnProperty.call(ajustes, item.flag)) {
        console.warn(`El catálogo del menú pide el flag "${item.flag}", que no es de esta pestaña`)
        return
      }
      poner(item.flag, visible)
      return
    }
    setAjustes(prev => ({
      ...prev,
      hiddenMenuItems: visible
        ? prev.hiddenMenuItems.filter(i => i !== item.id)
        : [...prev.hiddenMenuItems, item.id],
    }))
  }

  const guardarModulos = () => guardar({ ...ajustes }, 'Módulos guardados')

  return (
    <div className="space-y-6">
      {/* Va PRIMERO a propósito: quien lo necesita es justamente quien más le
          cuesta encontrarlo. */}
      <Seccion
        id="tamano-interfaz"
        titulo="Tamaño de la interfaz"
        descripcion="Solo en este dispositivo. Agranda el texto y todo lo demás si te cuesta leer la pantalla: se aplica al momento y no necesita Guardar."
      >
        <div className="flex flex-wrap gap-2">
          {ESCALAS.map(escala => (
            <Button
              key={escala.id}
              size="sm"
              variant={escalaUi === escala.id ? 'primary' : 'outline'}
              onClick={() => setEscalaUi(aplicarEscala(escala.id))}
              // Cada botón se muestra en su propio tamaño, para elegir viendo.
              style={{ fontSize: `${escala.factor}rem` }}
            >
              {escala.nombre}
            </Button>
          ))}
        </div>
      </Seccion>

      <Separador />

      <Seccion
        titulo="Tipo de negocio"
        descripcion="Selecciona el modo que mejor se adapte a tu negocio. Esto cambiará las opciones del menú lateral."
      >
        <Campo
          id="opcion-businessMode"
          etiqueta="Modo"
          ayuda="El catálogo del menú de abajo cambia al elegirlo; nada se aplica hasta Guardar."
        >
          <Select value={modo} onChange={(e) => poner('businessMode', e.target.value)}>
            <option value="retail">General (todo tipo de negocio) — POS, productos, inventario, almacenes, compras</option>
            <option value="restaurant">Restaurante — Mesas, mozos, órdenes, cocina, menú, caja</option>
            <option value="pharmacy">Farmacia — Medicamentos, laboratorios, lotes, alertas de vencimiento</option>
            <option value="veterinary">Veterinaria — Pacientes, servicios, medicamentos, control de lotes</option>
            <option value="clinic">Clínica — Agenda de citas, pacientes, tratamientos y reservas online (estética, dental, consultorio)</option>
            <option value="lending">Préstamos — Cartera de préstamos a clientes, cuotas e intereses</option>
            <option value="hotel">Hotelería — Habitaciones, reservas, check-in/out, housekeeping</option>
            <option value="transport">Transporte — Vehículos, rutas, servicios de transporte</option>
            <option value="logistics">Logística — Proyectos/obras, salidas y retornos de almacén, reportes</option>
          </Select>
        </Campo>
      </Seccion>

      <Separador />

      <Seccion
        titulo="Módulos opcionales"
        descripcion="Partes de la app que vienen apagadas y se encienden solo si tu negocio las usa."
      >
        {/* Obras y proyectos. Son las páginas del modo Logística ofrecidas
            como módulo: migrar de modo haría perder GRE Transportista,
            Cotizaciones y Emisión Masiva. */}
        {modo === 'retail' && (
          <Ajuste
            id="opcion-obrasEnabled"
            checked={ajustes.obrasEnabled}
            onChange={(e) => poner('obrasEnabled', e.target.checked)}
            titulo="Obras y proyectos"
            descripcion={ajustes.obrasEnabled
              ? 'Habilitado: en el menú aparece el grupo "Obras", con Proyectos / Obras, Salidas de Almacén, Retornos a Almacén y Reportes de Obra. Sirve para controlar qué material sale a cada obra, qué vuelve y cuánto costó — sin cambiar tu modo de negocio.'
              : 'Deshabilitado: no se muestran las páginas de obras. Actívalo si envías materiales o herramientas a obras, proyectos o sedes de tus clientes.'}
          />
        )}

        {/* Préstamos a clientes. Es la cartera del modo Préstamos ofrecida
            como módulo: cambiar de modo le apagaría al restaurante Mesas,
            Órdenes y Cocina. */}
        {modo === 'restaurant' && (
          <Ajuste
            id="opcion-lendingEnabled"
            checked={ajustes.lendingEnabled}
            onChange={(e) => poner('lendingEnabled', e.target.checked)}
            titulo="Préstamos a clientes"
            descripcion={ajustes.lendingEnabled
              ? 'Habilitado: en Reportes & Finanzas aparece "Préstamos", para prestar dinero a tus clientes y cobrar en cuotas con intereses y mora. No cambia tu modo de negocio: Mesas, Órdenes y Cocina siguen igual.'
              : 'Deshabilitado: no se muestra la página de Préstamos. Actívalo si le prestas dinero a tus clientes y quieres llevar las cuotas, los intereses y la mora.'}
          />
        )}

        {/* Cobranza de servicios por medidor. Para el negocio que compra un
            recibo mayorista de luz o agua y lo reparte entre los vecinos de
            un centro poblado: sigue siendo un negocio General, solo suma las
            páginas de la cobranza. Los tres textos del recibo van debajo del
            interruptor, fuera del <label> del Ajuste, para que escribir en
            ellos no marque ni desmarque la casilla. */}
        {modo === 'retail' && (
          <>
            <Ajuste
              id="opcion-serviciosEnabled"
              checked={ajustes.serviciosEnabled}
              onChange={(e) => poner('serviciosEnabled', e.target.checked)}
              titulo="Cobranza de servicios (luz, agua)"
              descripcion={ajustes.serviciosEnabled
                ? 'Habilitado: en el menú aparecen Suministros, Lecturas del mes y Recibos de servicio. La tarifa sale del recibo que te llega a ti, así que se actualiza sola cada mes.'
                : 'Deshabilitado: no se muestran las páginas de cobranza de servicios. Actívalo si compras un recibo de luz o agua y lo repartes entre los vecinos, por medidor o por cuota fija.'}
            />
            {ajustes.serviciosEnabled && (
              <div className="pl-1 space-y-3">
                <p className="text-sm font-medium text-gray-700">Lo que sale impreso en el recibo</p>
                <Campo etiqueta="Título del recibo">
                  <Input
                    value={ajustes.servicioTituloRecibo}
                    onChange={(e) => poner('servicioTituloRecibo', e.target.value)}
                    placeholder="RECIBO POR CONSUMO DE ENERGÍA ELÉCTRICA"
                  />
                </Campo>
                <Campo
                  etiqueta="Firma autorizada"
                  ayuda="Sale al pie, sobre una línea. Es el nombre del responsable, no una firma electrónica."
                >
                  <Input
                    value={ajustes.servicioFirma}
                    onChange={(e) => poner('servicioFirma', e.target.value)}
                    placeholder="PROF. VICTOR"
                  />
                </Campo>
                <Campo etiqueta="Frase del pie">
                  <Input
                    value={ajustes.servicioLema}
                    onChange={(e) => poner('servicioLema', e.target.value)}
                    placeholder="Mi negocio es pequeño, pero tu recomendación lo hace grande"
                  />
                </Campo>
              </div>
            )}
          </>
        )}

        <Ajuste
          id="opcion-dispatchGuidesEnabled"
          checked={ajustes.dispatchGuidesEnabled}
          onChange={(e) => poner('dispatchGuidesEnabled', e.target.checked)}
          titulo="Guías de Remisión Electrónicas"
          descripcion={ajustes.dispatchGuidesEnabled
            ? 'Habilitado: Podrás generar guías de remisión electrónicas (GRE) desde tus comprobantes. Ideal para negocios que realizan envíos o traslados de mercadería.'
            : 'Deshabilitado: No se mostrará la opción de generar guías de remisión en tus comprobantes.'}
        />

        <Ajuste
          id="opcion-exitNoteEnabled"
          checked={ajustes.exitNoteEnabled}
          onChange={(e) => poner('exitNoteEnabled', e.target.checked)}
          titulo="Nota de Salida (Almacén)"
          descripcion={ajustes.exitNoteEnabled
            ? 'Habilitado: Podrás generar notas de salida desde tus comprobantes. Muestra solo cantidades sin precios, ideal para el encargado de almacén.'
            : 'Deshabilitado: No se mostrará la opción de generar notas de salida en tus comprobantes.'}
        />

        <Ajuste
          id="opcion-stockDischargeEnabled"
          checked={ajustes.stockDischargeEnabled}
          onChange={(e) => poner('stockDischargeEnabled', e.target.checked)}
          titulo="Descarga de stock (traslado masivo)"
          descripcion={ajustes.stockDischargeEnabled
            ? 'Habilitado: En Inventario > Traslado Masivo aparecerá la opción "Descarga de stock", que descuenta el stock de un almacén SIN enviarlo a otro (para descartar mercadería). Queda registrado como movimiento auditable.'
            : 'Deshabilitado: El traslado masivo solo mueve stock de un almacén a otro.'}
        />
      </Seccion>

      <Separador />

      <Seccion
        titulo="Sucursales y precios"
        descripcion="Lo que cambia cuando el negocio vende en más de un local o a más de un precio."
      >
        <Ajuste
          id="opcion-branchPricingEnabled"
          checked={ajustes.branchPricingEnabled}
          onChange={(e) => poner('branchPricingEnabled', e.target.checked)}
          titulo="Precios de venta por sucursal"
          descripcion={ajustes.branchPricingEnabled
            ? 'Habilitado: al editar un producto verás la sección "Precios por sucursal". El POS usará el precio de la sucursal en la que estás vendiendo; si el producto no tiene precio para esa sucursal, usa el precio general. La Sucursal Principal siempre usa el precio general.'
            : 'Deshabilitado: todos los locales venden con el mismo precio (el precio general del producto).'}
        />

        <Ajuste
          id="opcion-branchCatalogEnabled"
          checked={ajustes.branchCatalogEnabled}
          onChange={(e) => poner('branchCatalogEnabled', e.target.checked)}
          titulo="Catálogo de productos por sucursal"
          descripcion={ajustes.branchCatalogEnabled
            ? 'Habilitado: al crear o editar un producto podrás elegir en qué sucursales está disponible. El Punto de Venta mostrará solo los productos de la sucursal activa. Los productos que ya tienes siguen disponibles en todas hasta que los cambies, y una sucursal nueva hereda todo el catálogo.'
            : 'Deshabilitado: todas las sucursales venden el mismo catálogo completo.'}
        />

        {/* Niveles de precio: activarlos y cómo se llaman. El CÁLCULO
            automático (base, fórmula y porcentajes) vive en Productos >
            Ajuste de precios, junto al ajuste masivo, y esta pestaña no lo
            escribe: si lo hiciera desde su estado en memoria, guardar
            cualquier otra opción pisaría lo configurado allá. */}
        <Ajuste
          id="opcion-multiplePricesEnabled"
          checked={ajustes.multiplePricesEnabled}
          onChange={(e) => poner('multiplePricesEnabled', e.target.checked)}
          titulo="Usar varios precios por producto"
          descripcion={ajustes.multiplePricesEnabled
            ? 'Habilitado: además del precio principal, cada producto puede tener hasta 3 precios más (mayorista, cliente frecuente…). El cajero elige cuál usar al vender.'
            : 'Deshabilitado: cada producto tiene un solo precio de venta.'}
        />
        {ajustes.multiplePricesEnabled && (
          <div className="pl-1 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Nombre de cada nivel</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                Así los verás en el punto de venta, en el formulario del producto y en
                Productos → Actualizar precios.
              </p>
            </div>
            <Fila>
              {NIVELES_DE_PRECIO.map(({ key, n, ph }) => (
                <Campo key={key} etiqueta={`Precio ${n}`}>
                  <Input
                    value={ajustes.priceLabels[key] || ''}
                    onChange={(e) => poner('priceLabels', { ...ajustes.priceLabels, [key]: e.target.value })}
                    placeholder={ph}
                  />
                </Campo>
              ))}
            </Fila>
            <p className="text-xs text-gray-500 leading-relaxed">
              El cálculo automático por porcentaje se configura en Productos → Actualizar
              precios → Ajuste de precios.
            </p>
          </div>
        )}
      </Seccion>

      <Separador />

      {/* Multi-divisa (USD). Apagado por defecto: la mayoría de los negocios
          solo opera en soles. */}
      <Seccion
        titulo="Moneda extranjera (USD)"
        descripcion={(
          <>
            Para negocios que compran o venden en <strong>dólares</strong>. Al activarlo:
            cada producto puede tener su precio en <strong>S/ o en $</strong> (selector en el
            formulario del producto), las compras se registran en la moneda de la factura
            del proveedor (guardando el costo también en dólares), y las ventas, cotizaciones
            y facturas pueden emitirse en $. <strong>La contabilidad y SUNAT siguen en Soles</strong>:
            cada documento en dólares guarda su tipo de cambio del día y se convierte solo.
            Función en beta.
          </>
        )}
      >
        <Ajuste
          id="opcion-multiCurrencyEnabled"
          checked={ajustes.multiCurrencyEnabled}
          onChange={(e) => poner('multiCurrencyEnabled', e.target.checked)}
          titulo="Activar soporte multi-divisa"
          descripcion={ajustes.multiCurrencyEnabled
            ? 'Activado: verás el selector S/ | $ en el precio de los productos, la moneda en compras/cotizaciones/facturas, y el inventario mostrará su equivalente en dólares. Puedes emitir en Soles o Dólares: SUNAT admite ambas monedas en boletas y facturas.'
            : 'Desactivado: todo el sistema opera 100% en Soles (PEN), como hasta ahora. Puedes emitir en Soles o Dólares: SUNAT admite ambas monedas en boletas y facturas.'}
        />
        {ajustes.multiCurrencyEnabled && (
          <div className="pl-1 space-y-3">
            <Fila>
              <Campo
                id="opcion-defaultCurrency"
                etiqueta="Moneda por defecto al emitir documentos"
                ayuda="Esta es la moneda preseleccionada al abrir el formulario. El usuario podrá cambiarla por documento."
              >
                <Select value={ajustes.defaultCurrency} onChange={(e) => poner('defaultCurrency', e.target.value)}>
                  <option value="PEN">S/ Soles (PEN)</option>
                  <option value="USD">$ Dólares (USD)</option>
                </Select>
              </Campo>
              <Campo
                id="opcion-reportsCurrency"
                etiqueta="Moneda de reportes y dashboard"
                ayuda="En qué moneda se muestran el Dashboard, Reportes y la tarjeta de totales de Ventas. Es solo visualización: la base contable, los exports y los comprobantes a SUNAT siguen en Soles. Si eliges Dólares, los montos se convierten usando el tipo de cambio de referencia de tus ventas USD recientes."
              >
                <Select value={ajustes.reportsCurrency} onChange={(e) => poner('reportsCurrency', e.target.value)}>
                  <option value="PEN">S/ Soles (PEN)</option>
                  <option value="USD">$ Dólares (USD)</option>
                </Select>
              </Campo>
            </Fila>
            <Nota titulo="¿Cómo funciona?">
              Cuando emitas una factura o compra en USD, el sistema obtiene el tipo de cambio
              del día (SBS) y lo congela en el documento. Reportes y agregaciones siempre se
              calculan en Soles usando ese TC congelado, así que tus reportes históricos nunca
              cambian aunque suba el dólar.
            </Nota>
          </div>
        )}
      </Seccion>

      <Separador />

      <Seccion
        id="opcion-hiddenMenuItems"
        titulo="Menú lateral"
        descripcion="Elige qué módulos mostrar en tu menú lateral. Desmarca los que no uses para simplificar tu navegación."
      >
        {tieneCatalogoDeMenu(modo) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {grupos.flatMap((grupo, gi) => [
              grupo.title ? (
                <div key={`grupo-${gi}`} className="sm:col-span-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">{grupo.title}</h3>
                </div>
              ) : null,
              ...grupo.items.map((item) => (
                <Ajuste
                  key={item.id}
                  // El ítem gobernado por un flag lleva el ancla del flag, para
                  // que el manual pueda enlazarlo como a cualquier opción.
                  id={item.flag ? `opcion-${item.flag}` : `menu-${item.id}`}
                  checked={itemVisible(item)}
                  onChange={(e) => alternarItem(item, e.target.checked)}
                  titulo={item.label}
                  descripcion={item.description}
                />
              )),
            ].filter(Boolean))}
          </div>
        ) : (
          <Nota>Este tipo de negocio no tiene módulos que se puedan ocultar del menú.</Nota>
        )}
        <p className="text-xs text-gray-500 leading-relaxed">
          Los módulos principales (Dashboard, POS, Ventas, Clientes, Productos, Configuración)
          siempre estarán visibles.
        </p>
      </Seccion>

      <BarraGuardar onClick={guardarModulos} guardando={guardando} />
    </div>
  )
}
