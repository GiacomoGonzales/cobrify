import SwiftUI

/// Vincular la conversación a un negocio de Cobrify buscándolo por nombre.
struct VincularSheet: View {
    let conversationId: String
    @Environment(\.dismiss) private var dismiss
    @StateObject private var buscador = BuscadorNegocios()
    @State private var texto = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Nombre del negocio…", text: $texto)
                        .autocorrectionDisabled()
                        .onChange(of: texto) {
                            Task { await buscador.buscar(texto) }
                        }
                }
                if buscador.buscando {
                    ProgressView()
                } else {
                    ForEach(buscador.resultados, id: \.id) { r in
                        Button {
                            BuscadorNegocios.vincular(conversationId: conversationId,
                                                      businessId: r.id, nombre: r.nombre)
                            dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.nombre)
                                if let ruc = r.ruc {
                                    Text("RUC \(ruc)").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("Vincular negocio")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { dismiss() } }
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
