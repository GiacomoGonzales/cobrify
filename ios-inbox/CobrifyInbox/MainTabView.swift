import SwiftUI

/// La estructura de la app: 4 pestañas sobre la tab bar flotante de vidrio
/// del sistema (Liquid Glass en iOS 26).
struct MainTabView: View {
    @ObservedObject private var navegacion = Navegacion.shared

    var body: some View {
        // Con `selection`: un aviso tocado desde otra pestaña tiene que poder
        // traerte a Chats (ver `Navegacion.pestana`).
        TabView(selection: $navegacion.pestana) {
            ConversationListView()
                .tabItem { Label("Chats", systemImage: "bubble.left.and.bubble.right.fill") }
                .tag(Navegacion.Pestana.chats)
            ClientesRealesView()
                .tabItem { Label("Clientes", systemImage: "person.2.fill") }
                .tag(Navegacion.Pestana.clientes)
            CampanasRealesView()
                .tabItem { Label("Campañas", systemImage: "megaphone.fill") }
                .tag(Navegacion.Pestana.campanas)
            AjustesView()
                .tabItem { Label("Ajustes", systemImage: "gearshape.fill") }
                .tag(Navegacion.Pestana.ajustes)
        }
        .tabBarQueSeEncoge()
    }
}

/// Fase 8: la lista de negocios vinculados con su ficha.
struct ClientesView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Tus clientes",
                systemImage: "person.2",
                description: Text("Aquí verás los negocios vinculados con su ficha de Cobrify: plan, vencimiento y acciones. Llega en una próxima fase.")
            )
            .navigationTitle("Clientes")
        }
    }
}

/// Fase 7: plantillas y campañas.
struct CampanasView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Campañas",
                systemImage: "megaphone",
                description: Text("Enviar plantillas y campañas a varios clientes desde el teléfono. Llega en una próxima fase.")
            )
            .navigationTitle("Campañas")
        }
    }
}

struct AjustesView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        NavigationStack {
            List {
                Section("Cuenta") {
                    LabeledContent("Correo", value: session.user?.email ?? "—")
                }
                Section("Personalización") {
                    NavigationLink {
                        AparienciaView()
                    } label: {
                        Label("Apariencia del chat", systemImage: "paintbrush")
                    }
                    NavigationLink {
                        RespuestasRapidasConfigView()
                    } label: {
                        Label("Respuestas rápidas", systemImage: "bolt.fill")
                    }
                }
                Section("Notificaciones") {
                    Label {
                        Text("Los avisos de WhatsApp llegan solo a esta app mientras esté instalada.")
                            .font(.callout)
                    } icon: {
                        Image(systemName: "bell.badge.fill").foregroundStyle(.tint)
                    }
                }
                Section {
                    Button("Cerrar sesión", role: .destructive) { session.signOut() }
                }
                Section {
                    LabeledContent("Versión", value: version)
                } footer: {
                    Text("Cobrify Chat — tu bandeja de WhatsApp con la Cloud API.")
                }
            }
            .navigationTitle("Ajustes")
        }
    }

    private var version: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
        return "\(v) (\(b))"
    }
}
