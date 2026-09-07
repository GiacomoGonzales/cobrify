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

                    Section {
                        HStack {
                            Text("S/")
                            TextField("0.00", text: $monto)
                                .keyboardType(.decimalPad)
                                .onChange(of: monto) { _, _ in montoTocado = true }
                        }
                    } header: {
                        Text("Monto que pagó")
                    } footer: {
                        Text("Queda congelado como su precio de renovación.")
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
        guard let plan = PlanCatalogo.plan(planId) else { return }
        creando = true
        error = nil
        defer { creando = false }
        do {
            let r = try await ChatAPI.postFn("crearAltaPendiente", [
                "conversationId": conv.id,
                "waId": conv.waId,
                "nombre": nombre.trimmingCharacters(in: .whitespaces),
                "plan": plan.id,
                "planNombre": plan.nombre,
                "meses": plan.meses,
                "precio": Double(monto.replacingOccurrences(of: ",", with: ".")) as Any,
                "limites": [
                    "maxInvoicesPerMonth": plan.maxComprobantes,
                    "maxBranches": plan.maxSucursales,
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
