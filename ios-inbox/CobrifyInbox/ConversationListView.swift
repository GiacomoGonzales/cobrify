import SwiftUI

/// La bandeja: toda conversación de WhatsApp del negocio, en vivo.
struct ConversationListView: View {
    @EnvironmentObject private var session: SessionStore
    @StateObject private var inbox = InboxStore()
    @ObservedObject private var navegacion = Navegacion.shared
    @State private var ruta: [String] = []

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
                    List(inbox.conversaciones) { conv in
                        NavigationLink(value: conv.id) {
                            FilaConversacion(conv: conv)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Chats")
            .navigationDestination(for: String.self) { id in
                if let conv = inbox.conversaciones.first(where: { $0.id == id }) {
                    ConversationView(conv: conv, alAbrir: { inbox.marcarLeida(conv) })
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Cerrar sesión", role: .destructive) { session.signOut() }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
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
}

private struct FilaConversacion: View {
    let conv: Conversacion

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(.tint.opacity(0.15))
                Text(conv.inicial)
                    .font(.title3.bold())
                    .foregroundStyle(.tint)
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
