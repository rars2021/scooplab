/* ============================================================================
   Vistas — una por seccion de la barra de tareas.
   Cada vista devuelve HTML; VISTAS.conectar[id] engancha sus controles.
   Los graficos son SVG con clases del tema, sin librerias.
   ========================================================================= */
"use strict";

const VISTAS = { conectar: {} };

/* ========================= helpers de grafico ========================== */

function svgBarras(items, { W = 640, H = 220, formato = v => fmt.e(v), ref = null } = {}) {
  const pl = 8, pr = 8, pt = 22, pb = 40;
  const max = Math.max(...items.map(i => Math.abs(i.v)), ref || 0, 1);
  const n = items.length, hueco = (W - pl - pr) / n, bw = hueco * 0.54;
  let barras = "", refLinea = "";
  items.forEach((it, i) => {
    const h = (Math.abs(it.v) / max) * (H - pt - pb);
    const cx = pl + hueco * i + hueco / 2;
    const col = it.color || "var(--accent)";
    barras += `<rect x="${cx - bw / 2}" y="${H - pb - h}" width="${bw}" height="${h}" fill="${col}"/>
      <text x="${cx}" y="${H - pb - h - 6}" class="chart-tick" text-anchor="middle" fill="var(--ink-strong)">${formato(it.v)}</text>
      <text x="${cx}" y="${H - pb + 14}" class="chart-tick" text-anchor="middle">${fmt.esc(it.k)}</text>
      ${it.k2 ? `<text x="${cx}" y="${H - pb + 25}" class="chart-tick" text-anchor="middle" opacity=".7">${fmt.esc(it.k2)}</text>` : ""}`;
  });
  if (ref != null) {
    const y = H - pb - (ref / max) * (H - pt - pb);
    refLinea = `<line x1="${pl}" y1="${y}" x2="${W - pr}" y2="${y}" class="chart-ref"/>
      <text x="${W - pr}" y="${y - 4}" class="chart-tick" text-anchor="end" fill="var(--accent)">${formato(ref)}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="gr">
    <line x1="${pl}" y1="${H - pb}" x2="${W - pr}" y2="${H - pb}" class="chart-axis"/>
    ${refLinea}${barras}</svg>`;
}

function svgLineas(series, etiquetasX, { W = 660, H = 250, formato = v => fmt.e(v), cero = false } = {}) {
  const pl = 58, pr = 16, pt = 16, pb = 30;
  const todos = series.flatMap(s => s.datos).filter(v => isFinite(v));
  let min = Math.min(...todos, cero ? 0 : Infinity);
  let max = Math.max(...todos, cero ? 0 : -Infinity);
  if (min === max) { min -= 1; max += 1; }
  const n = etiquetasX.length - 1;
  const X = i => pl + (i / Math.max(n, 1)) * (W - pl - pr);
  const Y = v => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);

  let rejilla = "";
  etiquetasX.forEach((e, i) => {
    if (n > 12 && i % 2) return;
    rejilla += `<line x1="${X(i)}" y1="${pt}" x2="${X(i)}" y2="${H - pb}" stroke="var(--rule)" opacity=".45"/>
      <text x="${X(i)}" y="${H - pb + 14}" class="chart-tick" text-anchor="middle">${fmt.esc(e)}</text>`;
  });
  [min, (min + max) / 2, max].forEach(v => {
    rejilla += `<text x="${pl - 6}" y="${Y(v) + 3}" class="chart-tick" text-anchor="end">${formato(v)}</text>`;
  });
  let ceroLinea = "";
  if (min < 0 && max > 0) {
    ceroLinea = `<line x1="${pl}" y1="${Y(0)}" x2="${W - pr}" y2="${Y(0)}" class="chart-ref"/>`;
  }
  const trazos = series.map(s => {
    const d = s.datos.map((v, i) => `${i ? "L" : "M"}${X(i)},${Y(v)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${s.color || "var(--ink-strong)"}" stroke-width="2"
      ${s.punteada ? 'stroke-dasharray="4 3"' : ""}/>`;
  }).join("");
  const leyenda = series.map((s, i) =>
    `<g transform="translate(${pl + i * 168},${pt - 4})">
      <line x1="0" y1="0" x2="16" y2="0" stroke="${s.color || "var(--ink-strong)"}" stroke-width="2"/>
      <text x="21" y="3" class="chart-tick" fill="var(--ink)">${fmt.esc(s.nombre)}</text></g>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="gr">${rejilla}${ceroLinea}${trazos}${leyenda}</svg>`;
}

function svgRadar(ejes, series, { W = 400, H = 340, max = 5 } = {}) {
  const cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) * 0.34, n = ejes.length;
  const punto = (i, v) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2, r = (v / max) * R;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  let malla = "";
  for (let k = 1; k <= 4; k++) {
    const p = ejes.map((_, i) => punto(i, (max * k) / 4).join(",")).join(" ");
    malla += `<polygon points="${p}" fill="none" stroke="var(--rule)" opacity=".55"/>`;
  }
  ejes.forEach((e, i) => {
    const [x, y] = punto(i, max);
    malla += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--rule)" opacity=".55"/>`;
    const [lx, ly] = punto(i, max * 1.22);
    malla += `<text x="${lx}" y="${ly}" class="chart-tick" text-anchor="middle" fill="var(--muted)">${fmt.esc(e)}</text>`;
  });
  const capas = series.map(s => {
    const p = s.datos.map((v, i) => punto(i, v).join(",")).join(" ");
    return `<polygon points="${p}" fill="${s.color}" fill-opacity=".14" stroke="${s.color}" stroke-width="2"/>`;
  }).join("");
  const leyenda = series.map((s, i) =>
    `<g transform="translate(10,${14 + i * 15})"><rect width="10" height="3" y="-3" fill="${s.color}"/>
      <text x="15" y="1" class="chart-tick" fill="var(--ink)">${fmt.esc(s.nombre)}</text></g>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="gr">${malla}${capas}${leyenda}</svg>`;
}

/** Tarjeta de indicador con barra comparativa contra la mediana de la flota. */
function kpi(nombre, valor, unidad, { est = "", frac = null, cmp = "" } = {}) {
  return `<div class="kpi">
    <div class="k">${fmt.esc(nombre)}</div>
    <div class="v ${est}">${valor}${unidad ? `<small>${fmt.esc(unidad)}</small>` : ""}</div>
    ${frac != null ? `<div class="barra"><i class="${est}" style="width:${Math.max(2, Math.min(100, frac * 100))}%"></i></div>` : ""}
    ${cmp ? `<div class="cmp">${fmt.esc(cmp)}</div>` : ""}
  </div>`;
}

const pastilla = (txt, est) => `<span class="pastilla ${est}"><span class="punto" style="background:var(--${est})"></span>${txt}</span>`;

/* ============================== 1. FLOTA ============================== */
VISTAS.flota = async () => {
  const f = await api("resumen_flota") || [];
  D.cache.resumen = Object.fromEntries(f.map(x => [x.id, x]));
  const aptos = f.filter(x => x.apto).length;
  const mejor = f.filter(x => x.apto).sort((a, b) => a.costo_tcs - b.costo_tcs)[0];

  const filas = f.map(e => {
    const est = estado(e.costo_tcs, 1.65, 2.0, false);
    return `<tr class="fila ${e.n === D.sel ? "sel" : ""}" data-n="${e.n}">
      <td class="mono">${e.id}</td>
      <td><b>${fmt.esc(e.modelo)}</b><br><span style="color:var(--muted);font-size:10.5px">${fmt.esc(e.fabricante)}</span></td>
      <td><span class="punto" style="background:${colorEnergia(e.energia)}"></span> ${fmt.esc(e.energia)}</td>
      <td class="num">${fmt.n(e.cuchara_m3, 2)}</td>
      <td class="num">${fmt.n(e.rend, 1)}</td>
      <td class="num">${fmt.masa(e.cap_dia)}</td>
      <td class="num ${est}">${fmt.usd(e.costo_tcs, 2)}</td>
      <td class="num">${fmt.e(e.co2)}</td>
      <td class="num">${fmt.e(e.holgura)}</td>
      <td>${e.apto ? pastilla("APTO", "ok") : pastilla("NO ENTRA", "bad")}</td>
    </tr>`;
  }).join("");

  return `<div class="lectura">
      <span><b>${f.length}</b> equipos</span><span class="s">·</span>
      <span><b>${aptos}</b> aptos para produccion</span><span class="s">·</span>
      <span>mejor costo <b>${mejor ? fmt.esc(mejor.modelo) : "—"}</b></span><span class="s">·</span>
      <span>meta <b>${fmt.masa(D.params?.valores?.produccion_objetivo)} ${fmt.u()}/dia</b></span>
    </div>
    <table class="tbl"><thead><tr>
      <th>ID</th><th>Modelo</th><th>Energia</th><th class="num">Cuchara m³</th>
      <th class="num">Rend. ${fmt.u()}/h</th><th class="num">Cap./dia</th>
      <th class="num">US$/${fmt.u()}</th><th class="num">CO₂ kg/h</th>
      <th class="num">Holgura mm</th><th>Seccion</th>
    </tr></thead><tbody>${filas}</tbody></table>`;
};
VISTAS.conectar.flota = c => {
  c.querySelectorAll("tr.fila").forEach(t =>
    t.addEventListener("click", () => seleccionar(+t.dataset.n)));
};

/* ============================== 2. EQUIPO ============================= */
VISTAS.equipo = async () => {
  const e = equipoSel();
  const r = await api("detalle_equipo", e.n);
  const f = Object.values(D.cache.resumen || {});
  if (!r) return `<div class="nota">Sin datos.</div>`;
  const k = r.kpis;
  const med = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] || 1; };
  const medProd = med(f.map(x => x.kpis.productividad_especifica));
  const medAire = med(f.filter(x => x.kpis.huella_aire > 0).map(x => x.kpis.huella_aire)) || 1;

  return `<div class="cabeza"><h2>${fmt.esc(e.modelo)}</h2>
      <span class="sub">${fmt.esc(e.fabricante)} · ${fmt.esc(e.situacion || "")}</span></div>

    <div class="grid g4" style="margin-bottom:10px">
      ${kpi("Rend. efectivo", fmt.n(r.rend_efectivo_tcsh, 1), fmt.u() + "/h",
            { est: estado(r.rend_efectivo_tcsh, 55, 35), frac: r.rend_efectivo_tcsh / 80 })}
      ${kpi("Costo unitario", fmt.usd(r.costos.por_tcs, 2), "/" + fmt.u(),
            { est: estado(r.costos.por_tcs, 1.65, 2.0, false), frac: r.costos.por_tcs / 3 })}
      ${kpi("Productividad esp.", fmt.n(k.productividad_especifica, 1), fmt.u() + "/h·m³",
            { est: estado(k.productividad_especifica, 18, 15),
              frac: k.productividad_especifica / (medProd * 1.6),
              cmp: `mediana flota ${fmt.n(medProd, 1)}` })}
      ${kpi("Huella de aire", k.huella_aire > 0 ? fmt.e(k.huella_aire) : "0", "CFM por " + fmt.u() + "/h",
            { est: k.huella_aire === 0 ? "ok" : estado(k.huella_aire, 300, 420, false),
              frac: k.huella_aire / (medAire * 1.4),
              cmp: k.huella_aire === 0 ? "sin consumo de aire" : `mediana diesel ${fmt.e(medAire)}` })}
    </div>

    <div class="grid g2">
      <div class="panel"><div class="head">FICHA TECNICA</div><div class="body"><div class="kv">
        <div class="row"><span class="k">Energia</span><span class="v" style="color:${colorEnergia(e.energia)}">${fmt.esc(e.energia)}</span></div>
        <div class="row"><span class="k">Cuchara</span><span class="v">${fmt.n(e.cuchara_m3, 2)} m³ · ${fmt.n(e.cuchara_yd3, 2)} yd³</span></div>
        <div class="row"><span class="k">Carga util</span><span class="v">${fmt.e(e.carga_util_kg)} kg</span></div>
        <div class="row"><span class="k">Dimensiones L×An×Al</span><span class="v">${fmt.e(e.largo_mm)} × ${fmt.e(e.ancho_mm)} × ${fmt.e(e.alto_mm)} mm</span></div>
        <div class="row"><span class="k">Potencia</span><span class="v">${fmt.e(e.potencia_kw)} kW · ${fmt.e(e.potencia_hp)} HP</span></div>
        <div class="row"><span class="k">Peso operativo</span><span class="v">${fmt.e(e.peso_kg)} kg</span></div>
        <div class="row"><span class="k">Velocidad max.</span><span class="v">${fmt.n(e.vel_max_kmh, 0)} km/h</span></div>
        <div class="row"><span class="k">Consumo</span><span class="v">${fmt.n(e.consumo, 1)} ${fmt.esc(e.consumo_unidad)}</span></div>
        <div class="row"><span class="k">Autonomia</span><span class="v" style="font-size:11px">${fmt.esc(e.autonomia || "—")}</span></div>
      </div></div></div>

      <div class="panel"><div class="head">INDICADORES DERIVADOS</div><div class="body"><div class="kv">
        <div class="row"><span class="k">Capacidad por cuchara</span><span class="v">${fmt.n(r.capacidad_cuchara_tcs, 2)} ${fmt.u()}</span></div>
        <div class="row"><span class="k">Cucharas por hora</span><span class="v">${fmt.n(r.cucharas_hora, 1)}</span></div>
        <div class="row"><span class="k">Rend. nominal</span><span class="v">${fmt.n(r.rend_nominal_tcsh, 1)} ${fmt.u()}/h</span></div>
        <div class="row"><span class="k">Rend. efectivo</span><span class="v">${fmt.n(r.rend_efectivo_tcsh, 1)} ${fmt.u()}/h</span></div>
        <div class="row"><span class="k">Capacidad diaria</span><span class="v">${fmt.masa(r.capacidad_diaria_tcs)} ${fmt.u()}</span></div>
        <div class="row"><span class="k">Intensidad energetica</span><span class="v">${fmt.n(k.intensidad_energetica, 3)} ${fmt.esc(e.consumo_unidad.split("/")[0])}/${fmt.u()}</span></div>
        <div class="row"><span class="k">Densidad de potencia</span><span class="v">${fmt.n(k.densidad_potencia, 1)} kW/t</span></div>
        <div class="row"><span class="k">Indice de holgura</span><span class="v">${fmt.pct(k.indice_holgura)}</span></div>
        <div class="row"><span class="k">OEE (DM × UE)</span><span class="v">${fmt.pct(k.oee)}</span></div>
      </div></div></div>
    </div>

    <div class="panel" style="margin-top:10px"><div class="head">FUENTE
      <span class="r">${fmt.esc(e.situacion || "")}</span></div>
      <div class="body" style="font-size:11.5px;color:var(--muted)">${fmt.esc(e.fuente || "—")}</div></div>`;
};

