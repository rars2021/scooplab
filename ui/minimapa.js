/* ============================================================================
   Minimapa en planta de la red de galerias. Un clic lleva la camara al punto.
   ========================================================================= */

export function crearMinimapa(lienzo, alClic) {
  const c = lienzo.getContext("2d");
  let planta = null, nodos = [], caja = null, k = 1, ox = 0, oy = 0;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function ajustar() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = lienzo.clientWidth, h = lienzo.clientHeight;
    if (lienzo.width !== w * dpr) { lienzo.width = w * dpr; lienzo.height = h * dpr; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!caja) return;
    const m = 14;
    k = Math.min((w - 2 * m) / (caja.x1 - caja.x0), (h - 2 * m) / (caja.y1 - caja.y0));
    ox = (w - (caja.x1 - caja.x0) * k) / 2 - caja.x0 * k;
    oy = (h + (caja.y1 - caja.y0) * k) / 2 + caja.y0 * k;      // el norte va arriba
  }
  const X = x => ox + x * k, Y = y => oy - y * k;

  function setRed(p, ns) {
    planta = p; nodos = ns || [];
    caja = null;
    if (!planta) return;
    caja = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    planta.forEach(t => t.pts.forEach(([x, y]) => {
      caja.x0 = Math.min(caja.x0, x - t.ancho); caja.x1 = Math.max(caja.x1, x + t.ancho);
      caja.y0 = Math.min(caja.y0, y - t.ancho); caja.y1 = Math.max(caja.y1, y + t.ancho);
    }));
  }

  function flecha(x, y, rumbo, col, r) {
    c.save();
    c.translate(X(x), Y(y)); c.rotate(-rumbo);
    c.fillStyle = col;
    c.beginPath(); c.moveTo(r, 0); c.lineTo(-r * 0.7, r * 0.62); c.lineTo(-r * 0.35, 0);
    c.lineTo(-r * 0.7, -r * 0.62); c.closePath(); c.fill();
    c.restore();
  }

  /** est = { equipo: {x, y, rumbo}, camara: {x, y, rumbo}, malas: Set(nodo) } */
  function dibujar(est) {
    if (!planta || lienzo.hidden) return;
    ajustar();
    const w = lienzo.clientWidth, h = lienzo.clientHeight;
    c.clearRect(0, 0, w, h);
    c.lineJoin = "round"; c.lineCap = "round";
    [[css("--rule"), 2.5], [css("--panel-2"), 0]].forEach(([col, extra]) => {
      planta.forEach(t => {
        c.strokeStyle = col; c.lineWidth = Math.max(3, t.ancho * k) + extra;
        c.beginPath();
        t.pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))));
        c.stroke();
      });
    });
    c.font = '9px "IBM Plex Mono", Consolas, monospace';
    nodos.forEach(n => {
      const mala = est.malas && est.malas.has(n.id);
      if (n.tipo === "frente" || n.tipo === "echadero" || mala) {
        c.fillStyle = mala ? css("--bad") : n.tipo === "frente" ? css("--warn") : css("--accent");
        c.beginPath(); c.arc(X(n.x), Y(n.y), mala ? 4 : 3.2, 0, 7); c.fill();
      }
      if (n.tipo === "frente" || n.tipo === "echadero") {
        c.fillStyle = css("--muted");
        c.fillText(n.tipo, X(n.x) + 6, Y(n.y) - 5);
      }
    });
    if (est.equipo) flecha(est.equipo.x, est.equipo.y, est.equipo.rumbo, css("--ink-strong"), 6.5);
    if (est.camara) {
      c.strokeStyle = css("--accent"); c.lineWidth = 1.2;
      const x = X(est.camara.x), y = Y(est.camara.y), r = est.camara.rumbo;
      c.beginPath();
      c.moveTo(x + 16 * Math.cos(-r - 0.42), y + 16 * Math.sin(-r - 0.42));
      c.lineTo(x, y);
      c.lineTo(x + 16 * Math.cos(-r + 0.42), y + 16 * Math.sin(-r + 0.42));
      c.stroke();
      c.fillStyle = css("--accent");
      c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill();
    }
  }

  lienzo.addEventListener("click", e => {
    if (!planta) return;
    const r = lienzo.getBoundingClientRect();
    alClic((e.clientX - r.left - ox) / k, (oy - (e.clientY - r.top)) / k);
  });

  return { setRed, dibujar };
}
