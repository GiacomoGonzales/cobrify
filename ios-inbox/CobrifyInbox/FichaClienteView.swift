import SwiftUI
import FirebaseFirestore

/// La ficha del cliente vinculado: su suscripción de Cobrify y las acciones.
/// La joya: renovar el plan sin salir del chat.
struct FichaClienteView: View {
    let businessId: String
    /// La conversación desde la que se abrió, para excluirla de la lista de
    /// "también escriben" y poder saltar a las otras.
    var conversacionId: String? = nil
    @StateObject private var store = FichaStore()
    @StateObject private var otros = OtrosContactosStore()
    @State private var mostrarRenovar = false
    @State private var mostrarAddon = false
    @State private var mostrarReactivar = false
    @State private var confirmarSuspender = false
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
            .sheet(isPresented: $mostrarAddon) {
                if store.ficha != nil {
                    AddonSheet(store: store)
                }
            }
            .sheet(isPresented: $mostrarReactivar) {
                if store.ficha != nil {
                    ReactivarSheet(store: store)
                }
            }
        }
        .task {
            await store.cargar(businessId: businessId)
            await otros.cargar(businessId: businessId, excepto: conversacionId)
        }
    }

    @ViewBuilder private func lista(_ f: FichaCliente) -> some View {
        List {
            Section {
                LabeledContent("Negocio", value: f.nombre ?? "—")
                if let ruc = f.ruc { LabeledContent("RUC", value: ruc) }
                if let email = f.email { LabeledContent("Correo", value: email) }
                if let registro = f.registradoEl {
                    LabeledContent("Cliente desde") {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(registro, style: .date)
                            Text(antiguedad(registro))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if !otros.contactos.isEmpty {
                Section("También escriben por esta empresa") {
                    ForEach(otros.contactos) { c in
                        Button {
                            // El mismo camino que usa un aviso tocado.
                            Navegacion.shared.abrirConversacion = c.id
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(c.titulo)
                                    Text([c.rol, Formato.numero(c.waId)].compactMap { $0 }.joined(separator: " · "))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Section("Suscripción") {
                if f.sinSuscripcion {
                    Label("Sin suscripción: no hay plan, vencimiento ni pagos que mostrar", systemImage: "exclamationmark.triangle.fill")
                        .font(.callout)
                        .foregroundStyle(.red)
                }
                if f.accessBlocked {
                    VStack(alignment: .leading, spacing: 4) {
                        Label("SUSPENDIDO", systemImage: "lock.fill")
                            .font(.headline)
                            .foregroundStyle(.red)
                        if let motivo = f.blockReason {
                            Text("Motivo: \(motivo)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        if let desde = f.blockedAt {
                            Text("Desde el \(desde.formatted(date: .abbreviated, time: .omitted))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                } else if f.vencido {
                    Label("PLAN VENCIDO", systemImage: "exclamationmark.triangle.fill")
                        .font(.headline)
                        .foregroundStyle(.red)
                }
                LabeledContent("Plan", value: f.planName ?? "—")
                if f.nuncaVence {
                    LabeledContent("Vencimiento", value: "Sin vencimiento (cuenta interna)")
                }
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
                if let precio = f.renewalPrice {
                    LabeledContent("Precio pactado", value: String(format: "S/ %.2f", precio))
                }
            }
            Section("Comprobantes de este mes") {
                if f.comprobantesLimite < 0 {
                    Label("Ilimitados (\(f.comprobantesUsados) emitidos)", systemImage: "infinity")
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("\(f.comprobantesUsados) de \(f.comprobantesLimite) usados")
                            Spacer()
                            let restan = max(0, f.comprobantesLimite - f.comprobantesUsados)
                            Text("quedan \(restan)")
                                .foregroundStyle(restan < 50 ? .orange : .secondary)
                        }
                        .font(.callout)
                        ProgressView(value: min(1, Double(f.comprobantesUsados) / Double(max(1, f.comprobantesLimite))))
                            .tint(f.comprobantesUsados >= f.comprobantesLimite ? .red : .accentColor)
                    }
                    Button {
                        mostrarAddon = true
                    } label: {
                        Label("Agregar +500 comprobantes", systemImage: "plus.circle")
                    }
                }
            }
            Section("Pagos") {
                if f.pagos.isEmpty {
                    Text("Sin pagos registrados aún. El primero quedará aquí al registrar una renovación.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(Array(f.pagos.prefix(3).enumerated()), id: \.offset) { _, pg in
                        FilaPago(pago: pg)
                    }
                    NavigationLink {
                        HistorialPagosView(pagos: f.pagos)
                    } label: {
                        HStack {
                            Label("Historial completo", systemImage: "clock.arrow.circlepath")
                            Spacer()
                            Text("\(f.pagos.count) pago\(f.pagos.count == 1 ? "" : "s")")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if f.accessBlocked {
                Section {
                    Button {
                        mostrarReactivar = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "lock.open.fill")
                            Text("Reactivar acceso")
                        }
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(.orange, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                } footer: {
                    Text("Reactivar da días de gracia sin cobro. Para cobrar, usa Registrar renovación: también desbloquea.")
                }
            }
            Section {
                if f.mesesDeRenovacion != nil {
                    Button {
                        mostrarRenovar = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "creditcard.fill")
                            Text("Registrar renovación")
                        }
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(.tint, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                } else {
                    Text("Este plan (\(f.planName ?? "—")) se renueva desde el panel web.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
            if !f.accessBlocked {
                Section {
                    Button(role: .destructive) {
                        confirmarSuspender = true
                    } label: {
                        Label("Suspender acceso", systemImage: "lock")
                    }
                }
            }
        }
        .confirmationDialog("Se bloqueará el acceso de \(f.nombre ?? "este negocio") a Cobrify y su catálogo público quedará suspendido. Se revierte con Reactivar o registrando una renovación.",
                            isPresented: $confirmarSuspender, titleVisibility: .visible) {
            Button("Sí, suspender por falta de pago", role: .destructive) {
                Task { _ = await store.suspender(motivo: "Falta de pago") }
            }
            Button("Cancelar", role: .cancel) {}
        }
    }

    /// "hace 2 años y 3 meses" — la antigüedad del cliente en cristiano.
    private func antiguedad(_ desde: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month], from: desde, to: Date())
        let años = c.year ?? 0, meses = c.month ?? 0
        if años > 0 && meses > 0 { return "hace \(años) año\(años == 1 ? "" : "s") y \(meses) mes\(meses == 1 ? "" : "es")" }
        if años > 0 { return "hace \(años) año\(años == 1 ? "" : "s")" }
        if meses > 0 { return "hace \(meses) mes\(meses == 1 ? "" : "es")" }
        return "este mes"
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
    @State private var planId = ""
    @State private var fechaPropia = false
    @State private var fecha = Date()
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
                    Section("Plan") {
                        Picker("Plan", selection: $planId) {
                            ForEach(PlanCatalogo.planes, id: \.id) { p in
                                Text(p.nombre).tag(p.id)
                            }
                        }
                        .pickerStyle(.navigationLink)
                        if planId != f.plan {
                            Label("Cambio de plan: contrato nuevo — límites del catálogo y el monto cobrado pasa a ser su precio pactado.", systemImage: "arrow.triangle.2.circlepath")
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }
                    }
                    Section {
                        Toggle("Fijar fecha a mano", isOn: $fechaPropia)
                        if fechaPropia {
                            DatePicker("Vence el", selection: $fecha, displayedComponents: .date)
                        } else if let nuevo = vencimientoNuevo(f) {
                            LabeledContent("Se extiende", value: "\(mesesElegidos) mes\(mesesElegidos == 1 ? "" : "es")")
                            LabeledContent("Nuevo vencimiento") {
                                Text(nuevo, style: .date).fontWeight(.semibold)
                            }
                        }
                    } header: {
                        Text("Vencimiento")
                    } footer: {
                        if planId == f.plan {
                            Text("Renovar el mismo plan conserva sus límites y su precio pactado, igual que en el panel web.")
                        }
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
            .onAppear {
                if planId.isEmpty { planId = store.ficha?.plan ?? "" }
                if let v = store.ficha?.vence { fecha = max(v, Date()) }
            }
        }
        .interactiveDismissDisabled(trabajando)
    }

    private var mesesElegidos: Int {
        PlanCatalogo.plan(planId)?.meses ?? 0
    }

    private var montoNum: Double? {
        let limpio = monto.replacingOccurrences(of: ",", with: ".")
        guard let v = Double(limpio), v > 0 else { return nil }
        return v
    }

    private func vencimientoNuevo(_ f: FichaCliente) -> Date? {
        if fechaPropia { return fecha }
        let meses = mesesElegidos
        guard meses > 0 else { return nil }
        let base = (f.vence != nil && f.vence! > Date()) ? f.vence! : Date()
        return Calendar.current.date(byAdding: .month, value: meses, to: base)
    }

    private var textoConfirmacion: String {
        guard let f = store.ficha, let m = montoNum, let nuevo = vencimientoNuevo(f) else { return "" }
        let cambio = planId != f.plan ? " cambiando a \(PlanCatalogo.plan(planId)?.nombre ?? planId)," : ""
        return "Registrar S/ \(String(format: "%.2f", m)) por \(metodo),\(cambio) y dejar el vencimiento el \(nuevo.formatted(date: .long, time: .omitted))"
    }

    private func renovar() {
        guard let m = montoNum else { return }
        trabajando = true
        error = nil
        Task {
            let r = await store.renovar(monto: m, metodo: metodo, planId: planId,
                                        fechaPersonalizada: fechaPropia ? fecha : nil)
            trabajando = false
            if r.ok { listo = r.nuevoVencimiento }
            else { error = r.error }
        }
    }
}

/// El paquete +500 comprobantes: monto, confirmación y listo. No toca fechas.
struct AddonSheet: View {
    @ObservedObject var store: FichaStore
    @Environment(\.dismiss) private var dismiss
    @State private var monto = "10"
    @State private var metodo = "Transferencia"
    @State private var confirmando = false
    @State private var trabajando = false
    @State private var error: String?
    @State private var listo = false

    var body: some View {
        NavigationStack {
            Form {
                if listo {
                    Section {
                        VStack(spacing: 10) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 44)).foregroundStyle(.green)
                            Text("Paquete agregado").font(.headline)
                            if let f = store.ficha {
                                Text("Nuevo límite: \(f.comprobantesLimite) comprobantes este mes")
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                } else {
                    Section("Cobro") {
                        HStack {
                            Text("S/")
                            TextField("Monto", text: $monto).keyboardType(.decimalPad)
                        }
                        Picker("Método", selection: $metodo) {
                            ForEach(["Transferencia", "Yape", "Plin", "Efectivo", "Tarjeta"], id: \.self) { Text($0) }
                        }
                    }
                    if let f = store.ficha {
                        Section {
                            LabeledContent("Límite actual", value: "\(f.comprobantesLimite)")
                            LabeledContent("Nuevo límite") {
                                Text("\(f.comprobantesLimite + 500)").fontWeight(.semibold)
                            }
                        } footer: {
                            Text("Suma 500 comprobantes al mes en curso. No extiende la suscripción.")
                        }
                    }
                    if let error {
                        Section { Text(error).foregroundStyle(.red) }
                    }
                }
            }
            .navigationTitle("+500 comprobantes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(listo ? "Cerrar" : "Cancelar") { dismiss() }
                }
                if !listo {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            confirmando = true
                        } label: {
                            if trabajando { ProgressView() } else { Text("Agregar").fontWeight(.semibold) }
                        }
                        .disabled(Double(monto.replacingOccurrences(of: ",", with: ".")) == nil || trabajando)
                    }
                }
            }
            .confirmationDialog("Registrar S/ \(monto) por \(metodo) y sumar 500 comprobantes al límite del mes",
                                isPresented: $confirmando, titleVisibility: .visible) {
                Button("Sí, agregar el paquete") { agregar() }
                Button("Cancelar", role: .cancel) {}
            }
        }
        .interactiveDismissDisabled(trabajando)
    }

    private func agregar() {
        guard let m = Double(monto.replacingOccurrences(of: ",", with: ".")) else { return }
        trabajando = true
        Task {
            let e = await store.agregarComprobantes(monto: m, metodo: metodo)
            trabajando = false
            if let e { error = e } else { listo = true }
        }
    }
}


/// Una fila del historial: plan, fecha, método y monto.
struct FilaPago: View {
    let pago: [String: Any]

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(pago["planName"] as? String ?? pago["plan"] as? String ?? "—")
                    .font(.callout)
                HStack(spacing: 6) {
                    if let ts = pago["date"] as? Timestamp {
                        Text(ts.dateValue(), style: .date)
                    }
                    if let metodo = pago["method"] as? String {
                        Text("· \(metodo)")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                let monto = pago["amount"] as? Double ?? Double(pago["amount"] as? Int ?? 0)
                Text(String(format: "S/ %.2f", monto))
                    .font(.callout.weight(.semibold))
                if let meses = pago["months"] as? Int, meses > 0 {
                    Text("+\(meses) mes\(meses == 1 ? "" : "es")")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

/// TODOS los pagos del cliente, del más reciente al más viejo, con el total.
struct HistorialPagosView: View {
    let pagos: [[String: Any]]

    private var total: Double {
        pagos.reduce(0) { $0 + ($1["amount"] as? Double ?? Double($1["amount"] as? Int ?? 0)) }
    }

    var body: some View {
        List {
            Section {
                LabeledContent("Total pagado") {
                    Text(String(format: "S/ %.2f", total))
                        .font(.headline)
                }
                LabeledContent("Pagos registrados", value: "\(pagos.count)")
            }
            Section("Historial") {
                ForEach(Array(pagos.enumerated()), id: \.offset) { _, pg in
                    FilaPago(pago: pg)
                }
            }
        }
        .navigationTitle("Historial de pagos")
        .navigationBarTitleDisplayMode(.inline)
    }
}


/// Reactivar el acceso con días de gracia, calcado de reactivateUser web.
struct ReactivarSheet: View {
    @ObservedObject var store: FichaStore
    @Environment(\.dismiss) private var dismiss
    @State private var dias = 30
    @State private var confirmando = false
    @State private var trabajando = false
    @State private var error: String?
    @State private var listo: Date?

    var body: some View {
        NavigationStack {
            Form {
                if let listo {
                    Section {
                        VStack(spacing: 10) {
                            Image(systemName: "lock.open.fill")
                                .font(.system(size: 44)).foregroundStyle(.green)
                            Text("Acceso reactivado").font(.headline)
                            Text("Nuevo vencimiento: \(listo.formatted(date: .long, time: .omitted))")
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                } else {
                    Section("Días de gracia") {
                        Picker("Extender", selection: $dias) {
                            Text("7 días").tag(7)
                            Text("15 días").tag(15)
                            Text("30 días").tag(30)
                            Text("60 días").tag(60)
                        }
                        .pickerStyle(.segmented)
                        if let nuevo = Calendar.current.date(byAdding: .day, value: dias, to: baseFecha) {
                            LabeledContent("Nuevo vencimiento") {
                                Text(nuevo, style: .date).fontWeight(.semibold)
                            }
                        }
                    }
                    Section {
                        Text("Sin cobro: son días de gracia. Para cobrar usa Registrar renovación, que también desbloquea.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                    if let error {
                        Section { Text(error).foregroundStyle(.red) }
                    }
                }
            }
            .navigationTitle("Reactivar acceso")
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
                            if trabajando { ProgressView() } else { Text("Reactivar").fontWeight(.semibold) }
                        }
                        .disabled(trabajando)
                    }
                }
            }
            .confirmationDialog("Desbloquear el acceso y extender \(dias) días sin cobro",
                                isPresented: $confirmando, titleVisibility: .visible) {
                Button("Sí, reactivar") { reactivar() }
                Button("Cancelar", role: .cancel) {}
            }
        }
        .interactiveDismissDisabled(trabajando)
    }

    private var baseFecha: Date {
        if let v = store.ficha?.vence, v > Date() { return v }
        return Date()
    }

    private func reactivar() {
        trabajando = true
        error = nil
        Task {
            let r = await store.reactivar(dias: dias)
            trabajando = false
            if r.ok { listo = r.nuevoVencimiento }
            else { error = r.error }
        }
    }
}
