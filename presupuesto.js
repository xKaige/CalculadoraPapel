// Pestaña "Presupuesto". Usa el motor de presupuesto-calculo.js.
// Guarda en Firebase: usuarios/{uid}/config/test (catálogo) y usuarios/{uid}/presupuestosTest (presupuestos).
// (Los nombres "test" quedaron de cuando era la pestaña de prueba; se mantienen para no perder lo ya guardado.)
// Los presupuestos de la versión anterior siguen en usuarios/{uid}/presupuestos y se muestran aparte, solo lectura.
import { presupuestar, pliegoMaquina, entraEnMaquina, UNIDADES, fmt } from './presupuesto-calculo.js';

const $ = id => document.getElementById(id);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = window.parseNum ? window.parseNum(String(v ?? '')) : parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
const pesos = v => '$ ' + fmt(v, 2);
const hoy = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fechaTxt = f => f ? f.split('-').reverse().join('/') : '';
const uid = () => Math.random().toString(36).slice(2, 9);

// ---------- Catálogo por defecto (precios de EJEMPLO) ----------
const CATALOGO_INICIAL = {
  imprenta: { nombre: '', cuit: '', telefono: '', email: '', direccion: '', validez: 15, pago: 'Contado', notas: '' },
  defaults: { demColor: 25, demPct: 2, margen: 40, iva: 21, pinza: 10 },
  papeles: [
    { id: 'p1', nombre: 'Ilustración', gramaje: 150, precio: 1.6, unidad: 'kg', moneda: 'USD', w: 72, h: 102 },
    { id: 'p2', nombre: 'Ilustración', gramaje: 300, precio: 1.6, unidad: 'kg', moneda: 'USD', w: 72, h: 102 },
    { id: 'p3', nombre: 'Obra', gramaje: 80, precio: 1.4, unidad: 'kg', moneda: 'USD', w: 72, h: 92 },
    { id: 'p4', nombre: 'Cartulina duplex', gramaje: 350, precio: 1.5, unidad: 'kg', moneda: 'USD', w: 72, h: 102 },
  ],
  maquinas: [
    { id: 'm1', nombre: 'Offset 4 colores 52×72', anchoMax: 52, altoMax: 72, colores: 4, chapa: 15000, postura: 20000, millar: 9000, minMillar: 0, moneda: 'ARS' },
    { id: 'm2', nombre: 'Offset 1 color 36×52', anchoMax: 36, altoMax: 52, colores: 1, chapa: 9000, postura: 12000, millar: 6000, minMillar: 0, moneda: 'ARS' },
  ],
  terminaciones: [
    { id: 't1', nombre: 'Barniz', unidad: 'millarPl', precio: 8000, postura: 10000, moneda: 'ARS', porLado: true },
    { id: 't2', nombre: 'Laminado brillante', unidad: 'm2', precio: 550, postura: 0, moneda: 'ARS', porLado: true },
    { id: 't3', nombre: 'Laminado mate', unidad: 'm2', precio: 600, postura: 0, moneda: 'ARS', porLado: true },
    { id: 't4', nombre: 'UV sectorizado', unidad: 'pliego', precio: 90, postura: 25000, moneda: 'ARS', porLado: true },
    { id: 't5', nombre: 'Troquelado', unidad: 'millarPl', precio: 15000, postura: 30000, moneda: 'ARS', porLado: false },
    { id: 't6', nombre: 'Doblado díptico', unidad: 'millarEj', precio: 9000, postura: 12000, moneda: 'ARS', porLado: false },
    { id: 't7', nombre: 'Doblado tríptico', unidad: 'millarEj', precio: 12000, postura: 15000, moneda: 'ARS', porLado: false },
    { id: 't8', nombre: 'Encuadernación binder', unidad: 'millarEj', precio: 60000, postura: 40000, moneda: 'ARS', porLado: false },
    { id: 't9', nombre: 'Corte final guillotina', unidad: 'fijo', precio: 15000, postura: 0, moneda: 'ARS', porLado: false },
  ],
};
let cat = structuredClone(CATALOGO_INICIAL);
let dolar = null;
let usuario = null, FB = null;
let lista = [], dejarLista = null, abierto = null, borrando = null, verCant = 0;
let ultimo = null;   // { entrada, resultados[] }

