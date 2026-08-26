import SwiftUI

/// La bandeja: toda conversación de WhatsApp del negocio, en vivo.
struct ConversationListView: View {
    @EnvironmentObject private var session: SessionStore
    @StateObject private var inbox = InboxStore()
    @ObservedObject private var navegacion = Navegacion.shared
    @State private var ruta: [String] = []
    @State private var busqueda = ""

    var body: some View {
        NavigationStack(path: $ruta) {
            Group {
                if let error = inbox.error {
                    ContentUnavailableView("Sin acceso", systemImage: "lock", description: Text(error))
                } else if inbox.cargando {
                    ProgressView("Cargando chats…")
                } else if inbox.conversaciones.isEmpty {
                    ContentUnavailableView("Sin conversaciones",
                                           systemImage: "bubble.left.and.bubble.right",
                                           description: Text("Cuando un cliente escriba al WhatsApp del negocio, aparecerá aquí."))
                } else {
                    List(filtradas) { conv in
                        NavigationLink(value: conv.id) {
                            FilaConversacion(conv: conv)
                        }
                    }
                    .listStyle(.plain)
                    .searchable(text: $busqueda, prompt: "Buscar chat o número")
                }
            }
            .navigationTitle("Chats")
            .navigationDestination(for: String.self) { id in
                if let conv = inbox.conversaciones.first(where: { $0.id == id }) {
                    ConversationView(conv: conv, alAbrir: { inbox.marcarLeida(conv) })
                }
            }
        }
        .onAppear {
            inbox.empezar()
            AppDelegate.activarNotificaciones()
        }
        .onChange(of: navegacion.abrirConversacion) {
            // El aviso tocado trae la conversación: se abre encima de todo.
            if let id = navegacion.abrirConversacion {
                ruta = [id]
                navegacion.abrirConversacion = nil
            }
        }
    }

    /// La búsqueda cruza nombre, número y último mensaje.
    private var filtradas: [Conversacion] {
        let q = busqueda.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return inbox.conversaciones }
        return inbox.conversaciones.filter {
            $0.titulo.lowercased().contains(q)
                || $0.waId.contains(q)
                || $0.ultimoMensaje.lowercased().contains(q)
                || ($0.linkedBusinessName?.lowercased().contains(q) ?? false)
        }
    }
}

private struct FilaConversacion: View {
    let conv: Conversacion

    /// Color estable por contacto: del número sale el tono, así cada quien
    /// tiene el suyo y no cambia entre aperturas.
    private var colorAvatar: Color {
        var h = 0
        for u in conv.waId.unicodeScalars { h = (h &* 31 &+ Int(u.value)) & 0xFFFF }
        return Color(hue: Double(h % 360) / 360, saturation: 0.55, brightness: 0.72)
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(colorAvatar.gradient)
                Text(conv.inicial)
                    .font(.title3.bold())
                    .foregroundStyle(.white)
            }
            .frame(width: 48, height: 48)

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(conv.titulo)
                        .font(.body.weight(conv.sinLeer > 0 ? .semibold : .regular))
                        .lineLimit(1)
                    Spacer()
                    Text(Formato.hora(conv.ultimoMensajeAt))
                        .font(.caption)
                        .foregroundStyle(conv.sinLeer > 0 ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                }
                HStack(spacing: 6) {
                    if conv.ultimaDireccion == "saliente" {
                        Image(systemName: "arrowshape.turn.up.left")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Text(Formato.resumen(conv.ultimoMensaje))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Spacer()
                    if conv.sinLeer > 0 {
                        Text("\(conv.sinLeer)")
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(.tint, in: Capsule())
                    }
                }
                if let negocio = conv.linkedBusinessName {
                    Label(negocio, systemImage: "storefront")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
