/**
 * GUÍA DE USO: Flujo de Caja
 *
 * Nombres verificados contra src/pages/CashFlow.jsx (14-set-2026).
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'flujo-caja',
  actualizado: '14/09/2026',
  intro:
    'Flujo de Caja te dice cuánta plata entró y cuánta salió en un período: lo que cobraste de tus ventas, tus gastos, las compras que pagaste y los préstamos. Es plata real, no lo facturado: de una venta al crédito solo cuenta lo que ya cobraste.',

  sections: [
    {
      id: 'periodo-local',
      title: 'Elegir el período y el local',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba eliges el período: **Hoy**, **Semanal**, **Mensual**, **Anual** o **Personalizado**, con las fechas que quieras.',
        },
        {
          type: 'texto',
          text: 'Si tienes sucursales, en **Sucursal** eliges **Todas**, **Principal** o un local. Con un local elegido, todo lo que ves en la página es solo de ese local.',
        },
      ],
    },

    {
      id: 'ingresos',
      title: 'Ingresos y ventas por método de pago',
      blocks: [
        {
          type: 'texto',
          text: '**Ventas** es lo que cobraste de las ventas del período. Debajo aparece repartido por método de pago: **Efectivo**, **Tarjeta**, **Yape** y los que hayas creado en Configuración, cada uno con su nombre (por ejemplo, **IZIPAY**).',
        },
        {
          type: 'pasos',
          items: [
            'Una venta pagada con dos métodos se reparte entre los dos, según lo que se pagó con cada uno.',
            'De una venta al crédito cuenta lo que ya se cobró, con el método de cada abono.',
            'El reparto suma exactamente lo mismo que Ventas: es el mismo total, separado.',
          ],
        },
        {
          type: 'texto',
          text: 'En Ingresos también están los **préstamos** que recibiste, los **otros ingresos** de caja y lo que registres con **Movimiento** (por ejemplo, un aporte de capital).',
        },
      ],
    },

    {
      id: 'por-local',
      title: 'Ventas y gastos por local',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Todas** elegido, el cuadro **Por local** pone lado a lado lo que vendió y lo que gastó cada local, con el total al final. Es la forma rápida de compararlos sin cambiar de filtro.',
        },
        {
          type: 'ojo',
          text: 'La columna **Gastos** son los gastos que registras en Gastos. Las compras de mercadería que pagaste están aparte, en **Egresos**.',
        },
      ],
    },

    {
      id: 'egresos',
      title: 'Egresos y proyecciones',
      blocks: [
        {
          type: 'texto',
          text: '**Egresos** junta tus gastos por categoría, las compras pagadas al contado, los abonos a compras al crédito y las cuotas de préstamos que pagaste. Toca una fila para ver su detalle.',
        },
        {
          type: 'texto',
          text: '**Proyecciones** muestra lo que te deben (**Por Cobrar**) y lo que debes (**Por Pagar**): el saldo que tendrías si todo se cobrara y se pagara.',
        },
      ],
    },
  ],
}
