import SwiftUI

/// Se muestra mientras el GoogleService-Info.plist siga siendo el de relleno.
struct SetupNeededView: View {
    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "wrench.and.screwdriver")
                .font(.system(size: 48))
                .foregroundStyle(.orange)
            Text("Falta conectar Firebase")
                .font(.title2.bold())
            VStack(alignment: .leading, spacing: 10) {
                Text("1. En la consola de Firebase (cobrify-395fe), agrega una app iOS con el bundle id com.cobrify.inbox.")
                Text("2. Descarga el GoogleService-Info.plist.")
                Text("3. Reemplaza el archivo de relleno en ios-inbox/CobrifyInbox/ y recompila.")
            }
            .font(.callout)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 32)
        }
    }
}
