/**
 * GUÍA DE USO: Proveedores
 *
 * Nombres verificados contra src/pages/Suppliers.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'proveedores',
  actualizado: '12/08/2026',
  intro:
    'Tu lista de proveedores: a quién le compras. Registrarlos una vez te ahorra escribir sus datos en cada compra y te permite ver cuánto le compras y cuánto le debes a cada uno.',

  sections: [
    {
      id: 'registrar',
      title: 'Registrar un proveedor',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Presiona **Nuevo Proveedor**.',
            'Escribe su **RUC** y busca: el sistema trae la **Razón Social** y la dirección desde SUNAT.',
            'Completa el **Contacto** y el teléfono si los tienes: son los datos que vas a necesitar cuando toque reclamar un pedido.',
            'Guarda.',
          ],
        },
        { type: 'ui', kind: 'boton', label: 'Nuevo Proveedor' },
        {
          type: 'consejo',
          text: 'También puedes crear el proveedor sobre la marcha desde la pantalla de Compras, sin pasar por acá.',
        },
      ],
    },

    {
      id: 'importar',
      title: 'Importar tu lista',
      blocks: [
        {
          type: 'texto',
          text: 'Si ya tienes tus proveedores en una hoja de cálculo, el botón **Importar** los sube de una vez en lugar de cargarlos uno por uno.',
        },
      ],
    },

    {
      id: 'para-que-sirve',
      title: 'Para qué te sirve tenerlos ordenados',
      blocks: [
        {
          type: 'texto',
          text: 'El proveedor conecta tres cosas: sus **compras** (todo lo que le has comprado), sus **cuentas por pagar** (lo que le debes) y sus **órdenes de compra** (lo que le pediste y aún no llega).',
        },
        {
          type: 'texto',
          text: 'Además, cuando importas una factura por XML, el sistema recuerda cómo se llaman los productos en el catálogo de ese proveedor, así que las siguientes importaciones son casi automáticas.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Es obligatorio registrar al proveedor antes de comprar?',
      a: 'No, puedes crearlo en el momento desde la compra. Registrarlo antes solo conviene para los habituales.',
    },
    {
      q: '¿Dónde veo todo lo que le compré a un proveedor?',
      a: 'En la página **Compras**, búscalo por su nombre y pon el período en el rango que quieras revisar.',
    },
    {
      q: 'Un proveedor cambió de razón social.',
      a: 'Edita su ficha. Las compras ya registradas conservan los datos con los que se emitieron, así que tu historial no se altera.',
    },
  ],
}
