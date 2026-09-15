import SwiftUI

/// "Mover a": las carpetas de la bandeja para una conversación, con un toque
/// cada una. Se abre deslizando la conversación hacia la derecha en la lista
/// de chats (pedido de Giacomo, 15-set-2026). Antes solo estaba en el menú de
/// mantener presionado, que no se descubre.
///
/// Una conversación puede estar en VARIAS carpetas (son las etiquetas
/// compartidas con la web), así que cada fila se marca y se desmarca por su
/// cuenta y la hoja no se cierra sola. El cambio se ve al instante: se anota
/// acá y se escribe en Firestore por detrás.
struct MoverACarpetaSheet: View {
    let conversacionId: String
    let nombre: String
    @State private var marcadas: Set<String>
    @State private var creando = false
    @ObservedObject private var catalogo = CatalogoStore.shared
    @Environment(\.dismiss) private var dismiss

    init(conversacionId: String, nombre: String, etiquetasIniciales: [String]) {
        self.conversacionId = conversacionId
        self.nombre = nombre
        _marcadas = State(initialValue: Set(etiquetasIniciales))
    }

    var body: some View {
        NavigationStack {
            List {
                if catalogo.etiquetas.isEmpty {
                    ContentUnavailableView {
                        Label("Sin carpetas", systemImage: "folder")
                    } description: {
                        Text("Crea la primera y aparecerá aquí para mover conversaciones con un toque.")
                    } actions: {
                        Button("Crear carpeta") { creando = true }
                    }
                    .listRowBackground(Color.clear)
                } else {
                    Section {
                        ForEach(catalogo.etiquetas) { e in
                            fila(e)
                        }
                    }
                    Section {
                        Button { creando = true } label: {
                            Label("Nueva carpeta", systemImage: "folder.badge.plus")
                        }
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text("Mover a").font(.headline)
                        Text(nombre)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Listo") { dismiss() }.fontWeight(.semibold)
                }
            }
            .sheet(isPresented: $creando) { EditarCarpetaSheet() }
            .sensoryFeedback(.selection, trigger: marcadas)
        }
    }

    private func fila(_ e: Etiqueta) -> some View {
        let esta = marcadas.contains(e.id)
        return Button {
            catalogo.alternarEtiqueta(conversacionId, tagId: e.id, tiene: esta)
            if esta { marcadas.remove(e.id) } else { marcadas.insert(e.id) }
        } label: {
            HStack(spacing: 12) {
                Circle().fill(e.color).frame(width: 12, height: 12)
                // Color.primary y no .primary: dentro de un botón, .primary es
                // el nivel principal del TINTE, y los nombres salían en verde.
                Text(e.nombre).foregroundStyle(Color.primary)
                Spacer()
                if esta {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.tint)
                }
            }
            .contentShape(Rectangle())
        }
    }
}
