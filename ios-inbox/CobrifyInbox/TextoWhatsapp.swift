import SwiftUI
import UIKit

/// Texto de un mensaje con el formato de WhatsApp.
///
/// WhatsApp marca el formato con caracteres: `*negrita*`, `_cursiva_`,
/// `~tachado~` y ```` ```monoespaciado``` ````. El cliente los escribe así y su
/// app se los muestra formateados; hasta ahora la bandeja mostraba los
/// asteriscos pelados. También vuelve tocables los enlaces, los correos y los
/// teléfonos.
///
/// Las reglas son LAS MISMAS que las de la web (src/components/chat/
/// TextoWhatsapp.jsx): si cambia una, cambiar la otra, o el mismo mensaje se
/// verá distinto en el teléfono que en el navegador.
enum TextoWhatsapp {

    /// Un tramo del mensaje ya clasificado.
    private enum Tramo {
        case plano(String)
        case negrita(String)
        case cursiva(String)
        case tachado(String)
        case mono(String)
        case enlace(String)
        case correo(String)
        /// Tal como vino escrito, y limpio para copiarlo y llamar.
        case telefono(escrito: String, limpio: String)
    }

    /// Un teléfono: un celular peruano (nueve cifras que empiezan en 9,
    /// pegadas o de a tres, con o sin +51) o cualquier número con + y código
    /// de país. `[0-9]` y no `\d`: aquí `\d` acepta también cifras de otros
    /// alfabetos y en la web no, y las dos tienen que decir lo mismo.
    private static let telefono =
        #"(?:\+?51[ -]?)?9[0-9]{2}[ -]?[0-9]{3}[ -]?[0-9]{3}"#
        + #"|\+[0-9]{1,3}(?:[ -]?\([0-9]{1,4}\))?[ -]?[0-9]{1,4}(?:[ -]?[0-9]{2,4}){1,5}"#

    // Mismo orden que la web: el enlace primero, para que un `_` dentro de una
    // dirección no la parta en cursiva, y el correo enseguida por lo mismo
    // (juan_perez@gmail.com no es una cursiva). El teléfono después del
    // correo: 987654321@gmail.com es un correo.
    private static let patron: NSRegularExpression? = try? NSRegularExpression(
        pattern: [
            #"https?://[^\s<>"]+"#,
            #"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"#,
            telefono,
            #"\*[^*\n]+\*"#,
            #"_[^_\n]+_"#,
            #"~[^~\n]+~"#,
            "```[^`]+```",
        ].joined(separator: "|")
    )

    /// Un correo de punta a punta. Distingue el tramo que ES un correo de una
    /// _cursiva_ que solo lo contiene.
    private static let correoEntero: NSRegularExpression? = try? NSRegularExpression(
        pattern: #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
    )

    /// Lo mismo para el teléfono.
    private static let telefonoEntero: NSRegularExpression? = try? NSRegularExpression(
        pattern: "^(?:\(telefono))$"
    )

    private static func esCorreo(_ t: String) -> Bool {
        correoEntero?.firstMatch(in: t, range: NSRange(location: 0, length: (t as NSString).length)) != nil
    }

    private static func esTelefono(_ t: String) -> Bool {
        telefonoEntero?.firstMatch(in: t, range: NSRange(location: 0, length: (t as NSString).length)) != nil
    }

    /// ¿Hay una letra o una cifra en esa posición del texto? Fuera de él, no.
    private static func letraOCifra(_ ns: NSString, _ i: Int) -> Bool {
        guard i >= 0, i < ns.length, let u = Unicode.Scalar(ns.character(at: i)) else { return false }
        return CharacterSet.alphanumerics.contains(u)
    }

    /// El número limpio, para copiarlo y para llamar: 987654321,
    /// +51987654321, +13055551234. Nil si no da para teléfono: menos de 8
    /// cifras o más de 15.
    private static func limpiarTelefono(_ t: String) -> String? {
        let cifras = String(t.filter { $0.isASCII && $0.isNumber })
        guard (8...15).contains(cifras.count) else { return nil }
        // Con código de país, siempre con +: "51987654321" pelado no se puede
        // marcar desde un celular peruano.
        return t.hasPrefix("+") || cifras.count == 11 ? "+" + cifras : cifras
    }

    /// Los correos del mensaje, sin repetir y en orden: el menú de la burbuja
    /// ofrece copiar cada uno sin el resto del texto.
    static func correos(en texto: String) -> [String] {
        var vistos: [String] = []
        for case .correo(let c) in tramos(de: texto) where !vistos.contains(c) {
            vistos.append(c)
        }
        return vistos
    }

    /// Los teléfonos del mensaje, limpios, sin repetir y en orden: lo mismo
    /// que con los correos.
    static func telefonos(en texto: String) -> [String] {
        var vistos: [String] = []
        for case .telefono(_, let limpio) in tramos(de: texto) where !vistos.contains(limpio) {
            vistos.append(limpio)
        }
        return vistos
    }

    /// El correo para MOSTRAR en un menú o un cuadro: con un espacio invisible
    /// después de la arroba y de cada punto, para que si no cabe se corte ahí
    /// y no a mitad de palabra con un guion ("elbuensa-bor.pe"), que parece
    /// parte de la dirección. Lo que se copia es siempre el correo limpio.
    static func paraMostrar(_ correo: String) -> String {
        correo.replacingOccurrences(of: "@", with: "@\u{200B}")
            .replacingOccurrences(of: ".", with: ".\u{200B}")
    }

