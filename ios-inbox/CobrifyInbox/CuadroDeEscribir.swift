import SwiftUI
import UIKit

/// El cuadro de escribir del compositor: un `UITextView` propio, y NO el
/// `TextField` de SwiftUI, a propósito.
///
/// POR QUÉ (18-set-2026). Con el `TextField`, más o menos uno de cada veinte
/// envíos salía y el mensaje se quedaba escrito en el cuadro. Al tocar enviar,
/// el teclado confirma la palabra que tenía a medio corregir ("envio" →
/// "envío"). El `TextField` borra SU copia del texto, pero el cuadro de UIKit
/// que tiene debajo se entera recién en el siguiente dibujado; si la
/// confirmación del teclado cae justo en ese hueco, UIKit escribe de vuelta
/// todo lo que tenía. Los builds 53 y 56 lo parcharon borrando el "eco" cuando
/// aparecía, pero si llega en el mismo instante SwiftUI ni avisa del cambio y
/// el parche no se entera.
///
/// Acá el cuadro es nuestro. `ControlDelCuadro.vaciar(tras:)` lo deja en blanco
/// en el mismo toque de enviar, directo sobre UIKit, y le avisa al teclado que
/// el texto cambió para que suelte lo que tenía a medio confirmar: no queda
/// hueco. Y si aun así el teclado intentara devolver el mensaje entero en los
/// 2 s siguientes, se rechaza antes de que se vea.
///
/// Todo lo demás —placeholder, vidrio, relleno— lo pone SwiftUI por fuera,
/// igual que antes.
final class ControlDelCuadro {
    fileprivate weak var cuadro: UITextView?
    /// Lo que se acaba de mandar y cuándo: para reconocer al teclado
    /// devolviéndolo.
    fileprivate var enviado: (texto: String, cuando: Date)?

    /// Deja el cuadro en blanco YA, sin esperar al siguiente dibujado de
    /// SwiftUI. `tras` es lo que se acaba de mandar; sin él solo se limpia y
    /// se sigue vigilando lo que ya se vigilaba. Hay que poner también el
    /// borrador en "" (lo hace quien llama).
    func vaciar(tras texto: String? = nil) {
        if let texto { enviado = (texto: texto, cuando: Date()) }
        guard let cuadro else { return }
        // Lo que el teclado tenía a medio escribir (dictado, sugerencias) se
        // cierra antes de borrar, y el aviso de cambio le hace soltar la
        // corrección pendiente: sin eso podía aplicarla sobre el cuadro vacío.
        cuadro.unmarkText()
        cuadro.inputDelegate?.textWillChange(cuadro)
        cuadro.text = ""
        cuadro.inputDelegate?.textDidChange(cuadro)
        // "Agitar para deshacer" no tiene que resucitar lo que ya salió.
        cuadro.undoManager?.removeAllActions()
    }

    /// El texto vuelve al cuadro a propósito (un envío que falló, una
    /// respuesta rápida): desde ahí ya no hay eco que vigilar.
    func olvidarEnvio() {
        enviado = nil
    }

    /// ¿Esto es el mensaje recién enviado volviendo entero?
    fileprivate func esEco(_ texto: String) -> Bool {
        guard let e = enviado, Date().timeIntervalSince(e.cuando) < 2 else { return false }
        return Compositor.esElMismo(texto, e.texto)
    }

    #if DEBUG
    /// Vista previa con `-ecoDelTeclado`: escribe en el cuadro por el mismo
    /// camino que el teclado del iPhone, para probar la guarda sin él.
    func simularTeclado(_ texto: String) {
        cuadro?.insertText(texto)
    }
    #endif
}

struct CuadroDeEscribir: UIViewRepresentable {
    @Binding var texto: String
    @Binding var enfocado: Bool
    let control: ControlDelCuadro
    var lineasMaximas = 5

    func makeCoordinator() -> Coordinador { Coordinador(self) }

    func makeUIView(context: Context) -> UITextView {
        let cuadro = UITextView()
        cuadro.font = .preferredFont(forTextStyle: .body)
        cuadro.adjustsFontForContentSizeCategory = true
        cuadro.textColor = .label
        cuadro.tintColor = UIColor(named: "AccentColor") ?? .systemGreen
        cuadro.backgroundColor = .clear
        // Sin márgenes propios: el relleno lo pone SwiftUI, como al TextField,
        // y así el placeholder cae exacto donde empieza el texto.
        cuadro.textContainerInset = .zero
        cuadro.textContainer.lineFragmentPadding = 0
        cuadro.isScrollEnabled = false
        // Con más de cinco líneas se desplaza por dentro: lo que sube se corta
        // en su borde, dentro del relleno, y no en el borde del vidrio.
        cuadro.clipsToBounds = true
        cuadro.accessibilityLabel = "Mensaje"
        cuadro.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        cuadro.setContentHuggingPriority(.defaultLow, for: .horizontal)
        cuadro.delegate = context.coordinator
        cuadro.text = texto
        control.cuadro = cuadro
        return cuadro
    }

