import SwiftUI
import PhotosUI

/// Elegir el fondo del chat y el color de tus burbujas.
struct AparienciaView: View {
    @ObservedObject private var apariencia = Apariencia.shared
    @Environment(\.colorScheme) private var esquema
    @State private var fotoElegida: PhotosPickerItem?

    var body: some View {
        List {
            Section("Fondo del chat") {
                // En cuadricula y no en una fila que se desliza: asi se ven
                // TODOS de una vez. Antes "Tu foto" quedaba fuera de la
                // pantalla y no habia manera de saber que estaba ahi.
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 14) {
                    ForEach(Apariencia.fondos, id: \.id) { f in
                        if f.id == "foto", !apariencia.tieneFoto {
                            // Sin foto todavia: el toque abre la galeria.
                            PhotosPicker(selection: $fotoElegida, matching: .images) {
                                miniaturaFondo(f)
                            }
                            .buttonStyle(.plain)
                        } else {
                            Button { apariencia.fondoId = f.id } label: {
                                miniaturaFondo(f)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.vertical, 6)

                if apariencia.fondoId == "foto", apariencia.tieneFoto {
                    PhotosPicker(selection: $fotoElegida, matching: .images) {
                        Label("Elegir otra foto", systemImage: "photo.badge.plus")
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Atenuar el fondo").font(.subheadline)
                        HStack(spacing: 10) {
                            Image(systemName: "sun.max").font(.caption).foregroundStyle(.secondary)
                            Slider(value: $apariencia.atenuar, in: 0...0.6)
                            Image(systemName: "moon").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }

            Section("Color de tus burbujas") {
                HStack(spacing: 16) {
                    ForEach(Apariencia.burbujas, id: \.id) { b in
                        Button { apariencia.burbujaId = b.id } label: {
                            ZStack {
                                Circle().fill(b.color).frame(width: 42, height: 42)
                                if apariencia.burbujaId == b.id {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 15, weight: .bold))
                                        .foregroundStyle(.white)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }

            Section("Vista previa") {
                ZStack {
                    apariencia.fondoView()
                        .frame(height: 160)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    VStack(spacing: 8) {
                        HStack {
                            Text("Hola, ¿cómo va todo?")
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                            Spacer(minLength: 60)
                        }
                        HStack {
                            Spacer(minLength: 60)
                            Text("¡Todo bien! 🙌")
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .background(apariencia.fondoBurbuja(esquema), in: RoundedRectangle(cornerRadius: 14))
                        }
                    }
                    .font(.callout)
                    .padding(14)
                }
                .listRowInsets(EdgeInsets())
            }
        }
        .navigationTitle("Apariencia")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: fotoElegida) {
            guard let item = fotoElegida else { return }
            fotoElegida = nil
            Task {
                if let datos = try? await item.loadTransferable(type: Data.self) {
                    apariencia.guardarFoto(datos)
                }
            }
        }
    }

    @Environment(\.colorScheme) private var esquemaActual

    private func miniaturaFondo(_ f: (id: String, nombre: String, claros: [Color], oscuros: [Color])) -> some View {
        VStack(spacing: 6) {
            ZStack {
                if f.id == "clasico" {
                    RoundedRectangle(cornerRadius: 12).fill(Color(.systemGroupedBackground))
                } else if f.id == "foto" {
                    // Se lee `versionFoto` para que la miniatura se refresque
                    // sola al cambiar la foto.
                    let _ = apariencia.versionFoto
                    if let img = apariencia.fotoFondo {
                        Image(uiImage: img).resizable().scaledToFill()
                    } else {
                        RoundedRectangle(cornerRadius: 12).fill(.quaternary)
                        Image(systemName: "photo.badge.plus").font(.title3)
                    }
                } else {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(LinearGradient(colors: esquemaActual == .dark ? f.oscuros : f.claros,
                                             startPoint: .top, endPoint: .bottom))
                }
                if apariencia.fondoId == f.id {
                    RoundedRectangle(cornerRadius: 12).stroke(.tint, lineWidth: 3)
                }
            }
            .frame(height: 92)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            Text(f.nombre)
                .font(.caption2)
                .lineLimit(1)
                .foregroundStyle(apariencia.fondoId == f.id ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
        }
    }
}