// ---------- Estructura ----------
const sec = $('presupuesto');
sec.innerHTML = `
  <h2 class="sec" style="margin-top:0">Datos</h2>
  <div class="grid">
    <div><label for="tsFecha">Fecha</label><input id="tsFecha" type="date" style="padding-right:12px"></div>
    <div><label for="tsNumero">N° presupuesto</label><input id="tsNumero" readonly placeholder="al guardar" style="padding-right:12px"></div>
    <div class="full"><label for="tsCliente">Cliente</label><input id="tsCliente" list="tsClientes" placeholder="Nombre del cliente" style="padding-right:12px"><datalist id="tsClientes"></datalist></div>
    <div class="full"><label for="tsTrabajo">Trabajo</label><input id="tsTrabajo" placeholder="Ej. Folleto tríptico" style="padding-right:12px"></div>
    <div class="full"><label for="tsCantidades">Cantidades (podés poner varias)</label>
      <div class="field"><input id="tsCantidades" placeholder="1000, 2000, 5000" style="padding-right:12px"></div></div>
  </div>

  <h2 class="sec">Trabajo y armado</h2>
  <div class="grid">
    <div><label for="tsTw">Corte a corte ancho</label><div class="field"><input id="tsTw" inputmode="decimal" placeholder="210"><span class="unit tsUT">mm</span></div></div>
    <div><label for="tsTh">Corte a corte alto</label><div class="field"><input id="tsTh" inputmode="decimal" placeholder="297"><span class="unit tsUT">mm</span></div></div>
    <div class="full"><div class="mode" role="group" id="tsUTr"><button type="button" data-u="cm" aria-pressed="false">Centímetros</button><button type="button" data-u="mm" aria-pressed="true">Milímetros</button></div></div>
    <div><label for="tsCalle">Calle entre poses</label><div class="field"><input id="tsCalle" inputmode="decimal" value="0"><span class="unit">mm</span></div></div>
    <div><label for="tsPinza">Pinza</label><div class="field"><input id="tsPinza" inputmode="decimal" value="10"><span class="unit">mm</span></div></div>
    <div class="full"><label for="tsPoses">Poses por pliego de máquina</label><div class="field"><input id="tsPoses" inputmode="numeric" placeholder="auto"><span class="unit">poses</span></div></div>
  </div>

  <h2 class="sec">Papel</h2>
  <div class="grid">
    <div class="full"><label for="tsPapelSel">Papel</label><select id="tsPapelSel" class="ts-select"></select></div>
    <div><label for="tsPapelNombre">Tipo</label><input id="tsPapelNombre" placeholder="Ilustración" style="padding-right:12px"></div>
    <div><label for="tsGramaje">Gramaje</label><div class="field"><input id="tsGramaje" inputmode="decimal"><span class="unit">g/m²</span></div></div>
    <div><label for="tsPapelPrecio">Precio</label><div class="field"><input id="tsPapelPrecio" inputmode="decimal"><button type="button" class="pr-cur" id="tsPapelMon" data-cur="USD">US$</button></div></div>
    <div><label for="tsPapelUnidad">Por</label><select id="tsPapelUnidad" class="ts-select"><option value="kg">kilo</option><option value="pliego">pliego de compra</option></select></div>
    <div><label for="tsCw">Pliego de compra ancho</label><div class="field"><input id="tsCw" inputmode="decimal"><span class="unit">cm</span></div></div>
    <div><label for="tsCh">Pliego de compra alto</label><div class="field"><input id="tsCh" inputmode="decimal"><span class="unit">cm</span></div></div>
    <div class="full"><label for="tsCorte">Pliego de máquina</label>
      <select id="tsCorte" class="ts-select">
        <option value="1">Entero</option><option value="2">Al medio (½)</option><option value="3">En 3 (⅓)</option>
        <option value="4">En 4 (¼)</option><option value="6">En 6</option><option value="8">En 8</option><option value="9">En 9</option>
        <option value="0">Otra medida…</option>
      </select></div>
    <div id="tsMaqManual" class="full grid" hidden style="grid-template-columns:1fr 1fr">
      <div><label for="tsMw">Máquina ancho</label><div class="field"><input id="tsMw" inputmode="decimal"><span class="unit">cm</span></div></div>
      <div><label for="tsMh">Máquina alto</label><div class="field"><input id="tsMh" inputmode="decimal"><span class="unit">cm</span></div></div>
    </div>
    <div class="full readout">
      <div><small>Pliego de máquina</small><b id="tsPmTxt">—</b></div>
      <div><small>Poses</small><b id="tsPosesTxt">—</b></div>
    </div>
  </div>

  <h2 class="sec">Impresión</h2>
  <div class="grid">
    <div class="full"><label for="tsMaquina">Máquina</label><select id="tsMaquina" class="ts-select"></select></div>
    <div><label for="tsColF">Colores frente</label><div class="field"><input id="tsColF" type="number" min="0" step="1" value="4"><span class="unit">col.</span></div></div>
    <div><label for="tsColD">Colores dorso</label><div class="field"><input id="tsColD" type="number" min="0" step="1" value="0"><span class="unit">col.</span></div></div>
    <div class="full chips" id="tsColChips">
      <button type="button" class="chip" data-c="4/0">4/0</button><button type="button" class="chip" data-c="4/4">4/4</button>
      <button type="button" class="chip" data-c="4/1">4/1</button><button type="button" class="chip" data-c="1/0">1/0</button>
      <button type="button" class="chip" data-c="1/1">1/1</button><button type="button" class="chip" data-c="2/0">2/0</button>
    </div>
    <label class="full ts-check"><input type="checkbox" id="tsMismaChapa"> El dorso usa las mismas chapas (tira y retira)</label>
    <div class="full"><label>Demasía</label>
      <div class="mode" role="group" id="tsDemModo"><button type="button" data-m="auto" aria-pressed="true">Automática</button><button type="button" data-m="manual" aria-pressed="false">A mano</button></div></div>
    <div class="ts-dem-auto"><label for="tsDemColor">Por color</label><div class="field"><input id="tsDemColor" inputmode="numeric"><span class="unit">pl.</span></div></div>
    <div class="ts-dem-auto"><label for="tsDemPct">Más % del tiraje</label><div class="field"><input id="tsDemPct" inputmode="decimal"><span class="unit">%</span></div></div>
    <div class="full ts-dem-man" hidden><label for="tsDemManual">Demasía</label><div class="field"><input id="tsDemManual" inputmode="numeric" value="0"><span class="unit">pl.</span></div></div>
  </div>

  <h2 class="sec">Terminaciones</h2>
  <div id="tsTerms" class="ts-terms"></div>

  <h2 class="sec">Microcorrugado</h2>
  <div class="grid">
    <div><label for="tsMicroTipo">Tipo de micro</label><input id="tsMicroTipo" placeholder="Ej. Onda E blanco" style="padding-right:12px"></div>
    <div><label for="tsMicroFormato">Formato</label><input id="tsMicroFormato" placeholder="Ej. 70×100" style="padding-right:12px"></div>
    <div><label for="tsMicroPrecio">Precio por plancha</label><div class="field"><input id="tsMicroPrecio" inputmode="decimal"><button type="button" class="pr-cur" id="tsMicroMon" data-cur="ARS">$</button></div></div>
    <div><label for="tsMicroPlanchas">Planchas</label><div class="field"><input id="tsMicroPlanchas" inputmode="numeric" placeholder="auto"><span class="unit">pl.</span></div></div>
    <div class="full estado">Si dejás "Planchas" vacío, se cuenta una plancha por pliego de máquina (incluida la demasía).</div>
  </div>

  <h2 class="sec">Otros costos</h2>
  <div class="grid">
    <div><label for="tsPreimp">Diseño / preimpresión</label><div class="field"><input id="tsPreimp" inputmode="decimal"><span class="unit">$</span></div></div>
    <div><label for="tsPruebas">Pruebas de color</label><div class="field"><input id="tsPruebas" inputmode="decimal"><span class="unit">$</span></div></div>
    <div><label for="tsFlete">Flete</label><div class="field"><input id="tsFlete" inputmode="decimal"><span class="unit">$</span></div></div>
    <div><label for="tsOtro">Otro</label><div class="field"><input id="tsOtro" inputmode="decimal"><span class="unit">$</span></div></div>
    <div><label for="tsPorCaja">Ejemplares por caja</label><div class="field"><input id="tsPorCaja" inputmode="numeric"><span class="unit">ej.</span></div></div>
    <div><label for="tsCajaPrecio">Precio por caja</label><div class="field"><input id="tsCajaPrecio" inputmode="decimal"><span class="unit">$</span></div></div>
  </div>

  <h2 class="sec">Precio</h2>
  <div class="grid">
    <div><label for="tsMargen">Ganancia</label><div class="field"><input id="tsMargen" inputmode="decimal"><span class="unit">%</span></div></div>
    <div><label for="tsDesc">Descuento</label><div class="field"><input id="tsDesc" inputmode="decimal" value="0"><span class="unit">%</span></div></div>
    <div class="full"><label>IVA</label><div class="mode four" role="group" id="tsIva">
      <button type="button" data-iva="21" aria-pressed="true">21 %</button><button type="button" data-iva="10.5" aria-pressed="false">10,5 %</button>
      <button type="button" data-iva="0" aria-pressed="false">Sin IVA</button><button type="button" data-iva="27" aria-pressed="false">27 %</button></div></div>
    <div class="full estado" id="tsDolarInfo"></div>
  </div>

  <div class="result" aria-live="polite">
    <div class="chips" id="tsCantChips" style="margin-bottom:8px"></div>
    <div class="label" id="tsTotalLabel">Total con IVA</div>
    <div class="big" id="tsTotal">—</div>
    <dl>
      <dt>Costo</dt><dd id="tsCosto">—</dd>
      <dt>Ganancia</dt><dd id="tsGan">—</dd>
      <dt>Descuento</dt><dd id="tsDescV">—</dd>
      <dt>Subtotal sin IVA</dt><dd id="tsSub">—</dd>
      <dt>IVA</dt><dd id="tsIvaV">—</dd>
      <dt>Unitario sin IVA</dt><dd id="tsUnit">—</dd>
      <dt>Unitario con IVA</dt><dd id="tsUnitIva">—</dd>
      <dt>Pliegos máquina / compra</dt><dd id="tsPliegos">—</dd>
      <dt>Kilos de papel</dt><dd id="tsKilos">—</dd>
    </dl>
    <div class="hint" id="tsHint" hidden></div>
  </div>

  <div class="tabla-wrap"><table class="dias" id="tsComparar"></table></div>
  <details style="margin-top:12px" open><summary>Detalle de costos</summary><div class="tabla-wrap"><table class="dias" id="tsDetalle"></table></div></details>

  <div class="actions">
    <button type="button" class="btn primary" id="tsGuardar">Guardar presupuesto</button>
    <button type="button" class="btn" id="tsVerCliente">Presupuesto para el cliente</button>
    <button type="button" class="btn" id="tsVerCorte">Diagrama de corte</button>
    <button type="button" class="btn" id="tsNuevo">Nuevo</button>
    <span class="estado" id="tsMsg"></span>
  </div>

  <div id="tsClienteWrap" hidden>
    <div id="tsClienteDoc" class="ts-doc"></div>
    <div class="actions">
      <button type="button" class="btn primary" id="tsImprimir">Imprimir / guardar PDF</button>
      <button type="button" class="btn" id="tsCopiar">Copiar texto</button>
      <button type="button" class="btn" id="tsCerrarDoc">Cerrar</button>
    </div>
  </div>

  <div id="tsCorteWrap" hidden>
    <div id="tsCorteDoc" class="ts-doc"></div>
    <div class="actions">
      <button type="button" class="btn primary" id="tsImprimirCorte">Imprimir / guardar PDF</button>
      <button type="button" class="btn" id="tsCerrarCorte">Cerrar</button>
    </div>
  </div>

  <h2 class="sec">Presupuestos guardados</h2>
  <div class="aviso" id="tsRegAviso"><span><b>Ingresá con Google</b> para guardar presupuestos y tu catálogo de precios.</span></div>
  <div id="tsRegApp" hidden>
    <div class="grid" style="grid-template-columns:1fr auto">
      <div class="field"><input id="tsBuscar" placeholder="Buscar por cliente, trabajo o número" style="padding-right:12px"></div>
      <select id="tsFiltro" class="ts-select" style="width:auto"><option value="">Todos</option><option>Pendiente</option><option>Aprobado</option><option>Rechazado</option></select>
    </div>
    <div class="pl-lista" id="tsLista"></div>
    <details id="tsViejos" hidden style="margin-top:14px">
      <summary>Presupuestos de la versión anterior (<span id="tsViejosN">0</span>)</summary>
      <p class="estado">Se armaron con el presupuesto viejo: se pueden consultar y borrar, pero no abrir en esta versión.</p>
      <div class="pl-lista" id="tsViejosLista"></div>
    </details>
  </div>

  <details class="ts-config" id="tsConfig">
    <summary>Configuración: mi imprenta, papeles, máquinas y terminaciones</summary>
    <p class="estado" id="tsConfigInfo">Se guarda en tu cuenta (o en este navegador si no ingresaste).</p>
    <h3 class="pr-group">Mi imprenta (sale en el presupuesto para el cliente)</h3>
    <div class="grid" id="tsImprenta"></div>
    <h3 class="pr-group">Valores por defecto</h3>
    <div class="grid" id="tsDefaults"></div>
    <h3 class="pr-group">Papeles</h3><div class="tabla-wrap"><table class="dias ts-edit" id="tsCatPapeles"></table></div>
    <button type="button" class="btn small" data-add="papeles">+ Papel</button>
    <h3 class="pr-group">Máquinas</h3><div class="tabla-wrap"><table class="dias ts-edit" id="tsCatMaquinas"></table></div>
    <button type="button" class="btn small" data-add="maquinas">+ Máquina</button>
    <h3 class="pr-group">Terminaciones</h3><div class="tabla-wrap"><table class="dias ts-edit" id="tsCatTerminaciones"></table></div>
    <button type="button" class="btn small" data-add="terminaciones">+ Terminación</button>
    <div class="actions"><button type="button" class="btn small danger" id="tsResetCat">Volver a los precios de ejemplo</button><span class="estado" id="tsResetMsg"></span></div>
  </details>
`;

