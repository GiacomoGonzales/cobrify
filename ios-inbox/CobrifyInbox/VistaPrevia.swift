#if DEBUG
import SwiftUI
import FirebaseFirestore

/// Vista previa para el simulador, que no puede iniciar sesión:
///
///     xcrun simctl launch <udid> com.cobrify.inbox -vistaPrevia
///
/// abre una conversación inventada, con mensajes y atajos de mentira, para
/// mirar el compositor y las burbujas sin cuenta. Enviar falla (no hay
/// sesión), y está bien: es para mirar, no para mandar. Solo existe en
/// compilaciones Debug; a TestFlight no va.
enum VistaPrevia {
    static let activa = ProcessInfo.processInfo.arguments.contains("-vistaPrevia")

    @MainActor static var pantalla: some View {
        NavigationStack {
            ConversationView(conv: conversacion, alAbrir: {})
        }
        .onAppear { CatalogoStore.shared.respuestasRapidas = atajos }
    }

    static let conversacion = Conversacion(id: "vista-previa", data: [
        "nombre": "Giacomo González",
        "waId": "51955778215",
        "rolContacto": "Dueño",
        "ultimoMensaje": "Cualquier duda me avisas.",
        "ultimoMensajeAt": Timestamp(date: Date()),
    ])

    static var mensajes: [Mensaje] {
        let ahora = Date()
        func m(_ i: Int, _ direccion: String, _ texto: String, estado: String = "read") -> Mensaje {
            Mensaje(id: "vp-\(i)", data: [
                "direccion": direccion, "tipo": "text", "texto": texto, "estado": estado,
                "timestamp": Timestamp(date: ahora.addingTimeInterval(Double(i - 10) * 60)),
            ])
        }
        return [
            m(1, "entrante", "Hola, me pasas info de los planes? https://cobrifyperu.com/planes"),
            m(2, "saliente", """
                Hola! Claro, te cuento qué incluye Cobrify:

                📱 App para Android y iPhone, sincronizada con la web en tiempo real

                🖨️ Conexión con impresoras, ticketeras Bluetooth y escáner de código de barras

                🔎 Prueba el demo aquí (libre y sin registro):
                👉 https://cobrifyperu.com/demorestaurant

                Cualquier duda me avisas. 🙌
                """),
            m(3, "entrante", "Gracias, lo reviso"),
            m(4, "saliente", "El demo es solo visual e informativo. Cuando lo revises, me cuentas qué te pareció.",
              estado: "delivered"),
        ]
    }

    static let atajos: [RespuestaRapida] = [
        ("planes", "Le envío nuestros planes. Cualquier consulta me avisa."),
        ("hola", "Hola! me podría indicar de qué rubro es su negocio?"),
        ("general", "Perfecto! Te cuento qué incluye Cobrify…"),
        ("restaurante", "¡Perfecto! Nuestro sistema está hecho para restaurantes."),
        ("demo", "Prueba el demo aquí: https://cobrifyperu.com/demo"),
        ("precio", "El plan mensual cuesta S/ 19.90."),
        ("gracias", "Gracias por escribirnos, que tenga buen día."),
    ].map { RespuestaRapida(atajo: $0.0, texto: $0.1, media: nil) }
}
#endif
