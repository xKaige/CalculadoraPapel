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

  // Terminaciones
  for (const t of e.terminaciones || []) {
    const lados = t.lados > 1 ? 2 : 1;
    const q = cantidadTerminacion(t.unidad, c) * lados;
    const precio = aPesos(t.precio || 0, t.moneda, e.dolar, faltas);
    const post = aPesos(t.postura || 0, t.moneda, e.dolar, faltas);
    const unidadCorta = { pliego: 'pl.', millarPl: 'mill. pl.', ej: 'ej.', millarEj: 'mill. ej.', m2: 'm²' }[t.unidad];
    let det = t.unidad === 'fijo' ? fmt(precio) : `${fmt(q, t.unidad === 'pliego' || t.unidad === 'ej' ? 0 : 2)} ${unidadCorta} × ${fmt(precio)}`;
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

export function fmt(v, d = 2) {
  return (v || 0).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
