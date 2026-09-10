import { Component } from 'react'
import { esFalloDeDescarga, decidirRecarga, CLAVE_RECARGA } from '@/utils/fallosDeCarga'

/**
 * LA RED DE SEGURIDAD DEL ARRANQUE.
 *
 * Hasta ahora Cobrify no tenía ninguna: cualquier error al pintar dejaba la
 * pantalla EN BLANCO, sin un mensaje ni un botón. La persona no tenía forma de
 * saber si se había colgado, si no había internet o si su cuenta tenía algo
 * raro; lo único que le quedaba era recargar a ver si sonaba la flauta.
 *
 * El caso frecuente —y el que se reportó— es que falte el archivo de una
 * pantalla porque hubo un despliegue nuevo mientras la pestaña estaba abierta
 * (el porqué está en src/utils/fallosDeCarga.js). Eso lo arregla una recarga,
 * así que la hace sola, UNA vez. Si vuelve a pasar al toque, ya no insiste:
 * recargar en bucle es peor que mostrar el problema.
 *
 * Para cualquier otro error muestra algo legible y un botón, en vez de nada.
 */
class RecuperacionDeCarga extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, recargando: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Al log igual: que se recupere sola no quiere decir que haya que
    // enterarse tarde de que algo se rompió.
    console.error('Fallo al pintar la aplicación:', error, info?.componentStack)
    if (esFalloDeDescarga(error)) this.recargarUnaVez()
  }

  /** Recarga si no venimos de recargar hace un momento. */
  recargarUnaVez() {
    let anotado = null
    try { anotado = sessionStorage.getItem(CLAVE_RECARGA) } catch (e) { /* modo privado */ }

    const { recargar } = decidirRecarga(Date.now(), anotado)
    if (!recargar) return

    try { sessionStorage.setItem(CLAVE_RECARGA, String(Date.now())) } catch (e) { /* idem */ }
    this.setState({ recargando: true })
    window.location.reload()
  }

  render() {
    const { error, recargando } = this.state
    if (!error) return this.props.children

    const esDescarga = esFalloDeDescarga(error)

    if (recargando) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-4 text-sm text-gray-500">Actualizando a la versión nueva...</p>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-sm w-full bg-white border border-gray-200 rounded-xl p-6 text-center">
          <h1 className="text-base font-semibold text-gray-900">
            {esDescarga ? 'No se pudo terminar de cargar' : 'Algo salió mal al abrir esta pantalla'}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {esDescarga
              ? 'Puede ser tu conexión. Vuelve a intentarlo; si sigue igual, cierra la pestaña y entra de nuevo.'
              : 'Vuelve a intentarlo. Si se repite, avísanos qué estabas haciendo.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Reintentar
          </button>
          {/* El mensaje crudo, chico y abajo: para soporte vale oro y al
              usuario no le estorba. */}
          <p className="mt-3 text-[11px] text-gray-400 break-words select-text">
            {String(error?.message || error).slice(0, 200)}
          </p>
        </div>
      </div>
    )
  }
}

export default RecuperacionDeCarga
