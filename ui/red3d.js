/* ============================================================================
   Red de galerias en 3D.

   Lee datos/red.json (nodos, tramos, curvas, ruta) y construye:
     - el eje de cada tramo como rectas y arcos (las esquinas se redondean);
     - el volumen excavado: cada tramo se barre con su seccion y las piezas se
       unen con operaciones booleanas, de modo que las intersecciones quedan
       limpias; la malla se ve por dentro (cara interior);
     - la revision de curvas: franja barrida y cota, tenida si no entra;
     - la ruta del scoop como funcion de la distancia recorrida.

   Planta: x este, y norte, z cota. En three: X = x, Y = z, Z = -y.
   La revision numerica viene del motor (engine/red.py); aqui solo se dibuja.
   ========================================================================= */
import * as THREE from "three";
import { Brush, Evaluator, ADDITION } from "three-bvh-csg";
import { MeshBVH } from "three-mesh-bvh";

const RECTO = 1e-3;                       // rad: igual que engine/red.py
const lerp = (a, b, u) => a + (b - a) * u;
const acota = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------ eje: rectas y arcos --- */
/**
 * Poligonal con esquinas redondeadas. `pts` = [{x, y, z}], `radios` por nodo.
 * La cota es lineal entre nodos sobre la longitud desarrollada; un nodo de
 * esquina tiene la cota del punto medio de su arco.
 */
export function trayecto(pts, radios) {
  const n = pts.length;
  const dir = [], lenBorde = [], tang = new Array(n).fill(0), giro = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
    const l = Math.hypot(dx, dy);
    lenBorde.push(l); dir.push([dx / l, dy / l]);
  }
  for (let i = 1; i < n - 1; i++) {
    const u = dir[i - 1], v = dir[i];
    const d = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
    if (Math.abs(d) < RECTO || !radios[i]) continue;
    giro[i] = d;
    tang[i] = Math.min(radios[i] * Math.tan(Math.abs(d) / 2),
                       lenBorde[i - 1] / 2, lenBorde[i] / 2);
  }

  const elems = [], lineas = [], arcos = new Array(n).fill(null), est = [0];
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = [pts[i].x + dir[i][0] * tang[i], pts[i].y + dir[i][1] * tang[i]];
    const len = Math.max(0, lenBorde[i] - tang[i] - tang[i + 1]);
    const ln = { t: "L", i, a, d: dir[i], s0: s, len, rumbo: Math.atan2(dir[i][1], dir[i][0]) };
    elems.push(ln); lineas.push(ln); s += len;
    if (i + 1 < n - 1 && giro[i + 1]) {
      const d = giro[i + 1], sg = Math.sign(d);
      const R = tang[i + 1] / Math.tan(Math.abs(d) / 2);
      const p = [a[0] + dir[i][0] * len, a[1] + dir[i][1] * len];
      const c = [p[0] - dir[i][1] * R * sg, p[1] + dir[i][0] * R * sg];
      const ar = { t: "A", i: i + 1, c, R, sg, a0: Math.atan2(p[1] - c[1], p[0] - c[0]),
                   da: d, s0: s, len: R * Math.abs(d), rumbo0: ln.rumbo };
      elems.push(ar); arcos[i + 1] = ar;
      est.push(s + ar.len / 2); s += ar.len;
    } else if (i + 1 < n - 1) {
      est.push(s);
    }
  }
  est.push(s);

  const tr = {
    pts, elems, lineas, arcos, tang, lenBorde, est, largo: s,
    nudos: est.map((e, i) => [e, pts[i].z]),

    z(q) {
      const k = this.nudos;
      if (q <= k[0][0]) return k[0][1];
      for (let i = 1; i < k.length; i++) {
        if (q <= k[i][0]) {
          const w = k[i][0] - k[i - 1][0];
          return w < 1e-9 ? k[i][1] : lerp(k[i - 1][1], k[i][1], (q - k[i - 1][0]) / w);
        }
      }
      return k[k.length - 1][1];
    },

    /** Estacion del punto a distancia q (en planta) del nodo i hacia el i+1. */
    sEnBorde(i, q) { return lineas[i].s0 + (q - tang[i]); },

    elemEn(q) {
      for (const e of elems) if (q <= e.s0 + e.len) return e;
      return elems[elems.length - 1];
    },

    /** Punto, rumbo y cota en la estacion q. Fuera de los extremos, extrapola recto. */
    en(q) {
      let e = this.elemEn(q);
      if (q < 0) e = elems[0];
      if (e.t === "A") {
        const u = acota((q - e.s0) / e.len);
        const ang = e.a0 + e.da * u;
        return { x: e.c[0] + e.R * Math.cos(ang), y: e.c[1] + e.R * Math.sin(ang),
                 z: this.z(q), rumbo: e.rumbo0 + e.da * u, elem: e };
      }
      const l = q - e.s0;
      return { x: e.a[0] + e.d[0] * l, y: e.a[1] + e.d[1] * l,
               z: this.z(q), rumbo: e.rumbo, elem: e };
    },
  };
  return tr;
}

