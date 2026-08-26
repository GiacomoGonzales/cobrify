import SwiftUI
import PhotosUI
import UIKit

/// Una conversación, leída en vivo. Fase 1: solo lectura — responder
/// llega en la Fase 2.
struct ConversationView: View {
    let conv: Conversacion
    let alAbrir: () -> Void
    @StateObject private var store = MensajesStore()
    @State private var borrador = ""
    @State private var enviando = false
    @State private var errorEnvio: String?
    @State private var mostrarGaleria = false
    @State private var fotoSeleccionada: PhotosPickerItem?
    @State private var mostrarCamara = false
    @State private var mostrarArchivos = false
    @StateObject private var grabadora = GrabadoraNota()
    @ObservedObject private var catalogo = CatalogoStore.shared
    @State private var mostrarNota = false
    @State private var notaBorrador = ""
    @State private var mostrarRapidas = false
    @State private var estadoLocal: String?
    @State private var etiquetasLocal: Set<String>?
    @State private var mostrarPlantilla = false
    @State private var mostrarFicha = false
    @State private var mostrarVincular = false

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 3) {
                    ForEach(elementos) { elemento in
                        switch elemento {
                        case .separador(let id, let titulo):
                            Text(titulo)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(.quaternary.opacity(0.5), in: Capsule())
                                .padding(.vertical, 6)
                                .id(id)
                        case .mensaje(let m, let cambiaDeLado):
                            BurbujaMensaje(mensaje: m)
                                .padding(.top, cambiaDeLado ? 10 : 0)
                                .id(m.id)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)
            }
            .defaultScrollAnchor(.bottom)
            // Arrastrar hacia abajo va cerrando el teclado, como WhatsApp.
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: store.mensajes.count + store.pendientes.count) {
                if let ultimo = (store.mensajes + store.pendientes).last {
                    withAnimation { proxy.scrollTo(ultimo.id, anchor: .bottom) }
                }
            }
            // Al abrir el teclado, la conversación sube sola y lo último
            // queda a la vista — sin tener que hacer scroll a mano.
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in
                if let ultimo = (store.mensajes + store.pendientes).last {
                    withAnimation { proxy.scrollTo(ultimo.id, anchor: .bottom) }
                }
            }
        }
        .background(Apariencia.shared.fondoView())
        .navigationTitle(conv.titulo)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 0) {
                    Text(conv.titulo).font(.headline).lineLimit(1)
                    Text(Formato.numero(conv.waId))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Estado", selection: Binding(
                        get: { estadoLocal ?? conv.estado },
                        set: { nuevo in
                            estadoLocal = nuevo
                            catalogo.cambiarEstado(conv.id, a: nuevo)
                        }
                    )) {
                        ForEach(CatalogoStore.ESTADOS, id: \.id) { e in
                            Label(e.nombre, systemImage: e.icono).tag(e.id)
                        }
                    }
                    if !catalogo.etiquetas.isEmpty {
                        Menu("Etiquetas") {
                            ForEach(catalogo.etiquetas) { e in
                                Button {
                                    let tiene = etiquetasActuales.contains(e.id)
                                    var set = etiquetasActuales
                                    if tiene { set.remove(e.id) } else { set.insert(e.id) }
                                    etiquetasLocal = set
                                    catalogo.alternarEtiqueta(conv.id, tagId: e.id, tiene: tiene)
                                } label: {
                                    if etiquetasActuales.contains(e.id) {
                                        Label(e.nombre, systemImage: "checkmark")
                                    } else {
                                        Text(e.nombre)
                                    }
                                }
                            }
                        }
                    }
                    Button {
                        notaBorrador = conv.nota ?? ""
                        mostrarNota = true
                    } label: {
                        Label(conv.nota == nil ? "Agregar nota interna" : "Ver nota interna", systemImage: "note.text")
                    }
                    Divider()
                    if conv.linkedBusinessId != nil {
                        Button {
                            mostrarFicha = true
                        } label: {
                            Label("Ficha del cliente", systemImage: "person.text.rectangle")
                        }
                        Button(role: .destructive) {
                            BuscadorNegocios.desvincular(conversationId: conv.id)
                        } label: {
                            Label("Desvincular negocio", systemImage: "link.badge.minus")
                        }
                    } else {
                        Button {
                            mostrarVincular = true
                        } label: {
                            Label("Vincular a un negocio", systemImage: "link")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $mostrarNota) {
            NavigationStack {
                TextEditor(text: $notaBorrador)
                    .padding(12)
                    .navigationTitle("Nota interna")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Cancelar") { mostrarNota = false }
                        }
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Guardar") {
                                catalogo.guardarNota(conv.id, nota: notaBorrador)
                                mostrarNota = false
                            }
                            .fontWeight(.semibold)
                        }
                    }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $mostrarFicha) {
            if let negocio = conv.linkedBusinessId {
                FichaClienteView(businessId: negocio)
            }
        }
        .sheet(isPresented: $mostrarVincular) {
            VincularSheet(conversationId: conv.id)
        }
        .sheet(isPresented: $mostrarPlantilla) {
            EnviarPlantillaSheet(conversationId: conv.id)
        }
        .sheet(isPresented: $mostrarRapidas) {
            RespuestasRapidasSheet { rapida in
                mostrarRapidas = false
                usarRapida(rapida)
            }
            .presentationDetents([.medium, .large])
        }
        .safeAreaInset(edge: .bottom) { barraDeRespuesta }
        .photosPicker(isPresented: $mostrarGaleria, selection: $fotoSeleccionada, matching: .images)
        .onChange(of: fotoSeleccionada) {
            guard let item = fotoSeleccionada else { return }
            fotoSeleccionada = nil
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    enviarFoto(img)
                }
            }
        }
        .fullScreenCover(isPresented: $mostrarCamara) {
            CamaraPicker { img in enviarFoto(img) }
                .ignoresSafeArea()
        }
        .fileImporter(isPresented: $mostrarArchivos, allowedContentTypes: [.pdf]) { resultado in
            guard case .success(let url) = resultado else { return }
            let accedio = url.startAccessingSecurityScopedResource()
            defer { if accedio { url.stopAccessingSecurityScopedResource() } }
            guard let datos = try? Data(contentsOf: url) else {
                errorEnvio = "No se pudo leer el archivo."
                return
            }
            guard datos.count <= 100 * 1024 * 1024 else {
                errorEnvio = "El límite de WhatsApp para documentos es 100 MB."
                return
            }
            enviarAdjunto(datos: datos, mimeType: "application/pdf",
                          filename: url.lastPathComponent, tipo: "document")
        }
        .onAppear {
            store.empezar(conversationId: conv.id)
            alAbrir()
            Navegacion.shared.conversacionVisible = conv.id
        }
        .onDisappear {
            store.parar()
            if Navegacion.shared.conversacionVisible == conv.id {
                Navegacion.shared.conversacionVisible = nil
            }
        }
    }

    /// Mensajes con su separador de día intercalado.
    private var elementos: [ElementoChat] {
        var resultado: [ElementoChat] = []
        var diaAnterior: DateComponents?
        var direccionAnterior: String?
        for m in store.mensajes + store.pendientes {
            if let fecha = m.timestamp {
                let dia = Calendar.current.dateComponents([.year, .month, .day], from: fecha)
                if dia != diaAnterior {
                    resultado.append(.separador(id: "sep-\(m.id)", titulo: Formato.dia(fecha)))
                    diaAnterior = dia
                    direccionAnterior = nil  // el separador ya da el respiro
                }
            }
            // El respiro de WhatsApp: cuando cambia quién habla, aire extra.
            let cambia = direccionAnterior != nil && direccionAnterior != m.direccion
            resultado.append(.mensaje(m, cambiaDeLado: cambia))
            direccionAnterior = m.direccion
        }
        return resultado
    }

    // MARK: - Responder

    /// Vencimiento VIVO de la ventana de 24 h: desde el último mensaje del
    /// cliente ya cargado (si el cliente escribe, se extiende sola); si aún
    /// no hay mensajes, lo que diga la conversación.
    private var venceVentana: Date? {
        if let ultimoEntrante = store.mensajes.last(where: { !$0.esSaliente })?.timestamp {
            return ultimoEntrante.addingTimeInterval(24 * 3600)
        }
        return conv.ventanaVenceAt
    }

    @ViewBuilder private var barraDeRespuesta: some View {
        TimelineView(.periodic(from: .now, by: 60)) { _ in
            VStack(spacing: 0) {
                if let errorEnvio {
                    Text(errorEnvio)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .vidrioCapsula()
                        .padding(.bottom, 4)
                }
                if let vence = venceVentana, vence.timeIntervalSinceNow <= 0 {
                    // Ventana cerrada: WhatsApp ya no acepta texto libre.
                    VStack(spacing: 8) {
                        Label("La ventana de 24 horas se cerró", systemImage: "clock.badge.exclamationmark")
                            .font(.footnote.weight(.medium))
                        Text("Se reabre sola cuando el cliente escriba.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button {
                            mostrarPlantilla = true
                        } label: {
                            Label("Enviar plantilla", systemImage: "doc.text")
                                .font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(14)
                    .vidrioRedondeado(22)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
                } else {
                    if let vence = venceVentana, vence.timeIntervalSinceNow < 3 * 3600 {
                        // Aviso discreto solo cuando queda poco.
                        Text("La ventana se cierra en \(Formato.restante(hasta: vence))")
                            .font(.caption2)
                            .foregroundStyle(.orange)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 6)
                    }
                    if grabadora.grabando {
                        // Grabando nota de voz
                        HStack(spacing: 12) {
                            Circle().fill(.red).frame(width: 10, height: 10)
                                .opacity(grabadora.segundos % 2 == 0 ? 1 : 0.3)
                            Text(grabadora.tiempo)
                                .font(.body.monospacedDigit())
                            Spacer()
                            Button("Cancelar", role: .destructive) { grabadora.cancelar() }
                            Button {
                                enviarNotaDeVoz()
                            } label: {
                                Image(systemName: "arrow.up")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .frame(width: 40, height: 40)
                                    .background(.tint, in: Circle())
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .vidrioCapsula()
                        .padding(.horizontal, 12)
                        .padding(.bottom, 6)
                    } else {
                    HStack(alignment: .bottom, spacing: 8) {
                        Menu {
                            Button { mostrarGaleria = true } label: { Label("Foto de la galería", systemImage: "photo.on.rectangle") }
                            Button { mostrarCamara = true } label: { Label("Tomar foto", systemImage: "camera") }
                            Button { mostrarArchivos = true } label: { Label("Documento PDF", systemImage: "doc") }
                            if !catalogo.respuestasRapidas.isEmpty {
                                Button { mostrarRapidas = true } label: { Label("Respuesta rápida", systemImage: "bolt.fill") }
                            }
                        } label: {
                            Image(systemName: "plus")
                                .font(.system(size: 17, weight: .semibold))
                                .frame(width: 40, height: 40)
                        }
                        .vidrioCapsula()

                        TextField("Mensaje", text: $borrador, axis: .vertical)
                            .lineLimit(1...5)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .vidrioCapsula()

                        if puedeEnviar {
                            Button(action: enviar) {
                                Image(systemName: "arrow.up")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .frame(width: 40, height: 40)
                                    .background(.tint, in: Circle())
                            }
                        } else {
                            Button {
                                Task { _ = await grabadora.empezar() }
                            } label: {
                                Image(systemName: "mic.fill")
                                    .font(.system(size: 17, weight: .semibold))
                                    .frame(width: 40, height: 40)
                            }
                            .vidrioCapsula()
                            .disabled(enviando)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
                    }
                }
            }
        }
    }

    private var puedeEnviar: Bool {
        !borrador.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !enviando
    }

    /// La foto sale recomprimida (tope 2048 px, JPEG 80%): una foto de cámara
    /// de 5 MB baja a menos de 1 MB sin que se note en el chat.
    private func enviarFoto(_ imagen: UIImage) {
        let maxLado: CGFloat = 2048
        let escala = min(1, maxLado / max(imagen.size.width, imagen.size.height))
        let tamano = CGSize(width: imagen.size.width * escala, height: imagen.size.height * escala)
        // scale 1: sin esto el renderer usa la escala de la pantalla (3x) y la
        // "foto de 2048" sale de 6144 px reales — y revienta el límite de 5 MB.
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        let r = UIGraphicsImageRenderer(size: tamano, format: formato)
        let reducida = r.image { _ in imagen.draw(in: CGRect(origin: .zero, size: tamano)) }
        guard let datos = reducida.jpegData(compressionQuality: 0.8) else {
            errorEnvio = "No se pudo procesar la foto."
            return
        }
        guard datos.count <= 5 * 1024 * 1024 else {
            errorEnvio = "El límite de WhatsApp para fotos es 5 MB."
            return
        }
        enviarAdjunto(datos: datos, mimeType: "image/jpeg", filename: "foto.jpg", tipo: "image")
    }

    private func enviarNotaDeVoz() {
        guard let url = grabadora.terminar(),
              let datos = try? Data(contentsOf: url) else {
            errorEnvio = "No se pudo grabar la nota."
            return
        }
        guard datos.count <= 16 * 1024 * 1024 else {
            errorEnvio = "El límite de WhatsApp para audios es 16 MB."
            return
        }
        enviarAdjunto(datos: datos, mimeType: "audio/mp4",
                      filename: url.lastPathComponent, tipo: "audio")
    }

    private func enviarAdjunto(datos: Data, mimeType: String, filename: String, tipo: String) {
        errorEnvio = nil
        enviando = true
        Task {
            let error = await store.enviarMedia(conversationId: conv.id, datos: datos,
                                                mimeType: mimeType, filename: filename,
                                                caption: "", tipo: tipo)
            enviando = false
            if let error { errorEnvio = error }
        }
    }

    private var etiquetasActuales: Set<String> {
        etiquetasLocal ?? Set(conv.etiquetas)
    }

    /// Una respuesta rápida con adjunto sale directo (el archivo ya está
    /// guardado); una de solo texto cae al borrador para retocarla antes.
    private func usarRapida(_ r: RespuestaRapida) {
        if let media = r.media, media["url"] != nil {
            errorEnvio = nil
            enviando = true
            Task {
                do {
                    try await ChatAPI.enviarMediaGuardada(conversationId: conv.id, media: media, caption: r.texto)
                } catch {
                    errorEnvio = (error as? ChatAPI.ErrorEnvio)?.mensaje ?? "No se pudo enviar."
                }
                enviando = false
            }
        } else {
            borrador = r.texto
        }
    }

    private func enviar() {
        let texto = borrador.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !texto.isEmpty, !enviando else { return }
        borrador = ""
        errorEnvio = nil
        enviando = true
        Task {
            let error = await store.enviar(texto: texto, conversationId: conv.id)
            enviando = false
            if let error {
                errorEnvio = error
                // El texto vuelve al borrador: nada se pierde por un fallo.
                if borrador.isEmpty { borrador = texto }
            }
        }
    }
}

private enum ElementoChat: Identifiable {
    case separador(id: String, titulo: String)
    case mensaje(Mensaje, cambiaDeLado: Bool)

    var id: String {
        switch self {
        case .separador(let id, _): return id
        case .mensaje(let m, _): return m.id
        }
    }
}

/// La burbuja: verde a la derecha lo nuestro, gris a la izquierda lo del
/// cliente. Abraza su contenido; las fotos usan las medidas que guarda el
/// servidor para reservar el espacio exacto (sin franjas muertas).
private struct BurbujaMensaje: View {
    let mensaje: Mensaje
    @State private var verAdjunto = false

    var body: some View {
        HStack {
            if mensaje.esSaliente { Spacer(minLength: 60) }
            VStack(alignment: .trailing, spacing: 4) {
                contenido
                pieDeMensaje
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(fondo, in: RoundedRectangle(cornerRadius: 16))
            if !mensaje.esSaliente { Spacer(minLength: 60) }
        }
    }

    @ViewBuilder private var contenido: some View {
        if mensaje.estado == "sending", mensaje.media == nil, mensaje.tipo != "text" {
            // Eco optimista de un adjunto que aún viaja
            HStack(spacing: 8) {
                ProgressView()
                Text(etiquetaEnviando)
                    .foregroundStyle(.secondary)
            }
        } else {
            switch mensaje.tipo {
            case "image":
                VStack(alignment: .leading, spacing: 6) {
                    miniatura
                        .onTapGesture { verAdjunto = true }
                        .contextMenu {
                            Button {
                                if let u = mensaje.media?.url ?? mensaje.media?.thumbUrl {
                                    GuardadorFotos.guardar(url: u) { _ in }
                                }
                            } label: {
                                Label("Guardar en Fotos", systemImage: "square.and.arrow.down")
                            }
                        }
                    if !mensaje.texto.isEmpty {
                        Text(mensaje.texto)
                            .frame(maxWidth: 230, alignment: .leading)
                    }
                }
                .fullScreenCover(isPresented: $verAdjunto) { visor }
            case "audio":
                if mensaje.media?.url != nil {
                    BurbujaAudio(mensaje: mensaje)
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: "mic.fill").font(.title3).foregroundStyle(.tint)
                        Text("Nota de voz")
                    }
                }
            case "sticker":
                if let url = mensaje.media?.url {
                    // El sticker es la imagen pelada (webp), sin adornos.
                    ImagenCacheada(url: url) { imagen in
                        imagen.resizable().scaledToFit()
                    }
                    .frame(width: 130, height: 130)
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: "face.smiling").font(.title3).foregroundStyle(.tint)
                        Text("Sticker")
                    }
                }
            case "video", "document":
                HStack(spacing: 8) {
                    Image(systemName: icono)
                        .font(.title3)
                        .foregroundStyle(.tint)
                    Text(etiquetaAdjunto)
                        .lineLimit(2)
                }
                .contentShape(Rectangle())
                .onTapGesture { if mensaje.media?.url != nil { verAdjunto = true } }
                .fullScreenCover(isPresented: $verAdjunto) { visor }
            case "unsupported", "unknown":
                // Meta no entrega este contenido por la Cloud API (stickers
                // animados, encuestas y otros). Mejor decirlo en cristiano.
                HStack(spacing: 8) {
                    Image(systemName: "eye.slash")
                        .foregroundStyle(.secondary)
                    Text("Este contenido no se puede mostrar aquí (WhatsApp no lo entrega a la API — suele ser un sticker animado).")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            default:
                Text(mensaje.texto.isEmpty ? "[\(mensaje.tipo)]" : mensaje.texto)
                    .multilineTextAlignment(.leading)
            }
        }
    }

    private var visor: some View {
        VisorAdjunto(url: mensaje.media?.url ?? mensaje.media?.thumbUrl ?? "",
                     filename: mensaje.media?.filename)
    }

    private var etiquetaEnviando: String {
        switch mensaje.tipo {
        case "image": return "Enviando foto…"
        case "audio": return "Enviando nota de voz…"
        case "document": return "Enviando documento…"
        default: return "Enviando…"
        }
    }

    /// La foto con su proporción real: alto = 230 / (ancho/alto guardados).
    private var miniatura: some View {
        let ancho = CGFloat(mensaje.media?.ancho ?? 4)
        let alto = CGFloat(mensaje.media?.alto ?? 3)
        let proporcion = alto > 0 ? ancho / alto : 4.0 / 3.0
        return ImagenCacheada(url: mensaje.media?.thumbUrl ?? mensaje.media?.url ?? "") { imagen in
            imagen.resizable().scaledToFill()
        }
        .aspectRatio(proporcion, contentMode: .fit)
        .frame(width: 230)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var icono: String {
        switch mensaje.tipo {
        case "video": return "video.fill"
        case "audio": return "mic.fill"
        case "document": return "doc.fill"
        default: return "face.smiling"
        }
    }

    private var etiquetaAdjunto: String {
        if let nombre = mensaje.media?.filename, !nombre.isEmpty { return nombre }
        if !mensaje.texto.isEmpty { return mensaje.texto }
        switch mensaje.tipo {
        case "video": return "Video"
        case "audio": return "Nota de voz"
        case "document": return "Documento"
        default: return "Sticker"
        }
    }

    private var pieDeMensaje: some View {
        HStack(spacing: 4) {
            Text(Formato.horaCorta(mensaje.timestamp))
                .font(.caption2)
                .foregroundStyle(.secondary)
            if mensaje.esSaliente {
                switch mensaje.estado {
                case "read":
                    Text("✓✓").font(.caption2).foregroundStyle(.blue)
                case "delivered":
                    Text("✓✓").font(.caption2).foregroundStyle(.secondary)
                case "failed":
                    Image(systemName: "exclamationmark.circle")
                        .font(.caption2).foregroundStyle(.red)
                case "sending":
                    Image(systemName: "clock")
                        .font(.caption2).foregroundStyle(.secondary)
                default:
                    Text("✓").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }

    @ObservedObject private var apariencia = Apariencia.shared
    @Environment(\.colorScheme) private var esquema

    private var fondo: some ShapeStyle {
        mensaje.esSaliente
            ? AnyShapeStyle(apariencia.fondoBurbuja(esquema))
            : AnyShapeStyle(Color(.secondarySystemGroupedBackground))
    }
}
