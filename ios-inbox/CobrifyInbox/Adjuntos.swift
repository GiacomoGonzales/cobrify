import SwiftUI
import AVFoundation
import QuickLook

// MARK: - Notas de voz

/// Graba la nota en AAC (.m4a, mono, 64 kbps): calidad de voz con archivos
/// chicos — un minuto pesa ~0.5 MB, lejos del tope de 16 MB de WhatsApp.
@MainActor
final class GrabadoraNota: ObservableObject {
    @Published var grabando = false
    @Published var segundos = 0

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private(set) var url: URL?

    func empezar() async -> Bool {
        let permiso = await AVAudioApplication.requestRecordPermission()
        guard permiso else { return false }
        let sesion = AVAudioSession.sharedInstance()
        try? sesion.setCategory(.playAndRecord, mode: .default)
        try? sesion.setActive(true)

        let destino = FileManager.default.temporaryDirectory
            .appendingPathComponent("nota-\(Int(Date().timeIntervalSince1970)).m4a")
        let ajustes: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 64000,
        ]
        guard let r = try? AVAudioRecorder(url: destino, settings: ajustes) else { return false }
        recorder = r
        url = destino
        r.record()
        grabando = true
        segundos = 0
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.segundos += 1 }
        }
        return true
    }

    /// Termina y devuelve el archivo (nil si no se grabó nada usable).
    func terminar() -> URL? {
        recorder?.stop()
        limpiar()
        return url
    }

    func cancelar() {
        recorder?.stop()
        limpiar()
        if let url { try? FileManager.default.removeItem(at: url) }
        url = nil
    }

    private func limpiar() {
        timer?.invalidate()
        timer = nil
        grabando = false
        try? AVAudioSession.sharedInstance().setActive(false)
    }

    var tiempo: String { String(format: "%d:%02d", segundos / 60, segundos % 60) }
}

// MARK: - Reproductor de audio

/// UN solo reproductor para toda la app: darle play a una nota pausa la
/// anterior, como WhatsApp.
@MainActor
final class ReproductorAudio: ObservableObject {
    static let shared = ReproductorAudio()

    @Published var urlActual: String?
    @Published var reproduciendo = false
    @Published var progreso: Double = 0

    private var player: AVPlayer?
    private var observador: Any?

    func alternar(url: String) {
        if urlActual == url {
            if reproduciendo { player?.pause(); reproduciendo = false }
            else { player?.play(); reproduciendo = true }
            return
        }
        if let observador { player?.removeTimeObserver(observador); self.observador = nil }
        player?.pause()

        // Si ya lo bajamos para la onda, se reproduce del disco: instantáneo.
        let local = CacheAudio.archivoLocal(url)
        let u = FileManager.default.fileExists(atPath: local.path) ? local : URL(string: url)
        guard let u else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        try? AVAudioSession.sharedInstance().setActive(true)
        let p = AVPlayer(url: u)
        player = p
        urlActual = url
        progreso = 0
        observador = p.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 10), queue: .main) { [weak self] t in
            Task { @MainActor in
                guard let self, let item = self.player?.currentItem else { return }
                let d = item.duration.seconds
                guard d.isFinite, d > 0 else { return }
                self.progreso = t.seconds / d
                if self.progreso >= 0.999 {
                    self.player?.pause()
                    self.player?.seek(to: .zero)
                    self.reproduciendo = false
                    self.progreso = 0
                }
            }
        }
        p.play()
        reproduciendo = true
    }
}

/// Lo que ya sabemos de cada audio: su archivo local, cuánto dura y su onda.
/// Analizar un audio cuesta, y la burbuja aparece muchas veces.
@MainActor
final class AudiosAnalizados {
    static var duracion: [String: Double] = [:]
    static var onda: [String: [Float]] = [:]
}

