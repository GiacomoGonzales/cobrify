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
      id: 'direcciones-entrega',
      title: 'Direcciones de entrega',
      blocks: [
        {
          type: 'texto',
          text: 'La **Dirección** de la ficha es el domicilio fiscal: el que SUNAT tiene registrado y el que sale en sus comprobantes. Pero la mercadería muchas veces va a otro lado — su almacén, su tienda, una obra. Para eso está el bloque **Direcciones de entrega**.',
        },
        {
          type: 'pasos',
          items: [
            'Si el cliente tiene RUC, presiona **Traer de SUNAT**: se agregan sus locales anexos con dirección y distrito ya cargados.',
            'Si el punto de entrega no está registrado en SUNAT, usa **Agregar** y escríbelo a mano.',
            'Ponle un nombre corto a cada una (Almacén Central, Tienda Surco) para reconocerlas después.',
          ],
        },
        {
          type: 'texto',
          text: 'Al armar una guía de remisión para ese cliente aparecerá un desplegable con estas direcciones, y el punto de llegada se completa solo.',
        },
        {
          type: 'consejo',
          text: 'Guardar el **distrito** es lo que realmente ahorra trabajo. Es el dato que SUNAT lee de la guía, y es el que había que elegir a mano cada vez. Si una dirección quedó sin distrito, la ficha te lo avisa en ámbar.',
        },
        {
          type: 'texto',
          text: 'Traerlas de SUNAT una vez también te evita repetir esa consulta —que se paga— en cada guía, y hace que funcione sin internet.',
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
      id: 'fidelizacion',
      title: 'Fidelización: tarjeta de sellos y Google Wallet',
      blocks: [
        {
          type: 'texto',
          text: 'El botón **Fidelización** de arriba concentra todo el programa de sellos: el clásico "compra 10 y el siguiente va gratis". Activas el programa, defines cuántos sellos valen el premio, cuál es el premio y si los pedidos online también sellan.',
        },
        {
          type: 'texto',
          text: 'La tarjeta se identifica por el **teléfono del cliente**: el mismo cliente acumula compre en el mostrador o por tu catálogo online. Sin teléfono no hay tarjeta.',
        },
        {
          type: 'texto',
          text: 'Los sellos se ganan de dos maneras, y eliges la que le calza a tu negocio: **Por visita** (cada compra suma 1 sello — premia que el cliente vuelva: cafetería, barbería, restaurante) o **Por monto** (un sello por cada S/ X de compra — premia cuánto gasta: botica, ferretería, ropa). En el modo por monto puedes poner un tope de sellos por venta, y el vuelto no se arrastra: con sellos de S/ 20, una compra de S/ 50 da 2 sellos.',
        },
        {
          type: 'texto',
          text: 'El premio también se elige por tipo: **Producto gratis** (eliges cuál de tu catálogo), **Producto a precio especial** (el cliente accede a comprarlo a un precio de canje), **Descuento en la compra** (porcentaje o monto), u **Otro** en texto libre para premios que no viven en el sistema ("una clase gratis"). Con los tres primeros, el canje se aplica solo en el Punto de Venta; con texto libre el canje es manual.',
        },
        {
          type: 'pasos',
          items: [
            'Activa **Programa activado**, elige cómo se ganan los sellos, la meta y el tipo de premio.',
            'Si quieres, pon una fecha en **Válido hasta**: pasada esa fecha no se suman sellos ni se canjean premios. Sirve para que una promoción no se vuelva eterna y nadie aparezca años después con una tarjeta llena. La fecha se imprime en la tarjeta del cliente, así que la regla queda clara desde el primer día. Déjalo vacío y el programa no vence.',
            'La otra forma de ponerle plazo es **Los sellos vencen a los (meses)**: cada sello muere a los X meses de ganado, uno por uno, en vez de todos en una fecha común. Es más justo — al cliente que recién empieza su reloj le arranca el día que compra — y empuja a volver, porque en su tarjeta ve cuándo vencen los suyos. Al canjear se usan primero los sellos más viejos. Con 0 no vencen.',
            'Elige un **tema** para la tarjeta: la ves pintada con tu logo antes de decidir. Puedes ajustar el color exacto.',
            'Elige la **portada**: la **Cuadrícula de sellos** dibuja los sellos del cliente como casilleros (llenos con check, vacíos punteados y el último con el regalo) y se redibuja sola en cada compra — con ella el contador sale en número, porque el progreso ya está dibujado. **Tu logo** pone tu logo como franja, y **Color plano** la deja sobria. La vista previa te muestra la tarjeta tal como queda.',
            'Con la cuadrícula también eliges **tu sello**: el icono que se estampa en los casilleros llenos (check, estrella, corazón, taza, pizza, hamburguesa, huella, tijeras, cruz o polo).',
            'Si quieres, escribe un **mensaje** ("Gracias por tu preferencia..."): sale como una fila más en la tarjeta, con el nombre de tu negocio de título.',
            'Deja marcado **Aparecer cuando el cliente esté cerca** si quieres que la tarjeta asome sola en el celular del cliente al pasar por tu local.',
            'Guarda. Desde ese momento cada venta con teléfono suma su sello.',
          ],
        },
        {
          type: 'texto',
          text: 'La tarjeta vive en **Google Wallet**, en el celular del cliente, y se actualiza sola con cada compra: ve sus sellos como puntos llenos y vacíos, cuántos le faltan y cuál es su premio. Se la envías por WhatsApp con el botón de la lista de tarjetas, o desde el POS.',
        },
        {
          type: 'texto',
          text: 'En la misma ventana ves las **tarjetas de todos tus clientes** con sus sellos y canjes. Cuando alguien llega a la meta, aparece el botón **Canjear**: descuenta la meta de sellos (si tenía 12 y la meta es 10, le quedan 2) y deja el registro.',
        },
        {
          type: 'texto',
          text: 'El mejor lugar para canjear es el **Punto de Venta**: al seleccionar al cliente, el recuadro ámbar avisa "Premio disponible" y el botón **Canjear** aplica el premio a la venta en curso — agrega el producto gratis como bonificación, lo agrega a su precio especial, o llena el descuento. Los sellos se descuentan recién **al cobrar**: si la venta se cancela, el cliente no pierde nada. Puedes quitar el premio aplicado con el botón **Quitar** antes de cobrar.',
        },
        {
          type: 'texto',
          text: 'Y para que los clientes se registren **solos**, la misma ventana te da el **QR de mesa**: un código para imprimir y poner en tus mesas o en el mostrador. El cliente lo escanea desde su celular, llena un formulario con tus colores y tu logo (nombre, celular, y si quiere DNI, cumpleaños y correo), y al terminar recibe su tarjeta de sellos lista para agregar a Google Wallet o Apple Wallet. Queda registrado en tu lista de clientes, con su cumpleaños para tus promociones.',
        },
        {
          type: 'pasos',
          items: [
            'En la sección **Registro de clientes (QR de mesa)**, decide el gancho: **Sellos de regalo al registrarse** (0 a 5) y/o un **texto libre** ("Regístrate y participa del sorteo mensual"). Ambos son opcionales.',
            'Guarda, y luego usa **Descargar QR** para imprimirlo o **Copiar link** para compartirlo por WhatsApp o redes.',
          ],
        },
        {
          type: 'consejo',
          text: 'El sello de regalo es el gancho que mejor funciona: el cliente empieza con la tarjeta ya avanzada y le pica completar el resto. El formulario tiene defensas contra registros falsos y un límite diario, así que puedes dejar el QR en la mesa sin miedo.',
        },
        {
          type: 'consejo',
          text: 'El diseño usa lo que tu negocio ya tiene: el logo se acomoda solo para el círculo de la tarjeta y tu dirección se usa para el aviso de cercanía. No necesitas preparar imágenes especiales.',
        },
        {
          type: 'ojo',
          text: 'El aviso de cercanía depende de que tu dirección se pueda ubicar con precisión en el mapa. Si tu dirección es imprecisa (sin número, o con abreviaturas raras), la tarjeta funciona igual pero sin ese aviso.',
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
