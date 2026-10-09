/* ============================================================================
   ScoopLab — gestor de ventanas, barra de tareas y estado.
   El render 3D es el fondo permanente; las secciones son ventanas flotantes.
   ========================================================================= */
"use strict";

/* ----------------------------- estado ----------------------------------- */
const D = {
  equipos: [], params: null, secciones: [], referencias: [],
  sel: 2, tema: "dark", unidad: "TCS", metaEq: 1000,
  cache: {},          // resultados del motor por seccion
};

const PREF = "scooplab.pref";
function cargarPref() {
  try { Object.assign(D, JSON.parse(localStorage.getItem(PREF) || "{}")); } catch (e) {}
}
function guardarPref() {
  try {
    localStorage.setItem(PREF, JSON.stringify(
      { sel: D.sel, tema: D.tema, unidad: D.unidad }));
  } catch (e) {}
}

/* ----------------------------- puente Python ---------------------------- */
/** Llama al backend: pywebview en la app, HTTP en modo web (--web). */
const MODO_WEB = location.protocol.startsWith("http");
async function api(metodo, ...args) {
  if (window.pywebview && window.pywebview.api) {
    try { return await window.pywebview.api[metodo](...args); }
    catch (e) { console.error("api." + metodo, e); return null; }
  }
  if (MODO_WEB) {
    try {
      const r = await fetch("/api/" + metodo, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const j = await r.json();
      return j && j.error ? (console.error("api." + metodo, j.error), null) : j;
    } catch (e) { console.error("api." + metodo, e); return null; }
  }
  return null;
}

/* ----------------------------- formato ---------------------------------- */
const fmt = {
  n(v, d = 1) { return v == null || !isFinite(v) ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d }); },
  e(v) { return v == null || !isFinite(v) ? "—" : Math.round(v).toLocaleString("es-PE"); },
  usd(v, d = 0) { return v == null || !isFinite(v) ? "—" : "$ " + v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d }); },
  pct(v, d = 1) { return v == null || !isFinite(v) ? "—" : (v * 100).toFixed(d) + " %"; },
  /** Convierte TCS a la unidad activa. */
  masa(tcs, d = 0) {
    if (tcs == null || !isFinite(tcs)) return "—";
    const v = D.unidad === "TCS" ? tcs : tcs / 1.10231;
    return v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  u() { return D.unidad === "TCS" ? "TCS" : "t"; },
  esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); },
};

/** Color de estado segun umbral (mayor es mejor por defecto). */
function estado(v, bueno, regular, mayorEsMejor = true) {
  if (v == null || !isFinite(v)) return "";
  if (mayorEsMejor) return v >= bueno ? "ok" : v >= regular ? "warn" : "bad";
  return v <= bueno ? "ok" : v <= regular ? "warn" : "bad";
}

function colorEnergia(e) {
  return e === "Diesel" ? "var(--warn)"
    : e === "Bateria" ? "var(--ok)" : "var(--accent)";
}

/**
 * Emblema alimentado por el equipo seleccionado: se tiñe segun su energia y
 * las tres barras muestran rendimiento, costo invertido y holgura, cada uno
 * normalizado contra el maximo de la flota.
 */
function emblemaEquipo(tam = 20, marco = true) {
  const e = equipoSel();
  const f = Object.values(D.cache.resumen || {});
  if (!e || !f.length) return emblema({ tam, marco });
  const r = D.cache.resumen[e.id];
  if (!r) return emblema({ tam, marco, acento: colorEnergia(e.energia) });

  const max = (k) => Math.max(...f.map(x => x[k] || 0)) || 1;
  const costoMax = max("costo_tcs");
  return emblema({
    tam, marco,
    acento: colorEnergia(e.energia),
    stats: [
      r.rend / max("rend"),                        // productividad
      1 - (r.costo_tcs / costoMax) * 0.82,         // costo: mas barato, mas alto
      Math.min(1, r.holgura / 700),                // holgura geometrica
    ],
  });
}