/// Baja el audio una sola vez y lo guarda: la onda se calcula del archivo
/// local (analizar por red es lento e inseguro) y reproducir es instantáneo.
enum CacheAudio {
    private static var dir: URL {
        let d = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("audios", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    static func archivoLocal(_ url: String) -> URL {
        let nombre = String(url.hashValue.magnitude) + "." + (URL(string: url)?.pathExtension ?? "m4a")
        return dir.appendingPathComponent(nombre)
    }

    /// Devuelve el archivo local, bajándolo si hace falta.
    static func obtener(_ url: String) async -> URL? {
        let destino = archivoLocal(url)
        if FileManager.default.fileExists(atPath: destino.path) { return destino }
        guard let remota = URL(string: url),
              let (tmp, _) = try? await URLSession.shared.download(from: remota) else { return nil }
        try? FileManager.default.removeItem(at: destino)
        try? FileManager.default.moveItem(at: tmp, to: destino)
        return FileManager.default.fileExists(atPath: destino.path) ? destino : nil
    }
}

/// La onda REAL del audio: lee las muestras y saca el volumen promedio de
/// cada tramo, que es lo que dibuja las rayitas altas (sonido) y bajas
/// (silencio).
enum AnalizadorOnda {
    static let barras = 34

    static func analizar(_ archivo: URL) -> [Float] {
        let asset = AVURLAsset(url: archivo)
        guard let pista = asset.tracks(withMediaType: .audio).first,
              let lector = try? AVAssetReader(asset: asset) else { return [] }

        let salida = AVAssetReaderTrackOutput(track: pista, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsNonInterleaved: false,
        ])
        guard lector.canAdd(salida) else { return [] }
        lector.add(salida)
        lector.startReading()

        var muestras: [Int16] = []
        while lector.status == .reading, let buffer = salida.copyNextSampleBuffer() {
            guard let bloque = CMSampleBufferGetDataBuffer(buffer) else { continue }
            let largo = CMBlockBufferGetDataLength(bloque)
            var trozo = [Int16](repeating: 0, count: largo / 2)
            trozo.withUnsafeMutableBytes { destino in
                _ = CMBlockBufferCopyDataBytes(bloque, atOffset: 0, dataLength: largo,
                                               destination: destino.baseAddress!)
            }
            muestras.append(contentsOf: trozo)
        }
        guard muestras.count > barras else { return [] }

        // Volumen (RMS) por tramo.
        let porBarra = muestras.count / barras
        var niveles: [Float] = []
        for i in 0..<barras {
            let desde = i * porBarra
            let hasta = min(desde + porBarra, muestras.count)
            var suma: Double = 0
            for j in desde..<hasta {
                let v = Double(muestras[j]) / 32768.0
                suma += v * v
            }
            niveles.append(Float((suma / Double(max(1, hasta - desde))).squareRoot()))
        }
        // Normalizado contra el pico: la onda se ve igual de viva en un audio
        // bajito que en uno fuerte.
        let pico = niveles.max() ?? 0
        guard pico > 0 else { return [] }
        return niveles.map { min(1, $0 / pico) }
    }
}

/// Ancho fijo de la nota de voz: todas miden igual y la onda se reparte
/// dentro, dure 3 segundos o 3 minutos — como WhatsApp.
private let anchoOndaAudio: CGFloat = 196

/// La nota de voz: play/pausa, la onda real del audio y — en la misma línea —
/// su duración junto a la hora de envío, como WhatsApp.
struct BurbujaAudio<Pie: View>: View {
    let mensaje: Mensaje
    @ViewBuilder var pie: () -> Pie

    @ObservedObject private var repro = ReproductorAudio.shared
    @State private var duracion: Double = 0
    @State private var onda: [Float] = []

    private var url: String? { mensaje.media?.url }
    private var esEste: Bool { repro.urlActual == url }
    private var avance: Double { esEste ? repro.progreso : 0 }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Button {
                if let u = url { repro.alternar(url: u) }
            } label: {
                Image(systemName: esEste && repro.reproduciendo ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(Color.primary.opacity(0.55))
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 3) {
                onditas
                HStack(spacing: 4) {
                    Image(systemName: "mic.fill").font(.system(size: 9))
                    Text(textoDuracion)
                        .font(.caption2.monospacedDigit())
                    Spacer(minLength: 8)
                    pie()
                }
                .foregroundStyle(Color.primary.opacity(0.55))
                .frame(width: anchoOndaAudio)
            }
        }
        .task(id: url) { await preparar() }
    }