/* ------------------------------------------------ red ------------------- */
export class Red {
  constructor(doc, secciones) {
    this.doc = doc;
    this.nodos = Object.fromEntries(doc.nodos.map(n => [n.id, n]));
    this.secs = Object.fromEntries((secciones || []).map(s => [s.clave, s]));
    this.bordes = new Map();
    this.tramos = doc.tramos.map((t, k) => {
      const tramo = { ...t, k, tr: this._tray(t.nodos), sec: this.secs[t.seccion] };
      t.nodos.slice(0, -1).forEach((a, i) => {
        const b = t.nodos[i + 1];
        this.bordes.set(a + "|" + b, { t: tramo, i, inv: false });
        this.bordes.set(b + "|" + a, { t: tramo, i, inv: true });
      });
      return tramo;
    });
  }

  curvaEn(a, b, c) {
    return this.doc.curvas.find(cv => cv.nodo === b
      && ((cv.entre[0] === a && cv.entre[1] === c) || (cv.entre[0] === c && cv.entre[1] === a)));
  }

  _tray(ids) {
    const radios = ids.map((id, i) => (i > 0 && i < ids.length - 1
      ? ((this.curvaEn(ids[i - 1], id, ids[i + 1]) || {}).radio_m || 0) : 0));
    const tr = trayecto(ids.map(i => this.nodos[i]), radios);
    tr.ids = ids;
    return tr;
  }

  secDe(a, b) { return this.bordes.get(a + "|" + b).t.sec; }

  /** Cota del piso del tramo en el borde a-b, a distancia q de a. */
  zEnBorde(a, b, q) {
    const { t, i, inv } = this.bordes.get(a + "|" + b);
    return t.tr.z(t.tr.sEnBorde(i, inv ? t.tr.lenBorde[i] - q : q));
  }

  /**
   * Eje de una ruta que cruza tramos. En las rectas toma la cota del tramo;
   * en los arcos de interseccion la reparte linealmente entre sus extremos.
   */
  ruta(ids) {
    const tr = this._tray(ids);
    const nudos = [];
    tr.lineas.forEach((ln, i) => {
      const q0 = tr.tang[i], q1 = tr.lenBorde[i] - tr.tang[i + 1];
      nudos.push([ln.s0, this.zEnBorde(ids[i], ids[i + 1], q0)],
                 [ln.s0 + ln.len, this.zEnBorde(ids[i], ids[i + 1], q1)]);
    });
    tr.nudos = nudos;
    return tr;
  }

  /** true si la curva es una esquina interior de un solo tramo. */
  enTramo(cv) {
    const p = this.bordes.get(cv.entre[0] + "|" + cv.nodo);
    const q = this.bordes.get(cv.nodo + "|" + cv.entre[1]);
    return p.t === q.t;
  }
}

/* ------------------------------------------------ seccion --------------- */
/**
 * Perfil cerrado de la seccion, antihorario, con el piso primero.
 *   boveda     hastiales rectos y techo de medio punto rebajado
 *   herradura  hastiales levemente curvos y techo semicircular
 */