/* ----------------------------- secciones -------------------------------- */
const SECCIONES = [
  { id: "flota",       titulo: "Flota",        w: 900, h: 520 },
  { id: "equipo",      titulo: "Equipo",       w: 760, h: 560 },
  { id: "geometria",   titulo: "Geometria",    w: 860, h: 520 },
  { id: "ciclo",       titulo: "Ciclo",        w: 720, h: 480 },
  { id: "costos",      titulo: "Costos",       w: 800, h: 520 },
  { id: "ventilacion", titulo: "Ventilacion",  w: 900, h: 580 },
  { id: "comparador",  titulo: "Comparador",   w: 960, h: 540 },
  { id: "matriz",      titulo: "Matriz",       w: 900, h: 540 },
  { id: "payback",     titulo: "Payback",      w: 940, h: 600 },
  { id: "parametros",  titulo: "Parametros",   w: 800, h: 600 },
  { id: "opciones",    titulo: "Opciones",     w: 600, h: 440 },
];
const META = Object.fromEntries(SECCIONES.map(s => [s.id, s]));

/* ----------------------------- ventanas --------------------------------- */
const wins = {};
let zTop = 20;

function crearVentana(id) {
  if (wins[id]) return wins[id];
  const m = META[id];
  const el = document.createElement("div");
  el.className = "win";
  el.dataset.v = id;

  const vw = innerWidth, vh = innerHeight - 44;
  const w = Math.min(m.w, vw - 24), h = Math.min(m.h, vh - 24);
  const i = SECCIONES.findIndex(s => s.id === id);
  el.style.width = w + "px";
  el.style.height = h + "px";
  el.style.left = Math.max(12, Math.min(324 + i * 22, vw - w - 12)) + "px";
  el.style.top = Math.max(12, Math.min(58 + i * 18, vh - h - 12)) + "px";

  el.innerHTML = `
    <div class="win-h">
      <span class="ic">${ico(id, 15)}</span>
      <span class="ti">${fmt.esc(m.titulo)}</span>
      <div class="ctr">
        <button class="mn" data-tip="Minimizar">${ico("minimizar", 11)}</button>
        <button class="cl" data-tip="Cerrar">${ico("cerrar", 11)}</button>
      </div>
    </div>
    <div class="win-b"></div>
    <div class="win-rz"></div>`;

  document.getElementById("ventanas").appendChild(el);
  el.addEventListener("pointerdown", () => enfocar(id), true);
  el.querySelector(".mn").addEventListener("click", e => { e.stopPropagation(); minimizar(id); });
  el.querySelector(".cl").addEventListener("click", e => { e.stopPropagation(); cerrar(id); });
  arrastrable(el.querySelector(".win-h"), el);
  redimensionable(el.querySelector(".win-rz"), el);

  wins[id] = { el, abierta: false, min: false };
  return wins[id];
}

async function pintar(id) {
  const w = wins[id];
  if (!w || !w.abierta || w.min) return;
  const cuerpo = w.el.querySelector(".win-b");
  const vista = VISTAS[id];
  if (!vista) { cuerpo.innerHTML = `<div class="nota">Seccion en construccion.</div>`; return; }
  cuerpo.innerHTML = `<div class="lectura"><span>calculando…</span></div>`;
  try {
    cuerpo.innerHTML = await vista();
    if (VISTAS.conectar[id]) VISTAS.conectar[id](cuerpo);
  } catch (e) {
    console.error(e);
    cuerpo.innerHTML = `<div class="nota bad">Error al construir la vista: ${fmt.esc(e.message)}</div>`;
  }
}

function abrir(id) {
  const w = crearVentana(id);
  w.abierta = true; w.min = false;
  w.el.classList.remove("min");
  pintar(id); enfocar(id); sincronizar();
}
function cerrar(id) { const w = wins[id]; if (!w) return; w.el.remove(); delete wins[id]; sincronizar(); }
function minimizar(id) { const w = wins[id]; if (!w) return; w.min = true; w.el.classList.add("min"); sincronizar(); }
function enfocar(id) { const w = wins[id]; if (!w) return; w.el.style.zIndex = ++zTop; sincronizar(); }