/* ============================ 3. GEOMETRIA =========================== */
VISTAS.geometria = async () => {
  const g = await api("geometria");
  if (!g) return `<div class="nota">Sin datos.</div>`;
  const cab = g.secciones.map(s =>
    `<th class="num" title="${fmt.esc(s.nombre)}">${fmt.esc(s.nombre.split(" ")[0])}${s.critica ? " *" : ""}</th>`).join("");
  const filas = g.filas.map(r => {
    const celdas = g.secciones.map(s =>
      `<td class="num">${r.encaje[s.clave] ? '<span class="ok">entra</span>' : '<span class="bad">no</span>'}</td>`).join("");
    const eh = r.holgura >= 300 ? "ok" : r.holgura >= 0 ? "warn" : "bad";
    return `<tr class="fila ${r.n === D.sel ? "sel" : ""}" data-n="${r.n}">
      <td class="mono">${r.id}</td><td><b>${fmt.esc(r.modelo)}</b></td>
      <td class="num">${fmt.e(r.ancho_mm)}</td><td class="num">${fmt.e(r.ancho_req)}</td>
      ${celdas}
      <td class="num ${eh}">${fmt.e(r.holgura)}</td>
      <td style="font-size:11px">${fmt.esc(r.veredicto)}</td></tr>`;
  }).join("");

  return `<div class="lectura">
      <span>holgura por lado <b>${fmt.e(g.holgura_lado)} mm</b></span><span class="s">·</span>
      <span>al techo <b>${fmt.e(g.holgura_techo)} mm</b></span><span class="s">·</span>
      <span>ancho requerido <b>= ancho + 2 × holgura</b></span><span class="s">·</span>
      <span class="s">* labor critica</span>
    </div>
    <div class="nota" style="margin-bottom:10px">El filtro geometrico se aplica
      <b>antes</b> que costo o productividad: un equipo que no transita por la labor
      no es una alternativa, por bueno que sea en lo demas. Selecciona una fila para
      verlo en el render con el tunel de seccion.</div>
    <table class="tbl"><thead><tr>
      <th>ID</th><th>Modelo</th><th class="num">Ancho</th><th class="num">Requerido</th>
      ${cab}<th class="num">Holgura</th><th>Veredicto</th>
    </tr></thead><tbody>${filas}</tbody></table>`;
};
VISTAS.conectar.geometria = c => {
  c.querySelectorAll("tr.fila").forEach(t =>
    t.addEventListener("click", () => seleccionar(+t.dataset.n)));
};

