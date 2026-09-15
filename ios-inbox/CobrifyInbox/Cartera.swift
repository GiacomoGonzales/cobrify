import Foundation
import FirebaseFirestore

/// Un vendedor de Cobrify (colección `vendedores`).
struct VendedorCobrify: Identifiable, Equatable {
    let id: String
    let nombre: String
    let telefono: String
    let activo: Bool
}

/// La cartera de un reseller o de un vendedor: sus cuentas, con lo que pide
/// atención primero. Espejo de `carteraDeLaCuenta` de la web (pedido de
/// Giacomo, 15-set-2026).
///
/// Un reseller es un usuario de Cobrify con `resellers/{uid}`, y sus clientes
/// llevan `resellerId`. Un vendedor vive en `vendedores` (con `linkedUserId`
/// si tiene usuario propio) y sus cuentas llevan `vendedorId`.
struct Cartera: Equatable {
    enum Tipo: Equatable { case reseller, vendedor }
    let tipo: Tipo
    let id: String
    let nombre: String
    var cuentas: [CuentaResumen]

    var titulo: String { tipo == .reseller ? "Sus clientes" : "Sus cuentas" }

    var vencidas: Int { cuentas.filter { ($0.diasParaVencer ?? 1) < 0 }.count }
    var porVencer: Int {
        cuentas.filter { c in
            guard let d = c.diasParaVencer else { return false }
            return d >= 0 && d <= 7
        }.count
    }

    /// "Reseller · WIROTECH · 1 vencida · 2 vencen esta semana"
    var resumen: String {
        var partes = [tipo == .reseller ? "Reseller" : "Vendedor", nombre]
        if vencidas > 0 { partes.append("\(vencidas) vencida\(vencidas == 1 ? "" : "s")") }
        if porVencer > 0 { partes.append("\(porVencer) vence\(porVencer == 1 ? "" : "n") esta semana") }
        if vencidas == 0 && porVencer == 0 && !cuentas.isEmpty { partes.append("todas al día") }
        return partes.joined(separator: " · ")
    }

    /// Lo que dice arriba la ficha de una de sus cuentas: no es la de la conversación.
    var origenDeUnaCuenta: String {
        "\(tipo == .reseller ? "Cliente del reseller" : "Cuenta del vendedor") \(nombre). No está vinculada a esta conversación."
    }

    /// Lo que se ve de cada cuenta sin abrir su ficha: sale solo de la suscripción.
    static func resumen(_ d: QueryDocumentSnapshot) -> CuentaResumen {
        let s = d.data()
        let interna = PlanCatalogo.nuncaVence(s["plan"] as? String)
        return CuentaResumen(
            id: d.documentID,
            nombre: (s["businessName"] as? String)?.nilSiVacio ?? (s["email"] as? String) ?? d.documentID,
            planName: PlanCatalogo.plan(s["plan"] as? String)?.nombre
                ?? s["planName"] as? String
                ?? s["plan"] as? String,
            vence: interna ? nil : (s["currentPeriodEnd"] as? Timestamp)?.dateValue(),
            accessBlocked: s["accessBlocked"] as? Bool ?? false,
            resellerId: s["resellerId"] as? String,
            vendedorId: s["vendedorId"] as? String,
            nuncaVence: interna
        )
    }

    /// Primero lo que pide atención: suspendidas y vencidas, luego las que vencen
    /// en 7 días, luego por fecha; las que no vencen, al final.
    static func ordenar(_ cuentas: [CuentaResumen]) -> [CuentaResumen] {
        func peso(_ c: CuentaResumen) -> Int {
            if c.accessBlocked || c.vencida { return 0 }
            if let d = c.diasParaVencer, d <= 7 { return 1 }
            return c.diasParaVencer != nil ? 2 : 3
        }
        return cuentas.sorted { a, b in
            if peso(a) != peso(b) { return peso(a) < peso(b) }
            let da = a.diasParaVencer ?? .max, db = b.diasParaVencer ?? .max
            if da != db { return da < db }
            return a.nombre.localizedCaseInsensitiveCompare(b.nombre) == .orderedAscending
        }
    }
}

