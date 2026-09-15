import SwiftUI
import PDFKit
import CryptoKit

/// La primera página de un PDF, cuántas páginas tiene y cuánto pesa, para la
/// tarjeta del documento en la conversación.
///
/// Se dibuja EN EL TELÉFONO con PDFKit, igual que el fotograma de los videos:
/// el servidor no hace nada y no hay que desplegar el webhook. El PDF se baja
/// una sola vez (disco, Caches/pdfs) y la miniatura queda guardada al lado,
/// así volver a la conversación no vuelve a dibujar nada.
enum MiniaturaDePdf {
    struct Datos {
        let imagen: UIImage?
        let paginas: Int
        let bytes: Int
    }

    /// NSCache solo guarda clases.
    private final class Caja {
        let datos: Datos
        init(_ datos: Datos) { self.datos = datos }
    }

    private static let memoria = NSCache<NSString, Caja>()

    private static var dir: URL {
        let d = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("pdfs", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    private static func hash(_ url: String) -> String {
        SHA256.hash(data: Data(url.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Solo memoria, síncrono: para pintar sin parpadeo al reentrar.
    static func enMemoria(_ url: String) -> Datos? {
        memoria.object(forKey: url as NSString)?.datos
    }

    /// nil si el PDF no se pudo bajar o leer.
    static func obtener(_ url: String) async -> Datos? {
        if let d = enMemoria(url) { return d }
        let h = hash(url)
        let archivo = dir.appendingPathComponent(h + ".pdf")
        let miniatura = dir.appendingPathComponent(h + ".jpg")

        if !FileManager.default.fileExists(atPath: archivo.path) {
            guard let u = URL(string: url),
                  let (tmp, _) = try? await URLSession.shared.download(from: u) else { return nil }
            try? FileManager.default.removeItem(at: archivo)
            do { try FileManager.default.moveItem(at: tmp, to: archivo) } catch { return nil }
        }
        let bytes = ((try? FileManager.default.attributesOfItem(atPath: archivo.path))?[.size] as? Int) ?? 0

        // Fuera del hilo principal: dibujar un PDF pesado tarda.
        let datos: Datos? = await Task.detached(priority: .utility) {
            guard let doc = PDFDocument(url: archivo) else { return nil }
            var imagen: UIImage?
            if let guardada = try? Data(contentsOf: miniatura), let img = UIImage(data: guardada) {
                imagen = img
            } else if let pagina = doc.page(at: 0) {
                let caja = pagina.bounds(for: .mediaBox)
                let ancho: CGFloat = 520
                let alto = caja.width > 0 ? ancho * caja.height / caja.width : ancho * 1.414
                let img = pagina.thumbnail(of: CGSize(width: ancho, height: alto), for: .mediaBox)
                imagen = img
                if let jpeg = img.jpegData(compressionQuality: 0.8) { try? jpeg.write(to: miniatura) }
            }
            return Datos(imagen: imagen, paginas: doc.pageCount, bytes: bytes)
        }.value

        if let datos { memoria.setObject(Caja(datos), forKey: url as NSString) }
        return datos
    }
}

/// La tarjeta de un documento, como la muestra WhatsApp: la parte de arriba
/// de la primera página (si es PDF), el nombre, cuántas páginas y cuánto pesa.
/// Tocarla abre el visor.
///
/// Antes era una fila con un icono y el nombre del archivo, y el pie del
/// mensaje no se dibujaba: una respuesta rápida con PDF y texto salía entera,
/// pero en el iPhone parecía que solo había ido el archivo (14-set-2026).
struct TarjetaDocumento: View {
    let media: MediaAdjunto
    let alTocar: () -> Void

    static let ancho: CGFloat = 244
    private static let altoPortada: CGFloat = 132

    @State private var datos: MiniaturaDePdf.Datos?
    @State private var fallo = false

    init(media: MediaAdjunto, alTocar: @escaping () -> Void) {
        self.media = media
        self.alTocar = alTocar
        _datos = State(initialValue: media.url.flatMap { MiniaturaDePdf.enMemoria($0) })
    }

    private var esPdf: Bool {
        media.mimeType == "application/pdf"
            || (media.filename ?? "").lowercased().hasSuffix(".pdf")
            || (media.url ?? "").lowercased().contains(".pdf")
    }

    private var nombre: String {
        if let f = media.filename, !f.isEmpty { return f }
        return esPdf ? "Documento.pdf" : "Documento"
    }

    /// "PDF", o la extensión del archivo ("XLSX"), o "Archivo".
    private var tipoLegible: String {
        if esPdf { return "PDF" }
        let ext = (nombre as NSString).pathExtension.uppercased()
        return ext.isEmpty ? "Archivo" : ext
    }

    private var detalle: String {
        var partes: [String] = []
        if let d = datos, d.paginas > 0 {
            partes.append(d.paginas == 1 ? "1 página" : "\(d.paginas) páginas")
        }
        partes.append(tipoLegible)
        if let d = datos, d.bytes > 0 {
            partes.append(ByteCountFormatter.string(fromByteCount: Int64(d.bytes), countStyle: .file))
        }
        return partes.joined(separator: " · ")
    }

    var body: some View {
        VStack(spacing: 0) {
            if esPdf { portada }
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 7)
                    .fill(esPdf ? Color.red : Color.blue)
                    .frame(width: 34, height: 34)
                    .overlay {
                        Image(systemName: "doc.text.fill")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(.white)
                    }
                VStack(alignment: .leading, spacing: 2) {
                    // fixedSize vertical: sin esto la fila le da una sola
                    // línea y el nombre se corta ("Planes Cobrify 2026.p…")
                    // aunque tenga permiso para dos.
                    Text(nombre)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(detalle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(10)
        }
        .frame(width: Self.ancho)
        // Una bandeja apenas más oscura que la burbuja (más clara de noche),
        // como WhatsApp: separa la tarjeta del pie sin pintar un color propio.
        .background(Color.primary.opacity(0.07))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture(perform: alTocar)
        .task(id: media.url) {
            guard esPdf, datos == nil, let url = media.url else { return }
            if let d = await MiniaturaDePdf.obtener(url) {
                datos = d
            } else {
                fallo = true
            }
        }
    }

    /// La parte de arriba de la primera página, a lo ancho. Si no se pudo
    /// leer el PDF, la tarjeta queda sin portada: el nombre y el toque siguen.
    @ViewBuilder private var portada: some View {
        if let imagen = datos?.imagen {
            Image(uiImage: imagen)
                .resizable()
                .scaledToFill()
                .frame(width: Self.ancho, height: Self.altoPortada, alignment: .top)
                .clipped()
        } else if !fallo, datos == nil {
            ZStack {
                Color.primary.opacity(0.05)
                ProgressView()
            }
            .frame(width: Self.ancho, height: Self.altoPortada)
        }
    }
}
