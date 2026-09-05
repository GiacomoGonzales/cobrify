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

    /// Conversaciones de mentira para el selector de "Reenviar a…".
    static var conversaciones: [Conversacion] {
        let abierta = Timestamp(date: Date().addingTimeInterval(20 * 3600))
        let cerrada = Timestamp(date: Date().addingTimeInterval(-3600))
        return [
            ("c1", "Pollería El Buen Sabor", "51987654321", abierta),
            ("c2", "Ferretería Lima Norte", "51912345678", abierta),
            ("c3", "Dra. Rojas", "51955500123", cerrada),
            ("c4", "Bodega Don Pepe", "51933322211", abierta),
            ("c5", "Minimarket La Esquina", "51944455566", abierta),
        ].map { id, nombre, waId, vence in
            Conversacion(id: id, data: ["nombre": nombre, "waId": waId, "ultimoMensaje": "Gracias!",
                                        "ventanaVenceAt": vence, "ultimoMensajeAt": Timestamp(date: Date())])
        }
    }

    static var mensajes: [Mensaje] {
        let ahora = Date()
        func m(_ i: Int, _ direccion: String, _ texto: String, estado: String = "read") -> Mensaje {
            Mensaje(id: "vp-\(i)", data: [
                "direccion": direccion, "tipo": "text", "texto": texto, "estado": estado,
                "timestamp": Timestamp(date: ahora.addingTimeInterval(Double(i - 10) * 60)),
            ])
        }
        /// Una foto (de un banco público) con sus medidas, para el visor.
        func foto(_ i: Int, _ direccion: String, _ semilla: String, _ ancho: Int, _ alto: Int, _ texto: String = "") -> Mensaje {
            Mensaje(id: "vp-foto-\(i)", data: [
                "direccion": direccion, "tipo": "image", "texto": texto, "estado": "read",
                "timestamp": Timestamp(date: ahora.addingTimeInterval(Double(i - 10) * 60)),
                "media": ["url": "https://picsum.photos/seed/\(semilla)/\(ancho)/\(alto)",
                          "thumbUrl": "https://picsum.photos/seed/\(semilla)/\(ancho / 4)/\(alto / 4)",
                          "mimeType": "image/jpeg", "ancho": ancho, "alto": alto],
            ])
        }
        // Un buen tramo de charla corta antes: así un impulso fuerte deja la
        // lista deslizándose un rato, y se puede probar la flecha en movimiento.
        let relleno = (0..<30).map { i in
            m(-40 + i, i % 2 == 0 ? "entrante" : "saliente",
              i % 2 == 0 ? "Consulta \(i / 2 + 1): ¿el plan incluye la app del celular?" : "Sí, todos los planes la incluyen.")
        }
        return relleno + [
            foto(-9, "entrante", "local", 900, 1200, "Así quedó el local, ¿qué te parece?"),
            foto(-8, "saliente", "menu", 1200, 800),
            foto(-7, "entrante", "ticket", 800, 800, "El ticket de ayer"),
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
