import SwiftUI

/// Las carpetas de la bandeja: cada etiqueta del catálogo compartido es una
/// carpeta. Mueves chats adentro (un chat puede estar en varias), los ves
/// separados por etapa y creas, renombras o borras carpetas — la web ve lo
/// mismo.
struct CarpetasView: View {
    @ObservedObject private var inbox: InboxStore
    @ObservedObject private var catalogo = CatalogoStore.shared
    @State private var mostrarNueva = false
    @State private var editando: Etiqueta?

    init(inbox: InboxStore) {
        self.inbox = inbox
    }

    var body: some View {
        Group {
            if catalogo.etiquetas.isEmpty {
                ContentUnavailableView {
                    Label("Sin carpetas", systemImage: "folder")
                } description: {
                    Text("Agrupa los chats por etapa —interesados, pagó, en implementación— y encuéntralos de un toque. Las mismas carpetas se ven en la web.")
                } actions: {
                    Button("Crear carpeta") { mostrarNueva = true }
                        .buttonStyle(.borderedProminent)
                }
            } else {
                lista
            }
        }
        .navigationTitle("Carpetas")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { mostrarNueva = true } label: {
                    Image(systemName: "folder.badge.plus")
                }
            }
        }
        .sheet(isPresented: $mostrarNueva) {
            EditarCarpetaSheet()
        }
        .sheet(item: $editando) { e in
            EditarCarpetaSheet(carpeta: e)
        }
    }

    private var lista: some View {
        List {
            Section {
                // OJO: el destino va aquí, dentro del propio enlace, y NO por
                // `NavigationLink(value:)` + `navigationDestination`. La pila
                // de la bandeja tiene camino tipado de String (para abrir un
                // chat desde una notificación), así que un enlace con otro
                // tipo de valor NO empuja nada: se tocaba la carpeta y no
                // pasaba nada. Esto era el "no funciona" del 06-sep-2026.
                ForEach(catalogo.etiquetas) { e in
                    NavigationLink {
                        ChatsDeCarpeta(etiqueta: e, inbox: inbox)
                    } label: {
                        fila(e)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await catalogo.borrarEtiqueta(e.id) }
                        } label: {
                            Label("Eliminar", systemImage: "trash")
                        }
                        Button { editando = e } label: {
                            Label("Editar", systemImage: "pencil")
                        }
                        .tint(.blue)
                    }
                    .contextMenu {
                        Button { editando = e } label: {
                            Label("Renombrar o cambiar color", systemImage: "pencil")
                        }
                        Button(role: .destructive) {
                            Task { await catalogo.borrarEtiqueta(e.id) }
                        } label: {
                            Label("Eliminar carpeta", systemImage: "trash")
                        }
                    }
                }
            } footer: {
                Text("Las carpetas son las mismas etiquetas de la web: mover un chat aquí se refleja allá. Un chat puede estar en varias carpetas. Borrar una carpeta no borra ningún chat.")
            }
        }
    }

    private func fila(_ e: Etiqueta) -> some View {
        let dentro = inbox.conversaciones.filter { $0.etiquetas.contains(e.id) }
        let sinLeer = dentro.filter { $0.sinLeer > 0 }.count
        return HStack(spacing: 12) {
            ZStack {
                Circle().fill(e.color.opacity(0.18))
                Image(systemName: "folder.fill")
                    .foregroundStyle(e.color)
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(e.nombre)
                    .font(.body.weight(sinLeer > 0 ? .semibold : .regular))
                    .lineLimit(1)
                Text(dentro.isEmpty ? "Vacía" : "\(dentro.count) chat\(dentro.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if sinLeer > 0 {
                Text("\(sinLeer)")
                    .font(.caption2.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(.tint, in: Capsule())
            }
        }
    }
}

/// Los chats de UNA carpeta, con sacar por swipe.
struct ChatsDeCarpeta: View {
    let etiqueta: Etiqueta
    @ObservedObject var inbox: InboxStore
    @ObservedObject private var catalogo = CatalogoStore.shared

    private var chats: [Conversacion] {
        inbox.conversaciones.filter { $0.etiquetas.contains(etiqueta.id) }
    }

    var body: some View {
        Group {
            if chats.isEmpty {
                ContentUnavailableView(
                    "Carpeta vacía",
                    systemImage: "folder",
                    description: Text("Mantén presionado un chat en la bandeja y elige “Mover a carpeta” para traerlo aquí.")
                )
            } else {
                List(chats) { conv in
                    // Igual que arriba: el destino va aquí y no por valor. La
                    // pila ya trae una pantalla empujada "a mano" (Carpetas),
                    // así que su camino tipado está desfasado y un enlace por
                    // valor no empuja nada — se tocaba el chat y no abría.
                    NavigationLink {
                        ConversationView(conv: conv, alAbrir: { inbox.marcarLeida(conv) })
                    } label: {
                        FilaConversacionCompacta(conv: conv)
                    }
                    .swipeActions(edge: .trailing) {
                        Button {
                            catalogo.alternarEtiqueta(conv.id, tagId: etiqueta.id, tiene: true)
                        } label: {
                            Label("Sacar", systemImage: "folder.badge.minus")
                        }
                        .tint(.red)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle(etiqueta.nombre)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Fila simple para las carpetas (sin puntos de etiqueta: ya estás adentro).
struct FilaConversacionCompacta: View {
    let conv: Conversacion

    private var colorAvatar: Color {
        var h = 0
        for u in conv.waId.unicodeScalars { h = (h &* 31 &+ Int(u.value)) & 0xFFFF }
        return Color(hue: Double(h % 360) / 360, saturation: 0.55, brightness: 0.72)
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(colorAvatar.gradient)
                Text(conv.inicial).font(.headline).foregroundStyle(.white)
            }
            .frame(width: 42, height: 42)
            VStack(alignment: .leading, spacing: 2) {
                Text(conv.titulo)
                    .font(.body.weight(conv.sinLeer > 0 ? .semibold : .regular))
                    .lineLimit(1)
                Text(Formato.resumen(conv.ultimoMensaje))
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(Formato.hora(conv.ultimoMensajeAt))
                    .font(.caption)
                    .foregroundStyle(conv.sinLeer > 0 ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                if conv.sinLeer > 0 {
                    Text("\(conv.sinLeer)")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.tint, in: Capsule())
                }
            }
        }
    }
}

/// Crear o editar una carpeta: nombre y color, al catálogo compartido.
///
/// Al editar, el id NO cambia — así los chats que ya están dentro siguen
/// dentro. Es lo mismo que hace la web.
struct EditarCarpetaSheet: View {
    var carpeta: Etiqueta?

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var catalogo = CatalogoStore.shared
    @State private var nombre = ""
    @State private var colorHex = "#1B6E4A"
    @State private var trabajando = false
    @State private var error: String?
    @State private var arranco = false

    private let colores = ["#1B6E4A", "#2D7FF9", "#7C3AED", "#EA7C1C", "#DB2777",
                           "#A3352C", "#96690F", "#0E7490", "#6B7280"]

    private var editando: Bool { carpeta != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("Nombre") {
                    TextField("Ej: Pagó — en implementación", text: $nombre)
                }
                Section("Color") {
                    // En cuadrícula y no en fila: nueve círculos en una sola
                    // línea no caben en el iPhone y los de las puntas se
                    // cortaban (no se veía el verde ni el gris).
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 12) {
                        ForEach(colores, id: \.self) { hex in
                            Button {
                                colorHex = hex
                            } label: {
                                ZStack {
                                    Circle().fill(Color(hex: hex)).frame(width: 36, height: 36)
                                    if colorHex == hex {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 13, weight: .bold))
                                            .foregroundStyle(.white)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 6)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle(editando ? "Editar carpeta" : "Nueva carpeta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        guardar()
                    } label: {
                        if trabajando {
                            ProgressView()
                        } else {
                            Text(editando ? "Guardar" : "Crear").fontWeight(.semibold)
                        }
                    }
                    .disabled(nombre.trimmingCharacters(in: .whitespaces).isEmpty || trabajando)
                }
            }
        }
        .presentationDetents([.medium])
        .onAppear {
            guard !arranco else { return }
            arranco = true
            if let carpeta {
                nombre = carpeta.nombre
                colorHex = carpeta.colorHex
            }
        }
    }

    private func guardar() {
        trabajando = true
        error = nil
        Task {
            let e: String?
            if let carpeta {
                e = await catalogo.editarEtiqueta(carpeta.id, nombre: nombre, colorHex: colorHex)
            } else {
                e = await catalogo.crearEtiqueta(nombre: nombre, colorHex: colorHex)
            }
            trabajando = false
            if let e { error = e } else { dismiss() }
        }
    }
}
