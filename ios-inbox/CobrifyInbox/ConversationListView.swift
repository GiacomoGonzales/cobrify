import SwiftUI

/// La bandeja: toda conversación de WhatsApp del negocio, en vivo.
struct ConversationListView: View {
    @EnvironmentObject private var session: SessionStore
    @StateObject private var inbox = InboxStore()
    @ObservedObject private var navegacion = Navegacion.shared
    @State private var ruta: [String] = []
    @State private var busqueda = ""
    @State private var filtro: Filtro = .todas
    @ObservedObject private var catalogo = CatalogoStore.shared

    enum Filtro: Equatable {
        case todas, sinLeer, abiertas, pendientes, completadas
        case etiqueta(String)
    }

    enum AccionMasiva { case leidas, completadas }
    @State private var confirmarMasivo: AccionMasiva?

    private var textoMasivo: String {
        let activas = inbox.conversaciones.filter { $0.estado != "completada" }.count
        let sinLeer = inbox.conversaciones.filter { $0.sinLeer > 0 }.count
        return confirmarMasivo == .completadas
            ? "Se marcarán como completadas las \(activas) conversaciones activas. Un mensaje nuevo del cliente las reabre solo."
            : "Se pondrá en cero el contador de \(sinLeer) conversaciones sin leer."
    }

