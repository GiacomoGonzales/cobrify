import SwiftUI

/// Vincular la conversación a un negocio de Cobrify.
///
/// Dos pasos: se busca el negocio y, apenas se elige, se pregunta QUIÉN
/// escribe. Es el único momento en que se sabe —el dueño contrata pero
/// después escribe su secretaria— y si no se pregunta ahí no se anota nunca.
struct VincularSheet: View {
    let conversationId: String
    @Environment(\.dismiss) private var dismiss
    @StateObject private var buscador = BuscadorNegocios()
    @State private var texto = ""
    @State private var elegido: NegocioIndexado?
    @State private var rol = ""
    @FocusState private var rolEnfocado: Bool

    var body: some View {
        NavigationStack {
            Group {
                if let elegido { pasoDelRol(elegido) } else { pasoDeBusqueda }
            }
            .navigationTitle(elegido == nil ? "Vincular negocio" : "¿Quién te escribe?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(elegido == nil ? "Cancelar" : "Omitir") { dismiss() }
                }
                if elegido != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Listo") {
                            BuscadorNegocios.guardarRol(conversationId: conversationId, rol: rol)
                            dismiss()
                        }
                    }
                }
            }
        }
    }

    private var pasoDeBusqueda: some View {
        List {
            Section {
                TextField("Nombre, RUC o correo…", text: $texto)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .onChange(of: texto) { Task { await buscador.buscar(texto) } }
            }
            if buscador.buscando {
                ProgressView()
            } else {
                ForEach(buscador.resultados) { r in
                    Button {
                        BuscadorNegocios.vincular(conversationId: conversationId,
                                                  businessId: r.id, nombre: r.nombre)
                        elegido = r
                        rolEnfocado = true
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
        }
    }

    @ViewBuilder private func pasoDelRol(_ n: NegocioIndexado) -> some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Vinculada a").font(.caption).foregroundStyle(.secondary)
                    Text(n.nombre).font(.headline)
                }
            }
            Section {
                TextField("Secretaria, contador, almacén…", text: $rol)
                    .autocorrectionDisabled()
                    .focused($rolEnfocado)
                    .submitLabel(.done)
                    .onSubmit {
                        BuscadorNegocios.guardarRol(conversationId: conversationId, rol: rol)
                        dismiss()
                    }
            } footer: {
                Text("Sale junto al nombre en la lista y en la cabecera del chat, para no confundir a quien escribe con el dueño. Puedes dejarlo en blanco.")
            }
        }
    }
}

/// La pestaña Clientes: los negocios vinculados a tus conversaciones, con
/// acceso directo a su ficha y su chat.
struct ClientesRealesView: View {
    @StateObject private var inbox = InboxStore()
    @State private var convFicha: Conversacion?
    @State private var busqueda = ""

    private var clientes: [(id: String, nombre: String, conv: Conversacion)] {
        var vistos = Set<String>()
        var lista: [(String, String, Conversacion)] = []
        for conv in inbox.conversaciones {
            guard let id = conv.linkedBusinessId, !vistos.contains(id) else { continue }
            vistos.insert(id)
            lista.append((id, conv.linkedBusinessName ?? conv.titulo, conv))
        }
        let q = busqueda.trimmingCharacters(in: .whitespaces).lowercased()
        if q.isEmpty { return lista.sorted { $0.1 < $1.1 } }
        return lista.filter { $0.1.lowercased().contains(q) }.sorted { $0.1 < $1.1 }
    }

    var body: some View {
        NavigationStack {
            Group {
                if clientes.isEmpty {
                    ContentUnavailableView(
                        "Sin clientes vinculados",
                        systemImage: "person.2",
                        description: Text("Cuando una conversación quede vinculada a un negocio de Cobrify, aparece aquí con su ficha.")
                    )
                } else {
                    List(clientes, id: \.id) { c in
                        Button {
                            convFicha = c.conv
                        } label: {
                            HStack(spacing: 12) {
                                ZStack {
                                    Circle().fill(.tint.opacity(0.15))
                                    Image(systemName: "storefront")
                                        .foregroundStyle(.tint)
                                }
                                .frame(width: 44, height: 44)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(c.nombre).lineLimit(1)
                                    Text(Formato.numero(c.conv.waId))
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption).foregroundStyle(.tertiary)
                            }
                            // Sin esto solo respondían el texto y el icono:
                            // el hueco de la derecha no abría nada.
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                    .searchable(text: $busqueda, prompt: "Buscar cliente")
                }
            }
            .navigationTitle("Clientes")
            .sheet(item: $convFicha) { c in
                GrupoCuentasView(conv: c)
            }
        }
        .onAppear { inbox.empezar() }
    }
}

private struct FichaId: Identifiable { let id: String }
