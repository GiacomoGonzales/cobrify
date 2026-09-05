import SwiftUI
import UIKit

/// El visor de fotos de una conversación, como el de WhatsApp: pantalla
/// negra, la foto con zoom de verdad, deslizar a los lados para pasar a la
/// anterior o siguiente, la tira de miniaturas abajo, el nombre y la hora
/// arriba, el texto que venía con la foto, y tirar hacia abajo para cerrar.
/// Un toque esconde todo para mirar la foto limpia; otro lo devuelve.
struct VisorFotos: View {
    let fotos: [Mensaje]
    let nombreContacto: String
    @State private var indice: Int
    @Environment(\.dismiss) private var dismiss

    @State private var conAdornos = true
    /// Cuánto se tiró hacia abajo: atenúa el fondo mientras se arrastra.
    @State private var tirado: CGFloat = 0
    @State private var ampliada = false
    @State private var mostrarReenviar = false
    @State private var aviso: String?
    /// Las fotos ya cargadas, por dirección: de aquí salen compartir y el
    /// tamaño real.
    @State private var cargadas: [String: UIImage] = [:]

    init(fotos: [Mensaje], indiceInicial: Int, nombreContacto: String) {
        self.fotos = fotos
        self.nombreContacto = nombreContacto
        _indice = State(initialValue: min(max(0, indiceInicial), max(0, fotos.count - 1)))
    }

    private var actual: Mensaje? { fotos.indices.contains(indice) ? fotos[indice] : nil }
    private var urlActual: String { actual?.media?.url ?? "" }
    private var adornosVisibles: Bool { conAdornos && tirado == 0 && !ampliada }

    var body: some View {
        ZStack {
            Color.black
                .opacity(1 - min(0.7, Double(tirado) / 320))
                .ignoresSafeArea()

            TabView(selection: $indice) {
                ForEach(Array(fotos.enumerated()), id: \.element.id) { i, m in
                    PaginaFoto(
                        url: m.media?.url ?? "",
                        miniatura: m.media?.thumbUrl,
                        alTocar: { withAnimation(.easeInOut(duration: 0.2)) { conAdornos.toggle() } },
                        alArrastrar: { tirado = $0 },
                        alSoltar: { cerrar in
                            if cerrar { dismiss() } else { withAnimation(.easeOut(duration: 0.2)) { tirado = 0 } }
                        },
                        alZoom: { z in withAnimation(.easeInOut(duration: 0.2)) { ampliada = z } },
                        alCargar: { cargadas[m.media?.url ?? ""] = $0 }
                    )
                    .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()

            if adornosVisibles {
                VStack(spacing: 0) {
                    cabecera
                    Spacer()
                    pie
                }
                .transition(.opacity)
            }

            if let aviso {
                Text(aviso)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.black.opacity(0.75), in: Capsule())
                    .padding(.bottom, 150)
                    .frame(maxHeight: .infinity, alignment: .bottom)
                    .transition(.opacity)
            }
        }
        .statusBarHidden(!adornosVisibles)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $mostrarReenviar) {
            if let actual {
                ReenviarSheet(mensaje: actual) { avisar($0) }
            }
        }
    }

    // MARK: - Arriba: quién y cuándo

    private var cabecera: some View {
        HStack(spacing: 12) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 20, weight: .semibold))
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(actual?.esSaliente == true ? "Tú" : nombreContacto)
                    .font(.headline)
                    .lineLimit(1)
                if let fecha = actual?.timestamp {
                    Text("\(Formato.dia(fecha)), \(Formato.horaCorta(fecha))")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.75))
                }
            }
            Spacer()
            if fotos.count > 1 {
                Text("\(indice + 1) de \(fotos.count)")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.75))
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            LinearGradient(colors: [.black.opacity(0.75), .clear], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .top)
        )
    }

    // MARK: - Abajo: el texto, la tira y los botones

    private var pie: some View {
        VStack(spacing: 10) {
            if let texto = actual?.texto, !texto.isEmpty {
                Text(TextoWhatsapp.atribuido(texto))
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .lineLimit(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
            }
            if fotos.count > 1 {
                TiraDeFotos(fotos: fotos, indice: $indice)
            }
            HStack {
                accion("Reenviar", "arrowshape.turn.up.right") { mostrarReenviar = true }
                Spacer()
                accion("Guardar", "square.and.arrow.down") { guardar() }
                Spacer()
                if let img = cargadas[urlActual] {
                    ShareLink(item: Image(uiImage: img),
                              preview: SharePreview("Foto", image: Image(uiImage: img))) {
                        etiquetaAccion("Compartir", "square.and.arrow.up")
                    }
                    .buttonStyle(.plain)
                } else {
                    etiquetaAccion("Compartir", "square.and.arrow.up").opacity(0.4)
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 4)
        }
        .padding(.top, 14)
        .background(
            LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private func accion(_ titulo: String, _ icono: String, _ hacer: @escaping () -> Void) -> some View {
        Button(action: hacer) { etiquetaAccion(titulo, icono) }
            .buttonStyle(.plain)
    }

    private func etiquetaAccion(_ titulo: String, _ icono: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icono).font(.system(size: 20))
            Text(titulo).font(.caption2)
        }
        .foregroundStyle(.white)
        .frame(width: 72)
        .contentShape(Rectangle())
    }

    private func guardar() {
        guard !urlActual.isEmpty else { return }
        GuardadorFotos.guardar(url: urlActual) { ok in
            avisar(ok ? "Guardada en Fotos" : "No se pudo guardar")
        }
    }

    private func avisar(_ texto: String) {
        withAnimation { aviso = texto }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            withAnimation { if aviso == texto { aviso = nil } }
        }
    }
}