    private func ejecutarMasivo() {
        switch confirmarMasivo {
        case .completadas:
            for c in inbox.conversaciones where c.estado != "completada" {
                catalogo.cambiarEstado(c.id, a: "completada")
            }
        case .leidas:
            for c in inbox.conversaciones where c.sinLeer > 0 {
                inbox.marcarLeida(c)
            }
        case nil: break
        }
        confirmarMasivo = nil
    }

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
                    // Una sola List: los filtros son la primera fila, así se
                    // van con el scroll y el título grande colapsa nativo,
                    // como WhatsApp.
                    List {
                        barraDeFiltros
                            .listRowInsets(EdgeInsets())
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                        ForEach(filtradas) { conv in
                            NavigationLink(value: conv.id) {
                                FilaConversacion(conv: conv, etiquetas: catalogo.etiquetas)
                            }
                            .contextMenu {
                                Menu {
                                    ForEach(catalogo.etiquetas) { e in
                                        Button {
                                            catalogo.alternarEtiqueta(conv.id, tagId: e.id,
                                                                      tiene: conv.etiquetas.contains(e.id))
                                        } label: {
                                            if conv.etiquetas.contains(e.id) {
                                                Label(e.nombre, systemImage: "checkmark")
                                            } else {
                                                Text(e.nombre)
                                            }
                                        }
                                    }
                                } label: {
                                    Label("Mover a carpeta", systemImage: "folder")
                                }
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                if conv.estado == "completada" {
                                    Button { catalogo.cambiarEstado(conv.id, a: "abierta") } label: {
                                        Label("Reabrir", systemImage: "tray.full")
                                    }.tint(.blue)
                                } else {
                                    Button { catalogo.cambiarEstado(conv.id, a: "completada") } label: {
                                        Label("Completada", systemImage: "checkmark.circle")
                                    }.tint(.green)
                                    Button { catalogo.cambiarEstado(conv.id, a: "pendiente") } label: {
                                        Label("Pendiente", systemImage: "clock")
                                    }.tint(.orange)
                                }
                            }
                        }
                    }
                    .listStyle(.plain)
                    .searchable(text: $busqueda, prompt: "Buscar chat o número")
                }
            }
            .navigationTitle("Chats")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        CarpetasView(inbox: inbox)
                    } label: {
                        Image(systemName: "folder")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            confirmarMasivo = .leidas
                        } label: {
                            Label("Marcar todas como leídas", systemImage: "envelope.open")
                        }
                        Button {
                            confirmarMasivo = .completadas
                        } label: {
                            Label("Completar todas (archivar)", systemImage: "checkmark.circle")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .confirmationDialog(textoMasivo, isPresented: Binding(
                get: { confirmarMasivo != nil },
                set: { if !$0 { confirmarMasivo = nil } }
            ), titleVisibility: .visible) {
                Button(confirmarMasivo == .completadas ? "Sí, completar todas" : "Sí, marcar leídas") {
                    ejecutarMasivo()
                }
                Button("Cancelar", role: .cancel) { confirmarMasivo = nil }
            }
            .navigationDestination(for: String.self) { id in
                if let conv = inbox.conversaciones.first(where: { $0.id == id }) {
                    ConversationView(conv: conv, alAbrir: { inbox.marcarLeida(conv) })
                }
            }
        }
        .onAppear {
            inbox.empezar()
            catalogo.empezar()
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

    /// Primero el filtro elegido, después la búsqueda.
    private var filtradas: [Conversacion] {
        var lista = inbox.conversaciones
        switch filtro {
        case .todas: break
        case .sinLeer: lista = lista.filter { $0.sinLeer > 0 }
        case .abiertas: lista = lista.filter { $0.estado == "abierta" }
        case .pendientes: lista = lista.filter { $0.estado == "pendiente" }
        case .completadas: lista = lista.filter { $0.estado == "completada" }
        case .etiqueta(let id): lista = lista.filter { $0.etiquetas.contains(id) }
        }
        let q = busqueda.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return lista }
        return lista.filter {
            $0.titulo.lowercased().contains(q)
                || $0.waId.contains(q)
                || $0.ultimoMensaje.lowercased().contains(q)
                || ($0.linkedBusinessName?.lowercased().contains(q) ?? false)
        }
    }

    private var barraDeFiltros: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip("Todas", .todas)
                chip("Sin leer", .sinLeer)
                chip("Abiertas", .abiertas)
                chip("Pendientes", .pendientes)
                chip("Completadas", .completadas)
                ForEach(catalogo.etiquetas) { e in
                    chipEtiqueta(e)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    private func chip(_ nombre: String, _ f: Filtro) -> some View {
        Button {
            filtro = (filtro == f) ? .todas : f
        } label: {
            Text(nombre)
                .font(.subheadline.weight(filtro == f ? .semibold : .regular))
                .padding(.horizontal, 13)
                .padding(.vertical, 7)
                .background(filtro == f ? AnyShapeStyle(.tint.opacity(0.18)) : AnyShapeStyle(Color(.secondarySystemGroupedBackground)), in: Capsule())
                .foregroundStyle(filtro == f ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary))
        }
        .buttonStyle(.plain)
    }

    private func chipEtiqueta(_ e: Etiqueta) -> some View {
        Button {
            filtro = (filtro == .etiqueta(e.id)) ? .todas : .etiqueta(e.id)
        } label: {
            HStack(spacing: 6) {
                Circle().fill(e.color).frame(width: 8, height: 8)
                Text(e.nombre)
                    .font(.subheadline.weight(filtro == .etiqueta(e.id) ? .semibold : .regular))
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 7)
            .background(filtro == .etiqueta(e.id) ? AnyShapeStyle(e.color.opacity(0.18)) : AnyShapeStyle(Color(.secondarySystemGroupedBackground)), in: Capsule())
            .foregroundStyle(filtro == .etiqueta(e.id) ? AnyShapeStyle(e.color) : AnyShapeStyle(.primary))
        }
        .buttonStyle(.plain)
    }
}

private struct FilaConversacion: View {
    let conv: Conversacion
    var etiquetas: [Etiqueta] = []

    /// Color estable por contacto: del número sale el tono, así cada quien
    /// tiene el suyo y no cambia entre aperturas.
    private var colorAvatar: Color {
        var h = 0
        for u in conv.waId.unicodeScalars { h = (h &* 31 &+ Int(u.value)) & 0xFFFF }
        return Color(hue: Double(h % 360) / 360, saturation: 0.55, brightness: 0.72)
    }

    private var puntos: [Etiqueta] {
        etiquetas.filter { conv.etiquetas.contains($0.id) }
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
                HStack(spacing: 5) {
                    Text(conv.titulo)
                        .font(.body.weight(conv.sinLeer > 0 ? .semibold : .regular))
                        .lineLimit(1)
                    if conv.estado == "pendiente" {
                        Image(systemName: "clock.fill").font(.caption2).foregroundStyle(.orange)
                    } else if conv.estado == "completada" {
                        Image(systemName: "checkmark.circle.fill").font(.caption2).foregroundStyle(.green)
                    }
                    ForEach(puntos) { e in
                        Circle().fill(e.color).frame(width: 8, height: 8)
                    }
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