/* ============================== 4. CICLO ============================== */
VISTAS.ciclo = async () => {
  const c = await api("ciclo", D.sel);
  if (!c) return `<div class="nota">Sin datos.</div>`;
  return `<div class="cabeza"><h2>Ciclo y productividad</h2>
      <span class="sub">${fmt.esc(c.equipo)}</span></div>
    <div class="grid g4" style="margin-bottom:10px">
      ${kpi("Ciclo en uso", fmt.n(c.ciclo_min, 2), "min", { cmp: `calculado ${fmt.n(c.ciclo_calculado, 2)} min` })}
      ${kpi("Rend. nominal", fmt.n(c.rend_nominal, 1), fmt.u() + "/h", { cmp: "durante la limpieza" })}
      ${kpi("Rend. efectivo", fmt.n(c.rend_efectivo, 1), fmt.u() + "/h",
            { est: estado(c.rend_efectivo, 55, 35), cmp: "promedio de guardia" })}
      ${kpi("Equipos para la meta", c.n_equipos, "unidades",
            { est: c.n_equipos <= 1 ? "ok" : c.n_equipos <= 2 ? "warn" : "bad",
              cmp: `meta ${fmt.masa(c.meta)} ${fmt.u()}/dia` })}
    </div>
    <div class="grid g2">
      <div class="panel"><div class="head">PRODUCCION</div><div class="body"><div class="kv">
        <div class="row"><span class="k">Capacidad por cuchara</span><span class="v">${fmt.n(c.capacidad_cuchara, 2)} ${fmt.u()}</span></div>
        <div class="row"><span class="k">Cucharas por hora</span><span class="v">${fmt.n(c.cucharas_hora, 1)}</span></div>
        <div class="row"><span class="k">Por guardia</span><span class="v">${fmt.masa(c.cap_guardia)} ${fmt.u()}</span></div>
        <div class="row"><span class="k">Por dia</span><span class="v">${fmt.masa(c.cap_dia)} ${fmt.u()}</span></div>
        <div class="row"><span class="k">Por año</span><span class="v">${fmt.masa(c.cap_anio)} ${fmt.u()}</span></div>
      </div></div></div>
      <div class="panel"><div class="head">INDICES</div><div class="body">
        <div class="kv">
          <div class="row"><span class="k">Disponibilidad mecanica</span><span class="v">${fmt.pct(c.dm, 0)}</span></div>
          <div class="row"><span class="k">Utilizacion efectiva</span><span class="v">${fmt.pct(c.ue, 0)}</span></div>
          <div class="row"><span class="k">OEE</span><span class="v">${fmt.pct(c.kpis.oee)}</span></div>
        </div>
        <div class="formula" style="margin-top:9px">
R<span class="op">efectivo</span> <span class="op">=</span> C × (60 ÷ t<span class="op">ciclo</span>) × DM × UE<br>
<span class="op">=</span> ${fmt.n(c.capacidad_cuchara, 2)} × ${fmt.n(c.cucharas_hora, 1)} × ${fmt.pct(c.dm, 0)} × ${fmt.pct(c.ue, 0)}<br>
<span class="op">=</span> <span class="res">${fmt.n(c.rend_efectivo, 1)} ${fmt.u()}/h</span></div>
      </div></div>
    </div>
    <div class="nota" style="margin-top:10px">La tesis reporta <b>83.4 ${fmt.u()}/h</b>
      medidos en tres horas efectivas: es un rendimiento <b>nominal</b>, no el
      promedio de la guardia. Compararlo con el efectivo sobrestima la capacidad
      instalada en torno a un 40 %.</div>`;
};

