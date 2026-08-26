import SwiftUI
import PhotosUI

/// Elegir el fondo del chat y el color de tus burbujas.
struct AparienciaView: View {
    @ObservedObject private var apariencia = Apariencia.shared
    @State private var fotoElegida: PhotosPickerItem?

    var body: some View {
        List {
            Section("Fondo del chat") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(Apariencia.fondos, id: \.id) { f in
                            if f.id == "foto" {
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
                }
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
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
                                .background(apariencia.colorBurbuja.opacity(0.25), in: RoundedRectangle(cornerRadius: 14))
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

    private func miniaturaFondo(_ f: (id: String, nombre: String, colores: [Color])) -> some View {
        VStack(spacing: 6) {
            ZStack {
                if f.id == "clasico" {
                    RoundedRectangle(cornerRadius: 12).fill(Color(.systemGroupedBackground))
                } else if f.id == "foto" {
                    if let img = Apariencia.shared.fotoFondo {
                        Image(uiImage: img).resizable().scaledToFill()
                    } else {
                        RoundedRectangle(cornerRadius: 12).fill(.quaternary)
                        Image(systemName: "photo.badge.plus").font(.title3)
                    }
                } else {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(LinearGradient(colors: f.colores, startPoint: .top, endPoint: .bottom))
                }
                if Apariencia.shared.fondoId == f.id {
                    RoundedRectangle(cornerRadius: 12).stroke(.tint, lineWidth: 3)
                }
            }
            .frame(width: 64, height: 96)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            Text(f.nombre).font(.caption2)
        }
    }
}
