import SwiftUI
import FirebaseAuth

/// Fase 0: confirma que la sesión vive. Aquí irá la bandeja (Fase 1).
struct HomeView: View {
    @EnvironmentObject private var session: SessionStore
    let user: User

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 52))
                    .foregroundStyle(.green)
                Text("Hola, \(nombre)")
                    .font(.title2.bold())
                Text("Sesión iniciada. La bandeja de conversaciones llega en la Fase 1.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            .navigationTitle("Cobrify Chat")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Salir", role: .destructive) { session.signOut() }
                }
            }
        }
    }

    private var nombre: String {
        if let n = user.displayName, !n.isEmpty { return n }
        return user.email ?? "usuario"
    }
}
