import SwiftUI
import PencilKit
import UIKit

/// Pintar sobre una foto antes de mandarla, como WhatsApp: lápiz, marcador y
/// borrador, seis colores, tres grosores y deshacer. Al terminar, los trazos
/// se funden con la foto en su tamaño real y sale una foto nueva — a esta
/// misma conversación o reenviada a otras.
///
/// El trazo lo dibuja PencilKit (lo mismo que Notas y Fotos): la línea sale
/// suave y con presión sola. La paleta, en cambio, es nuestra y no la del
/// sistema: la del sistema flota encima y tapaba el pie de foto.
struct EditorFoto: View {
    let imagen: UIImage
    let conversationId: String
    /// Aviso corto para mostrar al volver ("Enviada", "Reenviada a 2"…).
    let alTerminar: (String) -> Void

    @StateObject private var pizarra = Pizarra()
    @State private var pie = ""
    @State private var enviando = false
    @State private var error: String?
    @State private var mostrarReenviar = false
    @FocusState private var pieEnfocado: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                cabecera
                lienzo
                paleta
                barraDeEnvio
            }
        }
        .preferredColorScheme(.dark)
        .fullScreenCover(isPresented: $mostrarReenviar) {
            if let datos = componerYComprimir() {
                ReenviarSheet(foto: .nueva(datos), caption: pie) { aviso in
                    alTerminar(aviso)
                    dismiss()
                }
            }
        }
        .alert("No se pudo enviar", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("Entendido") {}
        } message: {
            Text(error ?? "")
        }
    }

    // MARK: - Arriba

    private var cabecera: some View {
        HStack(spacing: 18) {
            Button("Cancelar") { dismiss() }
            Spacer()
            Button {
                pizarra.deshacer()
            } label: {
                Image(systemName: "arrow.uturn.backward")
            }
            .disabled(!pizarra.hayTrazos)
            Button {
                pizarra.borrarTodo()
            } label: {
                Image(systemName: "trash")
            }
            .disabled(!pizarra.hayTrazos)
        }
        .font(.body.weight(.medium))
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - La foto con el lienzo encima

    private var lienzo: some View {
        GeometryReader { geo in
            // El lienzo va EXACTAMENTE sobre la foto, no sobre la pantalla:
            // así lo pintado cae donde se ve, y al fundirlo con la foto en su
            // tamaño real basta una regla de tres.
            let marco = encaje(en: geo.size)
            ZStack {
                Image(uiImage: imagen)
                    .resizable()
                    .scaledToFit()
                    .frame(width: marco.width, height: marco.height)
                LienzoPK(pizarra: pizarra)
                    .frame(width: marco.width, height: marco.height)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }

    /// La foto entera dentro del espacio disponible, con su proporción.
    private func encaje(en espacio: CGSize) -> CGSize {
        guard imagen.size.width > 0, imagen.size.height > 0,
              espacio.width > 0, espacio.height > 0 else { return espacio }
        let k = min(espacio.width / imagen.size.width, espacio.height / imagen.size.height)
        return CGSize(width: imagen.size.width * k, height: imagen.size.height * k)
    }

    // MARK: - Paleta

    private var paleta: some View {
        VStack(spacing: 12) {
            HStack(spacing: 14) {
                ForEach(Pizarra.Herramienta.allCases, id: \.self) { h in
                    Button {
                        pizarra.herramienta = h
                    } label: {
                        Image(systemName: h.icono)
                            .font(.system(size: 18, weight: .semibold))
                            .frame(width: 38, height: 32)
                            .background(pizarra.herramienta == h ? Color.white.opacity(0.22) : .clear,
                                        in: RoundedRectangle(cornerRadius: 9))
                    }
                }
                Spacer()
                ForEach(Array(Pizarra.grosores.enumerated()), id: \.offset) { i, _ in
                    Button {
                        pizarra.grosor = i
                    } label: {
                        Circle()
                            .fill(.white)
                            .frame(width: 6 + CGFloat(i) * 5, height: 6 + CGFloat(i) * 5)
                            .frame(width: 30, height: 30)
                            .background(pizarra.grosor == i ? Color.white.opacity(0.22) : .clear,
                                        in: Circle())
                    }
                }
            }
            .foregroundStyle(.white)

            HStack(spacing: 0) {
                ForEach(Pizarra.colores, id: \.self) { c in
                    Button {
                        pizarra.color = c
                        // Elegir un color vuelve a pintar: con el borrador
                        // puesto, tocar un color quería decir "pintar de eso".
                        if pizarra.herramienta == .borrador { pizarra.herramienta = .lapiz }
                    } label: {
                        Circle()
                            .fill(Color(uiColor: c))
                            .frame(width: 26, height: 26)
                            .overlay(Circle().stroke(.white, lineWidth: pizarra.color == c ? 2.5 : 0.5))
                            .padding(.vertical, 4)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    // MARK: - Abajo: el pie y enviar

    private var barraDeEnvio: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Añade un comentario", text: $pie, axis: .vertical)
                .lineLimit(1...4)
                .focused($pieEnfocado)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 20))
                .foregroundStyle(.white)

            Button {
                mostrarReenviar = true
            } label: {
                Image(systemName: "arrowshape.turn.up.right")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(.white.opacity(0.14), in: Circle())
            }
            .disabled(enviando)

            Button {
                Task { await enviar() }
            } label: {
                Group {
                    if enviando {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "arrow.up").font(.system(size: 17, weight: .semibold))
                    }
                }
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(.tint, in: Circle())
            }
            .disabled(enviando)
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    // MARK: - Componer y enviar

    /// La foto con los trazos encima, en el tamaño real de la foto, ya lista
    /// para WhatsApp (tope 2048 px, JPEG).
    private func componerYComprimir() -> Data? {
        Imagenes.paraWhatsapp(pizarra.fundir(sobre: imagen))
    }

    private func enviar() async {
        guard let datos = componerYComprimir() else {
            error = "No se pudo preparar la foto."
            return
        }
        enviando = true
        do {
            try await ChatAPI.enviarMedia(conversationId: conversationId,
                                          base64: datos.base64EncodedString(),
                                          mimeType: "image/jpeg",
                                          filename: "foto.jpg",
                                          caption: pie.trimmingCharacters(in: .whitespacesAndNewlines))
            enviando = false
            alTerminar("Enviada")
            dismiss()
        } catch {
            enviando = false
            self.error = (error as? ChatAPI.ErrorEnvio)?.mensaje ?? "No se pudo enviar la foto."
        }
    }
}

// MARK: - El estado del dibujo

/// Lo que se está pintando: el lienzo de PencilKit y la herramienta elegida.
/// Vive en un objeto y no en `@State` porque el lienzo es un objeto de UIKit
/// y tiene que ser EL MISMO durante toda la edición.
@MainActor
final class Pizarra: ObservableObject {
    enum Herramienta: CaseIterable {
        case lapiz, marcador, borrador
        var icono: String {
            switch self {
            case .lapiz: return "pencil.tip"
            case .marcador: return "highlighter"
            case .borrador: return "eraser"
            }
        }
    }

    static let colores: [UIColor] = [
        .systemRed, .white, .black, .systemYellow, .systemGreen, .systemBlue, .systemPurple,
    ]
    /// Grosores en puntos: fino, medio y grueso.
    static let grosores: [CGFloat] = [6, 12, 22]

    let lienzo = PKCanvasView()

    @Published var hayTrazos = false
    @Published var herramienta: Herramienta = .lapiz { didSet { aplicar() } }
    @Published var color: UIColor = .systemRed { didSet { aplicar() } }
    @Published var grosor = 1 { didSet { aplicar() } }

    init() { aplicar() }

    private func aplicar() {
        let ancho = Self.grosores[min(grosor, Self.grosores.count - 1)]
        switch herramienta {
        case .lapiz:
            lienzo.tool = PKInkingTool(.pen, color: color, width: ancho)
        case .marcador:
            // El marcador es ancho y translúcido, para resaltar sin tapar.
            lienzo.tool = PKInkingTool(.marker, color: color.withAlphaComponent(0.5), width: ancho * 2.2)
        case .borrador:
            // Por trazo entero: en una foto es lo que se espera, y no deja
            // medios trazos sueltos.
            lienzo.tool = PKEraserTool(.vector)
        }
    }

    /// Deshacer a mano, quitando el último trazo: el deshacer del sistema
    /// depende de quién sea el primer respondedor y aquí no lo controlamos.
    func deshacer() {
        var d = lienzo.drawing
        guard !d.strokes.isEmpty else { return }
        d.strokes.removeLast()
        lienzo.drawing = d
        hayTrazos = !d.strokes.isEmpty
    }

    func borrarTodo() {
        lienzo.drawing = PKDrawing()
        hayTrazos = false
    }

    /// Funde los trazos con la foto, en el tamaño REAL de la foto: lo pintado
    /// se agranda en la misma proporción en que la foto se veía encogida.
    func fundir(sobre foto: UIImage) -> UIImage {
        let marco = lienzo.bounds
        guard marco.width > 0, foto.size.width > 0, !lienzo.drawing.strokes.isEmpty else { return foto }
        let k = foto.size.width / marco.width
        let trazos = lienzo.drawing.transformed(using: CGAffineTransform(scaleX: k, y: k))
        let entera = CGRect(origin: .zero, size: foto.size)

        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1   // sin esto sale a 3x y pesa una barbaridad
        formato.opaque = true
        return UIGraphicsImageRenderer(size: foto.size, format: formato).image { _ in
            foto.draw(in: entera)
            trazos.image(from: entera, scale: 1).draw(in: entera)
        }
    }
}

private struct LienzoPK: UIViewRepresentable {
    let pizarra: Pizarra

    func makeUIView(context: Context) -> PKCanvasView {
        let c = pizarra.lienzo
        // `anyInput`: sin esto solo pinta el Apple Pencil, y en el iPhone no
        // se podría dibujar con el dedo.
        c.drawingPolicy = .anyInput
        c.backgroundColor = .clear
        c.isOpaque = false
        c.delegate = context.coordinator
        return c
    }

    func updateUIView(_ c: PKCanvasView, context: Context) {}

    func makeCoordinator() -> Coordinador { Coordinador(pizarra) }

    final class Coordinador: NSObject, PKCanvasViewDelegate {
        let pizarra: Pizarra
        init(_ p: Pizarra) { pizarra = p }
        func canvasViewDrawingDidChange(_ c: PKCanvasView) {
            let hay = !c.drawing.strokes.isEmpty
            if pizarra.hayTrazos != hay { pizarra.hayTrazos = hay }
        }
    }
}

// MARK: - Preparar una foto para WhatsApp

enum Imagenes {
    /// Recomprime como manda WhatsApp: tope 2048 px de lado y JPEG. Una foto
    /// de cámara de 5 MB baja de 1 MB sin que se note en el chat.
    static func paraWhatsapp(_ imagen: UIImage, maxLado: CGFloat = 2048) -> Data? {
        let escala = min(1, maxLado / max(imagen.size.width, imagen.size.height))
        let tamano = CGSize(width: imagen.size.width * escala, height: imagen.size.height * escala)
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        let reducida = UIGraphicsImageRenderer(size: tamano, format: formato).image { _ in
            imagen.draw(in: CGRect(origin: .zero, size: tamano))
        }
        return reducida.jpegData(compressionQuality: 0.85)
    }
}
