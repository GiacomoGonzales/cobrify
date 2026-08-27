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
    @Published var pendientes: [Mensaje] = []
    @Published var cargando = true
    /// Fotos que aún viajan, para pintarlas en su burbuja mientras suben.
    @Published var previasLocales: [String: Data] = [:]

    /// Reacciones que ya tocaste pero el servidor todavía no confirma
    /// (cadena vacía = la quitaste). Se aplican encima de lo que hay.
    private var reaccionesOptimistas: [String: String] = [:]

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
                let llegados = snap?.documents.map { Mensaje(id: $0.documentID, data: $0.data()) } ?? []
                self.mensajes = llegados

                // Una reacción deja de ser optimista cuando el servidor trae
                // ese mismo valor: ahí ya manda el dato real.
                for (id, emoji) in self.reaccionesOptimistas {
                    if let m = llegados.first(where: { $0.id == id }),
                       (m.reaccionMia ?? "") == emoji {
                        self.reaccionesOptimistas.removeValue(forKey: id)
                    }
                }
                self.aplicarReaccionesOptimistas()

                // El eco optimista se retira cuando el servidor ya guardó el
                // mensaje de verdad (mismo texto, dirección saliente).
                let confirmados = Set(self.mensajes.filter(\.esSaliente).map { "\($0.tipo)|\($0.texto)" })
                let retirados = self.pendientes.filter { confirmados.contains("\($0.tipo)|\($0.texto)") }
                for r in retirados { self.previasLocales.removeValue(forKey: r.id) }
                self.pendientes.removeAll { confirmados.contains("\($0.tipo)|\($0.texto)") }
            }
    }

    private func aplicarReaccionesOptimistas() {
        for (id, emoji) in reaccionesOptimistas {
            guard let i = mensajes.firstIndex(where: { $0.id == id }) else { continue }
            mensajes[i].reaccionMia = emoji.isEmpty ? nil : emoji
        }
    }

    /// Reacciona al instante: el emoji aparece antes de que el servidor
    /// responda, y si el envío falla se revierte solo.
    func reaccionar(conversationId: String, mensaje: Mensaje, emoji: String) async {
        // Tocar el mismo emoji lo quita.
        let nuevo = (mensaje.reaccionMia == emoji) ? "" : emoji
        let previo = mensaje.reaccionMia
        reaccionesOptimistas[mensaje.id] = nuevo
        aplicarReaccionesOptimistas()
        do {
            try await ChatAPI.reaccionar(conversationId: conversationId,
                                         waMessageId: mensaje.id, emoji: nuevo)
        } catch {
            reaccionesOptimistas.removeValue(forKey: mensaje.id)
            if let i = mensajes.firstIndex(where: { $0.id == mensaje.id }) {
                mensajes[i].reaccionMia = previo
            }
        }
    }

    /// Envía por la Cloud Function con eco optimista. Devuelve el mensaje de
    /// error si algo salió mal (nil = enviado).
    func enviar(texto: String, conversationId: String, respondeA: String? = nil) async -> String? {
        let eco = Mensaje(pendiente: texto)
        pendientes.append(eco)
        do {
            try await ChatAPI.enviarTexto(conversationId: conversationId, texto: texto, respondeA: respondeA)
            return nil
        } catch {
            pendientes.removeAll { $0.id == eco.id }
            return (error as? ChatAPI.ErrorEnvio)?.mensaje ?? "No se pudo enviar el mensaje."
        }
    }

    /// Envía un archivo con eco optimista. Devuelve el error o nil.
    func enviarMedia(conversationId: String, datos: Data, mimeType: String,
                     filename: String, caption: String, tipo: String) async -> String? {
        let eco = Mensaje(pendienteTipo: tipo, texto: caption)
        pendientes.append(eco)
        // La foto se ve en su burbuja desde el primer instante, no un cartel
        // de "Enviando…" sobre un hueco.
        if tipo == "image" { previasLocales[eco.id] = datos }
        do {
            try await ChatAPI.enviarMedia(conversationId: conversationId,
                                          base64: datos.base64EncodedString(),
                                          mimeType: mimeType, filename: filename, caption: caption)
            return nil
        } catch {
            pendientes.removeAll { $0.id == eco.id }
            previasLocales.removeValue(forKey: eco.id)
            return (error as? ChatAPI.ErrorEnvio)?.mensaje ?? "No se pudo enviar el archivo."
        }
    }

    func parar() {
        listener?.remove()
        listener = nil
    }
}
