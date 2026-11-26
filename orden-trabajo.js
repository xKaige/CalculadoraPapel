// Orden de trabajo: documento prolijo para el taller a partir de un presupuesto guardado.
// Datos del trabajo, hoja de ruta con todos los procesos, imposición y secuencia de corte en guillotina.
import { fmt, resumenFormas } from './presupuesto-calculo.js';

const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (v, d = 0) => Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const mm = v => Number((Math.round(v * 10) / 10).toFixed(1)).toLocaleString('es-AR', { maximumFractionDigits: 1 });
const cm = v => mm(v);
const fechaTxt = f => f ? f.split('-').reverse().join('/') : '';
const pesos = v => '$ ' + fmt(v, 2);
const SVGNS = 'http://www.w3.org/2000/svg';
const EPS = 0.05;

// ---------- Secuencia de corte en guillotina ----------
// Recorre el armado y arma los cortes de lado a lado: refiles, tiras y piezas.
function bbox(rs) {
  return { x1: Math.min(...rs.map(r => r.x)), y1: Math.min(...rs.map(r => r.y)), x2: Math.max(...rs.map(r => r.x + r.w)), y2: Math.max(...rs.map(r => r.y + r.h)) };
}
function grupos(rs, eje) {
  const [p, l] = eje === 'y' ? ['y', 'h'] : ['x', 'w'];
  const gs = [];
  for (const r of [...rs].sort((a, b) => a[p] - b[p])) {
    const a = r[p], b = a + r[l], g = gs[gs.length - 1];
    if (g && a < g.max - EPS) { g.rs.push(r); g.max = Math.max(g.max, b); } else gs.push({ min: a, max: b, rs: [r] });
  }
  return gs;
}
const firma = rs => { const b = bbox(rs); return rs.map(r => [r.x - b.x1, r.y - b.y1, r.w, r.h].map(v => v.toFixed(1)).join(',')).sort().join('|'); };

