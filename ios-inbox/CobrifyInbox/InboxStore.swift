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
        #if DEBUG
        if VistaPrevia.activa {
            conversaciones = VistaPrevia.conversaciones
            cargando = false
            return
        }
        #endif
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
        #if DEBUG
        if VistaPrevia.activa {
            mensajes = VistaPrevia.mensajes
            cargando = false
            return
        }
        #endif
        listener = Firestore.firestore()
            .collection("whatsappConversations").document(conversationId)
            .collection("messages")
            .order(by: "timestamp")
            // `toLast` y no `to`: ordenando por fecha ascendente, `limit(to:)`
            // se queda con los mensajes MÁS VIEJOS. En un chat largo eso abría
            // la conversación en historia antigua, sin lo reciente.
            // Ventana corta a propósito: la lista se arma de golpe (no es
            // perezosa) para que el salto al final sea exacto, y eso solo sale
            // barato con pocos mensajes. Son los últimos, que es lo que se lee.
            .limit(toLast: 120)
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

                self.retirarEcosConfirmados()
            }
    }

    /// El servidor ya guardó el mensaje: se le apunta al eco su id de verdad.
    /// Sin esto, un texto CON ENLACE se veía doble: el servidor lo guarda como
    /// imagen con el texto de pie (así el enlace sale con su foto a lo ancho),
    /// y el eco, que era de tipo texto, no calzaba con nada y se quedaba
    /// puesto hasta cerrar la app.
    func confirmar(eco: String, waMessageId: String?) {
        guard let waMessageId else { return }
        if let i = pendientes.firstIndex(where: { $0.id == eco }) {
            pendientes[i].idConfirmado = waMessageId
        }
        retirarEcosConfirmados()
    }

    /// Quita los ecos que el servidor ya tiene guardados.
    private func retirarEcosConfirmados() {
        // Por id de verdad: infalible, aunque lo guardado no se parezca a lo
        // que se mandó.
        let ids = Set(mensajes.map(\.id))
        // Por tipo y texto: red de seguridad para cuando la respuesta del
        // envío se pierde por el camino y nunca llega el id.
        let porTexto = Set(mensajes.filter(\.esSaliente).map { "\($0.tipo)|\($0.texto)" })
        let fuera = pendientes.filter { eco in
            (eco.idConfirmado.map(ids.contains) ?? false) || porTexto.contains("\(eco.tipo)|\(eco.texto)")
        }
        guard !fuera.isEmpty else { return }
        let idsFuera = Set(fuera.map(\.id))
        for id in idsFuera { previasLocales.removeValue(forKey: id) }
        pendientes.removeAll { idsFuera.contains($0.id) }
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
            let id = try await ChatAPI.enviarTexto(conversationId: conversationId, texto: texto, respondeA: respondeA)
            confirmar(eco: eco.id, waMessageId: id)
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
            let id = try await ChatAPI.enviarMedia(conversationId: conversationId,
                                                   base64: datos.base64EncodedString(),
                                                   mimeType: mimeType, filename: filename, caption: caption)
            confirmar(eco: eco.id, waMessageId: id)
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