function alternar(id) {
  const w = wins[id];
  if (!w || !w.abierta) return abrir(id);
  if (w.min) { w.min = false; w.el.classList.remove("min"); pintar(id); enfocar(id); return sincronizar(); }
  const tope = Math.max(...Object.values(wins).filter(x => x.abierta && !x.min).map(x => +x.el.style.zIndex || 20));
  if ((+w.el.style.zIndex || 20) >= tope) minimizar(id); else enfocar(id);
}
function mostrarEscena() { Object.keys(wins).forEach(id => wins[id].abierta && minimizar(id)); }

function arrastrable(mango, el) {
  let sx, sy, ox, oy, on = false;
  mango.addEventListener("pointerdown", e => {
    if (e.target.closest(".ctr")) return;
    on = true; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop;
    mango.setPointerCapture(e.pointerId);
  });
  mango.addEventListener("pointermove", e => {
    if (!on) return;
    const nl = Math.max(0, Math.min(ox + e.clientX - sx, innerWidth - el.offsetWidth));
    const nt = Math.max(0, Math.min(oy + e.clientY - sy, innerHeight - 44 - el.offsetHeight));
    el.style.left = nl + "px"; el.style.top = nt + "px";
  });
  mango.addEventListener("pointerup", () => { on = false; });
}

function redimensionable(tirador, el) {
  let sx, sy, ow, oh, on = false;
  tirador.addEventListener("pointerdown", e => {
    e.stopPropagation(); on = true; sx = e.clientX; sy = e.clientY;
    ow = el.offsetWidth; oh = el.offsetHeight;
    tirador.setPointerCapture(e.pointerId);
  });
  tirador.addEventListener("pointermove", e => {
    if (!on) return;
    el.style.width = Math.max(340, ow + e.clientX - sx) + "px";
    el.style.height = Math.max(200, oh + e.clientY - sy) + "px";
  });
  tirador.addEventListener("pointerup", () => { on = false; });
}

/* ----------------------------- barra ------------------------------------ */
function construirBarra() {
  const cont = document.getElementById("tareas");
  cont.innerHTML = SECCIONES.map(s =>
    `<button class="tb" data-v="${s.id}" data-tip="${fmt.esc(s.titulo)}">${ico(s.id)}</button>`
  ).join("");
  cont.querySelectorAll(".tb").forEach(b =>
    b.addEventListener("click", () => alternar(b.dataset.v)));
}

function sincronizar() {
  const abiertas = Object.values(wins).filter(x => x.abierta && !x.min);
  const tope = abiertas.length ? Math.max(...abiertas.map(x => +x.el.style.zIndex || 20)) : 20;
  document.querySelectorAll("#tareas .tb").forEach(b => {
    const w = wins[b.dataset.v];
    b.classList.toggle("abierta", !!(w && w.abierta));
    b.classList.toggle("foco", !!(w && w.abierta && !w.min && (+w.el.style.zIndex || 20) >= tope));
  });
}

/* ----------------------------- HUD y selector --------------------------- */
function equipoSel() { return D.equipos.find(e => e.n === D.sel) || D.equipos[0]; }

function pintarEmblemaBarra() {
  const mk = document.querySelector("#inicio .mk");
  if (mk) mk.innerHTML = emblemaEquipo(20);
}

