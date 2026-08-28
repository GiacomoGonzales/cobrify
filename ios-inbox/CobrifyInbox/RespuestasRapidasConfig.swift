import SwiftUI
import PhotosUI
import AVFoundation

/// Crear, editar y borrar las respuestas rápidas desde el teléfono, con
/// imagen o video opcional. El mismo catálogo que la web: lo que se guarde
/// aquí aparece allá.
struct RespuestasRapidasConfigView: View {
    @ObservedObject private var catalogo = CatalogoStore.shared
    @State private var atajo = ""
    @State private var texto = ""
    @State private var media: MediaBiblioteca?
    @State private var guardando = false
    @State private var subiendo = false
    @State private var error: String?
    @State private var elegido: PhotosPickerItem?
    @State private var mostrarGaleria = false
    @State private var mostrarArchivos = false
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

    /// Con archivo adjunto el texto es opcional (va como pie de foto).
    private var puedeGuardar: Bool {
        !atajoLimpio.isEmpty && !guardando && !subiendo
            && (media != nil || !texto.trimmingCharacters(in: .whitespaces).isEmpty)
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
                TextField(media == nil ? "Texto de la respuesta…" : "Pie de foto (opcional)…",
                          text: $texto, axis: .vertical)
                    .lineLimit(2...6)

                if let media {
                    HStack(spacing: 12) {
                        vistaPrevia(media)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(media.nombreLegible).font(.callout.weight(.medium))
                            if let bytes = media.bytes {
                                Text(pesoLegible(bytes))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Button(role: .destructive) {
                            self.media = nil
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                } else if subiendo {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Subiendo archivo…").foregroundStyle(.secondary)
                    }
                } else {
                    Menu {
                        Button {
                            mostrarGaleria = true
                        } label: {
                            Label("Foto o video", systemImage: "photo.on.rectangle")
                        }
                        Button {
                            mostrarArchivos = true
                        } label: {
                            Label("Documento PDF", systemImage: "doc")
                        }
                    } label: {
                        Label("Adjuntar archivo", systemImage: "paperclip")
                    }
                }

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
                .disabled(!puedeGuardar)

                if let error {
                    Text(error).foregroundStyle(.red).font(.callout)
                }
            } header: {
                Text(editando ? "Editando" : "Nueva respuesta")
            } footer: {
                Text("En el chat, escribe / para ver tus atajos. Las que llevan archivo se envían al instante; las de solo texto van al cuadro para retocarlas.")
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
                        media = r.media
                        error = nil
                        enfocado = true
                    } label: {
                        HStack(spacing: 10) {
                            if let m = r.media {
                                vistaPrevia(m, lado: 34)
                            } else {
                                Image(systemName: "bolt.fill")
                                    .foregroundStyle(.tint)
                                    .frame(width: 34)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text("/" + r.atajo)
                                    .font(.subheadline.weight(.semibold))
                                Text(r.texto.isEmpty ? (r.media?.nombreLegible ?? "") : r.texto)
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

            if editando || media != nil || !texto.isEmpty {
                Section {
                    Button("Limpiar el formulario") {
                        atajo = ""; texto = ""; media = nil; error = nil
                    }
                }
            }
        }
        .navigationTitle("Respuestas rápidas")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { catalogo.empezar() }
        .photosPicker(isPresented: $mostrarGaleria, selection: $elegido,
                      matching: .any(of: [.images, .videos]))
        .onChange(of: elegido) {
            guard let item = elegido else { return }
            elegido = nil
            Task { await subirDePicker(item) }
        }
        .fileImporter(isPresented: $mostrarArchivos, allowedContentTypes: [.pdf]) { resultado in
            guard case .success(let url) = resultado else { return }
            let accedio = url.startAccessingSecurityScopedResource()
            defer { if accedio { url.stopAccessingSecurityScopedResource() } }
            guard let datos = try? Data(contentsOf: url) else {
                error = "No se pudo leer el archivo."
                return
            }
            Task { await subir(datos: datos, mimeType: "application/pdf", filename: url.lastPathComponent) }
        }
    }

    @ViewBuilder private func vistaPrevia(_ m: MediaBiblioteca, lado: CGFloat = 48) -> some View {
        if let url = m.thumbUrl ?? (m.tipo == "image" ? m.url : nil) {
            ImagenCacheada(url: url) { imagen in
                imagen.resizable().scaledToFill()
            }
            .frame(width: lado, height: lado)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(.quaternary)
                Image(systemName: m.icono).foregroundStyle(.tint)
            }
            .frame(width: lado, height: lado)
        }
    }

    private func pesoLegible(_ bytes: Int) -> String {
        let mb = Double(bytes) / 1_048_576
        return mb >= 1 ? String(format: "%.1f MB", mb)
                       : String(format: "%.0f KB", Double(bytes) / 1024)
    }

    /// Foto o video de la galería: se recomprime la foto igual que al enviar,
    /// y el video viaja tal cual (con su tope de 16 MB de WhatsApp).
    private func subirDePicker(_ item: PhotosPickerItem) async {
        subiendo = true
        error = nil
        defer { subiendo = false }

        guard let datos = try? await item.loadTransferable(type: Data.self) else {
            error = "No se pudo leer el archivo."
            return
        }
        if let imagen = UIImage(data: datos) {
            let maxLado: CGFloat = 2048
            let escala = min(1, maxLado / max(imagen.size.width, imagen.size.height))
            let tamano = CGSize(width: imagen.size.width * escala, height: imagen.size.height * escala)
            let formato = UIGraphicsImageRendererFormat()
            formato.scale = 1
            let reducida = UIGraphicsImageRenderer(size: tamano, format: formato)
                .image { _ in imagen.draw(in: CGRect(origin: .zero, size: tamano)) }
            guard let jpeg = reducida.jpegData(compressionQuality: 0.8) else {
                error = "No se pudo procesar la foto."
                return
            }
            await subir(datos: jpeg, mimeType: "image/jpeg", filename: "foto.jpg")
        } else {
            // Video: WhatsApp solo admite mp4 y 3gpp.
            await subir(datos: datos, mimeType: "video/mp4", filename: "video.mp4")
        }
    }

    private func subir(datos: Data, mimeType: String, filename: String) async {
        subiendo = true
        error = nil
        defer { subiendo = false }
        do {
            media = try await ChatAPI.subirABiblioteca(datos: datos, mimeType: mimeType, filename: filename)
        } catch {
            self.error = (error as? ChatAPI.ErrorEnvio)?.mensaje ?? "No se pudo subir el archivo."
        }
    }

    private func guardar() {
        let id = atajoLimpio
        let cuerpo = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return }
        guardando = true
        error = nil
        var lista = catalogo.respuestasRapidas
        let nueva = RespuestaRapida(atajo: id, texto: cuerpo, media: media)
        if let i = lista.firstIndex(where: { $0.atajo == id }) {
            lista[i] = nueva
        } else {
            lista.append(nueva)
        }
        Task {
            let e = await catalogo.guardarRespuestasRapidas(lista)
            guardando = false
            if let e {
                error = e
            } else {
                atajo = ""
                texto = ""
                media = nil
            }
        }
    }
}
