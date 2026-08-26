import SwiftUI
import Photos

/// La apariencia del chat: fondo y color de burbuja. Vive en el teléfono
/// (AppStorage) — es gusto personal, no dato del negocio.
@MainActor
final class Apariencia: ObservableObject {
    static let shared = Apariencia()

    @AppStorage("fondoChat") var fondoId: String = "clasico"
    @AppStorage("colorBurbuja") var burbujaId: String = "verde"
    /// Cambia cuando el usuario pone su propia foto, para refrescar vistas.
    @Published var versionFoto = 0

    static let fondos: [(id: String, nombre: String, colores: [Color])] = [
        ("clasico", "Clásico", []),
        ("beige", "Beige WhatsApp", [Color(hex: "#EFE7DD"), Color(hex: "#E3D9CC")]),
        ("verde", "Verde suave", [Color(hex: "#DCF3E3"), Color(hex: "#C2E8CF")]),
        ("azul", "Cielo", [Color(hex: "#DDEBF7"), Color(hex: "#C3DCF0")]),
        ("morado", "Lavanda", [Color(hex: "#EAE2F5"), Color(hex: "#D8CBEC")]),
        ("noche", "Noche", [Color(hex: "#1C2733"), Color(hex: "#10161d")]),
        ("foto", "Tu foto", []),
    ]

    static let burbujas: [(id: String, nombre: String, color: Color)] = [
        ("verde", "Verde", Color(hex: "#25BC6A")),
        ("azul", "Azul", Color(hex: "#2D7FF9")),
        ("morado", "Morado", Color(hex: "#7C3AED")),
        ("naranja", "Naranja", Color(hex: "#EA7C1C")),
        ("rosa", "Rosa", Color(hex: "#DB2777")),
    ]

    var colorBurbuja: Color {
        Self.burbujas.first { $0.id == burbujaId }?.color ?? Color(hex: "#25BC6A")
    }

    private static var rutaFoto: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("fondo-chat.jpg")
    }

    func guardarFoto(_ datos: Data) {
        try? datos.write(to: Self.rutaFoto)
        fondoId = "foto"
        versionFoto += 1
    }

    var fotoFondo: UIImage? { UIImage(contentsOfFile: Self.rutaFoto.path) }

    /// El fondo listo para pintarse detrás de la conversación.
    @ViewBuilder func fondoView() -> some View {
        switch fondoId {
        case "clasico":
            Color(.systemGroupedBackground)
        case "foto":
            if let img = fotoFondo {
                GeometryReader { geo in
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                        .overlay(Color.black.opacity(0.08))
                }
                .ignoresSafeArea()
            } else {
                Color(.systemGroupedBackground)
            }
        default:
            let colores = Self.fondos.first { $0.id == fondoId }?.colores ?? []
            LinearGradient(colors: colores.isEmpty ? [Color(.systemGroupedBackground)] : colores,
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        }
    }
}

/// Guardar una foto del chat en el carrete del teléfono.
enum GuardadorFotos {
    static func guardar(url: String, terminado: @escaping (Bool) -> Void) {
        guard let u = URL(string: url) else { terminado(false); return }
        Task {
            do {
                let (datos, _) = try await URLSession.shared.data(from: u)
                guard let imagen = UIImage(data: datos) else { terminado(false); return }
                try await PHPhotoLibrary.shared().performChanges {
                    PHAssetChangeRequest.creationRequestForAsset(from: imagen)
                }
                await MainActor.run { terminado(true) }
            } catch {
                await MainActor.run { terminado(false) }
            }
        }
    }
}