/* ============================== 5. COSTOS ============================= */
VISTAS.costos = async () => {
  const c = await api("costos", D.sel);
  if (!c) return `<div class="nota">Sin datos.</div>`;
  const cols = ["var(--series-1)", "var(--series-2)", "var(--series-3)",
                "var(--series-4)", "var(--series-5)", "var(--series-6)"];
  const barras = c.desglose.map((d, i) => ({
    k: d.rubro.split(" ")[0], k2: d.rubro.split(" ").slice(1).join(" "),
    v: d.valor, color: cols[i % cols.length] }));
  const filas = c.desglose.map(d => `<tr>
      <td>${fmt.esc(d.rubro)}</td>
      <td style="color:var(--muted);font-size:11px">${fmt.esc(d.formula)}</td>
      <td class="num">${fmt.usd(d.valor, 2)}</td>
      <td class="num">${fmt.pct(d.valor / c.horario_total, 1)}</td></tr>`).join("");

  return `<div class="cabeza"><h2>Estructura de costos</h2><span class="sub">${fmt.esc(c.equipo)}</span></div>
    <div class="grid g4" style="margin-bottom:10px">
      ${kpi("Costo horario", fmt.usd(c.horario_total, 2), "/h")}
      ${kpi("OPEX cash", fmt.usd(c.opex_cash_h, 2), "/h", { cmp: "sin depreciacion" })}
      ${kpi("Acarreo", fmt.usd(c.por_tcs, 2), "/" + fmt.u(),
            { est: estado(c.por_tcs, 1.65, 2.0, false) })}
      ${kpi("Con transporte", fmt.usd(c.total_tcs, 2), "/" + fmt.u(),
            { cmp: `camion ${fmt.usd(c.transporte_tcs, 2)}` })}
    </div>
    <div class="panel"><div class="head">DESGLOSE HORARIO<span class="r">US$/h</span></div>
      <div class="body">${svgBarras(barras, { formato: v => fmt.usd(v, 1) })}</div></div>
    <div class="grid g2" style="margin-top:10px">
      <div class="panel"><div class="head">COMPONENTES</div><div class="body">
        <table class="tbl"><thead><tr><th>Rubro</th><th>Formula</th><th class="num">US$/h</th><th class="num">%</th></tr></thead>
        <tbody>${filas}<tr><td><b>Total</b></td><td></td>
          <td class="num"><b>${fmt.usd(c.horario_total, 2)}</b></td><td class="num"><b>100 %</b></td></tr></tbody></table>
      </div></div>
      <div class="panel"><div class="head">PROYECCION ANUAL</div><div class="body"><div class="kv">
        <div class="row"><span class="k">Horas operativas/año</span><span class="v">${fmt.e(c.horas_anio)}</span></div>
        <div class="row"><span class="k">OPEX anual (cash)</span><span class="v">${fmt.usd(c.opex_anual)}</span></div>
        <div class="row"><span class="k">CO₂ anual</span><span class="v ${c.co2_anual_t === 0 ? "ok" : ""}">${fmt.n(c.co2_anual_t, 1)} t</span></div>
      </div>
      <div class="nota" style="margin-top:9px">Para evaluar inversiones se usa el
        <b>OPEX cash</b>, que excluye la depreciacion. Incluirla junto al desembolso
        de capital contaria dos veces el mismo concepto.</div>
      </div></div>
    </div>`;
};

