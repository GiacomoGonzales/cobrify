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

    /// Con `-bandeja` arranca en la lista de chats (para probar carpetas,
    /// filtros y el paso a la conversación); sin él, directo a un chat.
    static let enBandeja = ProcessInfo.processInfo.arguments.contains("-bandeja")

    @MainActor @ViewBuilder static var pantalla: some View {
        if enBandeja {
            ConversationListView()
                .environmentObject(SessionStore())
        } else {
            NavigationStack {
                ConversationView(conv: conversacion, alAbrir: {})
            }
            .onAppear { CatalogoStore.shared.respuestasRapidas = atajos }
        }
    }

    /// Con `-sinCarpetas` la bandeja arranca sin ninguna, para ver el
    /// cartel de "Sin carpetas".
    static var etiquetas: [Etiqueta] {
        ProcessInfo.processInfo.arguments.contains("-sinCarpetas") ? [] : etiquetasDePrueba
    }

    private static let etiquetasDePrueba: [Etiqueta] = [
        Etiqueta(id: "interesados", nombre: "Interesados", colorHex: "#2D7FF9"),
        Etiqueta(id: "pago", nombre: "Pagó — en implementación", colorHex: "#1B6E4A"),
        Etiqueta(id: "seguimiento", nombre: "Seguimiento", colorHex: "#EA7C1C"),
    ]

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
        ].enumerated().map { i, fila in
            let (id, nombre, waId, vence) = fila
            return Conversacion(id: id, data: [
                "nombre": nombre, "waId": waId, "ultimoMensaje": "Gracias!",
                "ventanaVenceAt": vence, "ultimoMensajeAt": Timestamp(date: Date().addingTimeInterval(Double(-i) * 900)),
                "sinLeer": i % 2 == 0 ? i + 1 : 0,
                "etiquetas": [["interesados"], ["pago"], ["interesados", "seguimiento"], [], ["pago"]][i],
            ])
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
        /// Un video de muestra, para ver la vista previa con el play.
        func video(_ i: Int, _ direccion: String, _ nombre: String) -> Mensaje {
            Mensaje(id: "vp-video-\(i)", data: [
                "direccion": direccion, "tipo": "video", "texto": "", "estado": "read",
                "timestamp": Timestamp(date: ahora.addingTimeInterval(Double(i - 10) * 60)),
                "media": ["url": "https://test-videos.co.uk/vids/\(nombre)",
                          "mimeType": "video/mp4", "filename": "muestra.mp4"],
            ])
        }

        // Tandas de fotos, para ver los álbumes de 2, 3 y 5.
        let tandaDeCinco = (0..<5).map { k in
            foto(-30 + k, "saliente", "album\(k)", 900 + k * 40, 1200)
        }
        let tandaDeTres = (0..<3).map { k in
            foto(-24 + k, "entrante", "tres\(k)", 1200, 900)
        }
        let tandaDeDos = (0..<2).map { k in
            foto(-20 + k, "saliente", "dos\(k)", 1000, 1000)
        }
        // Una tanda mezclada: dos fotos y un video, todo en el mismo álbum.
        let tandaMixta = [
            foto(-16, "entrante", "mix0", 1000, 1000),
            video(-15, "entrante", "bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4"),
            foto(-14, "entrante", "mix1", 1000, 1000),
        ]
        return relleno + tandaDeCinco + tandaDeTres + tandaDeDos + tandaMixta + [
            video(-12, "saliente", "jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4"),
            foto(-10, "entrante", "alta", 739, 1600),
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
