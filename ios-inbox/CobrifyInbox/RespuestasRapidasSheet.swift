import SwiftUI

/// La lista de respuestas rápidas (las mismas de la web, con sus adjuntos).
struct RespuestasRapidasSheet: View {
    let alElegir: (RespuestaRapida) -> Void
    @ObservedObject private var catalogo = CatalogoStore.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(catalogo.respuestasRapidas) { r in
                Button { alElegir(r) } label: {
                    HStack(spacing: 12) {
                        Image(systemName: r.media != nil ? "paperclip" : "bolt.fill")
                            .foregroundStyle(.tint)
                            .frame(width: 24)
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
            .navigationTitle("Respuestas rápidas")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}