async function pintarHUD() {
  const e = equipoSel();
  if (!e) return;
  const r = D.cache.resumen && D.cache.resumen[e.id];
  const est = r ? estado(r.costo_tcs, 1.6, 2.0, false) : "";
  document.getElementById("hud").innerHTML = `
    <div class="h">
      <span class="mk" data-tip="${fmt.esc(e.modelo)}">${emblemaEquipo(20)}</span>
      <span class="marca">SCOOPLAB</span>
      <span class="eng">UCHUCCHACUA</span>
    </div>
    <div class="b">
      <div class="label">Equipo seleccionado</div>
      <div class="modelo">${fmt.esc(e.modelo)}</div>
      <div class="sub">${fmt.esc(e.fabricante)} ·
        <span style="color:${colorEnergia(e.energia)}">${fmt.esc(e.energia)}</span> ·
        ${fmt.n(e.cuchara_m3, 2)} m³</div>
      <div class="figs">
        <div class="fig"><div class="k">Rend. efectivo</div>
          <div class="v">${r ? fmt.n(r.rend, 1) : "—"}<small>${fmt.u()}/h</small></div></div>
        <div class="fig"><div class="k">Costo</div>
          <div class="v ${est}">${r ? fmt.usd(r.costo_tcs, 2) : "—"}</div></div>
        <div class="fig"><div class="k">Cap./dia</div>
          <div class="v">${r ? fmt.masa(r.cap_dia) : "—"}</div></div>
      </div>
      <div class="acts">
        <button data-ir="equipo">${ico("detalle", 13)} Ficha</button>
        <button data-ir="payback">${ico("analizar", 13)} Analizar</button>
      </div>
    </div>`;
  document.querySelectorAll("#hud [data-ir]").forEach(b =>
    b.addEventListener("click", () => abrir(b.dataset.ir)));
  pintarEmblemaBarra();
}

function pintarSelector() {
  const items = D.equipos.map(e => `
    <div class="eq-item ${e.n === D.sel ? "sel" : ""}" data-n="${e.n}"
         data-tip="${fmt.esc(e.situacion || "")}">
      <span class="ix">${e.id}</span>
      <span class="nm">${fmt.esc(e.modelo)}</span>
      <span class="en" style="background:${colorEnergia(e.energia)}"></span>
    </div>`).join("");
  document.getElementById("selector").innerHTML =
    `<div class="h">EQUIPOS · ${D.equipos.length}</div><div class="lista">${items}</div>`;
  document.querySelectorAll("#selector .eq-item").forEach(el =>
    el.addEventListener("click", () => seleccionar(+el.dataset.n)));
}

async function seleccionar(n) {
  D.sel = n; guardarPref();
  await refrescarResumen();
  pintarSelector(); pintarHUD();
  await refrescarEscena();
  Object.keys(wins).forEach(id => wins[id].abierta && pintar(id));
}

/** Recarga la escena con el contexto vigente (tiempos de ciclo y equivalencia). */
async function refrescarEscena() {
  if (!window.Render3D) return;
  const ctx = await api("contexto_escena", D.sel);
  if (ctx && D.metaEq && Render3D.getModo() === "equivalencia") {
    const eq = await api("equivalencia", D.sel, D.metaEq);
    if (eq) Object.assign(ctx, eq);
  }
  if (ctx) {
    ctx.unidad = D.unidad;
    ctx.secciones = D.secciones;
    if (D.unidad !== "TCS") {
      ["cap_sel", "cap_ref", "meta", "cap_cuchara"].forEach(k => {
        if (ctx[k] != null) ctx[k] = ctx[k] / 1.10231;
      });
    }
    Render3D.setContexto(ctx);
  }
  Render3D.cargarEquipo(equipoSel(), seccionCritica(), ctx || {});
}

function seccionCritica() {
  return D.secciones.find(s => s.critica) || D.secciones[D.secciones.length - 1];
}

/* ----------------------------- tema y unidad ---------------------------- */
function aplicarTema(t) {
  D.tema = t; guardarPref();
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
  document.getElementById("tpTema").textContent = t === "light" ? "◑" : "◐";
  if (window.Render3D) Render3D.actualizarTema();
  Object.keys(wins).forEach(id => wins[id].abierta && pintar(id));
}
function aplicarUnidad(u) {
  D.unidad = u; guardarPref();
  document.getElementById("tpUnidad").textContent = u;
  pintarHUD();
  Object.keys(wins).forEach(id => wins[id].abierta && pintar(id));
}

/* ----------------------------- reloj ------------------------------------ */
function reloj() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  document.getElementById("reloj").innerHTML =
    `<b>${hh}:${mm}</b><span>${D.unidad === "TCS" ? "TCS base" : "t metrica"}</span>`;
}

/* ----------------------------- arranque --------------------------------- */
async function refrescarResumen() {
  const r = await api("resumen_flota");
  if (r) D.cache.resumen = Object.fromEntries(r.map(x => [x.id, x]));
}