const NW = 3, NR = 12;
export function perfil(tipo, w, h) {
  const P = [[-w / 2, 0], [w / 2, 0]];
  const herr = tipo === "herradura";
  const hw = herr ? Math.max(h - w / 2, h * 0.45) : h * 0.68;
  const panza = v => (herr ? 1 + 0.03 * Math.sin(Math.PI * v / hw) : 1);
  for (let k = 1; k <= NW; k++) { const v = hw * k / (NW + 1); P.push([w / 2 * panza(v), v]); }
  for (let j = 0; j <= NR; j++) {
    const t = Math.PI * j / NR;
    P.push([w / 2 * Math.cos(t), hw + (h - hw) * Math.sin(t)]);
  }
  for (let k = NW; k >= 1; k--) { const v = hw * k / (NW + 1); P.push([-w / 2 * panza(v), v]); }
  return P;
}

/** Punto del perfil (u lateral a la derecha, v vertical) en coordenadas three. */
function aTres(e, u, v, out) {
  const rx = Math.sin(e.rumbo), ry = -Math.cos(e.rumbo);
  return out.set(e.x + rx * u, e.z + v, -(e.y + ry * u));
}

function estaciones(tr, s0, s1, paso) {
  const cortes = [s0];
  tr.elems.forEach(e => {
    [e.s0, e.s0 + e.len].forEach(q => { if (q > s0 + 1e-6 && q < s1 - 1e-6) cortes.push(q); });
  });
  cortes.push(s1);
  cortes.sort((a, b) => a - b);
  const out = [s0];
  for (let i = 1; i < cortes.length; i++) {
    const a = cortes[i - 1], b = cortes[i];
    if (b - a < 1e-6) continue;
    const e = tr.elemEn((a + b) / 2);
    const p = e.t === "A" ? Math.min(paso, e.R * 0.11) : paso;
    const n = Math.max(1, Math.ceil((b - a) / p));
    for (let k = 1; k <= n; k++) out.push(a + (b - a) * k / n);
  }
  return out;
}

/**
 * Barre la seccion a lo largo del eje. El perfil se mantiene vertical y el
 * piso horizontal a lo ancho: por eso no se usa ExtrudeGeometry, que lo tuerce.
 * secFn(s) -> { w, h, dz, tipo }. Devuelve un solido cerrado.
 */
