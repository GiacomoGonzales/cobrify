/**
 * GUÍA DE USO: Almacenes
 *
 * Nombres verificados contra src/pages/Warehouses.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'almacenes',
  actualizado: '12/08/2026',
  intro:
    'Un almacén es un lugar donde guardas mercadería: la tienda, el depósito, la trastienda. El stock de cada producto vive repartido entre ellos, y esta pantalla es donde los defines.',

  sections: [
    {
      id: 'cuando-usar',
      title: '¿Necesitas más de un almacén?',
      blocks: [
        {
          type: 'texto',
          text: 'Si vendes todo desde un solo lugar, con el almacén **Principal** basta y no tienes que tocar nada acá.',
        },
        {
          type: 'texto',
          text: 'Un segundo almacén tiene sentido cuando la mercadería está físicamente separada y necesitas saber cuánto hay en cada sitio: tienda y depósito, o una sucursal con su propio stock.',
        },
        {
          type: 'consejo',
          text: 'No crees almacenes por categorías de producto ("Almacén de bebidas"). Para eso están las categorías. Los almacenes son **lugares**.',
        },
      ],
    },

    {
      id: 'crear',
      title: 'Crear y administrar almacenes',
      blocks: [
        {
          type: 'texto',
          text: 'Cada almacén tiene su **Nombre**, su **Código** y puede estar **Activo** o **Inactivo**. Uno de ellos es el **Principal**: el que se usa por defecto cuando no eliges otro.',
        },
        {
          type: 'texto',
          text: 'Desactivar un almacén lo saca de los selectores del POS y de las compras sin borrar su historial.',
        },
        {
          type: 'ojo',
          text: 'No se puede eliminar un almacén que todavía tiene stock. Primero traslada la mercadería a otro; el sistema te avisa si hay algo que impide borrarlo.',
        },
      ],
    },

    {
      id: 'como-afecta',
      title: 'Cómo afecta a tu día a día',
      blocks: [
        {
          type: 'texto',
          text: 'El almacén aparece en tres momentos: al **vender** (de ahí se descuenta el stock), al **comprar** (ahí entra la mercadería) y en **Inventario** (lo que ves depende del almacén seleccionado).',
        },
        {
          type: 'consejo',
          text: 'La confusión más común: un producto "sin stock" en el POS que sí existe en el depósito. No es un error, es que el almacén seleccionado no lo tiene. Se resuelve con una transferencia desde Inventario.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Cuál es la diferencia entre almacén y sucursal?',
      a: 'La **sucursal** es el local de cara al cliente (con su serie de comprobantes y su caja). El **almacén** es dónde está guardada la mercadería. Una sucursal puede tener uno o varios almacenes.',
    },
    {
      q: 'Creé un almacén nuevo y aparece sin nada.',
      a: 'Es correcto: nace vacío. La mercadería llega ahí con una compra o con una transferencia desde otro almacén.',
    },
    {
      q: '¿Puedo mover stock entre almacenes?',
      a: 'Sí, desde **Inventario**, con la transferencia (o el **Traslado masivo** si son muchos productos).',
    },
  ],
}
