import SwiftUI

/// Una conversación, leída en vivo. Fase 1: solo lectura — responder
/// llega en la Fase 2.
struct ConversationView: View {
    let conv: Conversacion
    let alAbrir: () -> Void
    @StateObject private var store = MensajesStore()

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
            .onChange(of: store.mensajes.count) {
                if let ultimo = store.mensajes.last {
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
        .safeAreaInset(edge: .bottom) {
            Text("Responder llega en la Fase 2")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(.bar)
        }
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
        for m in store.mensajes {
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
/// cliente. Con hora y, en lo nuestro, el estado (✓ ✓✓ ✓✓ azul).
private struct BurbujaMensaje: View {
    let mensaje: Mensaje

    var body: some View {
        HStack {
            if mensaje.esSaliente { Spacer(minLength: 48) }
            VStack(alignment: .leading, spacing: 4) {
                contenido
                pieDeMensaje
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(fondo, in: RoundedRectangle(cornerRadius: 16))
            if !mensaje.esSaliente { Spacer(minLength: 48) }
        }
    }

    @ViewBuilder private var contenido: some View {
        switch mensaje.tipo {
        case "image":
            VStack(alignment: .leading, spacing: 6) {
                miniatura
                if !mensaje.texto.isEmpty { Text(mensaje.texto) }
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
        }
    }

    private var miniatura: some View {
        AsyncImage(url: URL(string: mensaje.media?.thumbUrl ?? mensaje.media?.url ?? "")) { fase in
            switch fase {
            case .success(let imagen):
                imagen.resizable().aspectRatio(contentMode: .fit)
            case .failure:
                Label("Foto", systemImage: "photo")
                    .padding(24)
            default:
                ProgressView().padding(40)
            }
        }
        .frame(maxWidth: 230, maxHeight: 280)
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
                default:
                    Text("✓").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    private var fondo: some ShapeStyle {
        mensaje.esSaliente
            ? AnyShapeStyle(.tint.opacity(0.18))
            : AnyShapeStyle(Color(.secondarySystemGroupedBackground))
    }
}
