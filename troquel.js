// Calculadora de sacabocado: desplegado de un estuche y armado de varias bocas encastradas.
// Todo en mm. Coordenadas con y hacia abajo; (0,0) = esquina de arriba a la izquierda de la boca.

// Partes de una boca (rectángulos para el encastre; el dibujo les redondea las puntas)
export function boca(o) {
  const { L, A, H, cierre } = o;
  const t = o.lengueta, g = o.pegado;
  const d = o.guarda > 0 ? o.guarda : guardaAuto(o);
  const fondo = o.fondo > 0 ? o.fondo : Math.round(A * 0.75);
  const W = g + 2 * L + 2 * A;
  // caras de izquierda a derecha: pegado | L1 | A1 | L2 | A2
  const x = { L1: g, A1: g + L, L2: g + L + A, A2: g + 2 * L + A };
  const arriba = [['tapa', 'L1', A, t], ['guarda', 'A1', d], ['guarda', 'A2', d]];
  const abajo = cierre === 'automatico' ? [['fondo', 'L1', fondo], ['fondo', 'A1', Math.round(A * 0.5)], ['fondo', 'L2', fondo], ['fondo', 'A2', Math.round(A * 0.5)]]
    : [['tapa', cierre === 'recto' ? 'L1' : 'L2', A, t], ['guarda', 'A1', d], ['guarda', 'A2', d]];
  const ancho = c => c[0] === 'L' ? L : A;
  const alto = p => p[0] === 'tapa' ? p[2] + p[3] : p[2];
  const T = Math.max(...arriba.map(alto)), B = Math.max(...abajo.map(alto));
  const partes = [
    { k: 'pegado', x1: 0, y1: T, x2: g, y2: T + H },
    { k: 'cuerpo', x1: g, y1: T, x2: W, y2: T + H },
  ];
  for (const p of arriba) {
    const x1 = x[p[1]], x2 = x1 + ancho(p[1]);
    if (p[0] === 'tapa') partes.push({ k: 'tapa', x1, x2, y1: T - p[2], y2: T }, { k: 'lengua', x1, x2, y1: T - p[2] - p[3], y2: T - p[2], lejos: 'y1' });
    else partes.push({ k: p[0], x1, x2, y1: T - p[2], y2: T, lejos: 'y1' });
  }
  for (const p of abajo) {
    const x1 = x[p[1]], x2 = x1 + ancho(p[1]), y = T + H;
    if (p[0] === 'tapa') partes.push({ k: 'tapa', x1, x2, y1: y, y2: y + p[2] }, { k: 'lengua', x1, x2, y1: y + p[2], y2: y + p[2] + p[3], lejos: 'y2' });
    else partes.push({ k: p[0], x1, x2, y1: y, y2: y + p[2], lejos: 'y2' });
  }
  return { W, H: T + H + B, T, cuerpoH: H, partes, guarda: d, fondo, x };
}
// Guardapolvos: lo normal (≈ 75 % del ancho) pero sin pasarse de la mitad de la tapa, así encastran
export const guardaAuto = o => Math.max(8, Math.min(Math.round(o.A * 0.75), Math.floor((o.A + o.lengueta - (o.salto || 0)) / 2)));

