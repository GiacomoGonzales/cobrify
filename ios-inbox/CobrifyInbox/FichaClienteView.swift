import SwiftUI
import FirebaseFirestore

/// La ficha del cliente vinculado: su suscripción de Cobrify y las acciones.
/// La joya: renovar el plan sin salir del chat.
struct FichaClienteView: View {
    let businessId: String
    @StateObject private var store = FichaStore()
    @State private var mostrarRenovar = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if store.cargando {
                    ProgressView("Cargando ficha…")
                } else if let error = store.error {
                    ContentUnavailableView("Sin ficha", systemImage: "person.crop.circle.badge.questionmark",
                                           description: Text(error))
                } else if let f = store.ficha {
                    lista(f)
                }
            }
            .navigationTitle("Ficha del cliente")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cerrar") { dismiss() } }
            }
            .sheet(isPresented: $mostrarRenovar) {
                if store.ficha != nil {
                    RenovarSheet(store: store)
                }
            }
        }
        .task { await store.cargar(businessId: businessId) }
    }

    @ViewBuilder private func lista(_ f: FichaCliente) -> some View {
        List {
            Section {
                LabeledContent("Negocio", value: f.nombre ?? "—")
                if let ruc = f.ruc { LabeledContent("RUC", value: ruc) }
                if let email = f.email { LabeledContent("Correo", value: email) }
            }
            Section("Suscripción") {
                LabeledContent("Plan", value: f.planName ?? "—")
                if let vence = f.vence {
                    LabeledContent("Vence") {
                        Text(vence, style: .date)
                            .foregroundStyle(colorVencimiento(f))
                    }
                }
                if let dias = f.diasParaVencer {
                    HStack {
                        Image(systemName: iconoVencimiento(f))
                        Text(dias < 0 ? "Venció hace \(-dias) día\(dias == -1 ? "" : "s")"
                             : dias == 0 ? "Vence HOY"
                             : "Vencen \(dias) día\(dias == 1 ? "" : "s")")
                    }
                    .font(.callout.weight(.medium))
                    .foregroundStyle(colorVencimiento(f))
                }
                if f.accessBlocked {
                    Label("Acceso bloqueado", systemImage: "lock.fill")
                        .foregroundStyle(.red)
                }
                if let precio = f.renewalPrice {
                    LabeledContent("Precio pactado", value: String(format: "S/ %.2f", precio))
                }
            }
            if !f.pagos.isEmpty {
                Section("Últimos pagos") {
                    ForEach(Array(f.pagos.enumerated()), id: \.offset) { _, pg in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(pg["planName"] as? String ?? pg["plan"] as? String ?? "—")
                                    .font(.callout)
                                if let ts = pg["date"] as? Timestamp {
                                    Text(ts.dateValue(), style: .date)
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            let monto = pg["amount"] as? Double ?? Double(pg["amount"] as? Int ?? 0)
                            Text(String(format: "S/ %.2f", monto))
                                .font(.callout.weight(.semibold))
                        }
                    }
                }
            }
            Section {
                if f.mesesDeRenovacion != nil {
                    Button {
                        mostrarRenovar = true
                    } label: {
                        Label("Registrar renovación", systemImage: "creditcard.fill")
                            .frame(maxWidth: .infinity)
                            .fontWeight(.semibold)
                    }
                    .buttonStyle(.borderedProminent)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                } else {
                    Text("Este plan (\(f.planName ?? "—")) se renueva desde el panel web.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func colorVencimiento(_ f: FichaCliente) -> Color {
        guard let d = f.diasParaVencer else { return .secondary }
        if d < 0 || f.accessBlocked { return .red }
        if d <= 7 { return .orange }
        return .green
    }
    private func iconoVencimiento(_ f: FichaCliente) -> String {
        guard let d = f.diasParaVencer else { return "calendar" }
        if d < 0 { return "exclamationmark.triangle.fill" }
        if d <= 7 { return "clock.fill" }
        return "checkmark.circle.fill"
    }
}

/// Registrar la renovación: monto + método, resumen claro y CONFIRMACIÓN.
/// Toca dinero y fechas de un cliente real: nunca de un solo tap.
struct RenovarSheet: View {
    @ObservedObject var store: FichaStore
    @Environment(\.dismiss) private var dismiss
    @State private var monto = ""
    @State private var metodo = "Transferencia"
    @State private var confirmando = false
    @State private var trabajando = false
    @State private var error: String?
    @State private var listo: Date?

    private let metodos = ["Transferencia", "Yape", "Plin", "Efectivo", "Tarjeta"]

    var body: some View {
        NavigationStack {
            Form {
                if let listo {
                    Section {
                        VStack(spacing: 10) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 44)).foregroundStyle(.green)
                            Text("Renovado")
                                .font(.headline)
                            Text("Nuevo vencimiento: \(listo.formatted(date: .long, time: .omitted))")
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                } else if let f = store.ficha {
                    Section("Cobro") {
                        HStack {
                            Text("S/")
                            TextField("Monto", text: $monto)
                                .keyboardType(.decimalPad)
                        }
                        Picker("Método", selection: $metodo) {
                            ForEach(metodos, id: \.self) { Text($0) }
                        }
                    }
                    Section {
                        LabeledContent("Plan", value: f.planName ?? "—")
                        LabeledContent("Se extiende", value: "\(f.mesesDeRenovacion ?? 0) mes\((f.mesesDeRenovacion ?? 0) == 1 ? "" : "es")")
                        if let nuevo = vencimientoNuevo(f) {
                            LabeledContent("Nuevo vencimiento") {
                                Text(nuevo, style: .date).fontWeight(.semibold)
                            }
                        }
                    } footer: {
                        Text("Renovar el mismo plan conserva sus límites y su precio pactado, igual que en el panel web.")
                    }
                    if let error {
                        Section { Text(error).foregroundStyle(.red) }
                    }
                }
            }
            .navigationTitle("Registrar renovación")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(listo == nil ? "Cancelar" : "Cerrar") { dismiss() }
                }
                if listo == nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            confirmando = true
                        } label: {
                            if trabajando { ProgressView() } else { Text("Renovar").fontWeight(.semibold) }
                        }
                        .disabled(montoNum == nil || trabajando)
                    }
                }
            }
            .confirmationDialog(textoConfirmacion, isPresented: $confirmando, titleVisibility: .visible) {
                Button("Sí, registrar el pago") { renovar() }
                Button("Cancelar", role: .cancel) {}
            }
        }
        .interactiveDismissDisabled(trabajando)
    }

    private var montoNum: Double? {
        let limpio = monto.replacingOccurrences(of: ",", with: ".")
        guard let v = Double(limpio), v > 0 else { return nil }
        return v
    }

    private func vencimientoNuevo(_ f: FichaCliente) -> Date? {
        guard let meses = f.mesesDeRenovacion else { return nil }
        let base = (f.vence != nil && f.vence! > Date()) ? f.vence! : Date()
        return Calendar.current.date(byAdding: .month, value: meses, to: base)
    }

    private var textoConfirmacion: String {
        guard let f = store.ficha, let m = montoNum, let nuevo = vencimientoNuevo(f) else { return "" }
        return "Registrar S/ \(String(format: "%.2f", m)) por \(metodo) y extender hasta el \(nuevo.formatted(date: .long, time: .omitted))"
    }

    private func renovar() {
        guard let m = montoNum else { return }
        trabajando = true
        error = nil
        Task {
            let r = await store.renovar(monto: m, metodo: metodo)
            trabajando = false
            if r.ok { listo = r.nuevoVencimiento }
            else { error = r.error }
        }
    }
}
