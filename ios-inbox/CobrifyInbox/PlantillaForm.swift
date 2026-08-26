import SwiftUI

/// El formulario de una plantilla: elegirla, llenar sus variables y ver la
/// vista previa. Lo comparten el envío desde el chat (ventana cerrada) y
/// las campañas.
struct PlantillaForm: View {
    @ObservedObject private var store = PlantillasStore.shared
    @Binding var plantilla: Plantilla?
    @Binding var valoresBody: [String]
    @Binding var headerText: String

    var body: some View {
        Section("Plantilla") {
            Picker("Plantilla", selection: $plantilla) {
                Text("Elegir…").tag(nil as Plantilla?)
                ForEach(store.plantillas) { p in
                    Text(p.name).tag(p as Plantilla?)
                }
            }
            .onChange(of: plantilla) {
                valoresBody = Array(repeating: "", count: plantilla?.variablesDelCuerpo ?? 0)
                headerText = ""
            }
        }
        if let p = plantilla {
            if let cab = p.cabecera, cab.formato == "IMAGE" {
                Section {
                    Label("Esta plantilla lleva imagen de cabecera; por ahora envíala desde la web.",
                          systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                }
            } else {
                if let cab = p.cabecera, cab.conVariable {
                    Section("Cabecera") {
                        TextField("Valor de {{1}}", text: $headerText)
                    }
                }
                if p.variablesDelCuerpo > 0 {
                    Section("Variables") {
                        ForEach(0..<p.variablesDelCuerpo, id: \.self) { i in
                            TextField("Valor de {{\(i + 1)}}", text: Binding(
                                get: { i < valoresBody.count ? valoresBody[i] : "" },
                                set: { v in
                                    while valoresBody.count <= i { valoresBody.append("") }
                                    valoresBody[i] = v
                                }
                            ))
                        }
                    }
                }
                Section("Vista previa") {
                    Text(p.previsualizar(body: valoresBody, headerText: headerText.isEmpty ? nil : headerText))
                        .font(.callout)
                }
            }
        }
    }

    /// ¿Se puede enviar con lo que hay?
    static func lista(_ plantilla: Plantilla?, _ valores: [String], _ headerText: String) -> Bool {
        guard let p = plantilla else { return false }
        if let cab = p.cabecera, cab.formato == "IMAGE" { return false }
        if let cab = p.cabecera, cab.conVariable, headerText.trimmingCharacters(in: .whitespaces).isEmpty { return false }
        for i in 0..<p.variablesDelCuerpo where (i >= valores.count || valores[i].trimmingCharacters(in: .whitespaces).isEmpty) {
            return false
        }
        return true
    }
}

/// Enviar UNA plantilla a la conversación con la ventana cerrada.
struct EnviarPlantillaSheet: View {
    let conversationId: String
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var store = PlantillasStore.shared
    @State private var plantilla: Plantilla?
    @State private var valoresBody: [String] = []
    @State private var headerText = ""
    @State private var enviando = false
    @State private var error: String?
    @State private var sincronizando = false

    var body: some View {
        NavigationStack {
            Form {
                if store.plantillas.isEmpty {
                    Section {
                        Text("No hay plantillas aprobadas todavía.")
                            .foregroundStyle(.secondary)
                        Button {
                            sincronizar()
                        } label: {
                            if sincronizando { ProgressView() } else { Label("Traer de Meta", systemImage: "arrow.clockwise") }
                        }
                    }
                } else {
                    PlantillaForm(plantilla: $plantilla, valoresBody: $valoresBody, headerText: $headerText)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Enviar plantilla")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        enviar()
                    } label: {
                        if enviando { ProgressView() } else { Text("Enviar").fontWeight(.semibold) }
                    }
                    .disabled(!PlantillaForm.lista(plantilla, valoresBody, headerText) || enviando)
                }
            }
            .onAppear { store.empezar() }
        }
    }

    private func enviar() {
        guard let p = plantilla else { return }
        enviando = true
        error = nil
        Task {
            do {
                try await ChatAPI.enviarPlantilla(conversationId: conversationId, plantilla: p,
                                                  body: valoresBody,
                                                  headerText: headerText.isEmpty ? nil : headerText)
                dismiss()
            } catch {
                self.error = (error as? ChatAPI.ErrorEnvio)?.mensaje ?? "No se pudo enviar."
            }
            enviando = false
        }
    }

    private func sincronizar() {
        sincronizando = true
        Task {
            try? await ChatAPI.sincronizarPlantillas()
            sincronizando = false
        }
    }
}
