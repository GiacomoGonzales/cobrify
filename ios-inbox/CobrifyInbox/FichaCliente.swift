import SwiftUI
import FirebaseFirestore

/// El catálogo de planes, espejo del de la web (subscriptionService.PLANS).
/// Solo lo necesario para RENOVAR EL MISMO PLAN: meses y nombre. Un plan que
/// no esté aquí (personalizado, trial, add-on) se renueva desde la web.
/// El catálogo de planes, espejo del de la web (subscriptionService.PLANS):
/// meses, nombre y límites. Un plan que no esté aquí (personalizado, trial,
/// enterprise) se gestiona desde la web.
enum PlanCatalogo {
    struct Plan {
        let id: String
        let nombre: String
        let meses: Int
        let maxComprobantes: Int  // -1 = ilimitado
        let maxSucursales: Int
    }

    static let planes: [Plan] = [
        Plan(id: "basico_mensual", nombre: "Plan Básico - 1 Mes", meses: 1, maxComprobantes: 100, maxSucursales: 1),
        Plan(id: "mensual", nombre: "Plan Mensual - 1 Mes", meses: 1, maxComprobantes: 1000, maxSucursales: -1),
        Plan(id: "semestral", nombre: "Plan Semestral - 6 Meses", meses: 6, maxComprobantes: 1000, maxSucursales: -1),
        Plan(id: "anual", nombre: "Plan Anual - 12 Meses", meses: 12, maxComprobantes: 1000, maxSucursales: -1),
        Plan(id: "ilimitado_mensual", nombre: "Plan Ilimitado - 1 Mes", meses: 1, maxComprobantes: -1, maxSucursales: -1),
        Plan(id: "ilimitado_anual", nombre: "Plan Ilimitado - 12 Meses", meses: 12, maxComprobantes: -1, maxSucursales: -1),
        Plan(id: "qpse_basico_1_month", nombre: "Plan Básico QPse - 1 Mes", meses: 1, maxComprobantes: 100, maxSucursales: 1),
        Plan(id: "qpse_1_month", nombre: "Plan QPse - 1 Mes", meses: 1, maxComprobantes: 500, maxSucursales: 1),
        Plan(id: "qpse_1_month_2025", nombre: "Plan QPse - 1 Mes (2025)", meses: 1, maxComprobantes: 500, maxSucursales: 1),
        Plan(id: "qpse_1_month_2_branches", nombre: "Plan QPse - 1 Mes (2 Sucursales)", meses: 1, maxComprobantes: 500, maxSucursales: 2),
        Plan(id: "qpse_1_month_3_branches", nombre: "Plan QPse - 1 Mes (3 Sucursales)", meses: 1, maxComprobantes: 500, maxSucursales: 3),
        Plan(id: "qpse_1_month_1000", nombre: "Plan QPse 1000 - 1 Mes", meses: 1, maxComprobantes: 1000, maxSucursales: 1),
        Plan(id: "qpse_6_months", nombre: "Plan QPse - 6 Meses", meses: 6, maxComprobantes: 500, maxSucursales: 1),
        Plan(id: "qpse_12_months", nombre: "Plan QPse - 12 Meses", meses: 12, maxComprobantes: 500, maxSucursales: 1),
        Plan(id: "sunat_direct_1_month", nombre: "Plan SUNAT Directo - 1 Mes", meses: 1, maxComprobantes: -1, maxSucursales: 1),
        Plan(id: "sunat_direct_6_months", nombre: "Plan SUNAT Directo - 6 Meses", meses: 6, maxComprobantes: -1, maxSucursales: 1),
        Plan(id: "sunat_direct_12_months", nombre: "Plan SUNAT Directo - 12 Meses", meses: 12, maxComprobantes: -1, maxSucursales: 1),
    ]

    static func plan(_ id: String?) -> Plan? {
        guard let id else { return nil }
        return planes.first { $0.id == id }
    }
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
    var comprobantesUsados: Int
    var comprobantesLimite: Int

