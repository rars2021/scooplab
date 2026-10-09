/* ============================================================================
   Cargador de bajo perfil (LHD) construido por codigo.

   La geometria sale de las cotas del catalogo y de los rasgos de modelos.js
   (posicion real de ejes y articulacion, tipo de cabina, colores de marca).
   Dos bastidores que giran en la articulacion, brazo que sube y cuchara HUECA
   que se llena: el material se ve dentro.

   Ejes del equipo: x hacia la cuchara, y arriba, z a la derecha. La cabina va
   a la izquierda (-z), detras de la articulacion, como en todas las fichas.
   ========================================================================= */
import * as THREE from "three";
import { MODELOS } from "./modelos.js";

export const claro = () => document.documentElement.getAttribute("data-theme") === "light";
const css = (n, r) => (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || r);

export const MAT = {
  acero: (c) => new THREE.MeshStandardMaterial({
    color: c, metalness: claro() ? 0.30 : 0.55, roughness: claro() ? 0.55 : 0.48 }),
  mate: (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.12, roughness: 0.85 }),
  pintura: (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.22, roughness: 0.52 }),
  caucho: () => new THREE.MeshStandardMaterial({
    color: claro() ? 0x2b2f35 : 0x1b1e23, metalness: 0.05, roughness: 0.95 }),
  cromo: () => new THREE.MeshStandardMaterial({
    color: claro() ? 0xe3e7ec : 0xc8cdd4, metalness: 0.85, roughness: 0.18 }),
  vidrio: () => new THREE.MeshStandardMaterial({
    color: 0x16222e, metalness: 0.7, roughness: 0.15, transparent: true, opacity: 0.82 }),
  roca: () => new THREE.MeshStandardMaterial({
    color: claro() ? 0x8d96a1 : 0x767e88, metalness: 0.05, roughness: 0.95, flatShading: true }),
};
export const GRIS = () => (claro() ? 0x737c88 : 0x666e79);
export const GRIS_OSC = () => (claro() ? 0x4d555f : 0x3d434b);
const luz = c => new THREE.MeshBasicMaterial({ color: c });

/** Prisma con aristas biseladas: largo en x, alto en y, ancho en z. */
export function bloque(l, h, a, mat, bisel = 0.035) {
  const f = new THREE.Shape();
  const b = Math.min(bisel, h / 2.6, a / 2.6);
  const ha = a / 2, hh = h / 2;
  f.moveTo(-ha + b, -hh); f.lineTo(ha - b, -hh);
  f.quadraticCurveTo(ha, -hh, ha, -hh + b);
  f.lineTo(ha, hh - b); f.quadraticCurveTo(ha, hh, ha - b, hh);
  f.lineTo(-ha + b, hh); f.quadraticCurveTo(-ha, hh, -ha, hh - b);
  f.lineTo(-ha, -hh + b); f.quadraticCurveTo(-ha, -hh, -ha + b, -hh);
  const g = new THREE.ExtrudeGeometry(f, { depth: l, bevelEnabled: false, curveSegments: 3 });
  g.rotateY(Math.PI / 2); g.translate(-l / 2, 0, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

/** Bloque entre dos x y dos y, centrado en z. */
function caja(x0, x1, y0, y1, a, mat, z = 0, bisel = 0.03) {
  const m = bloque(x1 - x0, y1 - y0, a, mat, bisel);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  return m;
}

/** Barra entre dos puntos del plano xy, a una z dada. */
function barra(x0, y0, x1, y1, alto, ancho, mat, z = 0) {
  const l = Math.hypot(x1 - x0, y1 - y0);
  const m = bloque(l, alto, ancho, mat, 0.012);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  return m;
}

/** Cilindro hidraulico entre dos puntos del plano xy: camisa y vastago. */
function hidraulico(x0, y0, x1, y1, r, z = 0) {
  const g = new THREE.Group();
  const l = Math.hypot(x1 - x0, y1 - y0);
  const camisa = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l * 0.58, 12), MAT.acero(GRIS_OSC()));
  camisa.rotation.z = Math.PI / 2; camisa.position.x = -l * 0.21;
  const vastago = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, l * 0.46, 10), MAT.cromo());
  vastago.rotation.z = Math.PI / 2; vastago.position.x = l * 0.27;
  g.add(camisa, vastago);
  g.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  g.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  return g;
}

