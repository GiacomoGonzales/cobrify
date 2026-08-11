import Foundation
import Capacitor
import Network

/**
 * Plugin Capacitor para impresión térmica via TCP/IP (WiFi/LAN) en iOS.
 * Equivalente al TcpPrinterPlugin.java de Android: MISMOS nombres de método y
 * MISMA forma de respuesta, para que el JS (thermalPrinterService.js) no distinga
 * de plataforma.
 *
 * Las impresoras térmicas de red escuchan normalmente en el puerto 9100 (RAW/JetDirect).
 *
 * A diferencia de Android (java.net.Socket), aquí se usa Network.framework porque es
 * lo que iOS 14+ exige para hablar con dispositivos de la red local: la primera conexión
 * dispara el diálogo de permiso "Red local", que requiere NSLocalNetworkUsageDescription
 * en el Info.plist. Sin esa clave el sistema BLOQUEA la conexión sin preguntar.
 */
@objc(TcpPrinterPlugin)
public class TcpPrinterPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "TcpPrinterPlugin"
    public let jsName = "TcpPrinter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendRaw", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendCommand", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printDirect", returnType: CAPPluginReturnPromise)
    ]

    private static let defaultPort = 9100
    private static let connectionTimeout: TimeInterval = 5.0  // igual que Android
    private static let sendTimeout: TimeInterval = 10.0       // igual que Android (SO_TIMEOUT)

    /// Cola serie: replica el `Executors.newSingleThreadExecutor()` de Android, así dos
    /// impresiones simultáneas no se pisan el socket.
    private let queue = DispatchQueue(label: "com.cobrify.tcpprinter")

    private var connection: TcpConnection?
    private var connectedIp: String?
    private var connectedPort: Int = 0

    // MARK: - Conexión persistente

    @objc func connect(_ call: CAPPluginCall) {
        guard let ip = call.getString("ip"), !ip.isEmpty else {
            call.reject("IP address is required")
            return
        }
        let port = call.getInt("port") ?? Self.defaultPort

        queue.async {
            self.closeConnection()

            let conn = TcpConnection(host: ip, port: port)
            if let error = conn.open(timeout: Self.connectionTimeout) {
                conn.close()
                call.reject("Failed to connect: \(error)")
                return
            }

            self.connection = conn
            self.connectedIp = ip
            self.connectedPort = port

            call.resolve(["success": true, "ip": ip, "port": port])
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        queue.async {
            self.closeConnection()
            call.resolve(["success": true])
        }
    }

    @objc func isConnected(_ call: CAPPluginCall) {
        queue.async {
            let connected = self.connection?.isReady ?? false
            call.resolve([
                "connected": connected,
                "ip": self.connectedIp ?? NSNull(),
                "port": self.connectedPort
            ])
        }
    }

    /// Cierra el socket persistente. Debe llamarse siempre dentro de `queue`.
    private func closeConnection() {
        connection?.close()
        connection = nil
        connectedIp = nil
        connectedPort = 0
    }

    // MARK: - Envío sobre la conexión persistente

    @objc func sendRaw(_ call: CAPPluginCall) {
        guard let base64 = call.getString("data"), !base64.isEmpty else {
            call.reject("Data is required")
            return
        }
        guard let data = Data(base64Encoded: base64) else {
            call.reject("Data is not valid base64")
            return
        }
        sendOnActiveConnection(data, call: call)
    }

    @objc func sendText(_ call: CAPPluginCall) {
        guard let text = call.getString("text") else {
            call.reject("Text is required")
            return
        }
        // Android acepta un charset arbitrario; en la práctica el JS solo usa UTF-8, y las
        // tildes ya vienen convertidas a ASCII desde convertSpanishText().
        let charset = call.getString("charset") ?? "UTF-8"
        let encoding: String.Encoding = charset.uppercased() == "UTF-8" ? .utf8 : .isoLatin1
        guard let data = text.data(using: encoding) ?? text.data(using: .utf8) else {
            call.reject("Failed to encode text with charset \(charset)")
            return
        }
        sendOnActiveConnection(data, call: call)
    }

    @objc func sendCommand(_ call: CAPPluginCall) {
        guard let command = call.getString("command"), !command.isEmpty else {
            call.reject("Command is required")
            return
        }
        guard let data = Self.escPosCommand(command) else {
            call.reject("Unknown command: \(command)")
            return
        }
        sendOnActiveConnection(data, call: call, includeByteCount: false)
    }

    /// Nombre ObjC `print:` (lo que espera el bridge) con nombre Swift distinto para no
    /// tapar `Swift.print` dentro de esta clase.
    @objc(print:) func printData(_ call: CAPPluginCall) {
        guard let base64 = call.getString("data"), !base64.isEmpty else {
            call.reject("Print data is required")
            return
        }
        guard let data = Data(base64Encoded: base64) else {
            call.reject("Print data is not valid base64")
            return
        }
        sendOnActiveConnection(data, call: call)
    }

    private func sendOnActiveConnection(_ data: Data, call: CAPPluginCall, includeByteCount: Bool = true) {
        queue.async {
            guard let conn = self.connection, conn.isReady else {
                call.reject("Not connected to printer")
                return
            }
            if let error = conn.send(data, timeout: Self.sendTimeout) {
                call.reject("Failed to send data: \(error)")
                return
            }
            var result: [String: Any] = ["success": true]
            if includeByteCount { result["bytesWritten"] = data.count }
            call.resolve(result)
        }
    }

    // MARK: - Impresión atómica

    /**
     * connect → print → disconnect en una sola operación. Es la ruta que usa el JS para
     * casi todo: suelta el socket de inmediato, así varias cajas/tablets pueden compartir
     * la MISMA impresora de red (que suele aceptar una sola conexión a la vez).
     */
    @objc func printDirect(_ call: CAPPluginCall) {
        guard let ip = call.getString("ip"), !ip.isEmpty else {
            call.reject("IP address is required")
            return
        }
        guard let base64 = call.getString("data"), !base64.isEmpty else {
            call.reject("Print data is required")
            return
        }
        guard let data = Data(base64Encoded: base64) else {
            call.reject("Print data is not valid base64")
            return
        }
        let port = call.getInt("port") ?? Self.defaultPort

        queue.async {
            // La impresora normalmente acepta 1 conexión: soltar la persistente antes.
            self.closeConnection()

            let conn = TcpConnection(host: ip, port: port)
            defer { conn.close() }

            if let error = conn.open(timeout: Self.connectionTimeout) {
                call.reject("Failed to print: \(error)")
                return
            }
            if let error = conn.send(data, timeout: Self.sendTimeout) {
                call.reject("Failed to print: \(error)")
                return
            }
            call.resolve(["success": true, "bytesWritten": data.count])
        }
    }

    @objc func printTest(_ call: CAPPluginCall) {
        let paperWidth = call.getInt("paperWidth") ?? 58

        queue.async {
            guard let conn = self.connection, conn.isReady else {
                call.reject("Not connected to printer")
                return
            }

            let separator = paperWidth == 80
                ? "------------------------------------------\n"
                : "------------------------\n"

            let formatter = DateFormatter()
            formatter.dateFormat = "dd/MM/yyyy HH:mm:ss"

            var data = Data()
            data.append(contentsOf: [0x1B, 0x40])        // ESC @  init
            data.append(contentsOf: [0x1B, 0x61, 0x01])  // ESC a 1  centrar
            data.append(contentsOf: [0x1B, 0x45, 0x01])  // ESC E 1  negrita on
            data.append(Self.ascii("PRUEBA WIFI/LAN\n"))
            data.append(contentsOf: [0x1B, 0x45, 0x00])  // ESC E 0  negrita off
            data.append(Self.ascii(separator))
            data.append(Self.ascii("\nConectado a: \(self.connectedIp ?? "-"):\(self.connectedPort)\n"))
            data.append(Self.ascii("Ancho papel: \(paperWidth)mm\n"))
            data.append(Self.ascii("\nFecha: \(formatter.string(from: Date()))\n"))
            data.append(Self.ascii(separator))
            data.append(Self.ascii("\nImpresora WiFi configurada\n"))
            data.append(Self.ascii("correctamente!\n\n\n"))
            data.append(contentsOf: [0x1D, 0x56, 0x00])  // GS V 0  cortar

            if let error = conn.send(data, timeout: Self.sendTimeout) {
                call.reject("Failed to print test: \(error)")
                return
            }
            call.resolve(["success": true])
        }
    }

    // MARK: - Utilidades

    /// Las impresoras ESC/POS no hablan UTF-8: se manda una byte por carácter (CP437-ish),
    /// descartando lo que no sea representable. El texto ya llega sin tildes desde el JS.
    private static func ascii(_ text: String) -> Data {
        return text.data(using: .isoLatin1, allowLossyConversion: true) ?? Data()
    }

    private static func escPosCommand(_ command: String) -> Data? {
        switch command {
        case "INIT", "RESET":        return Data([0x1B, 0x40])
        case "CUT", "CUT_PAPER":     return Data([0x1D, 0x56, 0x00])
        case "CUT_PARTIAL":          return Data([0x1D, 0x56, 0x01])
        case "ALIGN_LEFT":           return Data([0x1B, 0x61, 0x00])
        case "ALIGN_CENTER":         return Data([0x1B, 0x61, 0x01])
        case "ALIGN_RIGHT":          return Data([0x1B, 0x61, 0x02])
        case "BOLD_ON":              return Data([0x1B, 0x45, 0x01])
        case "BOLD_OFF":             return Data([0x1B, 0x45, 0x00])
        case "UNDERLINE_ON":         return Data([0x1B, 0x2D, 0x01])
        case "UNDERLINE_OFF":        return Data([0x1B, 0x2D, 0x00])
        case "DOUBLE_WIDTH_ON":      return Data([0x1B, 0x21, 0x20])
        case "DOUBLE_WIDTH_OFF":     return Data([0x1B, 0x21, 0x00])
        case "DOUBLE_HEIGHT_ON":     return Data([0x1B, 0x21, 0x10])
        case "DOUBLE_HEIGHT_OFF":    return Data([0x1B, 0x21, 0x00])
        case "FEED_LINE":            return Data([0x0A])
        case "FEED_3_LINES":         return Data([0x1B, 0x64, 0x03])
        default:                     return nil
        }
    }
}

