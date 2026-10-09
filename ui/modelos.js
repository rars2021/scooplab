/* ============================================================================
   Rasgos propios de cada equipo, tomados de las fichas de fabricante
   (ui/fuentes/) comparando la foto y el plano con el modelo 3D.

   Cotas en mm, de la vista lateral de cada ficha:
     volTras  parachoques trasero -> eje trasero
     tras     eje trasero -> articulacion
     del      articulacion -> eje delantero
     labio    eje delantero -> labio de la cuchara (posicion de acarreo)
     rueda    diametro del neumatico (ruedaDel si el delantero es distinto)
     capo     altura del capo del bastidor trasero
   Si la suma no coincide con el largo del catalogo se escala.

   cabina: "abierta" (techo sobre postes), "rops" (postes gruesos y respaldo),
           "cerrada" (cabina con vidrios).
   ========================================================================= */

const AMARILLO_AC = 0xf2c200;      // Atlas Copco / Epiroc
const ROJO_SANDVIK = 0xe2401c;
const AMARILLO_CAT = 0xf5b200;

export const MODELOS = {
  // Atlas Copco Scooptram ST3.5 — ficha 9851 2254 01g, p. 4: todo amarillo,
  // techo abierto sobre postes detras de la articulacion, capo largo y bajo.
  E01: { rotulo: "ST3.5", cuerpo: AMARILLO_AC, cuchara: AMARILLO_AC, aro: AMARILLO_AC, detalle: 0x2b2f35,
         cabina: "abierta", cabinaColor: AMARILLO_AC, brazo: "paralelo",
         volTras: 2640, tras: 1490, del: 1410, labio: 2920, rueda: 1350, capo: 1610 },

  // Sandvik Toro LH307 — ficha TS3-LH307-B-04B, p. 2 y 9: rojo anaranjado,
  // cabina cerrada blanca y alta, barandas sobre el capo, aros rojos.
  E02: { rotulo: "LH307", cuerpo: ROJO_SANDVIK, cuchara: ROJO_SANDVIK, aro: ROJO_SANDVIK, detalle: 0x30343a,
         cabina: "cerrada", cabinaColor: 0xe8ebee, brazo: "paralelo", baranda: ROJO_SANDVIK,
         volTras: 2940, tras: 1580, del: 1580, labio: 3227, rueda: 1400, capo: 1687 },

  // Epiroc Scooptram ST7 — ficha 9869 0107 01d, p. 8-9: amarillo con gris
  // oscuro, cabina cerrada amarilla, capo trasero muy bajo (1385 mm).
  E03: { rotulo: "ST7", cuerpo: 0xffc20e, cuchara: 0xffc20e, aro: 0x3a3f46, detalle: 0x2b2f35,
         cabina: "cerrada", cabinaColor: 0xffc20e, brazo: "paralelo",
         volTras: 2605, tras: 1648, del: 1648, labio: 2804, rueda: 1379, capo: 1385 },

  // Cat R1300G — Specalog AEHQ6356-01, p. 1 y 14: amarillo Cat, rejilla
  // negra grande atras, ROPS de postes, varillaje en Z, filtro de aire visible.
  E04: { rotulo: "R1300G", cuerpo: AMARILLO_CAT, cuchara: AMARILLO_CAT, aro: AMARILLO_CAT, detalle: 0x17191c,
         cabina: "rops", cabinaColor: AMARILLO_CAT, brazo: "zbar", rejillaNegra: true, filtroAire: true,
         volTras: 2932, tras: 1525, del: 1525, labio: 2732, rueda: 1350, capo: 1628 },

  // Sandvik Toro LH203 — ficha TS3-LH203-29, p. 7: el mas chico; rojo, techo
  // abierto bajo, ruedas pequenas y capo a 1515 mm.
  E05: { rotulo: "LH203", cuerpo: ROJO_SANDVIK, cuchara: ROJO_SANDVIK, aro: ROJO_SANDVIK, detalle: 0x30343a,
         cabina: "abierta", cabinaColor: ROJO_SANDVIK, brazo: "paralelo",
         volTras: 2201, tras: 1250, del: 1255, labio: 2640, rueda: 1090, capo: 1515 },

  // Epiroc Scooptram ST7 Battery — sin ficha publica: chasis del ST7 (video de
  // Epiroc Peru) con el paquete de baterias en lugar del motor.
  E08: { rotulo: "ST7 BATTERY", cuerpo: 0xffc20e, cuchara: 0xffc20e, aro: 0x3a3f46, detalle: 0x2b2f35,
         cabina: "cerrada", cabinaColor: 0xffc20e, brazo: "paralelo",
         bateria: { color: 0x3a3f46, franja: 0x2e9e6e },
         volTras: 2605, tras: 1648, del: 1648, labio: 2804, rueda: 1379, capo: 1385 },

  // Sandvik Artisan A10 — ficha Artisan (2019), p. 3 y 5: rojo, cabina cerrada
  // blanca, paquete de baterias negro arriba y atras, ruedas negras (las
  // delanteras mas grandes: 18.00R25 contra 17.5R25), batalla de 3400 mm.
  E09: { rotulo: "A10", cuerpo: ROJO_SANDVIK, cuchara: ROJO_SANDVIK, aro: 0x202327, detalle: 0x202327,
         cabina: "cerrada", cabinaColor: 0xe8ebee, brazo: "paralelo",
         bateria: { color: 0x17191c, franja: ROJO_SANDVIK },
         volTras: 2900, tras: 1700, del: 1700, labio: 3600, rueda: 1380, ruedaDel: 1500, capo: 1450 },
};
