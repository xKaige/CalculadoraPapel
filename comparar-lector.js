// Lectura de una orden de trabajo / presupuesto en texto (sacado de un PDF) y comparación.
// Funciones puras: se pueden probar sin navegador.

const sinTildes = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "1.234.567,89" | "1,234,567.89" | "1234,5" | "12.000" → número
export function numero(txt) {
  if (txt == null) return NaN;
  let s = String(txt).replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  const ultPunto = s.lastIndexOf('.'), ultComa = s.lastIndexOf(',');
  if (ultPunto >= 0 && ultComa >= 0) {
    if (ultComa > ultPunto) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (ultComa >= 0) {
    // "12,000" con 3 decimales exactos y sin otra coma → miles; "12,5" → decimal
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (ultPunto >= 0) {
    s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  }
  return parseFloat(s);
}

const NUM = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?`;
const DINERO = String.raw`(?:\$|ars|u\$s|usd|us\$)?\s*(${NUM})`;

const PAPELES = ['autoadhesivo', 'ilustracion', 'obra', 'cartulina', 'duplex', 'triplex', 'kraft', 'opalina', 'bond', 'couche', 'sulfito',
  'carton', 'vinilo', 'fasson', 'propalcote', 'madera', 'reciclado', 'ahuesado', 'tissue', 'papel de seda', 'microcorrugado', 'polipropileno', 'sobre'];

function medidasDe(linea) {
  const out = [];
  const re = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*(cm|mm)?\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm)?`, 'g');
  let m;
  while ((m = re.exec(linea))) {
    let a = numero(m[1]), b = numero(m[3]);
    if (!(a > 0 && b > 0)) continue;
    const u = (m[2] || m[4] || '').toLowerCase();
    // sin unidad: valores grandes son mm, chicos cm
    const enMm = u === 'mm' || (!u && Math.max(a, b) > 150);
    if (!enMm) { a *= 10; b *= 10; }
    out.push({ a: Math.min(a, b), b: Math.max(a, b), txt: m[0].trim() });   // en mm
  }
  return out;
}

