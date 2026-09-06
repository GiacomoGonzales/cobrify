import SwiftUI

/// Varias fotos mandadas de una vez van juntas en un álbum, como WhatsApp:
/// una cuadrícula de miniaturas en una sola burbuja, con "+N" en la última
/// cuando son más de cuatro. Tocar una abre el visor justo en esa foto —y
/// desde ahí se pasa a las demás.
///
/// Antes cada foto era su propia burbuja: mandar cinco llenaba la pantalla y
/// había que bajar un buen rato para llegar al mensaje siguiente.
struct BurbujaAlbum: View {
    let fotos: [Mensaje]
    let alAbrir: (Mensaje) -> Void

    @State private var guardando = false

    /// El ancho total del álbum. Igual de cómodo que una foto suelta, para
    /// que la conversación no cambie de ritmo.
    private let ancho: CGFloat = 240
    private let hueco: CGFloat = 2

    private var mitad: CGFloat { (ancho - hueco) / 2 }
    private var grande: CGFloat { ancho * 0.66 }
    private var chico: CGFloat { ancho - grande - hueco }
    private var chicoAlto: CGFloat { (grande - hueco) / 2 }

    private var esSaliente: Bool { fotos.first?.esSaliente == true }

    /// La celda pinta la foto o —si es un video— su fotograma con el play.
    @ViewBuilder
    private func miniatura(_ m: Mensaje) -> some View {
        if m.tipo == "video" {
            MiniaturaVideo(url: m.media?.url ?? "", compacta: true)
        } else {
            ImagenCacheada(url: m.media?.thumbUrl ?? m.media?.url ?? "") { img in
                img.resizable().scaledToFill()
            }
        }
    }

    var body: some View {
        HStack {
            if esSaliente { Spacer(minLength: 60) }
            // Sin burbuja: la cuadrícula va sola sobre el fondo del chat y
            // cada foto lleva su hora encima, como WhatsApp.
            cuadricula
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .contextMenu {
                Button {
                    guardarTodas()
                } label: {
                    Label("Guardar las \(fotos.count) fotos", systemImage: "square.and.arrow.down")
                }
            }
            if !esSaliente { Spacer(minLength: 60) }
        }
    }

    @ViewBuilder private var cuadricula: some View {
        switch fotos.count {
        case 2:
            HStack(spacing: hueco) {
                celda(fotos[0], mitad, mitad)
                celda(fotos[1], mitad, mitad)
            }
        case 3:
            // Una grande y dos apiladas al costado, como WhatsApp.
            HStack(spacing: hueco) {
                celda(fotos[0], grande, grande)
                VStack(spacing: hueco) {
                    celda(fotos[1], chico, chicoAlto)
                    celda(fotos[2], chico, chicoAlto)
                }
            }
        default:
            VStack(spacing: hueco) {
                HStack(spacing: hueco) {
                    celda(fotos[0], mitad, mitad)
                    celda(fotos[1], mitad, mitad)
                }
                HStack(spacing: hueco) {
                    celda(fotos[2], mitad, mitad)
                    celda(fotos[3], mitad, mitad, mas: fotos.count - 4)
                }
            }
        }
    }

    /// Una miniatura recortada al cuadro. Aquí sí se recorta a propósito: la
    /// cuadrícula tiene que ser pareja. La foto entera se ve al abrirla.
    @ViewBuilder
    private func celda(_ m: Mensaje, _ w: CGFloat, _ h: CGFloat, mas: Int = 0) -> some View {
        let foto = miniatura(m)
            .frame(width: w, height: h)
            .clipped()

        Group {
            if mas > 0 {
                // La del "+N" no lleva hora: ya está tapada por el número.
                foto.overlay {
                    ZStack {
                        Color.black.opacity(0.45)
                        Text("+\(mas)")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(.white)
                    }
                }
            } else {
                foto.conHoraEncima(m, radio: 0)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { alAbrir(m) }
    }

    private func guardarTodas() {
        guard !guardando else { return }
        guardando = true
        for m in fotos {
            if let u = m.media?.url ?? m.media?.thumbUrl {
                GuardadorFotos.guardar(url: u) { _ in }
            }
        }
        guardando = false
    }
}

/// La hora y las palomitas ENCIMA de la foto, con un velo oscuro abajo para
/// que se lean sobre cualquier imagen — como WhatsApp desde que las fotos ya
/// no van dentro de una burbuja.
struct HoraSobreLaFoto: View {
    let mensaje: Mensaje

    var body: some View {
        HStack(spacing: 4) {
            Text(Formato.horaCorta(mensaje.timestamp))
                .font(.caption2)
                .foregroundStyle(.white)
            if mensaje.esSaliente {
                switch mensaje.estado {
                case "read":
                    Text("✓✓").font(.caption2).kerning(-3).foregroundStyle(Color(hex: "#8FD8FF"))
                case "delivered":
                    Text("✓✓").font(.caption2).kerning(-3).foregroundStyle(.white)
                case "failed":
                    Image(systemName: "exclamationmark.circle").font(.caption2).foregroundStyle(.red)
                case "sending":
                    Image(systemName: "clock").font(.caption2).foregroundStyle(.white)
                default:
                    Text("✓").font(.caption2).foregroundStyle(.white)
                }
            }
        }
        .shadow(color: .black.opacity(0.6), radius: 2)
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
    }
}

extension View {
    /// La foto con su hora encima, ya recortada. `radio` en 0 para las
    /// celdas de un álbum, que se recortan todas juntas por fuera.
    func conHoraEncima(_ m: Mensaje, radio: CGFloat = 12) -> some View {
        self
            .overlay(alignment: .bottom) {
                LinearGradient(colors: [.clear, .black.opacity(0.45)],
                               startPoint: .top, endPoint: .bottom)
                    .frame(height: 44)
                    .allowsHitTesting(false)
            }
            .overlay(alignment: .bottomTrailing) { HoraSobreLaFoto(mensaje: m) }
            .clipShape(RoundedRectangle(cornerRadius: radio))
    }
}

/// La hora y las palomitas de un mensaje. Vive suelto porque lo usan la
/// burbuja normal, la de audio y el álbum: si cambia, cambia en los tres.
struct PieMensaje: View {
    let mensaje: Mensaje

    var body: some View {
        HStack(spacing: 4) {
            Text(Formato.horaCorta(mensaje.timestamp))
                .font(.caption2)
                .foregroundStyle(.secondary)
            if mensaje.esSaliente {
                switch mensaje.estado {
                case "read":
                    Text("✓✓").font(.caption2).kerning(-3).foregroundStyle(.blue)
                case "delivered":
                    Text("✓✓").font(.caption2).kerning(-3).foregroundStyle(.secondary)
                case "failed":
                    Image(systemName: "exclamationmark.circle")
                        .font(.caption2).foregroundStyle(.red)
                case "sending":
                    Image(systemName: "clock")
                        .font(.caption2).foregroundStyle(.secondary)
                default:
                    Text("✓").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }
}