/* =========================== 6. VENTILACION ========================== */
VISTAS.ventilacion = async () => {
  const meta = D.cache.ventMeta || 1000;
  const v = await api("ventilacion", meta);
  if (!v) return `<div class="nota">Sin datos.</div>`;
  const barras = v.escenarios.map(e => ({
    k: e.clave, k2: `${fmt.e(e.cfm)} CFM`, v: e.cfm,
    color: e.cabe ? "var(--ok)" : e.veredicto === "Marginal" ? "var(--warn)" : "var(--bad)" }));
  const filas = v.escenarios.map(e => {
    const est = e.cabe ? "ok" : e.veredicto === "Marginal" ? "warn" : "bad";
    return `<tr><td class="mono">${e.clave}</td><td>${fmt.esc(e.nombre)}</td>
      <td class="num">${fmt.e(e.m3min)}</td><td class="num">${fmt.e(e.cfm)}</td>
      <td class="num ${est}">${fmt.pct(e.uso_caudal_medido, 1)}</td>
      <td class="num">${fmt.pct(e.uso_ventilador, 1)}</td>
      <td class="num ${est}">${e.deficit_cfm ? fmt.e(e.deficit_cfm) : "—"}</td>
      <td>${pastilla(e.veredicto.toUpperCase(), est)}</td></tr>`;
  }).join("");
  const seg = [500, 750, 1000, 1500, 2000].map(m =>
    `<button class="${m === meta ? "sel" : ""}" data-meta="${m}">${m}</button>`).join("");

  return `<div class="cabeza"><h2>Balance de ventilacion</h2>
      <span class="sub">3 m³/min por HP diesel + 6 m³/min por persona · D.S. 024-2016-EM</span></div>
    <div class="lectura">
      <span>control tesis <b class="${v.control_ok ? "ok" : "bad"}">${fmt.e(v.control_cfm)} CFM</b></span><span class="s">·</span>
      <span>${v.control_ok ? "metodo validado" : "NO reproduce la fuente"}</span><span class="s">·</span>
      <span>caudal medido <b>${fmt.e(v.cfm_medido)}</b></span><span class="s">·</span>
      <span>ventilador <b>${fmt.e(v.cfm_ventilador)}</b></span>
    </div>
    <div class="grid g4" style="margin-bottom:10px">
      ${kpi("Aire evitado por el BEV", fmt.e(v.aire_evitado_cfm), "CFM", { est: "ok" })}
      ${kpi("Reduccion del requerimiento", fmt.pct(v.reduccion), "",
            { est: v.reduccion >= 0.35 ? "ok" : "warn", frac: v.reduccion,
              cmp: "Hooli y Halim 2025: 40-50 %" })}
      ${kpi("Escenario diesel", fmt.pct(v.escenarios[1].uso_ventilador, 0), "del ventilador",
            { est: estado(v.escenarios[1].uso_ventilador, 0.6, 0.85, false),
              frac: v.escenarios[1].uso_ventilador, cmp: "para un solo tajo" })}
      ${kpi("Escenario electrico", fmt.pct(v.escenarios[2].uso_ventilador, 0), "del ventilador",
            { est: estado(v.escenarios[2].uso_ventilador, 0.6, 0.85, false),
              frac: v.escenarios[2].uso_ventilador })}
    </div>
    <div class="panel"><div class="head">CAUDAL REQUERIDO POR ESCENARIO
      <span class="r"><span class="segmentado" id="segMeta">${seg}</span> ${fmt.u()}/dia</span></div>
      <div class="body">${svgBarras(barras, { formato: v2 => fmt.e(v2), ref: v.cfm_medido })}</div></div>
    <div class="panel" style="margin-top:10px"><div class="head">DETALLE</div><div class="body">
      <table class="tbl"><thead><tr><th></th><th>Escenario</th><th class="num">m³/min</th>
        <th class="num">CFM</th><th class="num">% medido</th><th class="num">% ventilador</th>
        <th class="num">Deficit</th><th>Veredicto</th></tr></thead><tbody>${filas}</tbody></table>
    </div></div>
    <div class="nota" style="margin-top:10px">El escenario A reproduce los
      <b>47,092 CFM</b> de la tesis (PDF p. 76), lo que valida el metodo antes de
      proyectarlo. El diesel a la meta absorberia
      <b>${fmt.pct(v.escenarios[1].uso_ventilador, 0)}</b> del ventilador de toda la
      Mina Socorro para atender un solo tajo: no es caro, es inviable.</div>`;
};
VISTAS.conectar.ventilacion = c => {
  const s = c.querySelector("#segMeta");
  if (s) s.addEventListener("click", e => {
    const b = e.target.closest("[data-meta]");
    if (!b) return;
    D.cache.ventMeta = +b.dataset.meta;
    pintar("ventilacion");
  });
};

