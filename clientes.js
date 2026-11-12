// Pestaña "Clientes": agenda de clientes y los presupuestos de cada uno.
// Firebase: usuarios/{uid}/clientes. Los presupuestos se leen de usuarios/{uid}/presupuestosTest.
// presupuesto.js se carga cuando hace falta (así Clientes no depende de que Presupuesto cargue bien)
const P = () => import('./presupuesto.js');

const $ = id => document.getElementById(id);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinT = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const fmtN = (v, d = 0) => Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fechaTxt = f => f ? f.split('-').reverse().join('/') : '';
const CAMPOS = ['nombre', 'cuit', 'iva', 'contacto', 'telefono', 'email', 'direccion', 'localidad', 'notas'];

let FB = null, usuario = null, clientes = [], presupuestos = [], dejar = [];
let editando = null, borrando = null, abiertos = new Set();

const sec = $('clientes');
sec.innerHTML = `
  <div class="aviso" id="clAviso"><span id="clAvisoTxt">Cargando…</span></div>
  <div id="clApp" hidden>
    <h2 class="sec" style="margin-top:0" id="clTitulo">Nuevo cliente</h2>
    <form id="clForm" class="grid" autocomplete="off">
      <div class="full"><label for="clNombre">Nombre o razón social</label><input id="clNombre" required placeholder="Ej. Distribuidora Norte SRL" style="padding-right:12px"></div>
      <div><label for="clCuit">CUIT</label><input id="clCuit" inputmode="numeric" placeholder="30-12345678-9" style="padding-right:12px"></div>
      <div><label for="clIva">Condición de IVA</label>
        <select id="clIva" class="ts-select"><option value="">—</option><option>Responsable Inscripto</option><option>Monotributo</option><option>Exento</option><option>Consumidor Final</option></select></div>
      <div><label for="clContacto">Contacto</label><input id="clContacto" placeholder="Persona de contacto" style="padding-right:12px"></div>
      <div><label for="clTelefono">Teléfono</label><input id="clTelefono" inputmode="tel" style="padding-right:12px"></div>
      <div class="full"><label for="clEmail">Email</label><input id="clEmail" type="email" style="padding-right:12px"></div>
      <div><label for="clDireccion">Dirección</label><input id="clDireccion" style="padding-right:12px"></div>
      <div><label for="clLocalidad">Localidad</label><input id="clLocalidad" style="padding-right:12px"></div>
      <div class="full"><label for="clNotas">Notas</label><textarea id="clNotas" rows="2" class="ts-select" style="resize:vertical" placeholder="Ej. paga a 30 días · retira por el local"></textarea></div>
      <div class="full actions" style="margin-top:2px">
        <button type="submit" class="btn primary" id="clGuardar">Guardar cliente</button>
        <button type="button" class="btn" id="clCancelar" hidden>Cancelar edición</button>
        <span class="estado" id="clMsg"></span>
      </div>
    </form>

    <h2 class="sec">Mis clientes</h2>
    <div class="field"><input id="clBuscar" placeholder="Buscar por nombre, CUIT, contacto o localidad" style="padding-right:12px"></div>
    <div class="pl-lista" id="clLista"></div>
  </div>
`;

function msg(t) { $('clMsg').textContent = t; clearTimeout(msg.t); msg.t = setTimeout(() => $('clMsg').textContent = '', 5000); }
function limpiar() {
  editando = null; $('clForm').reset();
  $('clTitulo').textContent = 'Nuevo cliente'; $('clGuardar').textContent = 'Guardar cliente'; $('clCancelar').hidden = true;
}
const idCampo = k => 'cl' + k[0].toUpperCase() + k.slice(1);

