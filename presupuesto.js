// Pestaña "Presupuesto". Usa el motor de presupuesto-calculo.js.
// Guarda en Firebase: usuarios/{uid}/config/test (catálogo) y usuarios/{uid}/presupuestosTest (presupuestos).
// (Los nombres "test" quedaron de cuando era la pestaña de prueba; se mantienen para no perder lo ya guardado.)
// Los presupuestos de la versión anterior siguen en usuarios/{uid}/presupuestos y se muestran aparte, solo lectura.
import { presupuestar, presupuestarRevista, resumenFormas, pliegoMaquina, entraEnMaquina, piezasPorCompra, UNIDADES, fmt } from './presupuesto-calculo.js';

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
    { id: 't14', nombre: 'Polietileno', unidad: 'm2', precio: 450, postura: 0, moneda: 'ARS', porLado: true },
    { id: 't4', nombre: 'Laca UV', unidad: 'pliego', precio: 60, postura: 10000, moneda: 'ARS', porLado: true },
    { id: 't11', nombre: 'UV sectorizado', unidad: 'pliego', precio: 90, postura: 25000, moneda: 'ARS', porLado: true },
    { id: 't5', nombre: 'Troquelado', unidad: 'millarPl', precio: 15000, postura: 30000, moneda: 'ARS', porLado: false },
    { id: 't6', nombre: 'Doblado díptico', unidad: 'millarEj', precio: 9000, postura: 12000, moneda: 'ARS', porLado: false },
    { id: 't7', nombre: 'Doblado tríptico', unidad: 'millarEj', precio: 12000, postura: 15000, moneda: 'ARS', porLado: false },
    { id: 't8', nombre: 'Encuadernación binder', unidad: 'millarEj', precio: 60000, postura: 40000, moneda: 'ARS', porLado: false },
    { id: 't15', nombre: 'Abrochado a caballete', unidad: 'millarEj', precio: 20000, postura: 10000, moneda: 'ARS', porLado: false },
    { id: 't16', nombre: 'Plegado de pliegos', unidad: 'millarPl', precio: 8000, postura: 8000, moneda: 'ARS', porLado: false },
    { id: 't9', nombre: 'Corte final guillotina', unidad: 'fijo', precio: 15000, postura: 0, moneda: 'ARS', porLado: false },
    { id: 't10', nombre: 'Pegado', unidad: 'millarEj', precio: 10000, postura: 15000, moneda: 'ARS', porLado: false },
    { id: 't12', nombre: 'Hot melt de dorso', unidad: 'millarEj', precio: 70000, postura: 40000, moneda: 'ARS', porLado: false },
    { id: 't13', nombre: 'Hot stamping', unidad: 'pliego', precio: 120, postura: 45000, moneda: 'ARS', porLado: true },
  ],
};
let cat = structuredClone(CATALOGO_INICIAL);
// Catálogos guardados antes de que existieran algunas terminaciones: se les agregan una sola vez
const NUEVAS_TERMINACIONES = { 2: ['t10'], 3: ['t11', 't12'], 4: ['t13'], 5: ['t14'], 6: ['t15', 't16'] };   // versión → ids agregados
const RENOMBRES = { 3: [['t4', 'UV sectorizado', 'Laca UV']] };     // versión → [id, nombre viejo, nombre nuevo]
const VERSION_CATALOGO = 6;
function actualizarCatalogo(c, versionGuardada) {
  const v = versionGuardada || 1;
  for (let n = v + 1; n <= VERSION_CATALOGO; n++) for (const [id, viejo, nuevo] of RENOMBRES[n] || []) {
    const t = c.terminaciones.find(x => x.id === id && x.nombre.toLowerCase() === viejo.toLowerCase());
    if (t) t.nombre = nuevo;   // conserva los precios que ya tenía
  }
  for (let n = v + 1; n <= VERSION_CATALOGO; n++) for (const id of NUEVAS_TERMINACIONES[n] || []) {
    const t = CATALOGO_INICIAL.terminaciones.find(x => x.id === id);
    if (!t || c.terminaciones.some(x => x.id === id || x.nombre.toLowerCase() === t.nombre.toLowerCase())) continue;
    // va debajo de la que la precede en el catálogo de ejemplo (si el usuario la tiene); si no, al final
    const ini = CATALOGO_INICIAL.terminaciones, antes = ini[ini.indexOf(t) - 1];
    const pos = antes ? c.terminaciones.findIndex(x => x.id === antes.id) : -1;
    if (pos >= 0) c.terminaciones.splice(pos + 1, 0, structuredClone(t)); else c.terminaciones.push(structuredClone(t));
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
// Presupuesto cerrado (Aprobado/Rechazado): si cambia el gramaje, el precio se sigue calculando con el original
let gramajeCalc = null, tapaGramajeCalc = null;
const cerrado = r => !!r && (r.estado || 'Pendiente') !== 'Pendiente';
let abiertoCerrado = false;
let pedidos = [], dejarPedidos = null;   // pedidos de la Planilla (para sincronizar el gramaje)
let pidiendo = null;
let clientes = [], dejarClientes = null;   // agenda de la pestaña Clientes                     // presupuesto que está eligiendo cantidad para el pedido de papel
let ultimo = null;   // { entrada, resultados[] }

// ---------- Estructura ----------
const sec = $('presupuesto');
sec.innerHTML = `
  <div class="ts-top"><span class="ts-top-estado" id="tsTopEstado">Presupuesto nuevo</span><div class="ts-top-acc"><button type="button" class="btn small" id="tsIrGuardados">Ir a presupuestos ↓</button><button type="button" class="btn small primary" id="tsNuevoArriba">+ Nuevo presupuesto</button></div></div>
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
    <div class="full"><label>Tipo de trabajo</label><div class="mode" role="group" id="tsTipo"><button type="button" data-t="comun" aria-pressed="true">Común</button><button type="button" data-t="revista" aria-pressed="false">Revista</button></div></div>
    <div><label for="tsTw" id="tsTwLbl">Corte a corte ancho</label><div class="field"><input id="tsTw" inputmode="decimal" placeholder="210"><span class="unit tsUT">mm</span></div></div>
    <div><label for="tsTh" id="tsThLbl">Corte a corte alto</label><div class="field"><input id="tsTh" inputmode="decimal" placeholder="297"><span class="unit tsUT">mm</span></div></div>
    <div class="full"><div class="mode" role="group" id="tsUTr"><button type="button" data-u="cm" aria-pressed="false">Centímetros</button><button type="button" data-u="mm" aria-pressed="true">Milímetros</button></div></div>
    <div><label for="tsCalle">Calle entre poses</label><div class="field"><input id="tsCalle" inputmode="decimal" value="0"><span class="unit">mm</span></div></div>
    <div><label for="tsPinza">Pinza</label><div class="field"><input id="tsPinza" inputmode="decimal" value="10"><span class="unit">mm</span></div></div>
    <div class="full" data-solo="comun"><label for="tsPoses">Poses por pliego de máquina</label><div class="field"><input id="tsPoses" inputmode="numeric" placeholder="auto"><span class="unit">poses</span></div></div>
    <div data-solo="revista"><label for="tsPaginas">Páginas del interior</label><div class="field"><input id="tsPaginas" inputmode="numeric" placeholder="32"><span class="unit">págs.</span></div></div>
    <div data-solo="revista"><label for="tsPagsCara">Páginas por cara del pliego</label><div class="field"><input id="tsPagsCara" inputmode="numeric" placeholder="auto"><span class="unit">págs.</span></div></div>
    <label class="full ts-check" data-solo="revista"><input type="checkbox" id="tsTapaOn" checked> La tapa va aparte, con su propio papel (se carga más abajo)</label>
    <div class="full estado" data-solo="revista">Si la tapa no va aparte, sumá sus 4 páginas a las del interior. Para abrochar a caballete las páginas van de a 4.</div>
  </div>

  <h2 class="sec" id="tsPapelTit">Papel</h2>
  <div class="grid">
    <div class="full"><label for="tsPapelSel">Papel del catálogo</label><select id="tsPapelSel" class="ts-select"></select></div>
    <div><label for="tsPapelNombre">Tipo</label><input id="tsPapelNombre" placeholder="Ilustración" style="padding-right:12px"></div>
    <div><label for="tsGramaje">Gramaje</label><div class="field"><input id="tsGramaje" inputmode="decimal"><span class="unit">g/m²</span></div></div>
    <div class="full ts-gnota" id="tsGramajeNota" hidden></div>
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
      <div><small id="tsPosesLbl">Poses</small><b id="tsPosesTxt">—</b></div>
    </div>
    <div class="full estado" data-solo="revista" id="tsArmadoInfo"></div>
  </div>

  <h2 class="sec" id="tsImpTit">Impresión</h2>
  <div class="grid">
    <div class="full"><label for="tsMaquina">Máquina</label><select id="tsMaquina" class="ts-select"></select></div>
    <div class="full ts-congelado" id="tsCongelado" hidden><span>Este presupuesto usa los precios con los que se guardó (máquina y terminaciones), que son distintos a los del catálogo.</span> <button type="button" class="btn small" id="tsUsarCatalogo">Usar los precios actuales</button></div>
    <div><label for="tsColF">Colores frente</label><div class="field"><input id="tsColF" type="number" min="0" step="1" value="4"><span class="unit">col.</span></div></div>
    <div><label for="tsColD">Colores dorso</label><div class="field"><input id="tsColD" type="number" min="0" step="1" value="0"><span class="unit">col.</span></div></div>
    <div class="full chips" id="tsColChips">
      <button type="button" class="chip" data-c="4/0">4/0</button><button type="button" class="chip" data-c="4/4">4/4</button>
      <button type="button" class="chip" data-c="4/1">4/1</button><button type="button" class="chip" data-c="1/0">1/0</button>
      <button type="button" class="chip" data-c="1/1">1/1</button><button type="button" class="chip" data-c="2/0">2/0</button>
    </div>
    <label class="full ts-check"><input type="checkbox" id="tsMismaChapa"> <span id="tsMismaChapaLbl">El dorso usa las mismas chapas (tira y retira)</span></label>
    <div class="full"><label>Demasía</label>
      <span class="estado">Pliegos de más para todo el trabajo, por lado (no por color).</span></div>
    <div><label for="tsDemFrente">Frente</label><div class="field"><input id="tsDemFrente" inputmode="numeric"><span class="unit">pl.</span></div></div>
    <div id="tsDemDorsoBox"><label for="tsDemDorso">Dorso</label><div class="field"><input id="tsDemDorso" inputmode="numeric"><span class="unit">pl.</span></div></div>
    <div class="full"><label for="tsDemPct">Además, % del tiraje (opcional)</label><div class="field"><input id="tsDemPct" inputmode="decimal"><span class="unit">%</span></div></div>
    <div class="full estado" id="tsDemInfo"></div>
  </div>

  <div id="tsTapaBox" data-solo="revista">
  <h2 class="sec">Tapa</h2>
  <div class="grid">
    <div class="full"><label for="tsTapaPapelSel">Papel de la tapa (catálogo)</label><select id="tsTapaPapelSel" class="ts-select"></select></div>
    <div><label for="tsTapaPapelNombre">Tipo</label><input id="tsTapaPapelNombre" placeholder="Ilustración" style="padding-right:12px"></div>
    <div><label for="tsTapaGramaje">Gramaje</label><div class="field"><input id="tsTapaGramaje" inputmode="decimal"><span class="unit">g/m²</span></div></div>
    <div><label for="tsTapaPrecio">Precio</label><div class="field"><input id="tsTapaPrecio" inputmode="decimal"><button type="button" class="pr-cur" id="tsTapaMon" data-cur="USD">US$</button></div></div>
    <div><label for="tsTapaUnidad">Por</label><select id="tsTapaUnidad" class="ts-select"><option value="kg">kilo</option><option value="pliego">pliego de compra</option></select></div>
    <div><label for="tsTapaCw">Hoja de compra ancho</label><div class="field"><input id="tsTapaCw" inputmode="decimal"><span class="unit">cm</span></div></div>
    <div><label for="tsTapaCh">Hoja de compra alto</label><div class="field"><input id="tsTapaCh" inputmode="decimal"><span class="unit">cm</span></div></div>
    <div class="full"><label for="tsTapaCorte">Pliego de máquina</label>
      <select id="tsTapaCorte" class="ts-select">
        <option value="1">Entero</option><option value="2" selected>Al medio (½)</option><option value="3">En 3 (⅓)</option>
        <option value="4">En 4 (¼)</option><option value="6">En 6</option><option value="8">En 8</option><option value="9">En 9</option>
      </select></div>
    <div><label for="tsTapaColF">Colores frente</label><div class="field"><input id="tsTapaColF" type="number" min="0" step="1" value="4"><span class="unit">col.</span></div></div>
    <div><label for="tsTapaColD">Colores dorso</label><div class="field"><input id="tsTapaColD" type="number" min="0" step="1" value="0"><span class="unit">col.</span></div></div>
    <div class="full chips" id="tsTapaChips">
      <button type="button" class="chip" data-c="4/0">4/0</button><button type="button" class="chip" data-c="4/4">4/4</button><button type="button" class="chip" data-c="4/1">4/1</button><button type="button" class="chip" data-c="1/0">1/0</button>
    </div>
    <label class="full ts-check"><input type="checkbox" id="tsTapaMismaChapa"> El dorso usa las mismas chapas (tira y retira)</label>
    <div class="full ts-gnota" id="tsTapaGramajeNota" hidden></div>
    <div><label for="tsTapaLomo">Lomo</label><div class="field"><input id="tsTapaLomo" inputmode="decimal" value="0"><span class="unit">mm</span></div></div>
    <div><label for="tsTapaPoses">Tapas por pliego</label><div class="field"><input id="tsTapaPoses" inputmode="numeric" placeholder="auto"><span class="unit">poses</span></div></div>
    <div class="full estado">El lomo es para las revistas con lomo pegado (hot melt); si va abrochada dejalo en 0. La tapa se imprime en la misma máquina que el interior.</div>
    <div class="full readout">
      <div><small>Tapa abierta</small><b id="tsTapaAbierta">—</b></div>
      <div><small>Pliego de máquina</small><b id="tsTapaPmTxt">—</b></div>
    </div>
  </div>
  </div>

  <h2 class="sec">Terminaciones</h2>
  <p class="estado" data-solo="revista" style="margin-top:-4px">Las que se cobran por pliego o por m² se calculan sobre la tapa o sobre el interior, según elijas en cada una. Las que van por ejemplar, sobre las revistas terminadas.</p>
  <div id="tsTerms" class="ts-terms"></div>

  <h2 class="sec">Moldes</h2>
  <div class="grid">
    <div><label for="tsSacabocado">Sacabocado</label><div class="field"><input id="tsSacabocado" inputmode="decimal" placeholder="0"><span class="unit">$</span></div></div>
    <div><label for="tsCunoMolde">Cuño</label><div class="field"><input id="tsCunoMolde" inputmode="decimal" placeholder="0"><span class="unit">$</span></div></div>
  </div>

  <h2 class="sec" data-solo="comun">Microcorrugado</h2>
  <div class="grid" data-solo="comun">
    <div><label for="tsMicroTipo">Tipo de micro</label><input id="tsMicroTipo" placeholder="Ej. Onda E blanco" style="padding-right:12px"></div>
    <div><label for="tsMicroPor">El precio es por</label><select id="tsMicroPor" class="ts-select"><option value="plancha">Plancha</option><option value="m2">Metro cuadrado (m²)</option></select></div>
    <div class="full"><div class="mode" role="group" id="tsMicroU"><button type="button" data-u="cm" aria-pressed="true">Centímetros</button><button type="button" data-u="mm" aria-pressed="false">Milímetros</button></div></div>
    <div><label for="tsMicroW">Plancha ancho</label><div class="field"><input id="tsMicroW" inputmode="decimal" placeholder="70"><span class="unit" id="tsMicroU1">cm</span></div></div>
    <div><label for="tsMicroH">Plancha alto</label><div class="field"><input id="tsMicroH" inputmode="decimal" placeholder="100"><span class="unit" id="tsMicroU2">cm</span></div></div>
    <div><label for="tsMicroPrecio" id="tsMicroPrecioLbl">Precio por plancha</label><div class="field"><input id="tsMicroPrecio" inputmode="decimal"><button type="button" class="pr-cur" id="tsMicroMon" data-cur="ARS">$</button></div></div>
    <div><label for="tsMicroPlanchas">Planchas</label><div class="field"><input id="tsMicroPlanchas" inputmode="numeric" placeholder="auto"><span class="unit">pl.</span></div></div>
    <div class="full readout">
      <div><small>Plancha</small><b id="tsMicroArea">—</b></div>
      <div><small id="tsMicroOtroLbl">Precio por m²</small><b id="tsMicroOtro">—</b></div>
    </div>
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

  <h2 class="sec" id="tsGuardadosTit">Presupuestos guardados</h2>
  <div class="aviso" id="tsRegAviso"><span id="tsRegAvisoTxt">Cargando…</span></div>
  <div id="tsRegApp" hidden>
    <div class="chips ts-tabs" id="tsTabs"></div>
    <div class="field"><input id="tsBuscar" placeholder="Buscar por cliente, trabajo o número" style="padding-right:12px"></div>
    <div class="actions ts-import ts-umbral"><label for="tsUmbral" style="margin:0">Avisar en los pendientes si el dólar subió más de</label><div class="field" style="width:84px"><input id="tsUmbral" inputmode="decimal" style="padding:6px 22px 6px 8px"><span class="unit">%</span></div></div>
    <div class="actions ts-import"><button type="button" class="btn small" id="tsImportar">Importar presupuesto…</button><input type="file" id="tsImportarArch" accept=".pliego,.json,application/json" multiple hidden><span class="estado">Para traer uno exportado desde otra cuenta (archivo .pliego).</span></div>
    <div class="ts-tabla-box" id="tsLista"></div>
    <details id="tsViejos" hidden style="margin-top:14px">
      <summary>Presupuestos de la versión anterior (<span id="tsViejosN">0</span>)</summary>
      <p class="estado">Se armaron con el presupuesto viejo: se pueden consultar y borrar, pero no abrir en esta versión.</p>
      <div class="pl-lista" id="tsViejosLista"></div>
    </details>
  </div>

  <details class="ts-config" id="tsConfig">
    <summary>Configuración: mi imprenta, papeles, máquinas y terminaciones</summary>
    <p class="estado" id="tsConfigInfo">Se guarda en tu cuenta (o en este navegador si no ingresaste).</p>
    <h3 class="pr-group">Actualizar precios en bloque</h3>
    <div class="ts-ajuste" id="tsAjuste">
      <div class="ts-aj-pct"><label for="tsAjPct">Subir (o bajar con −)</label><div class="field"><input id="tsAjPct" inputmode="decimal" placeholder="2" style="padding-right:30px"><span class="unit">%</span></div></div>
      <div class="ts-aj-op"><span class="lbl">Qué precios</span>
        <label><input type="checkbox" data-aj="papeles" checked> Papeles</label>
        <label><input type="checkbox" data-aj="maquinas" checked> Máquinas</label>
        <label><input type="checkbox" data-aj="terminaciones" checked> Terminaciones</label></div>
      <div class="ts-aj-op"><span class="lbl">Moneda</span>
        <select id="tsAjMon" class="ts-select ts-mini"><option value="">Pesos y dólares</option><option value="ARS">Solo en pesos</option><option value="USD">Solo en dólares</option></select></div>
      <div class="actions" style="margin:0"><button type="button" class="btn small primary" id="tsAjAplicar">Aplicar</button><button type="button" class="btn small" id="tsAjDeshacer" hidden>Deshacer</button><span class="estado" id="tsAjMsg"></span></div>
    </div>
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
// Precios guardados con el presupuesto (así cambiar el catálogo no modifica los presupuestos viejos)
let maquinaFija = null;
const PRECIOS_MAQ = ['chapa', 'postura', 'millar', 'minMillar', 'moneda'];
const preciosMaq = m => m ? Object.fromEntries([['id', m.id], ...PRECIOS_MAQ.map(k => [k, m[k]])]) : null;
function congelarPrecios() {
  const m = cat.maquinas.find(x => x.id === $('tsMaquina').value);
  if (m && !(maquinaFija && maquinaFija.id === m.id)) maquinaFija = preciosMaq(m);
  for (const t of cat.terminaciones) { const s = termSel[t.id]; if (s?.on) { s.precio ??= t.precio; s.postura ??= t.postura; } }
}
function preciosDistintos() {
  const m = cat.maquinas.find(x => x.id === $('tsMaquina').value);
  if (m && maquinaFija && maquinaFija.id === m.id && PRECIOS_MAQ.some(k => (maquinaFija[k] ?? null) !== (m[k] ?? null))) return true;
  return cat.terminaciones.some(t => { const s = termSel[t.id]; return s?.on && ((s.precio != null && num(s.precio) !== t.precio) || (s.postura != null && num(s.postura) !== (t.postura || 0))); });
}
let uMicro = 'cm', uTr = 'mm', demModo = 'auto', iva = 21, papelMon = 'USD', microMon = 'ARS', tipo = 'comun', tapaMon = 'USD';
let margenCant = {};   // cantidad → ganancia % propia (texto como se escribió)
const termSel = {};   // id → { on, lados }
const CAMPOS = ['tsFecha', 'tsCliente', 'tsTrabajo', 'tsCantidades', 'tsTw', 'tsTh', 'tsCalle', 'tsPinza', 'tsPoses', 'tsPapelSel', 'tsPapelNombre', 'tsGramaje',
  'tsPapelPrecio', 'tsPapelUnidad', 'tsCw', 'tsCh', 'tsCorte', 'tsMw', 'tsMh', 'tsMaquina', 'tsColF', 'tsColD', 'tsDemFrente', 'tsDemDorso', 'tsDemPct',
  'tsMicroTipo', 'tsMicroW', 'tsMicroH', 'tsMicroPor', 'tsMicroPrecio', 'tsMicroPlanchas', 'tsPreimp', 'tsPruebas', 'tsFlete', 'tsOtro', 'tsPorCaja', 'tsCajaPrecio', 'tsMargen', 'tsDesc', 'tsSacabocado', 'tsCunoMolde',
  'tsPaginas', 'tsPagsCara', 'tsTapaPapelSel', 'tsTapaPapelNombre', 'tsTapaGramaje', 'tsTapaPrecio', 'tsTapaUnidad', 'tsTapaCw', 'tsTapaCh', 'tsTapaCorte', 'tsTapaColF', 'tsTapaColD', 'tsTapaLomo', 'tsTapaPoses'];

function snapshot() {
  const c = {}; CAMPOS.forEach(k => c[k] = $(k).value);
  return { campos: c, uTr, demModo, iva, papelMon, microMon, margenCant: { ...margenCant }, mismaChapa: $('tsMismaChapa').checked, termSel: structuredClone(termSel), tipo, tapaMon, tapaOn: $('tsTapaOn').checked, tapaMismaChapa: $('tsTapaMismaChapa').checked, uMicro, maquinaFija, gramajeCalc, tapaGramajeCalc };
}
function restaurar(s) {
  if (!s) return;
  CAMPOS.forEach(k => { if (s.campos && s.campos[k] != null) $(k).value = s.campos[k]; });
  uTr = s.uTr || 'mm'; demModo = s.demModo || 'auto'; iva = s.iva ?? 21; papelMon = s.papelMon || 'USD'; microMon = s.microMon || 'ARS'; margenCant = { ...(s.margenCant || {}) }; pintarMargenes.clave = null;
  $('tsMismaChapa').checked = !!s.mismaChapa;
  uMicro = s.uMicro || 'cm'; maquinaFija = s.maquinaFija || null;
  gramajeCalc = s.gramajeCalc ?? null; tapaGramajeCalc = s.tapaGramajeCalc ?? null;
  // presupuestos viejos: el formato del micro era un texto ("70×100")
  if (s.campos && s.campos.tsMicroW == null) {
    const m = String(s.campos.tsMicroFormato || '').match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i);
    $('tsMicroW').value = m ? m[1] : ''; $('tsMicroH').value = m ? m[2] : ''; $('tsMicroPor').value = 'plancha';
  }
  tipo = s.tipo || 'comun'; tapaMon = s.tapaMon || 'USD'; $('tsTapaOn').checked = s.tapaOn !== false; $('tsTapaMismaChapa').checked = !!s.tapaMismaChapa;
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
  const tp = $('tsTapaPapelSel'), prevT = tp.value;
  tp.innerHTML = ps.innerHTML; tp.value = prevT;
  const ms = $('tsMaquina'), prevM = ms.value;
  ms.innerHTML = cat.maquinas.map(m => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('') || '<option value="">(cargá una máquina en Configuración)</option>';
  if ([...ms.options].some(o => o.value === prevM)) ms.value = prevM;
}
// En revistas: sobre qué pliegos se cobra (plegado → interior; laminado, barniz… → tapa)
const parteDe = t => termSel[t.id]?.parte || (/pleg|doblad|alzad/i.test(t.nombre) ? 'interior' : 'tapa');
function pintarTerminaciones() {
  $('tsTerms').innerHTML = cat.terminaciones.map(t => {
    const s = termSel[t.id] || {};
    return `<div class="ts-term${s.on ? ' on' : ''}" data-id="${t.id}">
      <label class="ts-check"><input type="checkbox" data-k="on" ${s.on ? 'checked' : ''}> ${esc(t.nombre)}</label>
      ${s.on ? `<span class="ts-precio">${t.moneda === 'USD' ? 'US$' : '$'} <input data-k="precio" class="ts-cell n" inputmode="decimal" value="${esc(String(s.precio ?? t.precio).replace('.', ','))}" aria-label="Precio en este presupuesto" title="Precio en este presupuesto"></span>
        <span class="estado">${UNIDADES[t.unidad] || ''}${(s.postura ?? t.postura) ? ' + postura ' + fmt(s.postura ?? t.postura) : ''}${s.precio != null && num(s.precio) !== t.precio ? ` · <span class="ts-difiere">catálogo: ${fmt(t.precio)}</span>` : ''}</span>`
      : `<span class="estado">${UNIDADES[t.unidad] || ''} · ${t.moneda === 'USD' ? 'US$' : '$'} ${fmt(t.precio)}${t.postura ? ' + postura ' + fmt(t.postura) : ''}</span>`}
      ${t.porLado ? `<select data-k="lados" class="ts-select ts-mini"><option value="1">Frente</option><option value="2" ${s.lados == 2 ? 'selected' : ''}>F y D</option></select>` : ''}
      ${t.unidad === 'fijo' ? `<span class="ts-unid"><input data-k="unid" class="ts-cell n" inputmode="numeric" value="${esc(s.unid ?? 1)}" aria-label="Unidades" title="Unidades"> unid.</span>` : ''}
      ${tipo === 'revista' && $('tsTapaOn').checked && ['pliego', 'millarPl', 'm2'].includes(t.unidad) ? `<select data-k="parte" class="ts-select ts-mini ts-parte" aria-label="Sobre qué se cobra"><option value="tapa">Tapa</option><option value="interior" ${parteDe(t) === 'interior' ? 'selected' : ''}>Interior</option></select>` : ''}
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
// ---------- Subir / bajar todos los precios un % ----------
const CAMPOS_PRECIO = { papeles: ['precio'], maquinas: ['chapa', 'postura', 'millar'], terminaciones: ['precio', 'postura'] };
let ajusteAnterior = null;
$('tsAjAplicar').addEventListener('click', () => {
  const pct = num($('tsAjPct').value.replace('−', '-'));
  const m = t => { $('tsAjMsg').textContent = t; };
  if (!pct) return m('Poné un porcentaje, por ejemplo 2 (o -2 para bajar).');
  if (pct <= -100) return m('No se puede bajar 100 % o más.');
  const grupos = [...$('tsAjuste').querySelectorAll('[data-aj]:checked')].map(c => c.dataset.aj);
  if (!grupos.length) return m('Elegí qué precios actualizar.');
  const mon = $('tsAjMon').value, f = 1 + pct / 100;
  ajusteAnterior = structuredClone({ papeles: cat.papeles, maquinas: cat.maquinas, terminaciones: cat.terminaciones });
  let filas = 0;
  for (const g of grupos) for (const row of cat[g]) {
    if (mon && (row.moneda || 'ARS') !== mon) continue;
    let tocada = false;
    for (const k of CAMPOS_PRECIO[g]) if (Number(row[k])) { { const v = row[k] * f, d = Math.abs(v) < 10 ? 1000 : 100; row[k] = Math.round(v * d) / d; } tocada = true; }
    if (tocada) filas++;
  }
  pintarConfig(); catCambiado();
  $('tsAjDeshacer').hidden = !filas;
  m(filas ? `Listo: ${pct > 0 ? 'subieron' : 'bajaron'} ${String(Math.abs(pct)).replace('.', ',')} % los precios de ${filas} ítem${filas > 1 ? 's' : ''}. Los presupuestos ya guardados no cambian.` : 'No había precios para actualizar con esa selección.');
  $('tsAjPct').value = '';
});
$('tsAjDeshacer').addEventListener('click', () => {
  if (!ajusteAnterior) return;
  Object.assign(cat, ajusteAnterior); ajusteAnterior = null;
  pintarConfig(); catCambiado();
  $('tsAjDeshacer').hidden = true; $('tsAjMsg').textContent = 'Se volvieron a poner los precios anteriores.';
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
  const maqCat = cat.maquinas.find(m => m.id === $('tsMaquina').value) || null;
  const maquina = maqCat && maquinaFija && maquinaFija.id === maqCat.id ? { ...maqCat, ...maquinaFija } : maqCat;
  const calle = num($('tsCalle').value), pinza = num($('tsPinza').value);
  const autoPoses = maq && tw > 0 && th > 0 && window.mejorPoses ? window.mejorPoses(maq.w * 10, maq.h * 10, tw, th, { pinza, calleX: calle, calleY: calle }) : 0;
  const poses = num($('tsPoses').value) > 0 ? Math.floor(num($('tsPoses').value)) : autoPoses;
  const rev = tipo === 'revista';
  // Revista: páginas por cara del pliego (lo que entra, redondeado a 1, 2, 4, 8, 16, 32 para que pliegue)
  const entranPags = rev && maq && tw > 0 && th > 0 && window.mejorPoses ? window.mejorPoses(maq.w * 10, maq.h * 10, tw, th, { pinza, calleX: calle, calleY: calle }) : 0;
  const autoPagsCara = entranPags > 0 ? 2 ** Math.floor(Math.log2(entranPags)) : 0;
  const pagsCara = num($('tsPagsCara').value) > 0 ? Math.floor(num($('tsPagsCara').value)) : autoPagsCara;
  let tapa = null, tapaAbierta = null, tapaAutoPoses = 0;
  if (rev && $('tsTapaOn').checked) {
    const tcw = num($('tsTapaCw').value), tch = num($('tsTapaCh').value), tcorte = +$('tsTapaCorte').value || 1;
    const tmaq = pliegoMaquina(tcw, tch, tcorte);
    tapaAbierta = tw > 0 && th > 0 ? { w: 2 * tw + num($('tsTapaLomo').value), h: th } : null;
    tapaAutoPoses = tmaq && tapaAbierta && window.mejorPoses ? window.mejorPoses(tmaq.w * 10, tmaq.h * 10, tapaAbierta.w, tapaAbierta.h, { pinza, calleX: calle, calleY: calle }) : 0;
    const tg = num($('tsTapaGramaje').value);
    tapa = {
      poses: num($('tsTapaPoses').value) > 0 ? Math.floor(num($('tsTapaPoses').value)) : tapaAutoPoses,
      colF: Math.floor(num($('tsTapaColF').value)), colD: Math.floor(num($('tsTapaColD').value)), mismaChapa: $('tsTapaMismaChapa').checked,
      papel: { nombre: `${$('tsTapaPapelNombre').value.trim()} ${tg ? fmt(tg, 0) + ' g' : ''}`.trim(), gramaje: tapaGramajeCalc ?? tg, precio: num($('tsTapaPrecio').value), unidad: $('tsTapaUnidad').value, moneda: tapaMon },
      compra: { w: tcw, h: tch }, corte: tcorte, maq: tmaq,
    };
  }
  const terminaciones = cat.terminaciones.filter(t => termSel[t.id]?.on).map(t => {
    const s = termSel[t.id], hs = /stamping/i.test(t.nombre);
    return { ...t, precio: s.precio != null ? num(s.precio) : t.precio, postura: s.postura != null ? num(s.postura) : t.postura, unidades: Math.max(1, Math.floor(num(s.unid ?? 1)) || 1), parte: rev && tapa ? parteDe(t) : 'interior', lados: t.porLado ? (+s.lados || 1) : 1, cuno: hs ? num(s.cuno) : 0, foil: hs ? num(s.foil) : 0, cunoMon: s.cunoMon || 'ARS', foilMon: s.foilMon || 'ARS' };
  });
  const otros = [['Sacabocado', 'tsSacabocado', 'Moldes'], ['Cuño', 'tsCunoMolde', 'Moldes'], ['Diseño / preimpresión', 'tsPreimp'], ['Pruebas de color', 'tsPruebas'], ['Flete', 'tsFlete'], ['Otros', 'tsOtro']]
    .map(([nombre, id, grupo]) => ({ nombre, precio: num($(id).value), moneda: 'ARS', grupo })).filter(o => o.precio > 0);
  return {
    tw, th, autoPoses, poses, maquinaObj: maquina, corte, rev, entranPags, autoPagsCara, pagsCara, tapaAbierta, tapaAutoPoses,
    base: {
      revista: rev ? { paginas: Math.floor(num($('tsPaginas').value)), pagsCara, retiracion: $('tsMismaChapa').checked } : null, tapa,
      poses, colF: Math.floor(num($('tsColF').value)), colD: Math.floor(num($('tsColD').value)), mismaChapa: $('tsMismaChapa').checked,
      papel: { nombre: `${$('tsPapelNombre').value.trim()} ${num($('tsGramaje').value) ? fmt(num($('tsGramaje').value), 0) + ' g' : ''}`.trim(), gramaje: gramajeCalc ?? num($('tsGramaje').value), precio: num($('tsPapelPrecio').value), unidad: $('tsPapelUnidad').value, moneda: papelMon },
      compra: { w: cw, h: ch }, corte: corte || 0, maq,
      maquina: maquina || {},
      demasia: { frente: num($('tsDemFrente').value), dorso: num($('tsDemDorso').value), pct: num($('tsDemPct').value) },
      terminaciones, otros,
      micro: microDatos(),
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
const calc1 = (b, cant, margen) => (b.revista ? presupuestarRevista : presupuestar)({ ...b, cant, margen });
// Microcorrugado: formato de la plancha (cm o mm) y precio por plancha o por m²
function microDatos() {
  const k = uMicro === 'mm' ? 0.1 : 1, w = num($('tsMicroW').value) * k, h = num($('tsMicroH').value) * k;   // en cm
  const area = w * h / 10000, precio = num($('tsMicroPrecio').value), porM2 = $('tsMicroPor').value === 'm2';
  const u = uMicro === 'mm' ? 'mm' : 'cm', f = v => fmt(v * (uMicro === 'mm' ? 10 : 1), 1).replace(/,0$/, '');
  return {
    tipo: $('tsMicroTipo').value.trim(), formato: w && h ? `${f(w)} × ${f(h)} ${u}` : '', area,
    precio: porM2 ? precio * area : precio, precioM2: porM2 ? precio : area ? precio / area : 0, porM2,
    planchas: num($('tsMicroPlanchas').value), moneda: microMon,
  };
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
  document.querySelectorAll('#tsMicroU button').forEach(x => x.setAttribute('aria-pressed', x.dataset.u === uMicro));
  $('tsMicroU1').textContent = $('tsMicroU2').textContent = uMicro;
  {
    const md = microDatos(), sm = microMon === 'USD' ? 'US$ ' : '$ ';
    $('tsMicroPrecioLbl').textContent = md.porM2 ? 'Precio por m²' : 'Precio por plancha';
    $('tsMicroOtroLbl').textContent = md.porM2 ? 'Precio por plancha' : 'Precio por m²';
    $('tsMicroArea').textContent = md.area ? `${md.formato} = ${fmt(md.area, 3)} m²` : '—';
    $('tsMicroOtro').textContent = md.area && num($('tsMicroPrecio').value) ? sm + fmt(md.porM2 ? md.precio : md.precioM2, 2) : (md.porM2 && !md.area ? 'cargá el formato' : '—');
  }
  $('tsMaqManual').hidden = $('tsCorte').value !== '0';
  $('tsTotalLabel').textContent = iva ? 'Total con IVA' : 'Total';
  $('tsDolarInfo').textContent = dolar?.venta ? `Dólar oficial (venta) para los precios en US$: ${pesos(dolar.venta)}` : 'Sin cotización del dólar: los precios en US$ no se pueden pasar a pesos.';

  const rev = tipo === 'revista';
  sec.classList.toggle('es-revista', rev);
  document.querySelectorAll('#tsTipo button').forEach(x => x.setAttribute('aria-pressed', x.dataset.t === tipo));
  $('tsTwLbl').textContent = rev ? 'Página cerrada ancho' : 'Corte a corte ancho'; $('tsThLbl').textContent = rev ? 'Página cerrada alto' : 'Corte a corte alto';
  $('tsPapelTit').textContent = rev ? 'Papel del interior' : 'Papel'; $('tsImpTit').textContent = rev ? 'Impresión del interior' : 'Impresión';
  $('tsMismaChapaLbl').textContent = rev ? 'Retiración: frente y dorso con la misma chapa (cada pliego da 2 juegos)' : 'El dorso usa las mismas chapas (tira y retira)';
  $('tsPosesLbl').textContent = rev ? 'Páginas por cara' : 'Poses';
  $('tsTapaBox').hidden = !(rev && $('tsTapaOn').checked);
  $('tsTapaMon').dataset.cur = tapaMon; $('tsTapaMon').textContent = tapaMon === 'USD' ? 'US$' : '$';
  const E = entrada(), b = E.base;
  $('tsTopEstado').textContent = abierto ? `Editando el presupuesto N° ${$('tsNumero').value}` : 'Presupuesto nuevo';
  $('tsCongelado').hidden = !preciosDistintos();
  const nota = (id, calc, campo) => {
    const g = num($(campo).value), ver = calc != null && Math.abs(calc - g) > 0.01;
    $(id).hidden = !ver;
    if (ver) $(id).textContent = `Presupuesto cerrado: el precio se calculó con ${fmt(calc, 0)} g y no cambia. El papel que se usa ahora es de ${fmt(g, 0)} g.`;
  };
  nota('tsGramajeNota', gramajeCalc, 'tsGramaje'); nota('tsTapaGramajeNota', tapaGramajeCalc, 'tsTapaGramaje');
  $('tsPmTxt').textContent = b.maq ? `${fmt(b.maq.w, 1)} × ${fmt(b.maq.h, 1)} cm${!E.corte && b.compra.w ? ` · salen ${piezasPorCompra(b.compra.w, b.compra.h, 0, b.maq)} por pliego de compra` : ''}` : '—';
  if (rev) $('tsPosesTxt').textContent = E.pagsCara ? String(E.pagsCara) + (num($('tsPagsCara').value) > 0 ? ' (a mano)' : '') : '—';
  else $('tsPosesTxt').textContent = E.poses ? String(E.poses) + (num($('tsPoses').value) > 0 ? ' (a mano)' : '') : '—';
  $('tsPoses').placeholder = E.autoPoses ? String(E.autoPoses) : 'auto';
  $('tsPagsCara').placeholder = E.autoPagsCara ? String(E.autoPagsCara) : 'auto';
  $('tsTapaPoses').placeholder = E.tapaAutoPoses ? String(E.tapaAutoPoses) : 'auto';
  $('tsTapaAbierta').textContent = E.tapaAbierta ? `${fmt(E.tapaAbierta.w / 10, 1)} × ${fmt(E.tapaAbierta.h / 10, 1)} cm` : '—';
  $('tsTapaPmTxt').textContent = b.tapa?.maq ? `${fmt(b.tapa.maq.w, 1)} × ${fmt(b.tapa.maq.h, 1)} cm · ${b.tapa.poses || 0} por pliego` : '—';

  const avisos = [];
  if (E.maquinaObj && b.maq && !entraEnMaquina(b.maq, E.maquinaObj)) avisos.push(`El pliego de máquina (${fmt(b.maq.w, 1)}×${fmt(b.maq.h, 1)}) no entra en la ${E.maquinaObj.nombre} (máx. ${E.maquinaObj.anchoMax}×${E.maquinaObj.altoMax}). Cortá el pliego en más partes o elegí otra máquina.`);
  if (E.maquinaObj && E.maquinaObj.colores && Math.max(b.colF, b.colD) > E.maquinaObj.colores) avisos.push(`La máquina es de ${E.maquinaObj.colores} color${E.maquinaObj.colores > 1 ? 'es' : ''}: se va a necesitar más de una pasada por lado.`);
  if (!rev && num($('tsPoses').value) > 0 && E.autoPoses > 0 && E.poses > E.autoPoses) avisos.push(`Cargaste ${E.poses} poses, pero con estas medidas entran como máximo ${E.autoPoses}.`);
  const cants = cantidades();
  if (!cants.length) avisos.push('Cargá la cantidad (podés poner varias separadas por coma).');
  if (rev) {
    const P = b.revista.paginas;
    if (!P) avisos.push('Cargá la cantidad de páginas del interior.');
    else if (P % 4) avisos.push(`${P} páginas no es múltiplo de 4: si va abrochada a caballete, sobran o faltan páginas.`);
    if (!E.pagsCara) avisos.push(E.tw && b.maq ? 'La página no entra en el pliego de máquina con esa pinza. Revisá medidas o cargá las páginas por cara a mano.' : 'Cargá la medida de la página y el pliego para calcular cuántas entran.');
    else if (num($('tsPagsCara').value) > 0 && E.entranPags > 0 && E.pagsCara > E.entranPags) avisos.push(`Cargaste ${E.pagsCara} páginas por cara, pero con estas medidas entran como máximo ${E.entranPags}.`);
    if (b.tapa && !b.tapa.poses) avisos.push(b.tapa.maq && E.tapaAbierta ? 'La tapa abierta no entra en su pliego de máquina. Elegí un pliego más grande o cargá las poses a mano.' : 'Completá el papel de la tapa (hoja de compra y pliego).');
    if (b.tapa?.maq && E.maquinaObj && !entraEnMaquina(b.tapa.maq, E.maquinaObj)) avisos.push(`El pliego de la tapa no entra en la ${E.maquinaObj.nombre}.`);
  } else if (!E.poses) avisos.push(E.tw && b.maq ? 'El trabajo no entra en el pliego de máquina con esa pinza. Revisá medidas o cargá las poses a mano.' : 'Cargá el corte a corte y el pliego de compra para calcular las poses.');

  pintarMargenes(cants);
  const res = cants.map(cant => calc1(b, cant, margenDe(cant)));
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
    set('tsPliegos', r.revista ? `Interior ${fmt(r.interior.pm, 0)} / ${fmt(r.interior.pc, 0)}${r.tapa ? ` · Tapa ${fmt(r.tapa.pm, 0)} / ${fmt(r.tapa.pc, 0)}` : ''}` : `${fmt(r.pm, 0)} / ${fmt(r.pc, 0)}  (demasía ${fmt(r.dem, 0)})`);
    if (r.revista) $('tsDemInfo').textContent = `Demasía del interior: ${fmt(r.interior.dem, 0)} pliegos en total (la demasía se suma en cada uno de los ${r.formas.length} pliegos).${r.tapa ? ` Tapa: ${fmt(r.tapa.dem, 0)}.` : ''}`; else
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
  const r0 = res.find(x => x.formas?.length);
  $('tsArmadoInfo').textContent = rev && r0 ? `Armado del interior: ${resumenFormas(r0.formas)} · ${fmt(r0.interior.chapas, 0)} chapas y ${fmt(r0.interior.posturas, 0)} posturas.` : '';
  // Resumen por cantidad: Cantidad · Ganancia · Unitario s/IVA · Total s/IVA · Total c/IVA
  const okRes = res.filter(x => x.ok), R = 'style="text-align:right"';
  $('tsComparar').innerHTML = okRes.length ? `<thead><tr><th>Cantidad</th><th ${R}>Ganancia</th><th ${R}>Unitario s/IVA</th><th ${R}>Total s/IVA</th><th ${R}>Total c/IVA</th></tr></thead><tbody>`
    + okRes.map(x => `<tr><td>${fmt(x.cant, 0)} ej.</td><td class="h">${pesos(x.ganancia)} <small style="color:var(--muted)">(${fmt(x.margen, 1)} %)</small></td><td class="h">${pesos(x.unitario)}</td><td class="h">${pesos(x.subtotal)}</td><td class="h"><b>${pesos(x.total)}</b></td></tr>`).join('') + '</tbody>' : '';
  $('tsHint').textContent = avisos.join(' '); $('tsHint').hidden = !avisos.length;
  guardarLocal();
  if (!$('tsClienteWrap').hidden) pintarDocCliente();
  if (!$('tsCorteWrap').hidden) pintarDocCorte();
}

// ---------- Presupuesto para el cliente ----------
function colTxt(f, d) { return `${f}/${d}` + (f || d ? ` (${f} color${f === 1 ? '' : 'es'} frente${d ? `, ${d} dorso` : ', dorso sin imprimir'})` : ''); }
// Qué se presupuesta (para el documento y el texto del cliente)
function especificacion(E) {
  const b = E.base, terms = b.terminaciones.map(t => t.nombre + (t.lados > 1 ? ' (frente y dorso)' : '') + (t.unidad === 'fijo' && t.unidades > 1 ? ` × ${t.unidades}` : '')).join(', ');
  const medida = E.tw && E.th ? `${fmt(E.tw / 10, 1)} × ${fmt(E.th / 10, 1)} cm` : '';
  if (E.rev) {
    const P = b.revista.paginas;
    return [
      medida && ['Formato cerrado', medida],
      P && ['Páginas', `${P} páginas interiores${b.tapa ? ' + tapa' : ' (tapa incluida)'}`],
      ['Interior', [b.papel.nombre, colTxt(b.colF, b.colD)].filter(Boolean).join(' · ')],
      b.tapa && ['Tapa', [b.tapa.papel.nombre, colTxt(b.tapa.colF, b.tapa.colD)].filter(Boolean).join(' · ')],
      terms && ['Terminaciones', terms],
    ].filter(Boolean);
  }
  return [
    medida && ['Medida terminada', medida],
    b.papel.nombre && ['Papel', b.papel.nombre],
    ['Impresión', colTxt(b.colF, b.colD)],
    (b.micro.tipo || b.micro.formato) && ['Microcorrugado', [b.micro.tipo, b.micro.formato].filter(Boolean).join(' · ')],
    terms && ['Terminaciones', terms],
  ].filter(Boolean);
}
function pintarDocCliente() {
  if (!ultimo) return;
  const { E, res } = ultimo, b = E.base, im = cat.imprenta;
  const filas = res.filter(r => r.ok).map(r => `<tr><td>${fmt(r.cant, 0)}</td><td class="r">${pesos(r.unitario)}</td><td class="r">${pesos(r.subtotal)}</td>${iva ? `<td class="r">${pesos(r.total)}</td>` : ''}</tr>`).join('');
  $('tsClienteDoc').innerHTML = `
    <div class="ts-doc-head">
      <div><div class="ts-doc-imp">${esc(im.nombre || 'Mi imprenta')}</div>
        <div class="ts-doc-sub">${[im.cuit && 'CUIT ' + esc(im.cuit), esc(im.direccion), esc(im.telefono), esc(im.email)].filter(Boolean).join(' · ')}</div></div>
      <div class="ts-doc-num"><b>PRESUPUESTO</b><br>N° ${esc($('tsNumero').value || '—')}<br>${fechaTxt($('tsFecha').value)}</div>
    </div>
    <p><b>Cliente:</b> ${esc($('tsCliente').value) || '—'}${(() => { const c = clienteActual(); const d = c && [c.cuit && 'CUIT ' + c.cuit, c.iva, [c.direccion, c.localidad].filter(Boolean).join(', ')].filter(Boolean).join(' · '); return d ? `<br><span class="ts-doc-sub">${esc(d)}</span>` : ''; })()}<br><b>Trabajo:</b> ${esc($('tsTrabajo').value) || '—'}</p>
    <table class="ts-doc-spec">${especificacion(E).map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <table class="ts-doc-precios">
      <thead><tr><th>Cantidad</th><th class="r">Precio unitario</th><th class="r">Subtotal${iva ? ' sin IVA' : ''}</th>${iva ? `<th class="r">Total con IVA ${fmt(iva, 1)} %</th>` : ''}</tr></thead>
      <tbody>${filas || '<tr><td colspan="4">—</td></tr>'}</tbody>
    </table>
    <p class="ts-doc-pie">${im.validez ? `Validez de la oferta: ${esc(im.validez)} días. ` : ''}${im.pago ? `Forma de pago: ${esc(im.pago)}. ` : ''}${b.papel.moneda === 'USD' || b.maquina.moneda === 'USD' || b.tapa?.papel.moneda === 'USD' || (b.micro.precio && b.micro.moneda === 'USD') ? 'Precios sujetos a la cotización del dólar oficial. ' : ''}${esc(im.notas || '')}</p>`;
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
  if (E.rev) { pintarCorteRevista(doc, E, r, calle, pinza, im); return; }
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
function pintarCorteRevista(doc, E, r, calle, pinza, im) {
  const b = E.base, arm = (maq, w, h, n) => maq && n && window.armadoPoses ? window.armadoPoses(maq.w * 10, maq.h * 10, w, h, { pinza, calleX: calle, calleY: calle, poses: n }) : null;
  const ai = arm(b.maq, E.tw, E.th, E.pagsCara), at = b.tapa && E.tapaAbierta ? arm(b.tapa.maq, E.tapaAbierta.w, E.tapaAbierta.h, b.tapa.poses) : null;
  const filas = [
    ['Página cerrada', `${fmt(E.tw, 1)} × ${fmt(E.th, 1)} mm`],
    ['Páginas', `${b.revista.paginas || 0} interiores${b.tapa ? ' + tapa' : ''}`],
    ['Interior', `${b.papel.nombre || '—'} · pliego de máquina ${fmt(b.maq.w, 1)} × ${fmt(b.maq.h, 1)} cm · ${E.pagsCara} págs. por cara · ${b.colF}/${b.colD}`],
    r && r.ok && ['Armado del interior', `${resumenFormas(r.formas)} · ${fmt(r.interior.chapas, 0)} chapas`],
    r && r.ok && ['Pliegos del interior', `${fmt(r.cant, 0)} ej. → ${fmt(r.interior.netos, 0)} pl. + ${fmt(r.interior.dem, 0)} demasía = ${fmt(r.interior.pm, 0)} pl. de máquina${b.compra.w ? ` = ${fmt(r.interior.pc, 0)} hojas de ${fmt(b.compra.w, 0)}×${fmt(b.compra.h, 0)}` : ''}`],
    b.tapa && ['Tapa', `${b.tapa.papel.nombre || '—'} · abierta ${fmt(E.tapaAbierta?.w / 10 || 0, 1)} × ${fmt(E.tapaAbierta?.h / 10 || 0, 1)} cm · ${b.tapa.poses} por pliego · ${b.tapa.colF}/${b.tapa.colD}${b.tapa.mismaChapa && b.tapa.colD ? ' · tira y retira' : ''}`],
    b.tapa && r && r.tapa && ['Pliegos de la tapa', `${fmt(r.tapa.netos, 0)} pl. + ${fmt(r.tapa.dem, 0)} demasía = ${fmt(r.tapa.pm, 0)} pl. de máquina${b.tapa.compra.w ? ` = ${fmt(r.tapa.pc, 0)} hojas de ${fmt(b.tapa.compra.w, 0)}×${fmt(b.tapa.compra.h, 0)}` : ''}`],
    ['Pinza / calle', `${fmt(pinza, 0)} mm / ${calle ? fmt(calle, 1) + ' mm' : 'sin calle'}`],
  ].filter(Boolean);
  doc.innerHTML = `
    <div class="ts-doc-head">
      <div><div class="ts-doc-imp">Armado de la revista</div><div class="ts-doc-sub">${[im.nombre && esc(im.nombre), $('tsNumero').value && 'Presupuesto N° ' + esc($('tsNumero').value)].filter(Boolean).join(' · ')}</div></div>
      <div class="ts-doc-num"><b>${esc($('tsCliente').value || '')}</b><br>${esc($('tsTrabajo').value || '')}<br>${fechaTxt($('tsFecha').value)}</div>
    </div>
    <table class="ts-doc-spec">${filas.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <div class="ts-figs">
      ${ai ? `<div class="ts-fig"><h4>Interior: ${ai.rects.length} páginas por cara</h4>${svgMaquina(ai, pinza, calle)}<p>Cada rectángulo es una página. El orden de las páginas (imposición) depende del plegado.</p></div>` : '<p>La página no entra en el pliego del interior.</p>'}
      ${at ? `<div class="ts-fig"><h4>Tapa: ${at.rects.length} por pliego</h4>${svgMaquina(at, pinza, calle)}<p>Tapa abierta (contratapa + lomo + tapa).</p></div>` : ''}
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
    ...especificacion(E).map(([k, v]) => `${k}: ${v}`), '',
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
$('tsTipo').addEventListener('click', e => { const x = e.target.closest('button'); if (!x || x.dataset.t === tipo) return; tipo = x.dataset.t; pintarTerminaciones(); calcular(); });
$('tsTapaOn').addEventListener('change', () => { pintarTerminaciones(); });
$('tsTapaMon').addEventListener('click', () => { tapaMon = tapaMon === 'USD' ? 'ARS' : 'USD'; calcular(); });
$('tsTapaChips').addEventListener('click', e => { const x = e.target.closest('.chip'); if (!x) return; const [f, d] = x.dataset.c.split('/'); $('tsTapaColF').value = f; $('tsTapaColD').value = d; calcular(); });
$('tsTapaPapelSel').addEventListener('change', () => {
  const p = cat.papeles.find(x => x.id === $('tsTapaPapelSel').value); if (!p) return;
  $('tsTapaPapelNombre').value = p.nombre; $('tsTapaGramaje').value = p.gramaje; $('tsTapaPrecio').value = String(p.precio).replace('.', ',');
  $('tsTapaUnidad').value = p.unidad; tapaMon = p.moneda;
  if (p.w && p.h) { $('tsTapaCw').value = p.w; $('tsTapaCh').value = p.h; }
  calcular();
});
$('tsIva').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { iva = +b.dataset.iva; calcular(); } });
$('tsPapelMon').addEventListener('click', () => { papelMon = papelMon === 'USD' ? 'ARS' : 'USD'; calcular(); });
$('tsMicroU').addEventListener('click', e => {
  const x = e.target.closest('button'); if (!x || x.dataset.u === uMicro) return;
  const f = x.dataset.u === 'mm' ? 10 : 0.1; uMicro = x.dataset.u;
  ['tsMicroW', 'tsMicroH'].forEach(id => { const v = num($(id).value); if (v > 0) $(id).value = fmt(v * f, 2).replace(/\./g, '').replace(/,00$/, ''); });
  calcular();
});
$('tsMicroPor').addEventListener('change', calcular);
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
  if (e.target.dataset.k === 'on') { s.on = e.target.checked; pintarTerminaciones(); }
  if (e.target.dataset.k === 'precio') pintarTerminaciones();
  if (e.target.dataset.k === 'lados') s.lados = +e.target.value;
  if (e.target.dataset.k === 'parte') s.parte = e.target.value;
  calcular();
});
// Hot stamping: precio del cuño y del foil
$('tsTerms').addEventListener('input', e => {
  const k = e.target.dataset.k; if (k !== 'cuno' && k !== 'foil' && k !== 'unid' && k !== 'precio') return;
  const s = termSel[e.target.closest('.ts-term').dataset.id] ||= { on: false, lados: 1 }; s[k] = e.target.value;
  if (k === 'precio' && e.target.value.trim() === '') delete s.precio;
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
  ['tsCliente', 'tsTrabajo', 'tsCantidades', 'tsTw', 'tsTh', 'tsPoses', 'tsMicroTipo', 'tsMicroW', 'tsMicroH', 'tsMicroPrecio', 'tsMicroPlanchas', 'tsPreimp', 'tsPruebas', 'tsFlete', 'tsOtro', 'tsPorCaja', 'tsCajaPrecio', 'tsNumero', 'tsSacabocado', 'tsCunoMolde', 'tsPaginas', 'tsPagsCara', 'tsTapaPoses'].forEach(id => $(id).value = '');
  $('tsFecha').value = fechaAuto = hoy(); $('tsDesc').value = '0'; abierto = null; aplicarDefaults(true); margenCant = {}; pintarMargenes.clave = null;
  for (const k in termSel) delete termSel[k]; maquinaFija = null; gramajeCalc = tapaGramajeCalc = null; abiertoCerrado = false; pintarTerminaciones();
  $('tsClienteWrap').hidden = true; $('tsCorteWrap').hidden = true; $('tsGuardar').textContent = 'Guardar presupuesto';
  calcular(); pintarLista(); pintarCliente(); $('tsClienteSel').value = ''; msg(aviso);
}
// "Nuevo" (arriba o abajo): limpia y vuelve al principio del formulario
$('tsIrGuardados').addEventListener('click', () => $('tsGuardadosTit').scrollIntoView({ behavior: 'smooth' }));
for (const id of ['tsNuevo', 'tsNuevoArriba']) $(id).addEventListener('click', () => { nuevoPresupuesto(); sec.scrollIntoView({ behavior: 'smooth' }); });
$('tsUsarCatalogo').addEventListener('click', () => {
  maquinaFija = null;
  for (const k in termSel) { delete termSel[k].precio; delete termSel[k].postura; }
  pintarTerminaciones(); calcular(); msg('Se pusieron los precios actuales del catálogo. Guardá para que queden en el presupuesto.');
});

for (const [campo, tapa] of [['tsGramaje', false], ['tsTapaGramaje', true]]) {
  $(campo).addEventListener('focus', e => { e.target.dataset.antes = e.target.value; });
  $(campo).addEventListener('input', e => {
    if (!abiertoCerrado) return;
    const antes = num(e.target.dataset.antes);
    if (tapa) { if (tapaGramajeCalc == null && antes) tapaGramajeCalc = antes; }
    else if (gramajeCalc == null && antes) gramajeCalc = antes;
  });
}

// ---------- Gramaje sincronizado entre Presupuesto y Planilla de pedidos ----------
const gramajeDeTxt = t => { const m = String(t || '').match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramos)\b/i); return m ? num(m[1]) : null; };
const conGramaje = (t, g) => /(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramos)\b/i.test(t || '') ? String(t).replace(/(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos)\b/i, `${fmt(g, 0)} g`) : `${String(t || '').trim()} ${fmt(g, 0)} g`.trim();
const parteDePedido = p => p.parte || (/·\s*tapa\s*$/i.test(p.trabajo || '') ? 'tapa' : 'interior');
// Presupuesto → pedidos: al guardar, los pedidos vinculados toman el gramaje nuevo (y recalculan los kilos)
function gramajeAPedidos(presId, gInterior, gTapa) {
  for (const p of pedidos.filter(x => x.presupuestoId === presId)) {
    const g = parteDePedido(p) === 'tapa' ? gTapa : gInterior; if (!(g > 0)) continue;
    const gOld = gramajeDeTxt(p.material); if (gOld != null && Math.abs(gOld - g) < 0.01) continue;
    const m = String(p.formato || '').match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i);
    const cambios = { material: conGramaje(p.material, g), actualizado: FB.fb.serverTimestamp() };
    if (m && p.pliegos > 0) {
      const kilos = Math.round(num(m[1]) * num(m[2]) * g * p.pliegos / 1e7 * 100) / 100, f = 1 + (p.packaging > 0 ? p.packaging : 0) / 100;
      Object.assign(cambios, { kilos, kilosTotal: Math.round(kilos * f * 100) / 100 });
    }
    FB.fb.updateDoc(FB.fb.doc(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'planilla'), p.id), cambios).catch(() => {});
  }
}
// Pedido → presupuesto: lo llama la Planilla cuando se cambia el gramaje de un pedido vinculado
export async function gramajeDesdePedido(presId, parte, g) {
  const r = lista.find(x => x.id === presId); if (!r || !r.snapshot || !(g > 0)) return null;
  const snap = structuredClone(r.snapshot), campo = parte === 'tapa' ? 'tsTapaGramaje' : 'tsGramaje';
  const viejo = num(snap.campos?.[campo]); if (Math.abs(viejo - g) < 0.01) return null;
  const esCerrado = cerrado(r);
  if (esCerrado) { if (parte === 'tapa') snap.tapaGramajeCalc ??= viejo; else snap.gramajeCalc ??= viejo; }
  snap.campos = { ...snap.campos, [campo]: String(g) };
  const cambios = { snapshot: snap, actualizado: FB.fb.serverTimestamp() };
  if (parte !== 'tapa') cambios.papel = conGramaje(r.papel || snap.campos.tsPapelNombre, g);
  if (!esCerrado) {   // pendiente: el precio se recalcula con el gramaje nuevo
    try {
      const res = calcularDesdeSnapshot(snap).res.filter(x => x.ok);
      if (res.length) cambios.resumen = res.map(x => ({ cant: x.cant, total: Math.round(x.total * 100) / 100, subtotal: Math.round(x.subtotal * 100) / 100, unitario: Math.round(x.unitario * 10000) / 10000, pm: x.pm, pc: x.pc, kilos: Math.round(x.kilos * 100) / 100 }));
    } catch (e) {}
  }
  await FB.fb.updateDoc(FB.fb.doc(col(), presId), cambios);
  if (abierto === presId) {   // si está abierto en pantalla, se actualiza el campo
    $(campo).value = String(g).replace('.', ',');
    if (esCerrado) { gramajeCalc = snap.gramajeCalc ?? null; tapaGramajeCalc = snap.tapaGramajeCalc ?? null; }
    calcular();
  }
  return { numero: r.numero, cerrado: esCerrado };
}

// ---------- Guardar / registro (Firebase) ----------
const col = () => FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'presupuestosTest');
$('tsGuardar').addEventListener('click', () => {
  if (!usuario || !FB) return msg('Ingresá con Google para guardar.');
  if (!ultimo || !ultimo.res.some(r => r.ok)) return msg('El presupuesto todavía no tiene precio.');
  if (!$('tsCliente').value.trim() && !$('tsTrabajo').value.trim()) return msg('Completá el cliente o el trabajo.');
  congelarPrecios();
  const { E, res } = ultimo;
  const resumen = res.filter(r => r.ok).map(r => ({ cant: r.cant, total: Math.round(r.total * 100) / 100, subtotal: Math.round(r.subtotal * 100) / 100, unitario: Math.round(r.unitario * 10000) / 10000, pm: r.pm, pc: r.pc, kilos: Math.round(r.kilos * 100) / 100 }));
  const datos = {
    fecha: $('tsFecha').value || hoy(), cliente: $('tsCliente').value.trim(), trabajo: $('tsTrabajo').value.trim(),
    clienteId: clienteActual()?.id || null, clienteDatos: datosCliente(clienteActual()),
    resumen, papel: E.base.papel.nombre, compra: `${fmt(E.base.compra.w, 0)}×${fmt(E.base.compra.h, 0)}`, tipo,
    paginas: E.rev ? E.base.revista.paginas || 0 : null,
    snapshot: snapshot(), actualizado: FB.fb.serverTimestamp(), dolar: dolar?.venta || null,
  };
  if (abierto) {
    FB.fb.updateDoc(FB.fb.doc(col(), abierto), datos).catch(e => msg('Error: ' + e.code));
    gramajeAPedidos(abierto, num($('tsGramaje').value), num($('tsTapaGramaje').value));
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
  restaurar(r.snapshot); abiertoCerrado = cerrado(r); $('tsNumero').value = r.numero || ''; abierto = r.id; verCant = 0;
  $('tsGuardar').textContent = 'Guardar cambios'; calcular(); pintarCliente(); $('tsClienteSel').value = clienteActual()?.id || ''; pintarLista();
  sec.scrollIntoView({ behavior: 'smooth' }); msg(`Presupuesto N° ${r.numero} abierto.`);
}
// ---------- Lista de guardados: pestañas por estado + tabla compacta ----------
const ESTADOS = ['Pendiente', 'Aprobado', 'Rechazado'];
let filtroEstado = '', orden = { k: 'numero', dir: -1 }, expandido = null;
try { filtroEstado = localStorage.getItem('pliego-pres-filtro') || ''; } catch (e) {}
const sinTl = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const COLS = [
  { k: 'numero', t: 'N°', v: r => r.numero || 0 },
  { k: 'fecha', t: 'Fecha', v: r => r.fecha || '', cls: 'c-fecha' },
  { k: 'cliente', t: 'Cliente', v: r => sinTl(r.cliente) },
  { k: 'trabajo', t: 'Trabajo', v: r => sinTl(r.trabajo), cls: 'c-trab' },
  { k: 'cant', t: 'Cantidad', v: r => r.resumen?.[0]?.cant || 0, cls: 'r c-cant' },
  { k: 'total', t: 'Total', v: r => r.resumen?.[0]?.total || 0, cls: 'r' },
  { k: 'estado', t: 'Estado', v: r => ESTADOS.indexOf(r.estado || 'Pendiente'), cls: 'c-est' },
];
function detalleFila(r) {
  const acciones = pidiendo === r.id
    ? `<span class="estado">Pedir papel para:</span>${(r.resumen || []).map((x, i) => `<button type="button" class="btn small" data-acc="pedido-cant" data-i="${i}">${fmt(x.cant, 0)} ej.</button>`).join('')}<button type="button" class="btn small" data-acc="no">Cancelar</button>`
    : borrando === r.id
    ? `<span class="estado">¿Borrar el N° ${esc(r.numero)}?</span><button type="button" class="btn small danger" data-acc="si">Sí, borrar</button><button type="button" class="btn small" data-acc="no">No</button>`
    : `<button type="button" class="btn small" data-acc="abrir">Abrir</button>${r.estado === 'Aprobado' ? '<button type="button" class="btn small" data-acc="pedido">Pedir papel</button>' : ''}<button type="button" class="btn small" data-acc="exportar" title="Descargar para importarlo en otra cuenta">Exportar</button><button type="button" class="btn small" data-acc="borrar">Borrar</button>`;
  const info = [r.tipo === 'revista' ? `Revista${r.paginas ? ' ' + r.paginas + ' págs.' : ''}` : '', r.papel ? 'Papel: ' + esc(r.papel) : '', r.compra && !/^0×0$/.test(r.compra) ? 'hoja ' + esc(r.compra) : ''].filter(Boolean).join(' · ');
  return `<tr class="tsr-det" data-id="${r.id}"><td colspan="${COLS.length}"><div class="tsr-det-in">
    <div class="ts-cants">${(r.resumen || []).map(x => `<span class="ts-cant"><span>${fmt(x.cant, 0)} ej.</span> <b>${pesos(x.total)}</b> <small>(${pesos(x.unitario)} c/u)</small></span>`).join('') || '<span class="ts-cant">—</span>'}</div>
    ${info ? `<div class="tsr-info">${info}</div>` : ''}
    ${avisoDolar(r)}
    <div class="acc tsr-acc"><select data-acc="estado" aria-label="Estado" class="ts-select ts-mini ts-estado ts-estado-sel ${String(r.estado || '').toLowerCase()}">${ESTADOS.map(e => `<option ${r.estado === e ? 'selected' : ''}>${e}</option>`).join('')}</select>${acciones}</div>
  </div></td></tr>`;
}
function pintarLista() {
  const q = sinTl($('tsBuscar').value);
  llenarClientes();
  const buscados = lista.filter(r => !q || sinTl([r.cliente, r.trabajo, r.numero].join(' ')).includes(q));
  const cuenta = e => buscados.filter(r => (r.estado || 'Pendiente') === e).length;
  $('tsTabs').innerHTML = [['Pendiente', 'Pendientes'], ['Aprobado', 'Aprobados'], ['Rechazado', 'Rechazados'], ['', 'Todos']]
    .map(([e, t]) => `<button type="button" class="chip${filtroEstado === e ? ' on' : ''}" aria-pressed="${filtroEstado === e}" data-f="${e}">${t}<b>${e ? cuenta(e) : buscados.length}</b></button>`).join('');
  const l = buscados.filter(r => !filtroEstado || (r.estado || 'Pendiente') === filtroEstado);
  if (!l.length) { $('tsLista').innerHTML = `<div class="pl-vacio">${!lista.length ? 'Todavía no guardaste presupuestos. Armá uno arriba y tocá "Guardar presupuesto".' : q ? 'No hay presupuestos que coincidan con la búsqueda.' : `No hay presupuestos ${filtroEstado.toLowerCase()}s.`}</div>`; return; }
  const c = COLS.find(x => x.k === orden.k) || COLS[0];
  l.sort((a, b) => { const x = c.v(a), y = c.v(b); return ((x < y ? -1 : x > y ? 1 : 0) * orden.dir) || ((b.numero || 0) - (a.numero || 0)); });
  if (pidiendo || borrando) expandido = pidiendo || borrando;
  $('tsLista').innerHTML = `<table class="ts-tabla"><thead><tr>${COLS.map(x => `<th class="${x.cls || ''}"><button type="button" data-orden="${x.k}">${x.t}${orden.k === x.k ? (orden.dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`).join('')}</tr></thead><tbody>
    ${l.map(r => {
      const p = r.resumen?.[0], est = r.estado || 'Pendiente', ab = expandido === r.id;
      return `<tr class="tsr${ab ? ' ab' : ''}${abierto === r.id ? ' editando' : ''}" data-id="${r.id}" tabindex="0" aria-expanded="${ab}">
        <td class="mono">${esc(r.numero)}</td>
        <td class="mono c-fecha">${esc(fechaTxt(r.fecha).slice(0, 5))}</td>
        <td class="c-cli"><b>${esc(r.cliente || 'Sin cliente')}</b>${abierto === r.id ? ' <small class="tsr-ed">abierto arriba</small>' : ''}${avisoDolar(r) ? ' <small class="tsr-dol" title="El dólar subió desde que se hizo">US$ ↑</small>' : ''}<small class="tsr-sub"><span class="tsr-est-m ${est.toLowerCase()}">${est}</span> · ${esc([fechaTxt(r.fecha), r.trabajo].filter(Boolean).join(' · '))}</small></td>
        <td class="c-trab mut">${esc(r.trabajo || '')}${r.tipo === 'revista' ? ' <small>(revista)</small>' : ''}</td>
        <td class="mono r c-cant">${p ? fmt(p.cant, 0) + ' ej.' : '—'}${(r.resumen || []).length > 1 ? ` <small>+${r.resumen.length - 1}</small>` : ''}</td>
        <td class="mono r">${p ? '$ ' + fmt(p.total, 0) : '—'}</td>
        <td class="c-est"><span class="tsr-est ${est.toLowerCase()}">${est}</span></td>
      </tr>${ab ? detalleFila(r) : ''}`;
    }).join('')}</tbody></table>`;
  alinearDetalle();
}
// el detalle desplegado empieza a la altura del nombre del cliente (en la compu y en el celular)
function alinearDetalle() {
  const det = $('tsLista').querySelector('.tsr-det-in'), cli = $('tsLista').querySelector('tr.tsr.ab td.c-cli');
  if (!det || !cli) return;
  det.style.paddingLeft = '0';
  det.style.paddingLeft = Math.max(0, cli.getBoundingClientRect().left - det.getBoundingClientRect().left + parseFloat(getComputedStyle(cli).paddingLeft)) + 'px';
}
window.addEventListener('resize', alinearDetalle);
$('tsBuscar').addEventListener('input', () => { expandido = null; pintarLista(); });
$('tsTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-f]'); if (!b) return;
  filtroEstado = b.dataset.f; expandido = null;
  try { localStorage.setItem('pliego-pres-filtro', filtroEstado); } catch (err) {}
  pintarLista();
});
// ordenar por columna y desplegar / plegar un renglón
$('tsLista').addEventListener('click', e => {
  const o = e.target.closest('[data-orden]');
  if (o) { const k = o.dataset.orden; orden = orden.k === k ? { k, dir: -orden.dir } : { k, dir: ['numero', 'fecha', 'total', 'cant'].includes(k) ? -1 : 1 }; pintarLista(); return; }
  const fila = e.target.closest('tr.tsr');
  if (fila && !e.target.closest('button, select, a')) { expandido = expandido === fila.dataset.id ? null : fila.dataset.id; borrando = pidiendo = null; pintarLista(); }
});
$('tsLista').addEventListener('keydown', e => {
  const fila = e.target.closest?.('tr.tsr'); if (!fila || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault(); expandido = expandido === fila.dataset.id ? null : fila.dataset.id; pintarLista();
  $('tsLista').querySelector(`tr.tsr[data-id="${fila.dataset.id}"]`)?.focus();
});

// ---------- Aviso de dólar en los presupuestos pendientes ----------
// Cada presupuesto guarda el dólar con el que se hizo. Los pendientes se recalculan con el dólar de hoy
// y, si subió más que el umbral, se avisa cuánto daría hoy y se puede actualizar con un toque.
let umbralDolar = 3; try { umbralDolar = num(localStorage.getItem('pliego-umbral-dolar') || '3') || 3; } catch (e) {}
$('tsUmbral').value = String(umbralDolar).replace('.', ',');
$('tsUmbral').addEventListener('change', () => { umbralDolar = Math.max(0, num($('tsUmbral').value)); try { localStorage.setItem('pliego-umbral-dolar', String(umbralDolar)); } catch (e) {} pintarLista(); });
const revisionDolar = new Map();   // id → { clave, viejo, nuevo, cambioTotal, res }
let historicoDolar = null;          // { 'AAAA-MM-DD': venta } para presupuestos guardados antes de esta función
async function cargarHistorico() {
  if (historicoDolar) return historicoDolar;
  try { const c = JSON.parse(localStorage.getItem('pliego-dolar-hist') || 'null'); if (c && Date.now() - c.t < 6 * 3600e3) return historicoDolar = c.m; } catch (e) {}
  try {
    const r = await fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial');
    const arr = await r.json(), m = {};
    for (const x of arr) if (x.fecha && x.venta) m[x.fecha] = x.venta;
    historicoDolar = m; try { localStorage.setItem('pliego-dolar-hist', JSON.stringify({ t: Date.now(), m })); } catch (e) {}
  } catch (e) { historicoDolar = {}; }
  return historicoDolar;
}
function dolarDelDia(fecha) {
  if (!historicoDolar || !fecha) return null;
  for (let i = 0; i < 10; i++) {   // fin de semana / feriado: el último día hábil anterior
    const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() - i);
    const v = historicoDolar[d.toISOString().slice(0, 10)]; if (v) return v;
  }
  return null;
}
function usaDolares(snap) {
  if (!snap) return false;
  if (snap.papelMon === 'USD' || snap.microMon === 'USD' || (snap.tipo === 'revista' && snap.tapaOn !== false && snap.tapaMon === 'USD')) return true;
  if (snap.maquinaFija?.moneda === 'USD' || cat.maquinas.find(m => m.id === snap.campos?.tsMaquina)?.moneda === 'USD') return true;
  return Object.entries(snap.termSel || {}).some(([id, s]) => s?.on && (cat.terminaciones.find(t => t.id === id)?.moneda === 'USD' || s.cunoMon === 'USD' || s.foilMon === 'USD'));
}
let revisarT = null;
function revisarDolar() { clearTimeout(revisarT); revisarT = setTimeout(revisarAhora, 700); }
async function revisarAhora() {
  if (!dolar?.venta || !usuario) return;
  // no recalcular mientras se escribe en el formulario
  if (sec.contains(document.activeElement) && document.activeElement.matches('input, textarea')) { revisarDolar(); return; }
  const pend = lista.filter(r => (r.estado || 'Pendiente') === 'Pendiente' && r.snapshot && r.resumen?.length && usaDolares(r.snapshot));
  if (pend.some(r => !r.dolar)) await cargarHistorico();
  let cambio = false;
  for (const r of pend) {
    const viejo = r.dolar || dolarDelDia(r.fecha);
    const clave = [r.actualizado?.seconds || 0, dolar.venta, viejo, JSON.stringify(r.resumen.map(x => x.total))].join('|');
    if (revisionDolar.get(r.id)?.clave === clave) continue;
    let res = [];
    try { res = calcularDesdeSnapshot(r.snapshot).res.filter(x => x.ok); } catch (e) {}
    const antes = r.resumen.reduce((a, x) => a + (x.total || 0), 0);
    const ahora = r.resumen.reduce((a, x) => a + (res.find(y => y.cant === x.cant)?.total || 0), 0);
    revisionDolar.set(r.id, { clave, viejo, nuevo: dolar.venta, cambioTotal: antes && ahora ? (ahora / antes - 1) * 100 : 0, res });
    cambio = true;
  }
  if (cambio) pintarLista();
}
function avisoDolar(r) {
  const v = revisionDolar.get(r.id);
  if (!v || (r.estado || 'Pendiente') !== 'Pendiente') return '';
  const subaDolar = v.viejo ? (v.nuevo / v.viejo - 1) * 100 : null;
  const avisar = subaDolar != null ? subaDolar >= umbralDolar : v.cambioTotal >= umbralDolar;
  if (!avisar || v.cambioTotal < 0.5) return '';
  const pct = x => (x >= 0 ? '+' : '') + fmt(x, 1) + ' %';
  return `<div class="ts-dolar"><span>Dólar ${v.viejo ? `${pesos(v.viejo)} → ` : 'hoy '}${pesos(v.nuevo)}${subaDolar != null ? ` (${pct(subaDolar)})` : ''}. Hecho hoy, este presupuesto daría <b>${pct(v.cambioTotal)}</b>.</span><button type="button" class="btn small" data-acc="act-dolar">Actualizar precios</button></div>`;
}
function actualizarAlDolar(r) {
  let res = [];
  try { res = calcularDesdeSnapshot(r.snapshot).res.filter(x => x.ok); } catch (e) {}
  if (!res.length) return msg('No se pudo recalcular este presupuesto.');
  const resumen = res.map(x => ({ cant: x.cant, total: Math.round(x.total * 100) / 100, subtotal: Math.round(x.subtotal * 100) / 100, unitario: Math.round(x.unitario * 10000) / 10000, pm: x.pm, pc: x.pc, kilos: Math.round(x.kilos * 100) / 100 }));
  FB.fb.updateDoc(FB.fb.doc(col(), r.id), { resumen, dolar: dolar.venta, dolarAnterior: revisionDolar.get(r.id)?.viejo || r.dolar || null, actualizado: FB.fb.serverTimestamp() })
    .then(() => msg(`Presupuesto N° ${r.numero} actualizado al dólar de hoy (${pesos(dolar.venta)}).`)).catch(e => msg('Error: ' + e.code));
}


// ---------- Exportar / importar entre cuentas (archivo .pliego) ----------
// El archivo lleva el presupuesto y lo del catálogo que usa (máquina y terminaciones, con sus precios),
// así en la otra cuenta da exactamente lo mismo aunque su catálogo sea distinto.
const QUITAR = ['id', 'creado', 'actualizado', 'clienteId'];
function exportarPresupuesto(r) {
  const snap = structuredClone(r.snapshot || {});
  const termSel = snap.termSel || {};
  const terminaciones = [];
  for (const [id, sel] of Object.entries(termSel)) {
    if (!sel?.on) continue;
    const t = cat.terminaciones.find(x => x.id === id); if (!t) continue;
    sel.precio ??= t.precio; sel.postura ??= t.postura;          // precios fijos en el archivo
    terminaciones.push(structuredClone(t));
  }
  const maqId = snap.campos?.tsMaquina, maqCat = cat.maquinas.find(x => x.id === maqId);
  if (maqCat && !(snap.maquinaFija && snap.maquinaFija.id === maqId)) snap.maquinaFija = preciosMaq(maqCat);
  const datos = Object.fromEntries(Object.entries(r).filter(([k]) => !QUITAR.includes(k)));
  const archivo = { app: 'pliego', tipo: 'presupuesto', version: 1, exportado: new Date().toISOString(),
    presupuesto: { ...datos, snapshot: snap }, catalogo: { terminaciones, maquina: maqCat ? structuredClone(maqCat) : null } };
  const nombre = `Presupuesto N${r.numero || ''} ${r.cliente || r.trabajo || ''}`.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(archivo, null, 1)], { type: 'application/json' }));
  a.download = nombre + '.pliego'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  msg(`Se descargó "${nombre}.pliego". En la otra cuenta tocá "Importar presupuesto…" y elegí ese archivo.`);
}
const mismoNombre = (a, b) => sinTc(a) === sinTc(b);
async function importarArchivo(file) {
  let data; try { data = JSON.parse(await file.text()); } catch (e) { throw new Error(`"${file.name}" no es un archivo de presupuesto válido.`); }
  const items = data?.app === 'pliego' && data.presupuesto ? [data] : Array.isArray(data?.presupuestos) ? data.presupuestos : null;
  if (!items) throw new Error(`"${file.name}" no es un presupuesto exportado desde Pliego.`);
  const agregados = [], hechos = [];
  for (const it of items) {
    const p = structuredClone(it.presupuesto), snap = p.snapshot || {}, cg = it.catalogo || {};
    // terminaciones: se busca una con el mismo nombre; si no está, se agrega al catálogo
    const nuevoSel = {};
    for (const [id, sel] of Object.entries(snap.termSel || {})) {
      const t = (cg.terminaciones || []).find(x => x.id === id) || cat.terminaciones.find(x => x.id === id);
      if (!t) continue;
      let local = cat.terminaciones.find(x => mismoNombre(x.nombre, t.nombre));
      if (!local) { local = { ...structuredClone(t), id: 'ti' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }; cat.terminaciones.push(local); agregados.push(t.nombre); }
      nuevoSel[local.id] = sel;
    }
    snap.termSel = nuevoSel;
    // máquina
    if (cg.maquina) {
      let m = cat.maquinas.find(x => mismoNombre(x.nombre, cg.maquina.nombre));
      if (!m) { m = { ...structuredClone(cg.maquina), id: 'mi' + Date.now().toString(36) }; cat.maquinas.push(m); agregados.push('máquina ' + cg.maquina.nombre); }
      snap.campos = { ...(snap.campos || {}), tsMaquina: m.id };
      snap.maquinaFija = { ...(snap.maquinaFija || preciosMaq(cg.maquina)), id: m.id };
    }
    // papeles del catálogo: solo se usa el id para el desplegable; los datos van en el presupuesto
    for (const k of ['tsPapelSel', 'tsTapaPapelSel']) if (snap.campos?.[k] && !cat.papeles.some(x => x.id === snap.campos[k])) snap.campos[k] = '';
    const numero = Math.max(lista.reduce((m, x) => Math.max(m, x.numero || 0), 0), ...hechos.map(h => h.numero)) + 1;
    snap.campos = { ...(snap.campos || {}), tsNumero: String(numero) };
    const cli = clientes.find(c => mismoNombre(c.nombre, p.cliente));
    const datos = { ...p, snapshot: snap, numero, estado: p.estado || 'Pendiente', clienteId: cli?.id || null,
      importado: { de: p.numero || null, el: new Date().toISOString() }, creado: FB.fb.serverTimestamp(), actualizado: FB.fb.serverTimestamp() };
    await FB.fb.setDoc(FB.fb.doc(col()), datos);
    hechos.push({ numero, cliente: p.cliente });
  }
  if (agregados.length) catCambiado();
  return { hechos, agregados };
}
$('tsImportar').addEventListener('click', () => { if (!usuario || !FB) return msg('Ingresá con Google para importar.'); $('tsImportarArch').click(); });
$('tsImportarArch').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  const ok = [], agregados = [];
  for (const f of files) {
    try { const r = await importarArchivo(f); ok.push(...r.hechos); agregados.push(...r.agregados); }
    catch (err) { msg(err.message); return; }
  }
  if (ok.length) msg(`Importado${ok.length > 1 ? 's' : ''}: ${ok.map(h => 'N° ' + h.numero + (h.cliente ? ' (' + h.cliente + ')' : '')).join(', ')}.${agregados.length ? ' Se agregó a tu configuración: ' + [...new Set(agregados)].join(', ') + '.' : ''}`);
});
$('tsLista').addEventListener('change', e => {
  if (e.target.dataset.acc !== 'estado') return;
  const id = e.target.closest('[data-id]').dataset.id;
  FB.fb.updateDoc(FB.fb.doc(col(), id), { estado: e.target.value }).catch(err => msg('Error: ' + err.code));
});
$('tsLista').addEventListener('click', e => {
  const b = e.target.closest('button[data-acc]'); if (!b) return;
  const id = b.closest('[data-id]')?.dataset.id, r = lista.find(x => x.id === id); if (!r) return;
  const a = b.dataset.acc;
  if (a === 'borrar') borrando = id;
  else if (a === 'no') { borrando = null; pidiendo = null; }
  else if (a === 'si') { borrando = null; if (abierto === id) abierto = null; FB.fb.deleteDoc(FB.fb.doc(col(), id)); msg('Presupuesto borrado.'); }
  else if (a === 'abrir') { abrirGuardado(r); }
  else if (a === 'exportar') { exportarPresupuesto(r); return; }
  else if (a === 'act-dolar') { actualizarAlDolar(r); return; }
  else if (a === 'pedido' || a === 'pedido-cant') {
    // se recalcula desde lo guardado (así los presupuestos viejos también piden bien el papel)
    let res = [], Er = null;
    try { const k = calcularDesdeSnapshot(r.snapshot); Er = k.E; res = k.res.filter(x => x.ok); } catch (err) {}
    if (!res.length) res = (r.resumen || []).map(x => ({ ...x, ok: true }));
    if (res.length > 1 && a === 'pedido') { pidiendo = id; pintarLista(); return; }
    const p = res[a === 'pedido-cant' ? +b.dataset.i : 0]; if (!p) return;
    pidiendo = null;
    const trab = [r.trabajo, r.cliente, fmt(p.cant, 0) + ' ej.'].filter(Boolean).join(' · ');
    // presupuesto cerrado con gramaje cambiado: los kilos a pedir van con el gramaje real
    const sn = r.snapshot || {}, real = c => num(sn.campos?.[c]);
    const fI = sn.gramajeCalc && real('tsGramaje') ? real('tsGramaje') / sn.gramajeCalc : 1, fT = sn.tapaGramajeCalc && real('tsTapaGramaje') ? real('tsTapaGramaje') / sn.tapaGramajeCalc : 1;
    window.pedidosCola = [];
    if (p.revista && Er) {
      const bt = Er.base.tapa;
      window.pedidoPendiente = { presupuestoId: r.id, parte: 'interior', formato: r.compra, material: r.papel, pliegos: p.interior.pc, kilos: Math.round(p.interior.kilos * fI * 100) / 100, trabajo: trab + ' · interior' };
      if (bt && p.tapa) window.pedidosCola = [{ formato: `${fmt(bt.compra.w, 0)}×${fmt(bt.compra.h, 0)}`, material: bt.papel.nombre, pliegos: p.tapa.pc, kilos: Math.round(p.tapa.kilos * fT * 100) / 100, trabajo: trab + ' · tapa', presupuestoId: r.id, parte: 'tapa' }];
    } else window.pedidoPendiente = { presupuestoId: r.id, formato: r.compra, material: r.papel, pliegos: p.pc, kilos: Math.round(p.kilos * fI * 100) / 100, trabajo: trab };
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
window.addEventListener('dolar-actualizado', e => { const o = e.detail?.oficial; if (o) { dolar = { ...o, chequeado: e.detail.chequeado }; calcular(); revisarDolar(); } });
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
  pedidos = [];
  if (dejarClientes) { dejarClientes(); dejarClientes = null; }
  clientes = []; llenarClientes();
  if (usuario) dejarClientes = FB.fb.onSnapshot(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'clientes'), snap => {
    clientes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => sinTc(a.nombre).localeCompare(sinTc(b.nombre)));
    llenarClientes();
  }, () => {});
  if (usuario) dejarPedidos = FB.fb.onSnapshot(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'planilla'), snap => {
    pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
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
    pintarLista(); revisarDolar();
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



// ---------- Para otras pestañas (Comparar → orden de trabajo) ----------
// Recalcula un presupuesto guardado a partir de su snapshot, sin tocar lo que hay en pantalla.
export function calcularDesdeSnapshot(snap) {
  const prev = snapshot(), prevNum = $('tsNumero').value;
  try {
    restaurar(snap);
    const E = entrada();
    const res = cantidades().map(cant => calc1(E.base, cant, margenDe(cant)));
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
