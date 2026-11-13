// Pestaña "Comparar": PDF de una orden de trabajo recibida vs. un presupuesto propio guardado.
import { leerOrden, comparar, CAMPOS, numero } from './comparar-lector.js';
import { pliegoMaquina, fmt, resumenFormas } from './presupuesto-calculo.js';
// presupuesto.js se carga cuando hace falta (así, si falla, el resto de Comparar sigue andando)
let svgCompra, svgMaquina;

const $ = id => document.getElementById(id);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (v, d = 0) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fechaTxt = f => f ? f.split('-').reverse().join('/') : '';
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

let FB = null, usuario = null, presupuestos = [], dejar = null;
let orden = {};        // campo → valor (lo leído del PDF, editable)
let mio = {};          // campo → valor (del presupuesto elegido)
let leidos = {};       // campo → línea del PDF de donde salió
let ultimaComp = { ok: 0, no: 0 }, confirmarRojo = false;
let ordenes = [], dejarOT = null, otBorrando = null;

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
      <select id="cmpSel" class="ts-select"><option value="">Cargando…</option></select>
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

  <h2 class="sec">Orden de trabajo</h2>
  <p class="estado" id="otEstado">Elegí un presupuesto para generar la orden de trabajo.</p>
  <div class="grid">
    <div><label for="otEntrega">Fecha de entrega</label><input id="otEntrega" type="date" style="padding-right:12px"></div>
    <div><label for="otRef">Referencia del cliente</label><input id="otRef" placeholder="Ej. OC 4521" style="padding-right:12px"></div>
    <div class="full"><label for="otObs">Observaciones para producción</label><textarea id="otObs" rows="3" class="ts-select" style="resize:vertical" placeholder="Ej. respetar pantone 485 · entregar en cajas de 500"></textarea></div>
    <label class="full ts-check"><input type="checkbox" id="otDiagrama" checked> Incluir el diagrama de corte</label>
    <label class="full ts-check"><input type="checkbox" id="otAprobar" checked> Marcar el presupuesto como aprobado</label>
  </div>
  <div class="actions">
    <button type="button" class="btn primary" id="otGenerar" disabled>Generar orden de trabajo</button>
    <span class="estado" id="otMsg"></span>
  </div>
  <div id="otWrap" hidden>
    <div id="otDoc" class="ts-doc"></div>
    <div class="actions">
      <button type="button" class="btn primary" id="otImprimir">Imprimir / guardar PDF</button>
      <button type="button" class="btn" id="otCerrar">Cerrar</button>
    </div>
  </div>

  <h2 class="sec">Órdenes de trabajo generadas</h2>
  <div class="aviso" id="otRegAviso"><span id="otRegAvisoTxt">Cargando…</span></div>
  <div id="otRegApp" hidden>
    <div class="field"><input id="otBuscar" placeholder="Buscar por número, cliente o trabajo" style="padding-right:12px"></div>
    <div class="pl-lista" id="otLista"></div>
  </div>
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
      if (orden.referencia) $('otRef').value = refCorta(orden.referencia);
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

