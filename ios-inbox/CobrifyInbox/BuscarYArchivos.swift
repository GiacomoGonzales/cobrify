import SwiftUI

/// Buscar dentro de la conversación y ver sus fotos y archivos.
///
/// Las dos son HOJAS, no barras dentro del chat, y es a propósito: esta vista
/// ya se colgó una vez por un bucle de medición al tocarle el desplazamiento
/// (ver el comentario del `VStack` en ConversationView). Una hoja que lista y
/// luego salta no cambia nada de esa pila.
///
/// Las dos leen de los mensajes YA cargados — la ventana de 120 — así que no
/// consultan nada ni gastan lecturas.

// MARK: - Buscar en el chat

struct BuscarEnChatSheet: View {
    let mensajes: [Mensaje]
    let nombreContacto: String
    let alElegir: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var texto = ""

    private var resultados: [Mensaje] {
        let q = texto.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return [] }
        // Del más nuevo al más viejo: lo que uno busca suele ser reciente.
        return mensajes.filter { $0.texto.lowercased().contains(q) }.reversed()
    }

    var body: some View {
        NavigationStack {
            Group {
                if texto.trimmingCharacters(in: .whitespaces).isEmpty {
                    ContentUnavailableView(
                        "Buscar en la conversación",
                        systemImage: "magnifyingglass",
                        description: Text("Escribí una palabra y te muestro en qué mensajes aparece.")
                    )
                } else if resultados.isEmpty {
                    ContentUnavailableView.search(text: texto)
                } else {
                    List(resultados) { m in
                        Button {
                            alElegir(m.id)
                            dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(m.esSaliente ? "Tú" : nombreContacto)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(m.esSaliente ? Color.accentColor : .secondary)
                                    Spacer()
                                    Text(Formato.hora(m.timestamp))
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Text(m.texto)
                                    .font(.callout)
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Buscar")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $texto, placement: .navigationBarDrawer(displayMode: .always), prompt: "Palabra o frase")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Listo") { dismiss() } }
            }
        }
    }
}

// MARK: - Fotos y archivos del chat

struct ArchivosDelChatSheet: View {
    let mensajes: [Mensaje]
    let alElegir: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var pestana = Pestana.medios

    enum Pestana: String, CaseIterable, Identifiable {
        case medios, documentos, audios
        var id: String { rawValue }
        var nombre: String {
            switch self {
            case .medios: return "Fotos y videos"
            case .documentos: return "Documentos"
            case .audios: return "Audios"
            }
        }
        var tipos: Set<String> {
            switch self {
            case .medios: return ["image", "video", "sticker"]
            case .documentos: return ["document"]
            case .audios: return ["audio"]
            }
        }
    }

    /// Con archivo y del tipo de la pestaña, del más nuevo al más viejo.
    private func lista(_ p: Pestana) -> [Mensaje] {
        mensajes.filter { p.tipos.contains($0.tipo) && $0.media?.url != nil }.reversed()
    }

    private var actual: [Mensaje] { lista(pestana) }

    private let columnas = [GridItem(.adaptive(minimum: 104), spacing: 3)]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $pestana) {
                    ForEach(Pestana.allCases) { p in
                        Text("\(p.nombre) \(lista(p).count)").tag(p)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.bottom, 8)

                if actual.isEmpty {
                    ContentUnavailableView(
                        "Nada por acá",
                        systemImage: pestana == .medios ? "photo.on.rectangle" : pestana == .documentos ? "doc" : "waveform",
                        description: Text("En esta conversación no hay \(pestana.nombre.lowercased()).")
                    )
                } else if pestana == .medios {
                    ScrollView {
                        LazyVGrid(columns: columnas, spacing: 3) {
                            ForEach(actual) { m in
                                Button {
                                    alElegir(m.id)
                                    dismiss()
                                } label: {
                                    CeldaMedio(mensaje: m)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 3)
                    }
                } else {
                    List(actual) { m in
                        Button {
                            alElegir(m.id)
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: pestana == .documentos ? "doc.fill" : "waveform")
                                    .foregroundStyle(Color.accentColor)
                                    .frame(width: 26)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(m.media?.filename ?? (pestana == .documentos ? "Documento" : "Nota de voz"))
                                        .font(.callout)
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    Text(Formato.hora(m.timestamp))
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Fotos y archivos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Listo") { dismiss() } }
            }
        }
    }
}

/// Un cuadrito de la cuadrícula de fotos.
///
/// Vive aparte y no encadenada dentro del `ForEach` porque ahí el compilador de
/// Swift se rendía: "unable to type-check this expression in reasonable time".
/// Es el mismo motivo por el que `BurbujaMensaje` está extraída en la
/// conversación; si se le agregan modificadores, mantenerla fuera.
private struct CeldaMedio: View {
    let mensaje: Mensaje

    private var url: String { mensaje.media?.thumbUrl ?? mensaje.media?.url ?? "" }

    var body: some View {
        // ImagenCacheada entrega la Image y deja que quien la use decida cómo
        // se recorta: acá va cuadrada y llenando el cuadrito.
        ImagenCacheada(url: url) { imagen in
            imagen
                .resizable()
                .scaledToFill()
        }
        .frame(minWidth: 0)
        .aspectRatio(1, contentMode: .fill)
        .clipped()
        .overlay(alignment: .bottomLeading) { marcaDeVideo }
    }

    @ViewBuilder
    private var marcaDeVideo: some View {
        if mensaje.tipo == "video" {
            Image(systemName: "play.fill")
                .font(.caption2)
                .foregroundStyle(.white)
                .padding(4)
                .background(.black.opacity(0.45), in: Circle())
                .padding(4)
        }
    }
}