/** Neumatico con tacos, llanta del color de la marca, aro y pernos. */
function rueda(r, ancho, colAro) {
  const g = new THREE.Group();
  const n = new THREE.Mesh(new THREE.CylinderGeometry(r, r, ancho, 30), MAT.caucho());
  n.rotation.x = Math.PI / 2; n.castShadow = true;
  g.add(n);
  const matTaco = MAT.mate(claro() ? 0x3a3f46 : 0x24282e);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.BoxGeometry(r * 0.17, r * 0.10, ancho * 0.88), matTaco);
    t.position.set(Math.cos(a) * r * 0.99, Math.sin(a) * r * 0.99, 0);
    t.rotation.z = a;
    g.add(t);
  }
  const llanta = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.56, r * 0.56, ancho * 1.04, 20), MAT.pintura(colAro));
  llanta.rotation.x = Math.PI / 2;
  g.add(llanta);
  const cubo = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, ancho * 1.12, 12), MAT.acero(0x99a1aa));
  cubo.rotation.x = Math.PI / 2;
  g.add(cubo);
  const matPerno = MAT.acero(0x4a5059);
  [-1, 1].forEach(s => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pn = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.035, r * 0.035, 0.03, 6), matPerno);
      pn.rotation.x = Math.PI / 2;
      pn.position.set(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, s * ancho * 0.535);
      g.add(pn);
    }
  });
  g.userData.r = r;
  return g;
}

/** Rotulo del modelo pintado en el costado. */
function rotulo(texto, alto, colTexto = "#101317") {
  const cv = document.createElement("canvas");
  const c0 = cv.getContext("2d");
  c0.font = "800 64px Arial, sans-serif";
  cv.width = Math.ceil(c0.measureText(texto).width) + 24; cv.height = 84;
  const c = cv.getContext("2d");
  c.font = "800 64px Arial, sans-serif"; c.fillStyle = colTexto; c.textBaseline = "middle";
  c.fillText(texto, 12, 44);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(alto * cv.width / cv.height, alto),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return m;
}

/* ------------------------------------------------ cotas ---------------- */
/** Posicion de ejes, articulacion y extremos, en metros (x = 0 al centro). */
export function cotasDe(eq) {
  const L = eq.largo_mm / 1000, W = eq.ancho_mm / 1000, H = eq.alto_mm / 1000;
  const m = MODELOS[eq.id] || {};
  let volTras = m.volTras ?? 138 * L, tras = m.tras ?? 322 * L, del = m.del ?? 143 * L, labio = m.labio ?? 397 * L;
  const k = L * 1000 / (volTras + tras + del + labio);
  volTras *= k / 1000; tras *= k / 1000; del *= k / 1000; labio *= k / 1000;
  const xCola = -L / 2, xEjeTras = xCola + volTras, xArt = xEjeTras + tras, xEjeDel = xArt + del;
  const rT = (m.rueda ?? Math.min(H * 0.66, L * 0.186) * 1000) / 2000;
  const rD = (m.ruedaDel ?? rT * 2000) / 2000;
  return { L, W, H, m, xCola, xEjeTras, xArt, xEjeDel, xLabio: L / 2,
           lf: del, lr: tras, colaArt: tras + volTras, puntaArt: del + labio,
           rR: rT, rT, rD, capo: (m.capo ?? H * 720) / 1000 };
}

/* ------------------------------------------------ cuchara -------------- */
/**
 * Cuchara hueca: fondo y dorso de plancha curva, dos costados y labio con
 * dientes. Queda abierta hacia adelante y arriba, y lleva dentro la carga,
 * que crece con `setCarga(0..1)`.
 */
