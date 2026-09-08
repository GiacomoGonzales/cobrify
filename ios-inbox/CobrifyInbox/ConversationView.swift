import SwiftUI
import PhotosUI
import AVFoundation
import UIKit

/// Una conversación, leída en vivo. Fase 1: solo lectura — responder
/// llega en la Fase 2.
struct ConversationView: View {
    let conv: Conversacion
    let alAbrir: () -> Void
    @StateObject private var store = MensajesStore()
    @State private var borrador = ""
    @State private var errorEnvio: String?
    @State private var mostrarGaleria = false
    @State private var fotoSeleccionada: PhotosPickerItem?
    @State private var mostrarCamara = false
    @State private var mostrarArchivos = false
    @StateObject private var grabadora = GrabadoraNota()
    @ObservedObject private var catalogo = CatalogoStore.shared
    @State private var mostrarNota = false
    @State private var notaBorrador = ""
    @State private var mostrarRapidas = false
    @State private var estadoLocal: String?
    @State private var etiquetasLocal: Set<String>?
    @State private var mostrarPlantilla = false
    @State private var mostrarFicha = false
    @State private var respondiendoA: Mensaje?
    @State private var lejosDelFondo = false
    /// El UIScrollView de debajo, para frenar la inercia antes de saltar.
    @State private var espia = EspiaDeScroll()
    /// La primera tanda de mensajes todavía no llega. Solo sirve para no
    /// mover el scroll al abrir; nunca para esconder la conversación.
    @State private var primeraCarga = true
    /// Archivo de una respuesta rápida que espera en el compositor: sale
    /// recién al tocar enviar, con lo que haya en el cuadro como pie.
    @State private var mediaPendiente: MediaBiblioteca?
    @FocusState private var cuadroEnfocado: Bool
    @State private var mostrarVincular = false
    @State private var mostrarAlta = false
    @State private var mostrarBuscar = false
    @State private var mostrarArchivosDelChat = false
    /// La foto abierta en el visor (por id de mensaje): el visor vive aquí,
    /// no en la burbuja, para poder pasar a las demás fotos del chat.
    @State private var fotoAbierta: FotoAbierta?
    /// El video que se está viendo (desde un álbum). Los sueltos abren su
    /// propio visor dentro de la burbuja.
    @State private var videoAbierto: Mensaje?
    @State private var mostrarApariencia = false
    /// Mensaje al que hay que saltar cuando se cierra una hoja. Se guarda en vez
    /// de saltar desde dentro: mientras la hoja se va, el scroll de abajo no
    /// esta listo para recibir la orden.
    @State private var saltarA: String?
    /// Para saber sobre qué fondo cae el título de la cabecera.
    @ObservedObject private var apariencia = Apariencia.shared
    @Environment(\.colorScheme) private var esquema

