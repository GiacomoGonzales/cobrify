import UIKit
import Capacitor

/**
 * ViewController principal de la app.
 *
 * Existe solo para registrar los plugins nativos PROPIOS de Cobrify (los que viven en
 * este proyecto Xcode, no en node_modules).
 *
 * Por qué hace falta: en iOS, Capacitor autorregistra únicamente las clases que lista
 * `capacitor.config.json > packageClassList`, y ese archivo lo REGENERA `npx cap sync`
 * a partir de los paquetes npm instalados. Un plugin local nunca entra ahí, así que
 * agregarlo a mano se perdería en el siguiente sync. `registerPluginInstance` desde
 * `capacitorDidLoad()` es el punto oficial y sobrevive a los syncs.
 *
 * (En Android el equivalente es el `registerPlugin(...)` de MainActivity.java.)
 */
class MainViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(TcpPrinterPlugin())
    }
}
