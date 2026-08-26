import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focused: Campo?

    private enum Campo { case email, password }

    private var puedeEntrar: Bool {
        email.contains("@") && password.count >= 6 && !session.isWorking
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
                .padding(.bottom, 12)

            Text("Cobrify Chat")
                .font(.largeTitle.bold())
            Text("Tu bandeja de WhatsApp")
                .foregroundStyle(.secondary)
                .padding(.bottom, 36)

            VStack(spacing: 14) {
                TextField("Correo", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focused = .password }
                    .padding(14)
                    .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))

                SecureField("Contraseña", text: $password)
                    .textContentType(.password)
                    .focused($focused, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { entrar() }
                    .padding(14)
                    .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
            }

            if let error = session.errorMessage {
                Text(error)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.top, 14)
            }

            Button(action: entrar) {
                Group {
                    if session.isWorking {
                        ProgressView().tint(.white)
                    } else {
                        Text("Entrar").fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!puedeEntrar)
            .padding(.top, 22)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, 28)
    }

    private func entrar() {
        guard puedeEntrar else { return }
        focused = nil
        Task { await session.signIn(email: email, password: password) }
    }
}
