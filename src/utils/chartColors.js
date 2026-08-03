/**
 * Paleta de los gráficos de reportes.
 *
 * ── Por qué se cambió la paleta anterior ─────────────────────────────────────
 * Los 8 colores viejos NO pasaban el chequeo de daltonismo: `#14b8a6` (turquesa)
 * y `#ec4899` (rosa) eran slots CONTIGUOS con una separación de ΔE 3.7 en
 * deuteranopía — para cerca del 6% de los hombres son el mismo color, y en el
 * pie de métodos de pago caían como porciones vecinas. Además 4 de los 8 no
 * llegaban a 3:1 de contraste contra el fondo.
 *
 * Esta paleta se verificó con el validador (OKLab, simulación de protan/deutan/
 * tritan): peor par contiguo ΔE 9.1, sobre un objetivo de 8. El ORDEN importa:
 * el chequeo es sobre pares contiguos, así que reordenar los slots vuelve a
 * romperlo. Si hay que tocarla, hay que revalidarla, no elegir a ojo.
 */
export const CHART_COLORS = [
  '#2a78d6', // 1 azul
  '#eb6834', // 2 naranja
  '#1baf7a', // 3 aqua
  '#eda100', // 4 amarillo
  '#e87ba4', // 5 magenta
  '#008300', // 6 verde
  '#4a3aa7', // 7 violeta
  '#e34948', // 8 rojo
]

/** Gris para la categoría "Otros" y para series de referencia (período anterior). */
export const CHART_MUTED = '#9ca3af'

/** Cuántas entidades se colorean antes de agrupar el resto en "Otros". */
export const MAX_SERIES = 7

/**
 * Color ESTABLE para una entidad, derivado de su nombre o id.
 *
 * Antes se usaba `COLORS[index % COLORS.length]`, o sea el color salía del
 * PUESTO en el ranking: si Yape era 2° en julio y 3° en agosto, cambiaba de
 * color. Quien ya había aprendido "Yape es verde" leía mal el gráfico siguiente.
 * El color tiene que seguir a la cosa, no a su posición en la tabla.
 *
 * El hash es determinístico (mismo texto → mismo slot siempre) y no depende del
 * conjunto: filtrar una serie no repinta a las que quedan.
 */
export const colorForKey = (key) => {
  const s = String(key ?? '').trim().toLowerCase()
  if (!s) return CHART_MUTED
  // djb2: barato y con buena dispersión para cadenas cortas.
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return CHART_COLORS[Math.abs(h) % CHART_COLORS.length]
}

/**
 * Reparte colores entre varias entidades evitando repetidos.
 *
 * `colorForKey` por sí solo puede mandar dos entidades al mismo slot; en un
 * mismo gráfico eso es indistinguible. Acá se respeta el color preferido de cada
 * una y, si ya está tomado, se toma el siguiente libre. El orden de entrada NO
 * altera el color preferido, así que sigue siendo estable entre períodos.
 *
 * @param {Array<string>} keys - nombres o ids, en el orden en que se dibujan
 * @returns {Map<string,string>} key → color
 */
export const assignColors = (keys = []) => {
  const usados = new Set()
  const out = new Map()

  for (const raw of keys) {
    const key = String(raw ?? '')
    if (out.has(key)) continue
    const preferido = colorForKey(key)
    let color = preferido
    if (usados.has(color)) {
      const desde = CHART_COLORS.indexOf(preferido)
      color = CHART_COLORS.find((c, i) => i > desde && !usados.has(c))
        || CHART_COLORS.find(c => !usados.has(c))
        // Más entidades que slots: mejor gris repetido que dos colores iguales
        // fingiendo ser distintos. Igual `capSeries` debería haber evitado esto.
        || CHART_MUTED
    }
    usados.add(color)
    out.set(key, color)
  }
  return out
}

/**
 * Corta una lista a `MAX_SERIES` y agrupa la cola en un único "Otros".
 *
 * Sin esto, el 9º elemento reciclaba el color del 1º (`% COLORS.length`) y dos
 * cosas distintas salían idénticas. Con métodos de pago configurables y
 * categorías libres eso dejó de ser hipotético.
 *
 * Trabaja sobre la forma `{ name, value }`, que es la que consumen los gráficos
 * de esta página, y devuelve esa misma forma.
 *
 * @param {Array<{name: string, value: number}>} items - ya ordenados de mayor a menor
 */
export const capSeries = (items = [], max = MAX_SERIES) => {
  if (items.length <= max) return items

  const resto = items.slice(max)
  const total = resto.reduce((s, it) => s + (Number(it.value) || 0), 0)

  return [
    ...items.slice(0, max),
    {
      name: `Otros (${resto.length})`,
      value: Math.round(total * 100) / 100,
      color: CHART_MUTED,
      isOthers: true,
    },
  ]
}