/* =========================== 7. COMPARADOR =========================== */
VISTAS.comparador = async () => {
  const f = await api("resumen_flota") || [];
  const sel = D.cache.cmp || [f[1]?.n, f[8]?.n, f[5]?.n].filter(Boolean);
  D.cache.cmp = sel;
  const cols = sel.map(n => f.find(x => x.n === n)).filter(Boolean);
  if (!cols.length) return `<div class="nota">Sin datos.</div>`;

  const mejor = (campo, menorEsMejor = false) => {
    const vals = cols.map(c => c[campo]);
    return menorEsMejor ? Math.min(...vals) : Math.max(...vals);
  };
  const fila = (label, campo, formato, menorEsMejor = false) => {
    const b = mejor(campo, menorEsMejor);
    return `<tr><td style="color:var(--muted)">${label}</td>${cols.map(c =>
      `<td class="num ${c[campo] === b ? "ok" : ""}">${formato(c[campo])}</td>`).join("")}</tr>`;
  };
  const opciones = i => f.map(x =>
    `<option value="${x.n}" ${x.n === sel[i] ? "selected" : ""}>${fmt.esc(x.id + " · " + x.modelo)}</option>`).join("");

  return `<div class="cabeza"><h2>Comparador</h2><span class="sub">verde = mejor de la fila</span></div>
    <table class="tbl"><thead><tr><th style="width:190px"></th>
      ${cols.map((c, i) => `<th><select data-cmp="${i}" style="width:100%">${opciones(i)}</select></th>`).join("")}
    </tr></thead><tbody>
      ${fila("Energia", "energia", v => v)}
      ${fila("Cuchara m³", "cuchara_m3", v => fmt.n(v, 2))}
      ${fila("Ancho mm", "ancho_mm", v => fmt.e(v), true)}
      ${fila("Rend. " + fmt.u() + "/h", "rend", v => fmt.n(v, 1))}
      ${fila("Capacidad/dia", "cap_dia", v => fmt.masa(v))}
      ${fila("CAPEX", "precio", v => fmt.usd(v), true)}
      ${fila("Costo US$/h", "costo_h", v => fmt.usd(v, 2), true)}
      ${fila("Costo US$/" + fmt.u(), "costo_tcs", v => fmt.usd(v, 2), true)}
      ${fila("CO₂ kg/h", "co2", v => fmt.e(v), true)}
      ${fila("Aire CFM", "aire_cfm", v => fmt.e(v), true)}
      ${fila("Holgura mm", "holgura", v => fmt.e(v))}
      ${fila("Equipos p/ meta", "n_equipos", v => v, true)}
      <tr><td style="color:var(--muted)">Seccion</td>${cols.map(c =>
        `<td class="num">${c.apto ? pastilla("APTO", "ok") : pastilla("NO", "bad")}</td>`).join("")}</tr>
    </tbody></table>`;
};
VISTAS.conectar.comparador = c => {
  c.querySelectorAll("[data-cmp]").forEach(s =>
    s.addEventListener("change", () => {
      D.cache.cmp[+s.dataset.cmp] = +s.value;
      pintar("comparador");
    }));
};

/* ============================== 8. MATRIZ ============================ */
VISTAS.matriz = async () => {
  const m = await api("matriz");
  if (!m) return `<div class="nota">Sin datos.</div>`;
  const ejes = m.criterios.map(c => c.label.split(" ")[0]);
  const paleta = ["var(--series-1)", "var(--series-3)", "var(--series-2)"];
  const top = m.filas.filter(f => f.admisible).slice(0, 3);
  const series = top.map((f, i) => ({
    nombre: f.modelo.slice(0, 22), color: paleta[i],
    datos: m.criterios.map(c => f.puntajes[c.clave] ?? 0) }));

  const cabCrit = m.criterios.map(c =>
    `<th class="num" title="${fmt.esc(c.label)}">${fmt.esc(c.label.split(" ")[0])}<br>
      <span style="font-weight:400;opacity:.65">${fmt.pct(c.peso, 0)}</span></th>`).join("");
  const filas = m.filas.map(f => `<tr class="fila ${D.equipos.find(e => e.id === f.id)?.n === D.sel ? "sel" : ""}"
      data-n="${D.equipos.find(e => e.id === f.id)?.n}">
      <td class="mono">${f.puesto}</td><td class="mono">${f.id}</td>
      <td><b>${fmt.esc(f.modelo)}</b></td>
      ${m.criterios.map(c => `<td class="num">${fmt.n(f.puntajes[c.clave], 1)}</td>`).join("")}
      <td class="num"><b class="${f.total >= 3.8 ? "ok" : f.total >= 3 ? "warn" : ""}">${fmt.n(f.total, 2)}</b></td></tr>`).join("");

  return `<div class="cabeza"><h2>Matriz de decision</h2>
      <span class="sub">normalizacion lineal entre admisibles · seccion eliminatoria</span></div>
    <div class="lectura">
      <span>suma de pesos <b class="${m.pesos_validos ? "ok" : "bad"}">${fmt.pct(m.suma_pesos, 1)}</b></span><span class="s">·</span>
      <span>mejor alternativa <b>${fmt.esc(m.ganador || "—")}</b></span>
    </div>
    <div class="grid g2">
      <div class="panel"><div class="head">PERFIL MULTICRITERIO<span class="r">5 = mejor</span></div>
        <div class="body">${svgRadar(ejes, series)}</div></div>
      <div class="panel"><div class="head">PONDERACIONES</div><div class="body"><div class="kv">
        ${m.criterios.map(c => `<div class="row"><span class="k">${fmt.esc(c.label)}
          <span style="font-size:10px;opacity:.6">(${c.sentido === "min" ? "menor mejor" : c.sentido === "max" ? "mayor mejor" : "eliminatorio"})</span></span>
          <span class="v">${fmt.pct(c.peso, 0)}</span></div>`).join("")}
      </div>
      <div class="nota" style="margin-top:9px">Quien no entra en la labor recibe
        <b>cero</b>, por bueno que sea en los demas criterios.</div>
      </div></div>
    </div>
    <div class="panel" style="margin-top:10px"><div class="head">PUNTAJES</div><div class="body">
      <table class="tbl"><thead><tr><th class="num">#</th><th>ID</th><th>Modelo</th>${cabCrit}<th class="num">Total</th></tr></thead>
      <tbody>${filas}</tbody></table></div></div>`;
};
VISTAS.conectar.matriz = c => {
  c.querySelectorAll("tr.fila").forEach(t =>
    t.dataset.n && t.addEventListener("click", () => seleccionar(+t.dataset.n)));
};

