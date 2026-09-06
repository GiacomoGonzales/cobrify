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

    @ViewBuilder private var pantallaReal: some View {
        ZStack {
            if !FirebaseBootstrap.isConfigured {
                SetupNeededView()
            } else if session.user != nil {
                MainTabView()
            } else {
                LoginView()
            }

            if session.restaurando || !minimoCumplido {
                SplashView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.35), value: session.restaurando)
        .animation(.easeInOut(duration: 0.35), value: minimoCumplido)
        .task {
            try? await Task.sleep(for: .milliseconds(900))
            minimoCumplido = true
        }
    }
}
