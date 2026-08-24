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
          type: 'texto',
          text: 'La página se divide en tres pestañas: **Configuración** (tu enlace, textos, pedidos, contacto y qué se muestra), **Apariencia** (tema, color, logo, portada, diseño y promociones) y **Avanzado** (dominio propio y reservas). Todo se guarda con el mismo botón, desde cualquier pestaña.',
        },
        {
          type: 'texto',
          text: 'En **Apariencia > Tema visual** eliges el estilo: **Estándar** (limpio, sirve para todo), **Boutique** (serif elegante, moda), **Bold** (oscuro y contundente) y **Bauhaus** (geometría de bloques rojo, amarillo y azul; luce con pocas fotos pero muy buenas). La miniatura de cada tarjeta ya se dibuja con tus propias fotos y tu color.',
        },
        {
          type: 'texto',
          text: 'Cuando hay muchos productos puedes elegir cómo se cargan en **Paginación de productos** (tarjeta "Así se ve tu tienda"): mostrar todo de una, botón de **Cargar más**, **scroll infinito** (recomendado) o **páginas numeradas**.',
        },
        {
          type: 'texto',
          text: 'Al pie del catálogo va tu **información de contacto** (WhatsApp, teléfono, dirección y horario) y tus **redes sociales**. Configura Instagram, Facebook y TikTok en Configuración > Mi Catálogo Online > Cómo te compran > **Redes sociales**: escribe el usuario o pega el enlace.',
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

    {
      id: 'reservas',
      title: 'Citas y habitaciones: que reserven solos',
      blocks: [
        {
          type: 'texto',
          text: 'Además de vender productos, el catálogo puede recibir **reservas**. Ambas opciones viven en Configuración > Catálogo y están apagadas por defecto.',
        },
        {
          type: 'tabla',
          encabezados: ['Rubro', 'Qué hace', 'Cómo llega'],
          filas: [
            ['Veterinaria / General con agenda', 'El cliente elige un día y una hora libre y deja su nombre y teléfono.', 'La cita aparece sola en tu Agenda, ya reservada, con notificación.'],
            ['Hotel', 'El huésped elige fechas, ve las habitaciones libres con su tarifa y pide una.', 'Te llega como SOLICITUD: no bloquea la habitación hasta que la confirmes o rechaces en Reservas.'],
          ],
        },
        {
          type: 'ojo',
          text: 'La diferencia es a propósito: una cita ocupa media hora, pero una habitación bloqueada por alguien que nunca llega cuesta una noche entera. Por eso las citas se reservan solas y las habitaciones las apruebas tú.',
        },
        {
          type: 'consejo',
          text: 'En ningún caso el visitante ve datos de otros clientes: solo horas libres u ocupadas, y habitaciones con su tarifa.',
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