/* ============================= 9. PAYBACK ============================ */
VISTAS.payback = async () => {
  const p = await api("payback");
  if (!p) return `<div class="nota">Sin datos.</div>`;
  const barras = p.barrido.map(b => ({
    k: fmt.e(b.meta), k2: b.payback == null ? "nunca" : fmt.n(b.payback, 1) + " a",
    v: b.payback == null ? 0 : b.payback,
    color: b.ventana ? "var(--ok)" : b.payback > 12 ? "var(--bad)" : "var(--warn)" }));
  const f = p.flujo;
  const lineas = svgLineas([
    { nombre: "Caso base (diesel)", datos: f.base, color: "var(--bad)" },
    { nombre: "Retador (BEV)", datos: f.retador, color: "var(--ok)" },
  ], f.anios.map(a => a + "a"), { formato: v => "$" + fmt.e(v / 1000) + "k" });
  const neto = svgLineas([
    { nombre: "Ahorro neto acumulado", datos: f.ahorro_neto, color: "var(--accent)" },
  ], f.anios.map(a => a + "a"), { formato: v => "$" + fmt.e(v / 1000) + "k", cero: true });

  const filas = p.barrido.map(b => `<tr class="${b.ventana ? "" : ""}">
      <td class="num">${fmt.e(b.meta)}</td>
      <td class="num">${b.n_base}</td><td class="num">${b.n_retador}</td>
      <td class="num ${b.equipos_ahorrados > 0 ? "ok" : ""}">${b.equipos_ahorrados > 0 ? "−" + b.equipos_ahorrados : "0"}</td>
      <td class="num">${fmt.usd(b.capex_extra)}</td>
      <td class="num">${fmt.usd(b.ahorro_anual)}</td>
      <td class="num ${b.ventana ? "ok" : b.payback > 12 ? "bad" : "warn"}">
        <b>${b.payback == null ? "nunca" : fmt.n(b.payback, 1)}</b></td>
      <td>${b.ventana ? pastilla("VENTANA", "ok") : ""}</td></tr>`).join("");

  return `<div class="cabeza"><h2>Evaluacion economica</h2>
      <span class="sub">${fmt.esc(p.base)} frente a ${fmt.esc(p.retador)}</span></div>
    <div class="lectura">
      <span>ventanas favorables <b class="ok">${p.ventanas.map(v => fmt.e(v)).join(" y ") || "ninguna"} ${fmt.u()}/dia</b></span>
      <span class="s">·</span><span>CAPEX retador <b>${fmt.usd(p.capex_unitario_retador)}</b>/unidad</span>
    </div>
    <div class="nota" style="margin-bottom:10px">El resultado <b>no es una curva suave</b>:
      es un diente de sierra. El payback cae en seco en las metas donde el electrico cubre
      la produccion con <b>una unidad menos</b> que el diesel, y vuelve a subir apenas
      necesita comprar la siguiente. El motor economico es el <b>CAPEX del diesel que no
      hay que adquirir</b>, no el ahorro de combustible.</div>
    <div class="panel"><div class="head">PAYBACK SEGUN META<span class="r">verde = ventana favorable</span></div>
      <div class="body">${svgBarras(barras, { formato: v => v ? fmt.n(v, 1) : "—" })}</div></div>
    <div class="grid g2" style="margin-top:10px">
      <div class="panel"><div class="head">GASTO ACUMULADO<span class="r">linea mas baja = mejor</span></div>
        <div class="body">${lineas}</div></div>
      <div class="panel"><div class="head">AHORRO NETO<span class="r">cruza cero en el payback</span></div>
        <div class="body">${neto}</div></div>
    </div>
    <div class="panel" style="margin-top:10px"><div class="head">BARRIDO</div><div class="body">
      <table class="tbl"><thead><tr><th class="num">Meta</th><th class="num">N base</th>
        <th class="num">N retador</th><th class="num">Ahorra</th><th class="num">Δ CAPEX</th>
        <th class="num">Ahorro anual</th><th class="num">Payback (a)</th><th></th></tr></thead>
      <tbody>${filas}</tbody></table></div></div>`;
};

