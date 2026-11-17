// Pestaña "Producción": tablero de trabajos por etapa.
// Firebase: usuarios/{uid}/produccion. Lee también los presupuestos (aprobados) y la planilla (estado del papel).
const P = () => import('./presupuesto.js');

const $ = id => document.getElementById(id);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (v, d = 0) => Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fechaTxt = f => f ? f.split('-').reverse().join('/') : '';
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const diasHasta = iso => Math.round((new Date(iso + 'T12:00:00') - new Date(hoyISO() + 'T12:00:00')) / 864e5);

const ETAPAS = ['Preimpresión', 'Impresión', 'Terminación', 'Listo', 'Entregado'];
const TERMINADAS = ['Listo', 'Entregado'];

let FB = null, usuario = null, dejar = [];
let trabajos = [], presupuestos = [], planilla = [];
let editando = null, verEntregados = false, arrastrando = null;

const sec = $('produccion');
sec.innerHTML = `
  <div class="aviso" id="prAviso"><span id="prAvisoTxt">Cargando…</span></div>
  <div id="prApp" hidden>
    <div class="pr-resumen" id="prResumen"></div>

    <details class="pr-nuevos" id="prNuevos">
      <summary>Presupuestos aprobados para pasar a producción (<span id="prNuevosN">0</span>)</summary>
      <div id="prNuevosLista"></div>
    </details>
    <details class="pr-nuevos" id="prSuelto">
      <summary>Agregar un trabajo sin presupuesto</summary>
      <form id="prSueltoForm" class="grid" autocomplete="off" style="margin-top:10px">
        <div><label for="prSCliente">Cliente</label><input id="prSCliente" style="padding-right:12px" required></div>
        <div><label for="prSTrabajo">Trabajo</label><input id="prSTrabajo" style="padding-right:12px"></div>
        <div><label for="prSCant">Cantidad</label><div class="field"><input id="prSCant" inputmode="numeric"><span class="unit">ej.</span></div></div>
        <div><label for="prSEntrega">Entrega</label><input id="prSEntrega" type="date"></div>
        <div class="full actions" style="margin:0"><button type="submit" class="btn small primary">Agregar al tablero</button></div>
      </form>
    </details>

    <div class="pr-tablero" id="prTablero"></div>
    <p class="estado" style="margin-top:8px">Arrastrá las tarjetas de una columna a otra, o usá las flechas. Tocá una tarjeta para cambiar la entrega o las notas.</p>
  </div>
`;

const col = n => FB.fb.collection(FB.db, 'usuarios', usuario.uid, n);
const msg = t => { $('prResumen').dataset.msg = t; pintar(); clearTimeout(msg.t); msg.t = setTimeout(() => { delete $('prResumen').dataset.msg; pintar(); }, 5000); };

// Estado del papel: registros de la planilla vinculados al presupuesto
function papelDe(t) {
  if (!t.presupuestoId) return null;
  const regs = planilla.filter(r => r.presupuestoId === t.presupuestoId);
  if (!regs.length) return { txt: 'sin pedir', cls: 'falta' };
  const orden = ['Pendiente', 'Pedido', 'Entregado'], et = r => orden.includes(r.etapa) ? r.etapa : 'Entregado';
  const peor = regs.map(et).sort((a, b) => orden.indexOf(a) - orden.indexOf(b))[0];
  return { txt: peor === 'Entregado' ? 'en el taller' : peor.toLowerCase(), cls: peor === 'Entregado' ? 'ok' : peor === 'Pedido' ? 'pedido' : 'falta' };
}
function alerta(t) {
  if (!t.entrega || TERMINADAS.includes(t.etapa)) return null;
  const d = diasHasta(t.entrega);
  if (d < 0) return { cls: 'atrasado', txt: `atrasado ${-d} día${d === -1 ? '' : 's'}` };
  if (d === 0) return { cls: 'pronto', txt: 'entrega hoy' };
  if (d <= 2) return { cls: 'pronto', txt: d === 1 ? 'entrega mañana' : `en ${d} días` };
  return null;
}