const girar = (b) => b.partes.map(p => ({ ...p, x1: b.W - p.x2, x2: b.W - p.x1, y1: b.H - p.y2, y2: b.H - p.y1, lejos: p.lejos === 'y1' ? 'y2' : p.lejos === 'y2' ? 'y1' : p.lejos }));
// Cuánto hay que bajar la boca de abajo (desplazada dx) para que nada quede a menos del salto
function paso(arr, aba, dx, s) {
  let P = s;
  for (const a of arr) for (const b of aba) {
    // se tocan de costado (corte compartido) está bien; si se pisan en x, tienen que quedar separadas por el salto
    if (a.x1 < b.x2 + dx - 0.5 && b.x1 + dx < a.x2 - 0.5) P = Math.max(P, a.y2 + s - b.y1);
  }
  return P;
}
// Armado de n bocas en filas × columnas, encastrando hacia abajo
export function armado(o, filas, cols) {
  const b = boca(o), s = o.salto, N = b.partes, R = girar(b);
  const sinEnc = b.H + s;
  const opciones = [];
  if (!o.encastre || filas === 1) opciones.push({ giro: false, dx: 0, pasos: Array(filas - 1).fill(sinEnc) });
  else {
    opciones.push({ giro: false, dx: 0, pasos: Array(filas - 1).fill(paso(N, N, 0, s)) });
    const dxs = new Set([0]);
    for (const a of N) for (const r of R) { dxs.add(+(a.x1 - r.x1).toFixed(1)); dxs.add(+(a.x2 - r.x2).toFixed(1)); }
    for (const dx of dxs) {
      if (Math.abs(dx) > b.W / 2) continue;
      const p1 = paso(N, R, dx, s), p2 = paso(R, N, -dx, s);
      opciones.push({ giro: true, dx, pasos: Array.from({ length: filas - 1 }, (_, i) => i % 2 ? p2 : p1) });
    }
  }
  let mejor = null;
  for (const op of opciones) {
    const alto = b.H + op.pasos.reduce((a, v) => a + v, 0);
    const corr = op.giro && filas > 1 ? Math.abs(op.dx) : 0;
    const ancho = cols * b.W + (cols - 1) * s + corr;
    const r = { ...op, ancho, alto, area: ancho * alto };
    if (!mejor || r.area < mejor.area - 1e-6) mejor = r;
  }
  // posiciones de cada boca
  const minDx = mejor.giro ? Math.min(0, mejor.dx) : 0;
  const bocas = [];
  let y = 0;
  for (let f = 0; f < filas; f++) {
    const giro = mejor.giro && f % 2 === 1, ox = (giro ? mejor.dx : 0) - minDx;
    for (let c = 0; c < cols; c++) bocas.push({ x: ox + c * (b.W + s), y, giro });
    y += mejor.pasos[f] || 0;
  }
  const sin = { ancho: cols * b.W + (cols - 1) * s, alto: filas * b.H + (filas - 1) * s };
  return { boca: b, filas, cols, ...mejor, bocas, sin };
}
export function todasLasOpciones(o) {
  const n = Math.max(1, Math.floor(o.bocas) || 1), l = [];
  for (let f = 1; f <= n; f++) if (n % f === 0) l.push(armado(o, f, n / f));
  // menos papel primero, pero castigando los armados muy alargados (más difíciles de ubicar en el pliego)
  const nota = r => r.area * (1 + 0.1 * Math.max(0, Math.max(r.ancho, r.alto) / Math.min(r.ancho, r.alto) - 2));
  return l.sort((a, b) => nota(a) - nota(b));
}

