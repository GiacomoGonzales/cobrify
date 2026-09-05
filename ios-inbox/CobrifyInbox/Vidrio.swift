import SwiftUI

/// Liquid Glass nativo cuando el sistema lo tiene (iOS 26+); material
/// translúcido clásico como respaldo. Un solo lugar para todo el vidrio.
struct VidrioCapsula: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: .capsule)
        } else {
            content.background(.ultraThinMaterial, in: Capsule())
        }
    }
}

struct VidrioRedondeado: ViewModifier {
    var radio: CGFloat = 20
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: .rect(cornerRadius: radio))
        } else {
            content.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radio))
        }
    }
}

extension View {
    func vidrioCapsula() -> some View { modifier(VidrioCapsula()) }
    func vidrioRedondeado(_ radio: CGFloat = 20) -> some View { modifier(VidrioRedondeado(radio: radio)) }

    /// La tab bar se encoge al bajar por la lista (iOS 26).
    @ViewBuilder func tabBarQueSeEncoge() -> some View {
        if #available(iOS 26.0, *) {
            self.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            self
        }
    }
}

extension View {
    /// Avisa, en cada movimiento, cuántos puntos faltan para el final de la
    /// lista; con eso se decide la flecha de "bajar". Va la distancia y no
    /// un sí/no a propósito: el sí/no solo avisaba al cambiar, y si la
    /// flecha se apagaba a mano sin haber llegado, no había aviso nuevo que
    /// la volviera a encender. Necesita iOS 18; en versiones previas
    /// simplemente no aparece el botón.
    @ViewBuilder func alMoverseLaLista(_ accion: @escaping (CGFloat) -> Void) -> some View {
        if #available(iOS 18.0, *) {
            self.onScrollGeometryChange(for: CGFloat.self) { geo in
                geo.contentSize.height - (geo.contentOffset.y + geo.containerSize.height)
            } action: { _, distancia in
                accion(distancia)
            }
        } else {
            self
        }
    }
}
