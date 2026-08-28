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
    var registradoEl: Date?
    var blockReason: String?
    var blockedAt: Date?

    var vencido: Bool { (diasParaVencer ?? 1) < 0 }

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
                pagos: ((s["paymentHistory"] as? [[String: Any]]) ?? []).reversed(),
                tieneRenewalPrice: s["renewalPrice"] != nil,
                comprobantesUsados: (s["usage"] as? [String: Any])?["invoicesThisMonth"] as? Int ?? 0,
                comprobantesLimite: (s["limits"] as? [String: Any])?["maxInvoicesPerMonth"] as? Int ?? 0,
                registradoEl: ((s["createdAt"] as? Timestamp) ?? (s["startDate"] as? Timestamp)
                               ?? (b["createdAt"] as? Timestamp))?.dateValue(),
                blockReason: s["blockReason"] as? String,
                blockedAt: (s["blockedAt"] as? Timestamp)?.dateValue()
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

    /// Reactivar el acceso, calcado de reactivateUser de la web: desbloquea y
    /// extiende N días (desde el vencimiento si aún no pasó; si ya pasó,
    /// desde hoy). Es cortesía/gracia — el cobro va por Registrar renovación.
    func reactivar(dias: Int) async -> (ok: Bool, nuevoVencimiento: Date?, error: String?) {
        guard let f = ficha else { return (false, nil, "Sin ficha.") }
        let db = Firestore.firestore()
        let ahora = Date()
        let base = (f.vence != nil && f.vence! > ahora) ? f.vence! : ahora
        guard let nuevoVence = Calendar.current.date(byAdding: .day, value: dias, to: base) else {
            return (false, nil, "No se pudo calcular la fecha.")
        }
        do {
            try await db.collection("subscriptions").document(f.businessId).updateData([
                "status": "active",
                "accessBlocked": false,
                "blockReason": NSNull(),
                "blockedAt": NSNull(),
                "currentPeriodStart": Timestamp(date: ahora),
                "currentPeriodEnd": Timestamp(date: nuevoVence),
                "nextPaymentDate": Timestamp(date: nuevoVence),
                "updatedAt": FieldValue.serverTimestamp(),
            ])
            try? await db.collection("businesses").document(f.businessId)
                .updateData(["catalogSuspended": false, "updatedAt": FieldValue.serverTimestamp()])
            await cargar(businessId: f.businessId)
            return (true, nuevoVence, nil)
        } catch {
            return (false, nil, "No se pudo reactivar. Revisa tu conexión.")
        }
    }

    /// Suspender el acceso, calcado de suspendUser de la web.
    func suspender(motivo: String) async -> String? {
        guard let f = ficha else { return "Sin ficha." }
        let db = Firestore.firestore()
        do {
            try await db.collection("subscriptions").document(f.businessId).updateData([
                "status": "suspended",
                "accessBlocked": true,
                "blockReason": motivo,
                "blockedAt": FieldValue.serverTimestamp(),
                "updatedAt": FieldValue.serverTimestamp(),
            ])
            try? await db.collection("businesses").document(f.businessId)
                .updateData(["catalogSuspended": true, "updatedAt": FieldValue.serverTimestamp()])
            await cargar(businessId: f.businessId)
            return nil
        } catch {
            return "No se pudo suspender. Revisa tu conexión."
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

    /// Índice liviano de negocios (id, nombre, RUC) para poder buscar por
    /// cualquier palabra. Se arma una sola vez y se reusa.
    private static var indice: [(id: String, nombre: String, ruc: String?)] = []

    func buscar(_ texto: String) async {
        let t = texto.trimmingCharacters(in: .whitespaces)
        guard t.count >= 2 else { resultados = []; return }
        buscando = true
        defer { buscando = false }

        // 1) Por prefijo: es lo barato y resuelve la mayoría.
        let db = Firestore.firestore()
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

        // 2) El prefijo solo mira el ARRANQUE del nombre: buscar "giacomo" no
        // encuentra "GONZALES GIACOMO". Si quedó corto, se busca dentro del
        // nombre completo sobre un índice local que se arma una sola vez.
        if encontrados.count < 5 {
            await Self.asegurarIndice()
            let aguja = Self.normalizar(t)
            for n in Self.indice where Self.normalizar(n.nombre).contains(aguja) || (n.ruc ?? "").contains(t) {
                encontrados[n.id] = n
                if encontrados.count >= 25 { break }
            }
        }

        resultados = Array(encontrados.values)
            .sorted { $0.nombre.localizedCaseInsensitiveCompare($1.nombre) == .orderedAscending }
            .prefix(20)
            .map { $0 }
    }

    /// Sin tildes y en minúsculas: "GONZÁLES" y "gonzales" deben coincidir.
    private static func normalizar(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive],
                  locale: Locale(identifier: "es"))
    }

    private static func asegurarIndice() async {
        guard indice.isEmpty else { return }
        guard let snap = try? await Firestore.firestore().collection("businesses")
            .order(by: "businessName").limit(to: 3000).getDocuments() else { return }
        indice = snap.documents.map {
            ($0.documentID,
             $0.data()["businessName"] as? String ?? "(sin nombre)",
             $0.data()["ruc"] as? String)
        }
    }

    static func vincular(conversationId: String, businessId: String, nombre: String) {
        Firestore.firestore().collection("whatsappConversations").document(conversationId)
            .updateData(["linkedBusinessId": businessId, "linkedBusinessName": nombre,
                         "linkedBy": "manual", "linkAttempted": true,
                         "updatedAt": FieldValue.serverTimestamp()]) { _ in }
    }

    /// Suma otra cuenta al mismo cliente. La principal no se toca: esta va a
    /// la lista de acompañantes, que la web ignora sin romperse.
    static func agregarCuenta(conversationId: String, businessId: String) {
        Firestore.firestore().collection("whatsappConversations").document(conversationId)
            .updateData(["linkedBusinessIds": FieldValue.arrayUnion([businessId]),
                         "updatedAt": FieldValue.serverTimestamp()]) { _ in }
    }

    static func quitarCuenta(conversationId: String, businessId: String) {
        Firestore.firestore().collection("whatsappConversations").document(conversationId)
            .updateData(["linkedBusinessIds": FieldValue.arrayRemove([businessId]),
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

// ---------- El cliente y TODAS sus cuentas ----------

/// Resumen de una cuenta para la lista del grupo: lo justo para decidir cuál
/// abrir sin cargar la ficha entera.
struct CuentaResumen: Identifiable, Equatable {
    let id: String
    var nombre: String
    var planName: String?
    var vence: Date?
    var accessBlocked: Bool
    /// Quién la trajo, que es como se agrupan: el reseller o el vendedor.
    var resellerId: String?
    var vendedorId: String?

    var diasParaVencer: Int? {
        guard let vence else { return nil }
        return Int(ceil(vence.timeIntervalSinceNow / 86400))
    }
    var vencida: Bool { (diasParaVencer ?? 1) < 0 }
}

/// Las cuentas de un mismo cliente y las que podrían serlo.
@MainActor
final class GrupoCuentasStore: ObservableObject {
    @Published var cuentas: [CuentaResumen] = []
    @Published var sugeridas: [CuentaResumen] = []
    @Published var cargando = true

    private let db = Firestore.firestore()
    private var listener: ListenerRegistration?

    /// Escucha la conversación: al sumar o quitar una cuenta, la lista se
    /// rehace sola —antes había que salir y volver a entrar para verlo.
    func escuchar(conversationId: String) {
        guard listener == nil else { return }
        listener = db.collection("whatsappConversations").document(conversationId)
            .addSnapshotListener { [weak self] snap, _ in
                guard let self, let data = snap?.data() else { return }
                let conv = Conversacion(id: snap?.documentID ?? "", data: data)
                Task { await self.cargar(ids: conv.linkedBusinessIds) }
            }
    }

    func parar() {
        listener?.remove()
        listener = nil
    }

    func cargar(ids: [String]) async {
        cargando = true
        var resultado: [CuentaResumen] = []
        for id in ids {
            if let c = await leerCuenta(id) { resultado.append(c) }
        }
        cuentas = resultado
        cargando = false
        await buscarSugeridas()
    }

    private func leerCuenta(_ id: String) async -> CuentaResumen? {
        async let sub = db.collection("subscriptions").document(id).getDocument()
        async let biz = db.collection("businesses").document(id).getDocument()
        guard let (s, b) = try? await (sub, biz), s.exists || b.exists else { return nil }
        let sd = s.data() ?? [:]
        let bd = b.data() ?? [:]
        return CuentaResumen(
            id: id,
            nombre: bd["businessName"] as? String ?? sd["businessName"] as? String ?? "(sin nombre)",
            // El nombre bonito del catálogo; si el plan no está ahí, lo que
            // haya guardado. Nunca el código crudo tipo "qpse_1_month".
            planName: PlanCatalogo.plan(sd["plan"] as? String)?.nombre
                ?? sd["planName"] as? String
                ?? sd["plan"] as? String,
            vence: (sd["currentPeriodEnd"] as? Timestamp)?.dateValue(),
            accessBlocked: sd["accessBlocked"] as? Bool ?? false,
            resellerId: sd["resellerId"] as? String,
            vendedorId: sd["vendedorId"] as? String
        )
    }

    /// Otras cuentas que trajo el mismo reseller o el mismo vendedor: son las
    /// candidatas naturales a pertenecer a este cliente. Solo se sugieren —
    /// entrar al grupo siempre es decisión tuya.
    private func buscarSugeridas() async {
        let yaEstan = Set(cuentas.map(\.id))
        let resellers = Set(cuentas.compactMap(\.resellerId))
        let vendedores = Set(cuentas.compactMap(\.vendedorId))
        guard !resellers.isEmpty || !vendedores.isEmpty else { sugeridas = []; return }

        var encontradas: [String: CuentaResumen] = [:]
        for rid in resellers {
            if let snap = try? await db.collection("subscriptions")
                .whereField("resellerId", isEqualTo: rid).limit(to: 25).getDocuments() {
                for d in snap.documents where !yaEstan.contains(d.documentID) {
                    if let c = await leerCuenta(d.documentID) { encontradas[d.documentID] = c }
                }
            }
        }
        for vid in vendedores {
            if let snap = try? await db.collection("subscriptions")
                .whereField("vendedorId", isEqualTo: vid).limit(to: 25).getDocuments() {
                for d in snap.documents where !yaEstan.contains(d.documentID) {
                    if let c = await leerCuenta(d.documentID) { encontradas[d.documentID] = c }
                }
            }
        }
        sugeridas = Array(encontradas.values).sorted { $0.nombre < $1.nombre }
    }
}
