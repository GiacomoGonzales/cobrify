import SwiftUI
import AVFoundation
import CryptoKit

/// El primer fotograma de un video, para mostrarlo como WhatsApp: la vista
/// previa con el botón de play y la duración, en vez de una fila con un icono.
///
/// Se saca EN EL TELÉFONO con AVFoundation, no en el servidor. El servidor
/// solo genera miniaturas de imágenes, y ponerle video obligaría a meter
/// ffmpeg y **desplegar el webhook**, que es la parte delicada. Aquí no hace
/// falta nada de eso: `AVAssetImageGenerator` pide por rangos solo el pedazo
/// del archivo que necesita, así que no baja el video entero.
///
/// El fotograma se guarda —memoria y disco— igual que las fotos: se saca una
/// sola vez por video.
enum PosterDeVideo {
    private static let memoria = NSCache<NSString, UIImage>()

    private static var dir: URL {
        let d = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("posters", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    private static func ruta(_ url: String) -> URL {
        let hash = SHA256.hash(data: Data(url.utf8)).map { String(format: "%02x", $0) }.joined()
        return dir.appendingPathComponent(hash + ".jpg")
    }

    /// La duración ya sabida, para no volver a pedir la cabecera del video.
    private static func claveDuracion(_ url: String) -> String {
        "duracionVideo:" + SHA256.hash(data: Data(url.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func enMemoria(_ url: String) -> UIImage? {
        memoria.object(forKey: url as NSString)
    }

    static func duracionSabida(_ url: String) -> Double {
        UserDefaults.standard.double(forKey: claveDuracion(url))
    }

    /// El fotograma y cuánto dura. nil si el video no se pudo leer.
    static func obtener(_ url: String) async -> (UIImage, Double)? {
        let guardada = duracionSabida(url)
        if let m = memoria.object(forKey: url as NSString) { return (m, guardada) }

        let archivo = ruta(url)
        if let datos = try? Data(contentsOf: archivo), let img = UIImage(data: datos) {
            memoria.setObject(img, forKey: url as NSString)
            return (img, guardada)
        }

        guard let u = URL(string: url) else { return nil }
        let asset = AVURLAsset(url: u)
        let duracion = (try? await asset.load(.duration)).map(CMTimeGetSeconds) ?? 0

        let gen = AVAssetImageGenerator(asset: asset)
        // Sin esto los videos grabados en vertical salen acostados.
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: 800, height: 800)

        // Medio segundo adentro: el fotograma 0 suele salir negro.
        let segundos = duracion.isFinite && duracion > 1 ? 0.5 : 0
        let instante = CMTime(seconds: segundos, preferredTimescale: 600)
        guard let cg = try? await gen.image(at: instante).image else { return nil }

        let imagen = UIImage(cgImage: cg)
        memoria.setObject(imagen, forKey: url as NSString)
        if let jpeg = imagen.jpegData(compressionQuality: 0.75) {
            try? jpeg.write(to: archivo)
        }
        if duracion.isFinite, duracion > 0 {
            UserDefaults.standard.set(duracion, forKey: claveDuracion(url))
        }
        return (imagen, duracion.isFinite ? duracion : 0)
    }
}

/// La vista previa de un video en la conversación: el fotograma, el botón de
/// play encima y cuánto dura abajo a la izquierda. Sin burbuja, como las
/// fotos.
struct MiniaturaVideo: View {
    let url: String
    /// Solo en la cuadrícula de un álbum: sin duración y con el play chico.
    var compacta = false
    var anchoMax: CGFloat = 244
    var altoMax: CGFloat = 340

    @State private var poster: UIImage?
    @State private var duracion: Double = 0
    @State private var fallo = false

    init(url: String, compacta: Bool = false, anchoMax: CGFloat = 244, altoMax: CGFloat = 340) {
        self.url = url
        self.compacta = compacta
        self.anchoMax = anchoMax
        self.altoMax = altoMax
        _poster = State(initialValue: PosterDeVideo.enMemoria(url))
        _duracion = State(initialValue: PosterDeVideo.duracionSabida(url))
    }

    /// Mientras no hay fotograma se reserva 4:3, igual que las fotos sin
    /// medidas: así la conversación no salta cuando aparece.
    private var proporcion: CGFloat {
        guard let poster, poster.size.height > 0 else { return 4.0 / 3.0 }
        return poster.size.width / poster.size.height
    }

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
        contenido
            .frame(width: compacta ? nil : tamano.width, height: compacta ? nil : tamano.height)
            .clipped()
            .overlay { play }
            .overlay(alignment: .bottomLeading) {
                if !compacta, duracion > 0 {
                    Label(Formato.duracion(duracion), systemImage: "video.fill")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(.black.opacity(0.45), in: Capsule())
                        .padding(6)
                }
            }
            .task(id: url) {
                guard poster == nil, !url.isEmpty else { return }
                if let (img, d) = await PosterDeVideo.obtener(url) {
                    poster = img
                    if d > 0 { duracion = d }
                } else {
                    fallo = true
                }
            }
    }

    @ViewBuilder private var contenido: some View {
        if let poster {
            Image(uiImage: poster)
                .resizable()
                .aspectRatio(contentMode: compacta ? .fill : .fit)
        } else {
            ZStack {
                Color(.tertiarySystemFill)
                if !fallo { ProgressView() }
            }
        }
    }

    private var play: some View {
        ZStack {
            Circle()
                .fill(.white.opacity(0.9))
                .frame(width: compacta ? 34 : 52, height: compacta ? 34 : 52)
            Image(systemName: "play.fill")
                .font(.system(size: compacta ? 14 : 21))
                .foregroundStyle(.black.opacity(0.75))
                .offset(x: 1)   // el triángulo pesa a la izquierda
        }
        .shadow(color: .black.opacity(0.25), radius: 4)
    }
}

extension Formato {
    /// 74 -> "1:14"
    static func duracion(_ segundos: Double) -> String {
        let s = Int(segundos.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}