/// Una página del visor: la miniatura al instante (ya está en memoria por
/// la burbuja) y la foto completa en cuanto llega.
private struct PaginaFoto: View {
    let url: String
    let miniatura: String?
    let alTocar: () -> Void
    let alArrastrar: (CGFloat) -> Void
    let alSoltar: (Bool) -> Void
    let alZoom: (Bool) -> Void
    let alCargar: (UIImage) -> Void

    @State private var imagen: UIImage?
    @State private var fallo = false

    var body: some View {
        ZStack {
            FotoZoom(imagen: imagen, alTocar: alTocar, alArrastrar: alArrastrar,
                     alSoltar: alSoltar, alZoom: alZoom)
            if imagen == nil {
                if fallo {
                    Label("No se pudo cargar la foto", systemImage: "wifi.exclamationmark")
                        .foregroundStyle(.white.opacity(0.7))
                } else {
                    ProgressView().tint(.white)
                }
            }
        }
        .task(id: url) {
            if let chica = miniatura, let m = CacheImagenes.shared.enMemoria(chica), imagen == nil {
                imagen = m
            }
            if let grande = await CacheImagenes.shared.cargar(url) {
                imagen = grande
                alCargar(grande)
            } else if imagen == nil {
                fallo = true
            }
        }
    }
}

/// La tira de miniaturas: todas las fotos del chat, la actual resaltada y
/// siempre a la vista. Tocar una salta a ella.
private struct TiraDeFotos: View {
    let fotos: [Mensaje]
    @Binding var indice: Int

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 3) {
                    ForEach(Array(fotos.enumerated()), id: \.element.id) { i, m in
                        ImagenCacheada(url: m.media?.thumbUrl ?? m.media?.url ?? "") { img in
                            img.resizable().scaledToFill()
                        }
                        .frame(width: i == indice ? 50 : 38, height: 54)
                        .clipShape(RoundedRectangle(cornerRadius: 5))
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(.white, lineWidth: i == indice ? 2 : 0))
                        .contentShape(Rectangle())
                        .onTapGesture { withAnimation(.easeInOut(duration: 0.2)) { indice = i } }
                        .id(m.id)
                    }
                }
                .padding(.horizontal, 16)
                .animation(.easeInOut(duration: 0.2), value: indice)
            }
            .frame(height: 58)
            .onAppear { proxy.scrollTo(fotos[indice].id, anchor: .center) }
            .onChange(of: indice) {
                withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(fotos[indice].id, anchor: .center) }
            }
        }
    }
}

// MARK: - La foto con zoom (UIKit)

/// La foto dentro de un UIScrollView, como en Fotos: pellizcar para acercar,
/// doble toque para acercar y volver, arrastrar cuando está ampliada. Sin
/// ampliar, un arrastre hacia abajo la va soltando y, pasado un tramo, cierra
/// el visor; uno hacia los lados lo deja pasar al paginador para cambiar de
/// foto. SwiftUI solo no da este tacto.
private struct FotoZoom: UIViewRepresentable {
    let imagen: UIImage?
    let alTocar: () -> Void
    let alArrastrar: (CGFloat) -> Void
    let alSoltar: (Bool) -> Void
    let alZoom: (Bool) -> Void