// ---------- Dibujo ----------
const n1 = v => Number((Math.round(v * 10) / 10).toFixed(1)).toLocaleString('es-AR', { maximumFractionDigits: 1 });
const COL = { cuerpo: '#e7efe9', pegado: '#d9e6dd', tapa: '#dfe9f3', lengua: '#cfdff0', guarda: '#f3ead6', fondo: '#efe0d6' };
function forma(p) {
  const w = p.x2 - p.x1, h = p.y2 - p.y1;
  if (p.k === 'lengua' || p.k === 'guarda' || p.k === 'fondo') {
    const c = p.k === 'lengua' ? Math.min(h * 0.7, w * 0.25, 8) : Math.min(w * 0.18, h * 0.5);
    const [ya, yb] = p.lejos === 'y1' ? [p.y2, p.y1] : [p.y1, p.y2];
    if (p.k === 'lengua') {
      const s = p.lejos === 'y1' ? -1 : 1;
      return `<path d="M${p.x1},${ya} L${p.x1},${yb - s * c} Q${p.x1},${yb} ${p.x1 + c},${yb} L${p.x2 - c},${yb} Q${p.x2},${yb} ${p.x2},${yb - s * c} L${p.x2},${ya} Z"/>`;
    }
    return `<path d="M${p.x1 + 0.6},${ya} L${p.x1 + c},${yb} L${p.x2 - c},${yb} L${p.x2 - 0.6},${ya} Z"/>`;
  }
  if (p.k === 'pegado') { const c = Math.min(w * 0.8, h * 0.15); return `<path d="M${p.x2},${p.y1} L${p.x1},${p.y1 + c} L${p.x1},${p.y2 - c} L${p.x2},${p.y2} Z"/>`; }
  return `<rect x="${p.x1}" y="${p.y1}" width="${w}" height="${h}"/>`;
}
function dibujoBoca(b, sw) {
  let g = '';
  for (const p of b.partes) g += `<g fill="${COL[p.k]}" stroke="#1d2b24" stroke-width="${sw}">${forma(p)}</g>`;
  // pliegues: caras del cuerpo y unión cuerpo/solapas, tapa/lengüeta
  const pl = [];
  for (const k of ['L1', 'A1', 'L2', 'A2']) pl.push([b.x[k], b.T, b.x[k], b.T + b.cuerpoH]);
  for (const p of b.partes) {
    if (p.k === 'cuerpo' || p.k === 'pegado' || p.k === 'tapa') continue;
    pl.push([p.x1, p.lejos === 'y1' ? p.y2 : p.y1, p.x2, p.lejos === 'y1' ? p.y2 : p.y1]);
  }
  const tapas = b.partes.filter(p => p.k === 'tapa');
  for (const p of tapas) pl.push([p.x1, p.y1 === b.T + b.cuerpoH ? p.y1 : p.y2, p.x2, p.y1 === b.T + b.cuerpoH ? p.y1 : p.y2]);
  for (const [x1, y1, x2, y2] of pl) g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${sw * 1.4}"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c0392b" stroke-width="${sw}" stroke-dasharray="${sw * 5} ${sw * 3}"/>`;
  return g;
}
export function svgArmado(r, u = 'mm') {
  const med = v => u === 'cm' ? (Math.round(v) / 10).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' cm' : n1(v) + ' mm';
  const { boca: b, ancho, alto } = r, M = Math.max(ancho, alto), pad = M * 0.09, fs = M * 0.03, sw = M * 0.0018;
  let g = `<rect x="0" y="0" width="${ancho}" height="${alto}" fill="none" stroke="#888" stroke-width="${sw}" stroke-dasharray="${sw * 4} ${sw * 4}"/>`;
  r.bocas.forEach((p, i) => {
    const tr = `translate(${p.x} ${p.y})` + (p.giro ? ` rotate(180 ${b.W / 2} ${b.H / 2})` : '');
    g += `<g transform="${tr}">${dibujoBoca(b, sw)}</g>`;
    g += `<text x="${p.x + b.W / 2}" y="${p.y + (p.giro ? b.H - b.T - b.cuerpoH / 2 : b.T + b.cuerpoH / 2)}" font-size="${Math.min(b.W, b.cuerpoH) * 0.16}" text-anchor="middle" dominant-baseline="central" fill="#2f6b4f" font-family="Arial,sans-serif" font-weight="700">${i + 1}</text>`;
  });
  g += `<text x="${ancho / 2}" y="${-pad * 0.4}" font-size="${fs}" text-anchor="middle" font-family="Arial,sans-serif" fill="currentColor">${med(ancho)}</text>`;
  g += `<text x="${-pad * 0.4}" y="${alto / 2}" font-size="${fs}" text-anchor="middle" font-family="Arial,sans-serif" fill="currentColor" transform="rotate(-90 ${-pad * 0.4} ${alto / 2})">${med(alto)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${ancho + pad * 1.6} ${alto + pad * 1.6}" role="img" aria-label="Armado del sacabocado">${g}</svg>`;
}
export const fmtMm = n1;
