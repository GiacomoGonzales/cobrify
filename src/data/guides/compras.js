/**
 * GUÍA DE USO: Compras
 *
 * Nombres verificados contra src/pages/Purchases.jsx y CreatePurchase.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'compras',
  actualizado: '12/08/2026',
  intro:
    'Compras es por donde entra la mercadería: registras lo que le compraste a tu proveedor y el sistema suma el stock y actualiza el costo de cada producto. Es lo que hace que después tus reportes de utilidad digan la verdad.',

  sections: [
    {
      id: 'registrar',
      title: 'Registrar una compra',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Presiona **Nueva Compra**.',
            'Elige el **proveedor** (o créalo en el momento con su RUC).',
            'Indica el tipo de documento (Factura, Boleta, Ticket) y su número.',
            'Agrega los **Items de Compra**: producto, cantidad y costo.',
            'Elige si la compra es **Al Contado** o **Al Crédito**.',
            'Presiona **Guardar Compra**: el stock sube y el costo se actualiza.',
          ],
        },
        { type: 'ui', kind: 'boton', label: 'Nueva Compra' },
        {
          type: 'consejo',
          text: 'Puedes cargar el costo **con IGV** o **sin IGV** (**Costo c/IGV** y **Costo s/IGV**): escribe el que tengas a mano en la factura y el sistema calcula el otro.',
        },
      ],
    },

    {
      id: 'importar-xml',
      title: 'Importar la factura del proveedor (XML)',
      blocks: [
        {
          type: 'texto',
          text: 'Si tu proveedor te manda el **XML** de su factura electrónica, no hace falta tipear nada: usa **Importar XML** y el sistema lee el documento, carga los productos, cantidades y costos, y los empareja con tu catálogo.',
        },
        {
          type: 'texto',
          text: 'La primera vez tendrás que decirle a qué producto tuyo corresponde cada línea del proveedor. El sistema **aprende ese emparejamiento**: la próxima compra de ese proveedor ya viene resuelta.',
        },
        {
          type: 'texto',
          text: 'Las líneas que el proveedor factura como **servicio** se marcan solas para entrar sin crear producto (dice "Servicio: entra a la compra sin crear producto"). Si igual quieres tenerlo en tu catálogo, ahí mismo puedes elegir **Crear producto**.',
        },
        {
          type: 'consejo',
          text: 'Es la forma más rápida y con menos errores de cargar compras grandes. Pídele el XML a tu proveedor, no solo el PDF.',
        },
      ],
    },

    {
      id: 'costo-y-stock',
      title: 'Cómo afecta al costo y al stock',
      blocks: [
        {
          type: 'texto',
          text: 'Cada compra suma unidades al almacén que elijas y recalcula el **costo promedio** del producto. Ese costo es el que usan los reportes de utilidad y margen.',
        },
        {
          type: 'texto',
          text: 'Si necesitas registrar una compra **sin tocar el inventario** (porque la mercadería ya la habías cargado a mano, o es un gasto que solo quieres documentar), marca **No afectar inventario (solo registro)**.',
        },
        {
          type: 'texto',
          text: 'Y si lo que compraste es **mobiliario o equipamiento** — un mostrador, un celular para atender, una congeladora — marca además **Es compra de activo o equipamiento**: la compra sale en tu Flujo de Caja (la plata salió de verdad) pero **no** se cuenta como Costo de Ventas en Rentabilidad. Sin esa marca, el reporte trataría el mostrador como mercadería vendida y tu margen del mes saldría hundido sin razón.',
        },
        {
          type: 'ojo',
          text: 'Eliminar una compra ya registrada usa **Eliminar y Revertir Stock**: además de borrarla, devuelve el inventario a como estaba. Ojo con hacerlo si esa mercadería ya se vendió.',
        },
      ],
    },

    {
      id: 'servicios',
      title: 'Comprar un servicio (sin crear el producto)',
      blocks: [
        {
          type: 'texto',
          text: 'La factura de una reparación, un flete o un mantenimiento no tiene productos que guardar en el catálogo. En la fila, presiona el botón **+** y elige **Producto personalizado**: escribes la descripción a mano y le pones cantidad y precio. Listo — no crea nada en tu catálogo.',
        },
        {
          type: 'texto',
          text: 'Esa línea no toca inventario: no suma stock, no cambia el costo promedio y no pide lote ni vencimiento. Pero sí suma al total, al IGV y al Registro de Compras, que es lo que necesita tu contador.',
        },
        {
          type: 'consejo',
          text: 'Como es por línea, una factura mixta se registra completa: los repuestos entran al inventario como productos normales y la mano de obra va como línea personalizada, todo en el mismo documento.',
        },
        {
          type: 'ojo',
          text: 'Si el servicio es **recurrente** — un mantenimiento mensual, por ejemplo — conviene sí tenerlo como producto: créalo con **No manejar stock** y márcalo como **Solo uso interno** para que no aparezca en el Punto de Venta. La línea personalizada es para lo que pasa una vez.',
        },
      ],
    },

    {
      id: 'presentaciones-lotes',
      title: 'Comprar por caja, con lote o con serie',
      blocks: [
        {
          type: 'texto',
          text: 'Si compras por **presentación** (una caja de 24), eliges la **Unidad de compra** y el sistema convierte a unidades sueltas solo: no tienes que multiplicar a mano.',
        },
        {
          type: 'texto',
          text: 'Para productos con control de lotes, cada línea admite su **N° Lote** y su **F. Vencimiento**. Para los que llevan serie, puedes cargar los **N° de Serie** de cada unidad, y junto a cada serie un **número secundario opcional** (el N° de motor de una moto, el segundo IMEI de un celular): viaja con la unidad, sale en el comprobante al venderla y también se puede buscar en el POS. En farmacia también está el campo de **Registro Sanitario**.',
        },
      ],
    },

    {
      id: 'cuentas-por-pagar',
      title: 'Cuentas por pagar',
      blocks: [
        {
          type: 'texto',
          text: 'Las compras al crédito quedan como **Por Pagar**. La vista **Cuentas por Pagar** te muestra cuánto le debes a cada proveedor, y **Por Proveedor** lo agrupa para que sepas a quién toca pagarle.',
        },
        {
          type: 'texto',
          text: 'A medida que abonas, registras los pagos y el saldo baja; el **Detalle de Abonos** guarda cada uno.',
        },
        {
          type: 'texto',
          text: 'Si el crédito se pactó **en cuotas**, al registrar la compra elige "En cuotas": defines cuántas son, cuándo vence la primera y cada cuántos días, y el sistema arma el **cronograma** (puedes ajustar monto y fecha de cada cuota antes de guardar). Cada cuota se paga desde la lista de compras, y el **Flujo de Caja** proyecta sus vencimientos — así sabes cuándo va a salir la plata, no solo cuánto debes.',
        },
        {
          type: 'consejo',
          text: 'Es el espejo de "Pagos Pendientes" de la página Ventas: uno es lo que te deben, este es lo que debes.',
        },
      ],
    },

    {
      id: 'dolares',
      title: 'Compras en dólares',
      blocks: [
        {
          type: 'texto',
          text: 'Puedes registrar la compra en **US$** con su tipo de cambio (hay un botón para traer el de la **SBS**). También puedes **fijar el precio de venta en dólares** del producto si es mercadería que manejas anclada al dólar.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Registro acá la luz, el alquiler o los sueldos?',
      a: 'No. Eso va en **Gastos**. Compras es solo para lo que suma stock: la mercadería que después vas a vender.',
    },
    {
      q: 'Registré una compra y el stock no subió.',
      a: 'Revisa si marcaste **No afectar inventario (solo registro)**, y confirma en qué almacén la cargaste: el stock entró ahí, no necesariamente en el que estás mirando.',
    },
    {
      q: 'El costo de mi producto cambió solo después de comprar.',
      a: 'Es correcto: el costo es un promedio y cada compra lo recalcula. Si compraste más caro que la vez pasada, el costo promedio sube y tu margen baja.',
    },
    {
      q: 'Me equivoqué en una compra ya guardada.',
      a: 'Puedes editarla, o eliminarla con **Eliminar y Revertir Stock** para que el inventario vuelva atrás. Si la mercadería ya se vendió, es preferible corregir con un ajuste de inventario en vez de revertir.',
    },
  ],
}
