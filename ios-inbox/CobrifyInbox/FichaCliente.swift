import SwiftUI
import FirebaseAuth
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

/// Un negocio dentro del índice de búsqueda: lo justo para encontrarlo y
/// distinguirlo de otro de nombre parecido sin abrir la ficha.
struct NegocioIndexado: Identifiable, Equatable {
    let id: String
    let nombre: String
    let comercial: String?
    let ruc: String?
    let email: String?
    /// Todo lo buscable junto y normalizado, armado una sola vez al indexar.
    let buscable: String

    /// La segunda línea del resultado.
    var detalle: String {
        [comercial, ruc.map { "RUC \($0)" }, email].compactMap { $0 }.joined(separator: " · ")
    }
}

@MainActor
final class BuscadorNegocios: ObservableObject {
    @Published var resultados: [NegocioIndexado] = []
    @Published var buscando = false

    /// Índice liviano de negocios. Se arma una sola vez y se reusa.
    private static var indice: [NegocioIndexado] = []

    /// Busca por lo mismo que la página de Usuarios del panel: razón social,
    /// nombre comercial, RUC, correo, teléfono y código de cliente — por
    /// cualquier parte, en cualquier orden y sin tildes.
    ///
    /// Antes empezaba por una consulta de prefijo y solo caía al índice si esa
    /// quedaba corta. Sobra: el índice ya está en memoria y responde sin ir a
    /// la red, y el prefijo no encontraba ni el nombre comercial ni el correo.
    func buscar(_ texto: String) async {
        let t = texto.trimmingCharacters(in: .whitespaces)
        guard t.count >= 2 else { resultados = []; return }
        buscando = true
        defer { buscando = false }

        await Self.asegurarIndice()

        // Todas las palabras tienen que aparecer, en cualquier orden: así
        // "maria isabel" encuentra a "HANCCO SULLCA MARIA ISABEL".
        let palabras = Self.normalizar(t).split(separator: " ").map(String.init)
        guard !palabras.isEmpty else { resultados = []; return }
        let aguja = Self.normalizar(t)

        resultados = Self.indice
            .filter { n in palabras.allSatisfy { n.buscable.contains($0) } }
            .sorted {
                // Primero los que EMPIEZAN por lo buscado.
                let a = Self.normalizar($0.nombre).hasPrefix(aguja)
                let b = Self.normalizar($1.nombre).hasPrefix(aguja)
                if a != b { return a }
                return $0.nombre.localizedCaseInsensitiveCompare($1.nombre) == .orderedAscending
            }
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
        guard let token = try? await Auth.auth().currentUser?.getIDToken() else { return }

        let campos = ["businessName", "razonSocial", "name", "tradeName",
                      "nombreComercial", "ruc", "email", "phone", "codigoCliente"]
        let mascara = campos.map { "mask.fieldPaths=\($0)" }.joined(separator: "&")
        var pagina: String?
        var acumulado: [NegocioIndexado] = []

        // El tope de vueltas evita un bucle si el cursor viniera repetido.
        for _ in 0..<20 {
            var url = "https://firestore.googleapis.com/v1/projects/cobrify-395fe/databases/(default)/documents/businesses?pageSize=300&\(mascara)"
            if let pagina, let esc = pagina.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
                url += "&pageToken=\(esc)"
            }
            guard let u = URL(string: url) else { break }
            var req = URLRequest(url: u)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            guard let (data, _) = try? await URLSession.shared.data(for: req),
                  let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            else { break }

            for doc in json["documents"] as? [[String: Any]] ?? [] {
                let f = doc["fields"] as? [String: Any] ?? [:]
                func txt(_ k: String) -> String? {
                    guard let campo = f[k] as? [String: Any] else { return nil }
                    if let s = campo["stringValue"] as? String { return s.nilSiVacio }
                    if let n = campo["integerValue"] as? String { return n }
                    return nil
                }
                // La razon social manda sobre businessName, igual que en el panel.
                guard let nombre = txt("razonSocial") ?? txt("businessName"),
                      let ruta = doc["name"] as? String, let id = ruta.split(separator: "/").last
                else { continue }
                var comercial = txt("tradeName") ?? txt("nombreComercial") ?? txt("name")
                if comercial == nombre { comercial = nil }
                let ruc = txt("ruc"), email = txt("email")
                let heno = normalizar([nombre, comercial, ruc, email, txt("phone"), txt("codigoCliente")]
                    .compactMap { $0 }.joined(separator: " "))
                acumulado.append(NegocioIndexado(id: String(id), nombre: nombre, comercial: comercial,
                                                 ruc: ruc, email: email, buscable: heno))
            }

            guard let siguiente = json["nextPageToken"] as? String else { break }
            pagina = siguiente
        }
        if !acumulado.isEmpty { indice = acumulado }
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
                         // El rol describe la relación con ESA empresa: al
                         // soltarla, sobra.
                         "rolContacto": FieldValue.delete(),
                         "updatedAt": FieldValue.serverTimestamp()]) { _ in }
    }

    /// Quién escribe, cuando no es el titular: "Secretaria", "Contador".
    /// Texto libre a propósito — un catálogo cerrado se queda corto al segundo
    /// cliente, y esto lo lee una persona, no un reporte.
    static func guardarRol(conversationId: String, rol: String) {
        let limpio = rol.trimmingCharacters(in: .whitespaces)
        Firestore.firestore().collection("whatsappConversations").document(conversationId)
            .updateData(["rolContacto": limpio.isEmpty ? FieldValue.delete() : limpio,
                         "updatedAt": FieldValue.serverTimestamp()]) { _ in }
    }
}

// ---------- Los otros números de la misma empresa ----------

/// Otro contacto que escribe por el mismo negocio.
struct ContactoDelNegocio: Identifiable, Equatable {
    let id: String
    let nombre: String?
    let waId: String
    let rol: String?

    var titulo: String { nombre?.nilSiVacio ?? Formato.numero(waId) }
}

/// Los otros números vinculados a una empresa.
///
/// Sin esto, vincular a mano el número de la secretaria funcionaba pero no se
/// veía desde ningún lado: quien atendía el chat del dueño no tenía cómo saber
/// que había alguien más escribiendo por esa empresa.
///
/// Hay que mirar los dos campos porque el vínculo vive en `linkedBusinessId`
/// cuando la empresa es la principal del contacto y en `linkedBusinessIds`
/// cuando es una de varias.
@MainActor
final class OtrosContactosStore: ObservableObject {
    @Published var contactos: [ContactoDelNegocio] = []

    func cargar(businessId: String, excepto conversacionId: String?) async {
        let convs = Firestore.firestore().collection("whatsappConversations")
        async let principales = convs.whereField("linkedBusinessId", isEqualTo: businessId)
            .limit(to: 25).getDocuments()
        async let secundarias = convs.whereField("linkedBusinessIds", arrayContains: businessId)
            .limit(to: 25).getDocuments()

        var encontrados: [String: ContactoDelNegocio] = [:]
        for snap in [try? await principales, try? await secundarias] {
            for d in snap?.documents ?? [] where d.documentID != conversacionId {
                guard encontrados[d.documentID] == nil else { continue }
                let data = d.data()
                encontrados[d.documentID] = ContactoDelNegocio(
                    id: d.documentID,
                    nombre: (data["nombre"] as? String)?.nilSiVacio,
                    waId: data["waId"] as? String ?? "",
                    rol: (data["rolContacto"] as? String)?.nilSiVacio
                )
            }
        }
        contactos = encontrados.values.sorted {
            $0.titulo.localizedCaseInsensitiveCompare($1.titulo) == .orderedAscending
        }
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
