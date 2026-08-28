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

/// La foto de un mensaje: SIEMPRE completa, con su proporción real — nada de
/// recortes. Mientras carga reserva el espacio con las medidas que guardó el
/// servidor (o 4:3) para que la conversación no salte, y al llegar la imagen
/// usa su proporción de verdad.
struct ImagenBurbuja: View {
    let url: String
    var anchoGuardado: Int?
    var altoGuardado: Int?
    /// Foto propia que todavía viaja: se pinta del dato local.
    var datosLocales: Data?

    private let anchoMax: CGFloat = 244
    private let altoMax: CGFloat = 340

    @State private var imagen: UIImage?
    @State private var fallo = false

    init(url: String, anchoGuardado: Int? = nil, altoGuardado: Int? = nil, datosLocales: Data? = nil) {
        self.url = url
        self.anchoGuardado = anchoGuardado
        self.altoGuardado = altoGuardado
        self.datosLocales = datosLocales
        let inicial = datosLocales.flatMap(UIImage.init(data:)) ?? CacheImagenes.shared.enMemoria(url)
        _imagen = State(initialValue: inicial)
    }

    private var proporcion: CGFloat {
        if let imagen, imagen.size.height > 0 {
            return imagen.size.width / imagen.size.height
        }
        if let a = anchoGuardado, let b = altoGuardado, b > 0 {
            return CGFloat(a) / CGFloat(b)
        }
        return 4.0 / 3.0
    }

    /// Cabe en el ancho y en el alto máximos conservando la proporción: la
    /// foto entera, sea apaisada, vertical o panorámica.
    private var tamano: CGSize {
        let p = max(0.25, min(4, proporcion))
        var w = anchoMax
        var h = w / p
        if h > altoMax {
            h = altoMax
            w = h * p
        }
        return CGSize(width: w, height: h)
    }

    var body: some View {
        Group {
            if let imagen {
                Image(uiImage: imagen).resizable().scaledToFit()
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
        .frame(width: tamano.width, height: tamano.height)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .animation(.easeOut(duration: 0.15), value: tamano)
        .task(id: url) {
            guard imagen == nil, !url.isEmpty else { return }
            if let cargada = await CacheImagenes.shared.cargar(url) {
                imagen = cargada
            } else {
                fallo = true
            }
        }
    }
}
