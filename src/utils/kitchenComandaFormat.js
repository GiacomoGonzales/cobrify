/**
 * Constructor ÚNICO del contenido de la comanda de cocina.
 *
 * Devuelve una lista de "líneas" independiente del motor de impresión, para que
 * TODAS las conexiones (Bluetooth, WiFi, estación, BLE) y el HTML de PC/web
 * impriman exactamente el MISMO formato. Antes cada conexión tenía su propia
 * copia del layout y se habían desincronizado.
 *
 * Cada línea es un objeto:
 *   { t: string, a: 'L'|'C', b: boolean, big: boolean, xl: boolean }  // texto
 *
 * `xl` marca las líneas que la COCINA lee de lejos —títulos, nombre del plato,
 * sus modificadores y las notas—. Son las únicas que se ensanchan cuando el
 * usuario sube el tamaño de letra; los datos del pedido crecen solo en alto,
 * porque son largos y con el ancho doble no entrarían.
 *   { sep: true }                                          // separador ----
 *   { blank: true }                                        // línea en blanco
 *
 * El texto va SANEADO (sin saltos de línea internos, que causaban "huecos
 * enormes" cuando el nombre de un producto traía \n) pero SIN convertir los
 * acentos: eso lo hace cada motor con su propio convertSpanishText().
 */

import { factorDeAncho } from './escposCharSize';

const CHARS = { 58: 24, 80: 42 };

/**
 * Cuántos caracteres entran en una línea.
 *
 * Con la comanda en letra grande la impresora usa el DOBLE de ancho por
 * carácter, así que entra la mitad. Si el texto se sigue cortando a 24/42 la
 * impresora lo parte donde le toca —a mitad de palabra, sin la sangría que
 * alinea las continuaciones— y la comanda queda peor que en letra chica.
 */
const charsFor = (w, escala = 0) => Math.floor((CHARS[w] || CHARS[58]) / factorDeAncho(escala));

// El separador se imprime SIEMPRE en tamaño normal (ver los renderers), así
// que su largo no depende de la escala: son los 24/42 guiones de siempre.
export const separatorFor = (w) => '-'.repeat(CHARS[w] || CHARS[58]);

/**
 * Limpia texto para impresión térmica: colapsa saltos de línea y espacios
 * múltiples a un solo espacio y recorta. Esto evita el hueco gigante cuando un
 * nombre/nota viene con \n metidos.
 */
export const sanitizeThermalText = (s) =>
  String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/** Quita el/los '#' iniciales del número de orden para no duplicarlo (##005 -> 005). */
