// Pestaña "Presupuesto". Usa el motor de presupuesto-calculo.js.
// Guarda en Firebase: usuarios/{uid}/config/test (catálogo) y usuarios/{uid}/presupuestosTest (presupuestos).
// (Los nombres "test" quedaron de cuando era la pestaña de prueba; se mantienen para no perder lo ya guardado.)
// Los presupuestos de la versión anterior siguen en usuarios/{uid}/presupuestos y se muestran aparte, solo lectura.
import { presupuestar, pliegoMaquina, entraEnMaquina, piezasPorCompra, UNIDADES, fmt } from './presupuesto-calculo.js';

const $ = id => document.getElementById(id);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = window.parseNum ? window.parseNum(String(v ?? '')) : parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
const pesos = v => '$ ' + fmt(v, 2);
const hoy = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fechaTxt = f => f ? f.split('-').reverse().join('/') : '';
const uid = () => Math.random().toString(36).slice(2, 9);

// ---------- Catálogo por defecto (precios de EJEMPLO) ----------
const CATALOGO_INICIAL = {
  version: 4,
  imprenta: { nombre: '', cuit: '', telefono: '', email: '', direccion: '', validez: 15, pago: 'Contado', notas: '' },
  defaults: { demFrente: 100, demDorso: 100, demPct: 0, margen: 40, iva: 21, pinza: 10 },
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
    { id: 't4', nombre: 'Laca UV', unidad: 'pliego', precio: 60, postura: 10000, moneda: 'ARS', porLado: true },
    { id: 't11', nombre: 'UV sectorizado', unidad: 'pliego', precio: 90, postura: 25000, moneda: 'ARS', porLado: true },
    { id: 't5', nombre: 'Troquelado', unidad: 'millarPl', precio: 15000, postura: 30000, moneda: 'ARS', porLado: false },
    { id: 't6', nombre: 'Doblado díptico', unidad: 'millarEj', precio: 9000, postura: 12000, moneda: 'ARS', porLado: false },
    { id: 't7', nombre: 'Doblado tríptico', unidad: 'millarEj', precio: 12000, postura: 15000, moneda: 'ARS', porLado: false },
    { id: 't8', nombre: 'Encuadernación binder', unidad: 'millarEj', precio: 60000, postura: 40000, moneda: 'ARS', porLado: false },
    { id: 't9', nombre: 'Corte final guillotina', unidad: 'fijo', precio: 15000, postura: 0, moneda: 'ARS', porLado: false },
    { id: 't10', nombre: 'Pegado', unidad: 'millarEj', precio: 10000, postura: 15000, moneda: 'ARS', porLado: false },
    { id: 't12', nombre: 'Hot melt de dorso', unidad: 'millarEj', precio: 70000, postura: 40000, moneda: 'ARS', porLado: false },
    { id: 't13', nombre: 'Hot stamping', unidad: 'pliego', precio: 120, postura: 45000, moneda: 'ARS', porLado: true },
  ],
};
let cat = structuredClone(CATALOGO_INICIAL);
// Catálogos guardados antes de que existieran algunas terminaciones: se les agregan una sola vez
const NUEVAS_TERMINACIONES = { 2: ['t10'], 3: ['t11', 't12'], 4: ['t13'] };   // versión → ids agregados
const RENOMBRES = { 3: [['t4', 'UV sectorizado', 'Laca UV']] };     // versión → [id, nombre viejo, nombre nuevo]
const VERSION_CATALOGO = 4;
function actualizarCatalogo(c, versionGuardada) {
  const v = versionGuardada || 1;
  for (let n = v + 1; n <= VERSION_CATALOGO; n++) for (const [id, viejo, nuevo] of RENOMBRES[n] || []) {
    const t = c.terminaciones.find(x => x.id === id && x.nombre.toLowerCase() === viejo.toLowerCase());
    if (t) t.nombre = nuevo;   // conserva los precios que ya tenía
  }
  for (let n = v + 1; n <= VERSION_CATALOGO; n++) for (const id of NUEVAS_TERMINACIONES[n] || []) {
    const t = CATALOGO_INICIAL.terminaciones.find(x => x.id === id);
    if (t && !c.terminaciones.some(x => x.id === id || x.nombre.toLowerCase() === t.nombre.toLowerCase())) c.terminaciones.push(structuredClone(t));
  }
  if (c.defaults && c.defaults.demFrente == null) {
    const pc = c.defaults.demColor ?? 25;
    c.defaults.demFrente = pc * 4; c.defaults.demDorso = pc * 4;
  }
  c.version = VERSION_CATALOGO;
  return c;
}
let dolar = null;
let usuario = null, FB = null;
let lista = [], dejarLista = null, abierto = null, borrando = null, verCant = 0;
let pedidos = [], dejarPedidos = null;   // pedidos de la Planilla, para traer el papel
let pidiendo = null;
let clientes = [], dejarClientes = null;   // agenda de la pestaña Clientes                     // presupuesto que está eligiendo cantidad para el pedido de papel
let ultimo = null;   // { entrada, resultados[] }