async function iniciar() {
  cargarPref();
  aplicarTema(D.tema);
  document.getElementById("tpUnidad").textContent = D.unidad;

  const datos = await api("datos_iniciales");
  if (datos) {
    D.equipos = datos.equipos || [];
    D.params = datos.params || null;
    D.secciones = datos.secciones || [];
    D.referencias = datos.referencias || [];
    if (!D.equipos.some(e => e.n === D.sel)) D.sel = D.equipos[0]?.n ?? 1;
  }

  construirBarra();
  await refrescarResumen();
  pintarSelector();
  pintarHUD();
  reloj(); setInterval(reloj, 15000);

  await render3dListo();
  if (window.Render3D) {
    Render3D.iniciar(document.getElementById("escena"));
    conectarCamaras();
    await refrescarEscena();
  } else {
    document.getElementById("escena").hidden = true;
    document.getElementById("escena-vacia").hidden = false;
  }

  const segModo = document.getElementById("segModo");
  if (segModo) segModo.addEventListener("click", e => {
    const b = e.target.closest("[data-modo]");
    if (!b || !window.Render3D) return;
    segModo.querySelectorAll("button").forEach(x => x.classList.toggle("sel", x === b));
    const fase = document.getElementById("faseCiclo");
    if (fase) { fase.classList.toggle("on", b.dataset.modo === "ciclo"); fase.innerHTML = ""; }
    const sm = document.getElementById("segMetaEq");
    if (sm) sm.hidden = b.dataset.modo !== "equivalencia";
    const rp = document.getElementById("reproductor");
    if (rp) rp.hidden = b.dataset.modo !== "simulacion";
    Render3D.setModo(b.dataset.modo);
    if (b.dataset.modo === "equivalencia") refrescarEscena();
    if (b.dataset.modo !== "ficha") mostrarEscena();
  });

  if (window.Render3D) Render3D.alCambiarFase(f => {
    const el = document.getElementById("faseCiclo");
    if (!el || Render3D.getModo() !== "ciclo") return;
    el.innerHTML = `<b>${fmt.esc(f.fase)}</b> · min ${f.minuto} de ${f.totalMin}
      <span class="barra"><i style="width:${(f.progreso * 100).toFixed(0)}%"></i></span>`;
  });

  const segMetaEq = document.getElementById("segMetaEq");
  if (segMetaEq) segMetaEq.addEventListener("click", e => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    segMetaEq.querySelectorAll("button").forEach(x => x.classList.toggle("sel", x === b));
    D.metaEq = +b.dataset.m;
    refrescarEscena();
  });

  conectarReproductor();

  document.getElementById("inicio").addEventListener("click", mostrarEscena);
  document.getElementById("tpTema").addEventListener("click", () =>
    aplicarTema(D.tema === "dark" ? "light" : "dark"));
  document.getElementById("tpUnidad").addEventListener("click", () =>
    aplicarUnidad(D.unidad === "TCS" ? "t" : "TCS"));

  abrir("flota");
}

/* ------------------------- camaras, vistas y minimapa -------------------- */
/** render3d.js es un modulo: se ejecuta despues de este script. */
function render3dListo() {
  if (window.Render3D) return Promise.resolve();
  return new Promise(ok => {
    addEventListener("render3d-listo", ok, { once: true });
    setTimeout(ok, 6000);
  });
}

const AYUDA_CAM = {
  vuelo: "<b>WASD</b> mover · <b>Q/E</b> bajar y subir · <b>Shift</b> rapido · arrastrar para mirar",
  caminar: "<b>WASD</b> caminar · <b>Shift</b> correr · arrastrar para mirar · las paredes detienen",
  seguir: "camara detras del equipo",
  cabina: "vista del operador",
};

