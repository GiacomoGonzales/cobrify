import SwiftUI

/// Crear, editar y borrar las respuestas rápidas desde el teléfono.
/// El mismo catálogo que la web: lo que se guarde aquí aparece allá.
struct RespuestasRapidasConfigView: View {
    @ObservedObject private var catalogo = CatalogoStore.shared
    @State private var atajo = ""
    @State private var texto = ""
    @State private var guardando = false
    @State private var error: String?
    @FocusState private var enfocado: Bool

    /// El atajo normalizado como la web: minúsculas, sin "/", espacios a "-".
    private var atajoLimpio: String {
        atajo.trimmingCharacters(in: .whitespaces)
            .lowercased()
            .replacingOccurrences(of: "/", with: "")
            .replacingOccurrences(of: " ", with: "-")
    }

    private var editando: Bool {
        catalogo.respuestasRapidas.contains { $0.atajo == atajoLimpio }
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 2) {
                    Text("/").foregroundStyle(.secondary)
                    TextField("atajo (ej: gracias)", text: $atajo)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($enfocado)
                }
                TextField("Texto de la respuesta…", text: $texto, axis: .vertical)
                    .lineLimit(2...6)
                Button {
                    guardar()
                } label: {
                    HStack {
                        if guardando {
                            ProgressView()
                        } else {
                            Label(editando ? "Actualizar /\(atajoLimpio)" : "Guardar respuesta",
                                  systemImage: editando ? "pencil" : "plus.circle.fill")
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .disabled(atajoLimpio.isEmpty || texto.trimmingCharacters(in: .whitespaces).isEmpty || guardando)
                if let error {
                    Text(error).foregroundStyle(.red).font(.callout)
                }
            } header: {
                Text(editando ? "Editando" : "Nueva respuesta")
            } footer: {
                Text("En el chat, escribe / para ver tus atajos y tocar el que quieras. Tocar una de la lista la carga aquí para editarla.")
            }

            Section("Tus respuestas (\(catalogo.respuestasRapidas.count))") {
                if catalogo.respuestasRapidas.isEmpty {
                    Text("Todavía no tienes respuestas rápidas.")
                        .foregroundStyle(.secondary)
                }
                ForEach(catalogo.respuestasRapidas) { r in
                    Button {
                        atajo = r.atajo
                        texto = r.texto
                        error = nil
                        enfocado = true
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: r.media != nil ? "paperclip" : "bolt.fill")
                                .foregroundStyle(.tint)
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("/" + r.atajo)
                                    .font(.subheadline.weight(.semibold))
                                Text(r.texto.isEmpty ? "(solo el archivo)" : r.texto)
                                    .font(.callout)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
                .onDelete { indices in
                    var lista = catalogo.respuestasRapidas
                    lista.remove(atOffsets: indices)
                    Task { error = await catalogo.guardarRespuestasRapidas(lista) }
                }
            }
        }
        .navigationTitle("Respuestas rápidas")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { catalogo.empezar() }
    }

    private func guardar() {
        let id = atajoLimpio
        let cuerpo = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty, !cuerpo.isEmpty else { return }
        guardando = true
        error = nil
        var lista = catalogo.respuestasRapidas
        if let i = lista.firstIndex(where: { $0.atajo == id }) {
            // Editar conserva el adjunto que tuviera.
            lista[i].texto = cuerpo
        } else {
            lista.append(RespuestaRapida(atajo: id, texto: cuerpo, media: nil))
        }
        Task {
            let e = await catalogo.guardarRespuestasRapidas(lista)
            guardando = false
            if let e {
                error = e
            } else {
                atajo = ""
                texto = ""
            }
        }
    }
}