// ---------- Estructura ----------
const sec = $('presupuesto');
sec.innerHTML = `
  <h2 class="sec" style="margin-top:0">Datos</h2>
  <div class="grid">
    <div><label for="tsFecha">Fecha</label><input id="tsFecha" type="date" style="padding-right:12px"></div>
    <div><label for="tsNumero">N° presupuesto</label><input id="tsNumero" readonly placeholder="al guardar" style="padding-right:12px"></div>
    <div class="full"><label for="tsClienteSel">Cliente de tu agenda</label><select id="tsClienteSel" class="ts-select"><option value="">Cargando…</option></select></div>
    <div class="full"><label for="tsCliente">Cliente <span class="calle-sub">(o escribilo a mano)</span></label><input id="tsCliente" list="tsClientes" placeholder="Nombre del cliente" style="padding-right:12px" autocomplete="off"><datalist id="tsClientes"></datalist>
      <div class="ts-cli-info"><span class="estado" id="tsClienteInfo"></span><button type="button" class="btn small" id="tsClienteAgendar" hidden>+ Guardar en Clientes</button></div></div>
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
    <div class="full"><label for="tsPedidoSel">Traer el papel de un pedido</label><select id="tsPedidoSel" class="ts-select"><option value="">Cargando…</option></select>
      <span class="estado" id="tsPedidoInfo"></span></div>
    <div class="full"><label for="tsPapelSel">Papel del catálogo</label><select id="tsPapelSel" class="ts-select"></select></div>
    <div><label for="tsPapelNombre">Tipo</label><input id="tsPapelNombre" placeholder="Ilustración" style="padding-right:12px"></div>
    <div><label for="tsGramaje">Gramaje</label><div class="field"><input id="tsGramaje" inputmode="decimal"><span class="unit">g/m²</span></div></div>
    <div><label for="tsPapelPrecio">Precio</label><div class="field"><input id="tsPapelPrecio" inputmode="decimal"><button type="button" class="pr-cur" id="tsPapelMon" data-cur="USD">US$</button></div></div>
    <div><label for="tsPapelUnidad">Por</label><select id="tsPapelUnidad" class="ts-select"><option value="kg">kilo</option><option value="pliego">pliego de compra</option></select></div>
    <div><label for="tsCw">Hoja de compra ancho</label><div class="field"><input id="tsCw" inputmode="decimal"><span class="unit">cm</span></div></div>
    <div><label for="tsCh">Hoja de compra alto</label><div class="field"><input id="tsCh" inputmode="decimal"><span class="unit">cm</span></div></div>
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
      <span class="estado">Pliegos de más para todo el trabajo, por lado (no por color).</span></div>
    <div><label for="tsDemFrente">Frente</label><div class="field"><input id="tsDemFrente" inputmode="numeric"><span class="unit">pl.</span></div></div>
    <div id="tsDemDorsoBox"><label for="tsDemDorso">Dorso</label><div class="field"><input id="tsDemDorso" inputmode="numeric"><span class="unit">pl.</span></div></div>
    <div class="full"><label for="tsDemPct">Además, % del tiraje (opcional)</label><div class="field"><input id="tsDemPct" inputmode="decimal"><span class="unit">%</span></div></div>
    <div class="full estado" id="tsDemInfo"></div>
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
    <div hidden><label for="tsMargen" id="tsMargenLabel">Ganancia</label><div class="field"><input id="tsMargen" inputmode="decimal"><span class="unit">%</span></div></div>
    <div class="full"><label for="tsDesc">Descuento</label><div class="field"><input id="tsDesc" inputmode="decimal" value="0"><span class="unit">%</span></div></div>
    <div class="full"><label>IVA</label><div class="mode four" role="group" id="tsIva">
      <button type="button" data-iva="21" aria-pressed="true">21 %</button><button type="button" data-iva="10.5" aria-pressed="false">10,5 %</button>
      <button type="button" data-iva="0" aria-pressed="false">Sin IVA</button><button type="button" data-iva="27" aria-pressed="false">27 %</button></div></div>
    <div class="full" id="tsMargenesBox">
      <label>Ganancia por cantidad</label>
      <div class="ts-margenes" id="tsMargenes"></div>
      <span class="estado" id="tsMargenesInfo"></span>
    </div>
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
  <div class="aviso" id="tsRegAviso"><span id="tsRegAvisoTxt">Cargando…</span></div>
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
let margenCant = {};   // cantidad → ganancia % propia (texto como se escribió)
const termSel = {};   // id → { on, lados }
const CAMPOS = ['tsFecha', 'tsCliente', 'tsTrabajo', 'tsCantidades', 'tsTw', 'tsTh', 'tsCalle', 'tsPinza', 'tsPoses', 'tsPapelSel', 'tsPapelNombre', 'tsGramaje',
  'tsPapelPrecio', 'tsPapelUnidad', 'tsCw', 'tsCh', 'tsCorte', 'tsMw', 'tsMh', 'tsMaquina', 'tsColF', 'tsColD', 'tsDemFrente', 'tsDemDorso', 'tsDemPct',
  'tsMicroTipo', 'tsMicroFormato', 'tsMicroPrecio', 'tsMicroPlanchas', 'tsPreimp', 'tsPruebas', 'tsFlete', 'tsOtro', 'tsPorCaja', 'tsCajaPrecio', 'tsMargen', 'tsDesc'];

function snapshot() {
  const c = {}; CAMPOS.forEach(k => c[k] = $(k).value);
  return { campos: c, uTr, demModo, iva, papelMon, microMon, margenCant: { ...margenCant }, mismaChapa: $('tsMismaChapa').checked, termSel: structuredClone(termSel) };
}
function restaurar(s) {
  if (!s) return;
  CAMPOS.forEach(k => { if (s.campos && s.campos[k] != null) $(k).value = s.campos[k]; });
  uTr = s.uTr || 'mm'; demModo = s.demModo || 'auto'; iva = s.iva ?? 21; papelMon = s.papelMon || 'USD'; microMon = s.microMon || 'ARS'; margenCant = { ...(s.margenCant || {}) }; pintarMargenes.clave = null;
  $('tsMismaChapa').checked = !!s.mismaChapa;
  // presupuestos guardados con la demasía vieja (por color o a mano)
  if (s.campos && s.campos.tsDemFrente == null) {
    const cf = parseInt(s.campos.tsColF) || 0, cd = parseInt(s.campos.tsColD) || 0;
    if (s.demModo === 'manual') { $('tsDemFrente').value = s.campos.tsDemManual || 0; $('tsDemDorso').value = 0; $('tsDemPct').value = 0; }
    else { const pc = num(s.campos.tsDemColor); $('tsDemFrente').value = Math.round(pc * cf); $('tsDemDorso').value = Math.round(pc * cd); }
  }
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
      ${/stamping/i.test(t.nombre) && s.on ? `<div class="ts-extra grid">
        <div><label>Cuño (precio por cuño)</label><div class="field"><input data-k="cuno" inputmode="decimal" value="${esc(s.cuno ?? '')}" placeholder="0"><button type="button" class="pr-cur" data-k="cunoMon" data-cur="${s.cunoMon || 'ARS'}">${s.cunoMon === 'USD' ? 'US$' : '$'}</button></div></div>
        <div><label>Foil (precio por pliego)</label><div class="field"><input data-k="foil" inputmode="decimal" value="${esc(s.foil ?? '')}" placeholder="0"><button type="button" class="pr-cur" data-k="foilMon" data-cur="${s.foilMon || 'ARS'}">${s.foilMon === 'USD' ? 'US$' : '$'}</button></div></div>
        <div class="full estado">Si es frente y dorso se cuentan dos cuños, y el foil va por cada pliego estampado.</div>
      </div>` : ''}
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
    $(id).innerHTML = `<thead><tr><th></th>${ESQ[tipo].map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>` +
      cat[tipo].map((row, i) => `<tr data-tipo="${tipo}" data-i="${i}"><td class="ts-drag" tabindex="0" title="Arrastrá para cambiar el orden (o usá las flechas ↑ ↓ del teclado)" aria-label="Mover">⠿</td>${ESQ[tipo].map(([k, , t]) => {
        if (Array.isArray(t)) return `<td><select data-k="${k}" class="ts-select ts-mini">${t.map(o => `<option value="${o}" ${row[k] === o ? 'selected' : ''}>${esc(ETIQ[o] || o)}</option>`).join('')}</select></td>`;
        if (t === 'b') return `<td><input type="checkbox" data-k="${k}" ${row[k] ? 'checked' : ''}></td>`;
        return `<td><input data-k="${k}" class="ts-cell${t === 'n' ? ' n' : ''}" value="${esc(t === 'n' ? String(row[k] ?? '').replace('.', ',') : row[k] ?? '')}"></td>`;
      }).join('')}<td><button type="button" class="btn small danger" data-del="1" title="Borrar">✕</button></td></tr>`).join('') + '</tbody>';
  }
  const campo = (grupo, k, label, full) => `<div class="${full ? 'full' : ''}"><label>${label}</label><input data-g="${grupo}" data-k="${k}" value="${esc(cat[grupo][k] ?? '')}" style="padding-right:12px"></div>`;
  $('tsImprenta').innerHTML = campo('imprenta', 'nombre', 'Nombre de la imprenta', true) + campo('imprenta', 'cuit', 'CUIT') + campo('imprenta', 'telefono', 'Teléfono')
    + campo('imprenta', 'email', 'Email') + campo('imprenta', 'direccion', 'Dirección') + campo('imprenta', 'validez', 'Validez (días)') + campo('imprenta', 'pago', 'Forma de pago')
    + campo('imprenta', 'notas', 'Observaciones fijas', true);
  $('tsDefaults').innerHTML = campo('defaults', 'demFrente', 'Demasía frente (pl.)') + campo('defaults', 'demDorso', 'Demasía dorso (pl.)') + campo('defaults', 'demPct', 'Demasía % del tiraje')
    + campo('defaults', 'margen', 'Ganancia %') + campo('defaults', 'iva', 'IVA %') + campo('defaults', 'pinza', 'Pinza mm');
}
// ---------- Ordenar filas del catálogo arrastrando (mouse y dedo) ----------
function moverFila(tipo, de, a) {
  const lista = cat[tipo];
  if (de === a || de < 0 || a < 0 || de >= lista.length || a >= lista.length) return;
  const [x] = lista.splice(de, 1); lista.splice(a, 0, x);
  pintarConfig(); catCambiado();
}
let arrastre = null;
const cfg = $('tsConfig');
cfg.addEventListener('pointerdown', e => {
  const h = e.target.closest('.ts-drag'); if (!h) return;
  e.preventDefault();
  const tr = h.closest('tr');
  arrastre = { tipo: tr.dataset.tipo, de: +tr.dataset.i, a: +tr.dataset.i, tr, tbody: tr.parentElement };
  tr.classList.add('arrastrando');
  h.setPointerCapture(e.pointerId);
});
cfg.addEventListener('pointermove', e => {
  if (!arrastre) return;
  const filas = [...arrastre.tbody.querySelectorAll('tr')];
  let a = filas.length - 1;
  for (let i = 0; i < filas.length; i++) {
    const r = filas[i].getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) { a = i; break; }
  }
  // la fila se ubica en el lugar de destino (antes de esa fila)
  if (a > arrastre.de) a = Math.max(arrastre.de, a - 1);
  arrastre.a = a;
  filas.forEach((f, i) => { f.classList.toggle('drop-antes', i === a && a < arrastre.de); f.classList.toggle('drop-despues', i === a && a > arrastre.de); });
  // si está cerca del borde de la pantalla, desplazar
  if (e.clientY < 60) window.scrollBy(0, -12); else if (e.clientY > innerHeight - 60) window.scrollBy(0, 12);
});
const soltar = () => {
  if (!arrastre) return;
  const { tipo, de, a, tr, tbody } = arrastre; arrastre = null;
  tr.classList.remove('arrastrando'); tbody.querySelectorAll('tr').forEach(f => f.classList.remove('drop-antes', 'drop-despues'));
  moverFila(tipo, de, a);
};
cfg.addEventListener('pointerup', soltar);
cfg.addEventListener('pointercancel', soltar);
cfg.addEventListener('keydown', e => {
  const h = e.target.closest('.ts-drag'); if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const tr = h.closest('tr'), tipo = tr.dataset.tipo, de = +tr.dataset.i, a = de + (e.key === 'ArrowUp' ? -1 : 1);
  moverFila(tipo, de, a);
  $('tsConfig').querySelector(`tr[data-tipo="${tipo}"][data-i="${a}"] .ts-drag`)?.focus();
});

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
  const terminaciones = cat.terminaciones.filter(t => termSel[t.id]?.on).map(t => {
    const s = termSel[t.id], hs = /stamping/i.test(t.nombre);
    return { ...t, lados: t.porLado ? (+s.lados || 1) : 1, cuno: hs ? num(s.cuno) : 0, foil: hs ? num(s.foil) : 0, cunoMon: s.cunoMon || 'ARS', foilMon: s.foilMon || 'ARS' };
  });
  const otros = [['Diseño / preimpresión', 'tsPreimp'], ['Pruebas de color', 'tsPruebas'], ['Flete', 'tsFlete'], ['Otros', 'tsOtro']]
    .map(([nombre, id]) => ({ nombre, precio: num($(id).value), moneda: 'ARS' })).filter(o => o.precio > 0);
  return {
    tw, th, autoPoses, poses, maquinaObj: maquina, corte,
    base: {
      poses, colF: Math.floor(num($('tsColF').value)), colD: Math.floor(num($('tsColD').value)), mismaChapa: $('tsMismaChapa').checked,
      papel: { nombre: `${$('tsPapelNombre').value.trim()} ${num($('tsGramaje').value) ? fmt(num($('tsGramaje').value), 0) + ' g' : ''}`.trim(), gramaje: num($('tsGramaje').value), precio: num($('tsPapelPrecio').value), unidad: $('tsPapelUnidad').value, moneda: papelMon },
      compra: { w: cw, h: ch }, corte: corte || 0, maq,
      maquina: maquina || {},
      demasia: { frente: num($('tsDemFrente').value), dorso: num($('tsDemDorso').value), pct: num($('tsDemPct').value) },
      terminaciones, otros,
      micro: { tipo: $('tsMicroTipo').value.trim(), formato: $('tsMicroFormato').value.trim(), precio: num($('tsMicroPrecio').value), planchas: num($('tsMicroPlanchas').value), moneda: microMon },
      cajas: { porCaja: num($('tsPorCaja').value), precio: num($('tsCajaPrecio').value), moneda: 'ARS' },
      margen: num($('tsMargen').value), descuento: num($('tsDesc').value), iva, dolar: dolar?.venta || 0,
    },
  };
}

// Un campo de ganancia por cada cantidad (solo si hay más de una)
function pintarMargenes(cants) {
  $('tsMargenesInfo').textContent = cants.length ? `Si dejás una vacía se usa ${$('tsMargen').value || 0} % (el valor por defecto de Configuración).` : 'Cargá las cantidades arriba y acá aparece una ganancia para cada una.';
  const clave = cants.join('|');
  if (pintarMargenes.clave !== clave) {   // rearmar solo si cambiaron las cantidades (así no se pierde el foco)
    pintarMargenes.clave = clave;
    $('tsMargenes').innerHTML = cants.map(c => `<div><label for="tsMg${c}">${fmt(c, 0)} ej.</label><div class="field"><input id="tsMg${c}" data-cant="${c}" inputmode="decimal" value="${esc(margenCant[c] ?? '')}"><span class="unit">%</span></div></div>`).join('');
  }
  $('tsMargenes').querySelectorAll('input').forEach(i => i.placeholder = $('tsMargen').value || '0');
}
function margenDe(cant) {
  const v = margenCant[cant];
  return v != null && String(v).trim() !== '' ? num(v) : num($('tsMargen').value);
}

function calcular() {
  document.querySelectorAll('#tsUTr button').forEach(b => b.setAttribute('aria-pressed', b.dataset.u === uTr));
  document.querySelectorAll('.tsUT').forEach(el => el.textContent = uTr);
  const conDorso = Math.floor(num($('tsColD').value)) > 0;
  $('tsDemDorsoBox').classList.toggle('calle-campo', true); $('tsDemDorsoBox').classList.toggle('off', !conDorso);
  $('tsDemDorso').disabled = !conDorso;
  document.querySelectorAll('#tsIva button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.iva === iva));
  $('tsPapelMon').dataset.cur = papelMon; $('tsPapelMon').textContent = papelMon === 'USD' ? 'US$' : '$';
  $('tsMicroMon').dataset.cur = microMon; $('tsMicroMon').textContent = microMon === 'USD' ? 'US$' : '$';
  $('tsMaqManual').hidden = $('tsCorte').value !== '0';
  $('tsTotalLabel').textContent = iva ? 'Total con IVA' : 'Total';
  $('tsDolarInfo').textContent = dolar?.venta ? `Dólar oficial (venta) para los precios en US$: ${pesos(dolar.venta)}` : 'Sin cotización del dólar: los precios en US$ no se pueden pasar a pesos.';

  const E = entrada(), b = E.base;
  $('tsPmTxt').textContent = b.maq ? `${fmt(b.maq.w, 1)} × ${fmt(b.maq.h, 1)} cm${!E.corte && b.compra.w ? ` · salen ${piezasPorCompra(b.compra.w, b.compra.h, 0, b.maq)} por pliego de compra` : ''}` : '—';
  $('tsPosesTxt').textContent = E.poses ? String(E.poses) + (num($('tsPoses').value) > 0 ? ' (a mano)' : '') : '—';
  $('tsPoses').placeholder = E.autoPoses ? String(E.autoPoses) : 'auto';

  const avisos = [];
  if (E.maquinaObj && b.maq && !entraEnMaquina(b.maq, E.maquinaObj)) avisos.push(`El pliego de máquina (${fmt(b.maq.w, 1)}×${fmt(b.maq.h, 1)}) no entra en la ${E.maquinaObj.nombre} (máx. ${E.maquinaObj.anchoMax}×${E.maquinaObj.altoMax}). Cortá el pliego en más partes o elegí otra máquina.`);
  if (E.maquinaObj && E.maquinaObj.colores && Math.max(b.colF, b.colD) > E.maquinaObj.colores) avisos.push(`La máquina es de ${E.maquinaObj.colores} color${E.maquinaObj.colores > 1 ? 'es' : ''}: se va a necesitar más de una pasada por lado.`);
  if (num($('tsPoses').value) > 0 && E.autoPoses > 0 && E.poses > E.autoPoses) avisos.push(`Cargaste ${E.poses} poses, pero con estas medidas entran como máximo ${E.autoPoses}.`);
  const cants = cantidades();
  if (!cants.length) avisos.push('Cargá la cantidad (podés poner varias separadas por coma).');
  if (!E.poses) avisos.push(E.tw && b.maq ? 'El trabajo no entra en el pliego de máquina con esa pinza. Revisá medidas o cargá las poses a mano.' : 'Cargá el corte a corte y el pliego de compra para calcular las poses.');

  pintarMargenes(cants);
  const res = cants.map(cant => presupuestar({ ...b, cant, margen: margenDe(cant) }));
  if (res.some(r => r.faltas?.dolar)) avisos.push('Hay precios en dólares y no hay cotización: esos ítems quedaron en 0.');
  if (verCant >= res.length) verCant = 0;
  $('tsMicroPlanchas').placeholder = res[verCant]?.ok ? String(res[verCant].pm) : 'auto';
  ultimo = { E, cants, res };

  const chipsHtml = res.length > 1 ? res.map((r, i) => `<button type="button" class="chip" data-i="${i}" aria-pressed="${i === verCant}">${fmt(r.cant, 0)} ej.</button>`).join('') : '';
  if ($('tsCantChips').innerHTML !== chipsHtml) $('tsCantChips').innerHTML = chipsHtml;
  const r = res[verCant];
  const set = (id, v) => $(id).textContent = v;
  if (r && r.ok) {
    set('tsTotal', pesos(r.total)); set('tsCosto', pesos(r.costo)); set('tsGan', `${pesos(r.ganancia)} (${fmt(r.margen, 1)} %)`);
    set('tsDescV', r.descuento ? `− ${pesos(r.descuento)}` : '—'); set('tsSub', pesos(r.subtotal)); set('tsIvaV', iva ? `${pesos(r.iva)} (${fmt(iva, 1)} %)` : '—');
    set('tsUnit', pesos(r.unitario)); set('tsUnitIva', pesos(r.unitarioIva));
    set('tsPliegos', `${fmt(r.pm, 0)} / ${fmt(r.pc, 0)}  (demasía ${fmt(r.dem, 0)})`);
    $('tsDemInfo').textContent = `Demasía total: ${[r.demF && `frente ${fmt(r.demF, 0)}`, r.demD && `dorso ${fmt(r.demD, 0)}`, r.demP && `${fmt(b.demasia.pct, 1)} % del tiraje ${fmt(r.demP, 0)}`].filter(Boolean).join(' + ') || '0'} = ${fmt(r.dem, 0)} pliegos.`; set('tsKilos', r.kilos ? fmt(r.kilos, 2) + ' kg' : '—');
    let grupo = '';
    $('tsDetalle').innerHTML = '<thead><tr><th>Ítem</th><th>Cálculo</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>' + r.lineas.map(l => {
      const g = l.grupo !== grupo ? (grupo = l.grupo, `<tr><td colspan="3" class="ts-grupo">${esc(l.grupo)}</td></tr>`) : '';
      return g + `<tr><td>${esc(l.nombre)}</td><td class="f">${esc(l.detalle)}</td><td class="h">${pesos(l.sub)}</td></tr>`;
    }).join('') + `<tr><td><b>Costo total</b></td><td></td><td class="h"><b>${pesos(r.costo)}</b></td></tr></tbody>`;
  } else {
    ['tsTotal', 'tsCosto', 'tsGan', 'tsDescV', 'tsSub', 'tsIvaV', 'tsUnit', 'tsUnitIva', 'tsPliegos', 'tsKilos'].forEach(id => set(id, '—'));
    $('tsDetalle').innerHTML = '';
  }
  $('tsComparar').innerHTML = res.length > 1 && res[0].ok ? '<thead><tr><th>Cantidad</th><th style="text-align:right">Ganancia</th><th style="text-align:right">Total' + (iva ? ' c/IVA' : '') + '</th><th style="text-align:right">Unitario s/IVA</th></tr></thead><tbody>'
    + res.map(x => `<tr><td>${fmt(x.cant, 0)} ej.</td><td class="h">${fmt(x.margen, 1)} %</td><td class="h">${pesos(x.total)}</td><td class="h">${pesos(x.unitario)}</td></tr>`).join('') + '</tbody>' : '';
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
    <p><b>Cliente:</b> ${esc($('tsCliente').value) || '—'}${(() => { const c = clienteActual(); const d = c && [c.cuit && 'CUIT ' + c.cuit, c.iva, [c.direccion, c.localidad].filter(Boolean).join(', ')].filter(Boolean).join(' · '); return d ? `<br><span class="ts-doc-sub">${esc(d)}</span>` : ''; })()}<br><b>Trabajo:</b> ${esc($('tsTrabajo').value) || '—'}</p>
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
    ['Pliego de máquina', `${fmt(b.maq.w, 1)} × ${fmt(b.maq.h, 1)} cm${E.corte ? ` (${E.corte === 1 ? 'entero' : 'pliego de compra en ' + E.corte})` : r && r.piezas ? ` (salen ${r.piezas} por pliego de compra)` : ''}`],
    ['Poses por pliego', String(E.poses) + (a && E.poses > a.maximo ? ` (ojo: con estas medidas entran como máximo ${a.maximo}; el dibujo muestra ${a.maximo})` : '')],
    ['Pinza / calle', `${fmt(pinza, 0)} mm / ${calle ? fmt(calle, 1) + ' mm' : 'sin calle'}`],
    ['Impresión', `${b.colF}/${b.colD}`],
    r && r.ok && ['Cantidad', `${fmt(r.cant, 0)} ej. → ${fmt(r.netos, 0)} pl. + ${fmt(r.dem, 0)} demasía = ${fmt(r.pm, 0)} pl. de máquina${b.compra.w ? ` = ${fmt(r.pc, 0)} pl. de compra` : ''}`],
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
function msg(t, ms = 4000) { $('tsMsg').textContent = t; clearTimeout(msg.t); msg.t = setTimeout(() => $('tsMsg').textContent = '', Math.max(ms, t.length > 60 ? 9000 : 0)); }

// ---------- Eventos del formulario ----------
sec.addEventListener('input', e => {
  if (e.target.dataset.cant) { margenCant[e.target.dataset.cant] = e.target.value; calcular(); return; }
  if (e.target.closest('#tsConfig')) return; if (e.target.id === 'tsCantidades') verCant = 0; calcular(); });
// 'change' solo para listas y casillas (los campos de texto ya recalculan con 'input')
sec.addEventListener('change', e => { if (e.target.closest('#tsConfig') || e.target.closest('#tsTerms')) return; if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'date') calcular(); });
$('tsUTr').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.dataset.u === uTr) return;
  const f = b.dataset.u === 'cm' ? 0.1 : 10;
  ['tsTw', 'tsTh'].forEach(id => { const v = num($(id).value); if (v > 0) $(id).value = fmt(v * f, 2).replace(/\./g, '').replace(/,00$/, ''); });
  uTr = b.dataset.u; calcular();
});
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
  if (e.target.dataset.k === 'on') { s.on = e.target.checked; row.classList.toggle('on', s.on); if (/stamping/i.test(row.textContent)) pintarTerminaciones(); }
  if (e.target.dataset.k === 'lados') s.lados = +e.target.value;
  calcular();
});
// Hot stamping: precio del cuño y del foil
$('tsTerms').addEventListener('input', e => {
  const k = e.target.dataset.k; if (k !== 'cuno' && k !== 'foil') return;
  const s = termSel[e.target.closest('.ts-term').dataset.id]; if (s) s[k] = e.target.value;
  calcular();
});
$('tsTerms').addEventListener('click', e => {
  const b = e.target.closest('.pr-cur[data-k]'); if (!b) return;
  const s = termSel[b.closest('.ts-term').dataset.id]; if (!s) return;
  s[b.dataset.k] = s[b.dataset.k] === 'USD' ? 'ARS' : 'USD';
  b.dataset.cur = s[b.dataset.k]; b.textContent = s[b.dataset.k] === 'USD' ? 'US$' : '$';
  calcular();
});
function aplicarDefaults(todo) {
  const d = cat.defaults;
  if (todo || $('tsDemFrente').value === '') $('tsDemFrente').value = d.demFrente ?? 100;
  if (todo || $('tsDemDorso').value === '') $('tsDemDorso').value = d.demDorso ?? 100;
  if (todo || $('tsDemPct').value === '') $('tsDemPct').value = String(d.demPct).replace('.', ',');
  if (todo || $('tsMargen').value === '') $('tsMargen').value = String(d.margen).replace('.', ',');
  if (todo) { $('tsPinza').value = d.pinza; iva = d.iva; }
}
function nuevoPresupuesto(aviso = 'Presupuesto nuevo.') {
  ['tsCliente', 'tsTrabajo', 'tsCantidades', 'tsTw', 'tsTh', 'tsPoses', 'tsMicroTipo', 'tsMicroFormato', 'tsMicroPrecio', 'tsMicroPlanchas', 'tsPreimp', 'tsPruebas', 'tsFlete', 'tsOtro', 'tsPorCaja', 'tsCajaPrecio', 'tsNumero'].forEach(id => $(id).value = '');
  $('tsFecha').value = fechaAuto = hoy(); $('tsDesc').value = '0'; abierto = null; aplicarDefaults(true); margenCant = {}; pintarMargenes.clave = null;
  for (const k in termSel) delete termSel[k]; pintarTerminaciones();
  $('tsClienteWrap').hidden = true; $('tsCorteWrap').hidden = true; $('tsGuardar').textContent = 'Guardar presupuesto';
  calcular(); pintarLista(); pintarCliente(); $('tsClienteSel').value = ''; msg(aviso);
}
$('tsNuevo').addEventListener('click', () => nuevoPresupuesto());

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
    clienteId: clienteActual()?.id || null, clienteDatos: datosCliente(clienteActual()),
    resumen, papel: E.base.papel.nombre, compra: `${fmt(E.base.compra.w, 0)}×${fmt(E.base.compra.h, 0)}`,
    snapshot: snapshot(), actualizado: FB.fb.serverTimestamp(),
  };
  if (abierto) {
    FB.fb.updateDoc(FB.fb.doc(col(), abierto), datos).catch(e => msg('Error: ' + e.code));
    nuevoPresupuesto(`Cambios guardados en el presupuesto N° ${$('tsNumero').value}. Ya podés armar uno nuevo.`);
  } else {
    const numero = lista.reduce((m, x) => Math.max(m, x.numero || 0), 0) + 1;
    const ref = FB.fb.doc(col()); abierto = ref.id; $('tsNumero').value = numero;
    datos.snapshot.campos.tsNumero = String(numero);
    FB.fb.setDoc(ref, { ...datos, numero, estado: 'Pendiente', creado: FB.fb.serverTimestamp() }).catch(e => msg('Error: ' + e.code));
    nuevoPresupuesto(`Guardado como presupuesto N° ${numero}. Ya podés armar uno nuevo (para verlo o exportarlo, abrilo desde la lista).`);
  }
});
function abrirGuardado(r) {
  restaurar(r.snapshot); $('tsNumero').value = r.numero || ''; abierto = r.id; verCant = 0;
  $('tsGuardar').textContent = 'Guardar cambios'; calcular(); pintarCliente(); $('tsClienteSel').value = clienteActual()?.id || ''; pintarLista();
  sec.scrollIntoView({ behavior: 'smooth' }); msg(`Presupuesto N° ${r.numero} abierto.`);
}
function pintarLista() {
  const q = $('tsBuscar').value.trim().toLowerCase(), fe = $('tsFiltro').value;
  const l = lista.filter(r => (!fe || r.estado === fe) && (!q || [r.cliente, r.trabajo, r.numero].join(' ').toLowerCase().includes(q)));
  llenarClientes();
  if (!l.length) { $('tsLista').innerHTML = `<div class="pl-vacio">${lista.length ? 'No hay presupuestos que coincidan.' : 'Todavía no guardaste presupuestos. Armá uno arriba y tocá "Guardar presupuesto".'}</div>`; return; }
  $('tsLista').innerHTML = window.Paginas.html('pres', l, r => {
    const p = r.resumen?.[0];
    return `<div class="pl-item ts-item${abierto === r.id ? ' editando' : ''}" data-id="${r.id}">
      <div class="ts-item-head">
        <div class="t">N° ${esc(r.numero)} · ${esc(r.cliente || 'Sin cliente')}<span class="d"> · ${esc(fechaTxt(r.fecha))}${r.trabajo ? ' · ' + esc(r.trabajo) : ''}</span></div>
      </div>
      <div class="ts-cants">${(r.resumen || []).map(x => `<span class="ts-cant"><span>${fmt(x.cant, 0)} ej.</span> <b>${pesos(x.total)}</b> <small>(${pesos(x.unitario)} c/u)</small></span>`).join('') || '<span class="ts-cant">—</span>'}</div>
      <select data-acc="estado" aria-label="Estado" class="ts-select ts-mini ts-estado ts-estado-sel ${String(r.estado || '').toLowerCase()}">${['Pendiente', 'Aprobado', 'Rechazado'].map(e => `<option ${r.estado === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
      ${pidiendo === r.id
        ? `<div class="acc ts-confirma"><span class="estado">Pedir papel para:</span>${(r.resumen || []).map((x, i) => `<button type="button" class="btn small" data-acc="pedido-cant" data-i="${i}">${fmt(x.cant, 0)} ej.</button>`).join('')}<button type="button" class="btn small" data-acc="no">Cancelar</button></div>`
        : borrando === r.id
        ? `<div class="acc ts-confirma"><span class="estado">¿Borrar el N° ${esc(r.numero)}?</span><button type="button" class="btn small danger" data-acc="si">Sí, borrar</button><button type="button" class="btn small" data-acc="no">No</button></div>`
        : `<div class="acc ts-acc"><button type="button" class="btn small" data-acc="abrir">Abrir</button>${r.estado === 'Aprobado' ? '<button type="button" class="btn small" data-acc="pedido">Pedir papel</button>' : ''}<button type="button" class="btn small" data-acc="borrar">Borrar</button></div>`}
    </div>`;
  }, pintarLista);
}
$('tsBuscar').addEventListener('input', () => { window.Paginas.reset('pres'); pintarLista(); });
$('tsFiltro').addEventListener('change', () => { window.Paginas.reset('pres'); pintarLista(); });
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
  else if (a === 'no') { borrando = null; pidiendo = null; }
  else if (a === 'si') { borrando = null; if (abierto === id) abierto = null; FB.fb.deleteDoc(FB.fb.doc(col(), id)); msg('Presupuesto borrado.'); }
  else if (a === 'abrir') { abrirGuardado(r); }
  else if (a === 'pedido' || a === 'pedido-cant') {
    // se recalcula desde lo guardado (así los presupuestos viejos también piden bien el papel)
    let res = [];
    try { res = calcularDesdeSnapshot(r.snapshot).res.filter(x => x.ok); } catch (err) {}
    if (!res.length) res = (r.resumen || []).map(x => ({ ...x, ok: true }));
    if (res.length > 1 && a === 'pedido') { pidiendo = id; pintarLista(); return; }
    const p = res[a === 'pedido-cant' ? +b.dataset.i : 0]; if (!p) return;
    pidiendo = null;
    window.pedidoPendiente = { formato: r.compra, material: r.papel, pliegos: p.pc, kilos: Math.round(p.kilos * 100) / 100, trabajo: [r.trabajo, r.cliente, fmt(p.cant, 0) + ' ej.'].filter(Boolean).join(' · ') };
    document.querySelector('[data-tool=planilla]').click();
    window.dispatchEvent(new Event('pedido-pendiente'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  pintarLista();
});

// ---------- Inicio ----------
try { const c = JSON.parse(localStorage.getItem('test-catalogo') || 'null'); if (c) { cat = actualizarCatalogo({ ...structuredClone(CATALOGO_INICIAL), ...c }, c.version); if ((c.version || 1) < VERSION_CATALOGO) localStorage.setItem('test-catalogo', JSON.stringify(cat)); } } catch (e) {}
pintarConfig(); llenarSelects();
let local = null; try { local = JSON.parse(localStorage.getItem('test-v1') || 'null'); } catch (e) {}
if (local) restaurar(local); else { pintarTerminaciones(); $('tsPapelSel').value = 'p1'; $('tsPapelSel').dispatchEvent(new Event('change')); $('tsCorte').value = '2'; }
// La fecha de un presupuesto nuevo es siempre la de hoy (el borrador guardado puede ser de otro día)
$('tsFecha').value = hoy();
let fechaAuto = hoy();
function refrescarFecha() {
  if (abierto) return;                                   // editando uno guardado: respetar su fecha
  if ($('tsFecha').value === fechaAuto && fechaAuto !== hoy()) { $('tsFecha').value = fechaAuto = hoy(); calcular(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescarFecha(); });
window.addEventListener('focus', refrescarFecha);
aplicarDefaults(false);
calcular();
traerDolar();
window.addEventListener('dolar-actualizado', e => { const o = e.detail?.oficial; if (o) { dolar = { ...o, chequeado: e.detail.chequeado }; calcular(); } });
document.querySelector('[data-tool=presupuesto]').addEventListener('click', () => { refrescarFecha(); calcular(); });

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
  if (!fbInfo.listo) return;   // esperar a que Google confirme la sesión
  FB = fbInfo; usuario = fbInfo.user;
  $('tsRegAvisoTxt').innerHTML = '<b>Ingresá con Google</b> para guardar presupuestos y tu catálogo de precios.';
  if (dejarPedidos) { dejarPedidos(); dejarPedidos = null; }
  pedidos = []; llenarPedidos();
  if (dejarClientes) { dejarClientes(); dejarClientes = null; }
  clientes = []; llenarClientes();
  if (usuario) dejarClientes = FB.fb.onSnapshot(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'clientes'), snap => {
    clientes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => sinTc(a.nombre).localeCompare(sinTc(b.nombre)));
    llenarClientes();
  }, () => {});
  if (usuario) dejarPedidos = FB.fb.onSnapshot(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'planilla'), snap => {
    pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const prev = $('tsPedidoSel').value; llenarPedidos(); if (pedidos.some(p => p.id === prev)) $('tsPedidoSel').value = prev;
  }, () => {});
  if (dejarLista) { dejarLista(); dejarLista = null; }
  if (dejarViejos) { dejarViejos(); dejarViejos = null; }
  viejos = []; pintarViejos();
  lista = []; abierto = null; borrando = null;
  $('tsRegAviso').hidden = !!usuario; $('tsRegApp').hidden = !usuario;
  if (!usuario) { $('tsGuardar').textContent = 'Guardar presupuesto'; return; }
  $('tsLista').innerHTML = '<div class="pl-vacio">Cargando…</div>';
  // catálogo de la cuenta
  FB.fb.getDoc(FB.fb.doc(FB.db, 'usuarios', usuario.uid, 'config', 'test')).then(d => {
    if (d.exists() && d.data().catalogo) { const v0 = d.data().catalogo.version || 1; cat = actualizarCatalogo({ ...structuredClone(CATALOGO_INICIAL), ...d.data().catalogo }, v0); pintarConfig(); llenarSelects(); pintarTerminaciones(); calcular(); $('tsConfigInfo').textContent = 'Catálogo cargado de tu cuenta.'; if (v0 < VERSION_CATALOGO) catCambiado(); }
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

// ---------- Cliente de la agenda ----------
const sinTc = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function clienteActual() { const n = sinTc($('tsCliente').value); return n ? clientes.find(c => sinTc(c.nombre) === n) || null : null; }
function datosCliente(c) { return c ? ['cuit', 'iva', 'contacto', 'telefono', 'email', 'direccion', 'localidad'].reduce((o, k) => (c[k] ? { ...o, [k]: c[k] } : o), {}) : null; }
function pintarCliente() {
  const c = clienteActual(), nombre = $('tsCliente').value.trim();
  $('tsClienteInfo').textContent = c ? [c.cuit && 'CUIT ' + c.cuit, c.iva, [c.direccion, c.localidad].filter(Boolean).join(', '), c.telefono].filter(Boolean).join(' · ') || 'Cliente de tu agenda (sin datos cargados).'
    : nombre && usuario ? 'No está en tu agenda de Clientes.' : '';
  $('tsClienteAgendar').hidden = !(nombre && !c && usuario);
}
function llenarSelectClientes() {
  const sel = $('tsClienteSel');
  if (!usuario) { sel.innerHTML = '<option value="">— Ingresá con Google para ver tus clientes —</option>'; return; }
  sel.innerHTML = `<option value="">${clientes.length ? '— Elegí un cliente —' : '— Todavía no cargaste clientes (pestaña Clientes) —'}</option>`
    + clientes.map(c => `<option value="${c.id}">${esc(c.nombre)}${c.cuit ? ' · ' + esc(c.cuit) : ''}${c.localidad ? ' · ' + esc(c.localidad) : ''}</option>`).join('');
  sel.value = clienteActual()?.id || '';
}
function llenarClientes() {
  llenarSelectClientes();
  const viejos = [...new Set(lista.map(r => r.cliente).filter(Boolean))].filter(n => !clientes.some(c => sinTc(c.nombre) === sinTc(n)));
  $('tsClientes').innerHTML = clientes.map(c => `<option value="${esc(c.nombre)}">${esc([c.cuit, c.localidad].filter(Boolean).join(' · '))}</option>`).join('')
    + viejos.sort().map(n => `<option value="${esc(n)}"></option>`).join('');
  pintarCliente();
}
$('tsCliente').addEventListener('input', () => { pintarCliente(); $('tsClienteSel').value = clienteActual()?.id || ''; });
$('tsClienteSel').addEventListener('change', () => {
  const c = clientes.find(x => x.id === $('tsClienteSel').value);
  if (c) { $('tsCliente').value = c.nombre; pintarCliente(); calcular(); }
});
$('tsClienteAgendar').addEventListener('click', () => {
  const nombre = $('tsCliente').value.trim(); if (!nombre || !usuario || !FB) return;
  FB.fb.addDoc(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'clientes'), { nombre, creado: FB.fb.serverTimestamp() })
    .then(() => msg(`"${nombre}" se agregó a Clientes. Completá sus datos en esa pestaña.`)).catch(e => msg('Error: ' + e.code));
});

// ---------- Traer el papel desde la Planilla de pedidos ----------
const sinT = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function llenarPedidos() {
  const sel = $('tsPedidoSel');
  if (!usuario) { sel.innerHTML = '<option value="">— Ingresá con Google para ver tus pedidos —</option>'; return; }
  sel.innerHTML = `<option value="">${pedidos.length ? '— Elegí un pedido de la planilla —' : '— No hay pedidos en la planilla —'}</option>` + pedidos.map(p =>
    `<option value="${p.id}">${fechaTxt(p.fecha)} · ${esc(p.proveedor || '')} · ${esc(p.material || '')}${p.formato ? ' · ' + esc(p.formato) : ''}${p.trabajo ? ' · ' + esc(p.trabajo) : ''}</option>`).join('');
}
$('tsPedidoSel').addEventListener('change', () => {
  const p = pedidos.find(x => x.id === $('tsPedidoSel').value);
  if (!p) { $('tsPedidoInfo').textContent = ''; return; }
  // Material: "Ilustración 150 g" → tipo + gramaje
  const g = String(p.material || '').match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramos)\b/i);
  const tipo = String(p.material || '').replace(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramos)\b.*$/i, '').trim();
  if (tipo) $('tsPapelNombre').value = tipo;
  if (g) $('tsGramaje').value = g[1];
  // Formato: "72×102" (cm, o mm si es grande)
  const f = String(p.formato || '').match(/(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)/);
  if (f) {
    let a = num(f[1]), b = num(f[2]);
    if (Math.max(a, b) > 200) { a /= 10; b /= 10; }
    $('tsCw').value = String(a).replace('.', ','); $('tsCh').value = String(b).replace('.', ',');
  }
  // Si el mismo papel está en el catálogo, se toma su precio
  const enCat = cat.papeles.find(x => sinT(x.nombre) === sinT(tipo) && (!g || num(x.gramaje) === num(g[1])));
  if (enCat) {
    $('tsPapelSel').value = enCat.id;
    $('tsPapelPrecio').value = String(enCat.precio).replace('.', ','); $('tsPapelUnidad').value = enCat.unidad; papelMon = enCat.moneda;
  } else $('tsPapelSel').value = '';
  $('tsPedidoInfo').textContent = `Papel cargado del pedido a ${p.proveedor || 'proveedor'}${enCat ? ', con el precio del catálogo' : '. Ese papel no está en tu catálogo: cargá el precio'}.`;
  calcular();
});

