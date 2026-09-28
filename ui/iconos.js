/* ============================================================================
   Iconos SVG — trazo con currentColor, sin relleno, sin emojis.
   Lienzo 24x24, stroke-width 1.6. Uno por seccion de la barra de tareas.
   ========================================================================= */
"use strict";

const ICONOS = {
  /* 1. Flota — listado de equipos */
  flota: '<path d="M3 6h18M3 12h18M3 18h11"/><circle cx="18.5" cy="18" r="2.2"/>',

  /* 2. Equipo — cargador de bajo perfil visto de lado */
  equipo: '<path d="M2 15h3l2-4h7l3 4h5"/><path d="M4 11V8h5"/><circle cx="7" cy="17.6" r="1.9"/><circle cx="17" cy="17.6" r="1.9"/>',

  /* 3. Geometria — seccion de labor con equipo dentro y cotas */
  geometria: '<path d="M3 20V7l9-4 9 4v13"/><rect x="8" y="13" width="8" height="5"/><path d="M3 20h18"/>',

  /* 4. Ciclo — carga, acarreo, descarga, retorno */
  ciclo: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20.5 3v4.2h-4.2"/><circle cx="12" cy="12" r="2"/>',

  /* 5. Costos — barras de desglose con moneda */
  costos: '<path d="M4 20V10M9.3 20V5M14.7 20v-8M20 20v-5"/><path d="M3 20h18"/>',

  /* 6. Ventilacion — aspa de ventilador */
  ventilacion: '<circle cx="12" cy="12" r="1.9"/><path d="M12 10.1C12 6.6 10.6 3 13.4 3c2.1 0 2.3 3.4-1.4 7.1"/><path d="M13.9 12c3.5 0 7.1-1.4 7.1 1.4 0 2.1-3.4 2.3-7.1-1.4"/><path d="M12 13.9c0 3.5 1.4 7.1-1.4 7.1-2.1 0-2.3-3.4 1.4-7.1"/><path d="M10.1 12C6.6 12 3 13.4 3 10.6 3 8.5 6.4 8.3 10.1 12"/>',

  /* 7. Comparador — dos columnas confrontadas */
  comparador: '<rect x="3" y="4" width="7" height="16"/><rect x="14" y="4" width="7" height="16"/><path d="M10.5 12h3"/><path d="M12.6 10.4 14.2 12l-1.6 1.6"/>',

  /* 8. Matriz — radar multicriterio */
  matriz: '<path d="M12 2.6 20.5 8v8L12 21.4 3.5 16V8z"/><path d="M12 7.2 16.8 10v4.6L12 17.4 7.2 14.6V10z"/><path d="M12 2.6v4.6M20.5 8l-3.7 2M20.5 16l-3.7-1.4M12 21.4v-4M3.5 16l3.7-1.4M3.5 8l3.7 2"/>',

  /* 9. Payback — curva que cruza el cero */
  payback: '<path d="M3 20h18"/><path d="M3 4v16"/><path d="M4.5 17.5 9 13l3.4 2.6L20 6"/><path d="M3 13h18" stroke-dasharray="2 2"/><circle cx="12.4" cy="13" r="1.6"/>',

  /* 10. Parametros — deslizadores */
  parametros: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15.5" cy="12" r="2"/><circle cx="7" cy="17" r="2"/>',

  /* 12. Simulacion — operacion completa del equipo */
  simulacion: '<path d="M3 19h18"/><path d="M4 15.5h3l1.6-3h5.6l2 3H20"/><circle cx="8.4" cy="17.2" r="1.5"/><circle cx="16.6" cy="17.2" r="1.5"/><path d="M6.2 9.6 4.4 8.2M9.3 7.6V5.3M12.6 9.3l1.7-1.9"/>',

  /* 11. Opciones — engranaje */
  opciones: '<circle cx="12" cy="12" r="2.8"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/>',

  /* auxiliares de cromo */
  minimizar: '<path d="M5 12h14"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  detalle: '<rect x="3" y="4" width="18" height="16"/><path d="M3 9h18M8 9v11"/>',
  analizar: '<path d="M3 17c3-6 5-6 7-2s4 4 7-5"/><path d="M3 20h18"/>',
  reimportar: '<path d="M20 11a8 8 0 1 0-1.6 5.6"/><path d="M20 4v5h-5"/>',
  guardar: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7V3M8 21v-7h8v7"/>',
  play: '<path d="M7 4.5 20 12 7 19.5Z" fill="currentColor" stroke="none"/>',
  pausa: '<rect x="6.5" y="4.5" width="3.6" height="15" fill="currentColor" stroke="none"/><rect x="13.9" y="4.5" width="3.6" height="15" fill="currentColor" stroke="none"/>',
  inicio_t: '<path d="M18.5 4.5 7 12l11.5 7.5Z" fill="currentColor" stroke="none"/><rect x="4.2" y="4.5" width="2.4" height="15" fill="currentColor" stroke="none"/>',
};

