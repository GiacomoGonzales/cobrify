import SwiftUI
import FirebaseCore

@main
struct InboxApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var session: SessionStore

    init() {
        // Caché de red generoso: el visor y las descargas reaprovechan lo ya
        // bajado (R2 sirve todo como inmutable).
        URLCache.shared = URLCache(memoryCapacity: 32 * 1024 * 1024,
                                   diskCapacity: 256 * 1024 * 1024)
        FirebaseBootstrap.configureIfPossible()
        _session = StateObject(wrappedValue: SessionStore())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
        }
    }
}

/// Decide qué se muestra según el estado real: sin Firebase configurado,
/// sin sesión, o adentro.
struct RootView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        #if DEBUG
        if VistaPrevia.activa {
            VistaPrevia.pantalla
        } else {
            pantallaReal
        }
        #else
        pantallaReal
        #endif
    }

    /// El mínimo que se queda el splash aunque Firebase conteste al instante:
    /// un fogonazo de 50 ms se ve peor que medio segundo tranquilo.
    @State private var minimoCumplido = false

    private var enSplash: Bool { session.restaurando || !minimoCumplido }

    @ViewBuilder private var pantallaReal: some View {
        ZStack {
            Group {
                if !FirebaseBootstrap.isConfigured {
                    SetupNeededView()
                } else if session.user != nil {
                    MainTabView()
                } else {
                    LoginView()
                }
            }
            // OJO: la app NO se anima. Escalarla y atenuarla obligaba al
            // sistema a rasterizar toda la pantalla —pestañas, vidrios, foto
            // de fondo— y en el telefono se veia rayada y tosca. Se queda
            // quieta y entera; lo unico que se mueve es el splash, que es una
            // vista simple y se desvanece encima sin coste.

            if enSplash {
                SplashView()
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.45), value: enSplash)
        .task {
            try? await Task.sleep(for: .milliseconds(900))
            minimoCumplido = true
        }
    }
}
