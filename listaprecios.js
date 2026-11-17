// Importar la lista de precios de una papelera (Excel o PDF) y emparejarla con los papeles del catálogo.
// Las funciones de interpretación son puras: se pueden probar sin navegador.
import { numero } from './comparar-lector.js';

const sinT = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

function cargarScript(src, listo) {
  if (listo()) return Promise.resolve();
  return new Promise((ok, mal) => {
    const s = document.createElement('script'); s.src = src;
    s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el lector (¿sin conexión?).'));
    document.head.appendChild(s);
  });
}

// Devuelve los renglones del archivo como listas de celdas (texto)
export async function leerArchivo(file) {
  const nombre = file.name.toLowerCase();
  if (/\.(xlsx?|ods|csv)$/.test(nombre)) {
    await cargarScript(XLSX_URL, () => window.XLSX);
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const filas = [];
    for (const hoja of wb.SheetNames) {
      const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: false, defval: '' });
      for (const r of rows) { const c = r.map(x => String(x ?? '').trim()); if (c.some(Boolean)) filas.push(c); }
    }
    return filas;
  }
  if (nombre.endsWith('.pdf')) {
    await cargarScript(PDFJS + 'pdf.min.js', () => window.pdfjsLib);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const filas = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({ s: it.str.trim(), x: it.transform[4], y: it.transform[5], w: it.width || 0 }));
      const renglones = [];
      for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
        const r = renglones.find(q => Math.abs(q.y - it.y) < 3);
        if (r) r.items.push(it); else renglones.push({ y: it.y, items: [it] });
      }
      for (const r of renglones.sort((a, b) => b.y - a.y)) {
        r.items.sort((a, b) => a.x - b.x);
        // celdas: textos separados por un espacio grande
        const celdas = []; let fin = null;
        for (const it of r.items) {
          if (fin != null && it.x - fin < 6 && celdas.length) celdas[celdas.length - 1] += ' ' + it.s; else celdas.push(it.s);
          fin = it.x + it.w;
        }
        filas.push(celdas);
      }
    }
    return filas;
  }
  throw new Error('Elegí un archivo Excel (.xlsx, .xls, .csv) o PDF.');
}

const RE_GRAMAJE = /(\d{2,3}(?:[.,]\d)?)\s*(?:g|gr|grs|grm|gms|grms|gramos|g\/m2|g\/m²|gm2)\b/i;
const RE_MEDIDA = /(\d{2,3}(?:[.,]\d+)?)\s*(?:cm)?\s*[xX×*]\s*(\d{2,3}(?:[.,]\d+)?)/;
const RE_PRECIO = /(?:u\$s|us\$|usd|\$)?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})?|\d+(?:[.,]\d+)?/gi;

// ¿En qué unidad y moneda vienen los precios? (mirando los encabezados y el texto)
export function detectarFormato(filas) {
  const t = sinT(filas.slice(0, 60).map(f => f.join(' ')).join(' '));
  const unidad = /\b(hoja|pliego|resma|x pl|por pl)\b/.test(t) && !/\b(kg|kilo|x kg|por kg)\b/.test(t) ? 'hoja' : 'kg';
  const moneda = /u\$s|us\$|\busd\b|dolar/.test(t) ? 'USD' : 'ARS';
  return { unidad, moneda };
}

// Cada renglón con gramaje y precio → { texto, nombre, gramaje, medida:{w,h} cm, precio, monedaFila }
export function interpretarFilas(filas) {
  const out = [];
  for (const celdas of filas) {
    const texto = celdas.filter(Boolean).join(' · ');
    const g = texto.match(RE_GRAMAJE); if (!g) continue;
    const gramaje = numero(g[1]); if (!(gramaje >= 30 && gramaje <= 900)) continue;
    const med = texto.match(RE_MEDIDA);
    const medida = med ? { w: Math.min(numero(med[1]), numero(med[2])), h: Math.max(numero(med[1]), numero(med[2])) } : null;
    // precio: el último número de la fila que no sea el gramaje ni la medida (prioriza celdas con $ o con decimales)
    const sinGyM = texto.replace(g[0], ' ').replace(med ? med[0] : '\u0000', ' ');
    const cands = [...sinGyM.matchAll(RE_PRECIO)].map(m => m[0].trim()).filter(Boolean)
      .map(s => ({ s, v: numero(s), dinero: /\$|usd/i.test(s), dec: /[.,]\d{1,2}$/.test(s) }))
      .filter(c => c.v > 0);
    if (!cands.length) continue;
    const elegido = [...cands].reverse().find(c => c.dinero) || [...cands].reverse().find(c => c.dec) || cands[cands.length - 1];
    const nombre = celdas.filter(Boolean).join(' ').replace(RE_GRAMAJE, ' ').replace(RE_MEDIDA, ' ').replace(RE_PRECIO, ' ').replace(/[·|$]/g, ' ').replace(/\s+/g, ' ').trim();
    out.push({ texto, nombre, gramaje, medida, precio: elegido.v, monedaFila: /u\$s|us\$|usd/i.test(elegido.s) ? 'USD' : /\$/.test(elegido.s) ? 'ARS' : null });
  }
  return out;
}

// Parecido entre el nombre de la lista y el del catálogo (palabras en común, sin números)
const palabras = t => sinT(t).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['para', 'con', 'por', 'hoja', 'hojas', 'pliego'].includes(w));
function parecido(a, b) {
  const A = new Set(palabras(a)), B = palabras(b);
  if (!A.size || !B.length) return 0;
  let n = 0; for (const w of B) if ([...A].some(x => x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))) n++;
  return n / B.length;
}

// Empareja cada papel del catálogo con la mejor fila de la lista (mismo gramaje, nombre parecido, medida si la hay)
export function emparejar(papeles, filas) {
  const usados = new Set(), pares = [];
  for (const p of papeles) {
    let mejor = null, puntos = 0;
    filas.forEach((f, i) => {
      if (Math.abs(f.gramaje - (p.gramaje || 0)) > 0.5) return;
      let s = parecido(f.nombre, p.nombre);
      if (s < 0.5) return;
      if (f.medida && p.w && p.h) s += (Math.abs(f.medida.w - Math.min(p.w, p.h)) < 1 && Math.abs(f.medida.h - Math.max(p.w, p.h)) < 1) ? 1 : -0.6;
      if (s > puntos) { puntos = s; mejor = i; }
    });
    if (mejor != null) { usados.add(mejor); pares.push({ papel: p, fila: mejor }); }
  }
  return { pares, sueltas: filas.map((f, i) => i).filter(i => !usados.has(i)) };
}

// Pasa el precio de la lista a la unidad del papel del catálogo (kg ↔ hoja con su medida y gramaje)
export function convertir(precio, desde, hacia, papel, medida) {
  if (desde === hacia) return precio;
  const w = papel.w || medida?.w, h = papel.h || medida?.h;
  const kgHoja = w && h && papel.gramaje ? w * h * papel.gramaje / 1e7 : 0;
  if (!kgHoja) return null;
  return desde === 'kg' ? precio * kgHoja : precio / kgHoja;
}