function conectarCamaras() {
  const segCam = document.getElementById("segCam");
  const segVistas = document.getElementById("segVistas");
  const segEstilo = document.getElementById("segEstilo");
  const ayuda = document.getElementById("ayudaCam");
  const mapa = document.getElementById("minimapa");
  Render3D.conectarMinimapa(mapa);

  const marcarCam = cam => {
    segCam.querySelectorAll("button").forEach(b => b.classList.toggle("sel", b.dataset.cam === cam));
    ayuda.innerHTML = AYUDA_CAM[cam] || "";
    ayuda.classList.toggle("on", !!AYUDA_CAM[cam]);
  };

  segCam.addEventListener("click", e => {
    const b = e.target.closest("[data-cam]");
    if (!b || b.disabled) return;
    Render3D.setCamara(b.dataset.cam);
    if (b.dataset.cam !== "orbita") mostrarEscena();
  });
  segVistas.addEventListener("click", e => {
    const b = e.target.closest("[data-vista]");
    if (b) Render3D.irAVista(b.dataset.vista);
  });
  segEstilo.addEventListener("click", e => {
    const b = e.target.closest("[data-estilo]");
    if (!b) return;
    segEstilo.querySelectorAll("button").forEach(x => x.classList.toggle("sel", x === b));
    Render3D.setEstilo(b.dataset.estilo);
  });

  Render3D.alCambiarCamara(marcarCam);
  // cada modo de escena habilita las camaras que tienen sentido en el
  Render3D.alCambiarEscena(est => {
    segCam.querySelector('[data-cam="caminar"]').disabled = !est.red;
    segCam.querySelector('[data-cam="seguir"]').disabled = !est.maquina;
    segCam.querySelector('[data-cam="cabina"]').disabled = !est.maquina;
    segVistas.hidden = segEstilo.hidden = mapa.hidden = !est.red;
    segVistas.innerHTML = est.vistas.map(v =>
      `<button data-vista="${v.id}">${fmt.esc(v.nombre)}</button>`).join("");
    marcarCam(est.camara);
  });
}

/* ------------------------- reproductor de la simulacion ------------------ */
function conectarReproductor() {
  if (!window.Render3D) return;
  const bPlay = document.getElementById("rpPlay");
  const bIni = document.getElementById("rpInicio");
  const barra = document.getElementById("rpBarra");
  const lectura = document.getElementById("rpLectura");
  if (!bPlay || !barra) return;

  let arrastrando = false, reanudar = false;
  const pintarBoton = () => {
    bPlay.innerHTML = ico(Render3D.getSim().play ? "pausa" : "play", 13);
  };
  bIni.innerHTML = ico("inicio_t", 13);
  pintarBoton();

  bPlay.addEventListener("click", () => {
    Render3D.setSimPlay(!Render3D.getSim().play);
    pintarBoton();
  });
  bIni.addEventListener("click", () => { Render3D.setSimTiempo(0); barra.value = 0; });

  // al arrastrar se pausa; al soltar se reanuda si venia corriendo
  barra.addEventListener("pointerdown", () => {
    arrastrando = true;
    reanudar = Render3D.getSim().play;
    Render3D.setSimPlay(false);
    pintarBoton();
  });
  const soltar = () => {
    if (!arrastrando) return;
    arrastrando = false;
    if (reanudar) Render3D.setSimPlay(true);
    pintarBoton();
  };
  barra.addEventListener("pointerup", soltar);
  barra.addEventListener("pointercancel", soltar);
  addEventListener("pointerup", soltar);
  barra.addEventListener("input", () => Render3D.setSimTiempo(+barra.value / 1000));

  Render3D.alSimTick(f => {
    if (Render3D.getModo() !== "simulacion") return;
    if (!arrastrando) barra.value = Math.round(f.t01 * 1000);
    if (lectura) {
      lectura.innerHTML = `ciclo <b>${f.ciclo}</b>/${f.ciclos} ·
        <span class="f">${fmt.esc(f.fase)}</span> ·
        min <b>${f.minuto}</b>/${f.totalMin} ·
        <b>${f.masa}</b> ${fmt.esc(f.unidad)}`;
    }
  });
}

if (window.pywebview) iniciar();
else window.addEventListener("pywebviewready", iniciar, { once: true });
setTimeout(() => { if (!D.equipos.length) iniciar(); }, 1200);  // navegador suelto