function tarjeta(t) {
  const a = alerta(t), pa = papelDe(t), i = ETAPAS.indexOf(t.etapa);
  const abierta = editando === t.id;
  return `<div class="pr-card${a ? ' ' + a.cls : ''}${abierta ? ' abierta' : ''}" data-id="${t.id}" draggable="true">
    <div class="pr-card-top" data-acc="abrir-card">
      <b>${t.numero ? 'N° ' + esc(t.numero) + ' · ' : ''}${esc(t.cliente || 'Sin cliente')}</b>
      ${t.trabajo ? `<span>${esc(t.trabajo)}</span>` : ''}
      <span class="pr-meta">${t.cantidad ? fmtN(t.cantidad) + ' ej.' : ''}${t.entrega ? ` · entrega ${fechaTxt(t.entrega)}` : ''}</span>
      ${a ? `<span class="pr-tag ${a.cls}">${a.txt}</span>` : ''}
      ${pa && !TERMINADAS.includes(t.etapa) ? `<span class="pr-tag papel ${pa.cls}">Papel: ${pa.txt}</span>` : ''}
      ${t.notas && !abierta ? `<span class="pr-notas">${esc(t.notas)}</span>` : ''}
    </div>
    ${abierta ? `<div class="pr-edit">
      <label>Entrega<input type="date" data-k="entrega" value="${esc(t.entrega || '')}"></label>
      <label>Cantidad<input data-k="cantidad" inputmode="numeric" value="${esc(t.cantidad || '')}"></label>
      <label class="full">Notas<textarea data-k="notas" rows="2" class="ts-select">${esc(t.notas || '')}</textarea></label>
      <div class="pr-edit-acc">
        ${t.presupuestoId ? '<button type="button" class="btn small" data-acc="ver-pres">Abrir presupuesto</button>' : ''}
        <button type="button" class="btn small danger" data-acc="sacar">Sacar del tablero</button>
        <button type="button" class="btn small primary" data-acc="listo-edit">Listo</button>
      </div>
    </div>` : ''}
    <div class="pr-mover">
      <button type="button" class="btn small" data-acc="atras" ${i <= 0 ? 'disabled' : ''} aria-label="Etapa anterior">◀</button>
      <span>${esc(t.etapa)}</span>
      <button type="button" class="btn small" data-acc="adelante" ${i >= ETAPAS.length - 1 ? 'disabled' : ''} aria-label="Etapa siguiente">▶</button>
    </div>
  </div>`;
}

function pintar() {
  if (!usuario) return;
  const activos = trabajos.filter(t => t.etapa !== 'Entregado');
  const atrasados = activos.filter(t => alerta(t)?.cls === 'atrasado').length;
  const semana = activos.filter(t => t.entrega && diasHasta(t.entrega) >= 0 && diasHasta(t.entrega) <= 7).length;
  const m = $('prResumen').dataset.msg;
  $('prResumen').innerHTML = `<div><small>En producción</small><b>${activos.length}</b></div>
    <div class="${atrasados ? 'mal' : ''}"><small>Atrasados</small><b>${atrasados}</b></div>
    <div><small>Entregan esta semana</small><b>${semana}</b></div>${m ? `<p class="estado pr-msg">${esc(m)}</p>` : ''}`;

  // aprobados que todavía no están en el tablero
  const enTablero = new Set(trabajos.map(t => t.presupuestoId).filter(Boolean));
  const nuevos = presupuestos.filter(p => p.estado === 'Aprobado' && !enTablero.has(p.id));
  $('prNuevosN').textContent = nuevos.length;
  $('prNuevosLista').innerHTML = nuevos.length ? nuevos.map(p => `<div class="pr-nuevo" data-pid="${p.id}">
      <div><b>N° ${esc(p.numero)} · ${esc(p.cliente || 'Sin cliente')}</b>${p.trabajo ? ` <span class="estado">${esc(p.trabajo)}</span>` : ''}</div>
      <select class="ts-select ts-mini" data-k="cant" aria-label="Cantidad aprobada">${(p.resumen || []).map(x => `<option value="${x.cant}">${fmtN(x.cant)} ej.</option>`).join('')}</select>
      <input type="date" data-k="entrega" value="${sumarDias(hoyISO(), 7)}" aria-label="Fecha de entrega" class="ts-select ts-mini">
      <button type="button" class="btn small primary" data-acc="pasar">Pasar a producción</button>
    </div>`).join('') : '<p class="estado">No hay presupuestos aprobados pendientes. Cuando apruebes uno en Presupuesto, aparece acá.</p>';
  if (nuevos.length && !pintar.abrioNuevos) { $('prNuevos').open = true; pintar.abrioNuevos = true; }

  const orden = (a, b) => (a.entrega || '9999').localeCompare(b.entrega || '9999') || (a.numero || 0) - (b.numero || 0);
  $('prTablero').innerHTML = ETAPAS.map(et => {
    let l = trabajos.filter(t => t.etapa === et);
    let extra = '';
    if (et === 'Entregado') {
      l.sort((a, b) => (b.movido?.seconds || 0) - (a.movido?.seconds || 0));
      if (!verEntregados && l.length > 6) { extra = `<button type="button" class="btn small pr-ver" data-acc="ver-entregados">Ver los ${l.length}</button>`; l = l.slice(0, 6); }
      else if (verEntregados && l.length > 6) extra = '<button type="button" class="btn small pr-ver" data-acc="ver-entregados">Ver menos</button>';
    } else l.sort(orden);
    const n = trabajos.filter(t => t.etapa === et).length;
    return `<div class="pr-col" data-etapa="${et}"><h3>${et} <span>${n}</span></h3><div class="pr-cards">${l.map(tarjeta).join('') || '<div class="pr-vacia">—</div>'}</div>${extra}</div>`;
  }).join('');
}