function barrer(tr, s0, s1, secFn, paso = 1.0) {
  const ss = estaciones(tr, s0, s1, paso);
  const v = new THREE.Vector3();
  const pos = [], idx = [];
  let N = 0;
  ss.forEach(s => {
    const e = tr.en(s), sec = secFn(s);
    const P = perfil(sec.tipo, sec.w, sec.h);
    N = P.length;
    P.forEach(([u, w]) => { aTres(e, u, w + (sec.dz || 0), v); pos.push(v.x, v.y, v.z); });
  });
  const K = ss.length;
  for (let k = 0; k < K - 1; k++) for (let j = 0; j < N; j++) {
    const a = k * N + j, b = k * N + (j + 1) % N, c = a + N, d = b + N;
    idx.push(a, d, b, a, c, d);
  }
  // tapas
  [[0, ss[0]], [K - 1, ss[K - 1]]].forEach(([k, s], lado) => {
    const e = tr.en(s), sec = secFn(s);
    aTres(e, 0, sec.h * 0.45 + (sec.dz || 0), v);
    const c = pos.length / 3; pos.push(v.x, v.y, v.z);
    for (let j = 0; j < N; j++) {
      const a = k * N + j, b = k * N + (j + 1) % N;
      if (lado === 0) idx.push(c, a, b); else idx.push(c, b, a);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // normales hacia afuera: si el volumen con signo sale negativo, se invierte
  let vol = 0;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    A.fromArray(pos, idx[i] * 3); B.fromArray(pos, idx[i + 1] * 3); C.fromArray(pos, idx[i + 2] * 3);
    vol += A.dot(B.cross(C));
  }
  if (vol < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); }
  g.computeVertexNormals();
  return g;
}

/** Arcos de seccion (hastiales y techo, sin piso) como segmentos sueltos. */
function arcosDeSeccion(tr, s0, s1, secFn, cada, destino) {
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const n = Math.max(1, Math.round((s1 - s0) / cada));
  for (let k = 0; k <= n; k++) {
    const s = s0 + (s1 - s0) * k / n, e = tr.en(s), sec = secFn(s);
    const P = perfil(sec.tipo, sec.w, sec.h);
    for (let j = 1; j < P.length; j++) {
      const q = P[(j + 1) % P.length];
      aTres(e, P[j][0], P[j][1] + (sec.dz || 0), v);
      aTres(e, q[0], q[1] + (sec.dz || 0), w);
      destino.push(v.x, v.y, v.z, w.x, w.y, w.z);
    }
  }
}

/* ------------------------------------------------ construccion ---------- */
const ENSANCHE = 3.0;        // m en que el sobreancho entra y sale de la curva

/**
 * Construye la red completa. `util` trae lo que comparte con render3d.js:
 * { p (paleta), etiqueta, MAT, claro }.
 */
export function construirRed(red, eq, ctx, util) {
  const { p, MAT, claro } = util;
  const rotulos = [];
  const etiqueta = (...a) => { const e = util.etiqueta(...a); rotulos.push(e); return e; };
  const rev = (ctx.red && ctx.red.revision) || {};
  const grupo = new THREE.Group();
  const W = eq.ancho_mm / 1000;

  // ---- secciones a lo largo de cada tramo, con sobreancho en sus curvas
  const secTramo = t => {
    const curvas = [];
    t.tr.arcos.forEach((ar, i) => {
      if (!ar) return;
      const cv = red.curvaEn(t.nodos[i - 1], t.nodos[i], t.nodos[i + 1]);
      if (cv && cv.sobreancho_mm) curvas.push({ ar, sob: cv.sobreancho_mm / 1000 });
    });
    const w0 = t.sec.ancho_mm / 1000, h0 = t.sec.alto_mm / 1000;
    return s => {
      let w = w0;
      curvas.forEach(({ ar, sob }) => {
        const fuera = Math.max(ar.s0 - s, s - ar.s0 - ar.len, 0);
        w += sob * acota(1 - fuera / ENSANCHE);
      });
      // cada tramo lleva un desfase minimo para que no haya caras coplanares
      return { w, h: h0 - 0.015 * t.k, dz: -0.004 * t.k, tipo: t.perfil || "boveda" };
    };
  };

  const solidos = [];
  const anillosOk = [], anillosMal = [];
  red.tramos.forEach(t => {
    const fn = secTramo(t);
    solidos.push(barrer(t.tr, 0, t.tr.largo, fn));
    arcosDeSeccion(t.tr, 0, t.tr.largo, fn, 2.4, anillosOk);
  });

  // ---- curvas: enlace en las intersecciones, franja barrida y cota
  const sobrecapa = new THREE.Group();
  red.doc.curvas.forEach(cv => {
    const [a, c] = cv.entre, b = cv.nodo;
    const tr = red.ruta([a, b, c]);
    const ar = tr.arcos[1];
    if (!ar) return;
    const r = rev[cv.id];
    const cabe = !r || r.cabe;
    const sa = red.secDe(a, b), sc = red.secDe(b, c);
    const sob = (cv.sobreancho_mm || 0) / 1000;
    const tipo = (red.bordes.get(a + "|" + b).t.perfil) || "boveda";
    const fn = s => {
      const u = acota((s - ar.s0) / ar.len);
      const fuera = Math.max(ar.s0 - s, s - ar.s0 - ar.len, 0);
      const dentro = acota(1 - fuera / 2.0);
      return { w: lerp(sa.ancho_mm, sc.ancho_mm, u) / 1000 - 0.05 + (sob + 0.08) * dentro,
               h: lerp(sa.alto_mm, sc.alto_mm, u) / 1000 - 0.05, dz: -0.02, tipo };
    };
    const s0 = Math.max(0.2, ar.s0 - 2.0), s1 = Math.min(tr.largo - 0.2, ar.s0 + ar.len + 2.0);
    if (!red.enTramo(cv)) {
      solidos.push(barrer(tr, s0, s1, fn, 0.8));
      arcosDeSeccion(tr, ar.s0, ar.s0 + ar.len, fn, 1.6, cabe ? anillosOk : anillosMal);
    } else if (!cabe) {
      arcosDeSeccion(tr, ar.s0, ar.s0 + ar.len, fn, 1.2, anillosMal);
    }

    // franja que barre el equipo: del borde interior hacia afuera
    if (r) {
      const barrido = r.ancho_barrido_mm / 1000;
      const lado = ar.da > 0 ? 1 : -1;              // curva a la izquierda: afuera es la derecha
      const col = new THREE.Color(cabe ? p.ok : p.bad);
      const pos = [], v = new THREE.Vector3();
      const n = Math.max(6, Math.ceil(ar.len / 0.6));
      for (let k = 0; k <= n; k++) {
        const e = tr.en(ar.s0 + ar.len * k / n);
        aTres(e, -W / 2 * lado, 0.05, v); pos.push(v.x, v.y, v.z);
        aTres(e, (barrido - W / 2) * lado, 0.05, v); pos.push(v.x, v.y, v.z);
      }
      const idx = [];
      for (let k = 0; k < n; k++) { const i = k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      sobrecapa.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: cabe ? 0.22 : 0.5,
        side: THREE.DoubleSide, depthWrite: false })));

      const m = (v2) => (v2 / 1000).toFixed(2);
      const texto = !r.gira
        ? `R ${cv.radio_m} m < giro minimo ${r.radio_min_m.toFixed(1)} m`
        : `R ${cv.radio_m} m · pide ${m(r.ancho_req_mm)} · hay ${m(r.ancho_disp_mm)} m`;
      const et = etiqueta(texto, cabe ? p.apagado : p.bad, cabe ? 1.0 : 1.35);
      const em = tr.en(ar.s0 + ar.len / 2);
      aTres(em, 0, Math.max(sa.alto_mm, sc.alto_mm) / 1000 + 0.7, et.position);
      sobrecapa.add(et);
    }
  });

  // ---- union booleana de todos los volumenes
  let geo = null;
  try {
    const ev = new Evaluator();
    ev.attributes = ["position", "normal"];
    ev.useGroups = false;
    let acum = new Brush(solidos[0]);
    acum.updateMatrixWorld();
    for (let i = 1; i < solidos.length; i++) {
      const b = new Brush(solidos[i]);
      b.updateMatrixWorld();
      acum = ev.evaluate(acum, b, ADDITION);
      acum.updateMatrixWorld();
    }
    geo = acum.geometry;
  } catch (e) {
    console.error("union booleana de la red", e);
  }
  if (!geo) {
    // sin union: las piezas se muestran sueltas (se veran las tapas en los cruces)
    const pos = [];
    solidos.forEach(s => { const q = s.toNonIndexed().getAttribute("position").array; for (const x of q) pos.push(x); });
    geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  }
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute("normal");
  geo.computeVertexNormals();                  // sin indice: caras planas, aspecto de roca
  solidos.forEach(s => s.dispose());

  const roca = new THREE.MeshStandardMaterial({
    color: claro() ? 0xb9c0c9 : 0x4b5159, roughness: 1, metalness: 0, side: THREE.BackSide });
  const malla = new THREE.Mesh(geo, roca);
  malla.receiveShadow = true;
  grupo.add(malla);
  // cascara exterior, solo en el estilo transparente
  const cascara = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: claro() ? 0x9aa3ad : 0x7d8792, roughness: 1, transparent: true, opacity: 0.16,
    depthWrite: false, side: THREE.FrontSide }));
  cascara.visible = false;
  grupo.add(cascara);

  const lineas = (arr, col, op) => {
    if (!arr.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    grupo.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: op })));
  };
  lineas(anillosOk, p.linea, claro() ? 0.75 : 0.55);
  lineas(anillosMal, p.bad, 0.95);
  grupo.add(sobrecapa);

  // ---- rotulos de tramo y de extremo
  const v3 = new THREE.Vector3();
  red.tramos.forEach(t => {
    const s = t.tr.largo * (t.nodos.length > 2 ? 0.16 : 0.5), e = t.tr.en(s);
    const pend = t.pendiente_pct ? `  ${t.pendiente_pct > 0 ? "+" : ""}${t.pendiente_pct} %` : "";
    const et = etiqueta(`${t.nombre}  ${(t.sec.ancho_mm / 1000).toFixed(1)} x ${(t.sec.alto_mm / 1000).toFixed(1)} m${pend}`,
      p.apagado, 1.25);
    aTres(e, 0, t.sec.alto_mm / 1000 + 1.5, et.position);
    grupo.add(et);
  });

  // ---- frente con su pila y echadero
  const nodo = id => red.nodos[id];
  const haciaVecino = (id) => {
    const t = red.tramos.find(x => x.nodos[0] === id || x.nodos[x.nodos.length - 1] === id);
    const otro = t.nodos[0] === id ? t.nodos[1] : t.nodos[t.nodos.length - 2];
    const a = nodo(id), b = nodo(otro), l = Math.hypot(b.x - a.x, b.y - a.y);
    return { a, d: [(b.x - a.x) / l, (b.y - a.y) / l] };
  };
  const frente = red.doc.nodos.find(n => n.tipo === "frente");
  const ech = red.doc.nodos.find(n => n.tipo === "echadero");
  const D_PILA = 1.4, D_ECH = 2.4;
  let semilla = 7;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  if (frente) {
    const { a, d } = haciaVecino(frente.id);
    for (let i = 0; i < 22; i++) {
      const r = 0.15 + azar() * 0.22;
      const roca2 = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0),
        MAT.mate(claro() ? 0x8d96a1 : 0x6a727c));
      const l = D_PILA + (azar() - 0.6) * 1.9, u = (azar() - 0.5) * 2.0;
      roca2.position.set(a.x + d[0] * l - d[1] * u, a.z + r * 0.8, -(a.y + d[1] * l + d[0] * u));
      roca2.rotation.set(azar() * 3, azar() * 3, azar() * 3);
      roca2.castShadow = true;
      grupo.add(roca2);
    }
    const et = etiqueta("frente de minado", p.warn, 1.3);
    et.position.set(a.x + d[0] * D_PILA, a.z + 4.4, -(a.y + d[1] * D_PILA));
    grupo.add(et);
  }
  if (ech) {
    const { a, d } = haciaVecino(ech.id);
    const x = a.x + d[0] * D_ECH, y = a.y + d[1] * D_ECH;
    const boca = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.1, 26),
      MAT.mate(claro() ? 0x4c535c : 0x0c0e10));
    boca.position.set(x, a.z + 0.04, -y);
    grupo.add(boca);
    const aro = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.06, 8, 30), MAT.acero(p.acento));
    aro.rotation.x = -Math.PI / 2;
    aro.position.set(x, a.z + 0.09, -y);
    grupo.add(aro);
    const et = etiqueta("echadero al pique", p.acento, 1.3);
    et.position.set(x, a.z + 5.4, -y);
    grupo.add(et);
  }

  // ---- lamparas en el techo
  const lamparas = [];
  red.tramos.forEach(t => {
    const n = Math.max(1, Math.round(t.tr.largo / 15));
    for (let k = 0; k < n && lamparas.length < 9; k++) {
      const e = t.tr.en(t.tr.largo * (k + 0.5) / n);
      const h = t.sec.alto_mm / 1000 - 0.25;
      const luz = new THREE.PointLight(0xffe2b0, 0, 24, 1.5);
      aTres(e, 0, h, luz.position);
      const foco = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe9c4 }));
      foco.position.copy(luz.position);
      grupo.add(luz, foco);
      lamparas.push(luz);
    }
  });

  // ---- centrado: la escena gira alrededor del centro de la red
  const caja = new THREE.Box3().setFromBufferAttribute(geo.getAttribute("position"));
  const centro = caja.getCenter(new THREE.Vector3());
  centro.y = caja.min.y + (caja.max.y - caja.min.y) * 0.45;
  grupo.position.copy(centro).negate();
  const tam = caja.getSize(new THREE.Vector3());

  const bvh = new MeshBVH(geo);
  const aLocal = w => v3.copy(w).add(centro);
  const rayo = new THREE.Ray(), abajo = new THREE.Vector3(0, -1, 0), cerca = {};

  /** Cota del piso bajo un punto del mundo, o null si no hay galeria. */
  function pisoEn(w, alto = 1.2) {
    rayo.origin.copy(aLocal(w)); rayo.origin.y += alto;
    rayo.direction.copy(abajo);
    // BackSide: solo cuenta el piso visto desde dentro; el rayo atraviesa los techos
    const h = bvh.raycastFirst(rayo, THREE.BackSide);
    return h && h.distance < alto + 3.5 ? h.point.y - centro.y : null;
  }
  /** Aparta una esfera de las paredes. Modifica y devuelve `w` (mundo). */
  function apartar(w, radio) {
    for (let i = 0; i < 3; i++) {
      const c = bvh.closestPointToPoint(aLocal(w), cerca);
      if (!c || c.distance >= radio) break;
      const dx = v3.x - c.point.x, dz = v3.z - c.point.z, l = Math.hypot(dx, dz);
      if (l < 1e-5) break;
      const k = (radio - c.distance) / l;
      w.x += dx * k; w.z += dz * k;
    }
    return w;
  }

  /** Punto del mundo de un nodo, a una altura sobre el piso. */
  const mundoNodo = (id, alto = 0) => {
    const n = nodo(id);
    return new THREE.Vector3(n.x, n.z + alto, -n.y).sub(centro);
  };
  const mundoPlanta = (x, y, z = 0) => new THREE.Vector3(x, z, -y).sub(centro);
  const plantaDeMundo = w => ({ x: w.x + centro.x, y: -(w.z + centro.z), z: w.y + centro.y });

  // ---- planta para el minimapa
  const planta = red.tramos.map(t => {
    const pts = [];
    const n = Math.ceil(t.tr.largo / 1.0);
    for (let k = 0; k <= n; k++) { const e = t.tr.en(t.tr.largo * k / n); pts.push([e.x, e.y]); }
    return { id: t.id, ancho: t.sec.ancho_mm / 1000, pts, tipo: t.tipo };
  });

  return {
    grupo, malla, cascara, lamparas, rotulos, centro, tam, red,
    pisoEn, apartar, mundoNodo, mundoPlanta, plantaDeMundo, planta,
    D_PILA, D_ECH,
    setEstilo(e) { cascara.visible = e === "transparente"; },
  };
}

