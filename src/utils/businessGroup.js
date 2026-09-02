/**
 * GRUPO DE FIDELIZACIÓN: dos negocios que comparten tarjetas y cupones.
 *
 * Caso a medida (MANDIL TEX MEX y VAPORES Y DELICIAS, 01-sep-2026): son dos
 * RUCs distintos —o sea dos empresas, cada una con su facturación— pero un
 * mismo grupo de cara al público. Quieren una sola tarjeta de sellos: que un
 * sello ganado en un local sume en el otro, y que el premio se canjee en
 * cualquiera de los dos.
 *
 * NO se pueden fusionar en un negocio con sucursales: con dos RUCs cada
 * comprobante tiene que salir de su propia empresa. Y no hace falta fusionar
 * la base de clientes: la tarjeta se identifica por el TELÉFONO
 * (`loyaltyCards/{phoneKey}`) y ya guarda el nombre, así que se basta sola.
 * Compartiendo solo las tarjetas y los cupones se consigue lo que pidieron
 * tocando una fracción del sistema.
 *
 * CÓMO FUNCIONA: uno de los dos negocios GUARDA los datos y el otro apunta a
 * él con `loyaltyGroupId`. El que guarda tiene el campo apuntando a sí mismo,
 * para que las dos cuentas resuelvan al mismo lugar sin casos especiales.
 *
 * QUÉ SE COMPARTE
 *   - `loyaltyCards` y sus movimientos: los sellos.
 *   - `loyaltyConfig`: la meta, el premio, la vigencia y el tema de la
 *     tarjeta digital. Tiene que ser UNA: si cada local pusiera la suya, la
 *     misma tarjeta significaría cosas distintas según dónde la presenten.
 *   - `coupons`: los códigos de descuento. Solo tienen código, valor y tope de
 *     usos, ningún producto, así que valen igual en los dos.
 *
 * QUÉ NO
 *   - Los productos, el stock, los clientes y los comprobantes: cada empresa
 *     con lo suyo.
 *   - Las promociones por horario (`scheduledDiscounts`): apuntan a productos
 *     y categorías de cada negocio, y los menús son distintos. Compartirlas
 *     apuntaría a productos que del otro lado no existen.
 *   - Los certificados de regalo: son dinero. Uno vendido por una empresa y
 *     canjeado por la otra es una deuda cruzada entre dos RUCs; eso se decide
 *     en la contabilidad de ellos, no acá.
 */

/** El campo que arma el grupo. Vacío = el negocio trabaja solo, como siempre. */
export const CAMPO_GRUPO = 'loyaltyGroupId'

/**
 * Dónde viven las tarjetas y los cupones de este negocio.
 *
 * @param {object} negocio    el documento del negocio (businessSettings, o el
 *                            que lee el catálogo público)
 * @param {string} propioId   el id del negocio que está operando
 * @returns {string} el id bajo el que hay que leer y escribir
 */
export const idDeFidelizacion = (negocio, propioId) => {
  const grupo = String(negocio?.[CAMPO_GRUPO] || '').trim()
  return grupo || propioId
}

/**
 * ¿Este negocio comparte con otro?
 *
 * Falso cuando no hay grupo, y también cuando el grupo es él mismo: ahí no hay
 * nada que avisar, los datos están donde siempre estuvieron.
 */
export const comparteGrupo = (negocio, propioId) => {
  const grupo = idDeFidelizacion(negocio, propioId)
  return !!propioId && grupo !== propioId
}

/**
 * ¿Este negocio es el que GUARDA los datos del grupo?
 *
 * Sirve para avisar en pantalla: el que guarda ve las tarjetas de los dos, y
 * conviene que sepa por qué.
 */
export const guardaElGrupo = (negocio, propioId) => {
  const grupo = String(negocio?.[CAMPO_GRUPO] || '').trim()
  return !!grupo && !!propioId && grupo === propioId
}
