import SwiftUI
import CryptoKit

/// Caché de imágenes en dos niveles: memoria (reentrar a un chat es
/// instantáneo) y disco (sobrevive a cerrar la app). Cada foto se descarga
/// UNA vez; nuestro R2 las sirve inmutables, así que jamás caducan.
final class CacheImagenes: @unchecked Sendable {
    static let shared = CacheImagenes()

    private let memoria = NSCache<NSString, UIImage>()
    private let dir: URL

    private init() {
        dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("imagenes", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        memoria.countLimit = 400
    }

    private func ruta(_ url: String) -> URL {
        let hash = SHA256.hash(data: Data(url.utf8)).map { String(format: "%02x", $0) }.joined()
        return dir.appendingPathComponent(hash)
    }

    /// Solo memoria, síncrono: para pintar sin parpadeo al reentrar.
    func enMemoria(_ url: String) -> UIImage? {
        memoria.object(forKey: url as NSString)
    }

    func cargar(_ url: String) async -> UIImage? {
        if let m = enMemoria(url) { return m }
        // Disco
        let archivo = ruta(url)
        if let datos = try? Data(contentsOf: archivo), let img = UIImage(data: datos) {
            memoria.setObject(img, forKey: url as NSString)
            return img
        }
        // Red (una sola vez)
        guard let u = URL(string: url),
              let (datos, _) = try? await URLSession.shared.data(from: u),
              let img = UIImage(data: datos) else { return nil }
        try? datos.write(to: archivo)
        memoria.setObject(img, forKey: url as NSString)
        return img
    }
}

/// Reemplazo de AsyncImage con el caché puesto. Si la imagen ya está en
/// memoria se pinta al instante, sin spinner ni parpadeo.
struct ImagenCacheada<Contenido: View>: View {
    let url: String
    @ViewBuilder let contenido: (Image) -> Contenido

    @State private var imagen: UIImage?
    @State private var fallo = false

    init(url: String, @ViewBuilder contenido: @escaping (Image) -> Contenido) {
        self.url = url
        self.contenido = contenido
        _imagen = State(initialValue: CacheImagenes.shared.enMemoria(url))
    }

    var body: some View {
        Group {
            if let imagen {
                contenido(Image(uiImage: imagen))
            } else if fallo {
                ZStack {
                    Color(.tertiarySystemFill)
                    Label("Foto", systemImage: "photo").foregroundStyle(.secondary)
                }
            } else {
                ZStack {
                    Color(.tertiarySystemFill)
                    ProgressView()
                }
            }
        }
        .task(id: url) {
            guard imagen == nil else { return }
            if let cargada = await CacheImagenes.shared.cargar(url) {
                imagen = cargada
            } else {
                fallo = true
            }
        }
    }
}