/// Carga la cartera de una cuenta (reseller o vendedor con usuario propio) o la
/// de un vendedor asignado a la conversación.
@MainActor
final class CarteraStore: ObservableObject {
    @Published var cartera: Cartera?
    private let db = Firestore.firestore()

    /// Si esta cuenta es la principal de un reseller, sus clientes; si es el
    /// usuario de un vendedor, sus cuentas. Si no es ninguna de las dos, nada.
    func cargar(cuentaId: String) async {
        #if DEBUG
        if VistaPrevia.activa { cartera = VistaPrevia.cartera(cuentaId); return }
        #endif
        if let r = try? await db.collection("resellers").document(cuentaId).getDocument(), r.exists {
            let d = r.data() ?? [:]
            let nombre = (d["companyName"] as? String)?.nilSiVacio ?? (d["email"] as? String) ?? "Reseller"
            cartera = Cartera(tipo: .reseller, id: cuentaId, nombre: nombre,
                              cuentas: await cuentas(donde: "resellerId", es: cuentaId))
            return
        }
        if let snap = try? await db.collection("vendedores")
            .whereField("linkedUserId", isEqualTo: cuentaId).limit(to: 1).getDocuments(),
           let v = snap.documents.first {
            cartera = Cartera(tipo: .vendedor, id: v.documentID,
                              nombre: (v.data()["name"] as? String)?.nilSiVacio ?? "Vendedor",
                              cuentas: await cuentas(donde: "vendedorId", es: v.documentID))
            return
        }
        cartera = nil
    }

    /// La del vendedor asignado a la conversación (`vendedorContactoId`).
    func cargar(vendedorId: String) async {
        #if DEBUG
        if VistaPrevia.activa { cartera = VistaPrevia.carteraDeVendedor(vendedorId); return }
        #endif
        guard let v = try? await db.collection("vendedores").document(vendedorId).getDocument(), v.exists else {
            cartera = nil
            return
        }
        cartera = Cartera(tipo: .vendedor, id: vendedorId,
                          nombre: (v.data()?["name"] as? String)?.nilSiVacio ?? "Vendedor",
                          cuentas: await cuentas(donde: "vendedorId", es: vendedorId))
    }

    private func cuentas(donde campo: String, es id: String) async -> [CuentaResumen] {
        guard let snap = try? await db.collection("subscriptions")
            .whereField(campo, isEqualTo: id).limit(to: 500).getDocuments() else { return [] }
        return Cartera.ordenar(snap.documents.map(Cartera.resumen))
    }
}

/// Los vendedores de Cobrify y la asignación de uno a un contacto.
enum Vendedores {
    static func listar() async -> [VendedorCobrify] {
        #if DEBUG
        if VistaPrevia.activa { return VistaPrevia.vendedores }
        #endif
        guard let snap = try? await Firestore.firestore().collection("vendedores")
            .order(by: "name").getDocuments() else { return [] }
        return snap.documents.map { d in
            let x = d.data()
            return VendedorCobrify(
                id: d.documentID,
                nombre: (x["name"] as? String)?.nilSiVacio ?? d.documentID,
                telefono: x["phone"] as? String ?? "",
                activo: x["isActive"] as? Bool ?? true
            )
        }
    }

    /// El vendedor cuyo teléfono es este número (se comparan los 9 últimos dígitos).
    static func porTelefono(_ lista: [VendedorCobrify], waId: String) -> VendedorCobrify? {
        let fin = String(waId.filter(\.isNumber).suffix(9))
        guard fin.count == 9 else { return nil }
        return lista.first { String($0.telefono.filter(\.isNumber).suffix(9)) == fin }
    }

    /// Anota (o quita, con nil) qué vendedor es este contacto. La regla de
    /// Firestore de la bandeja deja escribir `vendedorContactoId` desde el 15-set.
    static func asignar(conversationId: String, vendedorId: String?) async throws {
        #if DEBUG
        if VistaPrevia.activa { return }
        #endif
        try await Firestore.firestore().collection("whatsappConversations").document(conversationId)
            .updateData([
                "vendedorContactoId": vendedorId.map { $0 as Any } ?? NSNull(),
                "updatedAt": FieldValue.serverTimestamp(),
            ])
    }
}
