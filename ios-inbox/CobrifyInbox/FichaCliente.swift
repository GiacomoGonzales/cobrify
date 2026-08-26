import SwiftUI
import FirebaseFirestore

/// El catálogo de planes, espejo del de la web (subscriptionService.PLANS).
/// Solo lo necesario para RENOVAR EL MISMO PLAN: meses y nombre. Un plan que
/// no esté aquí (personalizado, trial, add-on) se renueva desde la web.
enum PlanCatalogo {
    static let meses: [String: Int] = [
        "basico_mensual": 1, "mensual": 1, "semestral": 6, "anual": 12,
        "ilimitado_mensual": 1, "ilimitado_anual": 12,
        "qpse_basico_1_month": 1, "qpse_1_month": 1, "qpse_1_month_2025": 1,
        "qpse_1_month_2_branches": 1, "qpse_1_month_3_branches": 1,
        "qpse_1_month_1000": 1, "qpse_6_months": 6, "qpse_12_months": 12,
        "sunat_direct_1_month": 1, "sunat_direct_6_months": 6, "sunat_direct_12_months": 12,
        "qpse_1_month_2024": 1, "qpse_6_months_2024": 6, "qpse_12_months_2024": 12,
        "sunat_direct_1_month_2024": 1, "sunat_direct_6_months_2024": 6, "sunat_direct_12_months_2024": 12,
    ]
    static let precioMensual: [String: Double] = [
        "basico_mensual": 19.90, "mensual": 29.90, "semestral": 24.98, "anual": 16.66,
        "ilimitado_mensual": 39.90, "ilimitado_anual": 24.99,
    ]
}

struct FichaCliente {
    var businessId: String
    var nombre: String?
    var ruc: String?
    var email: String?
    var plan: String?
    var planName: String?
    var vence: Date?
    var renewalPrice: Double?
    var accessBlocked: Bool
    var monthlyPrice: Double?
    var pagos: [[String: Any]]
    var tieneRenewalPrice: Bool

    var diasParaVencer: Int? {
        guard let vence else { return nil }
        return Int(ceil(vence.timeIntervalSinceNow / 86400))
    }
    /// ¿Se puede renovar desde la app? Solo el mismo plan y solo si está en
    /// el catálogo con meses > 0.
    var mesesDeRenovacion: Int? {
        guard let plan, let m = PlanCatalogo.meses[plan], m > 0 else { return nil }
        return m
    }
}

@MainActor
final class FichaStore: ObservableObject {
    @Published var ficha: FichaCliente?
    @Published var cargando = true
    @Published var error: String?

    func cargar(businessId: String) async {
        cargando = true
        error = nil
        let db = Firestore.firestore()
        do {
            async let subSnap = db.collection("subscriptions").document(businessId).getDocument()
            async let bizSnap = db.collection("businesses").document(businessId).getDocument()
            let (sub, biz) = try await (subSnap, bizSnap)
            let s = sub.data() ?? [:]
            let b = biz.data() ?? [:]
            guard sub.exists || biz.exists else {
                error = "El negocio ya no existe."
                cargando = false
                return
            }
            ficha = FichaCliente(
                businessId: businessId,
                nombre: b["businessName"] as? String ?? s["businessName"] as? String,
                ruc: b["ruc"] as? String,
                email: s["email"] as? String ?? b["email"] as? String,
                plan: s["plan"] as? String,
                planName: s["planName"] as? String ?? s["plan"] as? String,
                vence: (s["currentPeriodEnd"] as? Timestamp)?.dateValue(),
                renewalPrice: s["renewalPrice"] as? Double ?? (s["renewalPrice"] as? Int).map(Double.init),
                accessBlocked: s["accessBlocked"] as? Bool ?? false,
                monthlyPrice: s["monthlyPrice"] as? Double,
                pagos: Array(((s["paymentHistory"] as? [[String: Any]]) ?? []).suffix(3).reversed()),
                tieneRenewalPrice: s["renewalPrice"] != nil
            )
        } catch {
            self.error = "No se pudo cargar la ficha."
        }
        cargando = false
    }