const cleanOrderNumber = (n) => String(n == null ? '' : n).replace(/^#+/, '').trim();

/**
 * Envuelve `text` a `width` columnas con sangría colgante: las continuaciones
 * quedan alineadas bajo el primer carácter del texto (después del prefijo).
 *
 * Nunca devuelve una línea más larga que `width`, ni siquiera cuando una sola
 * palabra no entra: en ese caso la parte. Antes se empujaba entera y la
 * impresora la cortaba donde le tocaba, perdiendo la sangría y dejando la
 * continuación pegada al borde. No se notaba con 24/42 columnas, pero con la
 * letra ensanchada quedan 12 y "PLANCHA" ya no entra después de un prefijo.
 */
const wrapHanging = (prefix, text, width) => {
  const ancho = Math.max(4, width | 0);
  const sangria = Math.min(prefix.length, Math.floor(ancho / 2));
  const indent = ' '.repeat(sangria);
  // Lo que queda para el texto en la línea más apretada de las dos.
  const util = Math.max(1, ancho - Math.max(prefix.length, sangria));

  const palabras = sanitizeThermalText(text).split(' ').filter(Boolean);
  if (palabras.length === 0) return [prefix.trimEnd() || ''];

  const trozos = [];
  for (const p of palabras) {
    if (p.length <= util) { trozos.push(p); continue; }
    for (let i = 0; i < p.length; i += util) trozos.push(p.slice(i, i + util));
  }

  const out = [];
  let cur = prefix;
  let started = false;
  for (const p of trozos) {
    const next = started ? cur + ' ' + p : cur + p;
    if (!started || next.length <= ancho) {
      cur = next;
      started = true;
    } else {
      out.push(cur);
      cur = indent + p;
    }
  }
  out.push(cur);
  return out;
};

const line = (t, opts = {}) => ({ t, a: opts.a || 'L', b: !!opts.b, big: !!opts.big, xl: !!opts.xl });
const SEP = { sep: true };

const TYPE_LABELS = { delivery: 'DELIVERY', takeaway: 'PARA LLEVAR', counter: 'EN LOCAL' };
const PAY_LABELS = {
  efectivo: 'Efectivo', cash: 'Efectivo', yape: 'Yape', plin: 'Plin',
  tarjeta: 'Tarjeta', card: 'Tarjeta', transferencia: 'Transferencia', transfer: 'Transferencia',
};

const currentTime = () =>
  new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

/**
 * Arma la comanda como lista de líneas.
 * @param {Object} order  Orden (items, orderNumber, orderType, flags _isCopy/_printNote/_ultraCompact/_showCustomerData, etc.)
 * @param {Object|null} table  { number, waiter } si es de mesa
 * @param {number} paperWidth  58 | 80
 * @param {string|null} stationName  Nombre de la estación (cocina/barra). Si no hay, el título es "COMANDA".
 * @param {number} escala  Tamaño de letra elegido (0 = normal). Solo se usa
 *                         para cortar el texto al ancho real: con letra grande
 *                         entra la mitad por línea.
 */
export const buildKitchenLines = (order = {}, table = null, paperWidth = 58, stationName = null, escala = 0) => {
  const width = charsFor(paperWidth);        // datos del pedido: ancho de siempre
  const anchoXL = charsFor(paperWidth, escala);  // lo que se ensancha: la mitad
  const ensancha = anchoXL < width;

  /**
   * Con la letra ensanchada los asteriscos no entran —en 58 mm quedan 12
   * caracteres por línea— y tampoco hacen falta: el tamaño ya destaca la
   * línea. Sin ensanchar, el adorno queda igual que siempre.
   */
  const destacado = (texto, adorno = '***') => (ensancha ? texto : `${adorno} ${texto} ${adorno}`);

  // Con la letra ensanchada la sangría cuesta el doble: "  Nota: " se come 8
  // de las 12 columnas de un papel de 58 mm.
  const prefijoOpcion = ensancha ? '> ' : '  > ';
  const prefijoNota = ensancha ? 'Nota: ' : '  Nota: ';

  const ultra = !!order._ultraCompact;
  const showCust = !!order._showCustomerData;
  const lines = [];

  // --- Encabezado ---
  if (order._isCopy) lines.push(line(destacado('COPIA'), { a: 'C', b: true, big: true, xl: true }));
  lines.push(line('COMANDA', { a: 'C', b: true, big: true, xl: true }));
  const station = sanitizeThermalText(stationName);
  if (station) {
    wrapHanging('', station.toUpperCase(), anchoXL).forEach((t) => lines.push(line(t, { a: 'C', b: true, xl: true })));
  }
  if (order._printNote) {
    const nota = destacado(sanitizeThermalText(order._printNote).toUpperCase());
    wrapHanging('', nota, anchoXL).forEach((t) => lines.push(line(t, { a: 'C', b: true, xl: true })));
  }
  lines.push(SEP);

  // --- Info de la orden (compacta) ---
  const orderNum = cleanOrderNumber(order.orderNumber) || (order.id ? String(order.id).slice(-6) : 'N/A');
  const time = currentTime();

  if (ultra) {
    lines.push(line(`#${orderNum}   ${time}`, { b: true }));
    if (table) {
      const mozo = table.waiter ? `   Mozo: ${sanitizeThermalText(table.waiter)}` : '';
      lines.push(line(`Mesa ${table.number}${mozo}`));
    } else if (order.orderType && TYPE_LABELS[order.orderType]) {
      const cust = showCust && order.customerName ? ` - ${sanitizeThermalText(order.customerName)}` : '';
      wrapHanging('', `${TYPE_LABELS[order.orderType]}${cust}`, width).forEach((t) => lines.push(line(t, { b: true })));
    }
    if (showCust && order.customerAddress) {
      wrapHanging('', order.customerAddress, width).forEach((t) => lines.push(line(t)));
    }
  } else {
    if (table) {
      lines.push(line(`Orden #${orderNum}   Mesa ${table.number}`, { b: true }));
      const mozo = sanitizeThermalText(table.waiter || '');
      lines.push(line(mozo ? `${time}   Mozo: ${mozo}` : time));
    } else {
      lines.push(line(`Orden #${orderNum}   ${time}`, { b: true }));
    }
    if (order.brandName) lines.push(line(`Marca: ${sanitizeThermalText(order.brandName)}`));
    if (showCust && order.customerName) {
      wrapHanging('Cliente: ', order.customerName, width).forEach((t) => lines.push(line(t)));
    }
    if (showCust && order.customerPhone) lines.push(line(`Tel: ${sanitizeThermalText(order.customerPhone)}`));
    if (showCust && order.customerAddress) {
      wrapHanging('Dir: ', order.customerAddress, width).forEach((t) => lines.push(line(t)));
    }
    if (order.orderType && !table && TYPE_LABELS[order.orderType]) {
      lines.push(line(destacado(TYPE_LABELS[order.orderType]), { a: 'C', b: true, big: true, xl: true }));
    }
    if (order.priority === 'urgent') {
      lines.push(line(destacado('URGENTE', '!!!'), { a: 'C', b: true, big: true, xl: true }));
    }
  }

  // --- Estado de pago (delivery / para llevar) ---
  if (showCust && !table && (order.orderType === 'delivery' || order.orderType === 'takeaway')) {
    const amt = Number(order.total || 0).toFixed(2);
    const payLabel = PAY_LABELS[(order.paymentMethod || '').toLowerCase()] || '';
    const suffix = payLabel ? ` (${payLabel})` : '';
    lines.push(SEP);
    if (order.paid) {
      const pagado = `PAGADO - S/ ${amt}${suffix}`;
      if (pagado.length <= width) {
        lines.push(line(pagado, { a: 'C', b: true }));
      } else {
        // En 58 mm no entra: "PAGADO - S/ 34.00 (Efectivo)" son 28 caracteres
        // contra 24 de papel, y la impresora lo parte a mitad de palabra. El
        // metodo de pago baja a su propia linea.
        lines.push(line(`PAGADO - S/ ${amt}`, { a: 'C', b: true }));
        if (payLabel) lines.push(line(`(${payLabel})`, { a: 'C' }));
      }
    } else {
      lines.push(line(destacado('POR COBRAR', '**'), { a: 'C', b: true, big: true, xl: true }));
      lines.push(line(`S/ ${amt}${suffix}`, { a: 'C', b: true }));
    }
  }

  lines.push(SEP);

  // --- Items ---
  for (const item of order.items || []) {
    const qty = item.quantity != null ? item.quantity : 1;
    wrapHanging(`${qty}x `, item.name, anchoXL).forEach((t) => lines.push(line(t, { b: true, xl: true })));

    if (item.modifiers && item.modifiers.length > 0) {
      if (ultra) {
        const allOpts = item.modifiers.flatMap((m) =>
          (m.options || []).map((o) => `${o.quantity > 1 ? o.quantity + 'x ' : ''}${sanitizeThermalText(o.optionName)}`),
        );
        if (allOpts.length > 0) {
          wrapHanging(prefijoOpcion, allOpts.join(', '), anchoXL).forEach((t) => lines.push(line(t, { xl: true })));
        }
      } else {
        for (const modifier of item.modifiers) {
          for (const option of (modifier.options || [])) {
            // SIN precio: la comanda no lleva montos. A la cocina le importa
            // qué preparar, no cuánto cuesta, y el importe del adicional solo
            // ocupa lugar en un papel que se lee de lejos y apurado. Los
            // montos van en la precuenta y en el comprobante.
            const txt = `${option.quantity > 1 ? option.quantity + 'x ' : ''}${sanitizeThermalText(option.optionName)}`;
            wrapHanging(prefijoOpcion, txt, anchoXL).forEach((t) => lines.push(line(t, { xl: true })));
          }
        }
      }
    }

    if (item.notes) {
      wrapHanging(ultra ? '  ' : prefijoNota, item.notes, anchoXL).forEach((t) => lines.push(line(t, { xl: true })));
    }
  }

  lines.push(SEP);
  return lines;
};

/**
 * Estaciones de cocina que deben recibir la comanda de ESTA orden.
 *
 * Criterio ÚNICO de ruteo por sucursal. Vive acá porque el mismo bucle de
 * estaciones está repetido en Mesas, Pedidos y el servicio de impresión: si
 * cada copia decidiera por su cuenta, se desincronizarían (ya pasó con el
 * layout de la comanda, que es justo por lo que existe este archivo).
 *
 * `station.branchId`:
 *   null/'' -> todas las sedes. Es el valor de las estaciones creadas antes de
 *              que existiera el campo; excluirlas dejaría sin comandas a quien
 *              todavía no las haya clasificado.
 *   'main'  -> solo Sucursal Principal (órdenes sin branchId).
 *   <id>    -> solo esa sucursal.
 */
export const stationsForOrder = (order, kitchenStations = []) => {
  const claveSede = order?.branchId || 'main';
  return (kitchenStations || []).filter(
    (st) => !st.branchId || st.branchId === claveSede
  );
};