/**
 * Envoltura bloqueante sobre NWConnection.
 *
 * El plugin llama a esto SIEMPRE desde su cola serie de fondo (nunca desde el hilo
 * principal), así que bloquear con semáforos es seguro y deja el código con la misma
 * forma secuencial que la versión Java, en vez de encadenar callbacks.
 */
private final class TcpConnection {

    private let connection: NWConnection
    private let queue = DispatchQueue(label: "com.cobrify.tcpprinter.socket")
    private var opened = false

    init(host: String, port: Int) {
        let tcpOptions = NWProtocolTCP.Options()
        // Sin esto una IP inexistente se queda reintentando el SYN mucho más que el
        // timeout de Android; hay que fallar rápido para poder avisar al usuario.
        tcpOptions.connectionTimeout = 5
        tcpOptions.noDelay = true

        let endpointPort = NWEndpoint.Port(rawValue: UInt16(clamping: port)) ?? NWEndpoint.Port(rawValue: 9100)!
        self.connection = NWConnection(
            host: NWEndpoint.Host(host),
            port: endpointPort,
            using: NWParameters(tls: nil, tcp: tcpOptions)
        )
    }

    var isReady: Bool {
        return opened && connection.state == .ready
    }

    /// Abre la conexión. Devuelve nil si conectó, o el mensaje de error si falló.
    func open(timeout: TimeInterval) -> String? {
        let semaphore = DispatchSemaphore(value: 0)
        // `settled` evita que un cambio de estado posterior (p. ej. .failed tras .ready)
        // señale el semáforo una segunda vez y desbloquee un waiter que no le corresponde.
        var result: String?
        var lastWaitingError: String?
        var settled = false
        let lock = NSLock()

        connection.stateUpdateHandler = { state in
            lock.lock()
            defer { lock.unlock() }
            guard !settled else { return }

            switch state {
            case .ready:
                settled = true
                semaphore.signal()
            case .failed(let error):
                settled = true
                result = Self.describe(error)
                semaphore.signal()
            case .cancelled:
                settled = true
                result = "Connection cancelled"
                semaphore.signal()
            case .waiting(let error):
                // .waiting = todavía no hay ruta al host: impresora apagada, otra red, o
                // —la primera vez— el diálogo de "Red local" aún sin responder.
                //
                // NO se falla aquí: iOS deja la conexión en .waiting mientras el usuario
                // decide, y pasa a .ready si acepta. Cortar en seco haría que el PRIMER
                // intento fallara siempre, justo el que dispara el permiso. Se deja correr
                // hasta el timeout, igual que el Socket.connect(timeout) de Android; solo
                // se guarda el motivo para poder explicarlo si se agota el tiempo.
                lastWaitingError = Self.describe(error)
            default:
                break
            }
        }

        connection.start(queue: queue)

        if semaphore.wait(timeout: .now() + timeout) == .timedOut {
            lock.lock()
            settled = true
            let reason = lastWaitingError
            lock.unlock()
            return reason ?? "Connection timed out after \(Int(timeout))s"
        }

        if result == nil { opened = true }
        return result
    }

