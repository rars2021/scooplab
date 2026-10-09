/* ============================================================================
   Actores del ciclo de minado, antes de que entre el scoop: jumbo perforando
   taladros largos, carguio y disparo, ventilacion y desatado.

   Cada etapa es funcion de su avance k (0..1), como el resto de la
   simulacion: se puede arrastrar la barra hacia atras. Las duraciones reales
   vienen del motor (engine/minado.py); en pantalla van comprimidas.
   ========================================================================= */
import * as THREE from "three";
import { MAT, bloque } from "./equipo3d.js";

const SEG_POR_ETAPA = 14;          // segundos de pantalla a 1x por etapa previa
const L_TALADRO = 13;

export function crearMinado(R, red, doc) {
  const g = new THREE.Group();
  R.grupo.add(g);
  const F = red.doc.nodos.find(n => n.tipo === "frente");
  const t = red.tramos.find(x => x.nodos.includes(F.id));
  const otro = t.nodos[0] === F.id ? t.nodos[1] : t.nodos[t.nodos.length - 2];
  const J = red.nodos[otro], lFJ = Math.hypot(J.x - F.x, J.y - F.y);
  const d = [(J.x - F.x) / lFJ, (J.y - F.y) / lFJ];
  const alto = t.sec.alto_mm / 1000;
  /** Punto a l metros del frente, u a la derecha (mirando al frente) y v sobre el piso. */
  const pt = (l, u = 0, v = 0) => new THREE.Vector3(F.x + d[0] * l + d[1] * u, F.z + v, -(F.y + d[1] * l - d[0] * u));
  const rumbo = Math.atan2(-d[1], -d[0]);              // mirando al frente
  const lateral = new THREE.Vector3(d[1], 0, d[0]);    // a la derecha, en three

  // ---------------- jumbo de un brazo (Tamrock Mercury) ------------------
  const jumbo = new THREE.Group();
  const naranja = MAT.pintura(0xe6871a), osc = MAT.acero(0x33383f);
  const caja = (x0, x1, y0, y1, a, mat, z = 0) => {
    const m = bloque(x1 - x0, y1 - y0, a, mat, 0.03);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    return m;
  };
  jumbo.add(caja(-2.3, 1.0, 0.40, 1.15, 1.35, naranja));
  jumbo.add(caja(-2.2, -0.9, 1.15, 1.55, 1.2, osc));
  jumbo.add(caja(-0.6, 0.5, 2.0, 2.06, 1.2, naranja));
  [[-0.5, -0.5], [-0.5, 0.5], [0.4, -0.5], [0.4, 0.5]].forEach(([x, z]) => jumbo.add(caja(x - 0.03, x + 0.03, 1.15, 2.0, 0.06, osc, z)));
  [[-1.5, -1], [-1.5, 1], [0.4, -1], [0.4, 1]].forEach(([x, s]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 18), MAT.caucho());
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.42, s * 0.62);
    jumbo.add(w);
  });
  const brazo = new THREE.Group();
  brazo.position.set(1.0, 1.05, 0);
  brazo.add(caja(0, 2.4, -0.07, 0.07, 0.14, naranja));
  const viga = new THREE.Group();                       // deslizadera, apunta hacia arriba
  viga.position.set(2.4, 0, 0);
  const vigaM = caja(-0.08, 0.08, -0.6, 2.2, 0.14, osc);
  const barreno = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 8), MAT.cromo());
  barreno.position.set(0.14, 1.0, 0);
  const perf = caja(0.06, 0.24, -0.5, -0.1, 0.2, naranja);
  viga.add(vigaM, barreno, perf);
  brazo.add(viga);
  jumbo.add(brazo);
  jumbo.rotation.y = rumbo;
  g.add(jumbo);
  const L_JUMBO = 7.4, L_ABANICO = L_JUMBO - 3.4;      // el abanico queda bajo la deslizadera

  // ---------------- taladros en abanico -----------------------------------
  const nTal = (doc.minado && doc.minado.taladros) || 8;
  const taladros = [];
  for (let i = 0; i < nTal; i++) {
    const fi = (-0.62 + 1.24 * i / (nTal - 1));         // inclinacion lateral, rad
    const dir = new THREE.Vector3(0, Math.cos(fi), 0).addScaledVector(lateral, Math.sin(fi));
    const a = pt(L_ABANICO, Math.sin(fi) * 0.9, alto * 0.92);
    const geo = new THREE.BufferGeometry().setFromPoints([a, a.clone()]);
    const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fb3c8 }));
    ln.userData = { a, dir, fi };
    ln.visible = false;
    g.add(ln);
    taladros.push(ln);
  }
  const largoTal = (ln, f) => {
    const p = ln.geometry.getAttribute("position"), u = ln.userData;
    p.setXYZ(1, u.a.x + u.dir.x * L_TALADRO * f, u.a.y + u.dir.y * L_TALADRO * f, u.a.z + u.dir.z * L_TALADRO * f);
    p.needsUpdate = true;
  };

  // ---------------- trabajador --------------------------------------------
  const persona = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 1.15, 10), MAT.mate(0xff7a1a));
  cuerpo.position.y = 0.72;
  const piernas = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.3, 8), MAT.mate(0x25303d));
  piernas.position.y = 0.15;
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), MAT.mate(0xc79a78));
  cabeza.position.y = 1.42;
  const casco = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.pintura(0xf2c200));
  casco.position.y = 1.45;
  const barretilla = new THREE.Group();
  barretilla.position.set(0.18, 1.2, 0);
  const vara = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 6), MAT.cromo());
  vara.position.y = 0.9;
  barretilla.add(vara);
  persona.add(cuerpo, piernas, cabeza, casco, barretilla);
  persona.rotation.y = rumbo;
  g.add(persona);

  // ---------------- disparo, polvo, aire y roca suelta --------------------
  const centro = pt(L_ABANICO, 0, alto * 0.6);
  const destello = new THREE.PointLight(0xffb060, 0, 60, 1.2);
  destello.position.copy(centro);
  const bola = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0 }));
  bola.position.copy(centro);
  g.add(destello, bola);
  const polvo = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.9 + (i % 3) * 0.35, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x9a9288, transparent: true, opacity: 0, depthWrite: false }));
    s.position.copy(pt(1.5 + i * 1.6, ((i * 7) % 5 - 2) * 0.35, alto * (0.35 + (i % 4) * 0.12)));
    s.userData.base = s.position.clone();
    g.add(s); polvo.push(s);
  }
  const aire = [];
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0x4a9ee0 }));
    c.rotation.z = Math.PI / 2;                          // punta hacia +x local
    const eje = new THREE.Group();
    eje.rotation.y = rumbo;
    eje.add(c); g.add(eje); aire.push(eje);
  }
  const caidas = [];
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), MAT.roca());
    g.add(r); caidas.push(r);
  }

  const fases = ((doc.minado && doc.minado.fases) || []).filter(f => f.id !== "limpieza");
  const lista = fases.map(f => ({ id: f.id, nombre: f.nombre, min: f.min, supuesto: f.supuesto,
                                  detalle: f.detalle, seg: SEG_POR_ETAPA }));
  const orden = lista.map(f => f.id).concat(["limpieza"]);

  /** Pone la escena en la etapa `id`, con avance k. */
  function aplicar(id, k) {
    const etapa = orden.indexOf(id);
    const volado = etapa > orden.indexOf("voladura") || (id === "voladura" && k > 0.86);
    R.pila.visible = volado;
    jumbo.visible = id === "perforacion" || (id === "voladura" && k < 0.45);
    persona.visible = (id === "voladura" && k > 0.15 && k < 0.72) || id === "desatado";
    polvo.forEach(s => { s.material.opacity = 0; });
    aire.forEach(e => { e.visible = false; });
    caidas.forEach(r => { r.visible = false; });
    destello.intensity = 0; bola.material.opacity = 0;
    taladros.forEach(ln => { ln.visible = !volado && etapa <= orden.indexOf("voladura"); });

    if (id === "perforacion") {
      const x = k * nTal, n = Math.min(nTal - 1, Math.floor(x)), f = x - n;
      taladros.forEach((ln, i) => { largoTal(ln, i < n ? 1 : i === n ? f : 0); ln.material.color.set(0x9fb3c8); });
      jumbo.position.copy(pt(L_JUMBO));
      viga.rotation.x = -taladros[n].userData.fi;        // la deslizadera se inclina al taladro
      barreno.position.y = 1.0 + 0.5 * Math.abs(Math.sin(x * 24));
    } else if (id === "voladura") {
      // el jumbo sale, se cargan los taladros (anaranjados) y se dispara
      jumbo.position.copy(pt(L_JUMBO + Math.min(1, k / 0.45) * 16));
      const cargados = Math.min(nTal, Math.floor((k - 0.15) / 0.55 * nTal + 0.001));
      taladros.forEach((ln, i) => { largoTal(ln, 1); ln.material.color.set(i < cargados ? 0xff7a1a : 0x9fb3c8); });
      persona.position.copy(pt(L_ABANICO + 1.2, 0.6));
      barretilla.visible = false;
      const b = (k - 0.86) / 0.10;                       // el disparo
      if (b > 0 && b < 1) {
        destello.intensity = 900 * Math.sin(Math.PI * b);
        bola.scale.setScalar(0.5 + b * 4.5);
        bola.material.opacity = 0.7 * (1 - b);
      }
      if (k > 0.9) polvo.forEach(s => { s.material.opacity = 0.5 * Math.min(1, (k - 0.9) / 0.1); });
    } else if (id === "ventilacion") {
      polvo.forEach((s, i) => {
        s.material.opacity = 0.5 * Math.max(0, 1 - k * 1.25);
        s.position.copy(s.userData.base).addScaledVector(pt(1).sub(pt(0)), k * (6 + i));   // el aire lo arrastra
      });
      aire.forEach((e, i) => {
        e.visible = true;
        const l = lFJ - 2 - ((k * 3 + i / aire.length) % 1) * (lFJ - 6);
        e.position.copy(pt(l, 0.36 * (t.sec.ancho_mm / 1000), alto * 0.78));
      });
    } else if (id === "desatado") {
      persona.position.copy(pt(4.2 - k * 1.6, -0.5));
      barretilla.visible = true;
      barretilla.rotation.z = -0.5 + 0.35 * Math.sin(k * 40);
      caidas.forEach((r, i) => {
        const f = (k * 5 + i * 0.27) % 1;
        r.visible = f < 0.55;
        r.position.copy(pt(2.6 - k * 1.6 + i * 0.25, -0.2 + i * 0.15, alto * 0.9 * (1 - (f / 0.55) ** 2)));
      });
    }
  }

  return { lista, seg: lista.length * SEG_POR_ETAPA, aplicar };
}
