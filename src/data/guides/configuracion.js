/**
 * GUÍA DE USO: Configuración
 *
 * Nombres de pestañas verificados contra src/pages/Settings.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'configuracion',
  actualizado: '12/08/2026',
  intro:
    'Configuración es donde el sistema se adapta a tu negocio. Está dividida en pestañas; esta guía te dice qué vive en cada una para que no tengas que buscar a ciegas.',

  sections: [
    {
      id: 'mapa',
      title: 'Qué hay en cada pestaña',
      blocks: [
        {
          type: 'pasos',
          items: [
            '**Mi Empresa**: RUC, razón social, dirección, logo y los establecimientos registrados en SUNAT. Son los datos que salen impresos en tus comprobantes.',
            '**Preferencias**: cómo se ve y se comporta el sistema, y qué módulos aparecen en tu menú lateral.',
            '**Ventas**: casi todo lo que afecta al Punto de Venta — comprobantes habilitados, productos personalizados, edición de precios, impresión automática, recordatorio de vuelto, métodos de pago.',
            '**Documentos**: opciones de los comprobantes y del cierre de caja.',
            '**Series**: las series y numeración de cada tipo de documento.',
            '**Impresora**: la ticketera térmica y el ancho de papel.',
            '**Seguridad**: contraseña y accesos.',
            '**Notificaciones**: qué avisos quieres recibir.',
          ],
        },
        {
          type: 'consejo',
          text: 'Si llegaste acá desde el botón de ayuda de otra página, el enlace te deja directamente sobre la opción que buscabas y te la resalta unos segundos.',
        },
      ],
    },

    {
      id: 'empresa',
      title: 'Datos de tu empresa',
      blocks: [
        {
          type: 'texto',
          text: 'En **Mi Empresa** cargas RUC, razón social, nombre comercial, dirección y teléfono, además del **logo** que aparece en los PDF. También puedes registrar tus **Establecimientos (SUNAT)**, que son los anexos declarados ante SUNAT.',
        },
        {
          type: 'ojo',
          text: 'Estos datos viajan en el XML de cada comprobante. Si están mal, SUNAT rechaza. Revísalos una vez al inicio y no los toques salvo que cambien de verdad.',
        },
      ],
    },

    {
      id: 'ventas',
      title: 'Ajustes que cambian tu POS',
      blocks: [
        {
          type: 'texto',
          text: 'La pestaña **Ventas** es la que más impacto tiene en el día a día. Ahí decides qué comprobantes emites, si el cajero puede editar precios o nombres, si existe el botón de producto personalizado, si el ticket se imprime solo, si aparece el recordatorio de vuelto y qué métodos de pago se muestran.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas',
          label: 'Ir a la pestaña Ventas',
        },
        {
          type: 'consejo',
          text: 'Cada opción explica en su descripción qué pasa si la activas y qué pasa si no. Léela antes de cambiarla: son ajustes que afectan a todos los que usan el sistema en tu negocio.',
        },
      ],
    },

    {
      id: 'series',
      title: 'Series y numeración',
      blocks: [
        {
          type: 'texto',
          text: 'En **Series** defines la serie de cada tipo de comprobante (por ejemplo B001 para boletas, F001 para facturas) y desde qué número continúa la numeración. Si tienes sucursales, puedes darle **series por sucursal**.',
        },
        {
          type: 'ojo',
          text: 'La numeración es correlativa y SUNAT la controla. No retrocedas el número de una serie que ya emitió comprobantes: generarías duplicados y SUNAT los rechazará. Si dos locales emiten con el mismo RUC, dales series distintas.',
        },
      ],
    },

    {
      id: 'impresora',
      title: 'Impresora térmica',
      blocks: [
        {
          type: 'texto',
          text: 'En **Impresora** eliges el **ancho de papel** (58 u 80 mm) y, desde la aplicación Android, emparejas la ticketera Bluetooth. La impresora queda configurada por dispositivo, así que cada equipo usa la suya.',
        },
      ],
    },

    {
      id: 'modulos',
      title: 'Mostrar u ocultar módulos del menú',
      blocks: [
        {
          type: 'texto',
          text: 'En **Preferencias** puedes activar o desactivar módulos completos (Cotizaciones, Almacenes, Compras, Vendedores, Contabilidad y varios más). Lo que apagues desaparece del menú lateral.',
        },
        {
          type: 'consejo',
          text: 'Apagar lo que no usas es la forma más rápida de que tu equipo deje de perderse: un menú con seis opciones se aprende en un día.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Cambié una opción y no veo el efecto.',
      a: 'Guarda con el botón de guardar de la pestaña y recarga la página. Si la opción afecta al POS y lo tienes abierto en otra pestaña o dispositivo, ese también tiene que recargar.',
    },
    {
      q: '¿Los cambios afectan a todos los usuarios del negocio?',
      a: 'Sí. La configuración es del negocio, no de cada persona. Las únicas excepciones son las cosas que dependen del equipo, como la impresora térmica y el tamaño de etiqueta.',
    },
    {
      q: 'No encuentro una opción que me mencionaron.',
      a: 'Puede vivir en otra pestaña. Empieza por **Ventas** si tiene que ver con cobrar, **Documentos** si tiene que ver con comprobantes o cierre de caja, y **Preferencias** si tiene que ver con qué se ve en el menú.',
    },
    {
      q: '¿Puedo dejar que un sub-usuario entre a Configuración?',
      a: 'Se maneja con permisos en la página de usuarios. Piénsalo dos veces: desde acá se cambian series, comprobantes y precios, que son cosas sensibles.',
    },
  ],
}
