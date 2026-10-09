# -*- coding: utf-8 -*-
"""
Red de galerias: nodos, tramos, curvas y la ruta del scoop.

El Excel no trae trazo; esta parte es nueva. Sirve para dos cosas:
  - revisar si cada equipo gira en cada curva (radio y ancho barrido);
  - medir la longitud real de la ruta frente - echadero.

Ancho barrido en curva (equipo articulado, ambos ejes sobre el mismo arco):

    a^2      = R_ext^2 - (R_int + W)^2          voladizo efectivo, del catalogo
    barrido  = sqrt((R + W/2)^2 + a^2) - (R - W/2)

Con R = R_int + W/2 (giro minimo) devuelve R_ext - R_int; con R grande tiende a W.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

FACTOR_RADIO_INT = 1.21      # R_int ~ R_ext - 1.21 W cuando el catalogo no lo trae
RECTO = 1e-3                 # rad: por debajo, dos bordes se toman como alineados


@dataclass
class RevisionCurva:
    id: str
    nombre: str
    nodo: str
    radio_m: float
    angulo_deg: float
    radio_min_m: float           # radio de eje minimo que el equipo puede seguir
    ancho_barrido_mm: float
    ancho_req_mm: float          # barrido + 2 x holgura
    ancho_disp_mm: float         # seccion mas angosta + sobreancho
    margen_mm: float             # disponible - requerido
    gira: bool                   # radio de la curva >= radio minimo
    cabe: bool                   # gira y el ancho alcanza


def radio_interior_mm(e) -> float:
    """Radio de giro interior: el del catalogo o, si falta, la estimacion."""
    r = getattr(e, "radio_giro_int_mm", None)
    if r:
        return float(r)
    return max(0.0, (e.radio_giro_mm or 0.0) - FACTOR_RADIO_INT * e.ancho_mm)


def radio_eje_min_mm(e) -> float:
    """Radio minimo del eje de la galeria que el equipo puede seguir."""
    return radio_interior_mm(e) + e.ancho_mm / 2.0


def ancho_barrido_mm(e, radio_eje_mm: float) -> float:
    """Franja que ocupa el equipo al recorrer una curva de radio dado (al eje)."""
    w = e.ancho_mm
    a2 = max(0.0, (e.radio_giro_mm or 0.0) ** 2 - (radio_interior_mm(e) + w) ** 2)
    r = max(radio_eje_mm, w / 2.0)
    return math.sqrt((r + w / 2.0) ** 2 + a2) - (r - w / 2.0)


class Red:
    def __init__(self, doc: dict[str, Any], secciones: list):
        self.doc = doc
        self.nodos = {n["id"]: n for n in doc["nodos"]}
        self.tramos = doc["tramos"]
        self.curvas = doc["curvas"]
        self.secciones = {s.clave: s for s in secciones}
        # borde (a, b) -> tramo que lo contiene
        self._borde: dict[frozenset, dict] = {}
        for t in self.tramos:
            for a, b in zip(t["nodos"], t["nodos"][1:]):
                self._borde[frozenset((a, b))] = t

    @classmethod
    def cargar(cls, ruta: Path, secciones: list) -> "Red | None":
        if not ruta.exists():
            return None
        return cls(json.loads(ruta.read_text(encoding="utf-8")), secciones)

    # ---------------------------------------------------------- geometria

    def _xy(self, nodo: str) -> tuple[float, float]:
        n = self.nodos[nodo]
        return n["x"], n["y"]

    def _dist(self, a: str, b: str) -> float:
        (xa, ya), (xb, yb) = self._xy(a), self._xy(b)
        return math.hypot(xb - xa, yb - ya)

    def _deflexion(self, a: str, b: str, c: str) -> float:
        """Angulo de giro en b al pasar de a hacia c, en radianes (0 = recto)."""
        (xa, ya), (xb, yb), (xc, yc) = self._xy(a), self._xy(b), self._xy(c)
        u, v = (xb - xa, yb - ya), (xc - xb, yc - yb)
        return abs(math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]))

    def curva_en(self, a: str, b: str, c: str) -> dict | None:
        for cv in self.curvas:
            if cv["nodo"] == b and set(cv["entre"]) == {a, c}:
                return cv
        return None

    def tramo_de(self, a: str, b: str) -> dict:
        return self._borde[frozenset((a, b))]

    def ancho_seccion_mm(self, a: str, b: str) -> float:
        return self.secciones[self.tramo_de(a, b)["seccion"]].ancho_mm

    def longitud(self, nodos: list[str]) -> float:
        """Longitud desarrollada de una poligonal de nodos, con sus curvas, en m.

        Cada esquina cambia dos tangentes por su arco; la pendiente del tramo
        alarga el recorrido respecto de la planta.
        """
        total = 0.0
        for a, b in zip(nodos, nodos[1:]):
            p = self.tramo_de(a, b).get("pendiente_pct", 0.0) / 100.0
            total += self._dist(a, b) * math.sqrt(1.0 + p * p)
        for a, b, c in zip(nodos, nodos[1:], nodos[2:]):
            cv = self.curva_en(a, b, c)
            delta = self._deflexion(a, b, c)
            if cv is None or delta < RECTO:
                continue
            r = cv["radio_m"]
            total += r * delta - 2.0 * r * math.tan(delta / 2.0)
        return total

    def longitud_ruta(self, fase: str) -> float:
        """Recorrido de una fase ('acarreo' o 'retorno'), maniobras incluidas."""
        return sum(self.longitud(leg["nodos"]) for leg in self.doc["ruta"][fase])

    def pendiente_real(self, tramo: dict) -> float:
        """Pendiente (%) que resulta de las cotas, sobre la longitud desarrollada."""
        ns = tramo["nodos"]
        planta = sum(self._dist(a, b) for a, b in zip(ns, ns[1:]))
        for a, b, c in zip(ns, ns[1:], ns[2:]):
            cv = self.curva_en(a, b, c)
            delta = self._deflexion(a, b, c)
            if cv is not None and delta > RECTO:
                # el nodo de esquina tiene la cota del punto medio del arco
                planta += cv["radio_m"] * delta - 2.0 * cv["radio_m"] * math.tan(delta / 2.0)
        dz = self.nodos[ns[-1]]["z"] - self.nodos[ns[0]]["z"]
        return dz / planta * 100.0 if planta else 0.0

    # ---------------------------------------------------------- revision

    def revisar(self, e, holgura_lado_mm: float) -> list[RevisionCurva]:
        """Una fila por curva: si el equipo gira y si el ancho alcanza."""
        r_min = radio_eje_min_mm(e)
        filas = []
        for cv in self.curvas:
            a, c = cv["entre"]
            b = cv["nodo"]
            radio_mm = cv["radio_m"] * 1000.0
            barrido = ancho_barrido_mm(e, radio_mm)
            req = barrido + 2.0 * holgura_lado_mm
            disp = (min(self.ancho_seccion_mm(a, b), self.ancho_seccion_mm(b, c))
                    + cv.get("sobreancho_mm", 0.0))
            gira = radio_mm >= r_min
            filas.append(RevisionCurva(
                id=cv["id"], nombre=cv["nombre"], nodo=b,
                radio_m=cv["radio_m"],
                angulo_deg=math.degrees(self._deflexion(a, b, c)),
                radio_min_m=r_min / 1000.0,
                ancho_barrido_mm=barrido, ancho_req_mm=req, ancho_disp_mm=disp,
                margen_mm=disp - req, gira=gira, cabe=gira and req <= disp,
            ))
        return filas