/* =========================== 10. PARAMETROS ========================== */
VISTAS.parametros = async () => {
  const doc = await api("params");
  if (!doc) return `<div class="nota">Sin datos.</div>`;
  const grupos = doc.grupos.map(g => {
    const campos = g.campos.map(c => {
      if (c.derivado) {
        return `<div class="pfila derivado">
          <div class="et">${fmt.esc(c.label)}<small>derivado · celda ${c.celda}</small></div>
          <div></div>
          <div class="val">${typeof c.valor === "number" ? fmt.n(c.valor, 3) : fmt.esc(c.valor)}</div></div>`;
      }
      const esPct = c.tipo === "porcentaje";
      const paso = c.paso ?? (esPct ? 0.005 : 0.01);
      return `<div class="pfila" data-clave="${c.clave}">
        <div class="et">${fmt.esc(c.label)}${c.nota ? `<small>${fmt.esc(c.nota)}</small>` : ""}</div>
        <div><input type="range" data-rango="${c.clave}" min="${c.min ?? 0}"
          max="${c.max ?? 1}" step="${paso}" value="${c.valor}"></div>
        <div><input type="number" class="val" data-num="${c.clave}" step="${paso}"
          value="${c.valor}" style="width:100%"></div></div>`;
    }).join("");
    return `<div class="panel" style="margin-bottom:10px">
      <div class="head">${fmt.esc(g.grupo)}</div><div class="body">${campos}</div></div>`;
  }).join("");

  return `<div class="cabeza"><h2>Parametros</h2>
      <span class="sub">editar recalcula todo el modelo · se guarda en params.json</span></div>
    <div class="lectura"><span>origen <b>${fmt.esc(doc.origen)}</b></span><span class="s">·</span>
      <span><b>${Object.keys(doc.valores).length}</b> valores editables</span><span class="s">·</span>
      <span class="s">los campos atenuados son derivados</span></div>
    ${grupos}`;
};
VISTAS.conectar.parametros = c => {
  const aplicar = async (clave, valor, fila) => {
    await api("set_param", clave, valor);
    if (fila) fila.classList.add("cambiado");
    await refrescarResumen();
    pintarHUD();
    Object.keys(wins).forEach(id => {
      if (id !== "parametros" && wins[id].abierta) pintar(id);
    });
    await refrescarEscena();
  };
  c.querySelectorAll("[data-rango]").forEach(r => {
    const clave = r.dataset.rango;
    const num = c.querySelector(`[data-num="${clave}"]`);
    r.addEventListener("input", () => { if (num) num.value = r.value; });
    r.addEventListener("change", () => aplicar(clave, +r.value, r.closest(".pfila")));
  });
  c.querySelectorAll("[data-num]").forEach(n => {
    const clave = n.dataset.num;
    const rango = c.querySelector(`[data-rango="${clave}"]`);
    n.addEventListener("change", () => {
      if (rango) rango.value = n.value;
      aplicar(clave, +n.value, n.closest(".pfila"));
    });
  });
};

/* ============================ 11. OPCIONES =========================== */
VISTAS.opciones = async () => {
  const refs = await api("referencias") || [];
  return `<div class="cabeza"><h2>Opciones</h2><span class="sub">preferencias y datos</span></div>
    <div class="panel"><div class="head">APARIENCIA</div><div class="body">
      <div class="pfila"><div class="et">Tema<small>oscuro o claro</small></div><div></div>
        <div><span class="segmentado" id="segTema">
          <button data-tema="dark" class="${D.tema !== "light" ? "sel" : ""}">Oscuro</button>
          <button data-tema="light" class="${D.tema === "light" ? "sel" : ""}">Claro</button></span></div></div>
      <div class="pfila"><div class="et">Unidad de masa<small>TCS = tonelada corta seca (907.185 kg)</small></div><div></div>
        <div><span class="segmentado" id="segUnidad">
          <button data-u="TCS" class="${D.unidad === "TCS" ? "sel" : ""}">TCS</button>
          <button data-u="t" class="${D.unidad === "t" ? "sel" : ""}">t metrica</button></span></div></div>
    </div></div>

    <div class="panel" style="margin-top:10px"><div class="head">DATOS</div><div class="body">
      <div class="pfila"><div class="et">Reimportar desde Excel
        <small>vuelve a leer el libro y regenera los JSON</small></div><div></div>
        <div><button class="btn" id="btnImportar">${ico("reimportar", 13)} Elegir archivo</button></div></div>
      <div class="pfila"><div class="et">Restablecer parametros
        <small>descarta los cambios manuales y vuelve al Excel</small></div><div></div>
        <div><button class="btn" id="btnReset">Restablecer</button></div></div>
      <div id="msgDatos" style="margin-top:8px"></div>
    </div></div>

    <div class="panel" style="margin-top:10px"><div class="head">REFERENCIAS
      <span class="r">${refs.length} fuentes</span></div><div class="body" style="max-height:230px">
      <table class="tbl"><thead><tr><th>Concepto</th><th>Valor</th><th>Fuente</th><th>Pag.</th></tr></thead>
      <tbody>${refs.map(r => `<tr><td>${fmt.esc(r.concepto)}</td>
        <td class="mono" style="font-size:11px">${fmt.esc(r.valor)}</td>
        <td style="font-size:11px;color:var(--muted)">${fmt.esc(r.fuente)}</td>
        <td class="num">${fmt.esc(r.pagina)}</td></tr>`).join("")}</tbody></table>
    </div></div>`;
};
VISTAS.conectar.opciones = c => {
  c.querySelector("#segTema")?.addEventListener("click", e => {
    const b = e.target.closest("[data-tema]"); if (b) aplicarTema(b.dataset.tema);
  });
  c.querySelector("#segUnidad")?.addEventListener("click", e => {
    const b = e.target.closest("[data-u]"); if (b) aplicarUnidad(b.dataset.u);
  });
  const msg = c.querySelector("#msgDatos");
  c.querySelector("#btnImportar")?.addEventListener("click", async () => {
    msg.innerHTML = `<div class="nota">Importando…</div>`;
    const r = await api("elegir_excel");
    msg.innerHTML = r?.ok
      ? `<div class="nota ok">Reimportado. Los JSON se regeneraron.</div>`
      : `<div class="nota bad">${fmt.esc(r?.error || "sin cambios")}</div>`;
    if (r?.ok) { await iniciarDatos(); }
  });
  c.querySelector("#btnReset")?.addEventListener("click", async () => {
    await api("restablecer");
    msg.innerHTML = `<div class="nota ok">Parametros restablecidos.</div>`;
    await iniciarDatos();
  });
};

/** Recarga datos y repinta todo (tras reimportar). */
async function iniciarDatos() {
  const datos = await api("datos_iniciales");
  if (datos) {
    D.equipos = datos.equipos || [];
    D.params = datos.params || null;
    D.secciones = datos.secciones || [];
  }
  await refrescarResumen();
  pintarSelector(); pintarHUD();
  await refrescarEscena();
  Object.keys(wins).forEach(id => wins[id].abierta && pintar(id));
}
