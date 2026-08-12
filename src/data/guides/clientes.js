/**
 * GUÍA DE USO: Clientes
 *
 * Nombres verificados contra src/pages/Customers.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'clientes',
  actualizado: '12/08/2026',
  intro:
    'Acá vive tu cartera: a quién le vendes, cuánto te ha comprado cada uno y quién te debe. Un cliente bien registrado se completa solo la próxima vez que le vendas.',

  sections: [
    {
      id: 'registrar',
      title: 'Registrar un cliente',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Presiona **Nuevo Cliente**.',
            'Escribe el **RUC** o **DNI** y toca el botón de búsqueda: el sistema consulta SUNAT/RENIEC y trae el nombre o razón social y la dirección.',
            'Completa lo que quieras tener a mano: dirección, correo, teléfono.',
            'Guarda. Desde ese momento aparece en el buscador de clientes del POS.',
          ],
        },
        { type: 'ui', kind: 'boton', label: 'Nuevo Cliente' },
        {
          type: 'consejo',
          text: 'No hace falta registrar a todos. Registra a los que repiten, a los que compran con factura y a los que compran al crédito: son los que te ahorran tiempo después.',
        },
      ],
    },

    {
      id: 'importar-exportar',
      title: 'Importar y exportar en Excel',
      blocks: [
        {
          type: 'texto',
          text: 'Si ya tienes tu cartera en una hoja de cálculo, **Importar Excel** la sube de una vez en lugar de cargarla cliente por cliente. **Exportar Excel** hace lo contrario: te baja la lista completa con lo que cada uno ha gastado.',
        },
        {
          type: 'ojo',
          text: 'Antes de importar, revisa que los documentos (RUC/DNI) estén bien: es el dato que identifica al cliente y el que va impreso en sus comprobantes.',
        },
      ],
    },

    {
      id: 'quien-debe',
      title: 'Ver quién te debe',
      blocks: [
        {
          type: 'texto',
          text: 'La columna **Por cobrar** muestra la deuda de cada cliente, y los filtros **Por vencer (7 días)** y **Vencidas** te dejan separar lo que está por caer de lo que ya se pasó de fecha.',
        },
        {
          type: 'consejo',
          text: 'Para trabajar la cobranza completa, el reporte **Pagos Pendientes** de la página Ventas agrupa todo lo que te deben por cliente, con sus comprobantes al detalle.',
        },
      ],
    },

    {
      id: 'ordenar',
      title: 'Ordenar y encontrar',
      blocks: [
        {
          type: 'texto',
          text: 'El buscador acepta **nombre, RUC o DNI**. Y el selector de orden te reordena la cartera según lo que estés buscando: **Ordenar por Nombre**, **Ordenar por Total Gastado**, **Ordenar por Pedidos** u **Ordenar por Vencimiento**.',
        },
        {
          type: 'consejo',
          text: 'Ordenar por Total Gastado es la forma rápida de ver quiénes son tus mejores clientes cuando quieres hacer una promoción dirigida.',
        },
      ],
    },

    {
      id: 'nivel-precio',
      title: 'Asignar un nivel de precio',
      requiereOpcion: {
        flag: 'multiplePricesEnabled',
        nombre: 'los niveles de precio',
        donde: 'Configuración',
        ruta: '/app/configuracion?tab=ventas',
        defaultOn: true,
      },
      blocks: [
        {
          type: 'texto',
          text: 'En la ficha del cliente puedes fijarle un **nivel de precio** (por ejemplo mayorista). A partir de ahí, cuando lo selecciones en el POS, sus productos se cargan directamente con ese precio: el cajero no tiene que acordarse ni elegirlo cada vez.',
        },
        {
          type: 'consejo',
          text: 'Es la forma de evitar el error clásico de cobrarle precio público a un mayorista en hora punta.',
        },
      ],
    },

    {
      id: 'campos-por-rubro',
      title: 'Datos según tu rubro',
      blocks: [
        {
          type: 'texto',
          text: 'La ficha se adapta a tu tipo de negocio. Una **veterinaria** registra las mascotas del cliente (nombre, especie, raza, peso, edad y notas). Un negocio de **transporte** guarda placa y modelo del vehículo. Una academia registra al alumno y su horario.',
        },
        {
          type: 'texto',
          text: 'Esos datos se usan después en las pantallas de tu rubro, así que vale la pena completarlos cuando registras al cliente.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'La búsqueda por RUC no trae los datos, ¿por qué?',
      a: 'Esa búsqueda consulta el padrón de SUNAT/RENIEC en el momento, así que necesita conexión. Si no responde, puedes escribir los datos a mano y guardar igual.',
    },
    {
      q: '¿Tengo que registrar al cliente antes de venderle?',
      a: 'No. En el POS puedes escribir el RUC o DNI directamente y el cliente queda guardado con esa venta. Registrarlo antes solo te ahorra tiempo si es alguien que vuelve.',
    },
    {
      q: 'Tengo el mismo cliente dos veces, ¿cómo lo arreglo?',
      a: 'Elimina el duplicado que no tenga ventas asociadas y deja el que sí las tiene, para no perder su historial de compras.',
    },
    {
      q: '¿Dónde veo todo lo que me compró un cliente?',
      a: 'En la página **Ventas**, escribe su nombre o RUC en el buscador y pon el período en **Todo**: ahí tienes su historial completo con montos y estados de pago.',
    },
  ],
}
