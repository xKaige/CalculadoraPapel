// Pestaña "Comparar": PDF de una orden de trabajo recibida vs. un presupuesto propio guardado.
import { leerOrden, comparar, CAMPOS, numero } from './comparar-lector.js';
import { pliegoMaquina } from './presupuesto-calculo.js';

const $ = id => document.getElementById(id);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (v, d = 0) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fechaTxt = f => f ? f.split('-').reverse().join('/') : '';
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

let FB = null, usuario = null, presupuestos = [], dejar = null;
let orden = {};        // campo → valor (lo leído del PDF, editable)
let mio = {};          // campo → valor (del presupuesto elegido)
let leidos = {};       // campo → línea del PDF de donde salió

const sec = $('comparar');
sec.innerHTML = `
  <div class="cmp-top">
    <div class="cmp-box">
      <h2 class="sec" style="margin-top:0">Orden recibida</h2>
      <input id="cmpPdf" type="file" accept="application/pdf,.pdf">
      <p class="estado" id="cmpPdfInfo">Subí el PDF de la orden o presupuesto que te mandaron. Se lee en tu navegador, no se sube a ningún lado.</p>
    </div>
    <div class="cmp-box">
      <h2 class="sec" style="margin-top:0">Mi presupuesto</h2>
      <select id="cmpSel" class="ts-select"><option value="">— Ingresá con Google para ver tus presupuestos —</option></select>
      <div id="cmpCantBox" hidden style="margin-top:8px"><label for="cmpCant">Cantidad presupuestada</label><select id="cmpCant" class="ts-select"></select></div>
      <p class="estado" id="cmpSelInfo"></p>
    </div>
  </div>

  <div class="result cmp-res" aria-live="polite">
    <div class="label">Coincidencias</div>
    <div class="big" id="cmpScore">—</div>
    <div class="cmp-ley"><span class="cmp-dot ok"></span>coincide <span class="cmp-dot no"></span>no coincide <span class="cmp-dot falta"></span>falta un dato</div>
  </div>

  <div class="cmp-tabla" id="cmpTabla"></div>

  <details style="margin-top:14px"><summary>Texto leído del PDF</summary><pre id="cmpTexto" class="cmp-pre">Todavía no subiste ningún PDF.</pre></details>
  <div class="actions"><button type="button" class="btn" id="cmpLimpiar">Limpiar orden</button></div>
`;

// ---------- Lectura del PDF (pdf.js) ----------
function cargarPdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = PDFJS + 'pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(); };
    s.onerror = () => mal(new Error('No se pudo cargar el lector de PDF (¿sin conexión?).'));
    document.head.appendChild(s);
  });
}
async function textoDelPdf(file) {
  await cargarPdfJs();
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const paginas = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const pg = await pdf.getPage(i);
    const tc = await pg.getTextContent();
    // armar renglones según la altura (y) de cada texto
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0 }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const renglones = [];
    for (const it of items) {
      const r = renglones.find(q => Math.abs(q.y - it.y) < 3);
      if (r) r.items.push(it); else renglones.push({ y: it.y, items: [it] });
    }
    renglones.sort((a, b) => b.y - a.y);
    paginas.push(renglones.map(r => {
      r.items.sort((a, b) => a.x - b.x);
      let t = '', fin = null;
      for (const it of r.items) { t += (fin != null && it.x - fin > 12 ? '   ' : fin != null && it.x - fin > 1 ? ' ' : '') + it.s; fin = it.x + it.w; }
      return t;
    }).join('\n'));
  }
  return paginas.join('\n');
}

$('cmpPdf').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const info = $('cmpPdfInfo');
  info.textContent = 'Leyendo…';
  try {
    const texto = await textoDelPdf(f);
    $('cmpTexto').textContent = texto || '(sin texto)';
    if (!texto.trim()) {
      info.textContent = 'Este PDF no tiene texto (parece una imagen escaneada). Cargá los datos a mano en la columna "Orden".';
      orden = {}; leidos = {};
    } else {
      const r = leerOrden(texto);
      orden = {}; leidos = {};
      for (const [k, v] of Object.entries(r)) { orden[k] = v.valor; leidos[k] = v.txt; }
      const n = CAMPOS.filter(([k]) => orden[k] != null).length;
      info.textContent = `${f.name}: reconocí ${n} de ${CAMPOS.length} datos. Revisalos y corregí lo que haga falta.`;
    }
  } catch (err) {
    info.textContent = err.message || 'No se pudo leer el PDF.';
  }
  pintar();
});
$('cmpLimpiar').addEventListener('click', () => {
  orden = {}; leidos = {}; $('cmpPdf').value = ''; $('cmpTexto').textContent = 'Todavía no subiste ningún PDF.';
  $('cmpPdfInfo').textContent = 'Subí el PDF de la orden o presupuesto que te mandaron. Se lee en tu navegador, no se sube a ningún lado.';
  pintar();
});

