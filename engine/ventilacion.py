# -*- coding: utf-8 -*-
"""
Balance de ventilacion — metodologia de la tesis (PDF p. 76).

    caudal = 3 m3/min por HP de equipo diesel + 6 m3/min por persona
    CFM    = m3/min x 35.3147

El escenario de control (A) debe reproducir 47,092 CFM, que es el valor
publicado en la fuente. Si coincide, la proyeccion a otros escenarios usa la
misma base de calculo que la tesis y no un criterio propio.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .modelo import (AIRE_M3MIN_POR_HP, AIRE_M3MIN_POR_PERSONA, CFM_POR_M3MIN,
                     Equipo, Modelo)

# Caudal medido y capacidad instalada (tesis, PDF p. 76)
CFM_MEDIDO_TAJO = 52460.0
CFM_VENTILADOR_PRINCIPAL = 100000.0

# Equipos auxiliares del tajo 6675-2 (tesis)
HP_JUMBO = 53.0
HP_CAMION = 197.5
HP_SCOOP_TESIS = 182.0


@dataclass
class Componente:
    nombre: str
    cantidad: float
    hp_unitario: float = 0.0
    es_personal: bool = False
    electrico: bool = False

    @property
    def m3min(self) -> float:
        if self.es_personal:
            return self.cantidad * AIRE_M3MIN_POR_PERSONA
        if self.electrico:
            return 0.0
        return self.cantidad * self.hp_unitario * AIRE_M3MIN_POR_HP

    @property
    def cfm(self) -> float:
        return self.m3min * CFM_POR_M3MIN


@dataclass
class Escenario:
    clave: str
    nombre: str
    componentes: list[Componente] = field(default_factory=list)

    @property
    def m3min(self) -> float:
        return sum(c.m3min for c in self.componentes)

    @property
    def cfm(self) -> float:
        return self.m3min * CFM_POR_M3MIN

    @property
    def uso_caudal_medido(self) -> float:
        return self.cfm / CFM_MEDIDO_TAJO

    @property
    def uso_ventilador(self) -> float:
        return self.cfm / CFM_VENTILADOR_PRINCIPAL

    @property
    def deficit_cfm(self) -> float:
        return max(0.0, self.cfm - CFM_MEDIDO_TAJO)

    @property
    def cabe(self) -> bool:
        return self.cfm <= CFM_MEDIDO_TAJO

    @property
    def veredicto(self) -> str:
        if self.cabe:
            return "Cabe"
        return "Marginal" if self.uso_caudal_medido <= 1.15 else "No cabe"

    def como_dict(self) -> dict:
        return {
            "clave": self.clave, "nombre": self.nombre,
            "componentes": [
                {"nombre": c.nombre, "cantidad": c.cantidad,
                 "hp_unitario": c.hp_unitario, "m3min": round(c.m3min, 2),
                 "cfm": round(c.cfm, 0), "electrico": c.electrico}
                for c in self.componentes
            ],
            "m3min": round(self.m3min, 2), "cfm": round(self.cfm, 0),
            "uso_caudal_medido": round(self.uso_caudal_medido, 4),
            "uso_ventilador": round(self.uso_ventilador, 4),
            "deficit_cfm": round(self.deficit_cfm, 0),
            "cabe": self.cabe, "veredicto": self.veredicto,
        }


# ---------------------------------------------------------------- escenarios

def escenario_tesis() -> Escenario:
    """Control A — reproduce la tabla de la tesis: 47,092 CFM."""
    return Escenario("A", "500 TCS/dia · diesel (tesis)", [
        Componente("Personal por guardia", 6, es_personal=True),
        Componente("Scoop 3.5 yd3", 1, HP_SCOOP_TESIS),
        Componente("Jumbo de perforacion", 1, HP_JUMBO),
        Componente("Camion de bajo perfil", 1, HP_CAMION),
    ])


def escenario_meta(modelo: Modelo, equipo: Equipo, meta_tcs_dia: float,
                   personal: int = 12, jumbos: int = 2, camiones: int = 2,
                   clave: str = "X", nombre: str | None = None) -> Escenario:
    """Escenario parametrico: N scoops del equipo dado + auxiliares diesel."""
    n = modelo.n_equipos(equipo, meta_tcs_dia)
    etiqueta = nombre or f"{meta_tcs_dia:,.0f} TCS/dia · {equipo.modelo}"
    return Escenario(clave, etiqueta, [
        Componente("Personal por guardia", personal, es_personal=True),
        Componente(f"{equipo.modelo}", n, equipo.potencia_hp,
                   electrico=equipo.es_electrico),
        Componente("Jumbo de perforacion", jumbos, HP_JUMBO),
        Componente("Camion de bajo perfil", camiones, HP_CAMION),
    ])


def comparar(modelo: Modelo, equipo_diesel: Equipo, equipo_bev: Equipo,
             meta_tcs_dia: float = 1000.0, **kw) -> dict:
    """Los tres escenarios del caso: A control, B diesel a meta, C BEV a meta."""
    a = escenario_tesis()
    b = escenario_meta(modelo, equipo_diesel, meta_tcs_dia, clave="B",
                       nombre=f"{meta_tcs_dia:,.0f} TCS/dia · diesel", **kw)
    c = escenario_meta(modelo, equipo_bev, meta_tcs_dia, clave="C",
                       nombre=f"{meta_tcs_dia:,.0f} TCS/dia · electrico", **kw)
    evitado = b.cfm - c.cfm
    return {
        "escenarios": [a.como_dict(), b.como_dict(), c.como_dict()],
        "control_ok": abs(a.cfm - 47092.0) < 2.0,
        "aire_evitado_cfm": round(evitado, 0),
        "reduccion": round(1.0 - c.cfm / b.cfm, 4) if b.cfm else 0.0,
        "cfm_medido": CFM_MEDIDO_TAJO,
        "cfm_ventilador": CFM_VENTILADOR_PRINCIPAL,
    }
