/* ============================================================================
   Render 3D — fondo permanente de la aplicacion.

   Los equipos se construyen por codigo en equipo3d.js, desde sus cotas del
   catalogo y los rasgos de cada modelo (modelos.js): no hay modelos externos.

   Cuatro modos:
     ficha        una unidad dentro del tunel de seccion, con cotas
     ciclo        animacion cargar - acarrear - descargar - retornar
     equivalencia N unidades de referencia frente a las que necesita el elegido
     simulacion   el ciclo completo sobre la red de galerias (red3d.js)

   Modulo ES: three y sus complementos se resuelven con el importmap de
   index.html hacia ui/vendor/. Las camaras viven en camaras.js.
   ========================================================================= */
import * as THREE from "three";
import { Red, construirRed, tramosDeMarcha, poseEn, redDeCiclo, AVANCE } from "./red3d.js";
import { construirEquipo, MAT, claro } from "./equipo3d.js";
import { crearCamaras } from "./camaras.js";
import { crearMinimapa } from "./minimapa.js";
import { crearMinado } from "./minado3d.js";

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
    // rocas sueltas: saltan de la pila a la cuchara y de la cuchara al echadero
    const sueltas = [];
    let sem = 23;
    const azar = () => { sem = (sem * 16807) % 2147483647; return sem / 2147483647; };
    const matRoca = MAT.roca();
    for (let i = 0; i < 12; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.10 + azar() * 0.10, 0), matRoca);
      r.userData = { dx: (azar() - 0.5) * 1.4, dz: (azar() - 0.5) * 1.6, giro: 3 + azar() * 5 };
      r.visible = false;
      R.grupo.add(r);
      sueltas.push(r);
    }
    animables.push({
      pre: doc.minado ? crearMinado(R, red, doc) : null,
      tipo: "simred", grupo: maq, fases, legs, R, sueltas,
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
    u.ruedas.forEach(r => { r.rotation.z = -s / r.userData.r; });
    a.pose = q;
  }

  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  /**
   * Material en movimiento. Al cargar, las rocas saltan de la pila al hueco de
   * la cuchara; al descargar caen del labio al echadero. Es una trayectoria
   * dibujada (funcion del tiempo), no una simulacion fisica.
   */
  function rocasSueltas(a, id, k) {
    const u = a.grupo.userData, R = a.R, n = a.sueltas.length;
    if (id !== "carga" && id !== "descarga") { a.sueltas.forEach(r => { r.visible = false; }); return; }
    R.grupo.updateMatrixWorld(true);
    const { P, A, ancho } = u.cuch;
    a.sueltas.forEach((r, i) => {
      const d = r.userData;
      let t, desde, hasta, salto;
      if (id === "carga") {
        t = (k - 0.16 - i * 0.042) / 0.085;
        desde = _a.copy(R.pPila); desde.x += d.dx * 0.6; desde.z += d.dz * 0.6;
        hasta = R.grupo.worldToLocal(u.cuchara.localToWorld(_b.set(P * 0.55, A * 0.38, d.dz * ancho * 0.25)));
        salto = 0.45;
      } else {
        t = (k - 0.40 - i * 0.022) / 0.10;
        desde = R.grupo.worldToLocal(u.cuchara.localToWorld(_a.set(P * 0.95, A * 0.06, d.dz * ancho * 0.28)));
        hasta = _b.copy(R.pEch); hasta.x += d.dx * 0.35; hasta.z += d.dz * 0.3; hasta.y -= 0.4;
        salto = 0;
      }
      r.visible = t > 0 && t < 1;
      if (!r.visible) return;
      const caida = id === "descarga" ? t * t : t;        // al caer acelera
      r.position.set(desde.x + (hasta.x - desde.x) * t,
                     desde.y + (hasta.y - desde.y) * caida + Math.sin(Math.PI * t) * salto,
                     desde.z + (hasta.z - desde.z) * t);
      r.rotation.set(t * d.giro, t * d.giro * 0.7, 0);
    });
  }

  /** Coloca el equipo para el tiempo dado. Sin estado acumulado. */
  function aplicarSimRed(a, t01) {
    const u = a.grupo.userData;
    const total = SIM.ciclos;
    // las etapas previas del ciclo de minado van antes de las cucharas
    const durCic = total * a.totalMin * 60, durPre = a.pre ? a.pre.seg : 0;
    const ts = t01 * (durPre + durCic);
    let etapas = null;
    if (a.pre) {
      let ac = 0;
      etapas = a.pre.lista.map(e => {
        const ini = ac / (durPre + durCic); ac += e.seg;
        return { id: e.id, nombre: e.nombre, min: e.min, supuesto: e.supuesto, ini, fin: ac / (durPre + durCic) };
      });
      const lim = a.R.red.doc.minado.fases.find(f => f.id === "limpieza");
      etapas.push({ id: "limpieza", nombre: lim.nombre, min: lim.min, supuesto: false, ini: ac / (durPre + durCic), fin: 1 });
      if (ts < durPre) {
        let t0 = 0, et = a.pre.lista[a.pre.lista.length - 1], ke = 1;
        for (const e of a.pre.lista) {
          if (ts < t0 + e.seg) { et = e; ke = (ts - t0) / e.seg; break; }
          t0 += e.seg;
        }
        a.pre.aplicar(et.id, ke);
        const l = a.legs.acarreo[0];
        posar(a, l.tr, l.s1);                            // el scoop espera en la camara de maniobra
        u.brazo.rotation.z = 0.10; u.cuchara.rotation.z = 0.10; u.cuch.setCarga(0);
        rocasSueltas(a, "", 0);
        const h = et.min >= 60 ? (et.min / 60).toFixed(1) + " h" : et.min.toFixed(0) + " min";
        if (SIM.cb) SIM.cb({
          t01, ciclo: 0, ciclos: total, id: et.id, etapas, etapa: et.id,
          fase: `${et.nombre}: ${et.detalle} · ${h} reales${et.supuesto ? " (supuesto)" : ""}, comprimido`,
          minuto: "0.0", totalMin: (total * a.totalMin).toFixed(1), masa: "0.0", unidad: a.unidad, kmh: "0.0",
        });
        return;
      }
      a.pre.aplicar("limpieza", 1);
    }
    const pos = (ts - durPre) / (a.totalMin * 60);
    const ciclo = Math.min(Math.floor(pos), total - 1);
    const dentro = pos - ciclo;

    let acum = 0;
    const tramos = a.fases.map(f => {
      const ini = acum / a.totalMin; acum += f.min;
      return { ...f, ini, fin: acum / a.totalMin };
    });
    const fase = tramos.find(f => dentro >= f.ini && dentro < f.fin) || tramos[tramos.length - 1];
    const k = (dentro - fase.ini) / Math.max(fase.fin - fase.ini, 1e-6);

    // brazo: + levanta. cuchara: + recoge (labio arriba), - voltea (labio abajo).
    let brazo = 0.10, volteo = 0.10, marcha = "", kmh = 0, llena = 0;
    const rampa = (x, p, q) => Math.max(0, Math.min(1, (x - p) / (q - p)));
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
      if (fase.id === "acarreo") { volteo = 0.60; llena = 1; }
    } else if (fase.id === "carga") {
      // baja la cuchara, entra en la pila, recoge girandola y retrocede
      const l = a.legs.acarreo[0];
      posar(a, l.tr, l.s0 + AVANCE * (rampa(k, 0.02, 0.30) - rampa(k, 0.74, 1)));
      brazo = 0.10 - 0.10 * rampa(k, 0, 0.12) + 0.10 * rampa(k, 0.60, 1);
      volteo = 0.10 - 0.13 * rampa(k, 0, 0.12) + 0.63 * rampa(k, 0.30, 0.70);
      llena = rampa(k, 0.16, 0.68);
    } else {
      // levanta, voltea sobre el echadero, espera que caiga y vuelve a nivel
      const l = a.legs.acarreo[a.legs.acarreo.length - 1];
      posar(a, l.tr, l.s1);
      brazo = 0.10 + 0.35 * (rampa(k, 0, 0.35) - rampa(k, 0.80, 1));
      volteo = 0.60 - 1.35 * rampa(k, 0.35, 0.55) + 0.85 * rampa(k, 0.80, 1);
      llena = 1 - rampa(k, 0.40, 0.68);
    }
    u.brazo.rotation.z = brazo;
    u.cuchara.rotation.z = volteo;
    u.cuch.setCarga(llena);
    rocasSueltas(a, fase.id, k);

    if (SIM.cb) SIM.cb({
      t01, ciclo: ciclo + 1, ciclos: total,
      fase: fase.label + marcha, id: fase.id,
      minuto: (pos * a.totalMin).toFixed(1),
      totalMin: (total * a.totalMin).toFixed(1),
      masa: (ciclo * a.capacidad).toFixed(1),
      unidad: a.unidad, kmh: kmh.toFixed(1), etapas, etapa: etapas ? "limpieza" : null,
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
      SIM.ciclos = modo === "ciclo" ? 1 : animables.some(x => x.pre) ? 3 : 6;
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
        const dur = SIM.ciclos * a.totalMin * 60 + (a.pre ? a.pre.seg : 0);
        if (SIM.play || modo === "ciclo") SIM.t = (SIM.t + dt * SIM.vel / dur) % 1;
        SIM.ultimo = t;
        aplicarSimRed(a, SIM.t);
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
