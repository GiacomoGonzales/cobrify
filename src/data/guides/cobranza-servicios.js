/**
 * GUÍA DE USO: Cobranza de servicios (luz, agua).
 *
 * Nombres verificados contra src/pages/ServiceSupplies.jsx, ServiceReadings.jsx
 * y ServiceReceipts.jsx. Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'cobranza-servicios',
  actualizado: '03/09/2026',
  intro:
    'Para el negocio que compra un recibo de luz o agua y lo reparte entre los vecinos. Anotas la lectura de cada medidor, el sistema calcula cuánto paga cada uno, emite los recibos numerados y los vas marcando cobrados. Reemplaza el Excel y el talonario de papel. Se activa en **Configuración → Preferencias → Cobranza de servicios**.',

  sections: [
    {
      id: 'como-funciona',
      title: 'Cómo funciona',
      blocks: [
        {
          type: 'texto',
          text: 'A ti te llega **un solo recibo** de la distribuidora, con un total de kWh y un total en soles. De ahí sale el precio del kWh: **soles ÷ kWh**. Ese precio cambia todos los meses, así que no se escribe a mano: cargas los dos números de tu recibo y el sistema lo calcula solo.',
        },
        {
          type: 'texto',
          text: 'Después, a cada vecino se le cobra **su consumo × ese precio**. Lo que compraste y no llegó a ningún medidor —cables, medidores parados, tomas sin medir— lo pagas tú. Por eso la pantalla te muestra siempre cuánto se perdió y si el mes te cerró.',
        },
        {
          type: 'ojo',
          text: 'Este recibo **no es un comprobante de SUNAT**. Es un documento interno tuyo, con su propia numeración, igual que el talonario de papel. No lleva XML ni se envía a SUNAT.',
        },
      ],
    },
    {
      id: 'primera-vez',
      title: 'La primera vez: cargar el padrón',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Entra a **Suministros** y presiona **Importar padrón**.',
            'Escribe la **dirección que quieres que salga en el recibo**. Es la misma para todos.',
            'Sube el Excel con el que llevabas la cobranza, tal como está.',
            'Revisa lo que se entendió: cuántos con medidor, cuántos de cuota fija y qué quedó observado.',
            'Presiona **Importar**.',
          ],
        },
        {
          type: 'texto',
          text: 'No hace falta que acomodes el archivo. Se leen **las dos hojas** —los que tienen medidor y los de cuota fija—, se saltan los títulos de arriba y las filas de totales del final, y se reconocen las columnas aunque estén escritas distinto.',
        },
        {
          type: 'consejo',
          text: 'De cada medidor se toma la **lectura actual** del mes que subas. Esa pasa a ser la lectura anterior del mes siguiente, así la primera cobranza en el sistema arranca donde quedó tu Excel.',
        },
        {
          type: 'texto',
          text: 'Si tu archivo trae filas incompletas —sin número de suministro, sin lectura, con un número repetido en dos personas— **se importan igual** y quedan marcadas. Las juntas todas con el filtro **Para revisar** y las vas corrigiendo cuando puedas. Ninguna frena la cobranza.',
        },
      ],
    },
    {
      id: 'suministros',
      title: 'Suministros',
      blocks: [
        {
          type: 'texto',
          text: 'El padrón es **por medidor, no por persona**. Si alguien tiene la casa y la tienda, son dos suministros con el mismo nombre: cada uno se lee, se cobra y se reclama por separado.',
        },
        {
          type: 'tabla',
          encabezados: ['Campo', 'Para qué sirve'],
          filas: [
            ['Con medidor / Cuota fija', 'Con medidor se cobra lo que marca; con cuota fija, un monto igual todos los meses.'],
            ['N° de suministro', 'El número del medidor. Sale impreso en el recibo.'],
            ['Orden de ruta', 'El orden en que caminas el pueblo. La pantalla de lecturas sigue este orden.'],
            ['Última lectura', 'Lo que marca el medidor hoy. El mes que viene se usa como lectura anterior.'],
            ['Dirección', 'La que sale impresa en el recibo.'],
            ['Referencia', 'Para ubicar la casa: "Tienda 1", "Carretera". Solo para ti, no se imprime.'],
          ],
        },
        {
          type: 'ojo',
          text: 'Cuando alguien se va, usa **Dar de baja**, no lo borres. Sus recibos de meses anteriores tienen que seguir existiendo.',
        },
      ],
    },
    {
      id: 'lecturas',
      title: 'Tomar las lecturas del mes',
      blocks: [
        {
          type: 'texto',
          text: 'Esta pantalla está pensada para usarla **con el celular, caminando**. Cada medidor es una fila, en tu orden de ruta, con la lectura anterior ya puesta. Escribes lo que marca y ves el importe al instante, para cantárselo al vecino ahí mismo.',
        },
        {
          type: 'pasos',
          items: [
            'Elige el mes arriba.',
            'Carga los dos números de **tu** recibo: consumo en kWh e importe en soles. La tarifa aparece sola.',
            'Anota la lectura de cada medidor. **Enter** salta al siguiente.',
            'Cuando termines, presiona **Guardar lecturas**.',
          ],
        },
        {
          type: 'consejo',
          text: 'Mientras escribes, todo se va guardando **en el teléfono**. Si se te cierra la app o te quedas sin señal, al volver a entrar sigue ahí. Recién al presionar Guardar se manda al sistema.',
        },
        {
          type: 'texto',
          text: 'Si una lectura es **menor que la del mes pasado**, la fila se pone en ámbar y no se guarda hasta que la resuelvas: o está mal anotada, o cambiaste el medidor. Si fue lo segundo, toca el botón de las flechitas en esa fila y la cuenta arranca de cero.',
        },
        {
          type: 'ojo',
          text: 'Antes, una lectura que faltaba se restaba y salía un importe **negativo**. Eso ya no puede pasar: sin lectura no hay recibo, y la fila queda en la lista de lo que falta.',
        },
      ],
    },
    {
      id: 'minimo',
      title: 'El cobro mínimo',
      blocks: [
        {
          type: 'texto',
          text: 'Puedes fijar un **monto mínimo**: nadie paga menos de eso, aunque casi no haya consumido. Se configura en la misma pantalla de lecturas, junto a la tarifa.',
        },
        {
          type: 'texto',
          text: 'Sirve para cubrir la energía que se pierde entre lo que compras y lo que miden los medidores. La pantalla te dice, con la tarifa del mes, hasta qué consumo alcanza el mínimo: *"con esta tarifa, el mínimo de S/ 5.00 alcanza a los consumos de hasta 9.5 kWh"*.',
        },
        {
          type: 'consejo',
          text: 'En el recibo del vecino sale la nota **"Se aplicó el consumo mínimo acordado"**, para que entienda por qué paga 5 y no lo que dio su cuenta. Evita la mitad de los reclamos.',
        },
      ],
    },
    {
      id: 'recibos',
      title: 'Emitir, imprimir y cobrar',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Entra a **Recibos de servicio** y elige el mes.',
            'La primera vez, escribe el **número por el que ibas** en tu talonario de papel para seguir la numeración.',
            'Presiona **Emitir recibos**: se generan todos, numerados de corrido.',
            'Usa **Imprimir** para sacarlos todos juntos, o el ícono de cada fila para uno solo.',
            'Cuando alguien paga, presiona **Cobrar**, elige el método y listo: se marca pagado y se imprime.',
          ],
        },
        {
          type: 'texto',
          text: 'Tomar la lectura y emitir el recibo son **dos pasos aparte** a propósito. Las lecturas las corriges todas las veces que quieras; el recibo, una vez emitido, ya tiene número y se lo entregaste al vecino.',
        },
        {
          type: 'consejo',
          text: 'Si vuelves a presionar **Emitir recibos** no se duplica nada: los que ya existen conservan su número y solo se agregan los nuevos. Sirve para cuando cargaste unas lecturas que faltaban.',
        },
        {
          type: 'texto',
          text: 'Cobrar **en efectivo** registra el ingreso en la caja del día, si tienes una abierta. Si no la tienes, el cobro se registra igual.',
        },
        {
          type: 'ojo',
          text: 'Un recibo **anulado** conserva su número: no se reutiliza, igual que en el talonario de papel. Si te equivocaste al marcar un cobro, usa la flecha de deshacer y revisa el movimiento en Caja.',
        },
      ],
    },
    {
      id: 'como-cerro',
      title: 'Saber si el mes te cerró',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba de las dos pantallas hay una línea que compara **lo que compraste con lo que vas a repartir**:',
        },
        {
          type: 'tabla',
          encabezados: ['Lo que dice', 'Qué significa'],
          filas: [
            ['Medido X de Y kWh', 'Cuánto suman todos tus medidores contra lo que dice tu recibo.'],
            ['Sin medir', 'La energía que se perdió. Si sube mes a mes, hay una conexión sin medir o un medidor parado.'],
            ['A cobrar', 'La suma de todos los recibos del mes.'],
            ['Paga', 'Lo que te cobra a ti la distribuidora.'],
            ['Le falta / Le sobra', 'La diferencia. En rojo significa que estás poniendo de tu bolsillo.'],
          ],
        },
        {
          type: 'consejo',
          text: 'Míralo **antes** de emitir los recibos. Si te falta, todavía estás a tiempo de revisar el mínimo o buscar el medidor que no está midiendo.',
        },
      ],
    },
    {
      id: 'el-recibo',
      title: 'Cómo se ve el recibo',
      blocks: [
        {
          type: 'texto',
          text: 'Sale en ticket de 80 mm, con el mismo orden de campos del recibo que llenabas a mano: los datos de tu negocio, el usuario, el detalle del consumo (lectura anterior, actual, diferencia y precio por kWh), el total y la fecha de vencimiento.',
        },
        {
          type: 'texto',
          text: 'El detalle del cálculo va impreso a propósito: es lo primero que te piden cuando alguien reclama, y así no tienes que volver a la casa con el cuaderno.',
        },
        {
          type: 'texto',
          text: 'El **título**, el nombre de la **firma autorizada** y la **frase del pie** los pones en Configuración → Preferencias, debajo del interruptor del módulo.',
        },
        {
          type: 'ojo',
          text: 'La firma es el nombre del responsable impreso al pie, como en el papel. **No es una firma electrónica** ni le da valor tributario al recibo.',
        },
      ],
    },
  ],
}