/** Devuelve el markup SVG de un icono. */
function ico(nombre, tam = 17) {
  const d = ICONOS[nombre];
  if (!d) return "";
  return `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none"
    stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/* ============================================================================
   EMBLEMA — marca de la aplicacion.

   Silueta del cargador de bajo perfil con tres barras de indicadores debajo.
   A 20 px se lee como una maquina; a 40 px se distinguen las barras.
   Se tiñe segun la energia del equipo seleccionado y las barras reflejan sus
   valores normalizados, de modo que la marca informa en vez de solo decorar.

   Relleno en vez de trazo: a tamaño de barra de tareas el relleno es legible
   y el trazo de 1.5 px se pierde.
   ========================================================================= */

/**
 * @param {object} o
 *   tam      lado en px (por defecto 20)
 *   acento   color de la cuchara y las barras (por defecto currentColor)
 *   stats    [0..1, 0..1, 0..1] alturas de las tres barras
 *   marco    dibuja el recuadro alrededor
 */
function emblema(o = {}) {
  const tam = o.tam || 20;
  const acento = o.acento || "currentColor";
  const s = Array.isArray(o.stats) ? o.stats : [0.55, 0.85, 0.4];
  const marco = o.marco !== false;

  // barras: base en y=22, altura maxima 6
  const barras = s.map((v, i) => {
    const h = 1.1 + Math.max(0, Math.min(1, v)) * 5.2;
    const x = 4.2 + i * 5.6;
    return `<rect x="${x}" y="${22 - h}" width="3.1" height="${h}" fill="${acento}" opacity="${0.55 + i * 0.16}"/>`;
  }).join("");

  return `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" aria-hidden="true">
    ${marco ? `<rect x="0.7" y="0.7" width="22.6" height="22.6" fill="none"
        stroke="${acento}" stroke-width="1.3" opacity=".9"/>` : ""}
    <g>
      <!-- cuchara cargada -->
      <path d="M2.6 12.4 L7.2 11.1 L8.0 14.6 L3.4 15.6 Z" fill="${acento}"/>
      <!-- brazo -->
      <path d="M7.4 12.0 L11.2 10.9 L11.6 12.2 L7.8 13.3 Z" fill="currentColor" opacity=".85"/>
      <!-- chasis delantero y trasero con articulacion -->
      <path d="M10.6 9.9 L14.0 9.9 L14.0 13.9 L10.6 13.9 Z" fill="currentColor" opacity=".9"/>
      <path d="M14.6 8.9 L21.2 8.9 L21.2 13.9 L14.6 13.9 Z" fill="currentColor"/>
      <!-- cabina -->
      <path d="M15.1 5.6 L18.4 5.6 L18.4 8.6 L15.1 8.6 Z" fill="${acento}" opacity=".95"/>
      <!-- ruedas -->
      <circle cx="12.3" cy="15.2" r="2.25" fill="currentColor"/>
      <circle cx="12.3" cy="15.2" r="0.85" fill="var(--panel,#1c1f23)"/>
      <circle cx="18.9" cy="15.2" r="2.25" fill="currentColor"/>
      <circle cx="18.9" cy="15.2" r="0.85" fill="var(--panel,#1c1f23)"/>
    </g>
    ${barras}
  </svg>`;
}
