/**
 * GUÍA DE USO: Emisión Masiva
 *
 * Nombres verificados contra src/pages/BulkEmission.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'emision-masiva',
  actualizado: '19/08/2026',
  intro:
    'Para cuando tienes que emitir muchos documentos de una sola vez: los armas en un Excel con calma, el sistema los revisa todos, y nada sale a SUNAT hasta que confirmes. Tiene dos pestañas: Comprobantes y GRE Transportista.',

  sections: [
    {
      id: 'flujo',
      title: 'Cómo funciona',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Presiona **Descargar plantilla**: es un Excel con las columnas listas, desplegables para no equivocarse y filas de ejemplo en color ámbar.',
            'Llénalo: cada **fila es un producto o servicio**. Las filas que comparten el mismo **N° OPERACIÓN** forman UN solo comprobante (la 1,1,2 genera dos: el primero con dos ítems).',
            'Los datos del comprobante (tipo, fecha, cliente, forma de pago) van en la **primera fila** de cada operación; en las demás puedes dejarlos vacíos.',
            'Borra las filas de ejemplo en ámbar y presiona **Subir Excel**.',
            'Revisa la **vista previa**: cada operación sale con su total calculado y, si algo está mal, el error te dice la fila y la columna exactas del Excel.',
          ],
        },
        { type: 'ui', kind: 'boton', label: 'Descargar plantilla' },
        {
          type: 'ojo',
          text: 'La **serie y el número** de cada comprobante NO van en la plantilla: los asigna el sistema al emitir, igual que en el POS. Un Excel con correlativos escritos a mano es una fábrica de rechazos por "comprobante ya registrado".',
        },
      ],
    },

    {
      id: 'validaciones',
      title: 'Lo que el sistema revisa por ti',
      blocks: [
        {
          type: 'texto',
          text: 'Antes de emitir nada, cada operación pasa por el mismo filtro que una venta del POS: una **FACTURA exige RUC de 11 dígitos**; la **fecha** no puede ser futura ni tener más de 3 días (el plazo de envío de SUNAT); una **BONIFICACIÓN** necesita el valor referencial de lo que regalas; y una boleta **sin documento** solo pasa hasta S/ 700 — desde ahí SUNAT exige el DNI.',
        },
        {
          type: 'texto',
          text: 'Los problemas se muestran en dos niveles. Los **errores** (en rojo) bloquean: corriges el archivo y lo vuelves a subir. Los **avisos** (en ámbar) solo informan — por ejemplo, un código que no está en tu catálogo, o un producto al que no le alcanza el stock.',
        },
        {
          type: 'consejo',
          text: 'Si dejas la forma de pago vacía el sistema asume CONTADO en EFECTIVO y te lo avisa. Para ventas al CRÉDITO sí es obligatoria la fecha de vencimiento.',
        },
      ],
    },

    {
      id: 'detraccion-cuotas',
      title: 'Detracción, cuotas, vendedor y correo',
      blocks: [
        {
          type: 'texto',
          text: 'La plantilla trae las mismas opciones que usas en el POS. **DETRACCIÓN** (solo en facturas): elige el tipo de bien o servicio del desplegable y el sistema aplica la tasa del catálogo 54 de SUNAT. El depósito se calcula siempre **en soles y redondeado a soles enteros**, aunque la factura sea en dólares, porque es lo único que se puede depositar en el Banco de la Nación.',
        },
        {
          type: 'texto',
          text: 'La cuenta del Banco de la Nación puede ir en la columna **CTA. BANCO NACIÓN** o, si la dejas vacía, se usa la que tengas configurada en Ajustes → Cuentas bancarias con el tipo "detracciones". Sin ninguna de las dos, el sistema no te deja emitir.',
        },
        {
          type: 'texto',
          text: 'En ventas al **CRÉDITO** puedes repartir el pago en varias cuotas con la columna **CUOTAS**, escribiendo fecha y monto separados por dos puntos y cada cuota con punto y coma: `15/09/2026:700; 15/10/2026:550`. La suma tiene que dar el total y toda fecha debe ser **posterior** a la emisión: SUNAT rechaza una cuota que vence el mismo día. Si no pones cuotas, el vencimiento se emite como cuota única.',
        },
        {
          type: 'ojo',
          text: 'Cuando la factura tiene detracción, las cuotas reparten lo que el **cliente te paga** (el neto), no el total: el resto lo deposita él en el banco. La vista previa te muestra los dos números.',
        },
        {
          type: 'texto',
          text: '**VENDEDOR** acepta el código o el nombre de un vendedor ya registrado y sirve para las comisiones; si no coincide con ninguno, el sistema te lista los que sí tienes. **EMAIL CLIENTE** queda guardado en el comprobante para poder enviárselo después.',
        },
      ],
    },

    {
      id: 'stock',
      title: 'Cuándo descuenta stock',
      blocks: [
        {
          type: 'texto',
          text: 'La columna **CÓDIGO PRODUCTO** decide. Si el código coincide con un producto de tu catálogo (por SKU, código de barras o el código de una variante), la emisión **descuenta stock** — en la vista previa lo ves con la etiqueta verde. Si la dejas vacía, el ítem se emite igual pero no toca tu inventario.',
        },
        {
          type: 'ojo',
          text: 'Un código escrito con error de tipeo no bloquea la emisión: el sistema te lo avisa en ámbar ("no está en tu catálogo") para que decidas si lo corriges o lo dejas como ítem libre.',
        },
      ],
    },

    {
      id: 'gre-transportista',
      title: 'GRE Transportista en lote',
      blocks: [
        {
          type: 'texto',
          text: 'La pestaña **GRE Transportista** tiene el circuito completo: su propia plantilla (fechas, remitente, destinatario, ruta, vehículo, conductor y cargas), la vista previa con errores por fila, y el botón **Emitir** que manda el lote a SUNAT. Una guía con una sola carga es una sola fila del Excel.',
        },
        {
          type: 'pasos',
          items: [
            'Los **ubigeos se escriben con nombres**, separados por barras: LIMA/LIMA/SURQUILLO. El sistema los convierte al código oficial; si un nombre no calza, el error te dice exactamente cuál.',
            'La **placa** puede ir con o sin guion (ABC-123), y el **conductor** necesita DNI, nombres, apellidos y brevete.',
            'El **peso total en kilogramos** va solo en la primera fila de cada guía.',
            'Los tres códigos de la carga son opcionales: **CÓDIGO INTERNO** (el tuyo, el único que hoy viaja en el XML a SUNAT), **CÓD. SUNAT** y **GTIN** (se imprimen en la guía, todavía no se envían en el XML). Vacíos salen con un guion.',
            'Al presionar **Emitir**, las guías salen **una por una, con pausa entre envíos**, y ves el resultado de SUNAT al lado de cada una: aceptada, rechazada o con error.',
          ],
        },
        {
          type: 'consejo',
          text: 'Puedes emitir aunque el archivo tenga errores: solo salen las guías válidas, las demás no se tocan. Corriges el archivo, lo vuelves a subir y emites el resto — las que ya salieron **no se duplican**, el sistema las reconoce y las omite.',
        },
        {
          type: 'ojo',
          text: 'Si una guía se crea pero el envío falla (se cortó el internet, SUNAT no respondió), la guía queda en la pantalla **GRE Transportista** con su número asignado: reenvíala desde ahí con su botón, no vuelvas a subirla en el Excel.',
        },
        { type: 'enlace', to: '/app/guias-transportista', label: 'Ver GRE Transportista' },
      ],
    },

    {
      id: 'limites',
      title: 'Límites',
      blocks: [
        {
          type: 'texto',
          text: 'Hasta **500 operaciones** por archivo: si tienes más, divídelo. El **precio unitario va CON IGV incluido**, como los precios de tu POS. Y los totales de la vista previa son para que revises: los montos definitivos los arma el sistema al emitir, con las mismas reglas del POS.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Subí el archivo y no pasó nada, ¿se emitió algo?',
      a: 'No. Subir el archivo solo valida y te muestra la vista previa. En GRE Transportista, la emisión ocurre recién cuando presionas el botón Emitir y confirmas. En Comprobantes todavía no hay emisión: la vista previa deja tu archivo revisado y listo para cuando esa parte esté disponible.',
    },
    {
      q: 'Emití las guías y los códigos salen con un guion en el PDF',
      a: 'Esas tres columnas (CÓDIGO INTERNO, CÓD. SUNAT y GTIN) son opcionales y salen con guion si las dejas vacías en el Excel. Llénalas y las guías nuevas las mostrarán; las ya emitidas no cambian.',
    },
    {
      q: '¿Puedo usar mi propio Excel en vez de la plantilla?',
      a: 'No: el sistema lee las columnas en el orden exacto de la plantilla. Descárgala, llénala (puedes pegar datos desde tu archivo) y súbela sin cambiar el nombre de las hojas.',
    },
    {
      q: 'Corregí el archivo, ¿tengo que empezar de nuevo?',
      a: 'Solo guárdalo y presiona Subir de nuevo: la vista previa se rehace completa con la versión corregida.',
    },
    {
      q: '¿Por qué me rechaza fechas de hace una semana?',
      a: 'SUNAT solo acepta comprobantes enviados dentro del plazo (unos 3 días desde la emisión). Un comprobante más viejo sería rechazado igual, así que el sistema te lo corta antes de emitir.',
    },
  ],
}