    /// Envía los bytes. Devuelve nil si se enviaron, o el mensaje de error si falló.
    func send(_ data: Data, timeout: TimeInterval) -> String? {
        let semaphore = DispatchSemaphore(value: 0)
        var result: String?

        connection.send(content: data, completion: .contentProcessed { error in
            if let error = error {
                result = Self.describe(error)
            }
            semaphore.signal()
        })

        if semaphore.wait(timeout: .now() + timeout) == .timedOut {
            return "Send timed out after \(Int(timeout))s"
        }
        return result
    }

    func close() {
        connection.stateUpdateHandler = nil
        connection.cancel()
        opened = false
    }

    /// El error crudo de Network.framework ("POSIXErrorCode: No route to host") no le dice
    /// nada al cajero; los casos que sí ocurren en un local se traducen a algo accionable.
    private static func describe(_ error: NWError) -> String {
        switch error {
        case .posix(.ECONNREFUSED):
            return "La impresora rechazó la conexión. Verifica que el puerto sea el correcto (normalmente 9100)."
        case .posix(.EHOSTUNREACH), .posix(.ENETUNREACH), .posix(.ETIMEDOUT):
            return "No se pudo alcanzar la impresora. Verifica que esté encendida y en la misma red WiFi."
        case .posix(.ECONNRESET), .posix(.EPIPE):
            return "La impresora cerró la conexión. Puede estar ocupada con otro dispositivo."
        case .posix(.EACCES), .posix(.EPERM):
            return "iOS bloqueó el acceso a la red local. Actívalo en Ajustes > Cobrify > Red local."
        default:
            return error.localizedDescription
        }
    }
}