    var body: some View {
      VStack(spacing: 0) {
        ScrollViewReader { proxy in
          ZStack(alignment: .bottomTrailing) {
            ScrollView {
                // VStack y no LazyVStack: con la perezosa, SwiftUI no conoce
                // el alto de las burbujas que aún no midió —y aquí son muy
                // altas—, así que el salto al final caía siempre aproximado y
                // reintentarlo perseguía un blanco móvil. Con la pila normal
                // todos los altos se saben de entrada (las fotos ya reservan
                // su tamaño con las medidas del servidor) y el final se acierta
                // a la primera. Por eso la ventana de mensajes es corta.
                VStack(spacing: 3) {
                    ForEach(elementos) { elemento in
                        switch elemento {
                        case .separador(let id, let titulo):
                            Text(titulo)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(.quaternary.opacity(0.5), in: Capsule())
                                .padding(.vertical, 6)
                                .id(id)
                        case .mensaje(let m, let cambiaDeLado):
                            burbuja(m, proxy: proxy)
                                .padding(.top, cambiaDeLado ? 10 : 0)
                                .id(m.id)
                        case .album(let fotos, let cambiaDeLado):
                            album(fotos)
                                .padding(.top, cambiaDeLado ? 10 : 0)
                                .id(fotos[0].id)
                        }
                    }
                    // Ancla del final. Saltar "al último mensaje" fallaba
                    // cuando ese mensaje era larguísimo (alineaba su inicio,
                    // no el fondo real de la conversación). Una marca de 1pt
                    // al final siempre cae donde debe.
                    Color.clear
                        .frame(height: 1)
                        .id(Self.anclaFinal)
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)
                // Un respiro antes del compositor: sin esto la última burbuja
                // queda pegada al cuadro de escribir. Y tiene que ser al menos
                // lo que mide la banda que desvanece (`bandaAbajo`), o el
                // último mensaje se vería siempre medio apagado aun estando
                // quieto. Bajó de 18 a 13 junto con la banda, para que el
                // desvanecido quede pegado al campo de texto.
                .padding(.bottom, 13)
                .background(SondaDeScroll(espia: espia))
            }
            // El texto se DESVANECE al meterse detrás de la cabecera y del
            // compositor, en vez de cortarse en seco. Es una máscara sobre el
            // contenido —las letras se vuelven transparentes y dejan ver el
            // fondo—, no un velo encima: un velo de color solo se nota si el
            // fondo es claro, y sobre un fondo oscuro no hacía nada.
            .mask(mascaraDeBordes)
            // Y sin el bloque de vidrio que iOS 26 pega bajo la cabecera.
            .sinEfectoDeBorde()
            // OJO: aquí NO va `defaultScrollAnchor(.bottom)`. Reajusta el
            // desplazamiento cada vez que cambia el alto del contenido, eso
            // cambia qué filas hay que medir, lo que vuelve a cambiar el alto…
            // y el hilo principal se queda girando en `placeSubviews`. Se veía
            // como la pantalla congelada al entrar a un chat. El final se fija
            // a mano, saltando a la marca `anclaFinal`.
            // Al subir por la conversación aparece la flecha para volver al
            // final, como WhatsApp.
            .alMoverseLaLista { distancia in
                espia.distanciaAlFondo = distancia
                let lejos = distancia > 260
                // Mientras la lista viaja al final por orden nuestra, los
                // avisos intermedios (todavía lejos) no la vuelven a encender.
                guard lejos != lejosDelFondo, !espia.viajando else { return }
                withAnimation(.easeOut(duration: 0.18)) { lejosDelFondo = lejos }
            }
            // Arrastrar hacia abajo va cerrando el teclado, como WhatsApp.
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: store.mensajes.count + store.pendientes.count) {
                if primeraCarga {
                    primeraCarga = false
                    // Al final SIN animar: es instantáneo, así que no se ve
                    // el barrido que molestaba. Antes esto se hacía tras
                    // esconder la lista con opacity, y si este aviso no
                    // llegaba —al volver a entrar a un chat ya visto— la
                    // conversación se quedaba en blanco para siempre.
                    bajarAlFinal(proxy, animado: false)
                    // Una sola reafirmación por si algún alto cambia al
                    // terminar de cargar. Sin animar: no se ve, solo coloca.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                        bajarAlFinal(proxy, animado: false)
                    }
                    return
                }
                // Un mensaje nuevo que llega mientras lee más arriba no le
                // mueve la lista bajo los dedos.
                guard !lejosDelFondo else { return }
                bajarAlFinal(proxy)
            }
            // Volver de "Buscar en el chat" o de "Fotos y archivos" salta al
            // mensaje elegido. Va aquí y no junto a las hojas porque el proxy
            // del scroll solo existe dentro de este bloque.
            .onChange(of: saltarA) { saltarAlElegido(proxy) }
            // Al abrir el teclado, la conversación sube sola y lo último
            // queda a la vista — sin tener que hacer scroll a mano.
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in
                bajarAlFinal(proxy)
            }

            // Fuera del ScrollView, no encima de él: dentro, el primer toque
            // mientras la lista corre lo consume el propio scroll para
            // frenarse y el botón nunca se entera. Aquí responde al toque
            // aunque venga deslizándose, como WhatsApp.
            if lejosDelFondo {
                Button {
                    bajarAlFinal(proxy)
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.primary.opacity(0.6))
                        .frame(width: 38, height: 38)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .vidrioCapsula()
                .overlay(Circle().stroke(Color(.systemGray4), lineWidth: 0.5))
                .padding(.trailing, 14)
                .padding(.bottom, 10)
                .transition(.scale.combined(with: .opacity))
            }
          }
        }
      }
        .background(Apariencia.shared.fondoView())
        // El compositor se lleva su propio sitio y la lista termina justo en
        // su borde de arriba. Ahí es donde la máscara desvanece el texto, así
        // que se disuelve al llegar en vez de cortarse en seco.
        .safeAreaInset(edge: .bottom) { barraDeRespuesta }
        .navigationTitle(conv.titulo)
        .navigationBarTitleDisplayMode(.inline)
        // La cabecera NO pinta nada: se ve el fondo del chat de arriba abajo.
        // Por defecto iOS le mete una capa gris en cuanto el hilo se mueve, y
        // sobre una foto eso se lee como un bloque pegado arriba.
        .toolbarBackground(.hidden, for: .navigationBar)
        // Y como no pinta nada, el título cae sobre el fondo del chat: su
        // color lo decide el FONDO, no el modo del sistema. Con una foto de
        // noche en modo claro, el negro de siempre no se lee.
        .toolbarColorScheme(apariencia.luminanciaArriba(esquema) < 0.45 ? .dark : .light,
                            for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                // El estado vive aquí, chiquito, en vez de una franja naranja
                // sobre el teclado. TimelineView lo mantiene al día solo.
                TimelineView(.periodic(from: .now, by: 60)) { _ in
                    VStack(spacing: 0) {
                        Text(conv.titulo).font(.headline).lineLimit(1)
                        HStack(spacing: 4) {
                            if let punto = colorEstado {
                                Circle().fill(punto).frame(width: 5, height: 5)
                            }
                            Text(subtituloCabecera)
                        }
                        .font(.caption2)
                        .foregroundStyle(colorEstado ?? .secondary)
                    }
                }
            }
            if conv.linkedBusinessId != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        mostrarFicha = true
                    } label: {
                        Image(systemName: "person.text.rectangle")
                    }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Estado", selection: Binding(
                        get: { estadoLocal ?? conv.estado },
                        set: { nuevo in
                            estadoLocal = nuevo
                            catalogo.cambiarEstado(conv.id, a: nuevo)
                        }
                    )) {
                        ForEach(CatalogoStore.ESTADOS, id: \.id) { e in
                            Label(e.nombre, systemImage: e.icono).tag(e.id)
                        }
                    }
                    if !catalogo.etiquetas.isEmpty {
                        Menu("Etiquetas") {
                            ForEach(catalogo.etiquetas) { e in
                                Button {
                                    let tiene = etiquetasActuales.contains(e.id)
                                    var set = etiquetasActuales
                                    if tiene { set.remove(e.id) } else { set.insert(e.id) }
                                    etiquetasLocal = set
                                    catalogo.alternarEtiqueta(conv.id, tagId: e.id, tiene: tiene)
                                } label: {
                                    if etiquetasActuales.contains(e.id) {
                                        Label(e.nombre, systemImage: "checkmark")
                                    } else {
                                        Text(e.nombre)
                                    }
                                }
                            }
                        }
                    }
                    Button {
                        notaBorrador = conv.nota ?? ""
                        mostrarNota = true
                    } label: {
                        Label(conv.nota == nil ? "Agregar nota interna" : "Ver nota interna", systemImage: "note.text")
                    }
                    Divider()
                    Button {
                        mostrarBuscar = true
                    } label: {
                        Label("Buscar en el chat", systemImage: "magnifyingglass")
                    }
                    Button {
                        mostrarArchivosDelChat = true
                    } label: {
                        Label("Fotos y archivos", systemImage: "photo.on.rectangle")
                    }
                    // Aqui tambien, no solo en Ajustes: es donde lo tiene
                    // WhatsApp y donde se busca.
                    Button {
                        mostrarApariencia = true
                    } label: {
                        Label("Fondo del chat", systemImage: "paintbrush")
                    }
                    Divider()
                    if conv.linkedBusinessId != nil {
                        Button {
                            mostrarFicha = true
                        } label: {
                            Label("Ficha del cliente", systemImage: "person.text.rectangle")
                        }
                        Button(role: .destructive) {
                            BuscadorNegocios.desvincular(conversationId: conv.id)
                        } label: {
                            Label("Desvincular negocio", systemImage: "link.badge.minus")
                        }
                    } else {
                        // Un lead que acaba de pagar: se le manda el formulario
                        // para que se cree la cuenta el mismo. Solo aparece sin
                        // negocio vinculado, que es cuando tiene sentido.
                        Button {
                            mostrarAlta = true
                        } label: {
                            Label("Enviar formulario de alta", systemImage: "person.badge.plus")
                        }
                        Button {
                            mostrarVincular = true
                        } label: {
                            Label("Vincular a un negocio", systemImage: "link")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $mostrarBuscar) {
            BuscarEnChatSheet(mensajes: store.mensajes,
                              nombreContacto: conv.titulo,
                              alElegir: { saltarA = $0 })
        }
        .sheet(isPresented: $mostrarArchivosDelChat) {
            ArchivosDelChatSheet(mensajes: store.mensajes,
                                 alElegir: { saltarA = $0 })
        }
        .sheet(isPresented: $mostrarNota) {
            NavigationStack {
                TextEditor(text: $notaBorrador)
                    .padding(12)
                    .navigationTitle("Nota interna")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Cancelar") { mostrarNota = false }
                        }
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Guardar") {
                                catalogo.guardarNota(conv.id, nota: notaBorrador)
                                mostrarNota = false
                            }
                            .fontWeight(.semibold)
                        }
                    }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $mostrarFicha) {
            if conv.linkedBusinessId != nil {
                GrupoCuentasView(conv: conv)
            }
        }
        .sheet(isPresented: $mostrarVincular) {
            VincularSheet(conversationId: conv.id)
        }
        .sheet(isPresented: $mostrarAlta) {
            // El mensaje cae en el compositor, no sale solo: a un cliente que
            // acaba de pagar no conviene mandarle nada a ciegas.
            EnviarAltaSheet(conv: conv) { mensaje in
                borrador = mensaje
                cuadroEnfocado = true
            }
        }
        .sheet(isPresented: $mostrarApariencia) {
            NavigationStack {
                AparienciaView()
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Listo") { mostrarApariencia = false }
                        }
                    }
            }
        }
        .fullScreenCover(item: $videoAbierto) { v in
            VisorAdjunto(url: v.media?.url ?? "", filename: v.media?.filename)
        }
        .fullScreenCover(item: $fotoAbierta) { f in
            let fotos = fotosDelHilo
            VisorFotos(fotos: fotos,
                       indiceInicial: fotos.firstIndex { $0.id == f.id } ?? 0,
                       nombreContacto: conv.titulo,
                       conversationId: conv.id)
        }
        .sheet(isPresented: $mostrarPlantilla) {
            EnviarPlantillaSheet(conversationId: conv.id)
        }
        .sheet(isPresented: $mostrarRapidas) {
            RespuestasRapidasSheet { rapida in
                mostrarRapidas = false
                usarRapida(rapida)
            }
            .presentationDetents([.medium, .large])
        }
        .photosPicker(isPresented: $mostrarGaleria, selection: $fotoSeleccionada, matching: .images)
        .onChange(of: fotoSeleccionada) {
            guard let item = fotoSeleccionada else { return }
            fotoSeleccionada = nil
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    enviarFoto(img)
                }
            }
        }
        .fullScreenCover(isPresented: $mostrarCamara) {
            CamaraPicker { img in enviarFoto(img) }
                .ignoresSafeArea()
        }
        .fileImporter(isPresented: $mostrarArchivos, allowedContentTypes: [.pdf]) { resultado in
            guard case .success(let url) = resultado else { return }
            let accedio = url.startAccessingSecurityScopedResource()
            defer { if accedio { url.stopAccessingSecurityScopedResource() } }
            guard let datos = try? Data(contentsOf: url) else {
                errorEnvio = "No se pudo leer el archivo."
                return
            }
            guard datos.count <= 100 * 1024 * 1024 else {
                errorEnvio = "El límite de WhatsApp para documentos es 100 MB."
                return
            }
            enviarAdjunto(datos: datos, mimeType: "application/pdf",
                          filename: url.lastPathComponent, tipo: "document")
        }
        .onAppear {
            store.empezar(conversationId: conv.id)
            alAbrir()
            Navegacion.shared.conversacionVisible = conv.id
        }
        .onChange(of: store.mensajes.last?.id) {
            avisarLeido()
        }
        .onDisappear {
            store.parar()
            if Navegacion.shared.conversacionVisible == conv.id {
                Navegacion.shared.conversacionVisible = nil
            }
        }
    }

    /// Arma la burbuja de un mensaje. Vive fuera del cuerpo porque el
    /// compilador no lograba inferir tipos con todo junto en el ForEach.
    @ViewBuilder
    private func burbuja(_ m: Mensaje, proxy: ScrollViewProxy) -> some View {
        let citado: Mensaje? = m.respondeA.flatMap { id in
            store.mensajes.first { $0.id == id }
        }
        BurbujaMensaje(
            mensaje: m,
            citado: citado,
            nombreContacto: conv.titulo,
            alResponder: { respondiendoA = m },
            alReaccionar: { emoji in reaccionar(m, emoji) },
            alTocarCita: {
                // Tocar la cita lleva al mensaje original, como WhatsApp.
                if let id = m.respondeA {
                    withAnimation { proxy.scrollTo(id, anchor: .center) }
                }
            },
            alAbrirFoto: { fotoAbierta = FotoAbierta(id: m.id) },
            previaLocal: store.previasLocales[m.id]
        )
    }

    /// Todas las fotos del hilo, en orden: por ellas pasea el visor.
    private var fotosDelHilo: [Mensaje] {
        store.mensajes.filter { $0.tipo == "image" && $0.media?.url != nil }
    }

    /// La burbuja de un álbum. Fuera del cuerpo por lo mismo que `burbuja`:
    /// con todo junto en el ForEach el compilador se rinde.
    private func album(_ fotos: [Mensaje]) -> some View {
        BurbujaAlbum(fotos: fotos) { m in
            if m.tipo == "video" { videoAbierto = m } else { fotoAbierta = FotoAbierta(id: m.id) }
        }
    }

    /// Salta al mensaje que se eligió en una hoja.
    ///
    /// Con un respiro: si se salta mientras la hoja se está yendo, el destino
    /// queda tapado por la animación y parece que no pasó nada.
    private func saltarAlElegido(_ proxy: ScrollViewProxy) {
        guard let id = saltarA else { return }
        // Una foto dentro de un álbum no tiene fila propia: la fila es el
        // álbum entero, y lleva el id de su primera foto. Sin esto, buscar
        // una de esas fotos no saltaba a ningún lado.
        let destino = idDeLaFila(id)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            withAnimation { proxy.scrollTo(destino, anchor: .center) }
            saltarA = nil
        }
    }

    /// El id de la fila que contiene ese mensaje (él mismo, o su álbum).
    private func idDeLaFila(_ id: String) -> String {
        for e in elementos {
            if case .album(let fotos, _) = e, fotos.contains(where: { $0.id == id }) {
                return fotos[0].id
            }
        }
        return id
    }

    private static let anclaFinal = "fin-de-la-conversacion"

    private func bajarAlFinal(_ proxy: ScrollViewProxy, animado: Bool = true) {
        guard !store.mensajes.isEmpty || !store.pendientes.isEmpty else { return }
        // Si la llevamos nosotros al final, ya estamos al final: la flecha se
        // apaga aquí. Esperar al aviso de geometría dejaba el botón encendido
        // cuando el contenido terminaba de asentarse sin más movimiento.
        if lejosDelFondo { withAnimation(.easeOut(duration: 0.18)) { lejosDelFondo = false } }
        if animado {
            // Primero frenar la inercia: con la lista deslizándose, el salto
            // se perdía en la desaceleración y la flecha se apagaba sin haber
            // llegado a ningún lado.
            espia.frenar()
            espia.viajando = true
            withAnimation { proxy.scrollTo(Self.anclaFinal, anchor: .bottom) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                espia.viajando = false
                // Si aun así no llegó, la flecha vuelve en vez de quedarse
                // apagada con la lista a mitad de camino.
                if espia.distanciaAlFondo > 260 {
                    withAnimation(.easeOut(duration: 0.18)) { lejosDelFondo = true }
                }
            }
        } else {
            proxy.scrollTo(Self.anclaFinal, anchor: .bottom)
        }
    }

    /// Mensajes con su separador de día intercalado, y las fotos mandadas de
    /// una vez juntas en un álbum.
    private var elementos: [ElementoChat] {
        var resultado: [ElementoChat] = []
        var diaAnterior: DateComponents?
        var direccionAnterior: String?
        let todos = store.mensajes + store.pendientes
        var i = 0

        while i < todos.count {
            let m = todos[i]
            if let fecha = m.timestamp {
                let dia = Calendar.current.dateComponents([.year, .month, .day], from: fecha)
                if dia != diaAnterior {
                    resultado.append(.separador(id: "sep-\(m.id)", titulo: Formato.dia(fecha)))
                    diaAnterior = dia
                    direccionAnterior = nil  // el separador ya da el respiro
                }
            }
            // El respiro de WhatsApp: cuando cambia quién habla, aire extra.
            let cambia = direccionAnterior != nil && direccionAnterior != m.direccion

            // ¿Empieza aquí una tanda de fotos?
            var fin = i
            while fin + 1 < todos.count, vanJuntas(todos[fin], todos[fin + 1]) { fin += 1 }

            if fin > i {
                resultado.append(.album(Array(todos[i...fin]), cambiaDeLado: cambia))
            } else {
                resultado.append(.mensaje(m, cambiaDeLado: cambia))
            }
            direccionAnterior = m.direccion
            i = fin + 1
        }
        return resultado
    }

    /// Cuándo dos fotos seguidas son "la misma tanda".
    ///
    /// Se agrupan solo las que no pierden nada al juntarse: sin pie de foto,
    /// sin cita, sin reacción y ya enviadas. Una foto con texto se queda sola
    /// —si no, su texto desaparecería—, y las que todavía están subiendo
    /// también, para ver el progreso de cada una.
    private func vanJuntas(_ a: Mensaje, _ b: Mensaje) -> Bool {
        guard agrupable(a), agrupable(b), a.direccion == b.direccion else { return false }
        guard let ta = a.timestamp, let tb = b.timestamp else { return false }
        // Cinco minutos: lo que tarda alguien en elegir y mandar varias fotos.
        guard abs(tb.timeIntervalSince(ta)) <= 5 * 60 else { return false }
        return Calendar.current.isDate(ta, inSameDayAs: tb)
    }

    private func agrupable(_ m: Mensaje) -> Bool {
        (m.tipo == "image" || m.tipo == "video")
            && m.media?.url != nil
            && m.texto.isEmpty
            && m.respondeA == nil
            && m.reaccionMia == nil
            && m.reaccionCliente == nil
            && m.estado != "sending"
    }

    // MARK: - Responder

    /// Bajo el nombre: el número cuando todo está tranquilo, y el estado de
    /// la ventana cuando importa. WhatsApp no entrega "en línea" ni "última
    /// vez" por la Cloud API, así que lo útil que sí sabemos es cuándo
    /// escribió el cliente por última vez.
    private var subtituloCabecera: String {
        guard let vence = venceVentana else { return conv.rolContacto ?? Formato.numero(conv.waId) }
        let restante = vence.timeIntervalSinceNow
        if restante <= 0 {
            if let ultimo = store.mensajes.last(where: { !$0.esSaliente })?.timestamp {
                return "Escribió \(Formato.haceCuanto(ultimo))"
            }
            return "Ventana cerrada"
        }
        if restante < 3 * 3600 {
            return "Cierra en \(Formato.restante(hasta: vence))"
        }
        return conv.rolContacto ?? Formato.numero(conv.waId)
    }

    /// Sin color mientras no haya nada que avisar.
    private var colorEstado: Color? {
        guard let vence = venceVentana else { return nil }
        let restante = vence.timeIntervalSinceNow
        if restante <= 0 { return Color(.systemGray) }
        if restante < 3 * 3600 { return .orange }
        return nil
    }

    /// Vencimiento VIVO de la ventana de 24 h: desde el último mensaje del
    /// cliente ya cargado (si el cliente escribe, se extiende sola); si aún
    /// no hay mensajes, lo que diga la conversación.
    private var venceVentana: Date? {
        if let ultimoEntrante = store.mensajes.last(where: { !$0.esSaliente })?.timestamp {
            return ultimoEntrante.addingTimeInterval(24 * 3600)
        }
        return conv.ventanaVenceAt
    }

    @ViewBuilder private var barraDeRespuesta: some View {
        TimelineView(.periodic(from: .now, by: 60)) { _ in
            VStack(spacing: 0) {
                if let errorEnvio {
                    Text(errorEnvio)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .vidrioCapsula()
                        .padding(.bottom, 4)
                }
                if let vence = venceVentana, vence.timeIntervalSinceNow <= 0 {
                    // Ventana cerrada: WhatsApp ya no acepta texto libre.
                    VStack(spacing: 8) {
                        Label("La ventana de 24 horas se cerró", systemImage: "clock.badge.exclamationmark")
                            .font(.footnote.weight(.medium))
                        Text("Se reabre sola cuando el cliente escriba.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button {
                            mostrarPlantilla = true
                        } label: {
                            Label("Enviar plantilla", systemImage: "doc.text")
                                .font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(14)
                    .vidrioRedondeado(22)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
                } else {
                    if grabadora.grabando {
                        // Grabando nota de voz
                        HStack(spacing: 12) {
                            Circle().fill(.red).frame(width: 10, height: 10)
                                .opacity(grabadora.segundos % 2 == 0 ? 1 : 0.3)
                            Text(grabadora.tiempo)
                                .font(.body.monospacedDigit())
                            Spacer()
                            Button("Cancelar", role: .destructive) { grabadora.cancelar() }
                            Button {
                                enviarNotaDeVoz()
                            } label: {
                                Image(systemName: "arrow.up")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .frame(width: 40, height: 40)
                                    .background(.tint, in: Circle())
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .vidrioCapsula()
                        .padding(.horizontal, 12)
                        .padding(.bottom, 6)
                    } else {
                    if !sugerenciasSlash.isEmpty {
                        // Escribir "/" abre los atajos, como WhatsApp Business.
                        PanelAtajos(atajos: sugerenciasSlash, alElegir: elegirSugerencia)
                            .padding(.horizontal, 12)
                            .padding(.bottom, 2)
                    }
                    if let m = mediaPendiente {
                        HStack(spacing: 10) {
                            Image(systemName: m.icono)
                                .foregroundStyle(.tint)
                                .frame(width: 22)
                            Text(m.nombreLegible)
                                .font(.caption.weight(.medium))
                            Text("se envía con este mensaje")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Button {
                                mediaPendiente = nil
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .vidrioRedondeado(16)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 2)
                    }
                    if let citado = respondiendoA {
                        HStack(spacing: 10) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(.tint)
                                .frame(width: 3, height: 34)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(citado.esSaliente ? "Tú" : conv.titulo)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.tint)
                                ResumenCita(mensaje: citado, lineas: 1)
                            }
                            Spacer()
                            Button {
                                respondiendoA = nil
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .vidrioRedondeado(16)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 2)
                    }
                    HStack(alignment: .bottom, spacing: 8) {
                        Menu {
                            Button { mostrarGaleria = true } label: { Label("Foto de la galería", systemImage: "photo.on.rectangle") }
                            Button { mostrarCamara = true } label: { Label("Tomar foto", systemImage: "camera") }
                            Button { mostrarArchivos = true } label: { Label("Documento PDF", systemImage: "doc") }
                            if !catalogo.respuestasRapidas.isEmpty {
                                Button { mostrarRapidas = true } label: { Label("Respuesta rápida", systemImage: "bolt.fill") }
                            }
                        } label: {
                            Image(systemName: "plus")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(Color.primary.opacity(0.6))
                                .frame(width: 40, height: 40)
                        }
                        .vidrioCapsula()

                        TextField("Mensaje", text: $borrador, axis: .vertical)
                            .lineLimit(1...5)
                            .focused($cuadroEnfocado)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            // Radio fijo y no cápsula: con una línea se ve
                            // igual, pero al crecer a varias la cápsula se
                            // volvía medio círculo y lo que hubiera dentro
                            // (la selección del texto) asomaba por fuera de
                            // las esquinas.
                            .vidrioRedondeado(20)

                        if puedeEnviar {
                            Button(action: enviar) {
                                Image(systemName: "arrow.up")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .frame(width: 40, height: 40)
                                    .background(.tint, in: Circle())
                            }
                        } else {
                            Button {
                                Task { _ = await grabadora.empezar() }
                            } label: {
                                Image(systemName: "mic.fill")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(Color.primary.opacity(0.6))
                                    .frame(width: 40, height: 40)
                            }
                            .vidrioCapsula()
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
                    }
                }
            }
            // Cero aire encima: ese padding es parte del compositor, o sea
            // alto que se le quita a la conversación. En cero, el borde de la
            // lista —donde el texto acaba de desvanecerse— coincide exacto con
            // el borde de arriba de la cápsula de escribir.
            // El compositor NO pinta nada detrás: el fondo del chat se ve
            // limpio de arriba abajo.
        }
    }

    /// La máscara que desvanece el hilo por arriba y por abajo.
    ///
    /// La lista ya termina exactamente en el borde de la cabecera y en el del
    /// compositor —eso lo pone el sistema—, así que basta con desvanecer sus
    /// dos extremos: el texto se disuelve justo al tocarlos, no a media
    /// pantalla. Y como se desvanece el CONTENIDO en vez de pintar un velo
    /// encima, funciona igual con fondo claro, oscuro o una foto.
    private var mascaraDeBordes: some View {
        // Las dos bandas NO miden igual. Arriba hay que empezar a desvanecer
        // antes, porque bajo la cabecera translúcida el texto se lee un rato
        // más y queda sucio. Abajo el cuadro de escribir es opaco y tapa de
        // golpe, así que una banda corta pega el desvanecido al borde: con 14
        // se notaba el corte demasiado arriba del campo de texto.
        let bandaArriba: CGFloat = 14
        let bandaAbajo: CGFloat = 10
        return VStack(spacing: 0) {
            // Aparece justo al salir de la cabecera…
            LinearGradient(colors: [.black.opacity(0), .black],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: bandaArriba)
            // …en medio se ve todo…
            Rectangle().fill(.black)
            // …y se desvanece justo al meterse en el cuadro de escribir.
            LinearGradient(colors: [.black, .black.opacity(0)],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: bandaAbajo)
        }
    }

    /// Reaccionar (tocar el mismo emoji la quita). El servidor actualiza el
    /// mensaje y la pantalla lo ve llegar por la suscripción.
    private func reaccionar(_ m: Mensaje, _ emoji: String) {
        Task { await store.reaccionar(conversationId: conv.id, mensaje: m, emoji: emoji) }
    }

    /// Palomitas azules para el cliente: se marca leído el último entrante.
    private func avisarLeido() {
        guard let ultimoEntrante = store.mensajes.last(where: { !$0.esSaliente }) else { return }
        Task { await ChatAPI.marcarLeidoWhatsApp(conversationId: conv.id, waMessageId: ultimoEntrante.id) }
    }

    /// Los atajos que calzan con lo escrito tras el "/" (vacío = todos).
    private var sugerenciasSlash: [RespuestaRapida] {
        guard borrador.hasPrefix("/") else { return [] }
        let q = borrador.dropFirst().lowercased()
        let todas = catalogo.respuestasRapidas
        guard !q.isEmpty else { return todas }
        return todas.filter { $0.atajo.lowercased().hasPrefix(q) }
    }

    private func elegirSugerencia(_ r: RespuestaRapida) {
        borrador = ""
        usarRapida(r)  // texto -> al borrador para retocar; adjunto -> sale directo
    }

    private var puedeEnviar: Bool {
        mediaPendiente != nil
            || !borrador.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// La foto sale recomprimida (tope 2048 px, JPEG 80%): una foto de cámara
    /// de 5 MB baja a menos de 1 MB sin que se note en el chat.
    private func enviarFoto(_ imagen: UIImage) {
        let maxLado: CGFloat = 2048
        let escala = min(1, maxLado / max(imagen.size.width, imagen.size.height))
        let tamano = CGSize(width: imagen.size.width * escala, height: imagen.size.height * escala)
        // scale 1: sin esto el renderer usa la escala de la pantalla (3x) y la
        // "foto de 2048" sale de 6144 px reales — y revienta el límite de 5 MB.
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        let r = UIGraphicsImageRenderer(size: tamano, format: formato)
        let reducida = r.image { _ in imagen.draw(in: CGRect(origin: .zero, size: tamano)) }
        guard let datos = reducida.jpegData(compressionQuality: 0.8) else {
            errorEnvio = "No se pudo procesar la foto."
            return
        }
        guard datos.count <= 5 * 1024 * 1024 else {
            errorEnvio = "El límite de WhatsApp para fotos es 5 MB."
            return
        }
        enviarAdjunto(datos: datos, mimeType: "image/jpeg", filename: "foto.jpg", tipo: "image")
    }

    private func enviarNotaDeVoz() {
        guard let url = grabadora.terminar(),
              let datos = try? Data(contentsOf: url) else {
            errorEnvio = "No se pudo grabar la nota."
            return
        }
        guard datos.count <= 16 * 1024 * 1024 else {
            errorEnvio = "El límite de WhatsApp para audios es 16 MB."
            return
        }
        enviarAdjunto(datos: datos, mimeType: "audio/mp4",
                      filename: url.lastPathComponent, tipo: "audio")
    }

    private func enviarAdjunto(datos: Data, mimeType: String, filename: String, tipo: String) {
        errorEnvio = nil
        // Tampoco bloquea: la foto se ve en su burbuja mientras sube.
        Task {
            let error = await store.enviarMedia(conversationId: conv.id, datos: datos,
                                                mimeType: mimeType, filename: filename,
                                                caption: "", tipo: tipo)
            if let error { errorEnvio = error }
        }
    }

    private var etiquetasActuales: Set<String> {
        etiquetasLocal ?? Set(conv.etiquetas)
    }

    /// La respuesta rápida cae SIEMPRE en el cuadro (con su archivo esperando
    /// al lado, si lo lleva), con el cursor al final, como WhatsApp Business:
    /// se retoca o se manda tal cual. Antes quedaba toda seleccionada para
    /// poder escribir encima, y ese sombreado sobre varias líneas molestaba a
    /// la vista.
    private func usarRapida(_ r: RespuestaRapida) {
        errorEnvio = nil
        mediaPendiente = r.media
        borrador = r.texto
        cuadroEnfocado = true
    }

    private func enviar() {
        let texto = borrador.trimmingCharacters(in: .whitespacesAndNewlines)
        // Con archivo esperando, el texto es opcional (va de pie de foto).
        if let media = mediaPendiente {
            mediaPendiente = nil
            borrador = ""
            errorEnvio = nil
            let eco = Mensaje(pendienteTipo: media.tipo, texto: texto)
            store.pendientes.append(eco)
            Task {
                do {
                    let id = try await ChatAPI.enviarMediaGuardada(conversationId: conv.id,
                                                                   media: media, caption: texto)
                    store.confirmar(eco: eco.id, waMessageId: id)
                } catch {
                    store.pendientes.removeAll { $0.id == eco.id }
                    errorEnvio = (error as? ChatAPI.ErrorEnvio)?.mensaje ?? "No se pudo enviar."
                    mediaPendiente = media
                    if borrador.isEmpty { borrador = texto }
                }
            }
            return
        }
        guard !texto.isEmpty else { return }
        let cita = respondiendoA?.id
        respondiendoA = nil
        borrador = ""
        errorEnvio = nil
        // Sin bloquear el compositor: el mensaje ya se ve y puedes seguir
        // escribiendo el siguiente mientras este viaja.
        Task {
            let error = await store.enviar(texto: texto, conversationId: conv.id, respondeA: cita)
            if let error {
                errorEnvio = error
                // El texto vuelve al borrador: nada se pierde por un fallo.
                if borrador.isEmpty { borrador = texto }
            }
        }
    }
}

/// Los atajos que calzan con lo escrito tras el "/". Van TODOS, con scroll:
/// a la vista caben cuatro filas y media, y la media cortada es la pista de
/// que hay más abajo. Antes se cortaba en cuatro y el resto no existía.
private struct PanelAtajos: View {
    let atajos: [RespuestaRapida]
    let alElegir: (RespuestaRapida) -> Void
    /// El alto real de la lista entera, medido; hasta que llega, un cálculo.
    @State private var altoLista: CGFloat = 0

    private static let filasALaVista: CGFloat = 4.5
    private static let altoFilaEstimado: CGFloat = 40

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(Array(atajos.enumerated()), id: \.element.id) { i, r in
                    Button { alElegir(r) } label: { fila(r) }
                        .buttonStyle(.plain)
                    if i < atajos.count - 1 {
                        Divider().padding(.leading, 42)
                    }
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { altoLista = $0 }
        }
        // Deslizar la lista no cierra el teclado: por defecto un scroll lo
        // baja, y con él se iría lo escrito tras el "/".
        .scrollDismissesKeyboard(.never)
        .scrollBounceBehavior(.basedOnSize)
        .frame(height: alto)
        .vidrioRedondeado(16)
    }

    private var alto: CGFloat {
        let n = CGFloat(max(1, atajos.count))
        let todo = altoLista > 0 ? altoLista : n * Self.altoFilaEstimado
        guard n > Self.filasALaVista else { return todo }
        return todo / n * Self.filasALaVista
    }

    private func fila(_ r: RespuestaRapida) -> some View {
        HStack(spacing: 10) {
            Image(systemName: r.media?.icono ?? "bolt.fill")
                .font(.caption)
                .foregroundStyle(.tint)
                .frame(width: 18)
            Text("/" + r.atajo)
                .font(.subheadline.weight(.semibold))
            Text(r.texto)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

/// El UIScrollView que SwiftUI esconde debajo de la lista, y lo único que se
/// le pide: frenar la inercia. Si la lista viene deslizándose,
/// `proxy.scrollTo` se pierde (la desaceleración manda), así que tocar la
/// flecha apagaba el botón y la lista seguía donde estaba. Clavar el offset
/// actual mata la inercia al instante, y ahí sí el salto al final obedece.
@MainActor
private final class EspiaDeScroll {
    weak var scroll: UIScrollView?
    /// Cuánto falta para el fondo, según el último aviso de geometría.
    var distanciaAlFondo: CGFloat = 0
    /// Mientras la lista viaja al final por orden nuestra.
    var viajando = false

    func frenar() {
        guard let s = scroll, s.isDecelerating else { return }
        s.setContentOffset(s.contentOffset, animated: false)
    }
}

/// Una vista vacía dentro del ScrollView: desde ahí se sube por los
/// superviews hasta dar con el UIScrollView. Si algún día SwiftUI lo
/// esconde de otra forma, no pasa nada: la flecha sigue funcionando como
/// antes, solo sin el freno.
private struct SondaDeScroll: UIViewRepresentable {
    let espia: EspiaDeScroll

    func makeUIView(context: Context) -> UIView {
        let v = UIView(frame: .zero)
        v.isUserInteractionEnabled = false
        return v
    }

    func updateUIView(_ v: UIView, context: Context) {
        guard espia.scroll == nil else { return }
        DispatchQueue.main.async {
            var actual = v.superview
            while let s = actual {
                if let sv = s as? UIScrollView { espia.scroll = sv; return }
                actual = s.superview
            }
        }
    }
}

/// La foto que está abierta en el visor.
struct FotoAbierta: Identifiable {
    let id: String
}

private enum ElementoChat: Identifiable {
    case separador(id: String, titulo: String)
    case mensaje(Mensaje, cambiaDeLado: Bool)
    /// Varias fotos de una misma tanda, en una sola burbuja.
    case album([Mensaje], cambiaDeLado: Bool)

    var id: String {
        switch self {
        case .separador(let id, _): return id
        case .mensaje(let m, _): return m.id
        case .album(let fotos, _): return fotos[0].id
        }
    }
}

/// La burbuja: verde a la derecha lo nuestro, gris a la izquierda lo del
/// cliente. Abraza su contenido; las fotos usan las medidas que guarda el
/// servidor para reservar el espacio exacto (sin franjas muertas).
private struct BurbujaMensaje: View {
    let mensaje: Mensaje
    var citado: Mensaje? = nil
    var nombreContacto: String = ""
    var alResponder: (() -> Void)? = nil
    var alReaccionar: ((String) -> Void)? = nil
    var alTocarCita: (() -> Void)? = nil
    /// Abrir la foto en el visor de la conversación (con todas las demás).
    var alAbrirFoto: (() -> Void)? = nil
    var previaLocal: Data? = nil
    @State private var verAdjunto = false

    // Cuatro: los que caben en una sola fila del menú.
    private static let emojis = ["❤️", "👍", "😂", "🙏"]

    /// El sticker se muestra suelto, sin burbuja, como en WhatsApp.
    private var esStickerSuelto: Bool {
        mensaje.tipo == "sticker" && mensaje.media?.url != nil
    }

    /// Una foto o un video sin pie de foto van SOLOS, sin burbuja, con la
    /// hora encima — como WhatsApp hoy. Con pie de foto la burbuja se queda:
    /// el texto necesita su fondo. Con cita también, por lo mismo.
    private var esFotoSuelta: Bool {
        (mensaje.tipo == "image" || mensaje.tipo == "video")
            && mensaje.media?.url != nil
            && mensaje.texto.isEmpty && citado == nil
    }

    private var sinBurbuja: Bool { esStickerSuelto || esFotoSuelta }

    var body: some View {
        HStack {
            if mensaje.esSaliente { Spacer(minLength: 60) }
            VStack(alignment: .trailing, spacing: 4) {
                if let citado {
                    bloqueCita(citado)
                }
                contenido
                if mensaje.tipo == "audio", mensaje.media?.url != nil {
                    EmptyView()  // la burbuja de audio ya lleva su pie
                } else if esFotoSuelta {
                    EmptyView()  // la hora va encima de la foto
                } else if esStickerSuelto {
                    // La hora del sticker va en su propia pastillita.
                    pieDeMensaje
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(.ultraThinMaterial, in: Capsule())
                } else {
                    pieDeMensaje
                }
            }
            .padding(.horizontal, sinBurbuja ? 0 : 12)
            .padding(.vertical, sinBurbuja ? 0 : 8)
            // El tinte pinta los iconos de adjuntos y la onda ya escuchada. En
            // la burbuja propia iba en blanco, de cuando el fondo era el color
            // de la marca a pleno; sobre el pastel de ahora no se veía nada.
            // Los enlaces no dependen de esto: llevan su azul puesto a mano
            // (Color.enlace), el mismo en los dos lados.
            .tint(mensaje.esSaliente ? apariencia.colorBurbuja : Color.accentColor)
            .background(sinBurbuja ? AnyShapeStyle(.clear) : AnyShapeStyle(fondo),
                        in: RoundedRectangle(cornerRadius: 16))
            .contextMenu { menuContextual }
            .overlay(alignment: mensaje.esSaliente ? .bottomLeading : .bottomTrailing) {
                if !chipReacciones.isEmpty {
                    Text(chipReacciones)
                        .font(.caption)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color(.systemBackground), in: Capsule())
                        .overlay(Capsule().stroke(Color(.systemGray4), lineWidth: 0.5))
                        .offset(y: 12)
                }
            }
            .padding(.bottom, chipReacciones.isEmpty ? 0 : 10)
            if !mensaje.esSaliente { Spacer(minLength: 60) }
        }
    }

    /// El bloque de cita, como WhatsApp: barrita de color + quién + resumen.
    private func bloqueCita(_ c: Mensaje) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(c.esSaliente ? Color.accentColor : Color(.systemGray))
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 1) {
                Text(c.esSaliente ? "Tú" : nombreContacto)
                    .font(.caption.weight(.semibold))
                ResumenCita(mensaje: c)
            }
        }
        .padding(6)
        // Nada de frame con maxWidth: eso vuelve la cita FLEXIBLE y se
        // estira sola hasta el tope, inflando la burbuja aunque el mensaje
        // sea "Entendido". Sin él mide su contenido, y el ancho máximo lo
        // pone el propio margen de la burbuja.
        .background(Color(.systemGray6).opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
        .fixedSize(horizontal: false, vertical: true)
        .contentShape(Rectangle())
        .onTapGesture { alTocarCita?() }
    }

    private var chipReacciones: String {
        [mensaje.reaccionCliente, mensaje.reaccionMia].compactMap { $0 }.joined()
    }

    @ViewBuilder private var menuContextual: some View {
        if mensaje.estado != "sending" {
            ControlGroup {
                ForEach(Self.emojis, id: \.self) { e in
                    Button(e) { alReaccionar?(e) }
                }
            }
            .controlGroupStyle(.compactMenu)
            Button {
                alResponder?()
            } label: {
                Label("Responder", systemImage: "arrowshape.turn.up.left")
            }
            if mensaje.tipo == "image" {
                Button {
                    if let u = mensaje.media?.url ?? mensaje.media?.thumbUrl {
                        GuardadorFotos.guardar(url: u) { _ in }
                    }
                } label: {
                    Label("Guardar en Fotos", systemImage: "square.and.arrow.down")
                }
            }
        }
    }

    @ViewBuilder private var contenido: some View {
        if mensaje.estado == "sending", mensaje.tipo == "image", previaLocal != nil {
            // La foto propia se ve mientras sube, con su ruedita encima.
            miniatura
                .overlay {
                    ZStack {
                        Color.black.opacity(0.25)
                        ProgressView().tint(.white)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
        } else if mensaje.estado == "sending", mensaje.media == nil, mensaje.tipo != "text" {
            HStack(spacing: 8) {
                ProgressView()
                Text(etiquetaEnviando)
                    .foregroundStyle(.secondary)
            }
        } else {
            switch mensaje.tipo {
            case "image":
                VStack(alignment: .leading, spacing: 6) {
                    if esFotoSuelta {
                        miniatura
                            .conHoraEncima(mensaje)
                            .onTapGesture { abrirFoto() }
                    } else {
                        miniatura
                            .onTapGesture { abrirFoto() }
                    }
                    if !mensaje.texto.isEmpty {
                        Text(TextoWhatsapp.atribuido(mensaje.texto))
                            .frame(maxWidth: 230, alignment: .leading)
                    }
                }
                .fullScreenCover(isPresented: $verAdjunto) { visor }
            case "audio":
                if mensaje.media?.url != nil {
                    BurbujaAudio(mensaje: mensaje) { pieDeMensaje }
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: "mic.fill").font(.title3).foregroundStyle(.tint)
                        Text("Nota de voz")
                    }
                }
            case "sticker":
                if let url = mensaje.media?.url {
                    // El sticker es la imagen pelada (webp), sin adornos.
                    ImagenCacheada(url: url) { imagen in
                        imagen.resizable().scaledToFit()
                    }
                    .frame(width: 150, height: 150)
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: "face.smiling").font(.title3).foregroundStyle(.tint)
                        Text("Sticker")
                    }
                }
            case "video" where mensaje.media?.url != nil:
                VStack(alignment: .leading, spacing: 6) {
                    let vista = MiniaturaVideo(url: mensaje.media?.url ?? "")
                    if esFotoSuelta {
                        vista.conHoraEncima(mensaje)
                            .onTapGesture { verAdjunto = true }
                    } else {
                        vista.clipShape(RoundedRectangle(cornerRadius: 12))
                            .onTapGesture { verAdjunto = true }
                    }
                    if !mensaje.texto.isEmpty {
                        Text(TextoWhatsapp.atribuido(mensaje.texto))
                            .frame(maxWidth: 230, alignment: .leading)
                    }
                }
                .fullScreenCover(isPresented: $verAdjunto) { visor }
            case "video", "document":
                HStack(spacing: 8) {
                    Image(systemName: icono)
                        .font(.title3)
                        .foregroundStyle(.tint)
                    Text(etiquetaAdjunto)
                        .lineLimit(2)
                }
                .contentShape(Rectangle())
                .onTapGesture { if mensaje.media?.url != nil { verAdjunto = true } }
                .fullScreenCover(isPresented: $verAdjunto) { visor }
            case "unsupported", "unknown":
                // Meta no entrega este contenido por la Cloud API (stickers
                // animados, encuestas y otros). Mejor decirlo en cristiano.
                HStack(spacing: 8) {
                    Image(systemName: "eye.slash")
                        .foregroundStyle(.secondary)
                    Text("Este contenido no se puede mostrar aquí (WhatsApp no lo entrega a la API — suele ser un sticker animado).")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            default:
                // El formato de WhatsApp (*negrita*, _cursiva_, ~tachado~,
                // ```mono```) y los enlaces tocables. Sin esto el cliente veia
                // los asteriscos pelados.
                Text(mensaje.texto.isEmpty
                     ? AttributedString("[\(mensaje.tipo)]")
                     : TextoWhatsapp.atribuido(mensaje.texto))
                    .multilineTextAlignment(.leading)
            }
        }
    }

    private func abrirFoto() {
        if let alAbrirFoto { alAbrirFoto() } else { verAdjunto = true }
    }

    private var visor: some View {
        VisorAdjunto(url: mensaje.media?.url ?? mensaje.media?.thumbUrl ?? "",
                     filename: mensaje.media?.filename)
    }

    private var etiquetaEnviando: String {
        switch mensaje.tipo {
        case "image": return "Enviando foto…"
        case "audio": return "Enviando nota de voz…"
        case "document": return "Enviando documento…"
        default: return "Enviando…"
        }
    }

    /// La foto con su proporción real: alto = 230 / (ancho/alto guardados).
    private var miniatura: some View {
        ImagenBurbuja(url: mensaje.media?.thumbUrl ?? mensaje.media?.url ?? "",
                      anchoGuardado: mensaje.media?.ancho,
                      altoGuardado: mensaje.media?.alto,
                      datosLocales: previaLocal)
    }

    private var icono: String {
        switch mensaje.tipo {
        case "video": return "video.fill"
        case "audio": return "mic.fill"
        case "document": return "doc.fill"
        default: return "face.smiling"
        }
    }

    private var etiquetaAdjunto: String {
        if let nombre = mensaje.media?.filename, !nombre.isEmpty { return nombre }
        if !mensaje.texto.isEmpty { return mensaje.texto }
        switch mensaje.tipo {
        case "video": return "Video"
        case "audio": return "Nota de voz"
        case "document": return "Documento"
        default: return "Sticker"
        }
    }

    private var pieDeMensaje: some View { PieMensaje(mensaje: mensaje) }

    @ObservedObject private var apariencia = Apariencia.shared
    @Environment(\.colorScheme) private var esquema

    private var fondo: some ShapeStyle {
        mensaje.esSaliente
            ? AnyShapeStyle(apariencia.fondoBurbuja(esquema))
            : AnyShapeStyle(Color(.secondarySystemGroupedBackground))
    }
}


/// El resumen del mensaje citado. Para una nota de voz muestra además cuánto
/// dura ("🎤 Nota de voz 0:14"), como WhatsApp. La duración sale del caché si
/// ya se analizó ese audio; si no, se lee de sus metadatos.
struct ResumenCita: View {
    let mensaje: Mensaje
    var lineas: Int = 2
    @State private var duracion: Double = 0

    var body: some View {
        Text(texto)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(lineas)
            .task(id: mensaje.media?.url) { await cargarDuracion() }
    }

    private var texto: String {
        guard mensaje.tipo == "audio" else { return Formato.resumenMensaje(mensaje) }
        let base = "🎤 Nota de voz"
        guard duracion > 0 else { return base }
        return "\(base)  \(Int(duracion) / 60):\(String(format: "%02d", Int(duracion) % 60))"
    }

    private func cargarDuracion() async {
        guard mensaje.tipo == "audio", let url = mensaje.media?.url else { return }
        if let d = await AudiosAnalizados.duracion[url] { duracion = d; return }
        guard let archivo = await CacheAudio.obtener(url) else { return }
        guard let d = try? await AVURLAsset(url: archivo).load(.duration) else { return }
        let seg = CMTimeGetSeconds(d)
        guard seg.isFinite, seg > 0 else { return }
        await MainActor.run { AudiosAnalizados.duracion[url] = seg }
        duracion = seg
    }
}

extension View {
    /// iOS 26 pega un bloque de vidrio ("scroll edge effect") bajo la cabecera
    /// en cuanto el hilo se mueve. Sobre una foto de fondo eso se lee como un
    /// bloque gris. Lo quitamos: el desvanecido del texto ya hace ese trabajo,
    /// y sin tapar el fondo. En iOS anteriores no existe y no hace falta.
    @ViewBuilder func sinEfectoDeBorde() -> some View {
        if #available(iOS 26.0, *) {
            self.scrollEdgeEffectHidden(true, for: .all)
        } else {
            self
        }
    }
}