// ---------- Estado de la UI ----------
let uTr = 'mm', demModo = 'auto', iva = 21, papelMon = 'USD', microMon = 'ARS';
const termSel = {};   // id → { on, lados }
const CAMPOS = ['tsFecha', 'tsCliente', 'tsTrabajo', 'tsCantidades', 'tsTw', 'tsTh', 'tsCalle', 'tsPinza', 'tsPoses', 'tsPapelSel', 'tsPapelNombre', 'tsGramaje',
  'tsPapelPrecio', 'tsPapelUnidad', 'tsCw', 'tsCh', 'tsCorte', 'tsMw', 'tsMh', 'tsMaquina', 'tsColF', 'tsColD', 'tsDemColor', 'tsDemPct', 'tsDemManual',
  'tsMicroTipo', 'tsMicroFormato', 'tsMicroPrecio', 'tsMicroPlanchas', 'tsPreimp', 'tsPruebas', 'tsFlete', 'tsOtro', 'tsPorCaja', 'tsCajaPrecio', 'tsMargen', 'tsDesc'];

function snapshot() {
  const c = {}; CAMPOS.forEach(k => c[k] = $(k).value);
  return { campos: c, uTr, demModo, iva, papelMon, microMon, mismaChapa: $('tsMismaChapa').checked, termSel: structuredClone(termSel) };
}
function restaurar(s) {
  if (!s) return;
  CAMPOS.forEach(k => { if (s.campos && s.campos[k] != null) $(k).value = s.campos[k]; });
  uTr = s.uTr || 'mm'; demModo = s.demModo || 'auto'; iva = s.iva ?? 21; papelMon = s.papelMon || 'USD'; microMon = s.microMon || 'ARS';
  $('tsMismaChapa').checked = !!s.mismaChapa;
  for (const k in termSel) delete termSel[k];
  Object.assign(termSel, s.termSel || {});
  pintarTerminaciones();
}
function guardarLocal() { try { localStorage.setItem('test-v1', JSON.stringify(snapshot())); } catch (e) {} }