function mover(t, etapa) {
  if (!t || t.etapa === etapa) return;
  const ref = FB.fb.doc(col('produccion'), t.id);
  const historial = [...(t.historial || []), { etapa, fecha: new Date().toISOString() }].slice(-30);
  t.etapa = etapa; pintar();
  FB.fb.updateDoc(ref, { etapa, historial, movido: FB.fb.serverTimestamp() }).catch(e => msg('Error: ' + e.code));
}

sec.addEventListener('click', e => {
  const b = e.target.closest('[data-acc]'); if (!b) return;
  const a = b.dataset.acc;
  if (a === 'pasar') {
    const row = b.closest('.pr-nuevo'), p = presupuestos.find(x => x.id === row.dataset.pid); if (!p) return;
    const cant = +row.querySelector('[data-k=cant]').value || null, r = (p.resumen || []).find(x => x.cant === cant);
    FB.fb.addDoc(col('produccion'), {
      presupuestoId: p.id, numero: p.numero || null, cliente: p.cliente || '', trabajo: p.trabajo || '', cantidad: cant, total: r?.total || null,
      etapa: ETAPAS[0], entrega: row.querySelector('[data-k=entrega]').value || null, notas: '',
      historial: [{ etapa: ETAPAS[0], fecha: new Date().toISOString() }], creado: FB.fb.serverTimestamp(), movido: FB.fb.serverTimestamp(),
    }).catch(err => msg('Error: ' + err.code));
    msg(`N° ${p.numero} pasó a producción.`);
    return;
  }
  if (a === 'ver-entregados') { verEntregados = !verEntregados; pintar(); return; }
  const card = b.closest('.pr-card'); if (!card) return;
  const t = trabajos.find(x => x.id === card.dataset.id); if (!t) return;
  const i = ETAPAS.indexOf(t.etapa);
  if (a === 'adelante' && i < ETAPAS.length - 1) mover(t, ETAPAS[i + 1]);
  else if (a === 'atras' && i > 0) mover(t, ETAPAS[i - 1]);
  else if (a === 'abrir-card') { editando = editando === t.id ? null : t.id; pintar(); }
  else if (a === 'listo-edit') { editando = null; pintar(); }
  else if (a === 'ver-pres') P().then(m => { if (!m.abrirPresupuesto(t.presupuestoId)) msg('No se encontró el presupuesto.'); });
  else if (a === 'sacar') {
    if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Seguro? Tocá de nuevo'; return; }
    editando = null; FB.fb.deleteDoc(FB.fb.doc(col('produccion'), t.id)); msg('Trabajo sacado del tablero.');
  }
});
// edición de entrega, cantidad y notas
sec.addEventListener('change', e => {
  const k = e.target.dataset.k, card = e.target.closest('.pr-card'); if (!k || !card) return;
  const t = trabajos.find(x => x.id === card.dataset.id); if (!t) return;
  const v = k === 'cantidad' ? (parseInt(String(e.target.value).replace(/\D/g, ''), 10) || null) : e.target.value.trim() || null;
  t[k] = v;
  FB.fb.updateDoc(FB.fb.doc(col('produccion'), t.id), { [k]: v }).catch(err => msg('Error: ' + err.code));
});
// arrastrar entre columnas
sec.addEventListener('dragstart', e => {
  const c = e.target.closest?.('.pr-card'); if (!c) return;
  arrastrando = c.dataset.id; c.classList.add('arrastrando'); e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', arrastrando); } catch (err) {}
});
sec.addEventListener('dragend', () => { arrastrando = null; sec.querySelectorAll('.pr-col.sobre, .arrastrando').forEach(x => x.classList.remove('sobre', 'arrastrando')); });
sec.addEventListener('dragover', e => { const c = e.target.closest('.pr-col'); if (!c || !arrastrando) return; e.preventDefault(); sec.querySelectorAll('.pr-col.sobre').forEach(x => x !== c && x.classList.remove('sobre')); c.classList.add('sobre'); });
sec.addEventListener('drop', e => {
  const c = e.target.closest('.pr-col'); if (!c || !arrastrando) return;
  e.preventDefault(); mover(trabajos.find(x => x.id === arrastrando), c.dataset.etapa);
});
$('prSueltoForm').addEventListener('submit', e => {
  e.preventDefault();
  const cliente = $('prSCliente').value.trim(); if (!cliente) return;
  FB.fb.addDoc(col('produccion'), {
    presupuestoId: null, numero: null, cliente, trabajo: $('prSTrabajo').value.trim(), cantidad: parseInt($('prSCant').value.replace(/\D/g, ''), 10) || null,
    etapa: ETAPAS[0], entrega: $('prSEntrega').value || null, notas: '',
    historial: [{ etapa: ETAPAS[0], fecha: new Date().toISOString() }], creado: FB.fb.serverTimestamp(), movido: FB.fb.serverTimestamp(),
  }).catch(err => msg('Error: ' + err.code));
  $('prSueltoForm').reset(); msg(`"${cliente}" agregado al tablero.`);
});