function cortar(reg, rs, lineas, out, nivel, nombres) {
  const bb = bbox(rs);
  // 1) Refiles: lo que sobra alrededor del bloque
  const sob = { y2: reg.y2 - bb.y2, y1: bb.y1 - reg.y1, x1: bb.x1 - reg.x1, x2: reg.x2 - bb.x2 };
  if (sob.y1 > EPS) lineas.push({ x1: reg.x1, y1: bb.y1, x2: reg.x2, y2: bb.y1, nivel });
  if (sob.y2 > EPS) lineas.push({ x1: reg.x1, y1: bb.y2, x2: reg.x2, y2: bb.y2, nivel });
  if (sob.x1 > EPS) lineas.push({ x1: bb.x1, y1: bb.y1, x2: bb.x1, y2: bb.y2, nivel });
  if (sob.x2 > EPS) lineas.push({ x1: bb.x2, y1: bb.y1, x2: bb.x2, y2: bb.y2, nivel });
  if (out) {
    const n = nombres || { y2: 'abajo', y1: 'arriba', x1: 'a la izquierda', x2: 'a la derecha' };
    const partes = [];
    if (sob.x1 > EPS && Math.abs(sob.x1 - sob.x2) < EPS && nombres) partes.push(`${mm(sob.x1)} mm de cada costado`);
    for (const k of ['y2', 'y1', 'x1', 'x2']) {
      if (!(sob[k] > EPS)) continue;
      if ((k === 'x1' || k === 'x2') && partes.some(p => p.includes('cada costado'))) continue;
      partes.push(`${mm(sob[k])} mm ${n[k]}`);
    }
    if (partes.length) out.push(`Refilar: sacar ${partes.join(', ')}.`);
  }
  if (rs.length === 1) return;
  // 2) Separar en tiras (cortes de lado a lado)
  const gy = grupos(rs, 'y'), gx = grupos(rs, 'x');
  const eje = gy.length > 1 ? 'y' : gx.length > 1 ? 'x' : null;
  if (!eje) {
    rs.forEach(r => {
      lineas.push({ x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y, nivel: 9 }, { x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h, nivel: 9 });
      lineas.push({ x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h, nivel: 9 }, { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, nivel: 9 });
    });
    if (out) out.push('Este armado no sale con cortes de lado a lado: cortar pieza por pieza siguiendo el dibujo.');
    return;
  }
  const gs = eje === 'y' ? gy : gx;
  const largo = eje === 'y' ? bb.x2 - bb.x1 : bb.y2 - bb.y1;
  const calles = [];
  for (let i = 0; i < gs.length - 1; i++) {
    const a = gs[i].max, b = gs[i + 1].min, gap = b - a;
    for (const v of gap > EPS ? [a, b] : [a]) lineas.push(eje === 'y' ? { x1: bb.x1, y1: v, x2: bb.x2, y2: v, nivel } : { x1: v, y1: bb.y1, x2: v, y2: bb.y2, nivel });
    if (gap > EPS) calles.push(gap);
  }
  const sub = g => eje === 'y' ? { x1: bb.x1, x2: bb.x2, y1: g.min, y2: g.max } : { x1: g.min, x2: g.max, y1: bb.y1, y2: bb.y2 };
  const piezas = gs.every(g => g.rs.length === 1);
  const iguales = gs.every(g => firma(g.rs) === firma(gs[0].rs) && Math.abs((g.max - g.min) - (gs[0].max - gs[0].min)) < EPS);
  const medida = g => eje === 'y' ? `${mm(largo)} × ${mm(g.max - g.min)}` : `${mm(g.max - g.min)} × ${mm(largo)}`;
  const calleTxt = calles.length ? ` (sacando la calle de ${mm(Math.max(...calles))} mm entre ${piezas ? 'piezas' : 'tiras'})` : '';
  if (iguales) {
    if (out) out.push(`Cortar en ${gs.length} ${piezas ? 'piezas' : 'tiras'} de ${medida(gs[0])} mm${calleTxt}.`);
    gs.forEach((g, i) => {
      const s = i === 0 && out ? [] : null;
      cortar(sub(g), g.rs, lineas, s, nivel + 1);
      if (s && s.length) out.push({ t: 'Cada tira:', sub: s });
    });
  } else {
    if (out) out.push(`Separar en ${gs.length} partes${calleTxt}: ${gs.map(g => `${medida(g)} mm (${g.rs.length} pose${g.rs.length === 1 ? '' : 's'})`).join(' · ')}.`);
    const clave = g => firma(g.rs) + '#' + (g.max - g.min).toFixed(1), vistas = new Set();
    gs.forEach(g => {
      const k = clave(g), n = gs.filter(h => clave(h) === k).length;
      const s = out && !vistas.has(k) ? [] : null; vistas.add(k);
      cortar(sub(g), g.rs, lineas, s, nivel + 1);
      if (s && s.length) out.push({ t: n > 1 ? `Cada una de las ${n} partes de ${medida(g)} mm:` : `Parte de ${medida(g)} mm:`, sub: s });
    });
  }
}
export function planCorte(a) {
  if (!a || !a.rects?.length) return null;
  const lineas = [], pasos = [];
  cortar({ x1: 0, y1: 0, x2: a.W, y2: a.H }, a.rects, lineas, pasos, 0, { y2: 'del lado de la pinza', y1: 'de la cola', x1: 'del costado izquierdo', x2: 'del costado derecho' });
  const gy = grupos(a.rects, 'y'), gx = grupos(a.rects, 'x');
  const eje = gy.length > 1 ? 'y' : gx.length > 1 ? 'x' : null;
  return { lineas, pasos, eje, tiras: eje === 'y' ? gy : eje === 'x' ? gx : [] };
}
function pasosHtml(l) {
  return `<ol class="ot-cortes">${l.map(p => typeof p === 'string' ? `<li>${esc(p)}</li>` : `<li>${esc(p.t)}${pasosHtml(p.sub)}</li>`).join('')}</ol>`;
}
function svgGuillotina(a, plan, pinzaMm) {
  const { W, H, rects, E } = a, M = Math.max(W, H), pad = M * .1, fs = M * .03, sw = M * .0025;
  let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff" stroke="#111" stroke-width="${sw * 1.6}"/>`;
  if (E.b > 0) g += `<rect x="0" y="${H - E.b}" width="${W}" height="${E.b}" fill="#f6e7b0"/><text x="${W / 2}" y="${H + fs * 1.3}" font-size="${fs * .9}" text-anchor="middle" font-family="Arial,sans-serif" fill="#7a5c00">▲ pinza ${fmt(pinzaMm, 0)} mm</text>`;
  rects.forEach(r => g += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#eef3f0" stroke="none"/>`);
  for (const l of plan.lineas) {
    const fuerte = l.nivel === 0;
    g += `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#c0392b" stroke-width="${sw * (fuerte ? 1.3 : .9)}" ${fuerte ? '' : `stroke-dasharray="${fs * .45} ${fs * .25}"`}/>`;
  }
  // medidas de las tiras del primer corte, afuera del pliego
  for (const t of plan.tiras) {
    const v = mm(t.max - t.min), mid = (t.min + t.max) / 2;
    g += plan.eje === 'y'
      ? `<text x="${W + pad * .12}" y="${mid}" font-size="${fs * .85}" dominant-baseline="central" font-family="Arial,sans-serif" fill="#c0392b">${v}</text>`
      : `<text x="${mid}" y="${-pad * .15}" font-size="${fs * .85}" text-anchor="middle" font-family="Arial,sans-serif" fill="#c0392b">${v}</text>`;
  }
  g += `<text x="${W / 2}" y="${-pad * .5}" font-size="${fs}" text-anchor="middle" font-family="Arial,sans-serif" fill="#111">${cm(W / 10)} cm</text>`;
  g += `<text x="${-pad * .45}" y="${H / 2}" font-size="${fs}" text-anchor="middle" font-family="Arial,sans-serif" fill="#111" transform="rotate(-90 ${-pad * .45} ${H / 2})">${cm(H / 10)} cm</text>`;
  return `<svg xmlns="${SVGNS}" viewBox="${-pad} ${-pad} ${W + pad * 1.8} ${H + pad * 1.6}">${g}</svg>`;
}

// ---------- Hoja de ruta: todos los procesos ----------
function procesos(r, q, calc, x, extra) {
  const { E, pinza, calle } = calc, b = E.base, c = r.snapshot?.campos || {};
  const P = [], add = (p, d) => P.push([p, d]);
  const ej = E.pack ? 'cajas' : E.rev ? 'revistas' : 'ejemplares';
  const hojaCompra = (pc, papel, compra, kilos) => `Pedir ${fmtN(pc)} hojas de ${papel || 'papel'}${compra?.w ? ` de ${cm(compra.w)} × ${cm(compra.h)} cm` : ''}${kilos ? ` (${fmt(kilos, 1)} kg)` : ''}.`;
  const chapasDe = (cf, cd, misma) => misma ? Math.max(cf, cd) : cf + cd;
  const caras = (cf, cd, misma) => `${cf}/${cd}${cd > 0 ? (misma ? ' · tira y retira (misma chapa)' : ' · frente y dorso') : ''}`;
  const moldes = [];
  if (num(c.tsSacabocado) > 0 || E.pack) moldes.push(E.pack ? `sacabocado${E.porTroquel > 1 ? ` (${E.porTroquel} cajas por sacabocado)` : ''}` : 'sacabocado');
  if (num(c.tsCunoMolde) > 0) moldes.push('cuño');
  const terms = b.terminaciones.filter(t => !String(t.id).startsWith('pk-'));
  const termDet = t => [
    t.lados > 1 ? 'frente y dorso' : t.porLado ? 'solo frente' : '',
    E.rev && b.tapa ? (t.parte === 'tapa' ? 'en la tapa' : 'en el interior') : '',
    t.unidad === 'fijo' && t.unidades > 1 ? `${fmtN(t.unidades)} unidades` : '',
    t.cuno > 0 ? 'con cuño' : '', t.foil > 0 ? 'con foil' : '',
  ].filter(Boolean).join(' · ') || '—';

  if (E.rev) {
    const I = x?.interior, T = x?.tapa, tp = b.tapa;
    if (I) add('Papel interior', hojaCompra(I.pc, b.papel.nombre, b.compra, I.kilos));
    if (T && tp) add('Papel tapa', hojaCompra(T.pc, tp.papel.nombre, tp.compra, T.kilos));
    const cortes = [];
    if (I && I.piezas > 1 && b.maq) cortes.push(`Interior: cortar las ${fmtN(I.pc)} hojas en ${I.piezas} → pliegos de ${cm(b.maq.w)} × ${cm(b.maq.h)} cm.`);
    if (T && T.piezas > 1 && tp.maq) cortes.push(`Tapa: cortar las ${fmtN(T.pc)} hojas en ${T.piezas} → pliegos de ${cm(tp.maq.w)} × ${cm(tp.maq.h)} cm.`);
    if (cortes.length) add('Corte del papel', cortes.join(' '));
    if (moldes.length) add('Moldes', `Pedir / verificar ${moldes.join(' y ')} antes de terminación.`);
    add('Preimpresión / CTP', [I && x.formas ? `Interior: ${resumenFormas(x.formas)} · ${fmtN(I.chapas)} chapas · ${E.pagsCara} págs. por cara` : '', tp && tp.poses > 0 ? `Tapa: ${tp.poses} por pliego · ${chapasDe(tp.colF, tp.colD, tp.mismaChapa)} chapas` : '', `Pinza ${fmt(pinza, 0)} mm.`].filter(Boolean).join(' · '));
    if (I) add('Impresión interior', `${b.maquina?.nombre ? b.maquina.nombre + ' · ' : ''}${caras(b.colF, b.colD, b.revista?.retiracion)} · ${x.formas.length} pliego${x.formas.length === 1 ? '' : 's'} · ${fmtN(I.netos)} + ${fmtN(I.dem)} de demasía = ${fmtN(I.pm)} pliegos de máquina · ${fmtN(I.posturas)} posturas.`);
    if (T && tp) add('Impresión tapa', `${caras(tp.colF, tp.colD, tp.mismaChapa)} · ${fmtN(T.netos)} + ${fmtN(T.dem)} de demasía = ${fmtN(T.pm)} pliegos.`);
    for (const t of terms) add(t.nombre, termDet(t));
    if (x?.formas) add('Plegado y compaginado', `${x.formas.length} pliego${x.formas.length === 1 ? '' : 's'} por revista · ${fmtN(b.revista?.paginas)} páginas interiores${tp ? ' + tapa' : ''}.`);
    if (E.tw) add('Refile trilateral', `A medida final: ${mm(E.tw)} × ${mm(E.th)} mm.`);
  } else {
    if (x) add('Papel', hojaCompra(x.pc, b.papel.nombre, b.compra, x.kilos));
    if (x && x.piezas > 1 && b.maq) add('Corte del papel', `Cortar las ${fmtN(x.pc)} hojas en ${x.piezas} → ${fmtN(x.pc * x.piezas)} pliegos de ${cm(b.maq.w)} × ${cm(b.maq.h)} cm (se imprimen ${fmtN(x.pm)}). Ver dibujo.`);
    if (moldes.length) add('Moldes', `Pedir / verificar ${moldes.join(' y ')} antes de terminación.`);
    if (b.maq && E.tw) add('Preimpresión / CTP', `${E.porTroquel > 1 ? `${E.posesDibujo} sacabocado${E.posesDibujo === 1 ? '' : 's'} (${E.poses} cajas)` : `${E.poses} pose${E.poses === 1 ? '' : 's'}`} de ${mm(E.tw)} × ${mm(E.th)} mm en pliego de ${cm(b.maq.w)} × ${cm(b.maq.h)} cm · pinza ${fmt(pinza, 0)} mm${calle ? ` · calle ${mm(calle)} mm` : ''} · ${chapasDe(b.colF, b.colD, b.mismaChapa)} chapas.`);
    if (x) add('Impresión', `${b.maquina?.nombre ? b.maquina.nombre + ' · ' : ''}${caras(b.colF, b.colD, b.mismaChapa)} · ${fmtN(x.netos)} + ${fmtN(x.dem)} de demasía = ${fmtN(x.pm)} pliegos de máquina.`);
    const mc = b.micro || {};
    if (mc.precio > 0 || mc.tipo) add('Microcorrugado', `${[mc.tipo, mc.formato].filter(Boolean).join(' · ') || 'Planchas'}${x ? ` · ${fmtN(mc.planchas > 0 ? Math.ceil(mc.planchas) : x.pm)} planchas` : ''}. Laminar / pegar al impreso.`);
    for (const t of terms) add(t.nombre, termDet(t));
    if (E.pack) {
      if (!terms.some(t => /troquel/i.test(t.nombre))) add('Troquelado', x ? `${fmtN(x.pm)} pliegos con el sacabocado · ${E.poses} caja${E.poses === 1 ? '' : 's'} por pliego.` : 'Con el sacabocado.');
      for (const t of b.terminaciones.filter(t => String(t.id).startsWith('pk-'))) add(t.nombre.split(' / ')[0], t.unidad === 'millarPl' && x ? `${fmtN(x.pm)} pliegos.` : `${fmtN(q.cant)} cajas.`);
    } else if (E.tw && x) {
      add('Corte final (guillotina)', `${fmtN(x.pm)} pliegos → ${fmtN(q.cant)} ejemplares de ${mm(E.tw)} × ${mm(E.th)} mm (${E.poses} por pliego).${extra.diagrama ? ' Ver secuencia de corte.' : ''}`);
    }
  }
  add('Control y conteo', `${fmtN(q.cant)} ${ej}. Revisar color, registro y terminaciones.`);
  add('Empaque', b.cajas?.porCaja > 0 ? `${fmtN(Math.ceil(q.cant / b.cajas.porCaja))} cajas de ${fmtN(b.cajas.porCaja)} ${ej}.` : 'Empaquetar y rotular con cliente y trabajo.');
  add('Entrega', `${r.cliente || 'Cliente'} · ${extra.entrega ? fechaTxt(extra.entrega) : 'fecha a definir'}.`);
  return P;
}
const num = v => { const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; };

// ---------- El documento ----------
export async function htmlOrden(numero, r, idxCant, extra) {
  const P = await import('./presupuesto.js');
  const calc = P.calcularDesdeSnapshot(r.snapshot);
  const q = (r.resumen || [])[idxCant] || (r.resumen || [])[0];
  if (!q) throw new Error('el presupuesto no tiene cantidades');
  const { E, res, calle, pinza, imprenta: im } = calc, b = E.base;
  const x = res.find(z => z.ok && z.cant === q.cant) || res.find(z => z.ok);
  const tapa = b.tapa, ab = E.tapaAbierta;
  const datos = (E.rev ? [
    E.tw && ['Formato cerrado', `${mm(E.tw)} × ${mm(E.th)} mm`],
    ['Páginas', `${b.revista.paginas || 0} interiores${tapa ? ' + tapa' : ' (tapa incluida)'}`],
    ['Papel interior', `${b.papel.nombre || '—'} · ${b.colF}/${b.colD}`],
    tapa && ['Papel tapa', `${tapa.papel.nombre || '—'} · ${tapa.colF}/${tapa.colD}${ab ? ` · abierta ${cm(ab.w / 10)} × ${cm(ab.h / 10)} cm` : ''}`],
    b.maquina?.nombre && ['Máquina', b.maquina.nombre],
  ] : [
    E.pack && E.caja?.tipo && ['Tipo de caja', E.caja.tipo],
    E.pack && E.caja?.l && E.caja?.a && E.caja?.h && ['Caja armada', `${mm(E.caja.l)} × ${mm(E.caja.a)} × ${mm(E.caja.h)} mm (largo × ancho × alto)`],
    E.tw && [E.pack ? 'Desplegado' : 'Medida final', `${mm(E.tw)} × ${mm(E.th)} mm`],
    b.papel.nombre && ['Papel', b.papel.nombre],
    ['Colores', `${b.colF}/${b.colD}${b.colD > 0 ? (b.mismaChapa ? ' · tira y retira' : ' · frente y dorso') : ''}`],
    b.maquina?.nombre && ['Máquina', b.maquina.nombre],
    b.maq && ['Pliego de máquina', `${cm(b.maq.w)} × ${cm(b.maq.h)} cm · ${E.poses} ${E.pack ? 'cajas' : 'poses'} por pliego`],
    x && ['Pliegos a imprimir', `${fmtN(x.pm)} (${fmtN(x.netos)} + ${fmtN(x.dem)} de demasía)`],
  ]).filter(Boolean);
  const ruta = procesos(r, q, calc, x, extra);

  // Dibujos
  let figs = '';
  if (extra.diagrama && window.armadoPoses && b.maq && E.tw) {
    const arm = (maq, w, h, n) => window.armadoPoses(maq.w * 10, maq.h * 10, w, h, { pinza, calleX: calle, calleY: calle, poses: n });
    const fig = (t, svg, pie = '') => `<div class="ts-fig"><h4>${t}</h4>${svg}${pie ? `<p>${pie}</p>` : ''}</div>`;
    const partes = [];
    if (E.rev) {
      const ai = arm(b.maq, E.tw, E.th, E.pagsCara), at = tapa?.maq && ab ? arm(tapa.maq, ab.w, ab.h, tapa.poses) : null;
      if (b.compra.w && E.corte > 1) partes.push(fig(`Hoja del interior: cortar en ${E.corte}`, P.svgCompra(b.compra.w, b.compra.h, E.corte)));
      if (ai) partes.push(fig(`Imposición del interior: ${ai.rects.length} páginas por cara`, P.svgMaquina(ai, pinza, calle)));
      if (at) partes.push(fig(`Imposición de la tapa: ${at.rects.length} por pliego`, P.svgMaquina(at, pinza, calle)));
    } else {
      const a = arm(b.maq, E.tw, E.th, E.posesDibujo || E.poses);
      if (b.compra.w && E.corte > 1) partes.push(fig(`Corte de la hoja de compra en ${E.corte}`, P.svgCompra(b.compra.w, b.compra.h, E.corte), `Hoja de ${cm(b.compra.w)} × ${cm(b.compra.h)} cm → pliegos de ${cm(b.maq.w)} × ${cm(b.maq.h)} cm.`));
      if (a) partes.push(fig(`Imposición: ${a.rects.length} ${E.porTroquel > 1 ? 'sacabocados' : 'poses'} en el pliego de máquina`, P.svgMaquina(a, pinza, calle), 'Verde: derecho · rosa: girada 90°. Cotas en mm.'));
      const plan = !E.pack && a ? planCorte(a) : null;
      if (plan) partes.push(`<div class="ts-fig ot-guill"><h4>Corte final en guillotina</h4><div class="ot-guill-in"><div>${svgGuillotina(a, plan, pinza)}</div><div>${pasosHtml(plan.pasos)}<p>Resultado: ${a.rects.length} pieza${a.rects.length === 1 ? '' : 's'} de ${mm(E.tw)} × ${mm(E.th)} mm por pliego. Línea llena: primer corte · punteada: cortes siguientes. Medidas en mm.</p></div></div></div>`);
    }
    if (partes.length) figs = `<div class="ot-salto"></div><h3 class="ot-h3">Imposición y corte · OT N° ${numero}</h3><div class="ts-figs">${partes.join('')}</div>`;
  }

  return `
    <div class="ts-doc-head">
      <div><div class="ts-doc-imp">ORDEN DE TRABAJO N° ${numero}</div>
        <div class="ts-doc-sub">${[im.nombre && esc(im.nombre), 'Presupuesto N° ' + esc(r.numero), extra.ref && 'Ref. cliente: ' + esc(extra.ref)].filter(Boolean).join(' · ')}</div></div>
      <div class="ts-doc-num">Emitida: <b>${fechaTxt(extra.fecha)}</b><br><span class="ot-entrega">Entrega: <b>${extra.entrega ? fechaTxt(extra.entrega) : 'a definir'}</b></span></div>
    </div>
    <div class="ot-cliente"><div><small>Cliente</small><b>${esc(r.cliente) || '—'}</b></div><div><small>Trabajo</small><b>${esc(r.trabajo) || '—'}</b></div><div><small>Cantidad</small><b>${fmtN(q.cant)} ${E.pack ? 'cajas' : E.rev ? 'revistas' : 'ej.'}</b></div></div>
    <table class="ts-doc-spec">${datos.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    ${extra.obs ? `<div class="ot-obs"><b>Observaciones</b><br>${esc(extra.obs).replace(/\n/g, '<br>')}</div>` : ''}
    <h3 class="ot-h3">Procesos</h3>
    <table class="ts-doc-precios ot-control ot-ruta"><thead><tr><th class="ot-n">#</th><th>Proceso</th><th>Detalle</th><th class="ot-f">Fecha</th><th class="ot-f">Firma</th><th class="ot-box">OK</th></tr></thead>
      <tbody>${ruta.map(([p, d], i) => `<tr><td class="ot-n">${i + 1}</td><td><b>${esc(p)}</b></td><td>${esc(d)}</td><td class="ot-f"></td><td class="ot-f"></td><td class="ot-box">☐</td></tr>`).join('')}</tbody></table>
    ${extra.precios ? `<table class="ts-doc-precios"><thead><tr><th>Precio acordado</th><th class="r">Unitario s/IVA</th><th class="r">Total s/IVA</th><th class="r">Total c/IVA</th></tr></thead>
      <tbody><tr><td>${fmtN(q.cant)} ej.</td><td class="r">${pesos(q.unitario)}</td><td class="r">${pesos(q.subtotal)}</td><td class="r">${pesos(q.total)}</td></tr></tbody></table>` : ''}
    <div class="ot-firmas"><div>Preparó</div><div>Controló</div><div>Recibió conforme</div></div>
    ${figs}`;
}

export function imprimirOT(html, titulo) {
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

// ---------- Ventana para generar la OT desde la lista de presupuestos ----------
let FB = null, ordenes = [], dejar = null, actual = null;
function conectar(info) {
  if (dejar) { dejar(); dejar = null; }
  FB = info; ordenes = [];
  if (!info?.user) return;
  dejar = info.fb.onSnapshot(info.fb.collection(info.db, 'usuarios', info.user.uid, 'ordenes'), snap => {
    ordenes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.numero || 0) - (a.numero || 0));
    if (dlg?.open) pintarPrevias();
  });
}
window.addEventListener('pliego-auth', () => conectar(window.pliegoFB));
if (window.pliegoFB?.listo) conectar(window.pliegoFB);
export const proximoNumero = () => ordenes.reduce((m, o) => Math.max(m, o.numero || 0), 0) + 1;