    /// El número para MOSTRAR en un menú o un cuadro, de a tres como se lee:
    /// "987 654 321", "+51 987 654 321". Uno de afuera, como se copia.
    static func telefonoParaMostrar(_ numero: String) -> String {
        if numero.count == 9 {
            let d = Array(numero)
            return "\(String(d[0...2])) \(String(d[3...5])) \(String(d[6...8]))"
        }
        return numero.hasPrefix("+") ? Formato.numero(String(numero.dropFirst())) : numero
    }

    /// La puntuación final suele ser de la frase, no del enlace.
    private static func limpiarEnlace(_ t: String) -> (enlace: String, resto: String) {
        var enlace = t
        var resto = ""
        while let ultimo = enlace.last, ").,;!?".contains(ultimo) {
            resto = String(ultimo) + resto
            enlace.removeLast()
        }
        return (enlace, resto)
    }

    private static func tramos(de texto: String) -> [Tramo] {
        guard let patron else { return [.plano(texto)] }
        let ns = texto as NSString
        var salida: [Tramo] = []
        var cursor = 0

        for m in patron.matches(in: texto, range: NSRange(location: 0, length: ns.length)) {
            if m.range.location > cursor {
                salida.append(.plano(ns.substring(with: NSRange(location: cursor, length: m.range.location - cursor))))
            }
            let t = ns.substring(with: m.range)

            if t.hasPrefix("http") {
                let (enlace, resto) = limpiarEnlace(t)
                salida.append(.enlace(enlace))
                if !resto.isEmpty { salida.append(.plano(resto)) }
            } else if esCorreo(t) {
                salida.append(.correo(t))
            } else if esTelefono(t) {
                // Pegado a letras o a más cifras no es un teléfono: es parte de
                // un RUC, una cuenta o un código, y se queda como texto.
                let pegado = letraOCifra(ns, m.range.location - 1)
                    || letraOCifra(ns, m.range.location + m.range.length)
                if !pegado, let limpio = limpiarTelefono(t) {
                    salida.append(.telefono(escrito: t, limpio: limpio))
                } else {
                    salida.append(.plano(t))
                }
            } else if t.hasPrefix("```") {
                salida.append(.mono(String(t.dropFirst(3).dropLast(3))))
            } else if t.hasPrefix("*") {
                salida.append(.negrita(String(t.dropFirst().dropLast())))
            } else if t.hasPrefix("_") {
                salida.append(.cursiva(String(t.dropFirst().dropLast())))
            } else if t.hasPrefix("~") {
                salida.append(.tachado(String(t.dropFirst().dropLast())))
            }
            cursor = m.range.location + m.range.length
        }
        if cursor < ns.length {
            salida.append(.plano(ns.substring(from: cursor)))
        }
        return salida
    }

    /// El texto ya formateado, listo para un `Text`.
    static func atribuido(_ texto: String) -> AttributedString {
        var salida = AttributedString("")
        for tramo in tramos(de: texto) {
            switch tramo {
            case .plano(let t):
                salida += AttributedString(t)
            case .negrita(let t):
                var a = AttributedString(t)
                a.inlinePresentationIntent = .stronglyEmphasized
                salida += a
            case .cursiva(let t):
                var a = AttributedString(t)
                a.inlinePresentationIntent = .emphasized
                salida += a
            case .tachado(let t):
                var a = AttributedString(t)
                a.strikethroughStyle = .single
                salida += a
            case .mono(let t):
                var a = AttributedString(t)
                a.font = .system(.body, design: .monospaced)
                salida += a
            case .enlace(let t):
                var a = AttributedString(t)
                // Sin URL válida se deja como texto: un enlace roto que no
                // abre nada es peor que un enlace que se ve como texto.
                if let url = URL(string: t) {
                    a.link = url
                    a.underlineStyle = .single
                    a.foregroundColor = .enlace
                }
                salida += a
            case .correo(let t):
                var a = AttributedString(t)
                // Un mailto: para que se pueda tocar. La burbuja intercepta el
                // toque y ofrece copiarlo o escribirle, como WhatsApp.
                if let url = URL(string: "mailto:\(t)") {
                    a.link = url
                    a.underlineStyle = .single
                    a.foregroundColor = .enlace
                }
                salida += a
            case .telefono(let escrito, let limpio):
                // Espacios y guiones que no parten la línea: "987 654" arriba y
                // "321" abajo parecen dos números.
                var a = AttributedString(escrito
                    .replacingOccurrences(of: " ", with: "\u{00A0}")
                    .replacingOccurrences(of: "-", with: "\u{2011}"))
                // Un tel: para que se pueda tocar. La burbuja intercepta el
                // toque y ofrece copiarlo o llamar, como WhatsApp.
                if let url = URL(string: "tel:\(limpio)") {
                    a.link = url
                    a.underlineStyle = .single
                    a.foregroundColor = .enlace
                }
                salida += a
            }
        }
        return salida
    }
}

extension Color {
    /// El verde de los enlaces, como los pone WhatsApp: oscuro de día, claro
    /// de noche. Va puesto a mano y no por el tinte: en la burbuja propia el
    /// tinte era blanco, y sobre su fondo pastel el enlace no se veía.
    ///
    /// Además del gusto, se lee mejor: el azul de antes se quedaba en 3.7:1
    /// sobre la burbuja propia clara —por debajo del mínimo legible— y el
    /// verde llega a 5.4:1. De noche, 4.0:1 pasa a 5.5:1.
    static let enlace = Color(uiColor: UIColor { rasgos in
        rasgos.userInterfaceStyle == .dark
            ? UIColor(red: 0.482, green: 0.890, blue: 0.706, alpha: 1)   // #7BE3B4
            : UIColor(red: 0.043, green: 0.420, blue: 0.227, alpha: 1)   // #0B6B3A
    })
}
