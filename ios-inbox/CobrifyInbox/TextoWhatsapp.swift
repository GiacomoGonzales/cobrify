import SwiftUI

/// Texto de un mensaje con el formato de WhatsApp.
///
/// WhatsApp marca el formato con caracteres: `*negrita*`, `_cursiva_`,
/// `~tachado~` y ```` ```monoespaciado``` ````. El cliente los escribe así y su
/// app se los muestra formateados; hasta ahora la bandeja mostraba los
/// asteriscos pelados. También vuelve tocables los enlaces.
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
    }

    // Mismo orden que la web: el enlace primero, para que un `_` dentro de una
    // dirección no la parta en cursiva.
    private static let patron: NSRegularExpression? = try? NSRegularExpression(
        pattern: [
            #"https?://[^\s<>"]+"#,
            #"\*[^*\n]+\*"#,
            #"_[^_\n]+_"#,
            #"~[^~\n]+~"#,
            "```[^`]+```",
        ].joined(separator: "|")
    )

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
                }
                salida += a
            }
        }
        return salida
    }
}
