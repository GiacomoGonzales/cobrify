/**
 * GUÍA DE USO: Promociones
 *
 * Formato de bloques: ver GuideRenderer.jsx. Metadata: registry.js.
 * REGLA DE ORO: cada botón/campo mencionado existe con ese nombre EXACTO en
 * pantalla (verificado contra Promotions.jsx, POS.jsx, PostSaleModal.jsx,
 * LoyaltyManager.jsx y CartDrawer.jsx). Sin emojis.
 */
export default {
  id: 'promociones',
  actualizado: '16/08/2026',
  intro:
    'Promociones reúne en un solo lugar las herramientas para atraer y fidelizar clientes: la **Tarjeta de sellos** (tu programa de fidelidad, con tarjeta digital para el celular del cliente), los **Combos** (varios productos a un precio especial) y los **Cupones** (códigos de descuento como VERANO10). Todo lo que crees aquí se usa después en el POS y en tu catálogo online.',

  sections: [
    {
      id: 'tarjeta-sellos',
      title: 'Tarjeta de sellos: cómo funciona el programa',
      blocks: [
        {
          type: 'texto',
          text: 'Es el clásico "junta 10 sellos y gana un premio", en digital. Cada compra le suma un sello a la tarjeta del cliente, y la tarjeta se identifica por su **teléfono** — por eso no necesita registrarse ni instalar nada.',
        },
        {
          type: 'pasos',
          items: [
            'En la pestaña **Tarjeta de sellos**, presiona **Configurar**.',
            'Activa **Programa activado**.',
            'Define **Sellos para el premio** (la meta) y el premio que gana el cliente.',
            'Elige el diseño de la tarjeta digital: color, motivo de portada y tipo de sello. La vista previa muestra cómo la verá el cliente en su celular.',
            'Guarda. Desde ese momento, cada venta con cliente suma sellos sola.',
          ],
        },
        {
          type: 'ojo',
          text: 'Para que una venta sume el sello, el POS necesita saber QUIÉN compró: elige el cliente (con teléfono) antes de cobrar. Una venta rápida sin cliente no suma sellos.',
        },
        {
          type: 'consejo',
          text: 'Los pedidos de tu catálogo online también suman sellos al convertirlos en venta: el sistema reconoce al cliente por el mismo teléfono, compre en tienda o por internet.',
        },
      ],
    },
    {
      id: 'tarjeta-clientes',
      title: 'Ver, canjear y enviar las tarjetas de tus clientes',
      blocks: [
        {
          type: 'texto',
          text: 'En la pestaña **Tarjeta de sellos** tienes el panel del programa: arriba los totales (**Tarjetas emitidas**, **Sellos activos**, **Premios canjeados**) y abajo la lista **Clientes con tarjeta**, con un buscador por nombre o teléfono.',
        },
        {
          type: 'texto',
          text: 'Cada cliente muestra sus sellos (en verde cuando llegó a la meta). Cuando llega, aparece el botón **Canjear**: presiónalo al entregar el premio y la tarjeta descuenta la meta y arranca de nuevo — los sellos que sobren se conservan.',
        },
        {
          type: 'ui',
          kind: 'boton',
          label: 'Canjear',
          nota: 'Solo aparece cuando el cliente alcanzó la meta de sellos.',
        },
        {
          type: 'texto',
          text: 'El botón con el avión de papel envía la tarjeta digital por WhatsApp: un solo link que funciona en iPhone (Apple Wallet) y Android (Google Wallet) — el sistema detecta el celular del cliente solo. La tarjeta se guarda en su billetera del celular con tu logo y colores, y se mantiene actualizada sola: con cada sello el celular del cliente recibe una notificación y la tarjeta refleja el avance sin que nadie haga nada.',
        },
        {
          type: 'ojo',
          text: 'Si ves el aviso "El envío de la tarjeta digital estará disponible próximamente", el envío está pausado temporalmente. Los sellos se siguen acumulando normal y el canje funciona igual: cuando el envío se active, cada cliente recibirá su tarjeta con todos sus sellos al día.',
        },
        {
          type: 'texto',
          text: 'También puedes enviar la tarjeta justo después de cobrar: el aviso de venta completada del POS muestra los sellos del cliente (**Sellos: 5/10**) con el botón **Enviar tarjeta**. Si con esa compra llegó a la meta, el aviso te lo dice ahí mismo para que ofrezcas el canje.',
        },
      ],
    },
    {
      id: 'combos',
      title: 'Combos: varios productos a precio especial',
      blocks: [
        {
          type: 'texto',
          text: 'Un combo agrupa productos que ya tienes (por ejemplo: hamburguesa + papas + gaseosa) y se vende a un precio propio. En el POS aparece como un producto más, y al venderlo el stock se descuenta de cada parte.',
        },
        {
          type: 'pasos',
          items: [
            'En la pestaña **Combos**, presiona **Crear combo**.',
            'Ponle nombre en **Nombre del combo** (ej: Combo familiar).',
            'En **Productos que lo componen**, busca y agrega cada producto con su cantidad.',
            'Escribe el **Precio del combo (S/)**. Opcional: un **Código** para buscarlo rápido en el POS y una foto en **Subir foto del combo**.',
            'Revisa el resumen: te muestra cuánto suman **Las partes por separado** y cuánto ahorra el cliente.',
            'Presiona **Crear combo**. Ya puedes venderlo desde el POS.',
          ],
        },
        {
          type: 'texto',
          soloModos: ['restaurant'],
          text: 'En modo restaurante el combo también acepta **Modificadores**: las opciones personalizables del pedido (término de la carne, tipo de pan, extras). Se agregan al crearlo con **Agregar Modificador** — el mismo editor de la página Productos — y la cocina los recibe igual que en cualquier plato.',
        },
        {
          type: 'consejo',
          text: 'El resumen es tu control de rentabilidad al armarlo: si el precio del combo supera la suma de las partes, te lo avisa en rojo — un combo debe ser un beneficio visible para el cliente.',
        },
        {
          type: 'ojo',
          text: 'El combo no tiene stock propio: depende del stock de sus partes. Si una parte se agota, el combo no se puede vender. Los combos creados aquí aparecen en la página Productos (categoría Combos) y su composición se puede ajustar en Composición, como cualquier producto compuesto.',
        },
      ],
    },
    {
      id: 'cupones-crear',
      title: 'Cupones: crear un código de descuento',
      blocks: [
        {
          type: 'texto',
          text: 'Un cupón es un código corto (VERANO10) que descuenta un porcentaje o un monto fijo del total de la venta. Sirve para campañas: lo publicas en redes o lo mandas por WhatsApp, y quien lo tenga lo usa al comprar.',
        },
        {
          type: 'pasos',
          items: [
            'En la pestaña **Cupones**, presiona **Crear cupón**.',
            'Escribe el **Código** (solo letras y números; se guarda en mayúsculas).',
            'Elige el **Tipo**: **Porcentaje (%)** o **Monto fijo (S/)**, y el valor del descuento.',
            'Opcional: ponle fecha en **Vence el (opcional)** y un tope en **Límite de usos (opcional)**.',
            'Presiona **Crear cupón**.',
          ],
        },
        {
          type: 'texto',
          text: 'La lista muestra cada cupón con su estado — **Activo**, **Vencido**, **Agotado** o **Desactivado** — y cuántas veces se usó. El botón de encendido lo desactiva sin borrarlo (útil para pausar una campaña); el tacho lo elimina.',
        },
        {
          type: 'texto',
          text: 'Los cupones activos tienen además el botón de **compartir tarjeta para el celular**: genera un link que el cliente abre y agrega el cupón a **Google Wallet o Apple Wallet** según su equipo — con el descuento en grande, el código, el vencimiento y el QR listo para mostrar al pagar. El mismo link sirve para WhatsApp, redes o un afiche con QR.',
        },
        {
          type: 'consejo',
          text: 'Ponle siempre vencimiento o límite de usos a los cupones que publiques en redes: un código sin tope circula para siempre. La tarjeta respeta lo mismo: si el cupón se agota o vence, el POS lo rechaza aunque el cliente lo tenga en su celular.',
        },
      ],
    },
    {
      id: 'certificados',
      title: 'Certificados de regalo',
      blocks: [
        {
          type: 'texto',
          text: 'Un certificado de regalo es **saldo prepagado**: alguien paga hoy S/ 100 y otra persona los consume después. En la pestaña **Certificados** los vendes y ves el saldo de cada uno.',
        },
        {
          type: 'pasos',
          items: [
            'Presiona **Vender certificado** (necesitas tu **caja abierta**: el dinero entra al arqueo).',
            'Pon el **Valor**, con qué pagaron (**Efectivo, Yape o Plin**), y si quieres el nombre del beneficiario y un vencimiento.',
            'Al vender, aparece el **código** (GC seguido de 6 caracteres) en grande: entrégaselo al cliente. Es al portador — quien tiene el código, tiene el saldo.',
            'Para canjearlo: en el POS, el campo **Certificado de regalo (GC...)** valida el código y habilita pagar con él, hasta su saldo. Lo que no alcance se paga con otro método.',
          ],
        },
        {
          type: 'ojo',
          text: 'El comprobante sale **al canje, no al vender**: vender el certificado registra un ingreso de caja (entró dinero, aún no hay venta), y la boleta o factura se emite cuando el cliente consume. El certificado puede usarse en varias compras hasta agotar su saldo.',
        },
        {
          type: 'consejo',
          text: 'Si anulas un certificado ya cobrado, devuelve el dinero y registra el **egreso** en caja — el sistema te lo recuerda al anular. Así el arqueo del día sigue contando la verdad.',
        },
      ],
    },
    {
      id: 'descuentos-programados',
      title: 'Descuentos programados: ofertas por día y horario',
      blocks: [
        {
          type: 'texto',
          text: 'Una promoción programada es una regla tipo "20% en bebidas de 17:00 a 19:00, de martes a jueves". El POS la aplica y la quita solo, según el reloj: el cajero no tiene que acordarse de nada.',
        },
        {
          type: 'pasos',
          items: [
            'En la pestaña **Descuentos**, presiona **Crear promoción**.',
            'Ponle **Nombre** (ej: Hora feliz) y el **Descuento (%)**.',
            'En **Se aplica a**, elige: **Todos los productos**, **Una categoría** o **Productos específicos**.',
            'En **Dónde aplica**, elige **Local y catálogo**, **Solo en el local** o **Solo en el catálogo**.',
            'Marca los **Días** y define el horario **Desde** / **Hasta**. Opcional: una fecha en **Termina el** para campañas con final.',
            'Presiona **Crear promoción**.',
          ],
        },
        {
          type: 'texto',
          text: 'En el POS, cuando un producto en promoción entra al carrito, su descuento se aplica solo y la línea muestra una etiqueta ámbar con el porcentaje. Si el cajero escribe otro descuento a mano en esa línea, su número manda y la promoción se suelta.',
        },
        {
          type: 'texto',
          text: 'En tu **catálogo online**, un producto en promoción se muestra con el precio de lista tachado, el precio de oferta al lado y una pastilla con el porcentaje. Hay ofertas que solo tienen sentido para quien viene a la tienda, y otras que son gancho para vender online: por eso cada promoción elige dónde aplica.',
        },
        {
          type: 'ojo',
          text: 'Cuando un cliente pide online, **el precio que vio es el que se cobra**. Si el pedido se abre en la caja horas después, con la promoción ya terminada, la línea llega con su precio de oferta y no se le aplica otro descuento encima. Le prometiste ese precio y se respeta.',
        },
        {
          type: 'ojo',
          text: 'La promoción se evalúa EN EL MOMENTO de agregar el producto al carrito, con hora de Perú. Si dos promociones alcanzan al mismo producto, no se suman: se aplica solo la más generosa. La lista muestra el estado de cada regla: Activa ahora, Programada, Vencida o Desactivada, y marca las que valen solo para un canal.',
        },
      ],
    },
    {
      id: 'cupones-usar',
      title: 'Cupones: cómo se usan al cobrar y en el catálogo',
      blocks: [
        {
          type: 'texto',
          text: 'En el POS: dentro de la caja verde **Descuento General** hay un campo **Código de cupón**. El cajero lo escribe, presiona **Aplicar**, y el descuento se llena solo. Queda a la vista el código aplicado con su botón **Quitar**.',
        },
        {
          type: 'ojo',
          text: 'Con un cupón aplicado, los campos de descuento manual se bloquean: el descuento pertenece al cupón. Para modificarlo a mano, primero presiona **Quitar**. Si el código no es válido, el mensaje te dice por qué: vencido, agotado o desactivado.',
        },
        {
          type: 'texto',
          text: 'En tu catálogo online: el cliente encuentra el campo **¿Tienes un cupón?** en su carrito. Al aplicarlo ve el descuento y el total **A pagar** al instante, y el cupón viaja con su pedido (y en el mensaje de WhatsApp). Cuando cobres ese pedido en el POS, escribe el mismo código para que el descuento salga en el comprobante.',
        },
        {
          type: 'texto',
          text: 'El comprobante electrónico registra el descuento del cupón como descuento global — el formato que SUNAT acepta — y cada venta cobrada suma 1 al contador de usos del cupón.',
        },
      ],
    },
  ],
}
