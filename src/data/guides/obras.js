/**
 * GUÍA DE USO: Obras y proyectos.
 *
 * Nombres verificados contra src/pages/Projects.jsx, WarehouseExits.jsx,
 * WarehouseReturns.jsx y LogisticsReports.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'obras',
  actualizado: '01/09/2026',
  intro:
    'Para negocios que mandan material fuera del local: una obra, un proyecto, la sede de un cliente. Registras qué salió, para dónde, qué volvió y cuánto costó cada obra. En modo General se activa desde **Configuración → Obras y proyectos**; en modo Logística ya viene puesto.',

  sections: [
    {
      id: 'para-que',
      title: 'Para qué sirve',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando el material sale a una obra no lo estás vendiendo, pero tampoco lo tienes ya en el almacén. Sin un registro propio, esas salidas terminan como un ajuste de inventario sin explicación: el stock baja y nadie sabe adónde fue.',
        },
        {
          type: 'texto',
          text: 'Con esto cada salida queda con su **obra**, su **fecha**, su **responsable** y su **costo**. Al final del mes puedes responder cuánto material se llevó cada obra, qué volvió sin usarse y cuánto llevas gastado en cada una.',
        },
        {
          type: 'consejo',
          text: 'Los materiales que solo se compran y nunca se venden conviene marcarlos como **Solo uso interno** en su ficha: así no aparecen en el Punto de Venta pero sí en el inventario y en estas salidas.',
        },
      ],
    },

    {
      id: 'activar',
      title: 'Activarlo',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Entra a **Configuración → Preferencias** y activa **Obras y proyectos**.',
            'Guarda. En el menú lateral aparece el grupo **Obras**, con Proyectos / Obras, Salidas de Almacén, Retornos a Almacén y Reportes de Obra.',
            'Si alguna de esas páginas no te sirve, la puedes apagar sola en **Personalizar Menú Lateral**, más abajo en la misma pantalla.',
          ],
        },
        {
          type: 'ojo',
          text: 'Si tienes usuarios secundarios, dales acceso a las páginas nuevas en **Usuarios**: al activarse el módulo aparecen en su lista de permisos, pero nadie las recibe automáticamente.',
        },
      ],
    },

    {
      id: 'crear-obra',
      title: 'Crear una obra',
      blocks: [
        {
          type: 'pasos',
          items: [
            'En **Proyectos / Obras**, presiona **Nuevo Proyecto**.',
            'Ponle **nombre** (por ejemplo, *Edificio Los Álamos*) y, si manejas códigos, su **código** de obra.',
            'Completa **ubicación y dirección**, y el **responsable** con su teléfono: es a quién llamas cuando falta algo en obra.',
          ],
        },
        {
          type: 'texto',
          text: 'La obra es la carpeta donde se van acumulando todas las salidas y retornos. Créala antes de despachar el primer material.',
        },
      ],
    },

    {
      id: 'salidas',
      title: 'Sacar material del almacén',
      blocks: [
        {
          type: 'texto',
          text: 'En **Salidas de Almacén** tienes dos botones, según adónde va el material:',
        },
        {
          type: 'pasos',
          items: [
            '**Salida a Obra**: eliges la obra, el almacén de donde sale y los productos con sus cantidades. Es la que alimenta los reportes por obra.',
            '**Salida Simple**: para lo que no pertenece a ninguna obra — uso en oficina, entrega a un trabajador, consumo interno. Eliges un **motivo** en vez de una obra.',
          ],
        },
        {
          type: 'texto',
          text: 'En ambos casos el stock se descuenta del almacén que elegiste, y queda un movimiento de inventario con su rastro.',
        },
        {
          type: 'consejo',
          text: 'Si los motivos de las salidas simples no te alcanzan, puedes agregar los tuyos: el negocio suma sus propios motivos y quedan guardados en cada salida, así que renombrarlos después no reescribe el historial.',
        },
      ],
    },

    {
      id: 'guia-remision',
      title: 'La guía de remisión del despacho',
      blocks: [
        {
          type: 'texto',
          text: 'Si el material viaja por la vía pública, necesita su guía de remisión. Desde la salida ya registrada tienes el botón **Guía de Remisión**: abre la guía con los productos y las cantidades ya cargados, y el motivo de traslado en **Otros** con la descripción de la salida.',
        },
        {
          type: 'ojo',
          text: 'Revisa la **Descripción del motivo** antes de emitir: ese texto es el que recibe SUNAT y el que sale impreso en la guía.',
        },
      ],
    },

    {
      id: 'retornos',
      title: 'Lo que vuelve de la obra',
      blocks: [
        {
          type: 'pasos',
          items: [
            'En **Retornos a Almacén**, presiona **Nuevo Retorno**.',
            'Elige la **obra** de la que vuelve el material y el **almacén** que lo recibe.',
            'Carga los productos y las cantidades, y registra.',
          ],
        },
        {
          type: 'texto',
          text: 'El stock vuelve a sumar en el almacén y el consumo de esa obra baja: lo que regresó no se gastó ahí. Sin registrar los retornos, toda obra parece más cara de lo que fue.',
        },
      ],
    },

    {
      id: 'reportes',
      title: 'Ver cuánto se llevó cada obra',
      blocks: [
        {
          type: 'texto',
          text: '**Reportes de Obra** tiene tres vistas: **Resumen General**, **Por Proyecto** e **Historial**. La del medio es la que suele buscarse: cuánto material y cuánto costo acumula cada obra.',
        },
        {
          type: 'texto',
          text: 'Desde **Salidas de Almacén** también puedes sacar el **Reporte por Obra** y el **Reporte de Salidas Simples** en Excel, para pasarlo al cliente o al contador.',
        },
        {
          type: 'ojo',
          text: 'Los montos salen del **costo** de cada producto, no de su precio de venta: es lo que te costó reponer el material, que es la pregunta correcta cuando no hubo venta.',
        },
      ],
    },
  ],
}
