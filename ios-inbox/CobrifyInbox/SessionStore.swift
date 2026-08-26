import Foundation
import FirebaseAuth

/// La sesión del usuario, con el mismo Firebase Auth que la web y la app de
/// Capacitor: la misma cuenta de siempre sirve aquí sin registrar nada.
@MainActor
final class SessionStore: ObservableObject {
    @Published var user: User?
    @Published var isWorking = false
    @Published var errorMessage: String?

    private var handle: AuthStateDidChangeListenerHandle?

    init() {
        guard FirebaseBootstrap.isConfigured else { return }
        // El listener es la única fuente de verdad del estado: restaura la
        // sesión guardada al abrir y reacciona a login/logout.
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in self?.user = user }
        }
    }

    func signIn(email: String, password: String) async {
        errorMessage = nil
        isWorking = true
        defer { isWorking = false }
        do {
            try await Auth.auth().signIn(withEmail: email.trimmingCharacters(in: .whitespaces),
                                         password: password)
        } catch {
            errorMessage = Self.mensaje(de: error)
        }
    }

    func signOut() {
        try? Auth.auth().signOut()
    }

    /// Errores de Auth en cristiano. Firebase agrupa casi todos los fallos de
    /// credenciales en uno solo para no revelar si el correo existe.
    private static func mensaje(de error: Error) -> String {
        let code = AuthErrorCode(rawValue: (error as NSError).code)
        switch code {
        case .invalidEmail:
            return "Ese correo no tiene formato válido."
        case .wrongPassword, .invalidCredential, .userNotFound:
            return "Correo o contraseña incorrectos."
        case .userDisabled:
            return "Esta cuenta está deshabilitada."
        case .tooManyRequests:
            return "Demasiados intentos. Espera un momento y vuelve a probar."
        case .networkError:
            return "Sin conexión. Revisa tu internet e intenta de nuevo."
        default:
            return "No se pudo iniciar sesión. Intenta de nuevo."
        }
    }
}
