/**
 * CUÁNDO UNA CUENTA ES UNA PRUEBA, en un solo sitio.
 *
 * El plan `trial` existía en el catálogo desde hace tiempo con
 * `sunatIntegration: false`, pero esa bandera NO LA COMPROBABA NADIE: aparecía
 * en dos pantallas que la muestran y en ningún sitio que la haga cumplir. Una
 * cuenta de prueba podía mandar a SUNAT igual que una pagada, y SUNAT la
 * rechazaba por certificado — error feo para el que probaba y un rechazo más
 * en las estadísticas.
 *
 * Acá vive el criterio, y lo usan el servidor (que es quien de verdad bloquea)
 * y las pantallas (que avisan antes de que el usuario lo intente).
 *
 * Se mira el PLAN y no la bandera de límites: los límites de una suscripción
 * se congelan al contratarla y un plan a medida puede traer cualquier cosa. El
 * plan es lo que no miente.
 */

/**
 * Los días que dura una prueba.
 *
 * Giacomo lo movió dos veces el 10-set-2026: uno, luego siete, y al final
 * TRES. Tres da para bajarse la app y probarla en serio, pero es corto
 * suficiente para que el seguimiento llegue mientras todavía se acuerda.
 */
export const DIAS_DE_PRUEBA = 3

/** ¿Esta suscripción es un periodo de prueba? */
export function esPrueba(suscripcion) {
  return String(suscripcion?.plan || '') === 'trial'
}

/**
 * ¿Puede esta cuenta mandar comprobantes a SUNAT?
 *
 * Una prueba NO. Emite igual —para eso es una prueba— pero lo que salga lleva
 * su marca de "sin validez" y se queda en casa. El día que pague, se convierte
 * la MISMA cuenta y se le desbloquea todo, con lo que ya cargó dentro.
 */
export function puedeEnviarASunat(suscripcion) {
  return !esPrueba(suscripcion)
}

/** Lo que se imprime en un comprobante de prueba, para que nadie lo confunda. */
export const LEYENDA_SIN_VALIDEZ = 'DOCUMENTO DE PRUEBA - SIN VALIDEZ TRIBUTARIA'