let dlg = null;
const $d = s => dlg.querySelector(s);
function crearDialogo() {
  dlg = document.createElement('dialog');
  dlg.id = 'otDlg'; dlg.className = 'ot-dlg';
  dlg.innerHTML = `
    <div class="ot-dlg-head"><h2 class="sec" style="margin:0">Orden de trabajo</h2><button type="button" class="btn small" data-acc="cerrar" aria-label="Cerrar">✕</button></div>
    <p class="estado" id="otdTitulo"></p>
    <div id="otdPrevias"></div>
    <div class="grid">
      <div><label for="otdCant">Cantidad</label><select id="otdCant" class="ts-select"></select></div>
      <div><label for="otdEntrega">Fecha de entrega</label><input id="otdEntrega" type="date" style="padding-right:12px"></div>
      <div class="full"><label for="otdRef">Referencia del cliente</label><input id="otdRef" placeholder="Ej. OC 4521" style="padding-right:12px"></div>
      <div class="full"><label for="otdObs">Observaciones para producción</label><textarea id="otdObs" rows="3" class="ts-select" style="resize:vertical" placeholder="Ej. respetar pantone 485 · entregar en cajas de 500"></textarea></div>
      <label class="full ts-check"><input type="checkbox" id="otdDiagrama" checked> Incluir imposición y corte en guillotina</label>
      <label class="full ts-check"><input type="checkbox" id="otdPrecios"> Mostrar los precios</label>
      <label class="full ts-check" id="otdProcesoBox"><input type="checkbox" id="otdProceso" checked> Pasar el presupuesto a <b>En proceso</b></label>
    </div>
    <div class="actions"><button type="button" class="btn primary" data-acc="generar">Generar orden de trabajo</button><span class="estado" id="otdMsg"></span></div>
    <div id="otdWrap" hidden>
      <div id="otdDoc" class="ts-doc"></div>
      <div class="actions"><button type="button" class="btn primary" data-acc="imprimir">Imprimir / guardar PDF</button><button type="button" class="btn" data-acc="cerrar">Cerrar</button></div>
    </div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('click', async e => {
    if (e.target === dlg) { dlg.close(); return; }
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const a = b.dataset.acc;
    if (a === 'cerrar') dlg.close();
    else if (a === 'generar') generar();
    else if (a === 'imprimir') imprimirOT($d('#otdDoc').innerHTML, $d('#otdDoc .ts-doc-imp')?.textContent.replace('ORDEN DE TRABAJO', 'Orden de trabajo') || 'Orden de trabajo');
    else if (a === 'ver') {
      const o = ordenes.find(x => x.id === b.dataset.id); if (!o) return;
      $d('#otdDoc').innerHTML = o.html; $d('#otdWrap').hidden = false; $d('#otdWrap').scrollIntoView({ behavior: 'smooth' });
    }
  });
}
function pintarPrevias() {
  if (!actual) return;
  const l = ordenes.filter(o => o.presupuestoId === actual.id);
  $d('#otdPrevias').innerHTML = l.length ? `<div class="aviso ot-previas">Este presupuesto ya tiene ${l.length === 1 ? 'una orden' : l.length + ' órdenes'}: ${l.map(o => `<button type="button" class="btn small" data-acc="ver" data-id="${o.id}">Ver OT N° ${esc(o.numero)}${o.fecha ? ' · ' + fechaTxt(o.fecha) : ''}</button>`).join(' ')}</div>` : '';
}
export function abrirOrdenTrabajo(r) {
  if (!dlg) crearDialogo();
  actual = r;
  $d('#otdTitulo').textContent = `Presupuesto N° ${r.numero} · ${r.cliente || 'Sin cliente'}${r.trabajo ? ' · ' + r.trabajo : ''}`;
  $d('#otdCant').innerHTML = (r.resumen || []).map((x, i) => `<option value="${i}">${fmtN(x.cant)} ${r.tipo === 'pack' ? 'cajas' : r.tipo === 'revista' ? 'revistas' : 'ej.'}</option>`).join('');
  for (const id of ['#otdEntrega', '#otdRef', '#otdObs']) $d(id).value = '';
  const est = r.estado || 'Pendiente';
  $d('#otdProcesoBox').hidden = !['Pendiente', 'Aprobado'].includes(est);
  $d('#otdProceso').checked = true;
  $d('#otdMsg').textContent = FB?.user ? '' : 'Ingresá con Google para generar órdenes de trabajo.';
  $d('#otdWrap').hidden = true;
  pintarPrevias();
  dlg.showModal();
}
async function generar() {
  const r = actual; if (!r || !FB?.user) return;
  const hoy = new Date(); hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset());
  const extra = { fecha: hoy.toISOString().slice(0, 10), entrega: $d('#otdEntrega').value, ref: $d('#otdRef').value.trim(), obs: $d('#otdObs').value.trim(), diagrama: $d('#otdDiagrama').checked, precios: $d('#otdPrecios').checked };
  const i = +$d('#otdCant').value || 0, q = r.resumen?.[i];
  const numero = proximoNumero();
  let html;
  try { html = await htmlOrden(numero, r, i, extra); }
  catch (err) { $d('#otdMsg').textContent = 'No se pudo armar la orden: ' + (err.message || err); return; }
  $d('#otdDoc').innerHTML = html; $d('#otdWrap').hidden = false;
  const { fb, db, user } = FB;
  fb.addDoc(fb.collection(db, 'usuarios', user.uid, 'ordenes'), { numero, ...extra, cliente: r.cliente || '', trabajo: r.trabajo || '', presupuestoId: r.id, presupuestoNumero: r.numero,
    cantidad: q?.cant || 0, total: q?.total || 0, html, creado: fb.serverTimestamp() }).catch(e => $d('#otdMsg').textContent = 'Error al guardar: ' + (e.code || e.message));
  if (!$d('#otdProcesoBox').hidden && $d('#otdProceso').checked)
    fb.updateDoc(fb.doc(fb.collection(db, 'usuarios', user.uid, 'presupuestosTest'), r.id), { estado: 'En proceso' }).catch(() => {});
  $d('#otdMsg').textContent = `Orden de trabajo N° ${numero} generada y guardada.`;
  $d('#otdWrap').scrollIntoView({ behavior: 'smooth' });
}