function cuchara(volumen, anchoMax, col) {
  const g = new THREE.Group();
  const ancho = Math.min(anchoMax, Math.cbrt(volumen) * 1.62);
  const e = Math.cbrt(volumen / 3.1);
  const P = 1.32 * e, A = 1.05 * e;
  const mat = MAT.pintura(col);
  mat.side = THREE.DoubleSide;

  // perfil lateral, del labio al borde superior: piso, talon, dorso y visera
  const pts = [[1.05 * P, 0.0], [0.32 * P, -0.12 * A]];
  for (let i = 1; i <= 7; i++) {
    const t = i / 7, a = 1 - t;
    pts.push([a * a * 0.32 * P + 2 * a * t * (-0.06 * P) + t * t * 0,
              a * a * (-0.12 * A) + 2 * a * t * (-0.12 * A) + t * t * 0.30 * A]);
  }
  pts.push([0.03 * P, 0.96 * A], [0.20 * P, 1.05 * A]);

  // plancha curva
  const pos = [], idx = [];
  pts.forEach(([x, y]) => { pos.push(x, y, -ancho / 2, x, y, ancho / 2); });
  for (let i = 0; i < pts.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const plancha = new THREE.Mesh(geo, mat);
  plancha.castShadow = true;
  g.add(plancha);

  // costados
  const lado = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? lado.lineTo(x, y) : lado.moveTo(x, y)));
  lado.closePath();
  [-1, 1].forEach(s => {
    const c = new THREE.Mesh(new THREE.ExtrudeGeometry(lado, { depth: 0.035, bevelEnabled: false }), mat);
    c.position.z = s > 0 ? ancho / 2 - 0.035 : -ancho / 2;
    c.castShadow = true;
    g.add(c);
  });

  // labio, dientes y nervios del dorso
  const labio = bloque(P * 0.12, 0.05, ancho * 1.01, MAT.acero(0x8a929b), 0.01);
  labio.position.set(P * 1.02, 0.0, 0);
  g.add(labio);
  const nd = Math.max(4, Math.round(ancho / 0.34));
  for (let i = 0; i < nd; i++) {
    const d = new THREE.Mesh(new THREE.ConeGeometry(A * 0.05, A * 0.16, 4), MAT.acero(0x9aa3ad));
    d.rotation.z = -Math.PI / 2;
    d.position.set(P * 1.13, 0.0, -ancho / 2 + ancho * ((i + 0.5) / nd));
    g.add(d);
  }
  [-0.3, 0.3].forEach(f => {
    const n = bloque(0.05, A * 0.62, 0.06, MAT.acero(GRIS_OSC()), 0.008);
    n.position.set(-0.03, A * 0.60, ancho * f);
    g.add(n);
  });

  // carga: un monton que llena el hueco y rocas sueltas encima
  const carga = new THREE.Group();
  const matRoca = MAT.roca();
  const monton = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 6), matRoca);
  monton.scale.set(P * 0.46, A * 0.50, ancho * 0.46);
  monton.position.set(0, A * 0.18, 0);
  carga.add(monton);
  let sem = 5;
  const azar = () => { sem = (sem * 16807) % 2147483647; return sem / 2147483647; };
  for (let i = 0; i < 12; i++) {
    const r = 0.09 + azar() * 0.11;
    const roca = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), matRoca);
    roca.position.set((azar() - 0.5) * P * 0.7, A * (0.42 + azar() * 0.22), (azar() - 0.5) * ancho * 0.78);
    roca.rotation.set(azar() * 3, azar() * 3, azar() * 3);
    carga.add(roca);
  }
  carga.position.set(P * 0.52, A * 0.02, 0);
  carga.visible = false;
  g.add(carga);

  g.userData = { ancho, P, A, carga,
    setCarga(f) {
      carga.visible = f > 0.03;
      carga.scale.set(0.72 + 0.28 * f, Math.max(0.05, f), 1);
    } };
  return g;
}

