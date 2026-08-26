import SwiftUI
import FirebaseAuth
import FirebaseFirestore
import FirebaseMessaging
import UserNotifications

/// Navegación compartida: el aviso tocado deja aquí la conversación a abrir,
/// y la pantalla visible se anota para no molestar con banners de lo que ya
/// estás mirando.
@MainActor
final class Navegacion: ObservableObject {
    static let shared = Navegacion()
    @Published var abrirConversacion: String?
    var conversacionVisible: String?
}

/// Todo el circuito de notificaciones:
/// permiso -> APNs -> token FCM -> Firestore (users/{uid}/fcmTokens/{token},
/// el MISMO formato que la app web/Capacitor, así el servidor no cambia nada:
/// avisarMensajeNuevoWa ya reparte a todos los tokens del usuario).
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        if FirebaseBootstrap.isConfigured {
            Messaging.messaging().delegate = self
        }
        return true
    }

    /// Se llama al entrar a la bandeja (con sesión puesta): pedir el permiso
    /// recién ahí, nunca en el primer arranque a ciegas.
    static func activarNotificaciones() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { concedido, _ in
            guard concedido else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
            // Si el token FCM ya existía de antes, guardarlo ya mismo.
            Messaging.messaging().token { token, _ in
                if let token { AppDelegate.guardarToken(token) }
            }
        }
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        if let fcmToken { AppDelegate.guardarToken(fcmToken) }
    }

    private static func guardarToken(_ token: String) {
        guard FirebaseBootstrap.isConfigured, let uid = Auth.auth().currentUser?.uid else { return }
        Firestore.firestore()
            .collection("users").document(uid)
            .collection("fcmTokens").document(token)
            .setData([
                "token": token,
                "platform": "ios-inbox",
                "createdAt": FieldValue.serverTimestamp(),
                "lastUsed": FieldValue.serverTimestamp(),
            ], merge: true)
    }

    // MARK: - Avisos en pantalla

    /// Con la app abierta: banner y sonido, SALVO que ya estés mirando esa
    /// misma conversación (ahí el mensaje aparece solo y el banner sobra).
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let convId = notification.request.content.userInfo["conversationId"] as? String
        Task { @MainActor in
            if let convId, Navegacion.shared.conversacionVisible == convId {
                completionHandler([])
            } else {
                completionHandler([.banner, .sound, .badge])
            }
        }
    }

    /// Tocar el aviso abre la conversación directo.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let convId = response.notification.request.content.userInfo["conversationId"] as? String
        Task { @MainActor in
            if let convId { Navegacion.shared.abrirConversacion = convId }
            completionHandler()
        }
    }
}
