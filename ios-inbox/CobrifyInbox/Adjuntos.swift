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

        guard let u = URL(string: url) else { return }
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

/// Duraciones ya averiguadas, para no releer el archivo en cada aparición.
@MainActor
final class DuracionesAudio {
    static var cache: [String: Double] = [:]
}

/// La nota de voz en su burbuja: play/pausa, barra de avance y la duración
/// (o el tiempo transcurrido mientras suena), como WhatsApp.
struct BurbujaAudio: View {
    let mensaje: Mensaje
    @ObservedObject private var repro = ReproductorAudio.shared
    @State private var duracion: Double = 0

    private var url: String? { mensaje.media?.url }
    private var esEste: Bool { repro.urlActual == url }

    var body: some View {
        HStack(spacing: 8) {
            Button {
                if let u = url { repro.alternar(url: u) }
            } label: {
                Image(systemName: esEste && repro.reproduciendo ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 26))
                    .foregroundStyle(Color(.systemGray))
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 4) {
                ProgressView(value: esEste ? repro.progreso : 0)
                    .frame(width: 150)
                HStack(spacing: 4) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 9))
                    Text(textoDuracion)
                        .font(.caption2.monospacedDigit())
                }
                .foregroundStyle(.secondary)
            }
        }
        .task(id: url) { await cargarDuracion() }
    }

    /// Mientras suena, el tiempo que va; quieto, cuánto dura en total.
    private var textoDuracion: String {
        guard duracion > 0 else { return "—:—" }
        let segundos = (esEste && repro.progreso > 0) ? duracion * repro.progreso : duracion
        return String(format: "%d:%02d", Int(segundos) / 60, Int(segundos) % 60)
    }

    /// La duración sale de los metadatos del archivo: AVURLAsset lee la
    /// cabecera, no baja el audio completo.
    private func cargarDuracion() async {
        guard let url, let u = URL(string: url) else { return }
        if let guardada = DuracionesAudio.cache[url] { duracion = guardada; return }
        let asset = AVURLAsset(url: u)
        guard let d = try? await asset.load(.duration) else { return }
        let segundos = CMTimeGetSeconds(d)
        guard segundos.isFinite, segundos > 0 else { return }
        DuracionesAudio.cache[url] = segundos
        duracion = segundos
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
