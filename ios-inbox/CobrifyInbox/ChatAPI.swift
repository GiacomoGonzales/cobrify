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
        var errorDescription: String? { mensaje }
    }

    private static let urlEnvio = URL(string: "https://us-central1-cobrify-395fe.cloudfunctions.net/sendWhatsappMessage")!
    private static let urlEnvioMedia = URL(string: "https://us-central1-cobrify-395fe.cloudfunctions.net/sendWhatsappMediaMessage")!

    static func enviarTexto(conversationId: String, texto: String) async throws {
        guard let user = Auth.auth().currentUser else {
            throw ErrorEnvio(mensaje: "La sesión venció. Vuelve a entrar.", ventanaCerrada: false)
        }
        let token = try await user.getIDToken()

        var req = URLRequest(url: urlEnvio)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "conversationId": conversationId,
            "texto": texto,
        ])

        let (data, resp): (Data, URLResponse)
        do {
            (data, resp) = try await URLSession.shared.data(for: req)
        } catch {
            throw ErrorEnvio(mensaje: "Sin conexión. El mensaje no salió.", ventanaCerrada: false)
        }

        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard status < 300 else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw ErrorEnvio(
                mensaje: json?["error"] as? String ?? "No se pudo enviar el mensaje.",
                ventanaCerrada: json?["ventanaCerrada"] as? Bool ?? false
            )
        }
    }

    /// Envía una foto, un audio o un PDF: el archivo viaja en base64 y el
    /// servidor lo guarda en nuestro almacenamiento antes de pasarlo a Meta —
    /// la MISMA ruta que la web, el historial vive en un solo lugar.
    static func enviarMedia(conversationId: String, base64: String, mimeType: String,
                            filename: String, caption: String) async throws {
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
    }
}