// ---------- Mi presupuesto ----------
function cargarMio() {
  const r = presupuestos.find(x => x.id === $('cmpSel').value);
  mio = {};
  if (!r) { $('cmpCantBox').hidden = true; $('cmpSelInfo').textContent = ''; pintar(); return; }
  const c = r.snapshot?.campos || {}, n = v => numero(v);
  const kT = r.snapshot?.uTr === 'cm' ? 10 : 1;
  const med = (a, b, k) => a > 0 && b > 0 ? { a: Math.min(a, b) * k, b: Math.max(a, b) * k } : null;
  const cw = n(c.tsCw), ch = n(c.tsCh);
  const maq = pliegoMaquina(cw, ch, +c.tsCorte, { w: n(c.tsMw), h: n(c.tsMh) });
  mio.cliente = r.cliente; mio.trabajo = r.trabajo;
  mio.pliego = [med(cw, ch, 10), maq && med(maq.w, maq.h, 10)].filter(Boolean);   // compra o máquina
  mio.medida = med(n(c.tsTw), n(c.tsTh), kT);
  mio.papel = c.tsPapelNombre || '';
  mio.gramaje = n(c.tsGramaje) || null;
  mio.colores = `${parseInt(c.tsColF) || 0}/${parseInt(c.tsColD) || 0}`;
  // cantidad elegida
  const res = r.resumen || [];
  $('cmpCant').innerHTML = res.map((x, i) => `<option value="${i}">${fmtN(x.cant)} ej. · $ ${fmtN(x.total, 2)}</option>`).join('');
  $('cmpCantBox').hidden = res.length < 2;
  // si la orden tiene cantidad, elegir la más parecida
  if (orden.cantidad > 0 && res.length > 1 && !cargarMio.manual) {
    let mejor = 0; res.forEach((x, i) => { if (Math.abs(x.cant - orden.cantidad) < Math.abs(res[mejor].cant - orden.cantidad)) mejor = i; });
    $('cmpCant').value = mejor;
  }
  cargarMio.manual = false;
  const q = res[+$('cmpCant').value || 0];
  if (q) {
    mio.cantidad = q.cant;
    mio.pliegos = [q.pc, q.pm].filter(x => x > 0);
    mio.unitario = [q.unitario, q.total / q.cant];
    mio.subtotal = q.subtotal;
    mio.total = q.total;
  }
  $('cmpSelInfo').textContent = `N° ${r.numero} · ${fechaTxt(r.fecha)} · ${r.estado || 'Pendiente'}`;
  pintar();
}
$('cmpSel').addEventListener('change', cargarMio);
$('cmpCant').addEventListener('change', () => { cargarMio.manual = true; cargarMio(); });

