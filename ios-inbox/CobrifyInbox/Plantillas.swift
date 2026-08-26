import SwiftUI
import FirebaseAuth
import FirebaseFirestore

/// Una plantilla aprobada por Meta, tal como la sincroniza el servidor en
/// whatsappSettings/plantillas.
struct Plantilla: Identifiable, Equatable, Hashable {
    var id: String { "\(name)-\(language)" }
    var name: String
    var language: String
    var status: String
    var components: [[String: Any]]

    static func == (a: Plantilla, b: Plantilla) -> Bool { a.id == b.id && a.status == b.status }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init?(data: [String: Any]) {
        guard let name = data["name"] as? String else { return nil }
        self.name = name
        language = data["language"] as? String ?? "es"
        status = data["status"] as? String ?? ""
        components = data["components"] as? [[String: Any]] ?? []
    }

    /// Cuántos {{n}} pide el cuerpo.
    var variablesDelCuerpo: Int {
        guard let body = components.first(where: { $0["type"] as? String == "BODY" }),
              let texto = body["text"] as? String else { return 0 }
        let nums = texto.matches(of: /\{\{(\d+)\}\}/).compactMap { Int($0.1) }
        return nums.max() ?? 0
    }

    /// La cabecera: nil, texto (con o sin variable) o imagen.
    var cabecera: (formato: String, conVariable: Bool, texto: String?)? {
        guard let h = components.first(where: { $0["type"] as? String == "HEADER" }),
              let formato = h["format"] as? String else { return nil }
        let texto = h["text"] as? String
        return (formato, formato == "TEXT" && (texto ?? "").contains("{{1}}"), texto)
    }

    /// El texto final con los valores puestos, para la vista previa.
    func previsualizar(body: [String], headerText: String?) -> String {
        var partes: [String] = []
        for c in components {
            let tipo = c["type"] as? String
            let texto = c["text"] as? String ?? ""
            if tipo == "HEADER", c["format"] as? String == "TEXT", !texto.isEmpty {
                partes.append(headerText != nil && !headerText!.isEmpty
                              ? texto.replacingOccurrences(of: "{{1}}", with: headerText!)
                              : texto)
            } else if tipo == "BODY", !texto.isEmpty {
                var t = texto
                for (i, v) in body.enumerated() where !v.isEmpty {
                    t = t.replacingOccurrences(of: "{{\(i + 1)}}", with: v)
                }
                partes.append(t)
            } else if tipo == "FOOTER", !texto.isEmpty {
                partes.append(texto)
            }
        }
        return partes.joined(separator: "\n\n")
    }
}

struct Campana: Identifiable, Equatable {
    let id: String
    var titulo: String
    var total: Int
    var enviados: Int
    var fallidos: Int
    var omitidos: Int
    var estado: String
    var createdAt: Date?

    init(id: String, data: [String: Any]) {
        self.id = id
        titulo = data["titulo"] as? String ?? "(sin título)"
        total = data["total"] as? Int ?? 0
        enviados = data["enviados"] as? Int ?? 0
        fallidos = data["fallidos"] as? Int ?? 0
        omitidos = data["omitidos"] as? Int ?? 0
        estado = data["estado"] as? String ?? ""
        createdAt = (data["createdAt"] as? Timestamp)?.dateValue()
    }
}

/// Plantillas y campañas en vivo.
@MainActor
final class PlantillasStore: ObservableObject {
    static let shared = PlantillasStore()

    @Published var plantillas: [Plantilla] = []
    @Published var syncedAt: Date?
    @Published var campanas: [Campana] = []

    private var listeners: [ListenerRegistration] = []

    func empezar() {
        guard listeners.isEmpty else { return }
        let db = Firestore.firestore()
        listeners.append(db.collection("whatsappSettings").document("plantillas")
            .addSnapshotListener { [weak self] snap, _ in
                let lista = snap?.data()?["lista"] as? [[String: Any]] ?? []
                self?.plantillas = lista.compactMap(Plantilla.init)
                    .filter { $0.status.uppercased() == "APPROVED" }
                self?.syncedAt = (snap?.data()?["syncedAt"] as? Timestamp)?.dateValue()
            })
        listeners.append(db.collection("whatsappCampaigns")
            .order(by: "createdAt", descending: true).limit(to: 30)
            .addSnapshotListener { [weak self] snap, _ in
                self?.campanas = snap?.documents.map { Campana(id: $0.documentID, data: $0.data()) } ?? []
            })
    }
}

// ---------- Llamadas al servidor ----------
extension ChatAPI {
    static func postFn(_ nombre: String, _ cuerpo: [String: Any]) async throws -> [String: Any] {
        guard let user = Auth.auth().currentUser else {
            throw ErrorEnvio(mensaje: "La sesión venció. Vuelve a entrar.", ventanaCerrada: false)
        }
        let token = try await user.getIDToken()
        var req = URLRequest(url: URL(string: "https://us-central1-cobrify-395fe.cloudfunctions.net/\(nombre)")!)
        req.httpMethod = "POST"
        req.timeoutInterval = 120
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: cuerpo)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard status < 300 else {
            throw ErrorEnvio(mensaje: json["error"] as? String ?? "La operación falló.",
                             ventanaCerrada: json["ventanaCerrada"] as? Bool ?? false)
        }
        return json
    }

    static func sincronizarPlantillas() async throws {
        _ = try await postFn("syncWhatsappTemplates", [:])
    }

    static func enviarPlantilla(conversationId: String, plantilla: Plantilla,
                                body: [String], headerText: String?) async throws {
        _ = try await postFn("sendWhatsappTemplateMessage", [
            "conversationId": conversationId,
            "templateName": plantilla.name,
            "language": plantilla.language,
            "bodyValues": body,
            "headerText": headerText ?? NSNull(),
            "headerImageUrl": NSNull(),
        ])
    }

    static func enviarCampana(conversationIds: [String], plantilla: Plantilla,
                              body: [String], headerText: String?, titulo: String) async throws {
        _ = try await postFn("sendWhatsappCampaign", [
            "conversationIds": conversationIds,
            "templateName": plantilla.name,
            "language": plantilla.language,
            "bodyValues": body,
            "headerText": headerText ?? NSNull(),
            "headerImageUrl": NSNull(),
            "titulo": titulo,
        ])
    }
}
