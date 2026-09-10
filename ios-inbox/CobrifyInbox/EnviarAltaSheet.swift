import SwiftUI

/// Los precios de catálogo de los planes que se venden hoy.
///
/// `PlanCatalogo` tiene meses y límites pero no precio, porque nació para
/// renovar —ahí manda el precio pactado del cliente, no el de la lista—. Aquí
/// hace falta uno para no obligar a teclear el monto en cada alta, así que se
/// suman solo los que se venden: los QPse y los SUNAT directo son de contratos
/// viejos y no se ofrecen en un alta nueva.
///
/// ⚠️ ESTOS PRECIOS ESTÁN DUPLICADOS de `PLANS` en
/// `src/services/subscriptionService.js` (campo `totalPrice`). Swift no puede
/// leer ese archivo. Si cambian allá, hay que cambiarlos aquí — y no es un
/// detalle: el monto se congela como el precio de renovación del cliente, así
/// que uno equivocado se le cobra mal en cada renovación. Al escribir esto
/// dos salieron mal por ponerlos de memoria.
enum PlanesVendibles {
    static let ids = ["basico_mensual", "mensual", "semestral", "anual", "ilimitado_mensual", "ilimitado_anual"]

    static let precios: [String: Double] = [
        "basico_mensual": 19.90,
        "mensual": 29.90,
        "semestral": 149.90,
        "anual": 199.90,
        "ilimitado_mensual": 39.90,
        "ilimitado_anual": 299.90,
    ]

    static var lista: [PlanCatalogo.Plan] {
        ids.compactMap { PlanCatalogo.plan($0) }
    }

    /// Los mismos que usa Admin > Pagos, para que el listado no mezcle
    /// etiquetas. La clave viaja al servidor; el nombre es lo que se ve.
    static let metodos: [(id: String, nombre: String)] = [
        ("yape", "Yape"), ("plin", "Plin"), ("transferencia", "Transferencia"),
        ("efectivo", "Efectivo"), ("tarjeta", "Tarjeta"), ("otro", "Otro"),
    ]

    /// Los días que dura una prueba.
    ///
    /// DUPLICADO A PROPÓSITO: el número vive en `functions/src/data/prueba.js`
    /// y Swift no puede leer un .js. El servidor es el que manda —él crea la
    /// suscripción—; esta copia solo pinta el texto. Si cambia allá, cambiar acá.
    static let diasDePrueba = 3

    /// Meses de regalo del programa de referidos, por plan.
    ///
    /// ⚠️ DUPLICADO, igual que los precios de arriba y por el mismo motivo:
    /// Swift no puede leer `functions/src/data/referidos.js`, que es donde se
    /// deciden. Si cambian allá, hay que cambiarlos aquí — y el que manda es
    /// SIEMPRE el servidor: esto solo sirve para decirle al cliente qué se
    /// lleva antes de mandar el enlace.
    static let regalo: [String: Int] = [
        "basico_mensual": 1, "mensual": 1, "semestral": 1, "anual": 2,
    ]
}

/// Manda el formulario de alta a un lead que acaba de pagar.
///
/// El enlace lleva un código que solo existe porque se generó desde aquí: por
/// eso no hace falta una página de registro abierta. El plan, los meses y el
/// monto se congelan en el enlace, así la cuenta nace con su vencimiento
/// correcto sin que el cliente escriba nada de eso.
///
/// Igual que en la web, el mensaje NO se manda solo: cae en el cuadro de
/// escribir para leerlo antes. A alguien que acaba de pagar no conviene
/// mandarle nada a ciegas.
struct EnviarAltaSheet: View {
    let conv: Conversacion
    /// Deja el mensaje listo en el compositor de la conversación.
    var alPreparar: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var planId = ""
    @State private var monto = ""
    @State private var montoTocado = false
    @State private var nombre = ""
    @State private var metodo = "yape"

    /// La prueba no es un plan más: no lleva monto, ni método, ni referido.
    private var esPrueba: Bool { planId == "trial" }
    @State private var referidoPor = ""
    @State private var creando = false
    @State private var error: String?
    @State private var hecho: (enlace: String, mensaje: String)?