/* ------------------------------------------------ equipo --------------- */
export function construirEquipo(eq, opts = {}) {
  const c = cotasDe(eq), m = c.m;
  const { L, W, H, xCola, xEjeTras, xArt, xEjeDel, rT, rD } = c;
  const acento = eq.energia === "Diesel" ? css("--warn", "#c99230")
    : eq.energia === "Bateria" ? css("--ok", "#3fa985") : css("--accent", "#4a9ee0");
  const colCuerpo = m.cuerpo ?? GRIS();
  const colDet = m.detalle ?? GRIS_OSC();
  const colCuch = m.cuchara ?? new THREE.Color(acento).getHex();
  const cuerpo = MAT.pintura(colCuerpo), det = MAT.acero(colDet);

  const g = new THREE.Group();
  const bastidor = () => {
    const piv = new THREE.Group(); piv.position.x = xArt;
    const dentro = new THREE.Group(); dentro.position.x = -xArt;
    piv.add(dentro); g.add(piv);
    return [piv, dentro];
  };
  const [pivT, T] = bastidor();
  const [pivF, F] = bastidor();

  const anchoR = Math.min(W * 0.21, 0.48);
  const anchoCh = W - 2 * anchoR - 0.10;                 // chasis entre ruedas
  const yBajo = 0.34;
  const yRueda = 2 * Math.max(rT, rD) + 0.05;            // tope de los neumaticos
  const yCapo = Math.max(c.capo, yRueda + 0.08);
  const extras = {};

  // ---------------- bastidor trasero ----------------------------------
  const xT1 = xArt - 0.14;
  T.add(caja(xCola + 0.05, xT1, yBajo, yRueda, anchoCh, det));
  T.add(caja(xCola, xT1, yRueda, yCapo, W * 0.96, cuerpo, 0, 0.05));

  // cabina: a la izquierda, pegada a la articulacion
  const cabL = Math.min(1.25, c.lr * 0.80);
  const xCab1 = xT1 - 0.04, xCab0 = xCab1 - cabL;
  const zCab = -W * 0.27, cabW = W * 0.40;
  const yPiso = yBajo + 0.50;
  const colCab = m.cabinaColor ?? colCuerpo;
  const matCab = MAT.pintura(colCab);
  const tipoCab = m.cabina || "abierta";
  if (tipoCab === "cerrada") {
    T.add(caja(xCab0, xCab1, yPiso, H, cabW, matCab, zCab, 0.06));
    const v = MAT.vidrio(), yv0 = Math.max(yCapo + 0.05, yPiso + 0.55), yv1 = H - 0.14;
    if (yv1 - yv0 > 0.15) {
      T.add(caja(xCab1 - 0.01, xCab1 + 0.012, yv0, yv1, cabW * 0.78, v, zCab, 0.01));          // frente
      T.add(caja(xCab0 - 0.012, xCab0 + 0.01, yv0, yv1, cabW * 0.78, v, zCab, 0.01));          // atras
      T.add(caja(xCab0 + 0.12, xCab1 - 0.12, yv0, yv1, 0.024, v, zCab - cabW / 2, 0.008));     // costado
      T.add(caja(xCab0 + 0.12, xCab1 - 0.12, yv0, yv1, 0.024, v, zCab + cabW / 2, 0.008));
    }
    const manija = caja(xCab0 + cabL * 0.55, xCab0 + cabL * 0.65, yPiso + 0.42, yPiso + 0.46, 0.03, MAT.cromo(),
                        zCab - cabW / 2 - 0.02, 0.004);
    T.add(manija);
  } else {
    const grueso = tipoCab === "rops" ? 0.075 : 0.045;
    T.add(caja(xCab0, xCab1, yPiso - 0.05, yPiso, cabW, det, zCab, 0.01));
    T.add(caja(xCab0 - 0.04, xCab1 + 0.04, H - 0.07, H, cabW * 1.08, matCab, zCab, 0.02));
    [[xCab0 + 0.05, -1], [xCab0 + 0.05, 1], [xCab1 - 0.05, -1], [xCab1 - 0.05, 1]].forEach(([x, s]) => {
      T.add(caja(x - grueso / 2, x + grueso / 2, yPiso, H - 0.06, grueso, matCab, zCab + s * (cabW / 2 - 0.05), 0.012));
    });
    if (tipoCab === "rops") {
      T.add(caja(xCab0, xCab0 + 0.04, yPiso, yPiso + (H - yPiso) * 0.55, cabW * 0.9, matCab, zCab, 0.01));
    }
    const asiento = caja(xCab0 + 0.14, xCab0 + 0.44, yPiso, yPiso + 0.42, 0.34,
      MAT.mate(claro() ? 0x3b4149 : 0x24282e), zCab, 0.04);
    T.add(asiento);
    T.add(caja(xCab0 + 0.10, xCab0 + 0.17, yPiso + 0.3, yPiso + 0.85, 0.34, MAT.mate(0x24282e), zCab, 0.03));
  }
  T.add(caja(xCab1 - 0.30, xCab1 - 0.14, yPiso, yPiso + 0.52, 0.22, MAT.mate(0x22262b), zCab, 0.02));   // consola
  const baliza = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), luz(0xffa41c));
  baliza.position.set(xCab0 + 0.14, H + 0.04, zCab);
  T.add(baliza);
  for (let i = 0; i < 2; i++) {
    T.add(caja(xCab0 + cabL * 0.35, xCab0 + cabL * 0.6, yBajo + 0.08 + i * 0.26, yBajo + 0.105 + i * 0.26, 0.07,
      MAT.mate(0xd9a81e), -W * 0.485, 0.004));
  }

  // capo: tapas, persianas y rotulo del modelo
  const xCapo1 = xCab0 - 0.06, lCapo = xCapo1 - xCola;
  [-1, 1].forEach(s => {
    for (let i = 0; i < 5; i++) {
      const x = xCola + lCapo * (0.12 + i * 0.075);
      T.add(caja(x, x + lCapo * 0.05, yRueda + 0.03, yCapo - 0.04, 0.02, MAT.mate(0x1d2025), s * W * 0.482, 0.004));
    }
    if (m.rotulo) {
      const r = rotulo(m.rotulo, Math.min(0.22, (yCapo - yRueda) * 0.7));
      r.position.set(xCola + lCapo * 0.68, (yRueda + yCapo) / 2, s * (W * 0.482 + 0.012));
      if (s < 0) r.rotation.y = Math.PI;
      T.add(r);
    }
  });

  // cola: contrapeso, franjas, luces y rejilla
  T.add(caja(xCola - 0.07, xCola + 0.03, yBajo + 0.05, yRueda * 0.92, W * 0.92, det, 0, 0.02));
  for (let i = 0; i < 8; i++) {
    T.add(caja(xCola - 0.09, xCola - 0.068, yBajo + 0.08, yBajo + 0.20, W * 0.105,
      MAT.mate(i % 2 ? 0x1b1e23 : 0xd9a81e), -W * 0.40 + i * W * 0.114, 0.003));
  }
  [-1, 1].forEach(s => {
    T.add(caja(xCola - 0.02, xCola + 0.01, yCapo - 0.20, yCapo - 0.12, 0.13, luz(0xd23b2e), s * W * 0.38, 0.004));
    T.add(caja(xCola - 0.02, xCola + 0.01, yCapo - 0.20, yCapo - 0.12, 0.10, luz(0xfff1cf), s * W * 0.26, 0.004));
  });
  if (eq.energia === "Diesel") {
    const hRej = (yCapo - yRueda) * (m.rejillaNegra ? 0.92 : 0.7);
    T.add(caja(xCola - 0.025, xCola + 0.01, yCapo - 0.03 - hRej, yCapo - 0.03,
      W * (m.rejillaNegra ? 0.62 : 0.44), MAT.mate(0x121416), 0, 0.01));
    for (let i = 0; i < 5; i++) {
      const y = yCapo - 0.03 - hRej * (0.14 + i * 0.18);
      T.add(caja(xCola - 0.035, xCola - 0.02, y - 0.012, y + 0.012, W * (m.rejillaNegra ? 0.60 : 0.42),
        MAT.acero(0x4a5059), 0, 0.003));
    }
  }

  // barandas sobre el capo
  const matBar = MAT.mate(m.baranda ?? 0xd9a81e);
  [-1, 1].forEach(s => {
    const lar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, lCapo * 0.5, 6), matBar);
    lar.rotation.z = Math.PI / 2;
    lar.position.set(xCola + lCapo * 0.42, yCapo + 0.24, s * W * 0.40);
    T.add(lar);
    [0.18, 0.42, 0.66].forEach(f => {
      const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 6), matBar);
      pie.position.set(xCola + lCapo * f, yCapo + 0.12, s * W * 0.40);
      T.add(pie);
    });
  });

  // energia: escape y filtro, o paquete de baterias
  if (eq.energia === "Diesel") {
    const xEsc = xCapo1 - 0.25, zEsc = W * 0.26;
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, H * 0.30, 12), MAT.acero(0x2b2f35));
    tubo.position.set(xEsc, yCapo + H * 0.15, zEsc);
    T.add(tubo);
    const sil = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.30, 14), det);
    sil.position.set(xEsc, yCapo + 0.13, zEsc);
    T.add(sil);
    if (m.filtroAire) {
      const fa = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 16), MAT.mate(0x17191c));
      fa.rotation.z = Math.PI / 2;
      fa.position.set(xCapo1 - 0.75, yCapo + 0.15, W * 0.24);
      T.add(fa);
    }
    const humo = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.06 + i * 0.024, 7, 7),
        new THREE.MeshBasicMaterial({ color: 0x8b939d, transparent: true, opacity: 0.30 }));
      sp.userData.base = i * 0.2;
      humo.add(sp);
    }
    humo.position.set(xEsc, yCapo + H * 0.32, zEsc);
    T.add(humo);
    extras.humo = humo;
  } else if (eq.energia === "Bateria") {
    const b = m.bateria || { color: 0x24282e, franja: new THREE.Color(acento).getHex() };
    const x0 = xCola + 0.14, x1 = xCola + Math.max(1.0, lCapo * 0.72);
    const y1 = Math.min(H - 0.04, yCapo + 0.55);
    T.add(caja(x0, x1, yCapo, y1, W * 0.86, MAT.mate(b.color), 0, 0.05));
    T.add(caja(x0 + 0.05, x1 - 0.05, y1 - 0.14, y1 - 0.08, W * 0.875, MAT.pintura(b.franja), 0, 0.01));
    for (let i = 1; i < 4; i++) {
      const x = x0 + (x1 - x0) * i / 4;
      T.add(caja(x - 0.012, x + 0.012, yCapo + 0.04, y1 - 0.18, W * 0.868, MAT.acero(0x4a5059), 0, 0.004));
    }
  } else {
    const carrete = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.16, H * 0.16, W * 0.34, 22), MAT.pintura(colCuerpo));
    carrete.rotation.x = Math.PI / 2;
    carrete.position.set(xCola + 0.5, yCapo + H * 0.12, 0);
    T.add(carrete);
  }

  // ---------------- articulacion ---------------------------------------
  const junta = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, (yRueda - yBajo) * 1.1, 16), det);
  junta.position.set(xArt, (yBajo + yRueda) / 2, 0);
  g.add(junta);
  [yBajo + 0.06, yRueda - 0.04].forEach(y => g.add(caja(xArt - 0.3, xArt + 0.3, y - 0.025, y + 0.025, anchoCh * 0.7, det)));
  [-1, 1].forEach(s => g.add(hidraulico(xArt - 0.55, yBajo + 0.3, xArt + 0.35, yBajo + 0.3, 0.045, s * anchoCh * 0.42)));

  // ---------------- bastidor delantero ---------------------------------
  const xF0 = xArt + 0.14, xF1 = xEjeDel + rD * 0.8;
  F.add(caja(xF0, xF1, yBajo, yRueda * 0.90, anchoCh, det));
  F.add(caja(xF0, xEjeDel - rD * 0.2, yRueda * 0.90, Math.min(yCapo, yRueda + 0.18), anchoCh * 0.98, cuerpo, 0, 0.04));
  [-1, 1].forEach(s => {                                  // guardabarros
    F.add(caja(xEjeDel - rD * 1.05, xEjeDel + rD * 0.7, 2 * rD + 0.03, 2 * rD + 0.09, anchoR * 1.1, cuerpo,
      s * (W / 2 - anchoR * 0.55), 0.02));
    T.add(caja(xEjeTras - rT * 0.9, xEjeTras + rT * 0.9, yRueda - 0.02, yRueda + 0.02, anchoR * 1.1, cuerpo,
      s * (W / 2 - anchoR * 0.55), 0.01));
  });

  // brazo: dos largueros acodados que pivotan en las torres
  const cu = cuchara(eq.cuchara_m3 || 3, W * 0.99, colCuch);
  const { P, A } = cu.userData;
  const zB = W * 0.27;
  const xPiv = xEjeDel - c.lf * 0.30, yPiv = Math.min(yCapo + 0.10, 1.6);
  const xPin = L / 2 - 1.03 * P, yPin = 0.12 * A + 0.04;
  const dx = xPin - xPiv, dy = yPin - yPiv;
  [-1, 1].forEach(s => F.add(caja(xPiv - 0.28, xPiv + 0.22, yRueda * 0.85, yPiv + 0.12, 0.10, cuerpo, s * zB, 0.03)));

  const brazo = new THREE.Group();
  brazo.position.set(xPiv, yPiv, 0);
  const kx = dx * 0.52 + 0.10, ky = dy * 0.52 + 0.22;   // codo, por encima de la recta
  [-1, 1].forEach(s => {
    brazo.add(barra(0, 0, kx, ky, 0.16, 0.085, cuerpo, s * zB));
    brazo.add(barra(kx, ky, dx, dy, 0.14, 0.08, cuerpo, s * zB));
    brazo.add(hidraulico(-0.05, -(yPiv - yBajo) * 0.62, kx * 0.92, ky - 0.10, 0.06, s * (zB - 0.13)));   // levante
    [[0, 0], [kx, ky], [dx, dy]].forEach(([x, y]) => {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), MAT.cromo());
      pin.rotation.x = Math.PI / 2; pin.position.set(x, y, s * zB);
      brazo.add(pin);
    });
  });
  const trav = bloque(0.12, 0.10, zB * 2, cuerpo, 0.02);
  trav.position.set(kx, ky - 0.02, 0);
  brazo.add(trav);
  if (m.brazo === "zbar") {
    // varillaje en Z: balancin central, cilindro arriba y biela a la cuchara
    brazo.add(barra(kx - 0.05, ky - 0.30, kx + 0.12, ky + 0.55, 0.12, 0.09, cuerpo, 0));
    brazo.add(hidraulico(0.10, 0.20, kx + 0.10, ky + 0.50, 0.06, 0));
    brazo.add(barra(kx - 0.04, ky - 0.28, dx - 0.02, dy + A * 0.42, 0.07, 0.07, det, 0));
  } else {
    // brazo paralelo: cilindro de volteo por arriba, directo al dorso
    brazo.add(hidraulico(0.12, 0.24, dx - 0.03, dy + A * 0.80, 0.055, 0));
  }
  const cuchGrupo = new THREE.Group();
  cuchGrupo.position.set(dx, dy, 0);
  cuchGrupo.add(cu);
  brazo.add(cuchGrupo);
  F.add(brazo);

  // ---------------- ruedas ---------------------------------------------
  const colAro = m.aro ?? 0x7d858f;
  const ruedas = [];
  [[xEjeTras, rT, T], [xEjeDel, rD, F]].forEach(([x, r, dest]) => {
    [-1, 1].forEach(s => {
      const w = rueda(r, anchoR, colAro);
      w.position.set(x, r, s * (W / 2 - anchoR * 0.5));
      dest.add(w); ruedas.push(w);
    });
  });

  // extintor, punto de vista del operador y faros
  const extintor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.30, 10), MAT.mate(0xc0392b));
  extintor.position.set(xCab1 - 0.1, yCapo + 0.16, W * 0.10);
  T.add(extintor);
  const ojo = new THREE.Object3D();
  ojo.position.set(xCab0 + cabL * 0.45, Math.min(H - 0.22, yPiso + 1.15), zCab);
  T.add(ojo);
  [-1, 1].forEach(s => {
    const lente = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), luz(0xfff4dc));
    lente.position.set(xPiv + 0.22, yPiv + 0.05, s * zB);
    F.add(lente);
    if (opts.faros) {
      const faro = new THREE.SpotLight(0xfff1d6, 55, 38, 0.6, 0.6, 1.4);
      faro.position.copy(lente.position);
      faro.target.position.set(L / 2 + 12, 0.7, s * zB);
      F.add(faro, faro.target);
    }
  });

  g.userData = {
    cotas: { ...c, yEje: rT }, brazo, cuchara: cuchGrupo, cuch: cu.userData,
    ruedas, extras, acento, frente: pivF, trasero: pivT, ojo, eq,
  };
  return g;
}