// Lee los datos que reconoce. Devuelve { campo: { valor, txt } } (valor numérico o texto).
export function leerOrden(texto) {
  const lineas = String(texto || '').split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const r = {};
  const poner = (k, valor, txt) => { if (r[k] == null && valor != null && valor !== '' && !(typeof valor === 'number' && isNaN(valor))) r[k] = { valor, txt: String(txt || '').slice(0, 120) }; };
  const L = lineas.map(l => ({ l, n: sinTildes(l) }));

  // --- Cliente y trabajo
  for (const { l, n } of L) {
    let m = l.match(/^\s*(?:cliente|razon social|razón social|se[ñn]or(?:es)?|sr(?:es)?\.?)\s*[:\-]\s*(.+)$/i);
    if (m) poner('cliente', m[1].replace(/\s{2,}.*$/, '').trim(), l);
    m = l.match(/^\s*(?:trabajo|descripci[oó]n|producto|detalle|art[ií]culo|concepto)\s*[:\-]\s*(.+)$/i);
    if (m) poner('trabajo', m[1].replace(/\s{2,}.*$/, '').trim(), l);
  }

  // --- Número de orden / referencia del cliente
  for (const { l, n } of L) {
    const m = n.match(/(?:orden(?: de (?:trabajo|compra|produccion))?|o\.?\s?[tc]\.?|pedido|presupuesto|nota de pedido)\s*(?:nro\.?|numero|n[°ºo.]*|#)\s*[:\-]?\s*([a-z0-9][\w\-\/]*)/);
    if (m && /\d/.test(m[1])) { poner('referencia', l.slice(0, 60).trim(), l); break; }
  }

  // --- Medidas (pliego y trabajo)
  const todas = [];
  for (const { l, n } of L) for (const md of medidasDe(l)) {
    const esPliego = /pliego|formato de papel|papel|hoja|resma|bobina/.test(n) && !/terminad|cerrad|abiert|corte a corte|final/.test(n);
    const esTrabajo = /medida|tamano|terminad|corte|cerrad|abiert|final|etiqueta|producto|formato/.test(n) && !/pliego/.test(n);
    todas.push({ ...md, esPliego, esTrabajo, l });
  }
  const pl = todas.find(x => x.esPliego) || todas.filter(x => !x.esTrabajo && x.b >= 450).sort((p, q) => q.b - p.b)[0];
  const tr = todas.find(x => x.esTrabajo && x !== pl) || todas.filter(x => x !== pl).sort((p, q) => p.b - q.b)[0];
  if (pl) poner('pliego', { a: pl.a, b: pl.b }, pl.l);
  if (tr) poner('medida', { a: tr.a, b: tr.b }, tr.l);

  // --- Gramaje y papel
  for (const { l, n } of L) {
    const g = n.match(/(\d{2,3})\s*(?:g|gr|grs|gramos|g\/m2|gsm|g\/m²)\b/);
    if (g) { poner('gramaje', +g[1], l); }
    const p = PAPELES.find(k => n.includes(k));
    if (p) {
      // el tipo de papel con lo que le sigue (brillo, mate, etc.)
      const idx = n.indexOf(p);
      const frag = l.slice(idx, idx + 40).split(/[,;|]|\s{2,}/)[0].replace(/\s*\d{2,3}\s*(g|gr|grs|gramos)\b.*$/i, '').trim();
      poner('papel', frag || p, l);
    }
  }

  // --- Cantidad, pliegos, colores
  for (const { l, n } of L) {
    let m = n.match(new RegExp(String.raw`cantidad(?: de (?:ejemplares|unidades|etiquetas))?\s*[:=]?\s*(${NUM})`));
    if (m) poner('cantidad', numero(m[1]), l);
    m = n.match(new RegExp(String.raw`(${NUM})\s*(?:ejemplares|unidades|unid\.?|u\.|ej\.?|etiquetas|folletos|copias|tarjetas|volantes|cajas|stickers)\b`));
    if (m) poner('cantidad', numero(m[1]), l);
    m = n.match(new RegExp(String.raw`(${NUM})\s*(?:pliegos|hojas)\b`)) || n.match(new RegExp(String.raw`(?:pliegos|hojas)\s*[:=]?\s*(${NUM})`));
    if (m && !/x\s*\d/.test(m[0])) poner('pliegos', numero(m[1]), l);
    m = n.match(/\b([0-8])\s*\/\s*([0-8])\b/);
    if (m && /color|impres|tinta|frente|dorso|\b[0-8]\/[0-8]\b/.test(n)) poner('colores', `${m[1]}/${m[2]}`, l);
    m = n.match(/\b([1-8])\s*(?:colores|tintas)\b/);
    if (m) poner('colores', `${m[1]}/${/frente y dorso|f\/d|ambas caras|doble faz/.test(n) ? m[1] : 0}`, l);
    if (/full color|cuatricromia|cmyk/.test(n)) poner('colores', /frente y dorso|f\/d|doble faz/.test(n) ? '4/4' : '4/0', l);
  }

  // --- Precios
  for (const { l, n } of L) {
    let m = n.match(new RegExp(String.raw`(?:precio\s*)?unitario[^\d$]*${DINERO}`)) || n.match(new RegExp(String.raw`${DINERO}\s*(?:c\/u|cada uno|por unidad|x unidad|\/u)\b`));
    if (m) poner('unitario', numero(m[1]), l);
    m = n.match(new RegExp(String.raw`(?:sub\s*total|subtotal|neto|total sin iva|importe sin iva|precio sin iva)[^\d$]*${DINERO}`));
    if (m) poner('subtotal', numero(m[1]), l);
    m = n.match(new RegExp(String.raw`(?:total con iva|total final|total a pagar|importe total|precio final|total\s*\(?con iva|precio mas iva|precio \+ iva)[^\d$]*${DINERO}`));
    if (m) poner('total', numero(m[1]), l);
  }
  // "Total" a secas (la última aparición): con IVA si el documento menciona IVA, si no sin IVA
  const totales = L.filter(x => /\btotal\b/.test(x.n) && !/sub\s*total|unitario|sin iva/.test(x.n));
  const ult = totales[totales.length - 1];
  if (ult) {
    const m = ult.n.match(new RegExp(String.raw`total[^\d$]*${DINERO}`));
    if (m) {
      const conIva = L.some(x => /\biva\b/.test(x.n));
      poner(conIva ? 'total' : 'subtotal', numero(m[1]), ult.l);
    }
  }
  const iva = L.find(x => /\biva\b/.test(x.n) && /21|10[.,]5|27/.test(x.n));
  if (iva) { const m = iva.n.match(/(21|10[.,]5|27)\s*%/); if (m) poner('iva', numero(m[1]), iva.l); }
  return r;
}

// ---------- Comparación ----------
export const CAMPOS = [
  ['cliente', 'Cliente', 'texto'],
  ['trabajo', 'Trabajo', 'texto'],
  ['pliego', 'Medida de pliego', 'medida'],
  ['medida', 'Medida del trabajo', 'medida'],
  ['papel', 'Tipo de papel', 'texto'],
  ['gramaje', 'Gramaje', 'num0'],
  ['colores', 'Colores', 'texto'],
  ['cantidad', 'Cantidad', 'num0'],
  ['pliegos', 'Hojas / pliegos', 'num0'],
  ['unitario', 'Precio unitario', 'dinero'],
  ['subtotal', 'Total sin IVA', 'dinero'],
  ['total', 'Total con IVA', 'dinero'],
];

// estado: 'ok' | 'no' | 'falta'
export function comparar(tipo, a, b, extra) {
  const vacio = v => v == null || v === '' || (typeof v === 'number' && !isFinite(v))
    || (Array.isArray(v) ? !v.some(x => !vacio(x)) : typeof v === 'object' && !(v.a > 0));
  if (vacio(a) || vacio(b)) return 'falta';
  if (tipo === 'medida') {
    // mismas medidas sin importar orientación, con 1 mm de tolerancia
    const igual = x => x && Math.abs(a.a - x.a) <= 1 && Math.abs(a.b - x.b) <= 1;
    return (Array.isArray(b) ? b.some(igual) : igual(b)) ? 'ok' : 'no';
  }
  if (tipo === 'num0') {
    if (Array.isArray(b)) return b.some(x => Math.abs(a - x) < 0.5) ? 'ok' : 'no';
    return Math.abs(a - b) < 0.5 ? 'ok' : 'no';
  }
  if (tipo === 'dinero') {
    const cerca = x => Math.abs(a - x) <= Math.max(1, Math.abs(x) * 0.005);   // 0,5 % o $1
    if (Array.isArray(b)) return b.some(cerca) ? 'ok' : 'no';
    return cerca(b) ? 'ok' : 'no';
  }
  // texto: coincide si una contiene a la otra o comparten la palabra principal
  const pa = sinTildes(a).replace(/[^a-z0-9/ ]/g, ' ').split(/\s+/).filter(w => w.length > 2 || /\d/.test(w));
  const pb = sinTildes(b).replace(/[^a-z0-9/ ]/g, ' ').split(/\s+/).filter(w => w.length > 2 || /\d/.test(w));
  if (!pa.length || !pb.length) return sinTildes(a).trim() === sinTildes(b).trim() ? 'ok' : 'no';
  const A = pa.join(' '), B = pb.join(' ');
  if (A.includes(B) || B.includes(A)) return 'ok';
  const comunes = pa.filter(w => pb.includes(w));
  return comunes.length >= Math.min(pa.length, pb.length) * 0.5 ? 'ok' : 'no';
}
