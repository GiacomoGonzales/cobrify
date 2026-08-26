import FirebaseCore

/// Enciende Firebase SOLO si el GoogleService-Info.plist es el de verdad.
///
/// El repo trae uno de relleno (con "PENDIENTE" en el app id) para que el
/// proyecto compile y corra antes de registrar la app iOS en la consola de
/// Firebase. Con el de relleno la app arranca igual, pero muestra la pantalla
/// de instrucciones en lugar del login. Al reemplazarlo por el descargado de
/// la consola, todo lo demás funciona sin tocar código.
enum FirebaseBootstrap {
    private(set) static var isConfigured = false

    static func configureIfPossible() {
        guard !isConfigured,
              let url = Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist"),
              let plist = NSDictionary(contentsOf: url),
              let appId = plist["GOOGLE_APP_ID"] as? String,
              !appId.contains("PENDIENTE")
        else { return }
        FirebaseApp.configure()
        isConfigured = true
    }
}
