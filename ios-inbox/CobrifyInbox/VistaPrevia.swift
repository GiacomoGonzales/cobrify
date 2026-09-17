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

    /// `-splash` muestra solo la pantalla de arranque, sin depender de los
    /// tiempos del arranque real.
    static let soloSplash = ProcessInfo.processInfo.arguments.contains("-splash")

    /// `-envioSimulado`: enviar "sale" (al segundo aparece como mensaje propio)
    /// en vez de fallar por no haber sesión. Para probar el compositor de
    /// verdad: que el cuadro quede vacío y no vuelva a llenarse solo.
    static let envioSimulado = ProcessInfo.processInfo.arguments.contains("-envioSimulado")

    /// `-ecoDelTeclado exacto|letra|corregido`: medio segundo después de un
    /// envío mete en el cuadro lo que hace el teclado del iPhone: el mensaje
    /// entero (el compositor lo borra solo), o el mensaje con una palabra
    /// nueva detrás o con la última cambiada (se queda, pero enviarlo pide
    /// confirmación).
    static func ecoDelTeclado(para texto: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-ecoDelTeclado"), i + 1 < args.count else { return nil }
        switch args[i + 1] {
        case "letra": return texto + " X"
        case "corregido": return texto + "s"
        default: return texto
        }
    }

    /// `-ficha` abre la ficha de un cliente de mentira en prueba gratis: para
    /// mirar la fila del RUC con su botón de copiar y "Convertir en cuenta
    /// real" sin sesión.
    static let soloFicha = ProcessInfo.processInfo.arguments.contains("-ficha")

    /// `-grupo`: la hoja de cuentas de una conversación con un vendedor de
    /// Cobrify asignado, para mirar la sección del vendedor y su cartera.
    static let soloGrupo = ProcessInfo.processInfo.arguments.contains("-grupo")

    struct AnfitrionDeGrupo: View {
        @State private var abierta = true
        var body: some View {
            Button("Abrir las cuentas") { abierta = true }
                .sheet(isPresented: $abierta) {
                    GrupoCuentasView(conv: VistaPrevia.conversacionDeVendedor)
                }
        }
    }

    static let vendedores: [VendedorCobrify] = [
        VendedorCobrify(id: "vp-vendedor", nombre: "Carlos Ruiz", telefono: "987654321", activo: true),
        VendedorCobrify(id: "vp-vendedor-2", nombre: "Lucía Paredes", telefono: "912345678", activo: true),
    ]

    static let conversacionDeVendedor = Conversacion(id: "vp-vendedor-chat", data: [
        "nombre": "Carlos Ruiz",
        "waId": "51987654321",
        "ultimoMensaje": "Hola, ¿me pasas el estado de mis clientes?",
        "estado": "abierta",
        "linkedBusinessId": "vp-negocio",
        "vendedorContactoId": "vp-vendedor",
    ])

    static var cuentasDelGrupo: [CuentaResumen] {
        [CuentaResumen(id: "vp-negocio", nombre: "Pollería El Buen Sabor SAC", planName: "Plan Mensual",
                       vence: Date().addingTimeInterval(20 * 86400), accessBlocked: false)]
    }

    /// Una cartera de mentira para `-ficha`: la cuenta "vp-negocio" hace de reseller.
    static func cartera(_ cuentaId: String) -> Cartera? {
        guard cuentaId == "vp-negocio" else { return nil }
        return Cartera(tipo: .reseller, id: cuentaId, nombre: "WIROTECH", cuentas: Cartera.ordenar(cuentasDePrueba))
    }

    static func carteraDeVendedor(_ id: String) -> Cartera? {
        Cartera(tipo: .vendedor, id: id, nombre: "Carlos Ruiz",
                cuentas: Cartera.ordenar(Array(cuentasDePrueba.prefix(5))))
    }

    private static var cuentasDePrueba: [CuentaResumen] {
        func c(_ id: String, _ nombre: String, _ plan: String, _ dias: Double?,
               bloqueada: Bool = false, sinVencimiento: Bool = false) -> CuentaResumen {
            CuentaResumen(id: id, nombre: nombre, planName: plan,
                          vence: dias.map { Date().addingTimeInterval($0 * 86400) },
                          accessBlocked: bloqueada, nuncaVence: sinVencimiento)
        }
        return [
            c("vp-c1", "JTMOTOR SHOW E.I.R.L.", "Plan Semestral", 51),
            c("vp-c2", "Gabriel Ferretería", "Plan Mensual", -3, bloqueada: true),
            c("vp-c3", "Flores Bejar Kevin", "Plan Anual", 210),
            c("vp-c4", "Botica San Martín", "Plan Mensual", 2),
            c("vp-c5", "Agrodistribuciones Dival SAC", "Plan Anual", 287),
            c("vp-c6", "Surco Sotomayor Stephanie", "Plan Anual", 217),
            c("vp-c7", "Minimarket Los Andes", "Plan Mensual", -12),
            c("vp-c8", "Textil Arequipa", "Plan Mensual", 6),
            c("vp-c9", "Óptica Visión Clara", "Plan Semestral", 95),
            c("vp-c10", "Restaurante El Tambo", "Ilimitado", nil, sinVencimiento: true),
        ]
    }

    /// El papel de la conversación en `-ficha`: presenta la ficha como hoja,
    /// igual que la app, para ver que al renovar se cierra todo y se vuelve
    /// acá de una sola vez.
    struct AnfitrionDeFicha: View {
        @State private var abierta = true
        var body: some View {
            VStack(spacing: 12) {
                Text(abierta ? "Conversación" : "De vuelta en la conversación")
                    .font(.headline)
                Button("Abrir la ficha") { abierta = true }
            }
            .sheet(isPresented: $abierta) {
                FichaClienteView(businessId: "vp-negocio", alTerminar: { abierta = false })
            }
        }
    }

    /// La ficha que devuelve `FichaStore` en vista previa, para cualquier
    /// negocio: el simulador no puede leer Firestore sin sesión.
    static func ficha(_ businessId: String) -> FichaCliente? {
        FichaCliente(
            businessId: businessId,
            nombre: "Pollería El Buen Sabor SAC",
            ruc: "20512345678",
            email: "compras@elbuensabor.pe",
            plan: "trial",
            planName: "Prueba gratuita",
            vence: Date().addingTimeInterval(5 * 86400),
            renewalPrice: nil,
            accessBlocked: false,
            monthlyPrice: nil,
            pagos: [],
            tieneRenewalPrice: false,
            comprobantesUsados: 12,
            comprobantesLimite: 50,
            registradoEl: Date().addingTimeInterval(-2 * 86400),
            blockReason: nil,
            blockedAt: nil,
            // Dos RUC cobrados aparte: uno al día y otro vencido, para ver la sección.
            cobroPorRuc: true,
            rucsCobrados: [
                RucCobrado(id: "e1", ruc: "20613113844", nombre: "TISAYO BUSINESS E.I.R.L.", plan: "mensual",
                           planName: "Plan Mensual - 1 Mes", precio: 29.9, meses: 1,
                           vence: Date().addingTimeInterval(30 * 86400), usados: 12),
                RucCobrado(id: "e2", ruc: "20613118862", nombre: "MAROQUI COMPANY E.I.R.L.", plan: "mensual",
                           planName: "Plan Mensual - 1 Mes", precio: 29.9, meses: 1,
                           vence: Date().addingTimeInterval(-2 * 86400), usados: 1000),
            ]
        )
    }

    @MainActor @ViewBuilder static var pantalla: some View {
        if soloSplash {
            SplashView()
        } else if soloFicha {
            AnfitrionDeFicha()
        } else if soloGrupo {
            AnfitrionDeGrupo()
        } else if enBandeja {
            // La app entera: sirve para la bandeja, las carpetas y tambien
            // para Ajustes (apariencia, respuestas rapidas).
            MainTabView()
                .environmentObject(SessionStore())
                .task { await avisoSimulado() }
        } else {
            NavigationStack {
                ConversationView(conv: conversacion, alAbrir: {})
            }
            .onAppear { CatalogoStore.shared.respuestasRapidas = atajos }
        }
    }

    /// `-avisoDe <id>`: arranca en Clientes y a los 4 s hace lo mismo que
    /// tocar un aviso de esa conversación — el caso que dejaba la app sin
    /// barra de pestañas y sin atrás. Existe porque en el simulador el centro
    /// de notificaciones no responde a toques simulados.
    @MainActor static func avisoSimulado() async {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-avisoDe"), i + 1 < args.count else { return }
        Navegacion.shared.pestana = .clientes
        try? await Task.sleep(for: .seconds(4))
        Navegacion.shared.abrirConversacion = args[i + 1]
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
            var data: [String: Any] = [
                "nombre": nombre, "waId": waId, "ultimoMensaje": "Gracias!",
                "ventanaVenceAt": vence, "ultimoMensajeAt": Timestamp(date: Date().addingTimeInterval(Double(-i) * 900)),
                "sinLeer": i % 2 == 0 ? i + 1 : 0,
                "etiquetas": [["interesados"], ["pago"], ["interesados", "seguimiento"], [], ["pago"]][i],
            ]
            // Tres vinculadas a un negocio (clientes) y dos sueltas (leads),
            // para ver el filtro Todos / Clientes / Leads de la bandeja.
            if ["c1", "c2", "c4"].contains(id) {
                data["linkedBusinessId"] = "negocio-\(id)"
                data["linkedBusinessName"] = nombre
            }
            return Conversacion(id: id, data: data)
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

        /// Un PDF, con o sin pie: el caso de la respuesta rápida de los planes.
        func documento(_ i: Int, _ direccion: String, _ url: String, _ nombre: String, _ texto: String = "") -> Mensaje {
            Mensaje(id: "vp-doc-\(i)", data: [
                "direccion": direccion, "tipo": "document", "texto": texto, "estado": "read",
                "timestamp": Timestamp(date: ahora.addingTimeInterval(Double(i - 10) * 60)),
                "media": ["url": url, "mimeType": "application/pdf", "filename": nombre],
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
            m(3, "entrante", "Gracias, lo reviso. Mándame la cotización a compras@elbuensabor.pe por favor"),
            m(4, "saliente", "El demo es solo visual e informativo. Cuando lo revises, me cuentas qué te pareció.",
              estado: "delivered"),
            m(5, "entrante", "La factura a contabilidad@elbuensabor.pe y copia a rosa.diaz@gmail.com"),
            m(6, "entrante", "Mi celular es 987 654 321, llámame después de las 5"),
            // Tres números de formas distintas, y un RUC y un DNI que NO son
            // teléfonos: tienen que quedar como texto.
            m(7, "entrante", "El de mi contador es +51 912-345-678 y el de la tienda 944555666. Mi hermano en Miami: +1 (305) 555-1234. RUC 20512345678, DNI 45678912"),
            documento(8, "entrante", "https://pdfobject.com/pdf/sample.pdf", "Ficha RUC.pdf"),
            documento(9, "saliente", "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                      "Planes Cobrify 2026.pdf", """
                Perfecto! Te cuento qué incluye Cobrify para tu negocio:

                ✅ Boletas, facturas, notas y guías de remisión
                ✅ Datos de cliente automáticos por DNI y RUC
                ✅ Envío por WhatsApp en 1 clic
                """),
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