    /// Las rayitas: altas donde hay sonido, bajas en los silencios. Las ya
    /// reproducidas se pintan con el color de acento.
    private var onditas: some View {
        HStack(alignment: .center, spacing: 0) {
            ForEach(Array(barras.enumerated()), id: \.offset) { i, nivel in
                let reproducida = Double(i) / Double(max(1, barras.count)) < avance
                Capsule()
                    .fill(reproducida ? AnyShapeStyle(.tint) : AnyShapeStyle(Color(.systemGray2)))
                    .frame(width: 2.5, height: max(3, CGFloat(nivel) * 22))
                if i < barras.count - 1 { Spacer(minLength: 0) }
            }
        }
        .frame(width: anchoOndaAudio, height: 24)
    }

    /// Sin análisis todavía: una onda tenue de relleno para no dejar el hueco.
    private var barras: [Float] {
        if !onda.isEmpty { return onda }
        return (0..<AnalizadorOnda.barras).map { i in
            0.25 + 0.2 * Float(abs(sin(Double(i) * 0.9)))
        }
    }

    private var textoDuracion: String {
        guard duracion > 0 else { return "—:—" }
        let segundos = (esEste && repro.progreso > 0) ? duracion * repro.progreso : duracion
        return String(format: "%d:%02d", Int(segundos) / 60, Int(segundos) % 60)
    }

    private func preparar() async {
        guard let url else { return }
        if let d = AudiosAnalizados.duracion[url] { duracion = d }
        if let o = AudiosAnalizados.onda[url] { onda = o }
        guard duracion == 0 || onda.isEmpty else { return }

        guard let archivo = await CacheAudio.obtener(url) else { return }
        let asset = AVURLAsset(url: archivo)
        if let d = try? await asset.load(.duration) {
            let seg = CMTimeGetSeconds(d)
            if seg.isFinite, seg > 0 {
                AudiosAnalizados.duracion[url] = seg
                duracion = seg
            }
        }
        // El análisis es pesado: fuera del hilo de la interfaz.
        let calculada = await Task.detached(priority: .utility) {
            AnalizadorOnda.analizar(archivo)
        }.value
        if !calculada.isEmpty {
            AudiosAnalizados.onda[url] = calculada
            onda = calculada
        }
    }
}

// MARK: - Visor a pantalla completa (fotos, videos, PDF)

/// Descarga el archivo y lo abre con el visor del sistema (QuickLook):
/// zoom con dos dedos, video con controles, PDF por páginas y compartir.
struct VisorAdjunto: View {
    let url: String
    let filename: String?
    @Environment(\.dismiss) private var dismiss
    @State private var local: URL?
    @State private var fallo = false

    var body: some View {
        NavigationStack {
            Group {
                if let local {
                    VistaQL(url: local).ignoresSafeArea(edges: .bottom)
                } else if fallo {
                    ContentUnavailableView("No se pudo abrir", systemImage: "wifi.exclamationmark",
                                           description: Text("Revisa tu conexión e intenta de nuevo."))
                } else {
                    ProgressView("Descargando…")
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
        .task { await descargar() }
    }

    private func descargar() async {
        guard let remota = URL(string: url) else { fallo = true; return }
        do {
            let (tmp, _) = try await URLSession.shared.download(from: remota)
            // El nombre con su extensión real: de él vive el visor.
            var nombre = filename ?? ""
            if nombre.isEmpty { nombre = remota.lastPathComponent }
            if nombre.isEmpty { nombre = "archivo" }
            let destino = FileManager.default.temporaryDirectory.appendingPathComponent(nombre)
            try? FileManager.default.removeItem(at: destino)
            try FileManager.default.moveItem(at: tmp, to: destino)
            local = destino
        } catch {
            fallo = true
        }
    }
}

private struct VistaQL: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> QLPreviewController {
        let c = QLPreviewController()
        c.dataSource = context.coordinator
        return c
    }
    func updateUIViewController(_ vc: QLPreviewController, context: Context) {}
    func makeCoordinator() -> Coordinador { Coordinador(url: url) }

    final class Coordinador: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}

// MARK: - Cámara

struct CamaraPicker: UIViewControllerRepresentable {
    var alCapturar: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinador { Coordinador(self) }

    final class Coordinador: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let padre: CamaraPicker
        init(_ padre: CamaraPicker) { self.padre = padre }
        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { padre.alCapturar(img) }
            padre.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { padre.dismiss() }
    }
}