// "ORDEN DE COMPRA Nro. 118" → "OC 118"
function refCorta(t) {
  const m = String(t).match(/(?:nro\.?|n[uú]mero|n[°º.]*|#)\s*[:\-]?\s*(\S*\d\S*)/i);
  if (!m) return t;
  const n = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tipo = /compra/.test(n) ? 'OC' : /trabajo|o\.?\s?t\b/.test(n) ? 'OT' : /pedido/.test(n) ? 'Pedido' : /presupuesto/.test(n) ? 'Presup.' : '';
  return (tipo ? tipo + ' ' : '') + m[1];
}

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
  ultimaComp = { ok, no };
  estadoOT();
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
  if (!info.listo) return;   // esperar a que Google confirme la sesión
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


// ================= Orden de trabajo =================
function presupuestoElegido() { return presupuestos.find(x => x.id === $('cmpSel').value); }
function estadoOT() {
  const r = presupuestoElegido(), btn = $('otGenerar'), e = $('otEstado');
  confirmarRojo = false; btn.textContent = 'Generar orden de trabajo';
  btn.disabled = !r || !usuario;
  if (!FB) e.textContent = 'Cargando…';
  else if (!usuario) e.textContent = 'Ingresá con Google para generar órdenes de trabajo.';
  else if (!r) e.textContent = 'Elegí un presupuesto para generar la orden de trabajo.';
  else if (!ultimaComp.ok && !ultimaComp.no) e.textContent = `Se va a generar con los datos del presupuesto N° ${r.numero}. (No hay orden del cliente para comparar.)`;
  else if (ultimaComp.no) e.innerHTML = `<span style="color:var(--rot)">Hay ${ultimaComp.no} dato${ultimaComp.no > 1 ? 's' : ''} que no coincide${ultimaComp.no > 1 ? 'n' : ''}.</span> Revisalo antes de generar la orden; si igual querés seguir, se usan los datos de tu presupuesto.`;
  else e.innerHTML = `<span style="color:var(--accent)">Todo coincide.</span> La orden se genera con los datos del presupuesto N° ${r.numero}.`;
}

const pesos = v => '$ ' + fmt(v, 2);
function htmlOT(numero, r, q, calc, extra) {
  const { E, res, calle, pinza, imprenta: im } = calc, b = E.base;
  const x = res.find(z => z.ok && z.cant === q.cant) || res.find(z => z.ok);
  const terms = b.terminaciones.map(t => t.nombre + (t.lados > 1 ? ' (frente y dorso)' : '')).join(', ');
  const tapa = b.tapa, ab = E.tapaAbierta;
  const filas = E.rev ? [
    ['Cantidad', `${fmtN(q.cant)} revistas`],
    E.tw && ['Formato cerrado', `${fmt(E.tw, 1)} × ${fmt(E.th, 1)} mm`],
    ['Páginas', `${b.revista.paginas || 0} interiores${tapa ? ' + tapa' : ' (tapa incluida)'}`],
    b.maquina?.nombre && ['Máquina', b.maquina.nombre],
    ['Interior', `${b.papel.nombre || '—'} · ${b.colF}/${b.colD}${b.revista.retiracion ? ' · retiración (misma chapa)' : ''}`],
    b.maq && ['Pliego del interior', `${fmt(b.maq.w, 1)} × ${fmt(b.maq.h, 1)} cm · ${E.pagsCara} págs. por cara · pinza ${fmt(pinza, 0)} mm${b.compra.w && E.corte > 1 ? ` · hoja de ${fmt(b.compra.w, 0)}×${fmt(b.compra.h, 0)} cortada en ${E.corte}` : ''}`],
    x && x.formas && ['Armado del interior', `${resumenFormas(x.formas)} · ${fmtN(x.interior.chapas)} chapas`],
    x && x.interior && ['Pliegos del interior', `${fmtN(x.interior.netos)} + ${fmtN(x.interior.dem)} de demasía = ${fmtN(x.interior.pm)} pliegos de máquina`],
    x && x.interior && b.compra.w && ['Papel interior a pedir', `${fmtN(x.interior.pc)} hojas de ${fmt(b.compra.w, 0)}×${fmt(b.compra.h, 0)}${x.interior.kilos ? ` · ${fmt(x.interior.kilos, 1)} kg` : ''}`],
    tapa && ['Tapa', `${tapa.papel.nombre || '—'} · ${tapa.colF}/${tapa.colD}${tapa.mismaChapa && tapa.colD ? ' · tira y retira' : ''}${ab ? ` · abierta ${fmt(ab.w / 10, 1)} × ${fmt(ab.h / 10, 1)} cm` : ''} · ${tapa.poses} por pliego`],
    x && x.tapa && tapa.compra.w && ['Papel tapa a pedir', `${fmtN(x.tapa.pc)} hojas de ${fmt(tapa.compra.w, 0)}×${fmt(tapa.compra.h, 0)} (${fmtN(x.tapa.pm)} pliegos de máquina)${x.tapa.kilos ? ` · ${fmt(x.tapa.kilos, 1)} kg` : ''}`],
    terms && ['Terminaciones', terms],
    b.cajas?.porCaja > 0 && ['Embalaje', `cajas de ${fmtN(b.cajas.porCaja)} ejemplares`],
  ].filter(Boolean) : [
    ['Cantidad', `${fmtN(q.cant)} ejemplares`],
    E.tw && ['Medida terminada', `${fmt(E.tw, 1)} × ${fmt(E.th, 1)} mm`],
    b.papel.nombre && ['Papel', b.papel.nombre],
    ['Impresión', `${b.colF}/${b.colD}${b.mismaChapa ? ' · tira y retira' : ''}`],
    b.maquina?.nombre && ['Máquina', b.maquina.nombre],
    b.compra.w && ['Pliego de compra', `${fmt(b.compra.w, 1)} × ${fmt(b.compra.h, 1)} cm${E.corte > 1 ? ` · cortar en ${E.corte}` : ''}`],
    b.maq && ['Pliego de máquina', `${fmt(b.maq.w, 1)} × ${fmt(b.maq.h, 1)} cm · ${E.poses} pose${E.poses === 1 ? '' : 's'} · pinza ${fmt(pinza, 0)} mm${calle ? ` · calle ${fmt(calle, 1)} mm` : ''}`],
    x && ['Pliegos a imprimir', `${fmtN(x.netos)} + ${fmtN(x.dem)} de demasía = ${fmtN(x.pm)} pliegos de máquina`],
    x && b.compra.w && ['Papel a pedir', `${fmtN(x.pc)} hojas de ${fmt(b.compra.w, 0)}×${fmt(b.compra.h, 0)}${x.piezas > 1 ? ` (salen ${x.piezas} pliegos de máquina por hoja)` : ''}${x.kilos ? ` · ${fmt(x.kilos, 1)} kg` : ''}`],
    terms && ['Terminaciones', terms],
    (b.micro.tipo || b.micro.formato) && ['Microcorrugado', [b.micro.tipo, b.micro.formato].filter(Boolean).join(' · ')],
    b.cajas?.porCaja > 0 && ['Embalaje', `cajas de ${fmtN(b.cajas.porCaja)} ejemplares`],
  ].filter(Boolean);
  const pasos = E.rev ? ['Preimpresión / CTP', 'Impresión interior', ...(tapa ? ['Impresión tapa'] : []), ...b.terminaciones.map(t => t.nombre), 'Corte final', 'Empaque', 'Entrega'] : ['Preimpresión / CTP', 'Impresión', ...b.terminaciones.map(t => t.nombre), ...(b.micro.precio ? ['Microcorrugado'] : []), 'Corte final', 'Empaque', 'Entrega'];
  let diagrama = '';
  if (extra.diagrama && E.rev && b.maq && E.tw && window.armadoPoses) {
    const ai = window.armadoPoses(b.maq.w * 10, b.maq.h * 10, E.tw, E.th, { pinza, calleX: calle, calleY: calle, poses: E.pagsCara });
    const at = tapa && tapa.maq && ab ? window.armadoPoses(tapa.maq.w * 10, tapa.maq.h * 10, ab.w, ab.h, { pinza, calleX: calle, calleY: calle, poses: tapa.poses }) : null;
    diagrama = `<div class="ot-salto"></div><h3 class="ot-h3">Armado · OT N° ${numero}</h3><div class="ts-figs">
      ${ai ? `<div class="ts-fig"><h4>Interior: ${ai.rects.length} páginas por cara</h4>${svgMaquina(ai, pinza, calle)}</div>` : ''}
      ${at ? `<div class="ts-fig"><h4>Tapa: ${at.rects.length} por pliego</h4>${svgMaquina(at, pinza, calle)}</div>` : ''}</div>`;
  } else if (extra.diagrama && b.maq && E.tw && window.armadoPoses) {
    const a = window.armadoPoses(b.maq.w * 10, b.maq.h * 10, E.tw, E.th, { pinza, calleX: calle, calleY: calle, poses: E.poses });
    diagrama = `<div class="ot-salto"></div><h3 class="ot-h3">Diagrama de corte · OT N° ${numero}</h3><div class="ts-figs">
      ${E.corte && b.compra.w ? `<div class="ts-fig"><h4>Pliego de compra: cortar en ${E.corte}</h4>${svgCompra(b.compra.w, b.compra.h, E.corte)}</div>` : ''}
      ${a ? `<div class="ts-fig"><h4>Pliego de máquina: ${a.rects.length} pose${a.rects.length === 1 ? '' : 's'}</h4>${svgMaquina(a, pinza, calle)}</div>` : ''}</div>`;
  }
  return `
    <div class="ts-doc-head">
      <div><div class="ts-doc-imp">ORDEN DE TRABAJO N° ${numero}</div>
        <div class="ts-doc-sub">${[im.nombre && esc(im.nombre), 'Presupuesto N° ' + esc(r.numero), extra.ref && 'Ref. cliente: ' + esc(extra.ref)].filter(Boolean).join(' · ')}</div></div>
      <div class="ts-doc-num">Emitida: <b>${fechaTxt(extra.fecha)}</b><br>Entrega: <b>${extra.entrega ? fechaTxt(extra.entrega) : 'a definir'}</b></div>
    </div>
    <p><b>Cliente:</b> ${esc(r.cliente) || '—'}<br><b>Trabajo:</b> ${esc(r.trabajo) || '—'}</p>
    <table class="ts-doc-spec">${filas.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <table class="ts-doc-precios"><thead><tr><th>Precio acordado</th><th class="r">Unitario s/IVA</th><th class="r">Total s/IVA</th><th class="r">Total c/IVA</th></tr></thead>
      <tbody><tr><td>${fmtN(q.cant)} ej.</td><td class="r">${pesos(q.unitario)}</td><td class="r">${pesos(q.subtotal)}</td><td class="r">${pesos(q.total)}</td></tr></tbody></table>
    ${extra.obs ? `<p><b>Observaciones:</b><br>${esc(extra.obs).replace(/\n/g, '<br>')}</p>` : ''}
    <table class="ts-doc-precios ot-control"><thead><tr><th>Control de producción</th><th>Fecha</th><th>Responsable</th><th>OK</th></tr></thead>
      <tbody>${pasos.map(p => `<tr><td>${esc(p)}</td><td></td><td></td><td class="ot-box">☐</td></tr>`).join('')}</tbody></table>
    ${diagrama}`;
}

$('otGenerar').addEventListener('click', async () => {
  const r = presupuestoElegido(); if (!r || !usuario || !FB) return;
  if (ultimaComp.no && !confirmarRojo) {
    confirmarRojo = true; $('otGenerar').textContent = 'Generar igual (hay diferencias)';
    $('otMsg').textContent = 'Tocá de nuevo para confirmar.'; return;
  }
  const q = (r.resumen || [])[+$('cmpCant').value || 0]; if (!q) return;
  let calc;
  try {
    const P = await import('./presupuesto.js');
    ({ svgCompra, svgMaquina } = P);
    calc = P.calcularDesdeSnapshot(r.snapshot);
  } catch (err) { $('otMsg').textContent = 'No se pudo armar la orden: ' + (err.message || err); return; }
  const hoy = new Date(); hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset());
  const extra = { fecha: hoy.toISOString().slice(0, 10), entrega: $('otEntrega').value, ref: $('otRef').value.trim(), obs: $('otObs').value.trim(), diagrama: $('otDiagrama').checked };
  const numero = ordenes.reduce((m, o) => Math.max(m, o.numero || 0), 0) + 1;
  const html = htmlOT(numero, r, q, calc, extra);
  $('otDoc').innerHTML = html; $('otWrap').hidden = false;
  const col = FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'ordenes');
  FB.fb.addDoc(col, { numero, ...extra, cliente: r.cliente || '', trabajo: r.trabajo || '', presupuestoId: r.id, presupuestoNumero: r.numero,
    cantidad: q.cant, total: q.total, html, creado: FB.fb.serverTimestamp() }).catch(e => $('otMsg').textContent = 'Error al guardar: ' + e.code);
  if ($('otAprobar').checked && r.estado !== 'Aprobado')
    FB.fb.updateDoc(FB.fb.doc(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'presupuestosTest'), r.id), { estado: 'Aprobado' }).catch(() => {});
  $('otMsg').textContent = `Orden de trabajo N° ${numero} generada y guardada.`;
  confirmarRojo = false; $('otGenerar').textContent = 'Generar orden de trabajo';
  $('otWrap').scrollIntoView({ behavior: 'smooth' });
});
$('otCerrar').addEventListener('click', () => $('otWrap').hidden = true);
function imprimirOT(html, titulo) {
  let area = document.getElementById('printArea');
  if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
  area.innerHTML = `<div class="ts-doc">${html}</div>`;
  const t = document.title; document.title = titulo;
  document.body.classList.add('imprimiendo');
  const fin = () => { document.body.classList.remove('imprimiendo'); document.title = t; window.removeEventListener('afterprint', fin); };
  window.addEventListener('afterprint', fin);
  window.print();
  setTimeout(fin, 1500);
}
$('otImprimir').addEventListener('click', () => {
  const n = ($('otDoc').querySelector('.ts-doc-imp')?.textContent || 'Orden de trabajo');
  imprimirOT($('otDoc').innerHTML, n.replace('ORDEN DE TRABAJO', 'Orden de trabajo'));
});

