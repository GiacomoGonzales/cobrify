import Foundation
import FirebaseFirestore

/// Una conversación de la bandeja. Espejo de los documentos de
/// `whatsappConversations`, que escribe SOLO el servidor (el webhook).
struct Conversacion: Identifiable, Equatable {
    let id: String
    var nombre: String?
    var waId: String
    var ultimoMensaje: String
    var ultimoMensajeAt: Date?
    var ultimaDireccion: String?
    var sinLeer: Int
    var estado: String
    var linkedBusinessName: String?
    var optOut: Bool
    var ventanaVenceAt: Date?

    init(id: String, data: [String: Any]) {
        self.id = id
        nombre = data["nombre"] as? String
        waId = data["waId"] as? String ?? ""
        ultimoMensaje = data["ultimoMensaje"] as? String ?? ""
        ultimoMensajeAt = (data["ultimoMensajeAt"] as? Timestamp)?.dateValue()
        ultimaDireccion = data["ultimaDireccion"] as? String
        sinLeer = data["sinLeer"] as? Int ?? 0
        estado = data["estado"] as? String ?? "abierta"
        linkedBusinessName = data["linkedBusinessName"] as? String
        optOut = data["optOut"] as? Bool ?? false
        ventanaVenceAt = (data["ventanaVenceAt"] as? Timestamp)?.dateValue()
    }

    var titulo: String {
        if let nombre, !nombre.isEmpty { return nombre }
        return Formato.numero(waId)
    }
    var inicial: String { String(titulo.trimmingCharacters(in: .whitespaces).first ?? "#").uppercased() }
}

/// Un mensaje dentro de una conversación. Mismo vocabulario que el webhook:
/// direccion entrante/saliente, tipo de Meta (text, image, audio…), estado
/// sent/delivered/read/failed para los nuestros.
struct Mensaje: Identifiable, Equatable {
    let id: String
    var direccion: String
    var tipo: String
    var texto: String
    var estado: String?
    var timestamp: Date?
    var media: MediaAdjunto?

    init(id: String, data: [String: Any]) {
        self.id = id
        direccion = data["direccion"] as? String ?? "entrante"
        tipo = data["tipo"] as? String ?? "text"
        texto = data["texto"] as? String ?? ""
        estado = data["estado"] as? String
        timestamp = (data["timestamp"] as? Timestamp)?.dateValue()
        if let m = data["media"] as? [String: Any] {
            media = MediaAdjunto(
                url: m["url"] as? String,
                thumbUrl: m["thumbUrl"] as? String,
                mimeType: m["mimeType"] as? String,
                filename: m["filename"] as? String,
                ancho: m["ancho"] as? Int,
                alto: m["alto"] as? Int
            )
        }
    }

    var esSaliente: Bool { direccion == "saliente" }
}

struct MediaAdjunto: Equatable {
    var url: String?
    var thumbUrl: String?
    var mimeType: String?
    var filename: String?
    var ancho: Int?
    var alto: Int?
}

/// Formatos compartidos, calcados de la web para que las dos pantallas
/// digan lo mismo.
enum Formato {
    /// 51955778215 -> +51 955 778 215 (el resto de países, +numero pelado)
    static func numero(_ waId: String) -> String {
        guard !waId.isEmpty else { return "" }
        if waId.hasPrefix("51") && waId.count == 11 {
            let d = Array(waId)
            return "+51 \(String(d[2...4])) \(String(d[5...7])) \(String(d[8...10]))"
        }
        return "+\(waId)"
    }

    /// Hoy solo la hora; antes, también el día.
    static func hora(_ fecha: Date?) -> String {
        guard let fecha else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_PE")
        if Calendar.current.isDateInToday(fecha) {
            f.dateFormat = "HH:mm"
        } else if Calendar.current.isDateInYesterday(fecha) {
            return "ayer"
        } else {
            f.dateFormat = "dd/MM"
        }
        return f.string(from: fecha)
    }

    static func horaCorta(_ fecha: Date?) -> String {
        guard let fecha else { return "" }
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: fecha)
    }

    /// Título del separador de día en la conversación.
    static func dia(_ fecha: Date) -> String {
        if Calendar.current.isDateInToday(fecha) { return "Hoy" }
        if Calendar.current.isDateInYesterday(fecha) { return "Ayer" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_PE")
        f.dateFormat = "EEEE d 'de' MMMM"
        return f.string(from: fecha).capitalized
    }

    /// Qué se muestra en la lista cuando el último mensaje fue un adjunto.
    static func resumen(_ texto: String) -> String {
        switch texto {
        case "[image]": return "📷 Foto"
        case "[video]": return "🎬 Video"
        case "[audio]": return "🎤 Audio"
        case "[document]": return "📄 Documento"
        case "[sticker]": return "Sticker"
        default: return texto
        }
    }
}
