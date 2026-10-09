/* ============================================================================
   Render 3D — fondo permanente de la aplicacion.

   Los equipos se CONSTRUYEN desde sus cotas reales del catalogo: no hay modelos
   externos. La geometria sigue la silueta de un cargador de bajo perfil real:
   cuchara de perfil curvo extruido, brazo con cilindros hidraulicos, ROPS,
   chasis articulado con paneles inclinados y neumaticos con banda de rodadura.

   Cuatro modos:
     ficha        una unidad dentro del tunel de seccion, con cotas
     ciclo        animacion cargar - acarrear - descargar - retornar
     equivalencia N unidades de referencia frente a las que necesita el elegido
     simulacion   el ciclo completo sobre la red de galerias (red3d.js)

   Modulo ES: three y sus complementos se resuelven con el importmap de
   index.html hacia ui/vendor/. Las camaras viven en camaras.js.
   ========================================================================= */
import * as THREE from "three";
import { Red, construirRed, tramosDeMarcha, poseEn, redDeCiclo } from "./red3d.js";
import { crearCamaras } from "./camaras.js";
import { crearMinimapa } from "./minimapa.js";

const Render3D = (() => {
  let ren, esc, cam, lienzo;
  let camaras = null, minimapa = null;
  let redActual = null;            // red de galerias montada (solo en simulacion)
  let maquina = null;              // equipo que siguen las camaras
  let estilo = "corte";
  let raiz = null;                 // todo lo que se reconstruye por equipo
  let equipoActual = null, seccionActual = null, contexto = {};
  let modo = "ficha";
  let animables = [];              // {tipo, ...} actualizados cada cuadro
  const orbita = { theta: -0.78, phi: 1.1, radio: 22, objetivo: new THREE.Vector3(0, 1.4, 0) };
  const luces = {};
  let onFase = null;               // callback con el estado del ciclo

  /* ------------------------------------------------ tokens ------------- */
  const css = (n, r) => (getComputedStyle(document.documentElement)
    .getPropertyValue(n).trim() || r);

  function paleta() {
    return {
      fondo: css("--escena", css("--bg", "#15171a")), linea: css("--rule", "#343a42"),
      tinta: css("--ink", "#d7dbe0"), fuerte: css("--ink-strong", "#f1f4f7"),
      apagado: css("--muted", "#8b939d"), acento: css("--accent", "#4a9ee0"),
      ok: css("--ok", "#3fa985"), warn: css("--warn", "#c99230"), bad: css("--bad", "#d95926"),
    };
  }
  const M = mm => (mm || 0) / 1000;

  /* ------------------------------------------------ materiales --------- */
  /* Los materiales siguen el tema: en claro se aclaran las chapas y baja el
     metalness, porque un gris de tema oscuro sobre fondo blanco se lee negro. */
  const claro = () => document.documentElement.getAttribute("data-theme") === "light";

  const MAT = {
    acero: (c) => new THREE.MeshStandardMaterial({
      color: c, metalness: claro() ? 0.30 : 0.55, roughness: claro() ? 0.55 : 0.48 }),
    mate: (c) => new THREE.MeshStandardMaterial({
      color: c, metalness: 0.12, roughness: 0.85 }),
    caucho: () => new THREE.MeshStandardMaterial({
      color: claro() ? 0x2b2f35 : 0x1b1e23, metalness: 0.05, roughness: 0.95 }),
    cromo: () => new THREE.MeshStandardMaterial({
      color: claro() ? 0xe3e7ec : 0xc8cdd4, metalness: 0.85, roughness: 0.18 }),
  };
  // chapa principal y sombras, un par de escalones mas claros en tema claro
  const GRIS = () => (claro() ? 0x737c88 : 0x666e79);
  const GRIS_OSC = () => (claro() ? 0x4d555f : 0x3d434b);
  const luz = c => new THREE.MeshBasicMaterial({ color: c });

  /** Prisma con aristas biseladas: evita el aspecto de cubo plano. */
  function bloque(l, h, a, mat, bisel = 0.035) {
    // shape-x = ancho (acaba en Z), shape-y = alto (queda en Y), depth = largo (va a X)
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

  /** Panel trapezoidal: capós y guardabarros inclinados. */
  function cuna(l, h1, h2, a, mat) {
    // perfil lateral en XY (largo x alto) extruido a lo ancho en Z
    const f = new THREE.Shape();
    f.moveTo(0, -h1 / 2); f.lineTo(l, -h2 / 2); f.lineTo(l, h2 / 2); f.lineTo(0, h1 / 2);
    const g = new THREE.ExtrudeGeometry(f, { depth: a, bevelEnabled: false });
    g.translate(0, 0, -a / 2);
    return new THREE.Mesh(g, mat);
  }

  /**
   * Cuchara de perfil curvo: no es una caja. Se extruye el perfil lateral real
   * (dorso recto, panza curva, labio recto con dientes) a lo ancho.
   */
  function cuchara(volumen, anchoMax, mat, colLabio) {
    const g = new THREE.Group();
    const ancho = Math.min(anchoMax, Math.cbrt(volumen) * 1.62);
    const esc = Math.cbrt(volumen / 3.1);
    const P = 1.32 * esc;            // profundidad
    const A = 1.05 * esc;            // altura del dorso

    const perfil = new THREE.Shape();
    perfil.moveTo(0, A);                                  // borde superior trasero
    perfil.lineTo(P * 0.30, A);                           // techo corto
    perfil.quadraticCurveTo(P * 0.86, A * 0.86, P, A * 0.30);  // dorso curvo
    perfil.lineTo(P * 1.05, 0.02);                        // hacia el labio
    perfil.lineTo(P * 0.30, -A * 0.12);                   // panza
    perfil.quadraticCurveTo(-0.05, -A * 0.10, 0, A * 0.30);    // talon curvo
    perfil.lineTo(0, A);

    const geo = new THREE.ExtrudeGeometry(perfil, {
      depth: ancho, bevelEnabled: true, bevelThickness: 0.012,
      bevelSize: 0.012, bevelSegments: 1, curveSegments: 14,
    });
    // el perfil lateral vive en XY y la extrusion da el ancho en Z: sin rotar
    geo.translate(0, 0, -ancho / 2);
    const cuerpo = new THREE.Mesh(geo, mat);
    cuerpo.castShadow = true;
    g.add(cuerpo);

    // labio y dientes
    const labio = bloque(P * 0.10, A * 0.11, ancho * 1.005, MAT.acero(colLabio), 0.01);
    labio.position.set(P * 1.04, -0.01, 0);
    g.add(labio);
    const nd = Math.max(4, Math.round(ancho / 0.34));
    for (let i = 0; i < nd; i++) {
      const z = -ancho / 2 + ancho * ((i + 0.5) / nd);
      const d = new THREE.Mesh(
        new THREE.ConeGeometry(A * 0.055, A * 0.17, 4),
        MAT.acero(0x9aa3ad));
      d.rotation.z = -Math.PI / 2;
      d.position.set(P * 1.12, -0.02, z);
      g.add(d);
    }
    // nervios del dorso
    [-0.3, 0.3].forEach(f => {
      const n = bloque(P * 0.9, 0.035, 0.05, MAT.acero(GRIS_OSC()), 0.008);
      n.position.set(P * 0.5, A * 0.55, ancho * f);
      g.add(n);
    });
    // planchas laterales de desgaste y regla bajo el talon
    [-1, 1].forEach(s => {
      const pl = bloque(P * 0.55, A * 0.34, 0.03, MAT.acero(GRIS_OSC()), 0.006);
      pl.position.set(P * 0.70, A * 0.16, s * (ancho / 2 + 0.012));
      pl.rotation.z = -0.16;
      g.add(pl);
    });
    for (let i = 0; i < 3; i++) {
      const rg = bloque(P * 0.5, 0.025, ancho * 0.10, MAT.acero(GRIS_OSC()), 0.004);
      rg.position.set(P * 0.62, -A * 0.105, ancho * (-0.3 + i * 0.3));
      rg.rotation.z = 0.10;
      g.add(rg);
    }
    g.userData = { ancho, P, A };
    return g;
  }

  /** Cilindro hidraulico telescopico entre dos puntos. */
  function hidraulico(r, largo, extension = 0.45) {
    const g = new THREE.Group();
    const camisa = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, largo * (1 - extension), 14), MAT.acero(GRIS_OSC()));
    camisa.position.x = -largo * extension / 2;
    camisa.rotation.z = Math.PI / 2;
    const vastago = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.52, r * 0.52, largo * extension * 1.25, 12), MAT.cromo());
    vastago.position.x = largo * (0.5 - extension * 0.18);
    vastago.rotation.z = Math.PI / 2;
    g.add(camisa, vastago);
    return g;
  }

  /** Neumatico de bajo perfil con banda de rodadura y llanta. */
  function rueda(r, ancho) {
    const g = new THREE.Group();
    const n = new THREE.Mesh(new THREE.CylinderGeometry(r, r, ancho, 30), MAT.caucho());
    n.rotation.x = Math.PI / 2;
    n.castShadow = true;
    g.add(n);
    // tacos
    const tacos = 16;
    for (let i = 0; i < tacos; i++) {
      const a = (i / tacos) * Math.PI * 2;
      const t = new THREE.Mesh(
        new THREE.BoxGeometry(r * 0.17, r * 0.10, ancho * 0.88),
        MAT.mate(claro() ? 0x5a616a : 0x24282e));
      t.position.set(Math.cos(a) * r * 0.99, Math.sin(a) * r * 0.99, 0);
      t.rotation.z = a;
      g.add(t);
    }
    const llanta = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.56, r * 0.56, ancho * 1.04, 20), MAT.acero(0x7d858f));
    llanta.rotation.x = Math.PI / 2;
    g.add(llanta);
    const cubo = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.2, r * 0.2, ancho * 1.12, 12), MAT.acero(0x99a1aa));
    cubo.rotation.x = Math.PI / 2;
    g.add(cubo);
    // aro del talon y pernos, a los dos lados
    const matPerno = MAT.acero(0x4a5059);
    [-1, 1].forEach(s => {
      const aro = new THREE.Mesh(new THREE.TorusGeometry(r * 0.56, r * 0.035, 6, 22), MAT.acero(0x5f6771));
      aro.position.z = s * ancho * 0.52;
      g.add(aro);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const pn = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.035, r * 0.035, 0.03, 6), matPerno);
        pn.rotation.x = Math.PI / 2;
        pn.position.set(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, s * ancho * 0.535);
        g.add(pn);
      }
    });
    return g;
  }

  /* ------------------------------------------------ equipo -------------- */
  /**
   * Cargador de bajo perfil articulado, a escala de sus cotas.
   * Devuelve un grupo con partes nombradas para poder animarlas.
   */
  function construirEquipo(eq, opts = {}) {
    const p = paleta();
    const L = M(eq.largo_mm), W = M(eq.ancho_mm), H = M(eq.alto_mm);
    const acento = eq.energia === "Diesel" ? p.warn
      : eq.energia === "Bateria" ? p.ok : p.acento;
    const colAcento = new THREE.Color(acento);

    const g = new THREE.Group();
    const rR = Math.min(H * 0.33, L * 0.093);       // radio de rueda
    const anchoR = W * 0.20;
    const yEje = rR;
    const hCh = H * 0.34;                            // altura del chasis
    const yCh = yEje + hCh * 0.28;

    const xTrasFin = -L / 2 + L * 0.46;              // fin del cuerpo trasero
    const xArt = xTrasFin;                           // articulacion
    const xDelFin = xArt + L * 0.26;

    // Los dos bastidores giran alrededor de la articulacion: `T` y `F` reciben
    // las piezas en coordenadas del equipo y su pivote las hace quebrar en curva.
    const bastidor = () => {
      const piv = new THREE.Group(); piv.position.x = xArt;
      const dentro = new THREE.Group(); dentro.position.x = -xArt;
      piv.add(dentro); g.add(piv);
      return [piv, dentro];
    };
    const [pivT, T] = bastidor();
    const [pivF, F] = bastidor();

    // ---------------- cuerpo trasero: motor o banco de baterias ----------
    const lTras = L * 0.46;
    const tras = bloque(lTras * 0.92, hCh, W * 0.90, MAT.acero(GRIS()));
    tras.position.set(-L / 2 + lTras * 0.46, yCh, 0);
    T.add(tras);

    // capo inclinado (diesel alto, bateria bajo y plano)
    const hCapo = eq.energia === "Diesel" ? H * 0.24 : H * 0.13;
    const capo = cuna(lTras * 0.66, hCapo * 0.55, hCapo, W * 0.80, MAT.acero(GRIS_OSC()));
    capo.position.set(-L / 2 + lTras * 0.10, yCh + hCh / 2 + hCapo / 2, 0);
    T.add(capo);

    // rejilla del radiador o del pack
    const rejilla = bloque(0.06, hCapo * 0.62, W * 0.58, MAT.mate(claro() ? 0x656d77 : 0x22262b), 0.01);
    rejilla.position.set(-L / 2 + 0.05, yCh + hCh / 2 + hCapo * 0.5, 0);
    T.add(rejilla);
    for (let i = 0; i < 6; i++) {
      const b = bloque(0.02, hCapo * 0.06, W * 0.54, MAT.acero(GRIS_OSC()), 0.004);
      b.position.set(-L / 2 + 0.075, yCh + hCh / 2 + hCapo * (0.22 + i * 0.11), 0);
      T.add(b);
    }

    // guardabarros traseros
    [-1, 1].forEach(s => {
      const gb = cuna(rR * 2.3, hCh * 0.30, hCh * 0.16, anchoR * 1.15, MAT.acero(GRIS_OSC()));
      gb.position.set(-L / 2 + lTras * 0.34, yEje + rR * 1.06, s * (W / 2 - anchoR * 0.55));
      T.add(gb);
    });

    // ---------------- articulacion ---------------------------------------
    const junta = new THREE.Mesh(
      new THREE.CylinderGeometry(W * 0.085, W * 0.085, hCh * 1.12, 18), MAT.acero(colAcento));
    junta.position.set(xArt, yCh, 0);
    g.add(junta);
    // cilindros de direccion
    [-1, 1].forEach(s => {
      const cd = hidraulico(0.042, L * 0.14, 0.4);
      cd.position.set(xArt - L * 0.07, yCh + hCh * 0.10, s * W * 0.30);
      cd.rotation.y = s * 0.20;
      g.add(cd);
    });

    // ---------------- cuerpo delantero -----------------------------------
    const lDel = L * 0.26;
    const del = bloque(lDel * 0.94, hCh * 0.88, W * 0.90, MAT.acero(GRIS()));
    del.position.set(xArt + lDel * 0.5, yCh, 0);
    F.add(del);

    // cabina lateral con ROPS: marco de postes y techo, no una caja
    const hCab = H * 0.34, zCab = -W * 0.26;
    const piso = bloque(lDel * 0.56, 0.05, W * 0.34, MAT.acero(GRIS_OSC()), 0.01);
    piso.position.set(xArt + lDel * 0.44, yCh + hCh * 0.46, zCab);
    F.add(piso);
    const techo = bloque(lDel * 0.60, 0.055, W * 0.36, MAT.acero(colAcento), 0.012);
    techo.position.set(xArt + lDel * 0.44, yCh + hCh * 0.46 + hCab, zCab);
    F.add(techo);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
      const poste = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, hCab, 8), MAT.acero(GRIS_OSC()));
      poste.position.set(xArt + lDel * 0.44 + sx * lDel * 0.26,
                         yCh + hCh * 0.46 + hCab / 2, zCab + sz * W * 0.16);
      F.add(poste);
    });
    // asiento y consola
    const asiento = bloque(0.26, 0.30, 0.26, MAT.mate(claro() ? 0x5e666f : 0x2c3138), 0.03);
    asiento.position.set(xArt + lDel * 0.36, yCh + hCh * 0.46 + 0.19, zCab);
    F.add(asiento);

    // ---------------- brazo, cilindros y cuchara -------------------------
    const brazoGrupo = new THREE.Group();
    brazoGrupo.position.set(xDelFin - L * 0.02, yCh + hCh * 0.10, 0);

    const lBrazo = L * 0.22;
    [-1, 1].forEach(s => {
      // brazo en dos tramos, con quiebre: silueta de boom real
      const t1 = bloque(lBrazo * 0.58, 0.085, 0.075, MAT.acero(GRIS()), 0.015);
      t1.position.set(lBrazo * 0.29, 0.02, s * W * 0.30);
      t1.rotation.z = 0.10;
      const t2 = bloque(lBrazo * 0.48, 0.075, 0.068, MAT.acero(GRIS()), 0.015);
      t2.position.set(lBrazo * 0.79, -0.08, s * W * 0.30);
      t2.rotation.z = -0.22;
      brazoGrupo.add(t1, t2);
      // cilindro de levante
      const cl = hidraulico(0.052, lBrazo * 0.62, 0.42);
      cl.position.set(lBrazo * 0.30, -0.16, s * W * 0.235);
      cl.rotation.z = 0.30;
      brazoGrupo.add(cl);
    });
    // travesaño del brazo
    const trav = bloque(0.09, 0.07, W * 0.62, MAT.acero(GRIS_OSC()), 0.012);
    trav.position.set(lBrazo * 0.52, -0.02, 0);
    brazoGrupo.add(trav);

    // cuchara articulada al extremo del brazo
    const cuchGrupo = new THREE.Group();
    const cu = cuchara(eq.cuchara_m3 || 3, W * 0.99, MAT.acero(colAcento), 0x9aa3ad);
    cuchGrupo.add(cu);
    cuchGrupo.position.set(lBrazo * 1.02, -0.20, 0);
    brazoGrupo.add(cuchGrupo);
    // cilindro de volteo
    const cv = hidraulico(0.045, lBrazo * 0.42, 0.45);
    cv.position.set(lBrazo * 0.74, 0.16, 0);
    cv.rotation.z = -0.32;
    brazoGrupo.add(cv);

    F.add(brazoGrupo);

    // ---------------- ruedas ---------------------------------------------
    const ejes = [-L / 2 + lTras * 0.30, xArt + lDel * 0.55];
    const ruedas = [];
    ejes.forEach(x => {
      [-1, 1].forEach(s => {
        const r = rueda(rR, anchoR);
        r.position.set(x, yEje, s * (W / 2 - anchoR * 0.48));
        (x < xArt ? T : F).add(r);
        ruedas.push(r);
      });
    });

    // ---------------- distintivos por energia -----------------------------
    const extras = {};
    if (eq.energia === "Diesel") {
      const tubo = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.058, H * 0.34, 12), MAT.acero(claro() ? 0x6e767f : 0x2b2f35));
      tubo.position.set(-L / 2 + lTras * 0.22,
                        yCh + hCh / 2 + hCapo + H * 0.15, W * 0.27);
      T.add(tubo);
      const silenciador = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10, 0.10, H * 0.20, 14), MAT.acero(GRIS_OSC()));
      silenciador.position.set(-L / 2 + lTras * 0.22,
                               yCh + hCh / 2 + hCapo * 0.6, W * 0.27);
      T.add(silenciador);
      const humo = new THREE.Group();
      for (let i = 0; i < 10; i++) {
        const sp = new THREE.Mesh(
          new THREE.SphereGeometry(0.06 + i * 0.024, 7, 7),
          new THREE.MeshBasicMaterial({ color: 0x8b939d, transparent: true, opacity: 0.30 }));
        sp.userData.base = i * 0.2;
        humo.add(sp);
      }
      humo.position.copy(tubo.position);
      humo.position.y += H * 0.18;
      T.add(humo);
      extras.humo = humo;

    } else if (eq.energia === "Electrico-cable") {
      const carrete = new THREE.Mesh(
        new THREE.CylinderGeometry(H * 0.16, H * 0.16, W * 0.34, 22), MAT.acero(colAcento));
      carrete.rotation.x = Math.PI / 2;
      carrete.position.set(-L / 2 + lTras * 0.16, yCh + hCh * 0.62, 0);
      T.add(carrete);
      [-1, 1].forEach(s => {
        const brida = new THREE.Mesh(
          new THREE.CylinderGeometry(H * 0.19, H * 0.19, 0.03, 22), MAT.acero(GRIS_OSC()));
        brida.rotation.x = Math.PI / 2;
        brida.position.set(-L / 2 + lTras * 0.16, yCh + hCh * 0.62, s * W * 0.17);
        T.add(brida);
      });
      extras.cable = { metros: (eq.render && eq.render.cable_m) || 120, L, lTras };

    } else if (eq.energia === "Bateria") {
      const pack = bloque(lTras * 0.56, H * 0.16, W * 0.76, MAT.acero(colAcento), 0.02);
      pack.position.set(-L / 2 + lTras * 0.44, yCh + hCh / 2 + H * 0.08, 0);
      T.add(pack);
      for (let i = 0; i < 4; i++) {
        const celda = bloque(lTras * 0.11, H * 0.17, W * 0.72, MAT.acero(GRIS_OSC()), 0.012);
        celda.position.set(-L / 2 + lTras * (0.22 + i * 0.145), yCh + hCh / 2 + H * 0.08, 0);
        T.add(celda);
      }
      extras.bateria = { x: -L / 2 + lTras * 0.44, y: H + 0.5 };
    }

    // ---------------- detalle: lo que hace reconocible a un LHD ----------
    const xCola = -L / 2;
    // contrapeso con franjas de seguridad
    const contra = bloque(0.10, hCh * 0.62, W * 0.92, MAT.acero(GRIS_OSC()), 0.02);
    contra.position.set(xCola - 0.02, yCh - hCh * 0.10, 0);
    T.add(contra);
    for (let i = 0; i < 8; i++) {
      const fr = bloque(0.02, hCh * 0.16, W * 0.105, MAT.mate(i % 2 ? 0x1b1e23 : 0xd9a81e), 0.003);
      fr.position.set(xCola - 0.075, yCh - hCh * 0.30, -W * 0.40 + i * W * 0.114);
      T.add(fr);
    }
    // luces traseras, gancho de remolque y baliza
    [-1, 1].forEach(s => {
      const lt = bloque(0.03, 0.07, 0.13, luz(0xd23b2e), 0.004);
      lt.position.set(xCola - 0.075, yCh + hCh * 0.10, s * W * 0.36);
      T.add(lt);
      const lb = bloque(0.03, 0.07, 0.09, luz(0xfff1cf), 0.004);
      lb.position.set(xCola - 0.075, yCh + hCh * 0.10, s * W * 0.24);
      T.add(lb);
    });
    const gancho = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), MAT.acero(0x8a929b));
    gancho.rotation.y = Math.PI / 2;
    gancho.position.set(xCola - 0.09, yCh - hCh * 0.02, 0);
    T.add(gancho);
    // persianas laterales del capo y tapas de inspeccion
    [-1, 1].forEach(s => {
      for (let i = 0; i < 5; i++) {
        const pe = bloque(lTras * 0.07, hCh * 0.46, 0.018, MAT.mate(claro() ? 0x363b42 : 0x1d2025), 0.004);
        pe.position.set(xCola + lTras * (0.14 + i * 0.095), yCh + hCh * 0.02, s * W * 0.452);
        T.add(pe);
      }
      const tapa = bloque(lTras * 0.20, hCh * 0.50, 0.02, MAT.acero(GRIS_OSC()), 0.012);
      tapa.position.set(xCola + lTras * 0.76, yCh + hCh * 0.02, s * W * 0.453);
      T.add(tapa);
      const manija = bloque(0.07, 0.018, 0.03, MAT.cromo(), 0.004);
      manija.position.set(xCola + lTras * 0.82, yCh + hCh * 0.02, s * W * 0.468);
      T.add(manija);
    });
    // baranda sobre el capo
    const yCapo = yCh + hCh / 2 + hCapo;
    const matBar = MAT.mate(0xd9a81e);
    [-1, 1].forEach(s => {
      const lar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, lTras * 0.5, 6), matBar);
      lar.rotation.z = Math.PI / 2;
      lar.position.set(xCola + lTras * 0.50, yCapo + 0.20, s * W * 0.37);
      T.add(lar);
      [0.26, 0.50, 0.74].forEach(f => {
        const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6), matBar);
        pie.position.set(xCola + lTras * f, yCapo + 0.08, s * W * 0.37);
        T.add(pie);
      });
    });
    // planchas de la articulacion
    [-1, 1].forEach(s => {
      const pa = bloque(L * 0.11, 0.045, W * 0.34, MAT.acero(GRIS_OSC()), 0.012);
      pa.position.set(xArt, yCh + s * hCh * 0.50, 0);
      g.add(pa);
    });
    // bastidor delantero: guardabarros, tanque hidraulico, escalera y pasamanos
    [-1, 1].forEach(s => {
      const gb = cuna(rR * 2.2, hCh * 0.16, hCh * 0.30, anchoR * 1.15, MAT.acero(GRIS_OSC()));
      gb.position.set(xArt + lDel * 0.55 - rR * 1.1, yEje + rR * 1.06, s * (W / 2 - anchoR * 0.55));
      F.add(gb);
    });
    const tanque = bloque(lDel * 0.50, hCab * 0.46, W * 0.30, MAT.acero(GRIS()), 0.03);
    tanque.position.set(xArt + lDel * 0.42, yCh + hCh * 0.44 + hCab * 0.23, W * 0.27);
    F.add(tanque);
    const tapon = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), MAT.cromo());
    tapon.position.set(xArt + lDel * 0.30, yCh + hCh * 0.44 + hCab * 0.47, W * 0.27);
    F.add(tapon);
    const extintor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.30, 10), MAT.mate(0xc0392b));
    extintor.position.set(xArt + lDel * 0.72, yCh + hCh * 0.44 + 0.16, W * 0.13);
    F.add(extintor);
    for (let i = 0; i < 2; i++) {
      const esc2 = bloque(0.20, 0.025, 0.07, MAT.mate(0xd9a81e), 0.004);
      esc2.position.set(xArt + lDel * 0.44, yEje + rR * 0.25 + i * 0.26, -W * 0.475);
      F.add(esc2);
    }
    const pasam = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, hCab * 0.7, 6), matBar);
    pasam.position.set(xArt + lDel * 0.19, yCh + hCh * 0.46 + hCab * 0.36, zCab - W * 0.17);
    F.add(pasam);
    // cabina: respaldo de malla, consola con palancas y baliza
    const respaldo = bloque(0.03, hCab * 0.78, W * 0.30, MAT.mate(claro() ? 0x4a515a : 0x2a2e34), 0.006);
    respaldo.position.set(xArt + lDel * 0.19, yCh + hCh * 0.46 + hCab * 0.42, zCab);
    F.add(respaldo);
    const consola = bloque(0.16, 0.34, 0.20, MAT.mate(claro() ? 0x3b4149 : 0x22262b), 0.02);
    consola.position.set(xArt + lDel * 0.62, yCh + hCh * 0.46 + 0.19, zCab);
    F.add(consola);
    [-1, 1].forEach(s => {
      const pal = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), MAT.cromo());
      pal.position.set(xArt + lDel * 0.60, yCh + hCh * 0.46 + 0.43, zCab + s * 0.05);
      pal.rotation.z = 0.25;
      F.add(pal);
    });
    const baliza = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), luz(0xffa41c));
    baliza.position.set(xArt + lDel * 0.24, yCh + hCh * 0.46 + hCab + 0.07, zCab);
    F.add(baliza);
    // pasadores del brazo y mangueras hidraulicas
    [-1, 1].forEach(s => {
      [[0, 0.02], [lBrazo * 0.58, 0.05], [lBrazo * 1.02, -0.16]].forEach(([x, y]) => {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 10), MAT.cromo());
        pin.rotation.x = Math.PI / 2;
        pin.position.set(x, y, s * W * 0.30);
        brazoGrupo.add(pin);
      });
      const mang = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, lBrazo * 0.62, 6),
        MAT.caucho());
      mang.rotation.z = Math.PI / 2 - 0.05;
      mang.position.set(lBrazo * 0.36, 0.085, s * (W * 0.30 - 0.05));
      brazoGrupo.add(mang);
    });

    // punto de vista del operador, para la camara de cabina
    const ojo = new THREE.Object3D();
    ojo.position.set(xArt + lDel * 0.36, yCh + hCh * 0.46 + hCab * 0.74, zCab);
    F.add(ojo);

    // faros: solo donde hay galeria que iluminar
    if (opts.faros) {
      [-1, 1].forEach(s => {
        const faro = new THREE.SpotLight(0xfff1d6, 55, 38, 0.6, 0.6, 1.4);
        faro.position.set(xArt + lDel * 0.74, yCh + hCh * 0.46 + hCab + 0.06, zCab + s * W * 0.13);
        faro.target.position.set(xDelFin + 14, 0.7, s * W * 0.25);
        F.add(faro, faro.target);
        const lente = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
        lente.position.copy(faro.position);
        F.add(lente);
      });
    }

    g.userData = {
      cotas: { L, W, H, rR, yEje, yCh, hCh, xArt },
      brazo: brazoGrupo, cuchara: cuchGrupo, ruedas, extras, acento,
      frente: pivF, trasero: pivT, ojo,
      eq,
    };
    return g;
  }

  /* ------------------------------------------------ tunel --------------- */
  function construirTunel(sec, largo, cabe, x0 = 0) {
    const p = paleta();
    const g = new THREE.Group();
    if (!sec) return g;
    const sw = M(sec.ancho_mm), sh = M(sec.alto_mm);
    const col = cabe ? p.linea : p.bad;

    const forma = new THREE.Shape();
    forma.moveTo(-sw / 2, 0);
    forma.lineTo(-sw / 2, sh * 0.70);
    forma.quadraticCurveTo(-sw / 2, sh, 0, sh);
    forma.quadraticCurveTo(sw / 2, sh, sw / 2, sh * 0.70);
    forma.lineTo(sw / 2, 0);
    const pts = forma.getPoints(40);
    const geo = new THREE.BufferGeometry().setFromPoints(
      pts.map(v => new THREE.Vector3(0, v.y, v.x)));

    const n = Math.max(14, Math.round(largo / 1.4));
    for (let i = 0; i <= n; i++) {
      const ln = new THREE.Line(geo.clone(), new THREE.LineBasicMaterial({
        color: col, transparent: true,
        opacity: (cabe ? 0.40 : 0.72) * (0.30 + 0.70 * Math.cos((i / n - 0.5) * 2.1)) }));
      ln.position.x = x0 - largo / 2 + (largo / n) * i;
      g.add(ln);
    }
    [-sw / 2, sw / 2].forEach(z => [0, sh * 0.70].forEach(y => {
      const lg = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x0 - largo / 2, y, z), new THREE.Vector3(x0 + largo / 2, y, z)]);
      g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({
        color: col, transparent: true, opacity: cabe ? 0.32 : 0.6 })));
    }));
    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(largo, sw),
      new THREE.MeshStandardMaterial({ color: css("--panel", "#1c1f23"),
        roughness: 1, transparent: true, opacity: 0.6 }));
    piso.rotation.x = -Math.PI / 2;
    piso.position.x = x0;
    piso.receiveShadow = true;
    g.add(piso);
    return g;
  }

  /* ------------------------------------------------ etiquetas ----------- */
  /** `fija`: tamano constante en pantalla, para escenas grandes como la red. */
  function etiqueta(texto, col, escala = 1, fija = false) {
    const cv = document.createElement("canvas");
    const dpr = 2, pad = 9;
    const c0 = cv.getContext("2d");
    c0.font = `600 ${13 * dpr}px "IBM Plex Mono", monospace`;
    cv.width = Math.ceil(c0.measureText(texto).width) + pad * 2 * dpr;
    cv.height = 23 * dpr;
    const c = cv.getContext("2d");
    c.font = `600 ${13 * dpr}px "IBM Plex Mono", monospace`;
    c.fillStyle = col; c.textBaseline = "middle";
    c.fillText(texto, pad * dpr, cv.height / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false }));
    const alto = fija ? 0.0145 * escala : 0.42 * escala;
    sp.material.sizeAttenuation = !fija;
    sp.scale.set((cv.width / cv.height) * alto, alto, 1);
    sp.userData.mirar = true;
    return sp;
  }

  function cotasFicha(eq, sec, cabe) {
    const p = paleta();
    const g = new THREE.Group();
    if (!sec) return g;
    const W = M(eq.ancho_mm), H = M(eq.alto_mm);
    const sw = M(sec.ancho_mm);
    const x = M(eq.largo_mm) * 0.60;

    const trazo = (a, b, c) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]),
        new THREE.LineDashedMaterial({ color: c, dashSize: 0.16, gapSize: 0.12 }));
      l.computeLineDistances();
      return l;
    };
    g.add(trazo(new THREE.Vector3(x, 0.04, -W / 2), new THREE.Vector3(x, 0.04, W / 2), p.acento));
    const e1 = etiqueta(`${Math.round(eq.ancho_mm)} mm`, p.acento);
    e1.position.set(x, 0.30, 0); g.add(e1);

    g.add(trazo(new THREE.Vector3(x + 0.8, 0.04, -sw / 2),
                new THREE.Vector3(x + 0.8, 0.04, sw / 2), cabe ? p.apagado : p.bad));
    const e2 = etiqueta(`labor ${Math.round(sec.ancho_mm)} mm`, cabe ? p.apagado : p.bad);
    e2.position.set(x + 0.8, 0.30, sw / 2 + 0.95); g.add(e2);

    const hol = (sec.ancho_mm - eq.ancho_mm) / 2;
    const e3 = etiqueta(`${hol < 0 ? "−" : ""}${Math.abs(Math.round(hol))} mm/lado`,
      hol >= 300 ? p.ok : hol >= 0 ? p.warn : p.bad);
    e3.position.set(x, 0.70, sw / 2 + 0.6); g.add(e3);

    g.add(trazo(new THREE.Vector3(-x, 0, sw / 2 + 0.3),
                new THREE.Vector3(-x, H, sw / 2 + 0.3), p.acento));
    const e4 = etiqueta(`${Math.round(eq.alto_mm)} mm`, p.acento);
    e4.position.set(-x, H / 2, sw / 2 + 1.05); g.add(e4);

    if (!cabe) {
      const av = etiqueta("NO ENTRA EN LA LABOR", p.bad, 1.5);
      av.position.set(0, M(sec.alto_mm) + 0.8, 0);
      g.add(av);
    }
    return g;
  }

  /* ------------------------------------------------ modo EQUIVALENCIA --- */
  /**
   * Cuantas unidades del equipo de referencia hacen falta para igualar al
   * elegido, a la meta vigente. Es el escalon que explica el diente de sierra.
   */
  function montarEquivalencia(eq, ref, ctx) {
    const p = paleta();
    const g = new THREE.Group();
    const nSel = Math.max(1, ctx.n_sel || 1);
    const nRef = Math.max(1, ctx.n_ref || 1);
    const Lref = M(ref.largo_mm), Lsel = M(eq.largo_mm);
    const sepZ = Math.max(M(ref.ancho_mm), M(eq.ancho_mm)) * 2.4;
    const pasoX = Math.max(Lref, Lsel) * 1.25;

    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(pasoX * Math.max(nRef, nSel) + 12, sepZ * 3.4),
      new THREE.MeshStandardMaterial({ color: css("--panel", "#1c1f23"),
        roughness: 1, transparent: true, opacity: 0.5 }));
    piso.rotation.x = -Math.PI / 2;
    g.add(piso);

    const fila = (equipo, n, z, col, titulo, sub) => {
      const ancho = (n - 1) * pasoX;
      for (let i = 0; i < n; i++) {
        const m = construirEquipo(equipo);
        m.position.set(-ancho / 2 + i * pasoX, 0, z);
        g.add(m);
      }
      // rotulo a un costado de la fila, no encima de las maquinas
      const xRot = -ancho / 2 - pasoX * 0.62;
      const et = etiqueta(titulo, col, 1.75);
      et.position.set(xRot, M(equipo.alto_mm) * 0.95, z);
      g.add(et);
      const et2 = etiqueta(sub, p.apagado, 1.35);
      et2.position.set(xRot, M(equipo.alto_mm) * 0.95 - 0.72, z);
      g.add(et2);
      const lg = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-ancho / 2 - pasoX * 0.42, 0.02, z),
        new THREE.Vector3(ancho / 2 + pasoX * 0.42, 0.02, z)]);
      g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({
        color: col, transparent: true, opacity: 0.45 })));
      return ancho;
    };

    const colRef = ref.energia === "Diesel" ? p.warn : p.ok;
    const colSel = eq.energia === "Diesel" ? p.warn
      : eq.energia === "Bateria" ? p.ok : p.acento;
    const u = ctx.unidad || "TCS";

    fila(ref, nRef, -sepZ, colRef, `${nRef} × ${ref.modelo}`,
         `${Math.round(ctx.cap_ref || 0)} ${u}/dia c/u`);
    fila(eq, nSel, sepZ, colSel, `${nSel} × ${eq.modelo}`,
         `${Math.round(ctx.cap_sel || 0)} ${u}/dia c/u`);

    // veredicto al frente, separado de las filas
    const dif = nRef - nSel;
    const veredicto = dif > 0
      ? `ahorra ${dif} equipo${dif > 1 ? "s" : ""}`
      : dif === 0 ? "misma cantidad de equipos" : `exige ${-dif} equipo${-dif > 1 ? "s" : ""} mas`;
    const zFrente = sepZ * 2.05;
    const et = etiqueta(`meta ${Math.round(ctx.meta || 0)} ${u}/dia`, p.fuerte, 2.1);
    et.position.set(0, 1.9, zFrente);
    g.add(et);
    const et2 = etiqueta(veredicto, dif > 0 ? p.ok : p.apagado, 2.7);
    et2.position.set(0, 1.05, zFrente);
    g.add(et2);

    return g;
  }

  /* ------------------------------------------------ modo SIMULACION ----- */
  /**
   * Recorrido completo por las tres secciones reales de la Mina Socorro:
   *   labor de produccion 3.0 x 3.0  ->  rampa positiva 3.0 x 3.7
   *   ->  Rampa Fernando principal 4.0 x 4.0, donde esta el echadero.
   * (Deudor Yalico 2019, PDF p. 90-92.)
   *
   * La posicion es funcion PURA del tiempo normalizado: por eso la barra de
   * reproduccion se puede arrastrar hacia adelante o hacia atras sin desfase.
   */
  // `vel` multiplica el tiempo real: a 1x un minuto del ciclo dura un minuto.
  const SIM = { t: 0, play: true, seg: 90, ciclos: 6, cb: null, ultimo: 0, vel: 1 };

  function montarSimulacionRecta(eq, ctx) {
    const p = paleta();
    const g = new THREE.Group();
    const L = M(eq.largo_mm);

    const secs = (ctx.secciones && ctx.secciones.length >= 3)
      ? [ctx.secciones[2], ctx.secciones[1], ctx.secciones[0]]
      : [
          { nombre: "Labor de produccion", ancho_mm: 3000, alto_mm: 3000 },
          { nombre: "Rampa positiva", ancho_mm: 3000, alto_mm: 3700 },
          { nombre: "Rampa Fernando", ancho_mm: 4000, alto_mm: 4000 },
        ];
    const tramo = Math.max(13, L * 2.1);
    const xs = [-tramo, 0, tramo];

    secs.forEach((sec, i) => {
      const cabe = eq.ancho_mm + 2 * (ctx.holguraLado || 300) <= sec.ancho_mm;
      g.add(construirTunel(sec, tramo * 1.02, cabe, xs[i]));
      const et = etiqueta(
        sec.nombre + "  " + Math.round(sec.ancho_mm) + " x " + Math.round(sec.alto_mm) + " mm",
        cabe ? p.apagado : p.bad, 1.4);
      et.position.set(xs[i], M(sec.alto_mm) + 0.8, 0);
      g.add(et);
    });

    // frente de minado con su pila
    const xPila = xs[0] - tramo * 0.34;
    for (let i = 0; i < 22; i++) {
      const r = 0.15 + Math.random() * 0.22;
      const roca = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0),
        MAT.mate(claro() ? 0x8d96a1 : 0x545b64));
      roca.position.set(xPila + (Math.random() - 0.5) * 1.8, r * 0.8,
                        (Math.random() - 0.5) * 2.0);
      roca.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      roca.castShadow = true;
      g.add(roca);
    }
    const etF = etiqueta("frente de minado", p.warn, 1.3);
    etF.position.set(xPila, 2.0, 0);
    g.add(etF);

    // echadero en la rampa principal
    const xOre = xs[2] + tramo * 0.30;
    const boca = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.14, 26),
      MAT.mate(claro() ? 0x6a727c : 0x14171a));
    boca.position.set(xOre, 0.07, 0);
    g.add(boca);
    const aro = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.06, 8, 30), MAT.acero(p.acento));
    aro.rotation.x = -Math.PI / 2;
    aro.position.set(xOre, 0.11, 0);
    g.add(aro);
    const etO = etiqueta("echadero al pique", p.acento, 1.3);
    etO.position.set(xOre, 1.8, 0);
    g.add(etO);

    const maq = construirEquipo(eq);
    g.add(maq);

    const fases = [
      { id: "carga", label: "Cargando en el frente", min: ctx.t_carga || 0.6 },
      { id: "acarreo", label: "Acarreo cargado al echadero", min: ctx.t_acarreo || 0.6 },
      { id: "descarga", label: "Descargando en el echadero", min: ctx.t_descarga || 0.3 },
      { id: "retorno", label: "Retorno vacio al frente", min: ctx.t_retorno || 0.4 },
    ];
    animables.push({
      tipo: "sim", grupo: maq, fases,
      totalMin: fases.reduce((a, f) => a + f.min, 0),
      xPila, xOre, capacidad: ctx.cap_cuchara || 4.8, unidad: ctx.unidad || "TCS",
    });
    g.userData.extent = xOre - xPila;
    return g;
  }

  /** Coloca la maquina para el tiempo dado. Sin estado acumulado. */
  function aplicarSim(a, t01) {
    const g = a.grupo, u = g.userData;
    const total = SIM.ciclos;
    const pos = t01 * total;
    const ciclo = Math.min(Math.floor(pos), total - 1);
    const dentro = pos - ciclo;

    let acum = 0;
    const tramos = a.fases.map(f => {
      const ini = acum / a.totalMin; acum += f.min;
      return { id: f.id, label: f.label, ini, fin: acum / a.totalMin };
    });
    const fase = tramos.find(f => dentro >= f.ini && dentro < f.fin) || tramos[tramos.length - 1];
    const k = (dentro - fase.ini) / Math.max(fase.fin - fase.ini, 1e-6);
    const suave = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

    const x0 = a.xPila + 1.7, x1 = a.xOre - 2.0;
    let x = x0, brazo = 0, volteo = 0, rod = 0;

    if (fase.id === "carga") {
      x = x0;
      brazo = Math.sin(k * Math.PI) * 0.24;
      volteo = -Math.sin(k * Math.PI) * 0.34;
    } else if (fase.id === "acarreo") {
      x = x0 + suave * (x1 - x0);
      brazo = 0.09; volteo = -0.13; rod = suave * (x1 - x0);
    } else if (fase.id === "descarga") {
      x = x1;
      brazo = 0.09 + Math.sin(k * Math.PI) * 0.18;
      volteo = -0.13 + Math.sin(k * Math.PI) * 1.15;
    } else {
      x = x1 - suave * (x1 - x0);
      brazo = 0.02; volteo = -0.05; rod = -suave * (x1 - x0);
    }

    g.position.set(x, 0, 0);
    // el giro entra y sale de forma progresiva, no de un salto
    if (fase.id === "retorno") {
      g.rotation.y = Math.PI * Math.min(1, Math.min(k / 0.10, (1 - k) / 0.10));
    } else {
      g.rotation.y = 0;
    }

    if (u.brazo) u.brazo.rotation.z = brazo;
    if (u.cuchara) u.cuchara.rotation.z = volteo;
    u.ruedas.forEach(r => { r.rotation.z = -rod * 0.55; });

    if (!a.carga) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 9),
        MAT.mate(claro() ? 0x8d96a1 : 0x6b737d));
      u.cuchara.add(c);
      a.carga = c;
    }
    a.carga.visible = fase.id === "acarreo" || (fase.id === "descarga" && k < 0.5);
    a.carga.position.set(0.38, 0.32, 0);
    a.carga.scale.setScalar(Math.cbrt((a.capacidad || 4.8) / 4.8));

    if (SIM.cb) SIM.cb({
      t01, ciclo: ciclo + 1, ciclos: total,
      fase: fase.label, id: fase.id,
      minuto: (pos * a.totalMin).toFixed(1),
      totalMin: (total * a.totalMin).toFixed(1),
      masa: (ciclo * a.capacidad).toFixed(1),
      unidad: a.unidad,
    });
  }

  /* ---------------- simulacion sobre la red de galerias ---------------- */
  /**
   * Frente -> camara de maniobra (reversa) -> rampa positiva -> Rampa Fernando
   * -> echadero, y regreso. El equipo sigue el eje de la red por distancia
   * recorrida; los dos bastidores toman la curva por separado.
   */
  function montarSimRed(eq, ctx, doc = ctx.red, secciones = ctx.secciones) {
    const p = paleta();
    const red = new Red(doc, secciones);
    const R = construirRed(red, eq, { ...ctx, red: doc }, {
      p, MAT, claro, etiqueta: (t, c, e) => etiqueta(t, c, e, true) });
    const maq = construirEquipo(eq, { faros: true });
    maq.rotation.order = "YZX";
    R.grupo.add(maq);
    R.setEstilo(estilo);

    const legs = tramosDeMarcha(red, eq, R);
    // El tiempo de viaje sale de lo que el equipo recorre de verdad y de la
    // velocidad de cada tramo (la del modelo, o menos si la potencia no alcanza
    // en subida): asi la velocidad que se ve es la del calculo.
    const metros = ls => ls.reduce((d, l) => d + l.dist, 0);
    const minutos = ls => ls.reduce((d, l) => d + l.min, 0);
    cronometrar(legs.acarreo, red, doc.vel, true, ctx.vel_cargado || 8);
    cronometrar(legs.retorno, red, doc.vel, false, ctx.vel_vacio || 12);
    const fases = [
      { id: "carga", label: "Cargando en el frente", min: ctx.t_carga || 0.6 },
      { id: "acarreo", label: "Acarreo cargado al echadero", legs: legs.acarreo, min: minutos(legs.acarreo) },
      { id: "descarga", label: "Descargando en el echadero", min: ctx.t_descarga || 0.3 },
      { id: "retorno", label: "Retorno vacio al frente", legs: legs.retorno, min: minutos(legs.retorno) },
    ];
    if (doc.vistas) R.vistas = doc.vistas;
    if (doc.inicio) R.nodoInicio = doc.inicio;
    R.metros = { acarreo: metros(legs.acarreo), retorno: metros(legs.retorno) };
    animables.push({
      tipo: "simred", grupo: maq, fases, legs, R,
      totalMin: fases.reduce((a, f) => a + f.min, 0),
      capacidad: ctx.cap_cuchara || 4.8, unidad: ctx.unidad || "TCS",
    });
    return R;
  }

  /**
   * Reparte cada tramo de marcha en segmentos de velocidad constante segun la
   * galeria que pisa. Deja en el tramo sus minutos y `en(w)`: estacion y km/h
   * cuando ha transcurrido la fraccion w de su tiempo.
   */
  function cronometrar(legs, red, vel, cargado, kmhPlano) {
    legs.forEach(l => {
      const ids = l.tr.ids, lo = Math.min(l.s0, l.s1), hi = Math.max(l.s0, l.s1);
      const segs = [];
      l.tr.elems.forEach(e => {
        const a = Math.max(lo, e.s0), b = Math.min(hi, e.s0 + e.len);
        if (b - a < 1e-6) return;
        const i = Math.min(e.i, ids.length - 2);          // un arco toma el borde que sigue
        const bd = red.bordes.get(ids[i] + "|" + ids[i + 1]);
        const tabla = vel && vel[bd.t.id] && vel[bd.t.id][cargado ? "cargado" : "vacio"];
        // el equipo avanza en el sentido de los nodos del tramo si coinciden eje y marcha
        const v = tabla ? tabla[bd.inv === l.rev ? 0 : 1] : kmhPlano;
        segs.push({ a, b, v, min: (b - a) / 1000 / v * 60 });
      });
      if (l.rev) segs.reverse();
      l.segs = segs;
      l.min = segs.reduce((t, g) => t + g.min, 0);
      l.en = w => {
        let t = Math.max(0, Math.min(1, w)) * l.min;
        for (const g of segs) {
          if (t <= g.min || g === segs[segs.length - 1]) {
            const f = g.min ? Math.min(1, t / g.min) : 1;
            return [l.rev ? g.b - f * (g.b - g.a) : g.a + f * (g.b - g.a), g.v];
          }
          t -= g.min;
        }
        return [l.s1, kmhPlano];
      };
    });
  }

  /**
   * Perfil de marcha: acelera, mantiene velocidad de crucero y frena. Devuelve
   * [avance 0..1, velocidad relativa a la media]. El pico es solo 1.1x la media.
   */
  const RAMPA = 0.1;
  function marchaEn(w) {
    const c = 1 / (1 - RAMPA);
    if (w < RAMPA) return [c * w * w / (2 * RAMPA), c * w / RAMPA];
    if (w > 1 - RAMPA) return [1 - c * (1 - w) * (1 - w) / (2 * RAMPA), c * (1 - w) / RAMPA];
    return [c * (w - RAMPA / 2), c];
  }
  const _off = new THREE.Vector3();

  /** Lleva el equipo a la estacion s del eje `tr`. */
  function posar(a, tr, s) {
    const g = a.grupo, u = g.userData, c = u.cotas;
    const q = poseEn(tr, s, u.eq);
    g.rotation.set(0, q.rumbo, q.cabeceo);
    _off.set(c.xArt, 0, 0).applyEuler(g.rotation);
    g.position.set(q.x - _off.x, q.z - _off.y, -q.y - _off.z);
    u.frente.rotation.y = q.quiebre / 2;
    u.trasero.rotation.y = -q.quiebre / 2;
    u.ruedas.forEach(r => { r.rotation.z = -s / c.rR; });
    a.pose = q;
  }

  /** Coloca el equipo para el tiempo dado. Sin estado acumulado. */
  function aplicarSimRed(a, t01) {
    const u = a.grupo.userData;
    const total = SIM.ciclos;
    const pos = t01 * total;
    const ciclo = Math.min(Math.floor(pos), total - 1);
    const dentro = pos - ciclo;

    let acum = 0;
    const tramos = a.fases.map(f => {
      const ini = acum / a.totalMin; acum += f.min;
      return { ...f, ini, fin: acum / a.totalMin };
    });
    const fase = tramos.find(f => dentro >= f.ini && dentro < f.fin) || tramos[tramos.length - 1];
    const k = (dentro - fase.ini) / Math.max(fase.fin - fase.ini, 1e-6);

    let brazo = 0, volteo = 0, marcha = "", kmh = 0;
    if (fase.legs) {
      // el tiempo de la fase se reparte entre sus tramos de marcha segun lo que tardan
      const dur = fase.legs.reduce((d, l) => d + l.min, 0);
      let ac = 0, leg = fase.legs[fase.legs.length - 1], w = 1;
      for (const l of fase.legs) {
        const f = l.min / dur;
        if (k < ac + f) { leg = l; w = (k - ac) / f; break; }
        ac += f;
      }
      const [avance, rel] = marchaEn(w);
      const [est, v] = leg.en(avance);
      posar(a, leg.tr, est);
      kmh = v * rel;
      marcha = leg.rev ? " (reversa)" : "";
      if (fase.id === "acarreo") { brazo = 0.09; volteo = -0.13; }
      else { brazo = 0.02; volteo = -0.05; }
    } else if (fase.id === "carga") {
      const l = a.legs.acarreo[0];
      posar(a, l.tr, l.s0);
      brazo = Math.sin(k * Math.PI) * 0.24;
      volteo = -Math.sin(k * Math.PI) * 0.34;
    } else {
      const l = a.legs.acarreo[a.legs.acarreo.length - 1];
      posar(a, l.tr, l.s1);
      brazo = 0.09 + Math.sin(k * Math.PI) * 0.18;
      volteo = -0.13 + Math.sin(k * Math.PI) * 1.15;
    }
    if (u.brazo) u.brazo.rotation.z = brazo;
    if (u.cuchara) u.cuchara.rotation.z = volteo;

    if (!a.carga) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 9),
        MAT.mate(claro() ? 0x8d96a1 : 0x6b737d));
      u.cuchara.add(c);
      a.carga = c;
    }
    a.carga.visible = fase.id === "acarreo" || (fase.id === "descarga" && k < 0.5);
    a.carga.position.set(0.38, 0.32, 0);
    a.carga.scale.setScalar(Math.cbrt((a.capacidad || 4.8) / 4.8));

    if (SIM.cb) SIM.cb({
      t01, ciclo: ciclo + 1, ciclos: total,
      fase: fase.label + marcha, id: fase.id,
      minuto: (pos * a.totalMin).toFixed(1),
      totalMin: (total * a.totalMin).toFixed(1),
      masa: (ciclo * a.capacidad).toFixed(1),
      unidad: a.unidad, kmh: kmh.toFixed(1),
    });
    if (onFase && modo === "ciclo") onFase({
      fase: fase.label + marcha, id: fase.id, progreso: dentro,
      minuto: (dentro * a.totalMin).toFixed(2), totalMin: a.totalMin.toFixed(2),
      kmh: kmh.toFixed(1), metros: a.R.metros,
    });
  }

  /**
   * Modo Ciclo: el ciclo del Excel sobre una red minima a nivel (frente, camara
   * de maniobra y crucero al echadero), con la distancia de acarreo del modelo.
   */
  function montarCicloRed(eq, sec, ctx) {
    const s = { clave: "ciclo", ancho_mm: 3000, alto_mm: 3000, ...(sec || {}) };
    s.clave = s.clave || "ciclo";
    const R = montarSimRed(eq, ctx, redDeCiclo(eq, s, ctx), [s]);
    R.vistas = [
      { id: "general", nombre: "General" },
      { id: "frente", nombre: "Frente", nodo: "F", desde: "J", theta: -2.0, radio: 17 },
      { id: "giro", nombre: "Giro", nodo: "J", desde: "M", theta: -1.1, radio: 22 },
      { id: "echadero", nombre: "Echadero", nodo: "O", desde: "J", theta: 2.4, radio: 19 },
    ];
    R.nodoInicio = ["J", "F"];
    return R;
  }

  function setSimVel(v) { SIM.vel = Math.max(0.25, Math.min(32, +v || 1)); }
  function setSimTiempo(t01) { SIM.t = Math.max(0, Math.min(1, t01)); }
  function setSimPlay(v) { SIM.play = !!v; SIM.ultimo = performance.now(); }
  const getSim = () => ({ t: SIM.t, play: SIM.play, seg: SIM.seg, vel: SIM.vel });
  function alSimTick(fn) { SIM.cb = fn; }

  /* ------------------------------------------------ escena -------------- */
  function iniciar(canvas) {
    lienzo = canvas;
    ren = new THREE.WebGLRenderer({ canvas, antialias: true });
    ren.setPixelRatio(Math.min(devicePixelRatio, 2));
    ren.shadowMap.enabled = true;
    ren.shadowMap.type = THREE.PCFSoftShadowMap;

    esc = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(42, 1, 0.1, 900);

    luces.hemi = new THREE.HemisphereLight(0xc2ccd8, 0x15181c, 1.0);
    esc.add(luces.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.45);
    key.position.set(10, 16, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -22; key.shadow.camera.right = 22;
    key.shadow.camera.top = 22; key.shadow.camera.bottom = -22;
    esc.add(key);
    luces.key = key;
    const relleno = new THREE.DirectionalLight(0x86aed2, 0.5);
    relleno.position.set(-9, 6, -8);
    esc.add(relleno);
    luces.relleno = relleno;
    const borde = new THREE.DirectionalLight(0xffffff, 0.35);
    borde.position.set(-4, 3, 12);
    esc.add(borde);
    luces.borde = borde;

    cam.position.set(Math.cos(orbita.theta), 0.5, Math.sin(orbita.theta));   // azimut inicial
    camaras = crearCamaras(cam, canvas);
    actualizarTema();
    redimensionar();
    addEventListener("resize", redimensionar);
    animar();
  }

  /** Luz de superficie para las vistas exteriores; penumbra y lamparas dentro. */
  function ambientar() {
    if (!esc) return;
    const p = paleta(), cl = claro();
    const dentro = !!redActual && camaras && camaras.interior();
    const enRed = !!redActual;
    const k = dentro ? 0.14 : enRed ? 0.75 : 1;
    luces.hemi.intensity = (cl ? 1.55 : 1.0) * (dentro ? 0.5 : enRed ? 0.85 : 1);
    luces.key.intensity = (cl ? 1.05 : 1.45) * k;
    luces.relleno.intensity = (cl ? 0.85 : 0.5) * k;
    luces.borde.intensity = (cl ? 0.55 : 0.35) * k;
    if (redActual) redActual.lamparas.forEach(l => { l.intensity = dentro ? 34 : 9; });
    // los rotulos no tapan la vista desde dentro de la galeria
    if (redActual) redActual.rotulos.forEach(r => { r.visible = !dentro; });
    const fondo = new THREE.Color(dentro ? (cl ? "#3a3f46" : "#060708") : p.fondo);
    esc.background = fondo;
    const r = orbita.radio;
    esc.fog = dentro ? new THREE.Fog(fondo, 14, 85)
      : new THREE.Fog(fondo, Math.max(30, r * 1.3), Math.max(120, r * 4.5));
  }

  function actualizarTema() {
    if (!esc) return;
    const p = paleta();
    const cl = claro();
    // en tema claro el rebote del piso sube y el contraste baja: si no, la
    // maquina queda como una silueta negra sobre blanco
    if (luces.hemi) {
      luces.hemi.color.set(cl ? 0xffffff : 0xc2ccd8);
      luces.hemi.groundColor.set(cl ? 0xbcc3cc : 0x15181c);
      luces.hemi.intensity = cl ? 1.55 : 1.0;
    }
    if (luces.key) luces.key.intensity = cl ? 1.05 : 1.45;
    if (luces.relleno) {
      luces.relleno.color.set(cl ? 0xd6e4f0 : 0x86aed2);
      luces.relleno.intensity = cl ? 0.85 : 0.5;
    }
    if (luces.borde) luces.borde.intensity = cl ? 0.55 : 0.35;
    ambientar();
    if (equipoActual) reconstruir(true);
  }

  function redimensionar() {
    if (!ren || !lienzo) return;
    const w = lienzo.clientWidth || innerWidth, h = lienzo.clientHeight || innerHeight;
    ren.setSize(w, h, false);
    cam.aspect = w / Math.max(h, 1);
    cam.updateProjectionMatrix();
  }

  /* ------------------------------------------------ carga --------------- */
  function limpiar() {
    if (!raiz) return;
    esc.remove(raiz);
    raiz.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material])
        .forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    raiz = null;
    animables = [];
    redActual = null;
    maquina = null;
  }

  let modoRed = "";               // modo con el que se monto la red vigente
  function reconstruir(recarga = false) {
    if (!esc || !equipoActual) return;
    recarga = recarga && !!redActual && modo === modoRed;
    limpiar();
    raiz = new THREE.Group();
    const eq = equipoActual, sec = seccionActual, ctx = contexto;

    const tSim = SIM.t;
    let theta = null;
    if ((modo === "simulacion" && ctx.red) || modo === "ciclo") {
      const R = modo === "ciclo" ? montarCicloRed(eq, sec, ctx) : montarSimRed(eq, ctx);
      SIM.ciclos = modo === "ciclo" ? 1 : 6;
      modoRed = modo;
      raiz.add(R.grupo);
      redActual = R;
      orbita.radio = Math.max(40, Math.hypot(R.tam.x, R.tam.z) * 1.1);
      orbita.phi = 0.86;
      orbita.objetivo.set(0, 0, 0);
      // al cambiar de equipo o de tema la simulacion sigue donde iba
      SIM.t = recarga ? tSim : 0;
      if (!recarga) { SIM.play = true; theta = -2.2; }
      SIM.ultimo = performance.now();

    } else if (modo === "simulacion") {
      const escSim = montarSimulacionRecta(eq, ctx);
      raiz.add(escSim);
      orbita.radio = Math.max(32, (escSim.userData.extent || 32) * 0.92);
      orbita.phi = 1.05;
      orbita.objetivo.set(0, 1.3, 0);
      SIM.t = 0; SIM.play = true; SIM.ultimo = performance.now();

    } else if (modo === "equivalencia" && ctx.referencia) {
      raiz.add(montarEquivalencia(eq, ctx.referencia, ctx));
      const n = Math.max(ctx.n_ref || 1, ctx.n_sel || 1);
      orbita.radio = Math.max(21, M(eq.largo_mm) * 1.15 * n + 10);
      orbita.objetivo.set(0, 0.9, 0);
      orbita.phi = 1.16;
      theta = -1.02;

    } else {
      const cabe = !sec || (eq.ancho_mm + 2 * (ctx.holguraLado ?? 300) <= sec.ancho_mm
        && eq.alto_mm + (ctx.holguraTecho ?? 300) <= sec.alto_mm);
      raiz.add(construirTunel(sec, Math.max(M(eq.largo_mm) * 2.3, 15), cabe));
      const maq = construirEquipo(eq);
      raiz.add(maq);
      raiz.add(cotasFicha(eq, sec, cabe));
      animables.push({ tipo: "ficha", grupo: maq });
      orbita.radio = Math.max(13, M(eq.largo_mm) * 2.0);
      orbita.objetivo.set(0, M(eq.alto_mm) * 0.5, 0);
    }

    esc.add(raiz);

    // el equipo principal es el del animable (ficha, ciclo o simulacion)
    const an = animables.find(a => a.grupo);
    maquina = an ? an.grupo : null;
    const lado = redActual ? 40 : 22;
    const sc = luces.key.shadow.camera;
    sc.left = -lado; sc.right = lado; sc.top = lado; sc.bottom = -lado;
    sc.far = redActual ? 120 : 60;
    sc.updateProjectionMatrix();
    luces.key.position.set(10, 16, 9).multiplyScalar(redActual ? 2.2 : 1);

    const [nIni, nMira] = (redActual && redActual.nodoInicio) || ["J1", "F"];
    const inicio = redActual ? redActual.mundoNodo(nIni, 0.2) : null;
    camaras.setEscena({ red: redActual, maquina, inicio,
      mirarInicio: redActual ? redActual.mundoNodo(nMira, 1.5) : null });
    if (!recarga || !redActual) {
      camaras.encuadrar({ objetivo: orbita.objetivo, theta, phi: orbita.phi, radio: orbita.radio });
    }
    camaras.reanudarGiro();
    if (minimapa) minimapa.setRed(redActual ? redActual.planta : null,
                                  redActual ? redActual.red.doc.nodos : null);
    ambientar();
    if (alEscena) alEscena(estadoEscena());
  }

  /* ------------------------------------------------ camaras y vistas ---- */
  let alEscena = null, alCamara = null;
  const VISTAS_RED = [
    { id: "general", nombre: "General" },
    { id: "frente", nombre: "Frente", nodo: "F", desde: "J1", theta: -2.0, radio: 17 },
    { id: "cruce", nombre: "Interseccion", nodo: "J1", desde: "M", theta: -1.1, radio: 20 },
    { id: "y", nombre: "Rampa en Y", nodo: "J2", desde: "J1", theta: -2.6, radio: 22 },
    { id: "zigzag", nombre: "Zig-zag", nodo: "C1", desde: "J2", theta: -0.5, radio: 26 },
    { id: "echadero", nombre: "Echadero", nodo: "O", desde: "K", theta: 2.4, radio: 19 },
  ];

  const vistasRed = () => (redActual ? (redActual.vistas || VISTAS_RED) : []);
  function estadoEscena() {
    return { modo, red: !!redActual, maquina: !!maquina && modo !== "equivalencia",
             camara: camaras ? camaras.getModo() : "orbita", estilo,
             vistas: vistasRed().map(v => ({ id: v.id, nombre: v.nombre })) };
  }

  function irAVista(id) {
    const v = vistasRed().find(x => x.id === id);
    if (!v || !redActual) return;
    if (!v.nodo) {
      if (camaras.getModo() !== "orbita") camaras.setModo("orbita");
      return camaras.encuadrar({ objetivo: orbita.objetivo, theta: -2.2,
                                 phi: orbita.phi, radio: orbita.radio }, true);
    }
    const cm = camaras.getModo();
    if (cm === "caminar") {
      // de pie en la galeria, unos metros antes del punto y mirandolo
      const a = redActual.mundoNodo(v.desde), b = redActual.mundoNodo(v.nodo);
      const d = a.clone().sub(b).setY(0);
      const pie = b.clone().addScaledVector(d.normalize(), Math.min(7, a.distanceTo(b) * 0.6));
      pie.y = Math.max(a.y, b.y) + 1.0;
      camaras.irA(pie, b.clone().setY(b.y + 1.5));
      return;
    }
    if (cm !== "orbita") camaras.setModo("orbita");
    camaras.encuadrar({ objetivo: redActual.mundoNodo(v.nodo, 1.4),
                        theta: v.theta, phi: 0.95, radio: v.radio }, true);
  }

  function setCamara(m) {
    camaras.setModo(m);
    ambientar();
    if (alCamara) alCamara(camaras.getModo());
  }
  function setEstilo(e) {
    estilo = e === "transparente" ? "transparente" : "corte";
    if (redActual) redActual.setEstilo(estilo);
  }
  function conectarMinimapa(canvas) {
    minimapa = crearMinimapa(canvas, (x, y) => {
      if (!redActual) return;
      const w = redActual.mundoPlanta(x, y, redActual.centro.y);
      const piso = redActual.pisoEn(w.clone().setY(40), 80);
      if (piso == null) return;              // clic fuera de las galerias
      w.y = piso + 0.2;
      camaras.irA(w);
    });
    minimapa.setRed(redActual ? redActual.planta : null,
                    redActual ? redActual.red.doc.nodos : null);
  }
  let ultimoMapa = 0;
  const _dir = new THREE.Vector3();
  function pintarMinimapa(t) {
    if (!minimapa || !redActual || t - ultimoMapa < 80) return;
    ultimoMapa = t;
    const a = animables.find(x => x.tipo === "simred");
    const c = redActual.plantaDeMundo(cam.position);
    cam.getWorldDirection(_dir);
    const rev = (contexto.red && contexto.red.revision) || {};
    minimapa.dibujar({
      equipo: a && a.pose ? { x: a.pose.x, y: a.pose.y, rumbo: a.pose.rumbo } : null,
      camara: { x: c.x, y: c.y, rumbo: Math.atan2(-_dir.z, _dir.x) },
      malas: new Set(Object.values(rev).filter(r => !r.cabe).map(r => r.nodo)),
    });
  }

  function cargarEquipo(eq, sec, opts = {}) {
    if (!esc || !eq) return;
    equipoActual = eq;
    seccionActual = sec;
    contexto = { ...contexto, ...opts };
    reconstruir(true);
  }

  function setModo(m) {
    if (m === modo) return;
    modo = m;
    reconstruir();
  }
  const getModo = () => modo;
  function setContexto(c) { contexto = { ...contexto, ...c }; }
  function alCambiarFase(fn) { onFase = fn; }

  /* ------------------------------------------------ animacion ----------- */
  let tPrevio = performance.now();
  function animar() {
    requestAnimationFrame(animar);
    if (!ren) return;
    const t = performance.now();
    const dt = Math.min(0.1, (t - tPrevio) / 1000);
    tPrevio = t;

    animables.forEach(a => {
      if (a.tipo === "simred") {
        // tiempo real x velocidad elegida, sobre la duracion calculada del ciclo
        const dur = SIM.ciclos * a.totalMin * 60;
        if (SIM.play || modo === "ciclo") SIM.t = (SIM.t + dt * SIM.vel / dur) % 1;
        SIM.ultimo = t;
        aplicarSimRed(a, SIM.t);
      }
      if (a.tipo === "sim") {
        if (SIM.play) SIM.t = (SIM.t + (t - SIM.ultimo) / 1000 / SIM.seg) % 1;
        SIM.ultimo = t;
        aplicarSim(a, SIM.t);
      }
      const u = a.grupo && a.grupo.userData;
      if (u && u.extras && u.extras.humo) {
        u.extras.humo.children.forEach((s, i) => {
          const y = s.userData.base + ((t / 950 + i * 0.28) % 2.2);
          s.position.y = y;
          s.material.opacity = Math.max(0, 0.28 - i * 0.026) * (1 - (y - s.userData.base) / 2.5);
        });
      }
    });

    // la camara va despues del equipo: seguir y cabina leen su pose de este cuadro
    if (raiz) raiz.updateMatrixWorld();
    camaras.actualizar(dt);
    pintarMinimapa(t);
    ren.render(esc, cam);
  }

  return { iniciar, cargarEquipo, actualizarTema, redimensionar,
           setModo, getModo, setContexto, alCambiarFase,
           setSimTiempo, setSimPlay, setSimVel, getSim, alSimTick,
           setCamara, getCamara: () => (camaras ? camaras.getModo() : "orbita"),
           irAVista, setEstilo, conectarMinimapa, estadoEscena,
           alCambiarEscena(fn) { alEscena = fn; },
           alCambiarCamara(fn) { alCamara = fn; if (camaras) camaras.alCambiar(m => { ambientar(); fn(m); }); } };
})();

// Un modulo no crea globales: app.js (script clasico) lo espera por este evento.
window.Render3D = Render3D;
window.dispatchEvent(new Event("render3d-listo"));
