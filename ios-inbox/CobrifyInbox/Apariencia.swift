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

    /// Cada fondo trae su par: colores para modo claro y para modo oscuro,
    /// como hace WhatsApp — el beige de día se vuelve verde-noche de noche.
    static let fondos: [(id: String, nombre: String, claros: [Color], oscuros: [Color])] = [
        ("clasico", "Clásico", [], []),
        ("beige", "Beige WhatsApp", [Color(hex: "#EFE7DD"), Color(hex: "#E3D9CC")],
                                    [Color(hex: "#0B141A"), Color(hex: "#060E12")]),
        ("verde", "Verde suave", [Color(hex: "#DCF3E3"), Color(hex: "#C2E8CF")],
                                 [Color(hex: "#0E241A"), Color(hex: "#081A12")]),
        ("azul", "Cielo", [Color(hex: "#DDEBF7"), Color(hex: "#C3DCF0")],
                          [Color(hex: "#0D1B2A"), Color(hex: "#091420")]),
        ("morado", "Lavanda", [Color(hex: "#EAE2F5"), Color(hex: "#D8CBEC")],
                              [Color(hex: "#1B1030"), Color(hex: "#120A22")]),
        ("noche", "Noche", [Color(hex: "#1C2733"), Color(hex: "#10161D")],
                           [Color(hex: "#1C2733"), Color(hex: "#10161D")]),
        ("foto", "Tu foto", [], []),
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

    private var hexBurbuja: String {
        Self.burbujas.first { $0.id == burbujaId }.map { b in
            switch b.id {
            case "verde": return "#25BC6A"
            case "azul": return "#2D7FF9"
            case "morado": return "#7C3AED"
            case "naranja": return "#EA7C1C"
            case "rosa": return "#DB2777"
            default: return "#25BC6A"
            }
        } ?? "#25BC6A"
    }

    /// El fondo SÓLIDO de la burbuja saliente: pastel en claro, profundo en
    /// oscuro — contraste garantizado sobre cualquier fondo, como WhatsApp.
    func fondoBurbuja(_ esquema: ColorScheme) -> Color {
        esquema == .dark
            ? Color.mezcla(hexBurbuja, con: (0.05, 0.08, 0.07), proporcion: 0.40)
            : Color.mezcla(hexBurbuja, con: (1, 1, 1), proporcion: 0.22)
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
    func fondoView() -> some View { FondoChat() }
}

/// El fondo del chat, consciente del modo claro/oscuro del sistema.
struct FondoChat: View {
    @ObservedObject private var apariencia = Apariencia.shared
    @Environment(\.colorScheme) private var esquema

    var body: some View {
        switch apariencia.fondoId {
        case "clasico":
            Color(.systemGroupedBackground)
        case "foto":
            if let img = apariencia.fotoFondo {
                GeometryReader { geo in
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                        .overlay(Color.black.opacity(esquema == .dark ? 0.35 : 0.08))
                }
                .ignoresSafeArea()
            } else {
                Color(.systemGroupedBackground)
            }
        default:
            let par = Apariencia.fondos.first { $0.id == apariencia.fondoId }
            let colores = (esquema == .dark ? par?.oscuros : par?.claros) ?? []
            LinearGradient(colors: colores.isEmpty ? [Color(.systemGroupedBackground)] : colores,
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        }
    }
}

extension Color {
    /// Mezcla un color hex con otro RGB en la proporción dada (proporcion =
    /// cuánto del color original sobrevive).
    static func mezcla(_ hex: String, con base: (Double, Double, Double), proporcion: Double) -> Color {
        var h = hex.trimmingCharacters(in: .whitespaces)
        if h.hasPrefix("#") { h.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: h).scanHexInt64(&v)
        let r = Double((v >> 16) & 0xFF) / 255
        let g = Double((v >> 8) & 0xFF) / 255
        let b = Double(v & 0xFF) / 255
        return Color(.sRGB,
                     red: r * proporcion + base.0 * (1 - proporcion),
                     green: g * proporcion + base.1 * (1 - proporcion),
                     blue: b * proporcion + base.2 * (1 - proporcion))
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
