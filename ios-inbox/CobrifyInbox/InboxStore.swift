import Foundation
import FirebaseFirestore

/// La bandeja en vivo: escucha `whatsappConversations` igual que la web
/// (más reciente primero). Firestore empuja los cambios y además los deja en
/// caché local, así que la lista abre al instante aunque no haya señal.
@MainActor
final class InboxStore: ObservableObject {
    @Published var conversaciones: [Conversacion] = []
    @Published var cargando = true
    @Published var error: String?

    private var listener: ListenerRegistration?

    func empezar() {
        guard listener == nil else { return }
        listener = Firestore.firestore()
            .collection("whatsappConversations")
            .order(by: "ultimoMensajeAt", descending: true)
            .limit(to: 200)
            .addSnapshotListener { [weak self] snap, err in
                guard let self else { return }
                if let err {
                    // El caso típico: la cuenta no está en `admins`.
                    self.error = (err as NSError).domain == FirestoreErrorDomain
                        && (err as NSError).code == FirestoreErrorCode.permissionDenied.rawValue
                        ? "Tu cuenta no tiene acceso a la bandeja de WhatsApp."
                        : "No se pudo cargar la bandeja. Revisa tu conexión."
                    self.cargando = false
                    return
                }
                self.error = nil
                self.cargando = false
                self.conversaciones = snap?.documents.map { Conversacion(id: $0.documentID, data: $0.data()) } ?? []
            }
    }

    func parar() {
        listener?.remove()
        listener = nil
    }

    /// Poner el contador en cero al abrir. Mismo campo que permite la regla
    /// de Firestore; si falla (sin permiso, sin red) no pasa nada grave.
    func marcarLeida(_ conv: Conversacion) {
        guard conv.sinLeer > 0 else { return }
        Firestore.firestore().collection("whatsappConversations").document(conv.id)
            .updateData(["sinLeer": 0, "updatedAt": FieldValue.serverTimestamp()]) { _ in }
    }
}

/// Los mensajes de UNA conversación, del más viejo al más nuevo.
@MainActor
final class MensajesStore: ObservableObject {
    @Published var mensajes: [Mensaje] = []
    @Published var cargando = true

    private var listener: ListenerRegistration?

    func empezar(conversationId: String) {
        guard listener == nil else { return }
        listener = Firestore.firestore()
            .collection("whatsappConversations").document(conversationId)
            .collection("messages")
            .order(by: "timestamp")
            .limit(to: 500)
            .addSnapshotListener { [weak self] snap, _ in
                guard let self else { return }
                self.cargando = false
                self.mensajes = snap?.documents.map { Mensaje(id: $0.documentID, data: $0.data()) } ?? []
            }
    }

    func parar() {
        listener?.remove()
        listener = nil
    }
}
