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
    @StateObject private var carteraVendedor = CarteraStore()
    @State private var vendedores: [VendedorCobrify] = []
    @State private var eligiendoVendedor = false
    @State private var verTodaLaCartera = false
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
                // Al terminar bien una renovación (o +500, o reactivar), la
                // ficha pide cerrar ESTA hoja, y con ella se va todo lo que
                // tiene encima: se vuelve directo a la conversación.
                FichaClienteView(businessId: f.id, conversacionId: conv.id, alTerminar: { dismiss() })
            }
            .sheet(isPresented: $mostrarBuscar) {
                AgregarCuentaSheet(conversationId: conv.id, sugeridas: grupo.sugeridas)
            }
            .sheet(isPresented: $eligiendoVendedor) {
                ElegirVendedorSheet(conversationId: conv.id, vendedores: vendedores, actual: vendedorAsignado)
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
        .task { vendedores = await Vendedores.listar() }
        .task(id: vendedorAsignado) {
            if let id = vendedorAsignado {
                await carteraVendedor.cargar(vendedorId: id)
            } else {
                carteraVendedor.cartera = nil
            }
        }
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

            // Qué vendedor de Cobrify es este contacto: su cartera sale abajo.
            // Si el número es el de un vendedor registrado, se propone.
            if !vendedores.isEmpty {
                Section("Vendedor") {
                    if let id = vendedorAsignado {
                        LabeledContent("Vendedor de Cobrify",
                                       value: vendedores.first { $0.id == id }?.nombre ?? "Vendedor")
                        Button("Cambiar") { eligiendoVendedor = true }
                    } else if let sugerido = Vendedores.porTelefono(vendedores, waId: conv.waId) {
                        Button("Es \(sugerido.nombre), vendedor de Cobrify: asignarlo") {
                            Task { try? await Vendedores.asignar(conversationId: conv.id, vendedorId: sugerido.id) }
                        }
                    } else {
                        Button("¿Es vendedor de Cobrify? Asignarlo") { eligiendoVendedor = true }
                    }
                }
            }

            if vendedorAsignado != nil, let c = carteraVendedor.cartera {
                Section {
                    if c.cuentas.isEmpty {
                        Text("Todavía no tiene cuentas.").foregroundStyle(.secondary)
                    }
                    ForEach(verTodaLaCartera ? c.cuentas : Array(c.cuentas.prefix(8))) { cuenta in
                        Button { fichaDe = cuenta.id } label: { FilaCuenta(cuenta: cuenta) }
                            .buttonStyle(.plain)
                    }
                    if c.cuentas.count > 8 {
                        Button(verTodaLaCartera ? "Ver menos" : "Ver todas (\(c.cuentas.count))") {
                            verTodaLaCartera.toggle()
                        }
                    }
                } header: {
                    Text("\(c.titulo) (\(c.cuentas.count))")
                } footer: {
                    Text(c.resumen)
                }
            }
        }
    }

    /// El vendedor asignado, al día: la conversación que escucha el grupo manda
    /// sobre la que se recibió al abrir (que no se entera de los cambios).
    private var vendedorAsignado: String? {
        grupo.conversacion.map { $0.vendedorContactoId } ?? conv.vendedorContactoId
    }

    /// Lo que importa de un vistazo cuando son varias: cuántas están al día.
    private var resumen: String {
        let vencidas = grupo.cuentas.filter { $0.vencida || $0.accessBlocked }.count
        if vencidas == 0 { return "Todas al día." }
        return "\(vencidas) de \(grupo.cuentas.count) vencida\(vencidas == 1 ? "" : "s") o suspendida\(vencidas == 1 ? "" : "s")."
    }
}

private struct IdFicha: Identifiable { let id: String }

struct FilaCuenta: View {
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

/// Elegir qué vendedor de Cobrify es este contacto (o que no es ninguno).
private struct ElegirVendedorSheet: View {
    let conversationId: String
    let vendedores: [VendedorCobrify]
    let actual: String?
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    fila(id: nil, nombre: "No es vendedor", detalle: nil)
                    ForEach(vendedores.filter { $0.activo || $0.id == actual }) { v in
                        fila(id: v.id, nombre: v.nombre, detalle: v.telefono.nilSiVacio)
                    }
                } footer: {
                    Text("Su cartera aparece en la ficha: las cuentas que tiene asignadas, con su vencimiento.")
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Vendedor de Cobrify")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func fila(id: String?, nombre: String, detalle: String?) -> some View {
        Button {
            Task {
                do {
                    try await Vendedores.asignar(conversationId: conversationId, vendedorId: id)
                    dismiss()
                } catch {
                    self.error = "No se pudo guardar el vendedor."
                }
            }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    // Color.primary y no .primary: dentro de un botón, .primary
                    // es el tinte y el nombre saldría verde.
                    Text(nombre).foregroundStyle(Color.primary)
                    if let detalle {
                        Text(detalle).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if id == actual {
                    Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(.tint)
                }
            }
            .contentShape(Rectangle())
        }
    }
}