function conectar(info) {
  if (!info.listo) return;
  FB = info; usuario = info.user;
  dejar.forEach(f => f()); dejar = []; trabajos = []; presupuestos = []; planilla = [];
  $('prAviso').hidden = !!usuario; $('prApp').hidden = !usuario;
  $('prAvisoTxt').innerHTML = '<b>Ingresá con Google</b> para usar el tablero de producción.';
  if (!usuario) return;
  $('prTablero').innerHTML = '<div class="pl-vacio">Cargando…</div>';
  dejar.push(FB.fb.onSnapshot(col('produccion'), s => { trabajos = s.docs.map(d => ({ id: d.id, ...d.data() })).map(t => ({ ...t, etapa: ETAPAS.includes(t.etapa) ? t.etapa : ETAPAS[0] })); pintar(); },
    e => { $('prTablero').innerHTML = '<div class="pl-vacio">No se pudo leer (' + esc(e.code || e.message) + ').</div>'; }));
  dejar.push(FB.fb.onSnapshot(col('presupuestosTest'), s => { presupuestos = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.numero || 0) - (a.numero || 0)); pintar(); }, () => {}));
  dejar.push(FB.fb.onSnapshot(col('planilla'), s => { planilla = s.docs.map(d => ({ id: d.id, ...d.data() })); pintar(); }, () => {}));
}
window.addEventListener('pliego-auth', () => conectar(window.pliegoFB));
if (window.pliegoFB) conectar(window.pliegoFB);
// las alertas de atraso dependen del día: repintar al volver a la pestaña
document.addEventListener('visibilitychange', () => { if (!document.hidden) pintar(); });
