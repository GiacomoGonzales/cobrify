/**
 * Constructor ÚNICO del contenido de la comanda de cocina.
 *
 * Devuelve una lista de "líneas" independiente del motor de impresión, para que
 * TODAS las conexiones (Bluetooth, WiFi, estación, BLE) y el HTML de PC/web
 * impriman exactamente el MISMO formato. Antes cada conexión tenía su propia
 * copia del layout y se habían desincronizado.
 *
 * Cada línea es un objeto:
 *   { t: string, a: 'L'|'C', b: boolean, big: boolean }   // texto
 *   { sep: true }                                          // separador ----
 *   { blank: true }                                        // línea en blanco
 *
 * El texto va SANEADO (sin saltos de línea internos, que causaban "huecos
 * enormes" cuando el nombre de un producto traía \n) pero SIN convertir los
 * acentos: eso lo hace cada motor con su propio convertSpanishText().
 */

const CHARS = { 58: 24, 80: 42 };
const charsFor = (w) => CHARS[w] || CHARS[58];

export const separatorFor = (w) => '-'.repeat(charsFor(w));

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
 * Usa un ancho conservador (24/42) => nunca desborda, a lo sumo corta un poco
 * antes que la impresora.
 */
const wrapHanging = (prefix, text, width) => {
  const indent = ' '.repeat(prefix.length);
  const words = sanitizeThermalText(text).split(' ').filter(Boolean);
  if (words.length === 0) return [prefix.trimEnd() || ''];
  const out = [];
  let cur = prefix;
  let started = false;
  for (const w of words) {
    const next = started ? cur + ' ' + w : cur + w;
    if (!started || next.length <= width) {
      cur = next;
      started = true;
    } else {
      out.push(cur);
      cur = indent + w;
    }
  }
  out.push(cur);
  return out;
};

const line = (t, opts = {}) => ({ t, a: opts.a || 'L', b: !!opts.b, big: !!opts.big });
const SEP = { sep: true };

const TYPE_LABELS = { delivery: 'DELIVERY', takeaway: 'PARA LLEVAR' };
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
 */
export const buildKitchenLines = (order = {}, table = null, paperWidth = 58, stationName = null) => {
  const width = charsFor(paperWidth);
  const ultra = !!order._ultraCompact;
  const showCust = !!order._showCustomerData;
  const lines = [];

  // --- Encabezado ---
  if (order._isCopy) lines.push(line('*** COPIA ***', { a: 'C', b: true, big: true }));
  lines.push(line('COMANDA', { a: 'C', b: true, big: true }));
  const station = sanitizeThermalText(stationName);
  if (station) lines.push(line(station.toUpperCase(), { a: 'C', b: true }));
  if (order._printNote) {
    lines.push(line(`*** ${sanitizeThermalText(order._printNote).toUpperCase()} ***`, { a: 'C', b: true }));
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
      lines.push(line(`${TYPE_LABELS[order.orderType]}${cust}`, { b: true }));
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
      lines.push(line(`*** ${TYPE_LABELS[order.orderType]} ***`, { a: 'C', b: true, big: true }));
    }
    if (order.priority === 'urgent') {
      lines.push(line('!!! URGENTE !!!', { a: 'C', b: true, big: true }));
    }
  }

  // --- Estado de pago (delivery / para llevar) ---
  if (showCust && !table && (order.orderType === 'delivery' || order.orderType === 'takeaway')) {
    const amt = Number(order.total || 0).toFixed(2);
    const payLabel = PAY_LABELS[(order.paymentMethod || '').toLowerCase()] || '';
    const suffix = payLabel ? ` (${payLabel})` : '';
    lines.push(SEP);
    if (order.paid) {
      lines.push(line(`PAGADO - S/ ${amt}${suffix}`, { a: 'C', b: true }));
    } else {
      lines.push(line('** POR COBRAR **', { a: 'C', b: true, big: true }));
      lines.push(line(`S/ ${amt}${suffix}`, { a: 'C', b: true }));
    }
  }

  lines.push(SEP);

  // --- Items ---
  for (const item of order.items || []) {
    const qty = item.quantity != null ? item.quantity : 1;
    wrapHanging(`${qty}x `, item.name, width).forEach((t) => lines.push(line(t, { b: true })));

    if (item.modifiers && item.modifiers.length > 0) {
      if (ultra) {
        const allOpts = item.modifiers.flatMap((m) =>
          (m.options || []).map((o) => `${o.quantity > 1 ? o.quantity + 'x ' : ''}${sanitizeThermalText(o.optionName)}`),
        );
        if (allOpts.length > 0) {
          wrapHanging('  > ', allOpts.join(', '), width).forEach((t) => lines.push(line(t)));
        }
      } else {
        for (const modifier of item.modifiers) {
          for (const option of (modifier.options || [])) {
            let txt = `${option.quantity > 1 ? option.quantity + 'x ' : ''}${sanitizeThermalText(option.optionName)}`;
            if (option.priceAdjustment > 0) {
              txt += ` (+S/${((option.priceAdjustment || 0) * (option.quantity || 1)).toFixed(2)})`;
            }
            wrapHanging('  > ', txt, width).forEach((t) => lines.push(line(t)));
          }
        }
      }
    }

    if (item.notes) {
      wrapHanging(ultra ? '  ' : '  Nota: ', item.notes, width).forEach((t) => lines.push(line(t)));
    }
  }

  lines.push(SEP);
  return lines;
};