    func makeUIView(context: Context) -> ScrollDeFoto {
        let s = ScrollDeFoto()
        s.delegate = context.coordinator
        s.minimumZoomScale = 1
        s.maximumZoomScale = 6
        s.showsHorizontalScrollIndicator = false
        s.showsVerticalScrollIndicator = false
        s.contentInsetAdjustmentBehavior = .never
        s.backgroundColor = .clear
        s.vista.contentMode = .scaleAspectFill
        s.vista.isUserInteractionEnabled = false
        s.addSubview(s.vista)

        let doble = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinador.dobleToque(_:)))
        doble.numberOfTapsRequired = 2
        s.addGestureRecognizer(doble)
        let simple = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinador.toque))
        simple.require(toFail: doble)
        s.addGestureRecognizer(simple)
        let tirar = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinador.tirar(_:)))
        tirar.delegate = context.coordinator
        s.addGestureRecognizer(tirar)
        return s
    }

    func updateUIView(_ s: ScrollDeFoto, context: Context) {
        context.coordinator.padre = self
        if s.vista.image !== imagen {
            s.vista.image = imagen
            s.acomodar(reiniciar: true)
        }
    }

    func makeCoordinator() -> Coordinador { Coordinador(self) }

    final class ScrollDeFoto: UIScrollView {
        let vista = UIImageView()
        private var ultimoTamano = CGSize.zero

        override func layoutSubviews() {
            super.layoutSubviews()
            if bounds.size != ultimoTamano {
                ultimoTamano = bounds.size
                acomodar(reiniciar: true)
            }
            centrar()
        }

        /// La foto entera dentro del marco, con su proporción, y el zoom en 1.
        func acomodar(reiniciar: Bool) {
            guard let img = vista.image, img.size.width > 0, img.size.height > 0,
                  bounds.width > 0, bounds.height > 0 else { return }
            if reiniciar { zoomScale = 1 }
            let escala = min(bounds.width / img.size.width, bounds.height / img.size.height)
            let tam = CGSize(width: img.size.width * escala, height: img.size.height * escala)
            vista.frame = CGRect(origin: .zero, size: tam)
            contentSize = tam
            centrar()
        }

        /// Centrada cuando es más chica que el marco, en los dos ejes.
        func centrar() {
            let dx = max(0, (bounds.width - contentSize.width) / 2)
            let dy = max(0, (bounds.height - contentSize.height) / 2)
            contentInset = UIEdgeInsets(top: dy, left: dx, bottom: dy, right: dx)
        }

        var ampliada: Bool { zoomScale > 1.01 }
    }

    final class Coordinador: NSObject, UIScrollViewDelegate, UIGestureRecognizerDelegate {
        var padre: FotoZoom
        init(_ p: FotoZoom) { padre = p }

        func viewForZooming(in s: UIScrollView) -> UIView? { (s as? ScrollDeFoto)?.vista }
        func scrollViewDidZoom(_ s: UIScrollView) { (s as? ScrollDeFoto)?.centrar() }
        func scrollViewDidEndZooming(_ s: UIScrollView, with view: UIView?, atScale escala: CGFloat) {
            padre.alZoom(escala > 1.01)
        }

        @objc func toque() { padre.alTocar() }

        @objc func dobleToque(_ g: UITapGestureRecognizer) {
            guard let s = g.view as? ScrollDeFoto else { return }
            if s.ampliada {
                s.setZoomScale(1, animated: true)
            } else {
                // Acercar a 2,5x justo donde se tocó.
                let p = g.location(in: s.vista)
                let ancho = s.bounds.width / 2.5, alto = s.bounds.height / 2.5
                s.zoom(to: CGRect(x: p.x - ancho / 2, y: p.y - alto / 2, width: ancho, height: alto), animated: true)
            }
        }

        /// Tirar hacia abajo (solo sin ampliar): la foto sigue al dedo y se
        /// achica un poco; al soltar, cierra o vuelve a su sitio.
        @objc func tirar(_ g: UIPanGestureRecognizer) {
            guard let s = g.view as? ScrollDeFoto else { return }
            let t = g.translation(in: s)
            let d = max(0, t.y)
            switch g.state {
            case .changed:
                let k = 1 - min(0.3, d / 900)
                s.transform = CGAffineTransform(translationX: t.x * 0.4, y: d).scaledBy(x: k, y: k)
                padre.alArrastrar(d)
            case .ended, .cancelled, .failed:
                let cerrar = d > 120 || (d > 40 && g.velocity(in: s).y > 900)
                if cerrar {
                    padre.alSoltar(true)
                } else {
                    UIView.animate(withDuration: 0.25, delay: 0, usingSpringWithDamping: 0.85, initialSpringVelocity: 0.5) {
                        s.transform = .identity
                    }
                    padre.alSoltar(false)
                }
            default:
                break
            }
        }

        // El tirón solo arranca sin ampliar y hacia abajo; un arrastre hacia
        // los lados se lo queda el paginador (siguiente/anterior).
        func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
            guard let pan = g as? UIPanGestureRecognizer, let s = g.view as? ScrollDeFoto else { return true }
            guard !s.ampliada else { return false }
            let v = pan.velocity(in: s)
            return v.y > 0 && abs(v.y) > abs(v.x) * 1.3
        }

        func gestureRecognizer(_ g: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith otro: UIGestureRecognizer) -> Bool {
            true
        }
    }
}

