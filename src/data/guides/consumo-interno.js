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
    'Descontar stock sin cobrar nada: lo que consumió el personal, lo que se echó a perder, una cortesía. Es como registrar una merma, pero diciendo por qué. Lo encuentras en **Inventario → Opciones → Consumo interno**.',

  sections: [
    {
      id: 'para-que',
      title: 'Para qué sirve',
      blocks: [
        {
          type: 'texto',
          text: 'Antes, cuando el personal comía o algo se malograba, quedaban dos opciones malas: descontar el stock a mano con un ajuste (sin decir por qué) o dejarlo sin descontar (y que el inventario nunca cuadre). Esto resuelve las dos: **descuenta el stock y deja registrado el motivo**. Funciona en cualquier modo de negocio y con cualquier producto.',
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
            'En **Inventario**, abre **Opciones** y elige **Consumo interno**.',
            'Elige el **motivo**. Si eliges *Consumo del personal* aparece un campo para anotar de quién fue.',
            'Busca los productos por nombre o código y ajusta las cantidades.',
            'Si quieres, deja un comentario, y presiona **Descontar del stock**.',
          ],
        },
        {
          type: 'ojo',
          text: 'El monto que ves es el **costo**, no el precio de venta. Lo que el personal come no es una venta que perdiste: es lo que te costó reponerlo. Es informativo — lo importante es que el stock baje.',
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
      id: 'donde-aparece',
      title: 'Dónde se ve después',
      blocks: [
        {
          type: 'texto',
          text: 'Cada salida queda en **Movimientos de Inventario**, con su motivo y quién la registró, junto al resto del historial de tu stock.',
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