    /// Renovación del MISMO plan, calcada de registerPayment de la web:
    /// conserva límites y precio pactado, extiende desde el vencimiento si
    /// aún no pasó (o desde hoy si ya venció), desbloquea el acceso y deja
    /// el pago en el historial con registeredBy admin.
    func renovar(monto: Double, metodo: String) async -> (ok: Bool, nuevoVencimiento: Date?, error: String?) {
        guard let f = ficha, let plan = f.plan, let meses = f.mesesDeRenovacion else {
            return (false, nil, "Este plan se renueva desde la web.")
        }
        let db = Firestore.firestore()
        let ref = db.collection("subscriptions").document(f.businessId)
        let ahora = Date()
        let base = (f.vence != nil && f.vence! > ahora) ? f.vence! : ahora
        guard let nuevoVence = Calendar.current.date(byAdding: .month, value: meses, to: base) else {
            return (false, nil, "No se pudo calcular la fecha.")
        }

        let registro: [String: Any] = [
            "date": Timestamp(date: ahora),
            "amount": monto,
            "method": metodo,
            "plan": plan,
            "planName": f.planName ?? plan,
            "months": meses,
            "status": "completed",
            "registeredBy": "admin",
        ]

        var cambios: [String: Any] = [
            "status": "active",
            "accessBlocked": false,
            "blockReason": NSNull(),
            "blockedAt": NSNull(),
            "currentPeriodStart": Timestamp(date: ahora),
            "lastPaymentDate": Timestamp(date: ahora),
            "currentPeriodEnd": Timestamp(date: nuevoVence),
            "nextPaymentDate": Timestamp(date: nuevoVence),
            "paymentHistory": FieldValue.arrayUnion([registro]),
            "updatedAt": FieldValue.serverTimestamp(),
        ]
        // El precio pactado se respeta; solo se congela si no existía.
        if !f.tieneRenewalPrice, monto > 0 {
            cambios["renewalPrice"] = monto
            cambios["pricingFrozenAt"] = FieldValue.serverTimestamp()
        }

        do {
            try await ref.updateData(cambios)
            // El catálogo público vuelve a la vida si estaba suspendido.
            try? await db.collection("businesses").document(f.businessId)
                .updateData(["catalogSuspended": false, "updatedAt": FieldValue.serverTimestamp()])
            await cargar(businessId: f.businessId)
            return (true, nuevoVence, nil)
        } catch {
            return (false, nil, "No se pudo registrar el pago. Revisa tu conexión.")
        }
    }
}

// ---------- Vincular una conversación a mano ----------

@MainActor
final class BuscadorNegocios: ObservableObject {
    @Published var resultados: [(id: String, nombre: String, ruc: String?)] = []
    @Published var buscando = false

    func buscar(_ texto: String) async {
        let t = texto.trimmingCharacters(in: .whitespaces)
        guard t.count >= 2 else { resultados = []; return }
        buscando = true
        let db = Firestore.firestore()
        // Prefijos con las tres formas típicas, como la web.
        let variantes = Array(Set([t, t.uppercased(),
                                   t.prefix(1).uppercased() + t.dropFirst().lowercased()]))
        var encontrados: [String: (id: String, nombre: String, ruc: String?)] = [:]
        for v in variantes {
            if let snap = try? await db.collection("businesses")
                .order(by: "businessName")
                .start(at: [v]).end(at: [v + "\u{f8ff}"])
                .limit(to: 8).getDocuments() {
                for d in snap.documents {
                    encontrados[d.documentID] = (d.documentID,
                                                 d.data()["businessName"] as? String ?? "(sin nombre)",
                                                 d.data()["ruc"] as? String)
                }
            }
        }
        resultados = Array(encontrados.values.prefix(10)).sorted { $0.nombre < $1.nombre }
        buscando = false
    }

    static func vincular(conversationId: String, businessId: String, nombre: String) {
        Firestore.firestore().collection("whatsappConversations").document(conversationId)
            .updateData(["linkedBusinessId": businessId, "linkedBusinessName": nombre,
                         "linkedBy": "manual", "linkAttempted": true,
                         "updatedAt": FieldValue.serverTimestamp()]) { _ in }
    }

    static func desvincular(conversationId: String) {
        Firestore.firestore().collection("whatsappConversations").document(conversationId)
            .updateData(["linkedBusinessId": FieldValue.delete(),
                         "linkedBusinessName": FieldValue.delete(),
                         "linkedBy": FieldValue.delete(),
                         "updatedAt": FieldValue.serverTimestamp()]) { _ in }
    }
}
