import SwiftUI
import FirebaseCore

@main
struct InboxApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var session: SessionStore

    init() {
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
        if !FirebaseBootstrap.isConfigured {
            SetupNeededView()
        } else if session.user != nil {
            MainTabView()
        } else {
            LoginView()
        }
    }
}