function pintarOT() {
  const q = $('otBuscar').value.trim().toLowerCase();
  const l = ordenes.filter(o => !q || [o.numero, o.cliente, o.trabajo, o.ref].join(' ').toLowerCase().includes(q));
  if (!l.length) { $('otLista').innerHTML = `<div class="pl-vacio">${ordenes.length ? 'No hay órdenes que coincidan.' : 'Todavía no generaste órdenes de trabajo.'}</div>`; return; }
  $('otLista').innerHTML = window.Paginas.html('ordenes', l, o => `<div class="pl-item" data-id="${o.id}">
    <div class="t">OT N° ${esc(o.numero)} · ${esc(o.cliente || 'Sin cliente')}</div>
    <div class="n">${o.total ? '$ ' + fmtN(o.total, 2) : ''}</div>
    <div class="d">${fechaTxt(o.fecha)}${o.trabajo ? ' · ' + esc(o.trabajo) : ''} · presupuesto N° ${esc(o.presupuestoNumero)}${o.ref ? ' · ref. ' + esc(o.ref) : ''}</div>
    <div class="n">${o.cantidad ? fmtN(o.cantidad) + ' ej.' : ''}${o.entrega ? ' · entrega ' + fechaTxt(o.entrega) : ''}</div>
    <div class="acc">${otBorrando === o.id
      ? '<span class="estado">¿Borrar esta orden?</span><button type="button" class="btn small danger" data-acc="si">Sí, borrar</button><button type="button" class="btn small" data-acc="no">No</button>'
      : '<button type="button" class="btn small" data-acc="ver">Ver / imprimir</button><button type="button" class="btn small" data-acc="borrar">Borrar</button>'}</div>
  </div>`, pintarOT);
}
$('otBuscar').addEventListener('input', () => { window.Paginas.reset('ordenes'); pintarOT(); });
$('otLista').addEventListener('click', e => {
  const b = e.target.closest('button[data-acc]'); if (!b) return;
  const id = b.closest('.pl-item').dataset.id, o = ordenes.find(x => x.id === id); if (!o) return;
  const a = b.dataset.acc;
  if (a === 'ver') { $('otDoc').innerHTML = o.html || ''; $('otWrap').hidden = false; $('otWrap').scrollIntoView({ behavior: 'smooth' }); return; }
  if (a === 'borrar') otBorrando = id; else if (a === 'no') otBorrando = null;
  else if (a === 'si') { otBorrando = null; FB.fb.deleteDoc(FB.fb.doc(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'ordenes'), id)); }
  pintarOT();
});
function conectarOT(info) {
  if (!info.listo) return;
  if (dejarOT) { dejarOT(); dejarOT = null; }
  ordenes = [];
  $('otRegAviso').hidden = !!info.user; $('otRegApp').hidden = !info.user;
  $('otRegAvisoTxt').innerHTML = '<b>Ingresá con Google</b> para generar y guardar órdenes de trabajo.';
  estadoOT();
  if (!info.user) return;
  dejarOT = info.fb.onSnapshot(info.fb.collection(info.db, 'usuarios', info.user.uid, 'ordenes'), snap => {
    ordenes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.numero || 0) - (a.numero || 0));
    pintarOT();
  }, () => {});
}
window.addEventListener('pliego-auth', () => conectarOT(window.pliegoFB));
if (window.pliegoFB) conectarOT(window.pliegoFB);
