# -*- coding: utf-8 -*-
"""
Matriz de decision multicriterio.

Siete criterios ponderados con normalizacion lineal entre el mejor y el peor de
los equipos ADMISIBLES. El cumplimiento de la seccion es eliminatorio: quien no
entra en la labor recibe puntaje total cero, por bueno que sea en lo demas.
"""
from __future__ import annotations

from dataclasses import dataclass

from .modelo import Modelo, Resultado

# clave interna -> (parametro de peso en params.json, sentido)
#   sentido: "min" = menor es mejor, "max" = mayor es mejor, "ko" = eliminatorio
CRITERIOS = [
    ("costo_tcs",      "costo_por_tonelada",     "min", "Costo por tonelada"),
    ("productividad",  "productividad",          "max", "Productividad"),
    ("seccion",        "cumple_seccion",         "ko",  "Cumple seccion"),
    ("co2",            "emisiones_co2",          "min", "Emisiones CO2"),
    ("ventilacion",    "ventilacion_requerida",  "min", "Ventilacion requerida"),
    ("capex",          "capex",                  "min", "CAPEX"),
    ("flexibilidad",   "flexibilidad_operativa", "max", "Flexibilidad operativa"),
]


def _valor(r: Resultado, clave: str) -> float:
    return {
        "costo_tcs":     r.costos.por_tcs,
        "productividad": r.rend_efectivo_tcsh,
        "co2":           r.co2_kgh,
        "ventilacion":   r.factor_ventilacion,
        "capex":         r.equipo.precio_usd,
        "flexibilidad":  r.equipo.flexibilidad,
    }[clave]


@dataclass
class Fila:
    id: str
    modelo: str
    puntajes: dict[str, float]
    total: float
    admisible: bool
    puesto: int = 0

    def como_dict(self) -> dict:
        return {
            "id": self.id, "modelo": self.modelo,
            "puntajes": {k: round(v, 2) for k, v in self.puntajes.items()},
            "total": round(self.total, 2),
            "admisible": self.admisible, "puesto": self.puesto,
        }


class Matriz:
    def __init__(self, modelo: Modelo):
        self.m = modelo

    def pesos(self) -> dict[str, float]:
        return {c: self.m.p[param] for c, param, _, _ in CRITERIOS}

    def suma_pesos(self) -> float:
        return sum(self.pesos().values())

    def evaluar(self) -> list[Fila]:
        todos = self.m.evaluar_todos()
        admisibles = [r for r in todos if r.geometria.apto_produccion]
        pesos = self.pesos()
        filas: list[Fila] = []

        # rangos de normalizacion: solo sobre los admisibles
        rangos: dict[str, tuple[float, float]] = {}
        for clave, _, sentido, _ in CRITERIOS:
            if sentido == "ko" or not admisibles:
                continue
            vals = [_valor(r, clave) for r in admisibles]
            rangos[clave] = (min(vals), max(vals))

        for r in todos:
            apto = r.geometria.apto_produccion
            puntajes: dict[str, float] = {}
            for clave, _, sentido, _ in CRITERIOS:
                if sentido == "ko":
                    puntajes[clave] = 5.0 if apto else 0.0
                    continue
                lo, hi = rangos.get(clave, (0.0, 0.0))
                v = _valor(r, clave)
                if hi == lo:
                    s = 5.0
                elif sentido == "min":
                    s = 5.0 * (hi - v) / (hi - lo)
                else:
                    s = 5.0 * (v - lo) / (hi - lo)
                puntajes[clave] = max(0.0, min(5.0, s))

            total = sum(puntajes[c] * pesos[c] for c, _, _, _ in CRITERIOS) if apto else 0.0
            filas.append(Fila(id=r.equipo.id, modelo=r.equipo.modelo,
                              puntajes=puntajes, total=total, admisible=apto))

        for i, f in enumerate(sorted(filas, key=lambda x: -x.total), 1):
            f.puesto = i
        return sorted(filas, key=lambda x: x.puesto)

    def ganador(self) -> Fila | None:
        filas = self.evaluar()
        return filas[0] if filas and filas[0].admisible else None

    def como_dict(self) -> dict:
        filas = self.evaluar()
        g = filas[0] if filas else None
        return {
            "criterios": [{"clave": c, "label": lab, "peso": self.m.p[p], "sentido": s}
                          for c, p, s, lab in CRITERIOS],
            "suma_pesos": round(self.suma_pesos(), 6),
            "pesos_validos": abs(self.suma_pesos() - 1.0) < 1e-6,
            "filas": [f.como_dict() for f in filas],
            "ganador": g.modelo if g and g.admisible else None,
        }