// ---------- Tabla de comparación ----------
function mostrar(tipo, v) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '—';
  if (Array.isArray(v)) {
    if (tipo === 'medida') return v.map((x, i) => mostrar(tipo, x) + (v.length > 1 ? (i ? ' (máquina)' : ' (compra)') : '')).join('<br>');
    if (tipo === 'dinero') return v.map((x, i) => mostrar(tipo, x) + (i ? ' c/IVA' : ' s/IVA')).join('<br>');
    if (tipo === 'num0') return v.map((x, i) => mostrar(tipo, x) + (v.length > 1 ? (i ? ' (máquina)' : ' (compra)') : '')).join('<br>');
  }
  if (tipo === 'medida') return `${fmtN(v.a / 10, 1)} × ${fmtN(v.b / 10, 1)} cm`;
  if (tipo === 'dinero') return '$ ' + fmtN(v, 2);
  if (tipo === 'num0') return fmtN(v);
  return esc(v);
}
function valorInput(tipo, v) {
  if (v == null || v === '') return '';
  if (tipo === 'medida') return `${fmtN(v.a / 10, 1)} x ${fmtN(v.b / 10, 1)}`;
  if (tipo === 'dinero') return fmtN(v, 2);
  if (tipo === 'num0') return fmtN(v);
  return v;
}
function leerInput(tipo, txt) {
  txt = String(txt).trim(); if (!txt) return null;
  if (tipo === 'medida') {
    const m = txt.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm)?\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm)?/);
    if (!m) return null;
    let a = numero(m[1]), b = numero(m[3]);
    const enMm = (m[2] || m[4]) === 'mm' || (!(m[2] || m[4]) && Math.max(a, b) > 150);
    if (!enMm) { a *= 10; b *= 10; }
    return { a: Math.min(a, b), b: Math.max(a, b) };
  }
  if (tipo === 'num0' || tipo === 'dinero') { const v = numero(txt); return isFinite(v) ? v : null; }
  return txt;
}
function pintar() {
  let ok = 0, no = 0;
  const filas = CAMPOS.map(([k, label, tipo]) => {
    const est = comparar(tipo, orden[k], mio[k]);
    if (est === 'ok') ok++; if (est === 'no') no++;
    const ph = tipo === 'medida' ? 'ej. 70 x 100' : tipo === 'dinero' ? '$' : '';
    // diferencia contra lo presupuestado (en números)
    let dif = '';
    const ref = Array.isArray(mio[k]) ? mio[k][0] : mio[k];
    if (est === 'no' && (tipo === 'dinero' || tipo === 'num0') && typeof orden[k] === 'number' && typeof ref === 'number' && ref) {
      const d = orden[k] - ref, pct = d / ref * 100;
      dif = `<div class="cmp-dif">Orden ${d > 0 ? '+' : '−'} ${tipo === 'dinero' ? '$ ' + fmtN(Math.abs(d), 2) : fmtN(Math.abs(d))} (${d > 0 ? '+' : '−'}${fmtN(Math.abs(pct), 1)} %)${Array.isArray(mio[k]) ? ' vs. ' + (tipo === 'dinero' ? 'sin IVA' : 'compra') : ''}</div>`;
    }
    return `<div class="cmp-row ${est}">
      <div class="cmp-lab"><span class="cmp-dot ${est}"></span>${label}</div>
      <div class="cmp-cell"><small>Orden</small><input data-k="${k}" data-t="${tipo}" value="${esc(valorInput(tipo, orden[k]))}" placeholder="${ph}" ${leidos[k] ? `title="Leído de: ${esc(leidos[k])}"` : ''}></div>
      <div class="cmp-cell"><small>Mi presupuesto</small><div class="cmp-mio">${mostrar(tipo, mio[k])}</div>${dif}</div>
    </div>`;
  }).join('');
  // no reemplazar los campos mientras se escribe en uno
  const activo = document.activeElement?.closest?.('#cmpTabla') ? document.activeElement.dataset.k : null;
  if (!activo) $('cmpTabla').innerHTML = filas;
  else {
    CAMPOS.forEach(([k, , tipo]) => {
      const est = comparar(tipo, orden[k], mio[k]);
      const row = $('cmpTabla').querySelector(`[data-k="${k}"]`).closest('.cmp-row');
      row.className = 'cmp-row ' + est; row.querySelector('.cmp-dot').className = 'cmp-dot ' + est;
      const tmp = document.createElement('div'); tmp.innerHTML = filas;
      const nueva = tmp.querySelector(`[data-k="${k}"]`).closest('.cmp-row').querySelectorAll('.cmp-cell')[1];
      row.querySelectorAll('.cmp-cell')[1].innerHTML = nueva.innerHTML;
    });
  }
  const total = ok + no;
  $('cmpScore').textContent = total ? `${ok} de ${total}` : '—';
  $('cmpScore').style.color = !total ? '' : no ? 'var(--rot)' : 'var(--accent)';
}
$('cmpTabla').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  orden[k] = leerInput(e.target.dataset.t, e.target.value);
  pintar();
});
$('cmpTabla').addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.closest?.('#cmpTabla')) pintar(); }, 0));

// ---------- Firebase ----------
function llenarSelect() {
  const sel = $('cmpSel'), prev = sel.value;
  if (!usuario) { sel.innerHTML = '<option value="">— Ingresá con Google para ver tus presupuestos —</option>'; return; }
  sel.innerHTML = '<option value="">— Elegí un presupuesto —</option>' + presupuestos.map(r =>
    `<option value="${r.id}">N° ${esc(r.numero)} · ${esc(r.cliente || 'Sin cliente')}${r.trabajo ? ' · ' + esc(r.trabajo) : ''} · ${fechaTxt(r.fecha)}</option>`).join('');
  if (presupuestos.some(r => r.id === prev)) sel.value = prev;
}
function conectar(info) {
  FB = info; usuario = info.user;
  if (dejar) { dejar(); dejar = null; }
  presupuestos = []; llenarSelect();
  if (!usuario) { mio = {}; pintar(); return; }
  dejar = FB.fb.onSnapshot(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'presupuestosTest'), snap => {
    presupuestos = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.numero || 0) - (a.numero || 0));
    llenarSelect();
    if ($('cmpSel').value) cargarMio();
  }, () => {});
}
window.addEventListener('pliego-auth', () => conectar(window.pliegoFB));
if (window.pliegoFB) conectar(window.pliegoFB);
pintar();
