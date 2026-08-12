/**
 * GUÍA DE USO: Mi Catálogo Online
 *
 * OJO: no es una página propia — es la pestaña "catalogo" de Configuración.
 * Por eso se registra con `route: null` (solo manual), para no secuestrar el
 * panel de ayuda de Configuración.
 * Nombres verificados contra src/pages/Settings.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'catalogo-online',
  actualizado: '12/08/2026',
  intro:
    'Tu catálogo online es una tienda web que sale de los productos que ya tienes cargados. No hay que armarla aparte: se enciende, se comparte el enlace y tus clientes pueden ver precios y hacer pedidos.',

  sections: [
    {
      id: 'activar',
      title: 'Encenderlo y compartirlo',
      blocks: [
        {
          type: 'texto',
          text: 'Se configura en **Configuración > Mi Catálogo Online**. Ahí eliges tu dirección web, activas el catálogo y obtienes el enlace para compartir por WhatsApp o redes, además de un **código QR** para pegar en el local.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=catalogo',
          label: 'Abrir Mi Catálogo Online',
        },
        {
          type: 'consejo',
          text: 'El catálogo se alimenta solo de tus productos: si cambias un precio o subes una foto en **Productos**, el catálogo se actualiza sin que tengas que tocar nada más.',
        },
      ],
    },

    {
      id: 'que-se-muestra',
      title: 'Qué ven tus clientes',
      blocks: [
        {
          type: 'texto',
          text: 'Ven los productos que decidas mostrar, con su foto, precio y descripción. Puedes controlar si se muestran **todos los precios** (los niveles) o solo el público, y si el catálogo debe **ignorar el stock** o esconder lo agotado.',
        },
        {
          type: 'ojo',
          text: 'Los productos sin foto se ven pobres en el catálogo. Si vas a compartirlo con clientes, vale la pena subir imágenes al menos de lo que más vendes.',
        },
      ],
    },

    {
      id: 'pedidos',
      title: 'Recibir pedidos',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Activar recepción de pedidos** el catálogo deja de ser solo una vitrina: el cliente arma su pedido y te llega al sistema. Puedes habilitar **Permitir pedidos Delivery** y **Permitir pedidos Para Llevar** según lo que hagas.',
        },
        {
          type: 'texto',
          text: 'Cuando entra un pedido suena una alerta en la barra superior del sistema, estés en la pantalla que estés. Los pedidos se gestionan en **Pedidos Online** (o en **Órdenes** si eres restaurante).',
        },
      ],
    },

    {
      id: 'qr-mesas',
      title: 'Códigos QR por mesa',
      soloModos: ['restaurant'],
      blocks: [
        {
          type: 'texto',
          text: 'Puedes generar un **Código QR por Mesa**: el cliente lo escanea, ve la carta y pide desde su celular, y el pedido llega ya asociado a esa mesa.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿El catálogo tiene costo aparte o necesito una página web?',
      a: 'No. Viene incluido y usa tus mismos productos. Solo eliges tu dirección y lo activas.',
    },
    {
      q: 'Un producto no aparece en el catálogo.',
      a: 'Revisa que esté marcado para mostrarse en el catálogo, que esté activo y, si escondes lo agotado, que tenga stock. La opción **Ignorar stock en catálogo** muestra todo aunque esté en cero.',
    },
    {
      q: '¿Los pedidos del catálogo descuentan stock?',
      a: 'No al llegar: un pedido es una intención de compra. El stock se descuenta cuando lo conviertes en venta y emites el comprobante.',
    },
    {
      q: '¿Puedo mostrar el catálogo sin recibir pedidos?',
      a: 'Sí. Puedes usarlo solo como vitrina de precios y que te contacten por WhatsApp: la recepción de pedidos es una opción aparte.',
    },
  ],
}