// CUIT con guiones: 30123456789 → 30-12345678-9
$('clCuit').addEventListener('blur', () => {
  const d = $('clCuit').value.replace(/\D/g, '');
  if (d.length === 11) $('clCuit').value = `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
});

$('clForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!usuario || !FB) return;
  const datos = {}; CAMPOS.forEach(k => datos[k] = $(idCampo(k)).value.trim());
  if (!datos.nombre) return msg('Poné el nombre del cliente.');
  const repetido = clientes.find(c => c.id !== editando && sinT(c.nombre) === sinT(datos.nombre));
  if (repetido) return msg(`Ya tenés un cliente llamado "${repetido.nombre}".`);
  const col = FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'clientes');
  datos.actualizado = FB.fb.serverTimestamp();
  if (editando) FB.fb.updateDoc(FB.fb.doc(col, editando), datos).catch(err => msg('Error: ' + err.code));
  else FB.fb.addDoc(col, { ...datos, creado: FB.fb.serverTimestamp() }).catch(err => msg('Error: ' + err.code));
  msg(editando ? 'Cambios guardados.' : `"${datos.nombre}" agregado.`);
  limpiar();
});
$('clCancelar').addEventListener('click', () => { limpiar(); pintar(); });
$('clBuscar').addEventListener('input', () => { window.Paginas.reset('clientes'); pintar(); });

// Presupuestos de un cliente: por el vínculo guardado, o por el mismo nombre (para los anteriores)
const presDe = c => presupuestos.filter(p => p.clienteId === c.id || (!p.clienteId && sinT(p.cliente) === sinT(c.nombre)));
const pesos = v => '$ ' + fmtN(v, 2);

function pintar() {
  const q = sinT($('clBuscar').value);
  const l = q ? clientes.filter(c => sinT([c.nombre, c.cuit, c.contacto, c.localidad, c.email].join(' ')).includes(q)) : clientes;
  if (!l.length) {
    $('clLista').innerHTML = `<div class="pl-vacio">${clientes.length ? 'No hay clientes que coincidan.' : 'Todavía no cargaste clientes. Completá el formulario de arriba.'}</div>`;
    return;
  }
  $('clLista').innerHTML = window.Paginas.html('clientes', l, c => {
    const ps = presDe(c), abierto = abiertos.has(c.id);
    const aprobados = ps.filter(p => p.estado === 'Aprobado').length;
    return `<div class="pl-item${editando === c.id ? ' editando' : ''}" data-id="${c.id}">
      <div class="t">${esc(c.nombre)}</div>
      <div class="n">${ps.length} presupuesto${ps.length === 1 ? '' : 's'}</div>
      <div class="d">${[c.cuit && 'CUIT ' + esc(c.cuit), esc(c.iva), esc(c.contacto), esc(c.telefono), esc(c.email), esc([c.direccion, c.localidad].filter(Boolean).join(', '))].filter(Boolean).join(' · ') || '<i>sin datos</i>'}</div>
      <div class="n">${aprobados ? aprobados + ' aprobado' + (aprobados > 1 ? 's' : '') : ''}</div>
      ${c.notas ? `<div class="d" style="grid-column:1/-1">${esc(c.notas)}</div>` : ''}
      ${abierto ? `<div class="cl-pres">${ps.length ? ps.map(p => `<div class="cl-p">
          <div><b>N° ${esc(p.numero)}</b> · ${fechaTxt(p.fecha)}${p.trabajo ? ' · ' + esc(p.trabajo) : ''} <span class="cl-estado ${sinT(p.estado || 'pendiente')}">${esc(p.estado || 'Pendiente')}</span></div>
          <div class="estado">${(p.resumen || []).map(x => `${fmtN(x.cant)} ej.: ${pesos(x.total)}`).join(' · ') || '—'}</div>
          <button type="button" class="btn small" data-acc="abrir-pres" data-pid="${p.id}">Abrir</button>
        </div>`).join('') : '<div class="estado">Todavía no tiene presupuestos.</div>'}</div>` : ''}
      <div class="acc">${borrando === c.id
        ? `<span class="estado">¿Borrar este cliente? Sus presupuestos no se borran.</span><button type="button" class="btn small danger" data-acc="si">Sí, borrar</button><button type="button" class="btn small" data-acc="no">No</button>`
        : `<button type="button" class="btn small" data-acc="ver">${abierto ? 'Ocultar presupuestos' : 'Ver presupuestos'}</button><button type="button" class="btn small" data-acc="nuevo-pres">Nuevo presupuesto</button><button type="button" class="btn small" data-acc="editar">Editar</button><button type="button" class="btn small" data-acc="borrar">Borrar</button>`}
      </div>
    </div>`;
  }, pintar);
}

$('clLista').addEventListener('click', e => {
  const b = e.target.closest('button[data-acc]'); if (!b) return;
  const id = b.closest('.pl-item').dataset.id, c = clientes.find(x => x.id === id); if (!c) return;
  const a = b.dataset.acc;
  if (a === 'ver') abiertos.has(id) ? abiertos.delete(id) : abiertos.add(id);
  else if (a === 'abrir-pres') { P().then(m => { if (!m.abrirPresupuesto(b.dataset.pid)) msg('No se encontró ese presupuesto.'); }).catch(err => msg('Error: ' + err.message)); return; }
  else if (a === 'nuevo-pres') { P().then(m => m.presupuestoParaCliente(c.nombre)).catch(err => msg('Error: ' + err.message)); return; }
  else if (a === 'borrar') borrando = id;
  else if (a === 'no') borrando = null;
  else if (a === 'si') { borrando = null; FB.fb.deleteDoc(FB.fb.doc(FB.fb.collection(FB.db, 'usuarios', usuario.uid, 'clientes'), id)); if (editando === id) limpiar(); msg('Cliente borrado.'); }
  else if (a === 'editar') {
    editando = id; borrando = null;
    CAMPOS.forEach(k => $(idCampo(k)).value = c[k] || '');
    $('clTitulo').textContent = 'Editar cliente'; $('clGuardar').textContent = 'Guardar cambios'; $('clCancelar').hidden = false;
    sec.scrollIntoView({ behavior: 'smooth' }); $('clNombre').focus({ preventScroll: true });
  }
  pintar();
});

function conectar(info) {
  if (!info.listo) return;   // esperar a que Google confirme la sesión
  FB = info; usuario = info.user;
  dejar.forEach(f => f()); dejar = [];
  clientes = []; presupuestos = []; limpiar();
  $('clAviso').hidden = !!usuario; $('clApp').hidden = !usuario;
  $('clAvisoTxt').innerHTML = '<b>Ingresá con Google</b> para cargar tu agenda de clientes. Cada usuario ve solo la suya.';
  if (!usuario) return;
  $('clLista').innerHTML = '<div class="pl-vacio">Cargando…</div>';
  const col = n => FB.fb.collection(FB.db, 'usuarios', usuario.uid, n);
  dejar.push(FB.fb.onSnapshot(col('clientes'), snap => {
    clientes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => sinT(a.nombre).localeCompare(sinT(b.nombre)));
    pintar();
  }, e => { $('clLista').innerHTML = '<div class="pl-vacio">No se pudo leer (' + esc(e.code || e.message) + ').</div>'; }));
  dejar.push(FB.fb.onSnapshot(col('presupuestosTest'), snap => {
    presupuestos = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.numero || 0) - (a.numero || 0));
    pintar();
  }, () => {}));
}
window.addEventListener('pliego-auth', () => conectar(window.pliegoFB));
if (window.pliegoFB) conectar(window.pliegoFB);