// MARK: - Reenviar

/// Elegir a quién reenviar la foto. Sale por su dirección (ya está guardada
/// en nuestro almacén), sin volver a subirla: lo mismo que hacen las
/// respuestas rápidas con archivo.
struct ReenviarSheet: View {
    let mensaje: Mensaje
    let alTerminar: (String) -> Void

    @StateObject private var bandeja = InboxStore()
    @State private var busqueda = ""
    @State private var elegidas: Set<String> = []
    @State private var enviando = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    private var filtradas: [Conversacion] {
        let q = busqueda.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return bandeja.conversaciones }
        return bandeja.conversaciones.filter {
            $0.titulo.lowercased().contains(q) || $0.waId.contains(q)
                || ($0.linkedBusinessName ?? "").lowercased().contains(q)
        }
    }

    /// Sin ventana de 24 h abierta WhatsApp no acepta la foto: se muestra,
    /// pero no se deja elegir.
    private func ventanaCerrada(_ c: Conversacion) -> Bool {
        guard let vence = c.ventanaVenceAt else { return true }
        return vence.timeIntervalSinceNow <= 0
    }

    var body: some View {
        NavigationStack {
            List(filtradas) { conv in
                let cerrada = ventanaCerrada(conv)
                Button {
                    if elegidas.contains(conv.id) { elegidas.remove(conv.id) } else { elegidas.insert(conv.id) }
                } label: {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle().fill(colorAvatar(conv).gradient)
                            Text(conv.inicial).font(.headline).foregroundStyle(.white)
                        }
                        .frame(width: 40, height: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(conv.titulo).lineLimit(1)
                            Text(cerrada ? "Ventana cerrada" : (conv.linkedBusinessName ?? Formato.numero(conv.waId)))
                                .font(.caption)
                                .foregroundStyle(cerrada ? .orange : .secondary)
                                .lineLimit(1)
                        }
                        Spacer()
                        Image(systemName: elegidas.contains(conv.id) ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(elegidas.contains(conv.id) ? Color.accentColor : Color(.systemGray3))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(cerrada || enviando)
                .opacity(cerrada ? 0.55 : 1)
            }
            .listStyle(.plain)
            .searchable(text: $busqueda, prompt: "Buscar conversación")
            .navigationTitle("Reenviar a…")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancelar") { dismiss() }.disabled(enviando)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if !elegidas.isEmpty {
                    Button {
                        Task { await enviar() }
                    } label: {
                        HStack {
                            if enviando { ProgressView().tint(.white) }
                            Text(enviando ? "Enviando…" : "Enviar a \(elegidas.count)")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(enviando)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.bar)
                }
            }
            .overlay {
                if bandeja.cargando && bandeja.conversaciones.isEmpty {
                    ProgressView()
                } else if let e = bandeja.error {
                    ContentUnavailableView(e, systemImage: "exclamationmark.triangle")
                }
            }
            .alert("No se pudo reenviar", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("Entendido") {}
            } message: {
                Text(error ?? "")
            }
        }
        .onAppear { bandeja.empezar() }
        .onDisappear { bandeja.parar() }
    }

    private func colorAvatar(_ conv: Conversacion) -> Color {
        var h = 0
        for u in conv.waId.unicodeScalars { h = (h &* 31 &+ Int(u.value)) & 0xFFFF }
        return Color(hue: Double(h % 360) / 360, saturation: 0.55, brightness: 0.72)
    }

    private func enviar() async {
        guard let adjunto = mensaje.media, let url = adjunto.url else { return }
        var d: [String: Any] = ["url": url, "mimeType": adjunto.mimeType ?? "image/jpeg", "tipo": "image"]
        if let f = adjunto.filename { d["filename"] = f }
        if let t = adjunto.thumbUrl { d["thumbUrl"] = t }
        if let a = adjunto.ancho { d["ancho"] = a }
        if let a = adjunto.alto { d["alto"] = a }
        guard let media = MediaBiblioteca(d) else { return }

        enviando = true
        var fallidas: [String] = []
        for conv in bandeja.conversaciones where elegidas.contains(conv.id) {
            do {
                try await ChatAPI.enviarMediaGuardada(conversationId: conv.id, media: media, caption: mensaje.texto)
            } catch {
                fallidas.append("\(conv.titulo): \((error as? ChatAPI.ErrorEnvio)?.mensaje ?? "no se pudo enviar")")
            }
        }
        enviando = false
        let enviadas = elegidas.count - fallidas.count
        if fallidas.isEmpty {
            alTerminar(enviadas == 1 ? "Reenviada" : "Reenviada a \(enviadas) conversaciones")
            dismiss()
        } else {
            error = (enviadas > 0 ? "Salió a \(enviadas). " : "") + fallidas.joined(separator: "\n")
        }
    }
}