    var diasParaVencer: Int? {
        guard let vence else { return nil }
        return Int(ceil(vence.timeIntervalSinceNow / 86400))
    }
    /// ¿Se puede renovar desde la app? Solo si el plan está en el catálogo.
    var mesesDeRenovacion: Int? {
        guard let p = PlanCatalogo.plan(plan), p.meses > 0 else { return nil }
        return p.meses
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
                tieneRenewalPrice: s["renewalPrice"] != nil,
                comprobantesUsados: (s["usage"] as? [String: Any])?["invoicesThisMonth"] as? Int ?? 0,
                comprobantesLimite: (s["limits"] as? [String: Any])?["maxInvoicesPerMonth"] as? Int ?? 0
            )
        } catch {
            self.error = "No se pudo cargar la ficha."
        }
        cargando = false
    }

    /// Renovación calcada de registerPayment de la web. Mismo plan: conserva
    /// límites y precio pactado. Plan DISTINTO: contrato nuevo — límites del
    /// catálogo y el monto cobrado pasa a ser el nuevo precio pactado. La
    /// fecha personalizada (si viene) manda sobre el cálculo por meses.
    func renovar(monto: Double, metodo: String, planId: String, fechaPersonalizada: Date?) async -> (ok: Bool, nuevoVencimiento: Date?, error: String?) {
        guard let f = ficha, let planNuevo = PlanCatalogo.plan(planId), planNuevo.meses > 0 else {
            return (false, nil, "Ese plan se gestiona desde la web.")
        }
        let db = Firestore.firestore()
        let ref = db.collection("subscriptions").document(f.businessId)
        let ahora = Date()
        let esMismoPlan = planId == f.plan

        let nuevoVence: Date
        if let fechaPersonalizada {
            nuevoVence = fechaPersonalizada
        } else {
            let base = (f.vence != nil && f.vence! > ahora) ? f.vence! : ahora
            guard let v = Calendar.current.date(byAdding: .month, value: planNuevo.meses, to: base) else {
                return (false, nil, "No se pudo calcular la fecha.")
            }
            nuevoVence = v
        }

        let registro: [String: Any] = [
            "date": Timestamp(date: ahora),
            "amount": monto,
            "method": metodo,
            "plan": planId,
            "planName": planNuevo.nombre,
            "months": planNuevo.meses,
            "status": "completed",
            "registeredBy": "admin",
        ]

        var cambios: [String: Any] = [
            "plan": planId,
            "planName": planNuevo.nombre,
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
        if esMismoPlan {
            // Se respeta lo pactado; solo se congela si no existía.
            if !f.tieneRenewalPrice, monto > 0 {
                cambios["renewalPrice"] = monto
                cambios["pricingFrozenAt"] = FieldValue.serverTimestamp()
            }
        } else {
            // Contrato nuevo: límites del catálogo y precio nuevo.
            cambios["limits.maxInvoicesPerMonth"] = planNuevo.maxComprobantes
            cambios["limits.maxBranches"] = planNuevo.maxSucursales
            if monto > 0 {
                cambios["renewalPrice"] = monto
                cambios["pricingFrozenAt"] = FieldValue.serverTimestamp()
            }
        }

        do {
            try await ref.updateData(cambios)
            try? await db.collection("businesses").document(f.businessId)
                .updateData(["catalogSuspended": false, "updatedAt": FieldValue.serverTimestamp()])
            await cargar(businessId: f.businessId)
            return (true, nuevoVence, nil)
        } catch {
            return (false, nil, "No se pudo registrar el pago. Revisa tu conexión.")
        }
    }

    /// El add-on de la web (+500 comprobantes): sube el límite del mes y
    /// deja el pago en el historial. No toca fechas.
    func agregarComprobantes(monto: Double, metodo: String) async -> String? {
        guard let f = ficha else { return "Sin ficha." }
        guard f.comprobantesLimite > 0 else { return "Este plan tiene comprobantes ilimitados." }
        let ref = Firestore.firestore().collection("subscriptions").document(f.businessId)
        let registro: [String: Any] = [
            "date": Timestamp(date: Date()),
            "amount": monto,
            "method": metodo,
            "plan": "addon_500_comprobantes",
            "planName": "+500 Comprobantes",
            "months": 0,
            "addonType": "invoices",
            "addonAmount": 500,
            "status": "completed",
            "registeredBy": "admin",
        ]
        do {
            try await ref.updateData([
                "limits.maxInvoicesPerMonth": f.comprobantesLimite + 500,
                "lastPaymentDate": Timestamp(date: Date()),
                "paymentHistory": FieldValue.arrayUnion([registro]),
                "updatedAt": FieldValue.serverTimestamp(),
            ])
            await cargar(businessId: f.businessId)
            return nil
        } catch {
            return "No se pudo registrar el paquete."
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
