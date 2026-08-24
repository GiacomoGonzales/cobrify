/**
 * GUÍA DE USO: Envíos
 *
 * Nombres verificados contra src/pages/Envios.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'envios',
  actualizado: '24/08/2026',
  intro:
    'Acá se reparte: a quién le tocó cada entrega, dónde queda, cuánto tiene que cobrar y cuánto rindió al final del día.',

  sections: [
    {
      id: 'repartidores',
      title: 'Registrar a tus repartidores',
      blocks: [
        {
          type: 'texto',
          text: 'En la pestaña **Motoristas** das de alta a cada repartidor con su vehículo, placa y cómo le pagas: **por entrega** (una tarifa fija por envío), **sueldo fijo** o una mezcla de ambos. De ahí salen sus ganancias del día sin que nadie las calcule a mano.',
        },
        {
          type: 'texto',
          text: 'El **estado operativo** (disponible, en ruta, descanso, desconectado) te dice de un vistazo a quién puedes mandarle el próximo pedido.',
        },
      ],
    },

    {
      id: 'asignar',
      title: 'Asignar un envío',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Presiona **Nuevo Envío** y busca la venta por su número o por el nombre del cliente.',
            'Elige al repartidor y, si cobras el delivery aparte, escribe cuánto.',
            'Marca si el pedido ya está pagado o si el repartidor tiene que **cobrar al entregar** — eso es lo que después se le pide en el arqueo.',
          ],
        },
        { type: 'ui', kind: 'boton', label: 'Nuevo Envío' },
      ],
    },

    {
      id: 'ubicacion',
      title: 'La dirección abre el mapa',
      blocks: [
        {
          type: 'texto',
          text: 'En la lista de envíos la dirección se **toca y abre Google Maps**. Si la venta vino de un pedido de tu catálogo online y el comprador marcó su ubicación con el botón de GPS, el mapa abre en el **punto exacto** que él marcó, no en una dirección aproximada. Es la diferencia entre encontrar la casa y dar vueltas por la cuadra.',
        },
        {
          type: 'texto',
          text: 'Si la venta se hizo a mano, o el comprador solo escribió su dirección, el mapa la busca como texto. Funciona igual, solo que con la precisión que tenga lo escrito.',
        },
        {
          type: 'ojo',
          text: 'La ubicación exacta solo viaja en las ventas que **nacieron de un pedido del catálogo**. Las ventas cargadas a mano en el Punto de Venta llevan la dirección escrita, no el punto en el mapa.',
        },
      ],
    },

    {
      id: 'whatsapp',
      title: 'Mandarle el envío al repartidor por WhatsApp',
      blocks: [
        {
          type: 'texto',
          text: 'En cada envío de la lista hay un botón de **WhatsApp**. Lo tocas y se abre el chat con el mensaje ya escrito: a nombre de quién va, su teléfono, la dirección con el **enlace de Google Maps**, qué lleva el pedido y cuánto tiene que cobrar.',
        },
        {
          type: 'texto',
          text: 'El mensaje sale dirigido al **repartidor asignado**, usando el teléfono de su ficha en la pestaña Motoristas. Si no tiene teléfono cargado, WhatsApp te pregunta a quién mandárselo — así también puedes reenviárselo al cliente o a otra persona.',
        },
        {
          type: 'consejo',
          text: 'El repartidor toca el enlace del mapa desde su celular y le arranca la navegación. No necesita entrar al sistema ni tener usuario.',
        },
        {
          type: 'ojo',
          text: 'Lo que lleva el pedido se guarda **al crear el envío**. Si después editas la venta, el envío conserva la lista con la que salió el repartidor. Los envíos creados antes de esta función no tienen el detalle: el mensaje sale igual, pero sin la lista de productos.',
        },
      ],
    },

    {
      id: 'repartidor-app',
      title: 'Que el repartidor vea su ruta desde su celular',
      blocks: [
        {
          type: 'texto',
          text: 'Puedes darle al repartidor su propio acceso: crea un **usuario** para él y en su ficha elige el **Repartidor asignado**. Es lo mismo que asignarle un vendedor a un cajero.',
        },
        {
          type: 'pasos',
          items: [
            'Ve a **Usuarios** y crea el usuario del repartidor con su correo y contraseña.',
            'Dale acceso a la página **Envíos** en sus permisos.',
            'En **Repartidor asignado**, elige su ficha de motorista y guarda.',
          ],
        },
        {
          type: 'texto',
          text: 'Cuando entre, verá una sola pestaña — **Mis Envíos** — con las entregas que le asignaron y nada más: ni los envíos de sus compañeros, ni la administración de la flota, ni el arqueo. Toca la dirección y sale el mapa.',
        },
        {
          type: 'consejo',
          text: 'Deja **Sin asignar** a los usuarios de oficina: esos siguen viendo todos los envíos, como siempre.',
        },
        { type: 'enlace', to: '/app/usuarios', label: 'Ir a Usuarios' },
      ],
    },

    {
      id: 'arqueo',
      title: 'Arqueo: cuadrar el efectivo del día',
      blocks: [
        {
          type: 'texto',
          text: 'La pestaña **Arqueo** junta todo lo que cada repartidor cobró en efectivo y todavía no ha rendido. Eliges sus entregas, escribes cuánto entregó realmente y el sistema te muestra si cuadra o falta. Al cerrar, esas entregas quedan marcadas como rendidas y no vuelven a aparecer.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'La dirección no abre el mapa, ¿por qué?',
      a: 'Porque esa entrega no tiene dirección ni ubicación guardadas. Al crear el envío puedes escribir la dirección a mano en el campo que aparece al elegir la venta.',
    },
    {
      q: 'El repartidor ve todos los envíos, no solo los suyos',
      a: 'Su usuario no tiene **Repartidor asignado**. Ve a Usuarios, edítalo y elige su ficha de motorista en ese campo.',
    },
    {
      q: '¿Puedo asignar dos usuarios al mismo repartidor?',
      a: 'Sí, y ambos verán las mismas entregas. Sirve si el repartidor usa dos equipos, pero lo normal es un usuario por persona.',
    },
    {
      q: '¿El repartidor puede cambiar el estado de su entrega?',
      a: 'Sí: desde su lista marca cuando sale en ruta y cuando entregó. Eso es justamente lo que te deja seguir el pedido sin llamarlo.',
    },
  ],
}
