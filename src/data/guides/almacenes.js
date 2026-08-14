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
      id: 'sucursal-vs-almacen',
      title: 'Sucursal y almacén: qué es cada uno',
      blocks: [
        {
          type: 'texto',
          text: 'Es la confusión más común del sistema, y se resuelve con una línea: **la sucursal es el local; el almacén es dónde está guardada la mercadería**.',
        },
        {
          type: 'tabla',
          encabezados: ['', 'Sucursal', 'Almacén'],
          filas: [
            ['Responde', '¿Desde dónde vendo?', '¿De dónde sale la mercadería?'],
            ['Afecta', 'El comprobante y la caja', 'El stock'],
            ['Tiene', 'Su serie y su caja del día', 'Cantidades de cada producto'],
          ],
        },
        {
          type: 'texto',
          text: 'Una sucursal puede tener **varios almacenes**. Al revés no: un almacén pertenece a una sola sucursal.',
        },
        {
          type: 'ojo',
          text: 'El punto clave: **el stock nunca vive en la sucursal, vive en el almacén**. Cuando alguien dice "tengo 50 polos", en realidad tiene 30 en un almacén y 20 en otro. El total es la suma, y al vender el sistema descuenta de **uno** en concreto.',
        },
        {
          type: 'texto',
          text: '**Un ejemplo.** Una tienda de ropa con dos locales:',
        },
        {
          type: 'tabla',
          encabezados: ['Sucursal', 'Sus almacenes'],
          filas: [
            ['Centro', 'Mostrador Centro · Depósito Centro'],
            ['Surco', 'Mostrador Surco'],
          ],
        },
        {
          type: 'texto',
          text: 'Vendes un polo en Centro, desde el mostrador. Pasan tres cosas, y cada una la decide algo distinto:',
        },
        {
          type: 'pasos',
          items: [
            'El comprobante sale con la **serie de Centro** — lo decide la sucursal.',
            'La plata entra a la **caja de Centro** — lo decide la sucursal.',
            'El stock baja del **Mostrador Centro** — lo decide el almacén.',
          ],
        },
        {
          type: 'texto',
          text: 'El **Depósito Centro no se toca**, aunque esté en el mismo local. Para el sistema son dos lugares distintos.',
        },
        {
          type: 'ojo',
          text: 'De ahí sale el reclamo más repetido: *"dice sin stock pero lo tengo, lo estoy viendo"*. Y es verdad que lo tiene — pero **en el depósito**, y está vendiendo desde el mostrador. El sistema no se equivoca: está mirando el almacén correcto. Se arregla con una **transferencia** desde Inventario.',
        },
        {
          type: 'consejo',
          text: 'La regla para configurarlo sin equivocarse: **sucursal = otra dirección**. Si es otro local, es una sucursal. **Almacén = un lugar donde guardas cosas**: mostrador, depósito, trastienda, la camioneta.',
        },
        {
          type: 'texto',
          text: 'Y si vendes todo desde un solo lugar, **no necesitas nada de esto**: con el almacén Principal alcanza y no hay que configurar sucursales.',
        },
      ],
    },

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
      a: 'La **sucursal** decide con qué serie sale el comprobante y a qué caja entra la plata. El **almacén** decide de dónde se descuenta el stock. Una sucursal puede tener varios almacenes, y el stock siempre vive en el almacén. Está explicado con un ejemplo en la primera sección de esta guía.',
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