// ---------- Para otras pestañas (Comparar → orden de trabajo) ----------
// Recalcula un presupuesto guardado a partir de su snapshot, sin tocar lo que hay en pantalla.
export function calcularDesdeSnapshot(snap) {
  const prev = snapshot(), prevNum = $('tsNumero').value;
  try {
    restaurar(snap);
    const E = entrada();
    const res = cantidades().map(cant => presupuestar({ ...E.base, cant, margen: margenDe(cant) }));
    return { E, res, calle: num($('tsCalle').value), pinza: num($('tsPinza').value), imprenta: { ...cat.imprenta } };
  } finally {
    restaurar(prev); $('tsNumero').value = prevNum; calcular();
  }
}
export { svgCompra, svgMaquina };

// Desde la pestaña Clientes
export function abrirPresupuesto(id) {
  const r = lista.find(x => x.id === id); if (!r) return false;
  document.querySelector('[data-tool=presupuesto]').click();
  abrirGuardado(r);
  return true;
}
export function presupuestoParaCliente(nombre) {
  document.querySelector('[data-tool=presupuesto]').click();
  nuevoPresupuesto(`Presupuesto nuevo para ${nombre}.`);
  $('tsCliente').value = nombre; pintarCliente(); $('tsClienteSel').value = clienteActual()?.id || ''; calcular();
  sec.scrollIntoView({ behavior: 'smooth' });
}
