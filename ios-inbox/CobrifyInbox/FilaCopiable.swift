import SwiftUI
import UIKit

/// Una fila de la ficha con un dato que se copia de un toque. El botoncito de
/// al lado pone el valor en el portapapeles, se vuelve una palomita un
/// momento y el teléfono vibra suave, para que se sepa que se copió sin
/// tener que pegarlo en ningún lado.
///
/// Nació para el RUC (pedido de Giacomo, 14-set-2026): se lo piden a cada
/// rato para facturar o para buscarlo en SUNAT, y seleccionarlo con el dedo
/// dentro de una lista es de lo más incómodo.
struct FilaCopiable: View {
    let etiqueta: String
    let valor: String
    @State private var copiado = false

    private var limpio: String { valor.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        LabeledContent(etiqueta) {
            HStack(spacing: 6) {
                Text(limpio)
                    .textSelection(.enabled)
                Button {
                    UIPasteboard.general.string = limpio
                    copiado = true
                    Task {
                        try? await Task.sleep(for: .seconds(1.5))
                        copiado = false
                    }
                } label: {
                    Image(systemName: copiado ? "checkmark" : "doc.on.doc")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(copiado ? AnyShapeStyle(Color.green) : AnyShapeStyle(.tint))
                        .contentTransition(.symbolEffect(.replace))
                        .frame(width: 30, height: 30)
                        .contentShape(Rectangle())
                }
                // borderless: dentro de una List, sin esto el toque en
                // CUALQUIER parte de la fila dispararía el botón.
                .buttonStyle(.borderless)
                .accessibilityLabel(copiado ? "\(etiqueta) copiado" : "Copiar \(etiqueta)")
                .sensoryFeedback(.success, trigger: copiado) { _, nuevo in nuevo }
            }
        }
    }
}