/* ------------------------------------------------ ruta del equipo ------- */
/**
 * Tramos de marcha del ciclo. Cada uno guarda su eje en el sentido en que
 * MIRA el equipo: en reversa la estacion decrece. El cambio de marcha ocurre
 * siempre en una recta comun a los dos ejes, asi la pose no salta.
 */
export function tramosDeMarcha(red, eq, R) {
  const L = eq.largo_mm / 1000;
  const cola = 0.46 * L + 1.0;                 // articulacion con la cola a 1 m del fondo
  const punta = 0.54 * L;                      // articulacion -> labio de la cuchara
  const paradas = { frente: R.D_PILA + 0.2 + punta, echadero: R.D_ECH - 0.3 + punta };
  const tipoDe = id => red.nodos[id].tipo;
  const parada = (id, largo, desdeInicio) => {
    const t = tipoDe(id);
    const d = t === "frente" ? paradas.frente : t === "echadero" ? paradas.echadero : cola;
    return desdeInicio ? d : largo - d;
  };
  const armar = fase => red.doc.ruta[fase].map(leg => {
    const rev = leg.marcha === "reversa";
    const ids = rev ? [...leg.nodos].reverse() : leg.nodos;
    const tr = red.ruta(ids);
    const ini = leg.nodos[0], fin = leg.nodos[leg.nodos.length - 1];
    // en reversa el eje esta invertido: el origen del viaje queda al final
    const s0 = rev ? parada(ini, tr.largo, false) : parada(ini, tr.largo, true);
    const s1 = rev ? parada(fin, tr.largo, true) : parada(fin, tr.largo, false);
    return { tr, rev, s0, s1, dist: Math.abs(s1 - s0) };
  });
  return { acarreo: armar("acarreo"), retorno: armar("retorno") };
}

/** Pose del equipo articulado con la articulacion en la estacion s. */
export function poseEn(tr, s, eq) {
  const L = eq.largo_mm / 1000;
  const lf = 0.143 * L, lr = 0.322 * L;        // articulacion -> eje delantero / trasero
  const A = tr.en(s), F = tr.en(s + lf), T = tr.en(s - lr);
  const rf = Math.atan2(F.y - A.y, F.x - A.x), rt = Math.atan2(A.y - T.y, A.x - T.x);
  let dif = rf - rt;
  while (dif > Math.PI) dif -= 2 * Math.PI;
  while (dif < -Math.PI) dif += 2 * Math.PI;
  return { x: A.x, y: A.y, z: A.z, rumbo: rt + dif / 2, quiebre: dif,
           cabeceo: Math.atan2(F.z - T.z, lf + lr), enCurva: A.elem.t === "A" };
}
