import SwiftUI

/// Una conversación, leída en vivo. Fase 1: solo lectura — responder
/// llega en la Fase 2.
struct ConversationView: View {
    let conv: Conversacion
    let alAbrir: () -> Void
    @StateObject private var store = MensajesStore()
    @State private var borrador = ""
    @State private var enviando = false
    @State private var errorEnvio: String?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 4) {
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
                        case .mensaje(let m):
                            BurbujaMensaje(mensaje: m)
                                .id(m.id)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)
            }
            .defaultScrollAnchor(.bottom)
            .onChange(of: store.mensajes.count + store.pendientes.count) {
                if let ultimo = (store.mensajes + store.pendientes).last {
                    withAnimation { proxy.scrollTo(ultimo.id, anchor: .bottom) }
                }
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(conv.titulo)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 0) {
                    Text(conv.titulo).font(.headline).lineLimit(1)
                    Text(Formato.numero(conv.waId))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .safeAreaInset(edge: .bottom) { barraDeRespuesta }
        .onAppear {
            store.empezar(conversationId: conv.id)
            alAbrir()
        }
        .onDisappear { store.parar() }
    }

    /// Mensajes con su separador de día intercalado.
    private var elementos: [ElementoChat] {
        var resultado: [ElementoChat] = []
        var diaAnterior: DateComponents?
        for m in store.mensajes + store.pendientes {
            if let fecha = m.timestamp {
                let dia = Calendar.current.dateComponents([.year, .month, .day], from: fecha)
                if dia != diaAnterior {
                    resultado.append(.separador(id: "sep-\(m.id)", titulo: Formato.dia(fecha)))
                    diaAnterior = dia
                }
            }
            resultado.append(.mensaje(m))
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
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                }
                if let vence = venceVentana, vence.timeIntervalSinceNow <= 0 {
                    // Ventana cerrada: WhatsApp ya no acepta texto libre.
                    VStack(spacing: 4) {
                        Label("La ventana de 24 horas se cerró", systemImage: "clock.badge.exclamationmark")
                            .font(.footnote.weight(.medium))
                        Text("Se reabre sola cuando el cliente escriba. Para escribirle tú primero hace falta una plantilla (llega en la Fase 5).")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(12)
                } else {
                    if let vence = venceVentana, vence.timeIntervalSinceNow < 3 * 3600 {
                        // Aviso discreto solo cuando queda poco.
                        Text("La ventana se cierra en \(Formato.restante(hasta: vence))")
                            .font(.caption2)
                            .foregroundStyle(.orange)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 6)
                    }
                    HStack(alignment: .bottom, spacing: 8) {
                        TextField("Mensaje", text: $borrador, axis: .vertical)
                            .lineLimit(1...5)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))

                        Button(action: enviar) {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 33))
                                .foregroundStyle(puedeEnviar ? AnyShapeStyle(.tint) : AnyShapeStyle(.tertiary))
                        }
                        .disabled(!puedeEnviar)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
            }
            .background(.bar)
        }
    }

    private var puedeEnviar: Bool {
        !borrador.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !enviando
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
    case mensaje(Mensaje)

    var id: String {
        switch self {
        case .separador(let id, _): return id
        case .mensaje(let m): return m.id
        }
    }
}

/// La burbuja: verde a la derecha lo nuestro, gris a la izquierda lo del
/// cliente. Abraza su contenido; las fotos usan las medidas que guarda el
/// servidor para reservar el espacio exacto (sin franjas muertas).
private struct BurbujaMensaje: View {
    let mensaje: Mensaje

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
        switch mensaje.tipo {
        case "image":
            VStack(alignment: .leading, spacing: 6) {
                miniatura
                if !mensaje.texto.isEmpty {
                    Text(mensaje.texto)
                        .frame(maxWidth: 230, alignment: .leading)
                }
            }
        case "video", "audio", "document", "sticker":
            HStack(spacing: 8) {
                Image(systemName: icono)
                    .font(.title3)
                    .foregroundStyle(.tint)
                Text(etiquetaAdjunto)
                    .lineLimit(2)
            }
        default:
            Text(mensaje.texto.isEmpty ? "[\(mensaje.tipo)]" : mensaje.texto)
                .multilineTextAlignment(.leading)
        }
    }

    /// La foto con su proporción real: alto = 230 / (ancho/alto guardados).
    private var miniatura: some View {
        let ancho = CGFloat(mensaje.media?.ancho ?? 4)
        let alto = CGFloat(mensaje.media?.alto ?? 3)
        let proporcion = alto > 0 ? ancho / alto : 4.0 / 3.0
        return AsyncImage(url: URL(string: mensaje.media?.thumbUrl ?? mensaje.media?.url ?? "")) { fase in
            switch fase {
            case .success(let imagen):
                imagen.resizable().scaledToFill()
            case .failure:
                ZStack {
                    Color(.tertiarySystemFill)
                    Label("Foto", systemImage: "photo").foregroundStyle(.secondary)
                }
            default:
                ZStack {
                    Color(.tertiarySystemFill)
                    ProgressView()
                }
            }
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

    private var fondo: some ShapeStyle {
        mensaje.esSaliente
            ? AnyShapeStyle(.tint.opacity(0.18))
            : AnyShapeStyle(Color(.secondarySystemGroupedBackground))
    }
}
