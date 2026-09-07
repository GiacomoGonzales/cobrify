import SwiftUI

/// La pantalla de arranque.
///
/// Sin esto se veía un parpadeo feo: Firebase tarda un instante en recuperar
/// la sesión guardada, y en ese instante `user` todavía es nil, así que
/// asomaba la pantalla de iniciar sesión antes de entrar a la bandeja.
///
/// Se queda mientras Firebase decide Y un mínimo de tiempo, para que no se
/// vea un fogonazo cuando decide rápido.
struct SplashView: View {
    @State private var entro = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: "#FFFFFF"), Color(hex: "#EAF7F0")],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 18) {
                Image("Logo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 104, height: 104)
                    // El mismo redondeo que le pone iOS al icono en la
                    // pantalla de inicio: se reconoce al instante.
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .shadow(color: .black.opacity(0.12), radius: 18, y: 8)

                VStack(spacing: 4) {
                    Text("Cobrify Chat")
                        .font(.system(size: 26, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color(hex: "#0F2E20"))
                    Text("Tu bandeja de WhatsApp")
                        .font(.footnote)
                        .foregroundStyle(Color(hex: "#0F2E20").opacity(0.55))
                }
            }
            // Solo el bloque del logo se mueve, no la pantalla entera: es
            // una imagen y dos textos, barato de animar.
            .opacity(entro ? 1 : 0)
            .scaleEffect(entro ? 1 : 0.96)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.4)) { entro = true }
        }
    }
}