    func updateUIView(_ cuadro: UITextView, context: Context) {
        context.coordinator.padre = self
        control.cuadro = cuadro
        // Lo que llega de afuera —una respuesta rápida, el mensaje del alta, el
        // texto de un envío que falló— entra con el cursor al final. Lo que se
        // escribe no pasa por acá: sale del cuadro hacia `texto`, así que acá
        // ya son iguales. Nunca se pisa una palabra a medio componer.
        if cuadro.text != texto, cuadro.markedTextRange == nil {
            cuadro.text = texto
            let fin = cuadro.endOfDocument
            cuadro.selectedTextRange = cuadro.textRange(from: fin, to: fin)
            cuadro.invalidateIntrinsicContentSize()
        }
        // El foco se pide fuera del dibujado: hacerlo en medio avisa de vuelta
        // (`enfocado`) mientras SwiftUI todavía está actualizando.
        let quiere = enfocado
        if quiere != cuadro.isFirstResponder {
            DispatchQueue.main.async {
                if quiere, !cuadro.isFirstResponder, cuadro.window != nil {
                    cuadro.becomeFirstResponder()
                } else if !quiere, cuadro.isFirstResponder {
                    cuadro.resignFirstResponder()
                }
            }
        }
    }

    /// Crece con el texto de una a `lineasMaximas` líneas; más allá se queda en
    /// ese alto y se desplaza por dentro, como el `lineLimit(1...5)` de antes.
    func sizeThatFits(_ propuesta: ProposedViewSize, uiView cuadro: UITextView, context: Context) -> CGSize? {
        let ancho = propuesta.width ?? 240
        let medida = ancho.isFinite && ancho > 0 ? ancho : 10_000
        let linea = cuadro.font?.lineHeight ?? 20
        let tope = linea * CGFloat(lineasMaximas)
        let alto = cuadro.sizeThatFits(CGSize(width: medida, height: .greatestFiniteMagnitude)).height
        let desborda = alto > tope + 1
        if cuadro.isScrollEnabled != desborda {
            cuadro.isScrollEnabled = desborda
            cuadro.clipsToBounds = true
        }
        return CGSize(width: ancho, height: max(linea, min(alto, tope)))
    }

    final class Coordinador: NSObject, UITextViewDelegate {
        var padre: CuadroDeEscribir

        init(_ padre: CuadroDeEscribir) { self.padre = padre }

        func textView(_ cuadro: UITextView, shouldChangeTextIn rango: NSRange, replacementText nuevo: String) -> Bool {
            let actual = cuadro.text as NSString
            // Un cambio sobre un trozo que ya no existe es la corrección que el
            // teclado tenía pendiente del mensaje que ya salió: se descarta.
            guard NSMaxRange(rango) <= actual.length else { return false }
            // El mensaje recién enviado volviendo entero, de un golpe, al cuadro
            // vacío: es el teclado, no la persona, que escribe de a una letra.
            // Escribir "Ok gracias" después de mandar "Ok" pasa: letra a letra.
            if actual.length == 0, nuevo.count > 1, padre.control.esEco(nuevo) {
                return false
            }
            return true
        }

        func textViewDidChange(_ cuadro: UITextView) {
            // Red de seguridad por si el teclado lo mete por otro camino: si el
            // cuadro pasó de vacío a EXACTO lo recién enviado en un solo cambio,
            // se vuelve a vaciar. `padre.texto` todavía es lo de antes. Nada más
            // se toca mientras se escribe: "Ok" y luego "Ok gracias" llega a
            // "Ok" desde "O", no desde vacío, y queda entero.
            if padre.texto.isEmpty, cuadro.markedTextRange == nil, padre.control.esEco(cuadro.text) {
                padre.control.vaciar()
                padre.texto = ""
                return
            }
            if padre.texto != cuadro.text { padre.texto = cuadro.text }
            cuadro.invalidateIntrinsicContentSize()
        }

        func textViewDidBeginEditing(_ cuadro: UITextView) {
            if !padre.enfocado { padre.enfocado = true }
        }

        func textViewDidEndEditing(_ cuadro: UITextView) {
            if padre.enfocado { padre.enfocado = false }
        }
    }
}
