/* ============================================================================
   Camaras de la escena 3D.

     orbita    girar (clic izq.), desplazar (clic der.), zoom hacia el cursor
     vuelo     WASD + Q/E, Shift acelera, arrastrar para mirar
     caminar   a la altura de los ojos dentro de la galeria, choca con paredes
     seguir    detras del equipo
     cabina    desde el asiento del operador

   El teclado solo actua cuando el lienzo tiene el foco (se toma al hacer clic
   en la escena): asi no interfiere con los campos de las ventanas.
   ========================================================================= */
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

const OJOS = 1.7, CUERPO = 0.45;

export function crearCamaras(cam, lienzo) {
  const orb = new OrbitControls(cam, lienzo);
  orb.enableDamping = true;
  orb.dampingFactor = 0.09;
  orb.zoomToCursor = true;
  orb.screenSpacePanning = true;
  orb.minDistance = 2.5;
  orb.maxDistance = 260;
  orb.maxPolarAngle = 1.54;
  orb.autoRotateSpeed = 0.7;

  lienzo.tabIndex = 0;
  lienzo.style.outline = "none";

  let modo = "orbita";
  let escena = {};                 // { red: {pisoEn, apartar}, maquina: Group }
  let autoGira = true, ultima = 0, trans = null, alCambiar = null;
  let rumbo = 0, cabeceo = 0;      // mirada en vuelo y caminar
  const teclas = new Set();
  const vel = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  const marcar = () => { ultima = performance.now(); autoGira = false; };
  orb.addEventListener("start", marcar);
  lienzo.addEventListener("wheel", marcar, { passive: true });

  /* ---------------- mirada libre (vuelo y caminar) ---------------- */
  let mirando = false, px = 0, py = 0;
  const libre = () => modo === "vuelo" || modo === "caminar";
  lienzo.addEventListener("pointerdown", e => {
    lienzo.focus({ preventScroll: true });
    if (!libre() || e.button !== 0) return;
    mirando = true; px = e.clientX; py = e.clientY;
    lienzo.setPointerCapture(e.pointerId);
  });
  lienzo.addEventListener("pointermove", e => {
    if (!mirando) return;
    rumbo -= (e.clientX - px) * 0.0034;
    cabeceo = Math.max(-1.45, Math.min(1.45, cabeceo - (e.clientY - py) * 0.0030));
    px = e.clientX; py = e.clientY;
  });
  const soltar = () => { mirando = false; };
  lienzo.addEventListener("pointerup", soltar);
  lienzo.addEventListener("pointercancel", soltar);
  lienzo.addEventListener("wheel", e => {
    if (!libre()) return;
    cam.getWorldDirection(tmp);
    if (modo === "caminar") { tmp.y = 0; tmp.normalize(); }
    mover(tmp.multiplyScalar(-Math.sign(e.deltaY) * (modo === "caminar" ? 0.8 : 2.2)));
  }, { passive: true });

  const MOV = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);
  lienzo.addEventListener("keydown", e => {
    if (!MOV.has(e.code)) return;
    teclas.add(e.code);
    if (libre()) e.preventDefault();
  });
  lienzo.addEventListener("keyup", e => teclas.delete(e.code));
  lienzo.addEventListener("blur", () => teclas.clear());

  function aplicarMirada() {
    cam.rotation.order = "YXZ";
    cam.rotation.set(cabeceo, rumbo, 0);
  }
  function tomarMirada() {
    cam.getWorldDirection(tmp);
    rumbo = Math.atan2(-tmp.x, -tmp.z);
    cabeceo = Math.asin(Math.max(-1, Math.min(1, tmp.y)));
  }

  /** Desplaza la camara; en caminar respeta piso y paredes. */
  function mover(d) {
    if (modo !== "caminar" || !escena.red) { cam.position.add(d); return; }
    const pies = tmp2.copy(cam.position).add(d);
    pies.y -= OJOS - 1.0;                              // centro del cuerpo
    escena.red.apartar(pies, CUERPO);
    const piso = escena.red.pisoEn(pies, 1.0);
    if (piso == null) return;                          // fuera de la galeria: no avanza
    cam.position.set(pies.x, piso + OJOS, pies.z);
  }

  /* ---------------- transicion animada ---------------- */
  const suave = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  function transitar(pos, mira, ms = 750, alFinal = null) {
    trans = { p0: cam.position.clone(), p1: pos.clone(),
              m0: orb.target.clone(), m1: mira.clone(),
              t0: performance.now(), ms, alFinal };
    if (libre() || modo === "seguir" || modo === "cabina") {
      cam.getWorldDirection(tmp);
      trans.m0.copy(cam.position).addScaledVector(tmp, 8);
    }
  }

  /** Encuadre de orbita: objetivo, azimut, inclinacion y distancia. */
  function encuadrar(o, animar = false) {
    const az = o.theta != null ? o.theta
      : Math.atan2(cam.position.z - orb.target.z, cam.position.x - orb.target.x);
    const pos = new THREE.Vector3(
      o.objetivo.x + o.radio * Math.sin(o.phi) * Math.cos(az),
      o.objetivo.y + o.radio * Math.cos(o.phi),
      o.objetivo.z + o.radio * Math.sin(o.phi) * Math.sin(az));
    if (modo !== "orbita" && modo !== "vuelo") { orb.target.copy(o.objetivo); return; }
    if (animar) return transitar(pos, o.objetivo);
    trans = null;
    cam.position.copy(pos);
    orb.target.copy(o.objetivo);
    cam.lookAt(o.objetivo);
    if (modo === "vuelo") tomarMirada();
    autoGira = modo === "orbita";
  }

  /** Lleva la camara a un punto del mundo conservando el modo. */
  function irA(punto, mirar = null) {
    marcar();
    if (modo === "seguir" || modo === "cabina") setModo("orbita");
    if (modo === "caminar" && escena.red) {
      const piso = escena.red.pisoEn(punto, 2.5);
      if (piso == null) return false;
      const pos = new THREE.Vector3(punto.x, piso + OJOS, punto.z);
      const m = mirar ? mirar.clone().setY(pos.y) : pos.clone().add(new THREE.Vector3(0, 0, -1));
      transitar(pos, m, 600, () => { cam.lookAt(m); tomarMirada(); });
      return true;
    }
    if (modo === "vuelo") {
      const pos = punto.clone().add(new THREE.Vector3(0, 7, 9));
      transitar(pos, punto, 700, () => { cam.lookAt(punto); tomarMirada(); });
      return true;
    }
    const delta = tmp.copy(cam.position).sub(orb.target).clone();
    transitar(punto.clone().add(delta), punto);
    return true;
  }

  function setModo(m) {
    if (m === modo) return;
    if (m === "caminar" && !escena.red) m = "vuelo";
    if ((m === "seguir" || m === "cabina") && !escena.maquina) m = "orbita";
    const antes = modo;
    modo = m;
    trans = null;
    teclas.clear();
    orb.enabled = m === "orbita";
    cam.near = m === "cabina" || m === "caminar" ? 0.05 : 0.1;
    cam.fov = m === "cabina" ? 70 : m === "caminar" ? 62 : 42;
    cam.updateProjectionMatrix();

    if (m === "orbita") {
      if (antes === "seguir" || antes === "cabina" || antes === "caminar") {
        // sale a una vista exterior, mirando al punto donde estaba
        const centro = escena.maquina && antes !== "caminar"
          ? escena.maquina.getWorldPosition(new THREE.Vector3()) : cam.position.clone();
        orb.target.copy(centro);
        cam.position.copy(centro).add(new THREE.Vector3(-14, 13, 16));
      } else {
        cam.getWorldDirection(tmp);
        orb.target.copy(cam.position).addScaledVector(tmp, 14);
      }
      cam.lookAt(orb.target);
      marcar();
    } else if (m === "vuelo") {
      if (antes === "cabina" || antes === "caminar") cam.position.y += 4;
      tomarMirada();
    } else if (m === "caminar") {
      // baja al piso mas cercano: bajo la camara, o en el objetivo de la orbita
      const candidatos = [cam.position, orb.target, escena.inicio].filter(Boolean);
      let puesto = false;
      for (const c of candidatos) {
        const piso = escena.red.pisoEn(c, 3);
        if (piso == null) continue;
        cam.position.set(c.x, piso + OJOS, c.z);
        puesto = true; break;
      }
      if (!puesto) { modo = "vuelo"; tomarMirada(); }
      else {
        const m1 = escena.mirarInicio || orb.target;
        tmp.copy(m1).setY(cam.position.y);
        if (tmp.distanceTo(cam.position) > 0.5) cam.lookAt(tmp);
        tomarMirada();
        cabeceo = 0;
      }
    }
    lienzo.focus({ preventScroll: true });
    if (alCambiar) alCambiar(modo);
  }

  /* ---------------- cuadro ---------------- */
  function actualizar(dt) {
    const ahora = performance.now();

    if (trans) {
      const k = Math.min(1, (ahora - trans.t0) / trans.ms), e = suave(k);
      cam.position.lerpVectors(trans.p0, trans.p1, e);
      tmp.lerpVectors(trans.m0, trans.m1, e);
      cam.lookAt(tmp);
      if (modo === "orbita") orb.target.copy(tmp);
      if (k >= 1) {
        const fin = trans.alFinal; trans = null;
        if (fin) fin(); else if (libre()) tomarMirada();
      }
      return;
    }

    if (modo === "orbita") {
      if (!autoGira && ahora - ultima > 9000) autoGira = true;
      orb.autoRotate = autoGira;
      orb.update(dt);
      return;
    }

    if (libre()) {
      aplicarMirada();
      const rapido = teclas.has("ShiftLeft") || teclas.has("ShiftRight");
      const v = modo === "caminar" ? (rapido ? 6 : 2.4) : (rapido ? 30 : 9);
      const ad = (teclas.has("KeyW") || teclas.has("ArrowUp") ? 1 : 0)
               - (teclas.has("KeyS") || teclas.has("ArrowDown") ? 1 : 0);
      const lat = (teclas.has("KeyD") || teclas.has("ArrowRight") ? 1 : 0)
                - (teclas.has("KeyA") || teclas.has("ArrowLeft") ? 1 : 0);
      const sub = modo === "vuelo"
        ? (teclas.has("KeyE") || teclas.has("Space") ? 1 : 0) - (teclas.has("KeyQ") ? 1 : 0) : 0;
      const frente = tmp.set(-Math.sin(rumbo), 0, -Math.cos(rumbo));
      if (modo === "vuelo") frente.set(-Math.sin(rumbo) * Math.cos(cabeceo), Math.sin(cabeceo),
                                       -Math.cos(rumbo) * Math.cos(cabeceo));
      const meta = new THREE.Vector3()
        .addScaledVector(frente, ad)
        .addScaledVector(tmp2.set(Math.cos(rumbo), 0, -Math.sin(rumbo)), lat);
      meta.y += sub;
      if (meta.lengthSq() > 0) meta.normalize().multiplyScalar(v);
      vel.lerp(meta, 1 - Math.exp(-dt * 9));           // arranque y frenado suaves
      if (vel.lengthSq() > 1e-5) mover(tmp.copy(vel).multiplyScalar(dt));
      return;
    }

    const g = escena.maquina;
    if (!g) return;
    const c = g.userData.cotas;
    if (modo === "seguir") {
      const meta = g.localToWorld(tmp.set(-c.L * 1.15, c.H * 1.25, 0));
      cam.position.lerp(meta, 1 - Math.exp(-dt * 4));
      cam.lookAt(g.localToWorld(tmp2.set(c.L * 0.35, c.H * 0.55, 0)));
    } else if (modo === "cabina" && g.userData.ojo) {
      const ojo = g.userData.ojo;
      ojo.getWorldPosition(cam.position);
      cam.lookAt(ojo.localToWorld(tmp.set(4, -0.35, 0.25)));
    }
  }

  return {
    orb, actualizar, encuadrar, irA, setModo,
    getModo: () => modo,
    setEscena(e) {
      escena = e || {};
      if (modo === "caminar" && !escena.red) setModo("orbita");
      if ((modo === "seguir" || modo === "cabina") && !escena.maquina) setModo("orbita");
    },
    alCambiar(fn) { alCambiar = fn; },
    interior: () => modo === "caminar" || modo === "cabina",
    reanudarGiro() { autoGira = modo === "orbita"; },
  };
}