    var body: some View {
        NavigationStack {
            Form {
                if let hecho {
                    Section("Enlace creado") {
                        Text(hecho.enlace)
                            .font(.system(.footnote, design: .monospaced))
                            .textSelection(.enabled)
                        Text("Sirve una sola vez. Si se pierde, crea otro desde aquí.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Section("El mensaje que va a salir") {
                        Text(hecho.mensaje).font(.callout)
                    }
                    Section {
                        Button {
                            alPreparar(hecho.mensaje)
                            dismiss()
                        } label: {
                            Label("Poner en el mensaje", systemImage: "arrow.down.doc")
                        }
                    } footer: {
                        Text("Cae en el cuadro de escribir para que lo revises antes de mandarlo.")
                    }
                } else {
                    Section {
                        TextField("Nombre del cliente", text: $nombre)
                    } footer: {
                        Text("Solo para saludarlo en el mensaje.")
                    }

                    Section("Plan que contrató") {
                        Picker("Plan", selection: $planId) {
                            Text("Elige el plan…").tag("")
                            // La prueba va PRIMERA: es el camino que más se
                            // va a usar, y al final queda escondida.
                            Text("Prueba gratuita — \(PlanesVendibles.diasDePrueba) días, sin pago").tag("trial")
                            ForEach(PlanesVendibles.lista, id: \.id) { p in
                                Text(nombreCorto(p)).tag(p.id)
                            }
                        }
                        .onChange(of: planId) { _, nuevo in
                            if !montoTocado, let precio = PlanesVendibles.precios[nuevo] {
                                monto = String(format: "%.2f", precio)
                            }
                        }
                    }

                    if esPrueba {
                        Section {
                            Text("No se cobra nada y sus comprobantes NO se envían a SUNAT: salen marcados como sin validez. Al vencer se suspende sola. Si paga, la conviertes en cuenta real desde su ficha y se queda con todo lo que cargó.")
                                .font(.footnote).foregroundStyle(.secondary)
                        } header: {
                            Text("Prueba de \(PlanesVendibles.diasDePrueba) días")
                        }
                    } else {
                    Section {
                        HStack {
                            Text("S/")
                            TextField("0.00", text: $monto)
                                .keyboardType(.decimalPad)
                                .onChange(of: monto) { _, _ in montoTocado = true }
                        }
                        Picker("Cómo pagó", selection: $metodo) {
                            ForEach(PlanesVendibles.metodos, id: \.id) { m in
                                Text(m.nombre).tag(m.id)
                            }
                        }
                    } header: {
                        Text("El pago")
                    } footer: {
                        Text("El monto queda congelado como su precio de renovación, y el pago aparece en Pagos.")
                    }
                    }

                    // Quién lo trajo. El código se comprueba al crear el enlace:
                    // si está mal escrito el error sale ahora, que es cuando se
                    // puede arreglar. Dejarlo pasar sería que el cliente que
                    // refirió nunca cobre su mes y nadie se entere.
                    if !esPrueba {
                    Section {
                        TextField("Código de quien lo refirió", text: $referidoPor)
                            .keyboardType(.numberPad)
                            .onChange(of: referidoPor) { _, nuevo in
                                let soloNumeros = nuevo.filter(\.isNumber)
                                if soloNumeros != nuevo { referidoPor = soloNumeros }
                            }
                    } header: {
                        Text("¿Lo refirió un cliente?")
                    } footer: {
                        if let meses = PlanesVendibles.regalo[planId], let plan = PlanCatalogo.plan(planId) {
                            Text("Con este plan, el referido usa \(plan.meses + meses) meses pagando \(plan.meses), y quien lo trajo gana 1 mes.")
                        } else if !planId.isEmpty {
                            Text("Este plan no entra al programa de referidos.")
                        } else {
                            Text("Opcional. Es el código de cliente que sale en Usuarios.")
                        }
                    }
                    }

                    if let error {
                        Section { Text(error).foregroundStyle(.red).font(.callout) }
                    }

                    Section {
                        Text("Llena sus datos él mismo y su cuenta queda activa al terminar. El enlace es la prueba de que pagó, así que solo funciona una vez.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Alta del cliente")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(hecho == nil ? "Cancelar" : "Cerrar") { dismiss() }
                }
                if hecho == nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Crear") { Task { await crear() } }
                            .disabled(planId.isEmpty || creando)
                    }
                }
            }
            .task { if nombre.isEmpty { nombre = conv.titulo } }
        }
    }

    /// "Plan Básico - 1 Mes" -> "Básico · 1 mes · S/ 19.90"
    private func nombreCorto(_ p: PlanCatalogo.Plan) -> String {
        let base = p.nombre
            .replacingOccurrences(of: "Plan ", with: "")
            .components(separatedBy: " - ").first ?? p.nombre
        let periodo = p.meses == 1 ? "1 mes" : "\(p.meses) meses"
        guard let precio = PlanesVendibles.precios[p.id] else { return "\(base) · \(periodo)" }
        return "\(base) · \(periodo) · S/ \(String(format: "%.2f", precio))"
    }

    private func crear() async {
        // La prueba no está en el catálogo de planes vendibles —no se vende—,
        // así que se arma a mano en vez de buscarla ahí.
        guard esPrueba || PlanCatalogo.plan(planId) != nil else { return }
        let plan = PlanCatalogo.plan(planId)
        creando = true
        error = nil
        defer { creando = false }
        do {
            let r = try await ChatAPI.postFn("crearAltaPendiente", [
                "conversationId": conv.id,
                "waId": conv.waId,
                "nombre": nombre.trimmingCharacters(in: .whitespaces),
                "plan": esPrueba ? "trial" : (plan?.id ?? ""),
                "planNombre": esPrueba ? "Prueba de \(PlanesVendibles.diasDePrueba) días" : (plan?.nombre ?? ""),
                "meses": esPrueba ? 0 : (plan?.meses ?? 1),
                "diasDePrueba": esPrueba ? PlanesVendibles.diasDePrueba : NSNull(),
                "precio": esPrueba ? NSNull() : (Double(monto.replacingOccurrences(of: ",", with: ".")) as Any),
                "metodo": esPrueba ? NSNull() : metodo,
                "referidoPor": (esPrueba || referidoPor.isEmpty) ? NSNull() : referidoPor,
                "limites": [
                    "maxInvoicesPerMonth": plan?.maxComprobantes ?? -1,
                    "maxBranches": plan?.maxSucursales ?? 1,
                ],
            ])
            guard let enlace = r["enlace"] as? String, let mensaje = r["mensaje"] as? String else {
                error = "El servidor no devolvió el enlace."
                return
            }
            hecho = (enlace, mensaje)
        } catch {
            self.error = (error as? ChatAPI.ErrorEnvio)?.mensaje ?? "No se pudo crear el enlace."
        }
    }
}
