/**
 * GUÍA DE USO: Consumo Interno
 *
 * Nombres verificados contra src/pages/InternalConsumption.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'consumo-interno',
  actualizado: '21/08/2026',
  intro:
    'Todo lo que sale de tu stock sin venderse: el almuerzo del personal, lo que se echó a perder, el postre que regalaste por la demora. Se descuenta igual que una venta, pero no emite comprobante ni suma a tus ingresos: queda como costo.',

  sections: [
    {
      id: 'para-que',
      title: 'Para qué sirve',
      blocks: [
        {
          type: 'texto',
          text: 'Antes, cuando el personal comía o algo se malograba, quedaban dos opciones malas: descontar el stock a mano con un ajuste (sin decir por qué) o dejarlo sin descontar (y que el inventario nunca cuadre). Esta pantalla resuelve las dos: **descuenta el stock y deja registrado el motivo**.',
        },
        {
          type: 'texto',
          text: 'Al final del mes no vas a ver "salieron 200 unidades", vas a ver **cuánto comió el personal, cuánto se echó a perder y cuánto regalaste en cortesías**. Son tres decisiones distintas y cada una se corrige de forma distinta.',
        },
      ],
    },
    {
      id: 'registrar',
      title: 'Registrar una salida',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Elige el **motivo** entre los seis de arriba. Si eliges *Consumo del personal* aparece un campo extra para anotar de quién fue.',
            'Ajusta la **fecha** si el consumo fue un día anterior, y el **almacén** del que sale.',
            'Busca los productos por nombre o código y agrégalos, igual que armarías un pedido.',
            'Revisa las **cantidades** y el **costo** de cada uno, y registra.',
          ],
        },
        {
          type: 'ojo',
          text: 'El monto que ves es el **costo**, no el precio de venta. Lo que el personal come no es una venta que perdiste: es lo que te costó reponerlo. Si un producto no tiene costo cargado, el sistema te avisa — el stock se descuenta igual, pero el total no reflejará lo que realmente costó.',
        },
      ],
    },
    {
      id: 'recetas',
      title: 'Si el producto tiene receta',
      blocks: [
        {
          type: 'texto',
          text: 'En modo restaurante, registrar **2 lomo saltado** descuenta la carne, la papa y la cebolla de tus insumos — no un producto llamado "lomo saltado". Es exactamente lo mismo que hace una venta en el punto de venta.',
        },
      ],
    },
    {
      id: 'corregir',
      title: 'Si te equivocaste',
      blocks: [
        {
          type: 'texto',
          text: 'Cada registro del historial tiene **Anular**. Al anularlo, el stock vuelve y el registro queda marcado como anulado — no se borra, para que el historial siga siendo fiel a lo que pasó.',
        },
      ],
    },
    {
      id: 'donde-aparece',
      title: 'Dónde se ve después',
      blocks: [
        {
          type: 'texto',
          text: 'En esta misma pantalla tienes el **resumen del mes por motivo**, que es el número que conviene mirar. Y cada salida deja su rastro en **Movimientos de Inventario**, junto con el resto del historial de tu stock.',
        },
        {
          type: 'ojo',
          text: 'Nunca aparece como ingreso: ni en tus ventas, ni en el cuadre de caja. Es una salida de mercadería, no una venta.',
        },
      ],
    },
    {
      id: 'sunat',
      title: 'Un tema para consultar con tu contador',
      blocks: [
        {
          type: 'texto',
          text: 'En Perú, entregar bienes sin venderlos toca el concepto de **retiro de bienes**. Los alimentos al personal como condición de trabajo no se tratan igual que una cortesía o una muestra, que sí pueden tener efecto tributario.',
        },
        {
          type: 'ojo',
          text: 'Consúltalo con tu contador según tu caso. Esta pantalla deja el registro documentado —qué salió, cuándo, por qué y a qué costo— que es justamente lo que se necesita para sustentarlo.',
        },
      ],
    },
  ],
}
