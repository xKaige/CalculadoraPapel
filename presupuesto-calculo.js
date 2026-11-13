// Motor de cálculo del presupuesto (pestaña Test). Funciones puras, sin DOM.
// Medidas: trabajo y pinza/calle en mm; pliegos en cm.

export const CORTES = {
  1: [1, 1], 2: [2, 1], 3: [3, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 9: [3, 3],
};

// Pliego de máquina que sale de cortar el pliego de compra en N partes
export function pliegoMaquina(cw, ch, n, manual) {
  if (!n) return manual && manual.w > 0 && manual.h > 0 ? { w: manual.w, h: manual.h } : null;
  const c = CORTES[n]; if (!c || !(cw > 0 && ch > 0)) return null;
  const largo = Math.max(cw, ch), corto = Math.min(cw, ch);
  const a = largo / c[0], b = corto / c[1];
  return { w: Math.round(Math.min(a, b) * 10) / 10, h: Math.round(Math.max(a, b) * 10) / 10 };
}

// Pliegos de máquina por pliego de compra: el corte elegido (½, ¼…) o, con "otra medida", cuántos entran
export function piezasPorCompra(cw, ch, corte, maq) {
  if (corte) return corte;
  if (!(cw > 0 && ch > 0 && maq && maq.w > 0 && maq.h > 0)) return 1;
  const e = 1e-9;
  const a = Math.floor(cw / maq.w + e) * Math.floor(ch / maq.h + e);
  const b = Math.floor(cw / maq.h + e) * Math.floor(ch / maq.w + e);
  return Math.max(1, a, b);
}

export function entraEnMaquina(pm, maq) {
  if (!pm || !maq || !(maq.anchoMax > 0 && maq.altoMax > 0)) return true;
  const A = Math.min(maq.anchoMax, maq.altoMax), B = Math.max(maq.anchoMax, maq.altoMax);
  return Math.min(pm.w, pm.h) <= A + 1e-9 && Math.max(pm.w, pm.h) <= B + 1e-9;
}

const aPesos = (precio, moneda, dolar, faltas) => {
  if (!precio) return 0;
  if (moneda === 'USD') { if (dolar > 0) return precio * dolar; faltas.dolar = true; return 0; }
  return precio;
};

// Cantidad que se cobra de una terminación según su unidad
export function cantidadTerminacion(unidad, c) {
  switch (unidad) {
    case 'pliego': return c.pm;
    case 'millarPl': return c.pm / 1000;
    case 'ej': return c.cant;
    case 'millarEj': return c.cant / 1000;
    case 'm2': return c.maqW * c.maqH / 1e4 * c.pm;
    case 'fijo': return 1;
    default: return 0;
  }
}
export const UNIDADES = {
  pliego: 'por pliego', millarPl: 'por millar de pliegos', ej: 'por ejemplar',
  millarEj: 'por millar de ejemplares', m2: 'por m²', fijo: 'precio fijo',
};

/*
 e = {
   cant, poses, colF, colD, mismaChapa,
   papel: { nombre, gramaje, precio, unidad: 'kg'|'pliego', moneda },
   compra: { w, h } (cm), corte: n, maq: { w, h } (cm, pliego de máquina),
   maquina: { nombre, chapa, postura, millar, minMillar, moneda },
   demasia: { frente, dorso, pct }   (pliegos para el frente, para el dorso si lleva, y % del tiraje)
   terminaciones: [{ nombre, unidad, precio, postura, moneda, lados }],
   otros: [{ nombre, precio, moneda }],
   cajas: { porCaja, precio, moneda },
   margen, descuento, iva, dolar
 }
*/
export function presupuestar(e) {
  const faltas = {};
  const L = [];   // líneas de costo
  const add = (grupo, nombre, detalle, sub) => { if (sub) L.push({ grupo, nombre, detalle, sub }); };
  const cant = Math.max(0, Math.floor(e.cant || 0));
  const colores = Math.max(0, (e.colF || 0) + (e.colD || 0));
  const poses = Math.max(0, Math.floor(e.poses || 0));
  const n = e.corte || 1;
  const r = { cant, poses, colores, lineas: L, faltas };
  if (!cant || !poses) return { ...r, ok: false };

  const netos = Math.ceil(cant / poses);
  const d = e.demasia || {};
  const demF = (e.colF || 0) > 0 ? Math.max(0, d.frente || 0) : 0;
  const demD = (e.colD || 0) > 0 ? Math.max(0, d.dorso || 0) : 0;
  const demP = Math.max(0, (d.pct || 0) / 100 * netos);
  const dem = Math.ceil(demF + demD + demP);
  const pm = netos + dem;                          // pliegos de máquina
  const cw = e.compra?.w || 0, ch = e.compra?.h || 0;
  // cuántos pliegos de máquina salen de cada pliego de compra
  const piezas = piezasPorCompra(cw, ch, e.corte, e.maq);
  const pc = Math.ceil(pm / piezas);               // pliegos de compra
  const g = e.papel?.gramaje || 0;
  const kilos = cw && ch && g ? cw * ch * g * pc / 1e7 : 0;
  Object.assign(r, { netos, dem, demF, demD, demP: Math.ceil(demP), pm, pc, piezas, kilos });
  const c = { cant, pm, maqW: e.maq?.w || 0, maqH: e.maq?.h || 0 };

  // Papel
  const p = e.papel || {};
  const precioPapel = aPesos(p.precio || 0, p.moneda, e.dolar, faltas);
  if (p.unidad === 'pliego') add('Papel', p.nombre || 'Papel', `${pc} pl. de compra × ${fmt(precioPapel)}`, pc * precioPapel);
  else add('Papel', p.nombre || 'Papel', `${fmt(kilos, 2)} kg × ${fmt(precioPapel)}`, kilos * precioPapel);

  // Impresión
  const m = e.maquina || {};
  if (colores) {
    const nChapas = e.mismaChapa ? Math.max(e.colF || 0, e.colD || 0) : colores;
    const chapa = aPesos(m.chapa || 0, m.moneda, e.dolar, faltas);
    const post = aPesos(m.postura || 0, m.moneda, e.dolar, faltas);
    const mil = aPesos(m.millar || 0, m.moneda, e.dolar, faltas);
    const millares = Math.max(m.minMillar || 0, pm / 1000);
    add('Impresión', 'Chapas', `${nChapas} × ${fmt(chapa)}`, nChapas * chapa);
    add('Impresión', 'Posturas', `${colores} colores × ${fmt(post)}`, colores * post);
    add('Impresión', 'Millar de impresión', `${fmt(millares, 3)} mill. × ${colores} col. × ${fmt(mil)}`, millares * colores * mil);
  }

  return cerrar(e, r, L, add, faltas, { tapa: c, interior: c });
}

// Terminaciones, microcorrugado, otros costos y totales (común a trabajos y revistas).
// ctx: { tapa, interior } → { cant, pm, maqW, maqH } sobre los que se cobra cada terminación
function cerrar(e, r, L, add, faltas, ctx) {
  const cant = r.cant, pm = ctx.interior.pm;
  for (const t of e.terminaciones || []) {
    const c = t.parte === 'interior' ? ctx.interior : ctx.tapa;
    const lados = t.lados > 1 ? 2 : 1;
    const unid = t.unidad === 'fijo' ? Math.max(1, Math.floor(t.unidades || 1)) : 1;   // precio fijo: × unidades
    const q = cantidadTerminacion(t.unidad, c) * lados * unid;
    const precio = aPesos(t.precio || 0, t.moneda, e.dolar, faltas);
    const post = aPesos(t.postura || 0, t.moneda, e.dolar, faltas);
    const unidadCorta = { pliego: 'pl.', millarPl: 'mill. pl.', ej: 'ej.', millarEj: 'mill. ej.', m2: 'm²' }[t.unidad];
    let det = t.unidad === 'fijo' ? (q > 1 ? `${fmt(q, 0)} × ${fmt(precio)}` : fmt(precio)) : `${fmt(q, t.unidad === 'pliego' || t.unidad === 'ej' ? 0 : 2)} ${unidadCorta} × ${fmt(precio)}`;
    if (post) det += ` + postura ${fmt(post)}`;
    add('Terminaciones', t.nombre + (t.lados > 1 ? ' (F y D)' : ''), det, q * precio + post);
    // Hot stamping: cuño (uno por lado) y foil (por pliego estampado)
    if (t.cuno > 0) {
      const cu = aPesos(t.cuno, t.cunoMon, e.dolar, faltas);
      add('Terminaciones', `${t.nombre}: cuño`, `${lados} × ${fmt(cu)}`, lados * cu);
    }
    if (t.foil > 0) {
      const fo = aPesos(t.foil, t.foilMon, e.dolar, faltas);
      add('Terminaciones', `${t.nombre}: foil`, `${fmt(c.pm * lados, 0)} pl. × ${fmt(fo)}`, c.pm * lados * fo);
    }
  }

  // Microcorrugado: una plancha por pliego de máquina (o la cantidad cargada a mano)
  const mc = e.micro || {};
  if (mc.precio > 0) {
    const pr = aPesos(mc.precio, mc.moneda, e.dolar, faltas);
    const planchas = mc.planchas > 0 ? Math.ceil(mc.planchas) : pm;
    add('Microcorrugado', ['Microcorrugado', mc.tipo, mc.formato].filter(Boolean).join(' · '), `${planchas} planchas × ${fmt(pr)}`, planchas * pr);
  }

  // Otros
  for (const o of e.otros || []) add('Otros', o.nombre, 'fijo', aPesos(o.precio || 0, o.moneda, e.dolar, faltas));
  const cj = e.cajas || {};
  if (cj.porCaja > 0 && cj.precio > 0) {
    const nc = Math.ceil(cant / cj.porCaja), pr = aPesos(cj.precio, cj.moneda, e.dolar, faltas);
    add('Otros', 'Cajas', `${nc} cajas × ${fmt(pr)}`, nc * pr);
  }

  const costo = L.reduce((a, x) => a + x.sub, 0);
  const ganancia = costo * (e.margen || 0) / 100;
  const neto = costo + ganancia;
  const descuento = neto * (e.descuento || 0) / 100;
  const subtotal = neto - descuento;
  const iva = subtotal * (e.iva || 0) / 100;
  const total = subtotal + iva;
  return {
    ...r, ok: true, margen: e.margen || 0, costo, ganancia, neto, descuento, subtotal, iva, total,
    unitario: subtotal / cant, unitarioIva: total / cant,
  };
}


// ---------- Revistas ----------
// Arma los pliegos (formas) del interior.
//  paginas: páginas del interior · k: páginas que entran por cara del pliego de máquina
//  retiracion: true = misma chapa para frente y dorso (cada pliego da 2 juegos)
// Cada forma: { pags, copias (juegos por pliego impreso), chapas, posturas, modo: 'fyd'|'ret' }
export function armarFormas(paginas, k, retiracion, colF, colD) {
  const P = Math.max(0, Math.floor(paginas || 0)); k = Math.max(0, Math.floor(k || 0));
  const out = []; if (!P || !k) return out;
  const fyd = colF + colD, una = Math.max(colF, colD);
  const ret = pags => { const rep = Math.max(1, Math.floor(k / pags)); return { pags, copias: 2 * rep, chapas: una, posturas: una, modo: 'ret' }; };
  if (retiracion) {
    for (let i = 0; i < Math.floor(P / k); i++) out.push(ret(k));
    if (P % k) out.push(ret(P % k));
  } else {
    for (let i = 0; i < Math.floor(P / (2 * k)); i++) out.push({ pags: 2 * k, copias: 1, chapas: fyd, posturas: fyd, modo: 'fyd' });
    const r = P % (2 * k);
    if (r) out.push(r <= k ? ret(r) : { pags: r, copias: 1, chapas: fyd, posturas: fyd, modo: 'fyd' });
  }
  return out;
}
// Agrupa formas iguales para mostrarlas: "2 pliegos de 16 págs. + 1 de 8 (retiración)"
export function resumenFormas(formas) {
  const g = [];
  for (const f of formas) { const x = g.find(y => y.pags === f.pags && y.modo === f.modo); if (x) x.n++; else g.push({ ...f, n: 1 }); }
  return g.map((x, i) => `${x.n} ${i ? 'de' : x.n === 1 ? 'pliego de' : 'pliegos de'} ${x.pags} págs.${x.modo === 'ret' ? ' en retiración' + (x.copias > 2 ? ` (${x.copias} juegos por pliego)` : '') : ''}`).join(' + ');
}

/*
 Revista: e = { ...lo mismo que presupuestar (papel, compra, corte, maq, maquina = INTERIOR),
   revista: { paginas, pagsCara, retiracion },
   tapa: null | { poses, colF, colD, papel, compra, corte, maq, maquina } }
*/
export function presupuestarRevista(e) {
  const faltas = {}, L = [];
  const add = (grupo, nombre, detalle, sub) => { if (sub) L.push({ grupo, nombre, detalle, sub }); };
  const cant = Math.max(0, Math.floor(e.cant || 0));
  const rv = e.revista || {}, colF = Math.max(0, e.colF || 0), colD = Math.max(0, e.colD || 0);
  const formas = armarFormas(rv.paginas, rv.pagsCara, rv.retiracion, colF, colD);
  const r = { cant, revista: true, lineas: L, faltas, formas, colores: colF + colD, poses: rv.pagsCara || 0 };
  if (!cant || !formas.length) return { ...r, ok: false };

  // Interior: cada forma es una tirada aparte con su demasía
  const d = e.demasia || {}, m = e.maquina || {};
  let pmI = 0, netosI = 0, demI = 0, chapas = 0, posturas = 0, pasadas = 0, millaresCol = 0;
  // posturas a máquina: cada vez que se monta el pliego (por lado; una máquina de 4 colores hace 4/0 en una sola)
  const mc = Math.max(0, m.colores || 0), vueltas = c => c > 0 ? (mc ? Math.ceil(c / mc) : 1) : 0;
  for (const f of formas) {
    f.pasadas = f.modo === 'ret' ? vueltas(Math.max(colF, colD)) : vueltas(colF) + vueltas(colD);
    pasadas += f.pasadas;
    const netos = Math.ceil(cant / f.copias);
    const dem = Math.ceil((colF > 0 ? Math.max(0, d.frente || 0) : 0) + (colD > 0 ? Math.max(0, d.dorso || 0) : 0) + Math.max(0, (d.pct || 0) / 100 * netos));
    f.netos = netos; f.dem = dem; f.pm = netos + dem;
    pmI += f.pm; netosI += netos; demI += dem; chapas += f.chapas; posturas += f.posturas;
    millaresCol += Math.max(m.minMillar || 0, f.pm / 1000) * (colF + colD);
  }
  const cw = e.compra?.w || 0, ch = e.compra?.h || 0;
  const piezas = piezasPorCompra(cw, ch, e.corte, e.maq);
  const pcI = Math.ceil(pmI / piezas);
  const kilosI = cw && ch && e.papel?.gramaje ? cw * ch * e.papel.gramaje * pcI / 1e7 : 0;
  const interior = { formas, pm: pmI, netos: netosI, dem: demI, pc: pcI, piezas, kilos: kilosI, chapas, posturas: pasadas, posturasColor: posturas };

  const p = e.papel || {}, precioPapel = aPesos(p.precio || 0, p.moneda, e.dolar, faltas);
  const nomP = 'Papel interior' + (p.nombre ? ': ' + p.nombre : '');
  if (p.unidad === 'pliego') add('Interior', nomP, `${pcI} pl. de compra × ${fmt(precioPapel)}`, pcI * precioPapel);
  else add('Interior', nomP, `${fmt(kilosI, 2)} kg × ${fmt(precioPapel)}`, kilosI * precioPapel);
  if (colF + colD) {
    const chapa = aPesos(m.chapa || 0, m.moneda, e.dolar, faltas), post = aPesos(m.postura || 0, m.moneda, e.dolar, faltas), mil = aPesos(m.millar || 0, m.moneda, e.dolar, faltas);
    add('Interior', 'Chapas', `${chapas} × ${fmt(chapa)}`, chapas * chapa);
    add('Interior', 'Posturas', `${pasadas} postura${pasadas > 1 ? 's' : ''} a máquina (${posturas} colores) × ${fmt(post)} por color`, posturas * post);
    add('Interior', 'Millar de impresión', `${fmt(millaresCol, 3)} (millares × colores, ${formas.length} pliego${formas.length > 1 ? "s" : ""}) × ${fmt(mil)}`, millaresCol * mil);
  }

  // Tapa: es un trabajo común (poses por pliego) con su propio papel
  let tapa = null;
  const t = e.tapa;
  if (t) {
    const rt = presupuestar({ cant, poses: t.poses, colF: t.colF, colD: t.colD, mismaChapa: t.mismaChapa, papel: t.papel, compra: t.compra, corte: t.corte, maq: t.maq, maquina: t.maquina || m, demasia: d, dolar: e.dolar });
    Object.assign(faltas, rt.faltas);
    if (rt.ok) {
      tapa = { pm: rt.pm, netos: rt.netos, dem: rt.dem, pc: rt.pc, piezas: rt.piezas, kilos: rt.kilos, poses: rt.poses };
      for (const l of rt.lineas) add('Tapa', l.grupo === 'Papel' ? 'Papel tapa' + (t.papel?.nombre ? ': ' + t.papel.nombre : '') : l.nombre, l.detalle, l.sub);
    } else r.tapaFalta = true;
  }

  Object.assign(r, {
    interior, tapa, piezas, netos: netosI, dem: demI,
    pm: pmI + (tapa?.pm || 0), pc: pcI + (tapa?.pc || 0), kilos: kilosI + (tapa?.kilos || 0),
  });
  const ctxI = { cant, pm: pmI, maqW: e.maq?.w || 0, maqH: e.maq?.h || 0 };
  const ctxT = tapa ? { cant, pm: tapa.pm, maqW: t.maq?.w || 0, maqH: t.maq?.h || 0 } : ctxI;
  return cerrar(e, r, L, add, faltas, { tapa: ctxT, interior: ctxI });
}

export function fmt(v, d = 2) {
  return (v || 0).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
