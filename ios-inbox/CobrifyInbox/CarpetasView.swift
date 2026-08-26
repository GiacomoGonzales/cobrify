import SwiftUI

/// Las carpetas de la bandeja: cada etiqueta del catálogo compartido es una
/// carpeta. Mueves chats adentro (un chat puede estar en varias), los ves
/// separados por etapa y creas carpetas nuevas — la web ve lo mismo.
struct CarpetasView: View {
    @ObservedObject private var inbox: InboxStore
    @ObservedObject private var catalogo = CatalogoStore.shared
    @State private var mostrarNueva = false

    init(inbox: InboxStore) {
        self.inbox = inbox
    }

    var body: some View {
        List {
            Section {
                ForEach(catalogo.etiquetas) { e in
                    NavigationLink(value: RutaCarpeta(etiqueta: e)) {
                        HStack(spacing: 12) {
                            ZStack {
                                Circle().fill(e.color.opacity(0.18))
                                Image(systemName: "folder.fill")
                                    .foregroundStyle(e.color)
                            }
                            .frame(width: 40, height: 40)
                            Text(e.nombre)
                            Spacer()
                            let n = cuantas(e.id)
                            if n > 0 {
                                Text("\(n)")
                                    .font(.callout.weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            } footer: {
                Text("Las carpetas son las mismas etiquetas de la web: mover un chat aquí se refleja allá. Un chat puede estar en varias carpetas.")
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
            NuevaCarpetaSheet()
        }
        .navigationDestination(for: RutaCarpeta.self) { ruta in
            ChatsDeCarpeta(etiqueta: ruta.etiqueta, inbox: inbox)
        }
    }

    private func cuantas(_ id: String) -> Int {
        inbox.conversaciones.filter { $0.etiquetas.contains(id) }.count
    }
}

struct RutaCarpeta: Hashable {
    let etiqueta: Etiqueta
    func hash(into hasher: inout Hasher) { hasher.combine(etiqueta.id) }
    static func == (a: RutaCarpeta, b: RutaCarpeta) -> Bool { a.etiqueta.id == b.etiqueta.id }
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
                    NavigationLink(value: conv.id) {
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
                Text(conv.titulo).lineLimit(1)
                Text(Formato.resumen(conv.ultimoMensaje))
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Text(Formato.hora(conv.ultimoMensajeAt))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

/// Crear una carpeta: nombre + color, al catálogo compartido.
struct NuevaCarpetaSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var catalogo = CatalogoStore.shared
    @State private var nombre = ""
    @State private var colorHex = "#1B6E4A"
    @State private var trabajando = false
    @State private var error: String?

    private let colores = ["#1B6E4A", "#2D7FF9", "#7C3AED", "#EA7C1C", "#DB2777",
                           "#A3352C", "#96690F", "#0E7490", "#6B7280"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Nombre") {
                    TextField("Ej: Pagó — en implementación", text: $nombre)
                }
                Section("Color") {
                    HStack(spacing: 14) {
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
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Nueva carpeta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        crear()
                    } label: {
                        if trabajando { ProgressView() } else { Text("Crear").fontWeight(.semibold) }
                    }
                    .disabled(nombre.trimmingCharacters(in: .whitespaces).isEmpty || trabajando)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func crear() {
        trabajando = true
        error = nil
        Task {
            let e = await catalogo.crearEtiqueta(nombre: nombre, colorHex: colorHex)
            trabajando = false
            if let e { error = e } else { dismiss() }
        }
    }
}
