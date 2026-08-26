import SwiftUI

/// La pestaña Campañas de verdad: historial en vivo + lanzar una nueva.
struct CampanasRealesView: View {
    @ObservedObject private var store = PlantillasStore.shared
    @State private var mostrarNueva = false

    var body: some View {
        NavigationStack {
            Group {
                if store.campanas.isEmpty {
                    ContentUnavailableView(
                        "Sin campañas aún",
                        systemImage: "megaphone",
                        description: Text("Envía una plantilla aprobada a varios clientes a la vez. Los que pidieron no recibir mensajes se saltan solos.")
                    )
                } else {
                    List(store.campanas) { c in
                        FilaCampana(campana: c)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Campañas")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { mostrarNueva = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $mostrarNueva) {
                NuevaCampanaSheet()
            }
            .onAppear { store.empezar() }
        }
    }
}

private struct FilaCampana: View {
    let campana: Campana

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(campana.titulo)
                    .font(.body.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                if campana.estado == "en_curso" {
                    Label("En curso", systemImage: "paperplane")
                        .font(.caption)
                        .foregroundStyle(.orange)
                } else {
                    Text(Formato.hora(campana.createdAt))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            ProgressView(value: campana.total > 0
                         ? Double(campana.enviados + campana.fallidos + campana.omitidos) / Double(campana.total)
                         : 0)
            HStack(spacing: 14) {
                Label("\(campana.enviados)/\(campana.total)", systemImage: "checkmark")
                    .foregroundStyle(.green)
                if campana.fallidos > 0 {
                    Label("\(campana.fallidos)", systemImage: "xmark")
                        .foregroundStyle(.red)
                }
                if campana.omitidos > 0 {
                    Label("\(campana.omitidos) omitidos", systemImage: "hand.raised")
                        .foregroundStyle(.secondary)
                }
            }
            .font(.caption)
        }
        .padding(.vertical, 4)
    }
}

/// Lanzar una campaña: plantilla -> valores -> destinatarios -> confirmar.
private struct NuevaCampanaSheet: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var inbox = InboxStore()
    @ObservedObject private var catalogo = CatalogoStore.shared

    @State private var plantilla: Plantilla?
    @State private var valoresBody: [String] = []
    @State private var headerText = ""
    @State private var titulo = ""
    @State private var elegidos = Set<String>()
    @State private var enviando = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                PlantillaForm(plantilla: $plantilla, valoresBody: $valoresBody, headerText: $headerText)

                Section("Nombre de la campaña") {
                    TextField("Ej: Aviso de renovación agosto", text: $titulo)
                }

                Section {
                    ForEach(inbox.conversaciones) { conv in
                        Button {
                            if elegidos.contains(conv.id) { elegidos.remove(conv.id) }
                            else { elegidos.insert(conv.id) }
                        } label: {
                            HStack {
                                Image(systemName: elegidos.contains(conv.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(elegidos.contains(conv.id) ? AnyShapeStyle(.tint) : AnyShapeStyle(.tertiary))
                                VStack(alignment: .leading) {
                                    Text(conv.titulo).lineLimit(1)
                                    if conv.optOut {
                                        Text("Pidió no recibir mensajes — se omitirá")
                                            .font(.caption).foregroundStyle(.orange)
                                    }
                                }
                                Spacer()
                            }
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    HStack {
                        Text("Destinatarios (\(elegidos.count))")
                        Spacer()
                        Button(elegidos.count == inbox.conversaciones.count ? "Ninguno" : "Todos") {
                            if elegidos.count == inbox.conversaciones.count { elegidos = [] }
                            else { elegidos = Set(inbox.conversaciones.map(\.id)) }
                        }
                        .font(.caption)
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Nueva campaña")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        enviar()
                    } label: {
                        if enviando { ProgressView() } else { Text("Enviar").fontWeight(.semibold) }
                    }
                    .disabled(!PlantillaForm.lista(plantilla, valoresBody, headerText) || elegidos.isEmpty || enviando)
                }
            }
            .onAppear { inbox.empezar() }
        }
        .interactiveDismissDisabled(enviando)
    }

    private func enviar() {
        guard let p = plantilla else { return }
        enviando = true
        error = nil
        Task {
            do {
                try await ChatAPI.enviarCampana(conversationIds: Array(elegidos), plantilla: p,
                                                body: valoresBody,
                                                headerText: headerText.isEmpty ? nil : headerText,
                                                titulo: titulo.trimmingCharacters(in: .whitespaces))
                dismiss()
            } catch {
                self.error = (error as? ChatAPI.ErrorEnvio)?.mensaje ?? "No se pudo lanzar la campaña."
            }
            enviando = false
        }
    }
}
