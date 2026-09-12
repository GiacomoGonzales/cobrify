import Foundation
import FirebaseAuth

/// Envío de mensajes: la MISMA Cloud Function que usa la web
/// (sendWhatsappMessage). El texto no se escribe en Firestore desde aquí:
/// lo guarda el servidor con el id que devuelve WhatsApp, y la pantalla lo
/// ve llegar por la suscripción — una sola versión de cada mensaje.
enum ChatAPI {
    struct ErrorEnvio: LocalizedError {
        let mensaje: String
        let ventanaCerrada: Bool
        /// El pedido salió pero la respuesta no volvió (señal que se cae, la
        /// app que se suspende): el servidor pudo haberlo mandado igual. No es
        /// lo mismo que un rechazo, y no hay que decir "no salió".
        var incierto = false
        var errorDescription: String? { mensaje }
    }

    private static let urlEnvio = URL(string: "https://us-central1-cobrify-395fe.cloudfunctions.net/sendWhatsappMessage")!
    private static let urlEnvioMedia = URL(string: "https://us-central1-cobrify-395fe.cloudfunctions.net/sendWhatsappMediaMessage")!

    /// Devuelve el id con el que el servidor guardó el mensaje.
    @discardableResult
    static func enviarTexto(conversationId: String, texto: String, respondeA: String? = nil) async throws -> String? {
        guard let user = Auth.auth().currentUser else {
            throw ErrorEnvio(mensaje: "La sesión venció. Vuelve a entrar.", ventanaCerrada: false)
        }
        let token = try await user.getIDToken()

        var req = URLRequest(url: urlEnvio)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        var cuerpo: [String: Any] = ["conversationId": conversationId, "texto": texto]
        if let respondeA { cuerpo["respondeA"] = respondeA }
        req.httpBody = try JSONSerialization.data(withJSONObject: cuerpo)

        let (data, resp): (Data, URLResponse)
        do {
            (data, resp) = try await URLSession.shared.data(for: req)
        } catch {
            // Sin red desde el principio: el pedido ni salió del iPhone.
            let nuncaSalio: Set<URLError.Code> = [.notConnectedToInternet, .cannotFindHost,
                                                   .cannotConnectToHost, .dnsLookupFailed]
            if let codigo = (error as? URLError)?.code, nuncaSalio.contains(codigo) {
                throw ErrorEnvio(mensaje: "Sin conexión. El mensaje no salió.", ventanaCerrada: false)
            }
            // Lo demás (se cortó, tardó demasiado) pasa con el pedido ya en
            // camino: el servidor pudo haberlo mandado.
            throw ErrorEnvio(mensaje: "No se pudo confirmar si el mensaje salió. Míralo en la conversación antes de reenviarlo.",
                             ventanaCerrada: false, incierto: true)
        }

        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard status < 300 else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw ErrorEnvio(
                mensaje: json?["error"] as? String ?? "No se pudo enviar el mensaje.",
                ventanaCerrada: json?["ventanaCerrada"] as? Bool ?? false
            )
        }
        return idDelMensaje(data)
    }

    /// El id que el servidor le puso al mensaje. Los tres envíos lo devuelven.
    private static func idDelMensaje(_ data: Data) -> String? {
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        return json?["waMessageId"] as? String
    }

    /// Reaccionar a un mensaje (emoji vacío = quitar la reacción).
    static func reaccionar(conversationId: String, waMessageId: String, emoji: String) async throws {
        _ = try await postFn("sendWhatsappReactionFn", [
            "conversationId": conversationId,
            "waMessageId": waMessageId,
            "emoji": emoji,
        ])
    }

    /// Avisar a WhatsApp que leímos: al cliente le salen las palomitas azules.
    /// Falla en silencio — un read receipt perdido no es grave.
    static func marcarLeidoWhatsApp(conversationId: String, waMessageId: String) async {
        _ = try? await postFn("markWhatsappRead", [
            "conversationId": conversationId,
            "waMessageId": waMessageId,
        ])
    }

    /// Envía un archivo que YA está guardado (el de una respuesta rápida):
    /// viaja solo su dirección, no el archivo — instantáneo aunque pese 15 MB.
    @discardableResult
    static func enviarMediaGuardada(conversationId: String, media: MediaBiblioteca, caption: String) async throws -> String? {
        guard let user = Auth.auth().currentUser else {
            throw ErrorEnvio(mensaje: "La sesión venció. Vuelve a entrar.", ventanaCerrada: false)
        }
        let token = try await user.getIDToken()
        var req = URLRequest(url: urlEnvioMedia)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        // El servidor espera mediaUrl suelto, NO un objeto media: mandarlo
        // anidado hacía que rechazara el envío por "falta el archivo".
        var cuerpo: [String: Any] = [
            "conversationId": conversationId,
            "mediaUrl": media.url,
            "mimeType": media.mimeType,
            "caption": caption,
        ]
        if let nombre = media.filename { cuerpo["filename"] = nombre }
        req.httpBody = try JSONSerialization.data(withJSONObject: cuerpo)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard status < 300 else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw ErrorEnvio(mensaje: json?["error"] as? String ?? "No se pudo enviar.",
                             ventanaCerrada: json?["ventanaCerrada"] as? Bool ?? false)
        }
        return idDelMensaje(data)
    }

    /// Sube un archivo a la biblioteca (para las respuestas rápidas): queda
    /// guardado en R2 y se reutiliza por referencia en cada envío.
    static func subirABiblioteca(datos: Data, mimeType: String, filename: String) async throws -> MediaBiblioteca {
        let json = try await postFn("uploadWhatsappLibraryMedia", [
            "base64": datos.base64EncodedString(),
            "mimeType": mimeType,
            "filename": filename,
        ])
        guard let m = json["media"] as? [String: Any], let media = MediaBiblioteca(m) else {
            throw ErrorEnvio(mensaje: "El servidor no devolvió el archivo.", ventanaCerrada: false)
        }
        return media
    }

    /// Envía una foto, un audio o un PDF: el archivo viaja en base64 y el
    /// servidor lo guarda en nuestro almacenamiento antes de pasarlo a Meta —
    /// la MISMA ruta que la web, el historial vive en un solo lugar.
    @discardableResult
    static func enviarMedia(conversationId: String, base64: String, mimeType: String,
                            filename: String, caption: String) async throws -> String? {
        guard let user = Auth.auth().currentUser else {
            throw ErrorEnvio(mensaje: "La sesión venció. Vuelve a entrar.", ventanaCerrada: false)
        }
        let token = try await user.getIDToken()

        var req = URLRequest(url: urlEnvioMedia)
        req.httpMethod = "POST"
        req.timeoutInterval = 120  // un video o PDF grande tarda
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "conversationId": conversationId,
            "base64": base64,
            "mimeType": mimeType,
            "filename": filename,
            "caption": caption,
        ])

        let (data, resp): (Data, URLResponse)
        do {
            (data, resp) = try await URLSession.shared.data(for: req)
        } catch {
            throw ErrorEnvio(mensaje: "Sin conexión. El archivo no salió.", ventanaCerrada: false)
        }
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard status < 300 else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw ErrorEnvio(
                mensaje: json?["error"] as? String ?? "No se pudo enviar el archivo.",
                ventanaCerrada: json?["ventanaCerrada"] as? Bool ?? false
            )
        }
        return idDelMensaje(data)
    }
}