// ---------- Catálogo ----------
function llenarSelects() {
  const ps = $('tsPapelSel'), prevP = ps.value;
  ps.innerHTML = '<option value="">— Elegir del catálogo —</option>' + cat.papeles.map(p => `<option value="${p.id}">${esc(p.nombre)} ${esc(p.gramaje)} g · ${p.moneda === 'USD' ? 'US$' : '$'} ${fmt(p.precio)}/${p.unidad === 'kg' ? 'kg' : 'pl.'}</option>`).join('');
  ps.value = prevP;
  const ms = $('tsMaquina'), prevM = ms.value;
  ms.innerHTML = cat.maquinas.map(m => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('') || '<option value="">(cargá una máquina en Configuración)</option>';
  if ([...ms.options].some(o => o.value === prevM)) ms.value = prevM;
}
function pintarTerminaciones() {
  $('tsTerms').innerHTML = cat.terminaciones.map(t => {
    const s = termSel[t.id] || {};
    return `<div class="ts-term${s.on ? ' on' : ''}" data-id="${t.id}">
      <label class="ts-check"><input type="checkbox" data-k="on" ${s.on ? 'checked' : ''}> ${esc(t.nombre)}</label>
      <span class="estado">${UNIDADES[t.unidad] || ''} · ${t.moneda === 'USD' ? 'US$' : '$'} ${fmt(t.precio)}${t.postura ? ' + postura ' + fmt(t.postura) : ''}</span>
      ${t.porLado ? `<select data-k="lados" class="ts-select ts-mini"><option value="1">Frente</option><option value="2" ${s.lados == 2 ? 'selected' : ''}>F y D</option></select>` : ''}
    </div>`;
  }).join('') || '<p class="estado">No hay terminaciones cargadas. Agregalas en Configuración.</p>';
}
const ESQ = {
  papeles: [['nombre', 'Tipo', 't'], ['gramaje', 'g/m²', 'n'], ['precio', 'Precio', 'n'], ['unidad', 'Por', ['kg', 'pliego']], ['moneda', 'Moneda', ['ARS', 'USD']], ['w', 'Ancho cm', 'n'], ['h', 'Alto cm', 'n']],
  maquinas: [['nombre', 'Nombre', 't'], ['anchoMax', 'Máx. ancho cm', 'n'], ['altoMax', 'Máx. alto cm', 'n'], ['colores', 'Colores', 'n'], ['chapa', 'Chapa', 'n'], ['postura', 'Postura x color', 'n'], ['millar', 'Millar x color', 'n'], ['minMillar', 'Mín. millares', 'n'], ['moneda', 'Moneda', ['ARS', 'USD']]],
  terminaciones: [['nombre', 'Nombre', 't'], ['unidad', 'Se cobra', Object.keys(UNIDADES)], ['precio', 'Precio', 'n'], ['postura', 'Postura fija', 'n'], ['moneda', 'Moneda', ['ARS', 'USD']], ['porLado', 'Por lado', 'b']],
};
const ETIQ = { kg: 'kilo', pliego: 'pliego', ARS: '$', USD: 'US$', ...UNIDADES };
function pintarConfig() {
  for (const tipo of Object.keys(ESQ)) {
    const id = 'tsCat' + tipo[0].toUpperCase() + tipo.slice(1);
    $(id).innerHTML = `<thead><tr>${ESQ[tipo].map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>` +
      cat[tipo].map((row, i) => `<tr data-tipo="${tipo}" data-i="${i}">${ESQ[tipo].map(([k, , t]) => {
        if (Array.isArray(t)) return `<td><select data-k="${k}" class="ts-select ts-mini">${t.map(o => `<option value="${o}" ${row[k] === o ? 'selected' : ''}>${esc(ETIQ[o] || o)}</option>`).join('')}</select></td>`;
        if (t === 'b') return `<td><input type="checkbox" data-k="${k}" ${row[k] ? 'checked' : ''}></td>`;
        return `<td><input data-k="${k}" class="ts-cell${t === 'n' ? ' n' : ''}" value="${esc(t === 'n' ? String(row[k] ?? '').replace('.', ',') : row[k] ?? '')}"></td>`;
      }).join('')}<td><button type="button" class="btn small danger" data-del="1" title="Borrar">✕</button></td></tr>`).join('') + '</tbody>';
  }
  const campo = (grupo, k, label, full) => `<div class="${full ? 'full' : ''}"><label>${label}</label><input data-g="${grupo}" data-k="${k}" value="${esc(cat[grupo][k] ?? '')}" style="padding-right:12px"></div>`;
  $('tsImprenta').innerHTML = campo('imprenta', 'nombre', 'Nombre de la imprenta', true) + campo('imprenta', 'cuit', 'CUIT') + campo('imprenta', 'telefono', 'Teléfono')
    + campo('imprenta', 'email', 'Email') + campo('imprenta', 'direccion', 'Dirección') + campo('imprenta', 'validez', 'Validez (días)') + campo('imprenta', 'pago', 'Forma de pago')
    + campo('imprenta', 'notas', 'Observaciones fijas', true);
  $('tsDefaults').innerHTML = campo('defaults', 'demColor', 'Demasía por color (pl.)') + campo('defaults', 'demPct', 'Demasía % del tiraje')
    + campo('defaults', 'margen', 'Ganancia %') + campo('defaults', 'iva', 'IVA %') + campo('defaults', 'pinza', 'Pinza mm');
}
let guardarCatT = null;
function catCambiado() {
  llenarSelects(); pintarTerminaciones(); calcular();
  clearTimeout(guardarCatT);
  guardarCatT = setTimeout(() => {
    try { localStorage.setItem('test-catalogo', JSON.stringify(cat)); } catch (e) {}
    if (usuario && FB) FB.fb.setDoc(FB.fb.doc(FB.db, 'usuarios', usuario.uid, 'config', 'test'), { catalogo: cat, actualizado: FB.fb.serverTimestamp() })
      .then(() => $('tsConfigInfo').textContent = 'Guardado en tu cuenta.').catch(e => $('tsConfigInfo').textContent = 'No se pudo guardar (' + e.code + ').');
    else $('tsConfigInfo').textContent = 'Guardado en este navegador. Ingresá con Google para tenerlo en todos tus dispositivos.';
  }, 700);
}
sec.querySelector('#tsConfig').addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.g) { const g = el.dataset.g; cat[g][el.dataset.k] = g === 'defaults' || el.dataset.k === 'validez' ? num(el.value) : el.value; catCambiado(); return; }
  const tr = el.closest('tr[data-tipo]'); if (!tr) return;
  const tipo = tr.dataset.tipo, row = cat[tipo][+tr.dataset.i], def = ESQ[tipo].find(c => c[0] === el.dataset.k);
  if (!def) return;
  row[el.dataset.k] = def[2] === 'n' ? num(el.value) : def[2] === 'b' ? el.checked : el.value;
  catCambiado();
});
sec.querySelector('#tsConfig').addEventListener('change', e => { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
sec.querySelector('#tsConfig').addEventListener('click', e => {
  const add = e.target.closest('[data-add]'), del = e.target.closest('[data-del]');
  if (add) {
    const t = add.dataset.add;
    const nuevo = { papeles: { nombre: 'Nuevo papel', gramaje: 0, precio: 0, unidad: 'kg', moneda: 'USD', w: 72, h: 102 },
      maquinas: { nombre: 'Nueva máquina', anchoMax: 0, altoMax: 0, colores: 1, chapa: 0, postura: 0, millar: 0, minMillar: 0, moneda: 'ARS' },
      terminaciones: { nombre: 'Nueva terminación', unidad: 'millarPl', precio: 0, postura: 0, moneda: 'ARS', porLado: false } }[t];
    cat[t].push({ id: uid(), ...nuevo }); pintarConfig(); catCambiado();
  }
  if (del) { const tr = del.closest('tr'); cat[tr.dataset.tipo].splice(+tr.dataset.i, 1); pintarConfig(); catCambiado(); }
});
let resetPend = false;
$('tsResetCat').addEventListener('click', () => {
  if (!resetPend) { resetPend = true; $('tsResetCat').textContent = 'Tocá de nuevo para confirmar'; setTimeout(() => { resetPend = false; $('tsResetCat').textContent = 'Volver a los precios de ejemplo'; }, 4000); return; }
  resetPend = false; $('tsResetCat').textContent = 'Volver a los precios de ejemplo';
  cat = structuredClone(CATALOGO_INICIAL); pintarConfig(); catCambiado();
});

// ---------- Dólar ----------
try { dolar = JSON.parse(localStorage.getItem('dolar-bna-v1') || 'null'); } catch (e) {}
async function traerDolar() {
  try {
    const r = await fetch('https://dolarapi.com/v1/dolares/oficial', { cache: 'no-store' });
    const j = await r.json(); if (j.venta > 0) dolar = { venta: j.venta, compra: j.compra, fecha: j.fechaActualizacion, chequeado: Date.now() };
    try { localStorage.setItem('dolar-bna-v1', JSON.stringify(dolar)); } catch (e) {}
  } catch (e) {}
  calcular();
}

// ---------- Cálculo ----------
function cantidades() {
  return [...new Set(String($('tsCantidades').value).split(/[;,\s/]+/).map(x => Math.floor(num(x))).filter(x => x > 0))].slice(0, 6);
}
function entrada() {
  const kT = uTr === 'cm' ? 10 : 1;
  const tw = num($('tsTw').value) * kT, th = num($('tsTh').value) * kT;
  const cw = num($('tsCw').value), ch = num($('tsCh').value);
  const corte = +$('tsCorte').value;
  const maq = pliegoMaquina(cw, ch, corte, { w: num($('tsMw').value), h: num($('tsMh').value) });
  const maquina = cat.maquinas.find(m => m.id === $('tsMaquina').value) || null;
  const calle = num($('tsCalle').value), pinza = num($('tsPinza').value);
  const autoPoses = maq && tw > 0 && th > 0 && window.mejorPoses ? window.mejorPoses(maq.w * 10, maq.h * 10, tw, th, { pinza, calleX: calle, calleY: calle }) : 0;
  const poses = num($('tsPoses').value) > 0 ? Math.floor(num($('tsPoses').value)) : autoPoses;
  const terminaciones = cat.terminaciones.filter(t => termSel[t.id]?.on).map(t => ({ ...t, lados: t.porLado ? (+termSel[t.id].lados || 1) : 1 }));
  const otros = [['Diseño / preimpresión', 'tsPreimp'], ['Pruebas de color', 'tsPruebas'], ['Flete', 'tsFlete'], ['Otros', 'tsOtro']]
    .map(([nombre, id]) => ({ nombre, precio: num($(id).value), moneda: 'ARS' })).filter(o => o.precio > 0);
  return {
    tw, th, autoPoses, poses, maquinaObj: maquina, corte,
    base: {
      poses, colF: Math.floor(num($('tsColF').value)), colD: Math.floor(num($('tsColD').value)), mismaChapa: $('tsMismaChapa').checked,
      papel: { nombre: `${$('tsPapelNombre').value.trim()} ${num($('tsGramaje').value) ? fmt(num($('tsGramaje').value), 0) + ' g' : ''}`.trim(), gramaje: num($('tsGramaje').value), precio: num($('tsPapelPrecio').value), unidad: $('tsPapelUnidad').value, moneda: papelMon },
      compra: { w: cw, h: ch }, corte: corte || 0, maq,
      maquina: maquina || {},
      demasia: { modo: demModo, porColor: num($('tsDemColor').value), pct: num($('tsDemPct').value), manual: num($('tsDemManual').value) },
      terminaciones, otros,
      micro: { tipo: $('tsMicroTipo').value.trim(), formato: $('tsMicroFormato').value.trim(), precio: num($('tsMicroPrecio').value), planchas: num($('tsMicroPlanchas').value), moneda: microMon },
      cajas: { porCaja: num($('tsPorCaja').value), precio: num($('tsCajaPrecio').value), moneda: 'ARS' },
      margen: num($('tsMargen').value), descuento: num($('tsDesc').value), iva, dolar: dolar?.venta || 0,
    },
  };
}

function calcular() {
  document.querySelectorAll('#tsUTr button').forEach(b => b.setAttribute('aria-pressed', b.dataset.u === uTr));
  document.querySelectorAll('.tsUT').forEach(el => el.textContent = uTr);
  document.querySelectorAll('#tsDemModo button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === demModo));
  document.querySelectorAll('.ts-dem-auto').forEach(el => el.hidden = demModo !== 'auto');
  document.querySelectorAll('.ts-dem-man').forEach(el => el.hidden = demModo !== 'manual');
  document.querySelectorAll('#tsIva button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.iva === iva));
  $('tsPapelMon').dataset.cur = papelMon; $('tsPapelMon').textContent = papelMon === 'USD' ? 'US$' : '$';
  $('tsMicroMon').dataset.cur = microMon; $('tsMicroMon').textContent = microMon === 'USD' ? 'US$' : '$';
  $('tsMaqManual').hidden = $('tsCorte').value !== '0';
  $('tsTotalLabel').textContent = iva ? 'Total con IVA' : 'Total';
  $('tsDolarInfo').textContent = dolar?.venta ? `Dólar oficial (venta) para los precios en US$: ${pesos(dolar.venta)}` : 'Sin cotización del dólar: los precios en US$ no se pueden pasar a pesos.';

  const E = entrada(), b = E.base;
  $('tsPmTxt').textContent = b.maq ? `${fmt(b.maq.w, 1)} × ${fmt(b.maq.h, 1)} cm` : '—';
  $('tsPosesTxt').textContent = E.poses ? String(E.poses) + (num($('tsPoses').value) > 0 ? ' (a mano)' : '') : '—';
  $('tsPoses').placeholder = E.autoPoses ? String(E.autoPoses) : 'auto';

  const avisos = [];
  if (E.maquinaObj && b.maq && !entraEnMaquina(b.maq, E.maquinaObj)) avisos.push(`El pliego de máquina (${fmt(b.maq.w, 1)}×${fmt(b.maq.h, 1)}) no entra en la ${E.maquinaObj.nombre} (máx. ${E.maquinaObj.anchoMax}×${E.maquinaObj.altoMax}). Cortá el pliego en más partes o elegí otra máquina.`);
  if (E.maquinaObj && E.maquinaObj.colores && Math.max(b.colF, b.colD) > E.maquinaObj.colores) avisos.push(`La máquina es de ${E.maquinaObj.colores} color${E.maquinaObj.colores > 1 ? 'es' : ''}: se va a necesitar más de una pasada por lado.`);
  if (num($('tsPoses').value) > 0 && E.autoPoses > 0 && E.poses > E.autoPoses) avisos.push(`Cargaste ${E.poses} poses, pero con estas medidas entran como máximo ${E.autoPoses}.`);
  const cants = cantidades();
  if (!cants.length) avisos.push('Cargá la cantidad (podés poner varias separadas por coma).');
  if (!E.poses) avisos.push(E.tw && b.maq ? 'El trabajo no entra en el pliego de máquina con esa pinza. Revisá medidas o cargá las poses a mano.' : 'Cargá el corte a corte y el pliego de compra para calcular las poses.');

  const res = cants.map(cant => presupuestar({ ...b, cant }));
  if (res.some(r => r.faltas?.dolar)) avisos.push('Hay precios en dólares y no hay cotización: esos ítems quedaron en 0.');
  if (verCant >= res.length) verCant = 0;
  $('tsMicroPlanchas').placeholder = res[verCant]?.ok ? String(res[verCant].pm) : 'auto';
  ultimo = { E, cants, res };

  const chipsHtml = res.length > 1 ? res.map((r, i) => `<button type="button" class="chip" data-i="${i}" aria-pressed="${i === verCant}">${fmt(r.cant, 0)} ej.</button>`).join('') : '';
  if ($('tsCantChips').innerHTML !== chipsHtml) $('tsCantChips').innerHTML = chipsHtml;
  const r = res[verCant];
  const set = (id, v) => $(id).textContent = v;
  if (r && r.ok) {
    set('tsTotal', pesos(r.total)); set('tsCosto', pesos(r.costo)); set('tsGan', `${pesos(r.ganancia)} (${fmt(b.margen, 1)} %)`);
    set('tsDescV', r.descuento ? `− ${pesos(r.descuento)}` : '—'); set('tsSub', pesos(r.subtotal)); set('tsIvaV', iva ? `${pesos(r.iva)} (${fmt(iva, 1)} %)` : '—');
    set('tsUnit', pesos(r.unitario)); set('tsUnitIva', pesos(r.unitarioIva));
    set('tsPliegos', `${fmt(r.pm, 0)} / ${fmt(r.pc, 0)}  (demasía ${fmt(r.dem, 0)})`); set('tsKilos', r.kilos ? fmt(r.kilos, 2) + ' kg' : '—');
    let grupo = '';
    $('tsDetalle').innerHTML = '<thead><tr><th>Ítem</th><th>Cálculo</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>' + r.lineas.map(l => {
      const g = l.grupo !== grupo ? (grupo = l.grupo, `<tr><td colspan="3" class="ts-grupo">${esc(l.grupo)}</td></tr>`) : '';
      return g + `<tr><td>${esc(l.nombre)}</td><td class="f">${esc(l.detalle)}</td><td class="h">${pesos(l.sub)}</td></tr>`;
    }).join('') + `<tr><td><b>Costo total</b></td><td></td><td class="h"><b>${pesos(r.costo)}</b></td></tr></tbody>`;
  } else {
    ['tsTotal', 'tsCosto', 'tsGan', 'tsDescV', 'tsSub', 'tsIvaV', 'tsUnit', 'tsUnitIva', 'tsPliegos', 'tsKilos'].forEach(id => set(id, '—'));
    $('tsDetalle').innerHTML = '';
  }
  $('tsComparar').innerHTML = res.length > 1 && res[0].ok ? '<thead><tr><th>Cantidad</th><th style="text-align:right">Total' + (iva ? ' c/IVA' : '') + '</th><th style="text-align:right">Unitario s/IVA</th></tr></thead><tbody>'
    + res.map(x => `<tr><td>${fmt(x.cant, 0)} ej.</td><td class="h">${pesos(x.total)}</td><td class="h">${pesos(x.unitario)}</td></tr>`).join('') + '</tbody>' : '';
  $('tsHint').textContent = avisos.join(' '); $('tsHint').hidden = !avisos.length;
  guardarLocal();
  if (!$('tsClienteWrap').hidden) pintarDocCliente();
  if (!$('tsCorteWrap').hidden) pintarDocCorte();
}

// ---------- Presupuesto para el cliente ----------
function colTxt(f, d) { return `${f}/${d}` + (f || d ? ` (${f} color${f === 1 ? '' : 'es'} frente${d ? `, ${d} dorso` : ', dorso sin imprimir'})` : ''); }
function pintarDocCliente() {
  if (!ultimo) return;
  const { E, res } = ultimo, b = E.base, im = cat.imprenta;
  const medida = E.tw && E.th ? `${fmt(E.tw / 10, 1)} × ${fmt(E.th / 10, 1)} cm` : '';
  const terms = b.terminaciones.map(t => t.nombre + (t.lados > 1 ? ' (frente y dorso)' : '')).join(', ');
  const filas = res.filter(r => r.ok).map(r => `<tr><td>${fmt(r.cant, 0)}</td><td class="r">${pesos(r.unitario)}</td><td class="r">${pesos(r.subtotal)}</td>${iva ? `<td class="r">${pesos(r.total)}</td>` : ''}</tr>`).join('');
  $('tsClienteDoc').innerHTML = `
    <div class="ts-doc-head">
      <div><div class="ts-doc-imp">${esc(im.nombre || 'Mi imprenta')}</div>
        <div class="ts-doc-sub">${[im.cuit && 'CUIT ' + esc(im.cuit), esc(im.direccion), esc(im.telefono), esc(im.email)].filter(Boolean).join(' · ')}</div></div>
      <div class="ts-doc-num"><b>PRESUPUESTO</b><br>N° ${esc($('tsNumero').value || '—')}<br>${fechaTxt($('tsFecha').value)}</div>
    </div>
    <p><b>Cliente:</b> ${esc($('tsCliente').value) || '—'}<br><b>Trabajo:</b> ${esc($('tsTrabajo').value) || '—'}</p>
    <table class="ts-doc-spec">
      ${medida ? `<tr><td>Medida terminada</td><td>${medida}</td></tr>` : ''}
      ${b.papel.nombre ? `<tr><td>Papel</td><td>${esc(b.papel.nombre)}</td></tr>` : ''}
      <tr><td>Impresión</td><td>${colTxt(b.colF, b.colD)}</td></tr>
      ${b.micro.tipo || b.micro.formato ? `<tr><td>Microcorrugado</td><td>${esc([b.micro.tipo, b.micro.formato].filter(Boolean).join(' · '))}</td></tr>` : ''}
      ${terms ? `<tr><td>Terminaciones</td><td>${esc(terms)}</td></tr>` : ''}
    </table>
    <table class="ts-doc-precios">
      <thead><tr><th>Cantidad</th><th class="r">Precio unitario</th><th class="r">Subtotal${iva ? ' sin IVA' : ''}</th>${iva ? `<th class="r">Total con IVA ${fmt(iva, 1)} %</th>` : ''}</tr></thead>
      <tbody>${filas || '<tr><td colspan="4">—</td></tr>'}</tbody>
    </table>
    <p class="ts-doc-pie">${im.validez ? `Validez de la oferta: ${esc(im.validez)} días. ` : ''}${im.pago ? `Forma de pago: ${esc(im.pago)}. ` : ''}${b.papel.moneda === 'USD' || b.maquina.moneda === 'USD' || (b.micro.precio && b.micro.moneda === 'USD') ? 'Precios sujetos a la cotización del dólar oficial. ' : ''}${esc(im.notas || '')}</p>`;
}
// ---------- Diagrama de corte ----------
const SVGNS = 'http://www.w3.org/2000/svg';
function svgCompra(cw, ch, n) {
  // pliego de compra (cm) con las líneas de corte en n partes
  const c = { 1: [1, 1], 2: [2, 1], 3: [3, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 9: [3, 3] }[n];
  const W = cw * 10, H = ch * 10, M = Math.max(W, H), pad = M * .09, fs = M * .032, sw = M * .003;
  const largoEsH = H >= W;
  const nx = largoEsH ? c[1] : c[0], ny = largoEsH ? c[0] : c[1];   // divisiones en x / y
  const pw = W / nx, ph = H / ny;
  let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="#fafafa" stroke="#111" stroke-width="${sw * 1.6}"/>`;
  for (let i = 1; i < nx; i++) g += `<line x1="${pw * i}" y1="${-pad * .25}" x2="${pw * i}" y2="${H + pad * .25}" stroke="#c0392b" stroke-width="${sw}" stroke-dasharray="${fs * .5} ${fs * .3}"/>`;
  for (let j = 1; j < ny; j++) g += `<line x1="${-pad * .25}" y1="${ph * j}" x2="${W + pad * .25}" y2="${ph * j}" stroke="#c0392b" stroke-width="${sw}" stroke-dasharray="${fs * .5} ${fs * .3}"/>`;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const k = j * nx + i + 1;
    g += `<text x="${pw * i + pw / 2}" y="${ph * j + ph / 2 - fs * .5}" font-size="${fs * 1.1}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" fill="#2f6f4f">${k}</text>`;
    g += `<text x="${pw * i + pw / 2}" y="${ph * j + ph / 2 + fs * .9}" font-size="${fs * .85}" text-anchor="middle" font-family="Arial,sans-serif" fill="#333">${fmt(pw / 10, 1)} × ${fmt(ph / 10, 1)}</text>`;
  }
  g += `<text x="${W / 2}" y="${-pad * .45}" font-size="${fs}" text-anchor="middle" font-family="Arial,sans-serif" fill="#111">${fmt(cw, 1)} cm</text>`;
  g += `<text x="${-pad * .45}" y="${H / 2}" font-size="${fs}" text-anchor="middle" font-family="Arial,sans-serif" fill="#111" transform="rotate(-90 ${-pad * .45} ${H / 2})">${fmt(ch, 1)} cm</text>`;
  return `<svg xmlns="${SVGNS}" viewBox="${-pad} ${-pad} ${W + pad * 1.6} ${H + pad * 1.6}">${g}</svg>`;
}
function svgMaquina(a, pinzaMm, calleMm) {
  const { W, H, rects, E } = a, M = Math.max(W, H), pad = M * .1, fs = M * .03, sw = M * .0025;
  let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff" stroke="#111" stroke-width="${sw * 1.6}"/>`;
  if (E.b > 0) g += `<rect x="0" y="${H - E.b}" width="${W}" height="${E.b}" fill="#f6e7b0" stroke="#c9a227" stroke-width="${sw * .6}"/><text x="${W / 2}" y="${H + fs * 1.3}" font-size="${fs * .9}" text-anchor="middle" font-family="Arial,sans-serif" fill="#7a5c00">▲ pinza ${fmt(pinzaMm, 0)} mm</text>`;
  const nfs = Math.min(...rects.map(r => Math.min(r.w, r.h))) * .22;
  rects.forEach((r, i) => {
    g += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.rot ? '#f3e1ea' : '#e3efe8'}" stroke="${r.rot ? '#b4386e' : '#2f6f4f'}" stroke-width="${sw}"/>`;
    if (rects.length <= 80) g += `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2}" font-size="${nfs}" text-anchor="middle" dominant-baseline="central" font-family="Arial,sans-serif" font-weight="700" fill="${r.rot ? '#b4386e' : '#2f6f4f'}">${i + 1}</text>`;
  });
  // sobrantes alrededor del bloque (para la guillotina)
  const x1 = Math.min(...rects.map(r => r.x)), y1 = Math.min(...rects.map(r => r.y));
  const x2 = Math.max(...rects.map(r => r.x + r.w)), y2 = Math.max(...rects.map(r => r.y + r.h));
  const cota = (xa, ya, xb, yb, t, vert) => {
    const mx = (xa + xb) / 2, my = (ya + yb) / 2;
    return `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="#555" stroke-width="${sw * .8}" marker-start="url(#fl)" marker-end="url(#fl)"/>`
      + `<text x="${mx}" y="${my}" font-size="${fs * .9}" text-anchor="middle" dominant-baseline="${vert ? 'central' : 'auto'}" font-family="Arial,sans-serif" fill="#333" ${vert ? `transform="rotate(-90 ${mx} ${my})" dy="${-fs * .35}"` : `dy="${-fs * .3}"`}>${t}</text>`;
  };
  const gy = y1 + (y2 - y1) * .5, gx = x1 + (x2 - x1) * .5;
  if (x1 > 1) g += cota(0, gy, x1, gy, fmt(x1, 1), false);
  if (W - x2 > 1) g += cota(x2, gy, W, gy, fmt(W - x2, 1), false);
  if (y1 > 1) g += cota(gx, 0, gx, y1, fmt(y1, 1), true);
  if (H - E.b - y2 > 1) g += cota(gx, y2, gx, H - E.b, fmt(H - E.b - y2, 1), true);
  g += `<text x="${W / 2}" y="${-pad * .45}" font-size="${fs}" text-anchor="middle" font-family="Arial,sans-serif" fill="#111">${fmt(W / 10, 1)} cm</text>`;
  g += `<text x="${-pad * .45}" y="${H / 2}" font-size="${fs}" text-anchor="middle" font-family="Arial,sans-serif" fill="#111" transform="rotate(-90 ${-pad * .45} ${H / 2})">${fmt(H / 10, 1)} cm</text>`;
  const defs = `<defs><marker id="fl" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="${4}" markerHeight="${4}" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#555"/></marker></defs>`;
  return `<svg xmlns="${SVGNS}" viewBox="${-pad} ${-pad} ${W + pad * 1.6} ${H + pad * 1.6}">${defs}${g}</svg>`;
}
function pintarDocCorte() {
  if (!ultimo) return;
  const { E, res } = ultimo, b = E.base, im = cat.imprenta, r = res[verCant];
  const doc = $('tsCorteDoc');
  const calle = num($('tsCalle').value), pinza = num($('tsPinza').value);
  if (!b.maq || !E.tw || !E.th) { doc.innerHTML = '<p>Cargá el corte a corte y el pliego para ver el diagrama.</p>'; return; }
  const a = window.armadoPoses ? window.armadoPoses(b.maq.w * 10, b.maq.h * 10, E.tw, E.th, { pinza, calleX: calle, calleY: calle, poses: E.poses }) : null;
  const filas = [
    ['Corte a corte', `${fmt(E.tw, 1)} × ${fmt(E.th, 1)} mm`],
    b.papel.nombre && ['Papel', b.papel.nombre],
    b.compra.w && ['Pliego de compra', `${fmt(b.compra.w, 1)} × ${fmt(b.compra.h, 1)} cm`],
    ['Pliego de máquina', `${fmt(b.maq.w, 1)} × ${fmt(b.maq.h, 1)} cm${E.corte ? ` (${E.corte === 1 ? 'entero' : 'pliego de compra en ' + E.corte})` : ''}`],
    ['Poses por pliego', String(E.poses) + (a && E.poses > a.maximo ? ` (ojo: con estas medidas entran como máximo ${a.maximo}; el dibujo muestra ${a.maximo})` : '')],
    ['Pinza / calle', `${fmt(pinza, 0)} mm / ${calle ? fmt(calle, 1) + ' mm' : 'sin calle'}`],
    ['Impresión', `${b.colF}/${b.colD}`],
    r && r.ok && ['Cantidad', `${fmt(r.cant, 0)} ej. → ${fmt(r.netos, 0)} pl. + ${fmt(r.dem, 0)} demasía = ${fmt(r.pm, 0)} pl. de máquina${E.corte ? ` = ${fmt(r.pc, 0)} pl. de compra` : ''}`],
    b.micro.tipo && ['Microcorrugado', [b.micro.tipo, b.micro.formato].filter(Boolean).join(' · ')],
  ].filter(Boolean);
  doc.innerHTML = `
    <div class="ts-doc-head">
      <div><div class="ts-doc-imp">Diagrama de corte</div><div class="ts-doc-sub">${[im.nombre && esc(im.nombre), $('tsNumero').value && 'Presupuesto N° ' + esc($('tsNumero').value)].filter(Boolean).join(' · ')}</div></div>
      <div class="ts-doc-num"><b>${esc($('tsCliente').value || '')}</b><br>${esc($('tsTrabajo').value || '')}<br>${fechaTxt($('tsFecha').value)}</div>
    </div>
    <table class="ts-doc-spec">${filas.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <div class="ts-figs">
      ${E.corte && b.compra.w ? `<div class="ts-fig"><h4>1 · Pliego de compra: cortar en ${E.corte === 1 ? '— (entero)' : E.corte}</h4>${svgCompra(b.compra.w, b.compra.h, E.corte)}<p>Línea roja punteada: corte del pliego de compra. Cada pieza es un pliego de máquina de ${fmt(b.maq.w, 1)} × ${fmt(b.maq.h, 1)} cm.</p></div>` : ''}
      ${a ? `<div class="ts-fig"><h4>${E.corte && b.compra.w ? '2' : '1'} · Pliego de máquina: ${a.rects.length} pose${a.rects.length === 1 ? '' : 's'}</h4>${svgMaquina(a, pinza, calle)}<p>Verde: poses derechas · rosa: giradas 90° · amarillo: pinza. Las cotas muestran el sobrante (mm) alrededor del bloque, que va centrado en la mesa.</p></div>` : '<p>El trabajo no entra en el pliego de máquina con esa pinza.</p>'}
    </div>`;
}
$('tsVerCorte').addEventListener('click', () => { pintarDocCorte(); $('tsCorteWrap').hidden = false; $('tsCorteWrap').scrollIntoView({ behavior: 'smooth' }); });
$('tsCerrarCorte').addEventListener('click', () => $('tsCorteWrap').hidden = true);
$('tsImprimirCorte').addEventListener('click', () => imprimir('tsCorteDoc', 'Diagrama de corte'));

function textoCliente() {
  const { E, res } = ultimo, b = E.base;
  return [
    `PRESUPUESTO ${$('tsNumero').value ? 'N° ' + $('tsNumero').value + ' ' : ''}· ${fechaTxt($('tsFecha').value)}`,
    cat.imprenta.nombre, '',
    `Cliente: ${$('tsCliente').value || '—'}`, `Trabajo: ${$('tsTrabajo').value || '—'}`,
    E.tw ? `Medida: ${fmt(E.tw / 10, 1)} × ${fmt(E.th / 10, 1)} cm` : '',
    b.papel.nombre ? `Papel: ${b.papel.nombre}` : '', `Impresión: ${b.colF}/${b.colD}`,
    b.micro.tipo || b.micro.formato ? `Microcorrugado: ${[b.micro.tipo, b.micro.formato].filter(Boolean).join(' · ')}` : '',
    b.terminaciones.length ? `Terminaciones: ${b.terminaciones.map(t => t.nombre + (t.lados > 1 ? ' F y D' : '')).join(', ')}` : '', '',
    ...res.filter(r => r.ok).map(r => `${fmt(r.cant, 0)} ej.: ${pesos(r.subtotal)}${iva ? ` + IVA = ${pesos(r.total)}` : ''} (${pesos(r.unitario)} c/u)`), '',
    cat.imprenta.validez ? `Validez: ${cat.imprenta.validez} días.` : '', cat.imprenta.pago ? `Forma de pago: ${cat.imprenta.pago}.` : '',
  ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0)).join('\n');
}
$('tsVerCliente').addEventListener('click', () => { pintarDocCliente(); $('tsClienteWrap').hidden = false; $('tsClienteWrap').scrollIntoView({ behavior: 'smooth' }); });
$('tsCerrarDoc').addEventListener('click', () => $('tsClienteWrap').hidden = true);
$('tsImprimir').addEventListener('click', () => imprimir('tsClienteDoc', 'Presupuesto'));
// Copia el documento a un contenedor al nivel del body y oculta todo lo demás al imprimir (así no salen páginas en blanco)
function imprimir(id, titulo) {
  let area = document.getElementById('printArea');
  if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
  area.innerHTML = `<div class="ts-doc">${$(id).innerHTML}</div>`;
  const t = document.title;
  document.title = [titulo, $('tsNumero').value && 'N° ' + $('tsNumero').value, $('tsCliente').value].filter(Boolean).join(' - ');   // nombre sugerido del PDF
  document.body.classList.add('imprimiendo');
  const fin = () => { document.body.classList.remove('imprimiendo'); document.title = t; window.removeEventListener('afterprint', fin); };
  window.addEventListener('afterprint', fin);
  window.print();
  setTimeout(fin, 1500);
}
$('tsCopiar').addEventListener('click', () => {
  const t = textoCliente();
  const ok = () => msg('Copiado. Pegalo en WhatsApp o en un mail.');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(ok, () => msg('No se pudo copiar.')); else msg('No se pudo copiar.');
});
function msg(t) { $('tsMsg').textContent = t; clearTimeout(msg.t); msg.t = setTimeout(() => $('tsMsg').textContent = '', 4000); }

// ---------- Eventos del formulario ----------
sec.addEventListener('input', e => { if (e.target.closest('#tsConfig')) return; if (e.target.id === 'tsCantidades') verCant = 0; calcular(); });
// 'change' solo para listas y casillas (los campos de texto ya recalculan con 'input')
sec.addEventListener('change', e => { if (e.target.closest('#tsConfig') || e.target.closest('#tsTerms')) return; if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'date') calcular(); });
$('tsUTr').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.dataset.u === uTr) return;
  const f = b.dataset.u === 'cm' ? 0.1 : 10;
  ['tsTw', 'tsTh'].forEach(id => { const v = num($(id).value); if (v > 0) $(id).value = fmt(v * f, 2).replace(/\./g, '').replace(/,00$/, ''); });
  uTr = b.dataset.u; calcular();
});
$('tsDemModo').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { demModo = b.dataset.m; calcular(); } });
$('tsIva').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { iva = +b.dataset.iva; calcular(); } });
$('tsPapelMon').addEventListener('click', () => { papelMon = papelMon === 'USD' ? 'ARS' : 'USD'; calcular(); });
$('tsMicroMon').addEventListener('click', () => { microMon = microMon === 'USD' ? 'ARS' : 'USD'; calcular(); });
$('tsColChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; const [f, d] = b.dataset.c.split('/'); $('tsColF').value = f; $('tsColD').value = d; calcular(); });
$('tsCantChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { verCant = +b.dataset.i; calcular(); } });
$('tsPapelSel').addEventListener('change', () => {
  const p = cat.papeles.find(x => x.id === $('tsPapelSel').value); if (!p) return;
  $('tsPapelNombre').value = p.nombre; $('tsGramaje').value = p.gramaje; $('tsPapelPrecio').value = String(p.precio).replace('.', ',');
  $('tsPapelUnidad').value = p.unidad; papelMon = p.moneda;
  if (p.w && p.h) { $('tsCw').value = p.w; $('tsCh').value = p.h; }
  calcular();
});
$('tsTerms').addEventListener('change', e => {
  const row = e.target.closest('.ts-term'); if (!row) return;
  const s = termSel[row.dataset.id] ||= { on: false, lados: 1 };
  if (e.target.dataset.k === 'on') { s.on = e.target.checked; row.classList.toggle('on', s.on); }
  if (e.target.dataset.k === 'lados') s.lados = +e.target.value;
  calcular();
});
function aplicarDefaults(todo) {
  const d = cat.defaults;
  if (todo || $('tsDemColor').value === '') $('tsDemColor').value = d.demColor;
  if (todo || $('tsDemPct').value === '') $('tsDemPct').value = String(d.demPct).replace('.', ',');
  if (todo || $('tsMargen').value === '') $('tsMargen').value = String(d.margen).replace('.', ',');
  if (todo) { $('tsPinza').value = d.pinza; iva = d.iva; }
}
$('tsNuevo').addEventListener('click', () => {
  ['tsCliente', 'tsTrabajo', 'tsCantidades', 'tsTw', 'tsTh', 'tsPoses', 'tsMicroTipo', 'tsMicroFormato', 'tsMicroPrecio', 'tsMicroPlanchas', 'tsPreimp', 'tsPruebas', 'tsFlete', 'tsOtro', 'tsPorCaja', 'tsCajaPrecio', 'tsNumero'].forEach(id => $(id).value = '');
  $('tsFecha').value = hoy(); $('tsDesc').value = '0'; abierto = null; aplicarDefaults(true);
  for (const k in termSel) delete termSel[k]; pintarTerminaciones();
  $('tsClienteWrap').hidden = true; $('tsCorteWrap').hidden = true; $('tsGuardar').textContent = 'Guardar presupuesto';
  calcular(); pintarLista(); msg('Presupuesto nuevo.');
});

// ---------- Guardar / registro (Firebase) ----------
const col = () => FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'presupuestosTest');
$('tsGuardar').addEventListener('click', () => {
  if (!usuario || !FB) return msg('Ingresá con Google para guardar.');
  if (!ultimo || !ultimo.res.some(r => r.ok)) return msg('El presupuesto todavía no tiene precio.');
  if (!$('tsCliente').value.trim() && !$('tsTrabajo').value.trim()) return msg('Completá el cliente o el trabajo.');
  const { E, res } = ultimo;
  const resumen = res.filter(r => r.ok).map(r => ({ cant: r.cant, total: Math.round(r.total * 100) / 100, subtotal: Math.round(r.subtotal * 100) / 100, unitario: Math.round(r.unitario * 10000) / 10000, pm: r.pm, pc: r.pc, kilos: Math.round(r.kilos * 100) / 100 }));
  const datos = {
    fecha: $('tsFecha').value || hoy(), cliente: $('tsCliente').value.trim(), trabajo: $('tsTrabajo').value.trim(),
    resumen, papel: E.base.papel.nombre, compra: `${fmt(E.base.compra.w, 0)}×${fmt(E.base.compra.h, 0)}`,
    snapshot: snapshot(), actualizado: FB.fb.serverTimestamp(),
  };
  if (abierto) {
    FB.fb.updateDoc(FB.fb.doc(col(), abierto), datos).catch(e => msg('Error: ' + e.code));
    msg('Cambios guardados.');
  } else {
    const numero = lista.reduce((m, x) => Math.max(m, x.numero || 0), 0) + 1;
    const ref = FB.fb.doc(col()); abierto = ref.id; $('tsNumero').value = numero;
    datos.snapshot.campos.tsNumero = String(numero);
    FB.fb.setDoc(ref, { ...datos, numero, estado: 'Pendiente', creado: FB.fb.serverTimestamp() }).catch(e => msg('Error: ' + e.code));
    msg(`Guardado como presupuesto N° ${numero}.`);
  }
  $('tsGuardar').textContent = 'Guardar cambios';
  pintarLista();
});
function pintarLista() {
  const q = $('tsBuscar').value.trim().toLowerCase(), fe = $('tsFiltro').value;
  const l = lista.filter(r => (!fe || r.estado === fe) && (!q || [r.cliente, r.trabajo, r.numero].join(' ').toLowerCase().includes(q)));
  $('tsClientes').innerHTML = [...new Set(lista.map(r => r.cliente).filter(Boolean))].sort().map(c => `<option value="${esc(c)}"></option>`).join('');
  if (!l.length) { $('tsLista').innerHTML = `<div class="pl-vacio">${lista.length ? 'No hay presupuestos que coincidan.' : 'Todavía no guardaste presupuestos. Armá uno arriba y tocá "Guardar presupuesto".'}</div>`; return; }
  $('tsLista').innerHTML = l.map(r => {
    const p = r.resumen?.[0];
    return `<div class="pl-item${abierto === r.id ? ' editando' : ''}" data-id="${r.id}">
      <div class="t">N° ${esc(r.numero)} · ${esc(r.cliente || 'Sin cliente')}</div>
      <div class="n">${p ? pesos(p.total) : '—'}</div>
      <div class="d">${esc(fechaTxt(r.fecha))}${r.trabajo ? ' · ' + esc(r.trabajo) : ''}${r.resumen?.length > 1 ? ` · ${r.resumen.length} cantidades` : ''}</div>
      <div class="n">${p ? fmt(p.cant, 0) + ' ej.' : ''}</div>
      <div class="acc">
        <select data-acc="estado" class="ts-select ts-mini ts-estado ${String(r.estado || '').toLowerCase()}">${['Pendiente', 'Aprobado', 'Rechazado'].map(e => `<option ${r.estado === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
        ${borrando === r.id
          ? `<span class="estado">¿Borrar?</span><button type="button" class="btn small danger" data-acc="si">Sí</button><button type="button" class="btn small" data-acc="no">No</button>`
          : `<button type="button" class="btn small" data-acc="abrir">Abrir</button>${r.estado === 'Aprobado' ? '<button type="button" class="btn small" data-acc="pedido">Pedido de papel</button>' : ''}<button type="button" class="btn small" data-acc="borrar">Borrar</button>`}
      </div></div>`;
  }).join('');
}
$('tsBuscar').addEventListener('input', pintarLista);
$('tsFiltro').addEventListener('change', pintarLista);
$('tsLista').addEventListener('change', e => {
  if (e.target.dataset.acc !== 'estado') return;
  const id = e.target.closest('.pl-item').dataset.id;
  FB.fb.updateDoc(FB.fb.doc(col(), id), { estado: e.target.value }).catch(err => msg('Error: ' + err.code));
});
$('tsLista').addEventListener('click', e => {
  const b = e.target.closest('button[data-acc]'); if (!b) return;
  const id = b.closest('.pl-item').dataset.id, r = lista.find(x => x.id === id); if (!r) return;
  const a = b.dataset.acc;
  if (a === 'borrar') borrando = id;
  else if (a === 'no') borrando = null;
  else if (a === 'si') { borrando = null; if (abierto === id) abierto = null; FB.fb.deleteDoc(FB.fb.doc(col(), id)); msg('Presupuesto borrado.'); }
  else if (a === 'abrir') {
    restaurar(r.snapshot); $('tsNumero').value = r.numero || ''; abierto = id; verCant = 0;
    $('tsGuardar').textContent = 'Guardar cambios'; calcular();
    sec.scrollIntoView({ behavior: 'smooth' }); msg(`Presupuesto N° ${r.numero} abierto.`);
  } else if (a === 'pedido') {
    const p = r.resumen?.[0]; if (!p) return;
    window.pedidoPendiente = { formato: r.compra, material: r.papel, pliegos: p.pc, kilos: p.kilos, trabajo: [r.trabajo, r.cliente].filter(Boolean).join(' · ') };
    document.querySelector('[data-tool=planilla]').click();
    window.dispatchEvent(new Event('pedido-pendiente'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  pintarLista();
});

// ---------- Inicio ----------
try { const c = JSON.parse(localStorage.getItem('test-catalogo') || 'null'); if (c) cat = { ...structuredClone(CATALOGO_INICIAL), ...c }; } catch (e) {}
pintarConfig(); llenarSelects();
let local = null; try { local = JSON.parse(localStorage.getItem('test-v1') || 'null'); } catch (e) {}
if (local) restaurar(local); else { pintarTerminaciones(); $('tsPapelSel').value = 'p1'; $('tsPapelSel').dispatchEvent(new Event('change')); $('tsCorte').value = '2'; }
if (!$('tsFecha').value) $('tsFecha').value = hoy();
aplicarDefaults(false);
calcular();
traerDolar();
window.addEventListener('dolar-actualizado', e => { const o = e.detail?.oficial; if (o) { dolar = { ...o, chequeado: e.detail.chequeado }; calcular(); } });
document.querySelector('[data-tool=presupuesto]').addEventListener('click', calcular);

let viejos = [], dejarViejos = null, viejoBorrando = null;
function pintarViejos() {
  $('tsViejos').hidden = !viejos.length; $('tsViejosN').textContent = viejos.length;
  $('tsViejosLista').innerHTML = viejos.map(r => `<div class="pl-item" data-id="${r.id}">
    <div class="t">${esc(r.cliente || 'Sin cliente')}</div><div class="n">${r.total ? pesos(r.total) : '—'}</div>
    <div class="d">${esc(fechaTxt(r.fecha))}${r.trabajo ? ' · ' + esc(r.trabajo) : ''}</div><div class="n">${r.cantidad ? fmt(r.cantidad, 0) + ' ej.' : ''}</div>
    <div class="acc">${viejoBorrando === r.id ? '<span class="estado">¿Borrar?</span><button type="button" class="btn small danger" data-acc="si">Sí</button><button type="button" class="btn small" data-acc="no">No</button>' : '<button type="button" class="btn small" data-acc="borrar">Borrar</button>'}</div></div>`).join('');
}
$('tsViejosLista').addEventListener('click', e => {
  const b = e.target.closest('button[data-acc]'); if (!b) return;
  const id = b.closest('.pl-item').dataset.id;
  if (b.dataset.acc === 'borrar') viejoBorrando = id; else if (b.dataset.acc === 'no') viejoBorrando = null;
  else { viejoBorrando = null; FB.fb.deleteDoc(FB.fb.doc(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'presupuestos'), id)); }
  pintarViejos();
});

function conectar(fbInfo) {
  FB = fbInfo; usuario = fbInfo.user;
  if (dejarLista) { dejarLista(); dejarLista = null; }
  if (dejarViejos) { dejarViejos(); dejarViejos = null; }
  viejos = []; pintarViejos();
  lista = []; abierto = null; borrando = null;
  $('tsRegAviso').hidden = !!usuario; $('tsRegApp').hidden = !usuario;
  if (!usuario) { $('tsGuardar').textContent = 'Guardar presupuesto'; return; }
  $('tsLista').innerHTML = '<div class="pl-vacio">Cargando…</div>';
  // catálogo de la cuenta
  FB.fb.getDoc(FB.fb.doc(FB.db, 'usuarios', usuario.uid, 'config', 'test')).then(d => {
    if (d.exists() && d.data().catalogo) { cat = { ...structuredClone(CATALOGO_INICIAL), ...d.data().catalogo }; pintarConfig(); llenarSelects(); pintarTerminaciones(); calcular(); $('tsConfigInfo').textContent = 'Catálogo cargado de tu cuenta.'; }
  }).catch(() => {});
  dejarLista = FB.fb.onSnapshot(col(), snap => {
    lista = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.numero || 0) - (a.numero || 0));
    pintarLista();
  }, e => { $('tsLista').innerHTML = '<div class="pl-vacio">No se pudo leer (' + esc(e.code || e.message) + ').</div>'; });
  dejarViejos = FB.fb.onSnapshot(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'presupuestos'), snap => {
    viejos = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    pintarViejos();
  }, () => {});
}
window.addEventListener('pliego-auth', () => conectar(window.pliegoFB));
if (window.pliegoFB) conectar(window.pliegoFB);
