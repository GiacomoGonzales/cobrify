import SwiftUI

/// Las cuentas de un cliente. Un contacto — un vendedor, un reseller — suele
/// manejar varias; aquí se ven todas juntas y se entra a la ficha de cada una.
struct GrupoCuentasView: View {
    let conv: Conversacion
    @StateObject private var grupo = GrupoCuentasStore()
    @State private var fichaDe: String?
    @State private var mostrarBuscar = false
    @State private var editandoRol = false
    @State private var rol = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if grupo.cargando && grupo.cuentas.isEmpty {
                    ProgressView("Cargando cuentas…")
                } else {
                    lista
                }
            }
            .navigationTitle(grupo.cuentas.count > 1 ? "Cuentas del cliente" : "Ficha del cliente")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cerrar") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { mostrarBuscar = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(item: Binding(
                get: { fichaDe.map { IdFicha(id: $0) } },
                set: { fichaDe = $0?.id }
            )) { f in
                FichaClienteView(businessId: f.id, conversacionId: conv.id)
            }
            .sheet(isPresented: $mostrarBuscar) {
                AgregarCuentaSheet(conversationId: conv.id, sugeridas: grupo.sugeridas)
            }
            .alert("¿Quién te escribe?", isPresented: $editandoRol) {
                TextField("Secretaria, contador, almacén…", text: $rol)
                Button("Guardar") { BuscadorNegocios.guardarRol(conversationId: conv.id, rol: rol) }
                Button("Cancelar", role: .cancel) { rol = conv.rolContacto ?? "" }
            } message: {
                Text("Sale junto al nombre en la lista y en la cabecera del chat. Déjalo en blanco para quitarlo.")
            }
        }
        .onAppear {
            grupo.escuchar(conversationId: conv.id)
            rol = conv.rolContacto ?? ""
        }
        .onDisappear { grupo.parar() }
    }

    private var lista: some View {
        List {
            Section("Te escribe") {
                VStack(alignment: .leading, spacing: 2) {
                    Text(conv.titulo)
                    Text(conv.rolContacto ?? Formato.numero(conv.waId))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Button(conv.rolContacto == nil ? "Anotar quién es" : "Cambiar quién es") {
                    rol = conv.rolContacto ?? ""
                    editandoRol = true
                }
            }

            Section {
                ForEach(grupo.cuentas) { c in
                    Button { fichaDe = c.id } label: { FilaCuenta(cuenta: c, principal: c.id == conv.linkedBusinessId) }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing) {
                            // La principal no se saca desde aquí: para eso
                            // está "Desvincular negocio" en el menú del chat.
                            if c.id != conv.linkedBusinessId {
                                Button(role: .destructive) {
                                    BuscadorNegocios.quitarCuenta(conversationId: conv.id, businessId: c.id)
                                } label: {
                                    Label("Quitar", systemImage: "minus.circle")
                                }
                            }
                        }
                }
            } header: {
                Text("\(grupo.cuentas.count) cuenta\(grupo.cuentas.count == 1 ? "" : "s")")
            } footer: {
                if grupo.cuentas.count > 1 {
                    Text(resumen)
                } else {
                    Text("Si este contacto maneja más cuentas, agrégalas con + y las verás todas aquí.")
                }
            }

            if !grupo.sugeridas.isEmpty {
                Section {
                    ForEach(grupo.sugeridas.prefix(5)) { c in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.nombre).lineLimit(1)
                                if let plan = c.planName {
                                    Text(plan).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Button {
                                BuscadorNegocios.agregarCuenta(conversationId: conv.id, businessId: c.id)
                            } label: {
                                Image(systemName: "plus.circle.fill")
                                    .font(.title3)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } header: {
                    Text("Quizá también son suyas")
                } footer: {
                    Text("Cuentas que trajo el mismo vendedor o reseller. Solo se suman si tú las agregas.")
                }
            }
        }
    }

    /// Lo que importa de un vistazo cuando son varias: cuántas están al día.
    private var resumen: String {
        let vencidas = grupo.cuentas.filter { $0.vencida || $0.accessBlocked }.count
        if vencidas == 0 { return "Todas al día." }
        return "\(vencidas) de \(grupo.cuentas.count) vencida\(vencidas == 1 ? "" : "s") o suspendida\(vencidas == 1 ? "" : "s")."
    }
}

private struct IdFicha: Identifiable { let id: String }

private struct FilaCuenta: View {
    let cuenta: CuentaResumen
    var principal = false

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(color.opacity(0.15))
                Image(systemName: icono).foregroundStyle(color)
            }
            .frame(width: 38, height: 38)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(cuenta.nombre).lineLimit(1)
                    if principal {
                        Text("principal")
                            .font(.caption2)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(.quaternary, in: Capsule())
                    }
                }
                Text(detalle)
                    .font(.caption)
                    .foregroundStyle(color == .secondary ? AnyShapeStyle(.secondary) : AnyShapeStyle(color))
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }
    }

    private var color: Color {
        if cuenta.accessBlocked || cuenta.vencida { return .red }
        if let d = cuenta.diasParaVencer, d <= 7 { return .orange }
        return .green
    }
    private var icono: String {
        if cuenta.accessBlocked { return "lock.fill" }
        return "storefront"
    }
    private var detalle: String {
        if cuenta.accessBlocked { return "Suspendida" }
        if cuenta.nuncaVence { return "\(cuenta.planName ?? "—") · sin vencimiento" }
        guard let d = cuenta.diasParaVencer else { return cuenta.planName ?? "—" }
        let plan = cuenta.planName ?? "—"
        if d < 0 { return "\(plan) · venció hace \(-d) día\(d == -1 ? "" : "s")" }
        if d == 0 { return "\(plan) · vence hoy" }
        return "\(plan) · \(d) día\(d == 1 ? "" : "s")"
    }
}

/// Buscar un negocio y sumarlo a las cuentas del cliente.
private struct AgregarCuentaSheet: View {
    let conversationId: String
    var sugeridas: [CuentaResumen] = []
    @Environment(\.dismiss) private var dismiss
    @StateObject private var buscador = BuscadorNegocios()
    @State private var texto = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Nombre, RUC o correo…", text: $texto)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onChange(of: texto) { Task { await buscador.buscar(texto) } }
                }
                if buscador.buscando {
                    ProgressView()
                } else if !buscador.resultados.isEmpty {
                    Section("Resultados") {
                        ForEach(buscador.resultados) { r in
                            Button {
                                BuscadorNegocios.agregarCuenta(conversationId: conversationId, businessId: r.id)
                                dismiss()
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.nombre)
                                    if !r.detalle.isEmpty {
                                        Text(r.detalle).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } else if !sugeridas.isEmpty {
                    Section("Del mismo vendedor o reseller") {
                        ForEach(sugeridas) { c in
                            Button {
                                BuscadorNegocios.agregarCuenta(conversationId: conversationId, businessId: c.id)
                                dismiss()
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(c.nombre)
                                    if let plan = c.planName {
                                        Text(plan).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .navigationTitle("Agregar cuenta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { dismiss() } }
            }
        }
    }
}
