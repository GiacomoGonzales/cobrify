import SwiftUI
import FirebaseFirestore

struct Etiqueta: Identifiable, Equatable {
    let id: String
    var nombre: String
    var colorHex: String
    var color: Color { Color(hex: colorHex) }
}

struct RespuestaRapida: Identifiable, Equatable {
    var id: String { atajo }
    var atajo: String
    var texto: String
    var media: [String: String]?

    static func == (a: RespuestaRapida, b: RespuestaRapida) -> Bool {
        a.atajo == b.atajo && a.texto == b.texto && a.media == b.media
    }
}

/// Catálogos compartidos de la bandeja: etiquetas y respuestas rápidas.
/// Los mismos documentos que gobierna la web (whatsappSettings/*).
@MainActor
final class CatalogoStore: ObservableObject {
    static let shared = CatalogoStore()

    @Published var etiquetas: [Etiqueta] = []
    @Published var respuestasRapidas: [RespuestaRapida] = []

    private var listeners: [ListenerRegistration] = []

    func empezar() {
        guard listeners.isEmpty else { return }
        let db = Firestore.firestore()
        listeners.append(db.collection("whatsappSettings").document("etiquetas")
            .addSnapshotListener { [weak self] snap, _ in
                let lista = snap?.data()?["lista"] as? [[String: Any]] ?? []
                self?.etiquetas = lista.compactMap { e in
                    guard let id = e["id"] as? String else { return nil }
                    return Etiqueta(id: id,
                                    nombre: e["nombre"] as? String ?? id,
                                    colorHex: e["color"] as? String ?? "#6B7280")
                }
            })
        listeners.append(db.collection("whatsappSettings").document("automaticos")
            .addSnapshotListener { [weak self] snap, _ in
                let lista = snap?.data()?["respuestasRapidas"] as? [[String: Any]] ?? []
                self?.respuestasRapidas = lista.compactMap { r in
                    guard let atajo = r["atajo"] as? String else { return nil }
                    var media: [String: String]?
                    if let m = r["media"] as? [String: Any] {
                        media = m.compactMapValues { $0 as? String }
                    }
                    return RespuestaRapida(atajo: atajo,
                                           texto: r["texto"] as? String ?? "",
                                           media: media)
                }
            })
    }

    /// Crear una carpeta nueva = agregar una etiqueta al catálogo compartido
    /// (whatsappSettings/etiquetas), el mismo que edita la web.
    func crearEtiqueta(nombre: String, colorHex: String) async -> String? {
        let limpio = nombre.trimmingCharacters(in: .whitespaces)
        guard !limpio.isEmpty else { return "Ponle un nombre." }
        // "Pagó - Implementación" -> "pago-implementacion"
        let id = limpio.lowercased()
            .folding(options: .diacriticInsensitive, locale: Locale(identifier: "es"))
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        guard !id.isEmpty else { return "Ponle un nombre válido." }
        guard !etiquetas.contains(where: { $0.id == id }) else { return "Ya existe una carpeta con ese nombre." }

        let lista = (etiquetas + [Etiqueta(id: id, nombre: limpio, colorHex: colorHex)])
            .map { ["id": $0.id, "nombre": $0.nombre, "color": $0.colorHex] }
        do {
            try await Firestore.firestore().collection("whatsappSettings").document("etiquetas")
                .setData(["lista": lista, "updatedAt": FieldValue.serverTimestamp()], merge: true)
            return nil
        } catch {
            return "No se pudo crear la carpeta."
        }
    }

    /// Guarda la lista completa de respuestas rápidas en el documento
    /// compartido con la web (whatsappSettings/automaticos). merge:true
    /// respeta bienvenida y ausencia, que viven en el mismo documento.
    func guardarRespuestasRapidas(_ lista: [RespuestaRapida]) async -> String? {
        let arr = lista.map { r -> [String: Any] in
            var d: [String: Any] = ["atajo": r.atajo, "texto": r.texto]
            if let m = r.media { d["media"] = m }
            return d
        }
        do {
            try await Firestore.firestore().collection("whatsappSettings").document("automaticos")
                .setData(["respuestasRapidas": arr, "updatedAt": FieldValue.serverTimestamp()], merge: true)
            return nil
        } catch {
            return "No se pudo guardar. Revisa tu conexión."
        }
    }

    // ---------- Acciones sobre una conversación ----------
    // Las reglas de Firestore solo dejan tocar estos campos; los mensajes
    // siguen siendo territorio del servidor.

    static let ESTADOS: [(id: String, nombre: String, icono: String)] = [
        ("abierta", "Abierta", "tray.full"),
        ("pendiente", "Pendiente", "clock"),
        ("completada", "Completada", "checkmark.circle"),
    ]

    func cambiarEstado(_ conversationId: String, a estado: String) {
        Firestore.firestore().collection("whatsappConversations").document(conversationId)
            .updateData(["estado": estado, "updatedAt": FieldValue.serverTimestamp()]) { _ in }
    }

    func alternarEtiqueta(_ conversationId: String, tagId: String, tiene: Bool) {
        Firestore.firestore().collection("whatsappConversations").document(conversationId)
            .updateData([
                "etiquetas": tiene ? FieldValue.arrayRemove([tagId]) : FieldValue.arrayUnion([tagId]),
                "updatedAt": FieldValue.serverTimestamp(),
            ]) { _ in }
    }

    func guardarNota(_ conversationId: String, nota: String) {
        let limpia = nota.trimmingCharacters(in: .whitespacesAndNewlines)
        Firestore.firestore().collection("whatsappConversations").document(conversationId)
            .updateData(["nota": limpia.isEmpty ? NSNull() : limpia,
                         "updatedAt": FieldValue.serverTimestamp()]) { _ in }
    }
}

extension Color {
    /// "#1B6E4A" -> Color. Negro si viene malformado.
    init(hex: String) {
        var h = hex.trimmingCharacters(in: .whitespaces)
        if h.hasPrefix("#") { h.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: h).scanHexInt64(&v)
        self.init(.sRGB,
                  red: Double((v >> 16) & 0xFF) / 255,
                  green: Double((v >> 8) & 0xFF) / 255,
                  blue: Double(v & 0xFF) / 255)
    }
}
