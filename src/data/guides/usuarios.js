/**
 * GUÍA DE USO: Usuarios
 *
 * Nombres verificados contra src/pages/Users.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'usuarios',
  actualizado: '05/09/2026',
  intro:
    'Acá creas las cuentas de tu equipo y decides qué puede ver y hacer cada uno. Es la pantalla que evita que un cajero vea tus márgenes o cambie tus precios.',

  sections: [
    {
      id: 'crear',
      title: 'Crear un usuario',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Completa los **Datos del usuario**: nombre, **Email** (con ese entra) y contraseña.',
            'En **Permisos de acceso**, marca las **Páginas** que podrá abrir.',
            'Define su **Acceso a sucursales y almacenes** si trabaja en un local concreto.',
            'Ajusta la **Visualización** y la **Configuración del POS y caja** según el cargo.',
            'Guarda: ya puede entrar con su correo.',
          ],
        },
        {
          type: 'consejo',
          text: 'Empieza restrictivo. Es más fácil abrirle un permiso a alguien que pide algo que descubrir tarde que veía información que no debía.',
        },
      ],
    },

    {
      id: 'paginas',
      title: 'Qué páginas puede ver',
      blocks: [
        {
          type: 'texto',
          text: 'Marcas una por una las páginas a las que entra. Las que no marques ni siquiera aparecen en su menú lateral. Si intenta entrar por URL directa, el sistema lo redirige a la primera página que sí tenga permitida.',
        },
        {
          type: 'texto',
          text: 'Un cajero típico necesita Punto de Venta, Ventas y Control de Caja. Difícilmente necesita Reportes, Productos o Configuración.',
        },
      ],
    },

    {
      id: 'sucursales',
      title: 'Limitarlo a una sucursal',
      blocks: [
        {
          type: 'texto',
          text: 'En **Sucursales** y **Almacenes** eliges dónde trabaja. Dejar la selección vacía significa **acceso a todas**. Al limitarlo, solo verá las ventas, el stock y las cajas de su sede.',
        },
        {
          type: 'ojo',
          text: 'Este filtro ordena lo que la persona ve en pantalla; no es una bóveda. Para la información realmente sensible, apóyate además en las opciones de ocultar datos.',
        },
      ],
    },

    {
      id: 'ocultar',
      title: 'Ocultar información sensible',
      blocks: [
        {
          type: 'texto',
          text: 'En la ficha de cada usuario, el bloque **Qué datos puede ver** tiene tres casillas independientes: **Ver totales de ventas** (tarjetas, Dashboard, resúmenes de caja), **Ver costos y ganancias** (costo, margen, utilidad, valor del inventario) y **Exportar a Excel**.',
        },
        {
          type: 'texto',
          text: 'Son tres cosas distintas a propósito. Puedes dejar que tu encargado vea cuánto se vendió pero no cuánto ganas, o que vea los números en pantalla pero no pueda descargarse la base de clientes en un Excel.',
        },
        {
          type: 'consejo',
          text: 'Mientras no toques ninguna casilla, el usuario **hereda** lo que tengas en Configuración → "Ocultar datos sensibles a usuarios secundarios". En cuanto marcas o desmarcas una, ese usuario pasa a tener sus propios permisos y deja de seguir la opción general.',
        },
        {
          type: 'texto',
          text: 'Hay además ajustes para que el personal opere sin ver de más en el POS: **Ocultar descuentos en POS** y **Ocultar stock en productos**.',
        },
        {
          type: 'texto',
          text: 'También puedes limitar los **Tipos de comprobante** que emite y darle una **Caja independiente**, para que su cierre no se mezcle con el de los demás.',
        },
      ],
    },

    {
      id: 'vincular-vendedor',
      title: 'Vincular con un vendedor',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Vendedor asignado** conectas la cuenta con un vendedor de la lista: sus ventas se atribuyen solas, sin que tenga que elegirlo cada vez. Si lo dejas **Sin vincular**, verá todas las ventas y podrá elegir el vendedor manualmente.',
        },
      ],
    },

    {
      id: 'ficha-y-acciones',
      title: 'Desactivar, archivar o eliminar',
      blocks: [
        {
          type: 'texto',
          text: 'Toca la fila de un usuario y se abre su **ficha**: ahí ves de un vistazo qué páginas y almacenes tiene, si comparte tu caja o abre la suya, y desde ahí haces todo lo demás.',
        },
        {
          type: 'tabla',
          encabezados: ['Acción', 'Qué hace'],
          filas: [
            ['Desactivar', 'Deja de entrar al sistema. Conserva todo y lo puedes volver a activar cuando quieras.'],
            ['Archivar', 'Sale de la lista para no estorbar, pero sigue existiendo. Para personal que ya no trabaja.'],
            ['Eliminar', 'Borra su acceso y sus permisos para siempre. No se puede deshacer.'],
          ],
        },
        {
          type: 'consejo',
          text: 'Casi siempre lo que quieres es **Desactivar**. Si el empleado se fue, desactívalo o archívalo: su historial de ventas y cierres de caja se conserva igual.',
        },
        {
          type: 'ojo',
          text: 'Un usuario **desactivado** te va a decir que "no puede entrar", porque efectivamente no puede. Si te pasa, revisa su ficha: si dice Desactivado, con **Activar** vuelve a entrar al instante, con su mismo correo y contraseña.',
        },
        {
          type: 'texto',
          text: 'Al **Eliminar**, el correo queda libre: si más adelante necesitas volver a crear a esa persona, puedes usar el mismo correo de siempre.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Un usuario entra y ve la pantalla en blanco o lo saca a otra página.',
      a: 'Casi siempre es que no tiene permiso sobre la página a la que intenta entrar. Revisa sus **Páginas** marcadas; el sistema lo manda a la primera permitida.',
    },
    {
      q: '¿Puedo tener varios usuarios con la misma cuenta?',
      a: 'Técnicamente sí, pero pierdes lo más valioso: saber quién hizo cada venta, cada anulación y cada cierre de caja. Una cuenta por persona.',
    },
    {
      q: 'Un empleado se fue, ¿lo elimino?',
      a: 'Desactívalo o archívalo. Así ya no puede entrar, pero su historial de ventas y cierres de caja se conserva íntegro. Eliminar es para cuando te equivocaste al crearlo.',
    },
    {
      q: 'Mi cajero dice que no puede entrar y su cuenta existe.',
      a: 'Abre su ficha desde la lista. Si aparece como **Desactivado**, toca **Activar** y listo. Es lo que pasa casi siempre: alguien lo desactivó sin querer.',
    },
    {
      q: '¿El sub-usuario ve mi suscripción o mis datos de facturación?',
      a: 'No. Esas pantallas son del dueño de la cuenta.',
    },
  ],
}
