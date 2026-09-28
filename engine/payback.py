# -*- coding: utf-8 -*-
"""
Evaluacion economica BEV frente a diesel.

El resultado NO es una curva suave: es un diente de sierra. El periodo de
recuperacion cae en seco en las metas donde el equipo electrico cubre la
produccion con UNA unidad menos que el diesel, y vuelve a subir apenas el BEV
necesita comprar su siguiente unidad.

El motor economico real es el CAPEX del equipo diesel que la mayor
productividad del electrico permite NO adquirir, no el ahorro de combustible.
"""
from __future__ import annotations

from dataclasses import dataclass

from .modelo import Equipo, Modelo


@dataclass
class Punto:
    meta_tcs_dia: float
    n_base: int
    n_retador: int
    equipos_ahorrados: int
    capex_extra: float
    opex_base_anual: float
    opex_retador_anual: float
    ahorro_anual: float
    payback_anios: float | None       # None = nunca se recupera
    ventana_favorable: bool

    def como_dict(self) -> dict:
        return {
            "meta": self.meta_tcs_dia, "n_base": self.n_base,
            "n_retador": self.n_retador, "equipos_ahorrados": self.equipos_ahorrados,
            "capex_extra": round(self.capex_extra, 0),
            "opex_base": round(self.opex_base_anual, 0),
            "opex_retador": round(self.opex_retador_anual, 0),
            "ahorro_anual": round(self.ahorro_anual, 0),
            "payback": round(self.payback_anios, 1) if self.payback_anios else None,
            "ventana": self.ventana_favorable,
        }


class Payback:
    def __init__(self, modelo: Modelo, base: Equipo, retador: Equipo,
                 unidades_ya_poseidas: int = 1, umbral_ventana: float = 8.0):
        self.m = modelo
        self.base = base
        self.retador = retador
        self.poseidas = unidades_ya_poseidas
        self.umbral = umbral_ventana

    # ------------------------------------------------------------ piezas

    def capex_unitario_retador(self) -> float:
        """Precio del equipo + infraestructura de carga si es a bateria."""
        infra = (self.m.p.costo_infraestructura_de_carga_por_equipo_bev
                 if self.retador.es_bateria else 0.0)
        return self.retador.precio_usd + infra

    def opex_anual(self, e: Equipo, meta_tcs_dia: float) -> float:
        """Horas de flota al año x OPEX cash. No incluye depreciacion."""
        rend = self.m.rend_efectivo(e)
        horas = (meta_tcs_dia * self.m.p.dias_operativos_por_ano) / rend
        return horas * self.m.costos(e).opex_cash_h

    def ahorro_ventilacion(self, e: Equipo, n: int) -> float:
        if not e.es_bateria:
            return 0.0
        return n * self.m.p.ahorro_anual_en_ventilacion_por_equipo_bev

    # ------------------------------------------------------------ punto

    def punto(self, meta_tcs_dia: float) -> Punto:
        nb = self.m.n_equipos(self.base, meta_tcs_dia)
        nr = self.m.n_equipos(self.retador, meta_tcs_dia)

        # el diesel que ya se posee no se vuelve a comprar
        capex_base = max(0, nb - self.poseidas) * self.base.precio_usd
        capex_ret = nr * self.capex_unitario_retador()
        capex_extra = capex_ret - capex_base

        opex_b = self.opex_anual(self.base, meta_tcs_dia)
        opex_r = self.opex_anual(self.retador, meta_tcs_dia) - self.ahorro_ventilacion(self.retador, nr)
        ahorro = opex_b - opex_r

        if ahorro <= 0:
            pb = None
        elif capex_extra <= 0:
            pb = 0.0                      # mas barato desde el dia 1
        else:
            pb = capex_extra / ahorro

        return Punto(
            meta_tcs_dia=meta_tcs_dia, n_base=nb, n_retador=nr,
            equipos_ahorrados=nb - nr, capex_extra=capex_extra,
            opex_base_anual=opex_b, opex_retador_anual=opex_r,
            ahorro_anual=ahorro, payback_anios=pb,
            ventana_favorable=pb is not None and pb <= self.umbral,
        )

    # ------------------------------------------------------------ barrido

    def barrido(self, metas: list[float] | None = None) -> list[Punto]:
        if metas is None:
            metas = [500, 750, 1000, 1250, 1500, 1750, 2000, 2500]
        return [self.punto(m) for m in metas]

    def ventanas(self, metas: list[float] | None = None) -> list[Punto]:
        """Metas donde el payback baja del umbral: los dientes hacia abajo."""
        return [p for p in self.barrido(metas) if p.ventana_favorable]

    def flujo_acumulado(self, meta_tcs_dia: float, anios: int = 20) -> dict:
        """Gasto acumulado de cada escenario y ahorro neto del retador."""
        p = self.punto(meta_tcs_dia)
        base, ret, neto = [], [], []
        capex_b = max(0, p.n_base - self.poseidas) * self.base.precio_usd
        capex_r = p.n_retador * self.capex_unitario_retador()
        for a in range(anios + 1):
            b = capex_b + a * p.opex_base_anual
            r = capex_r + a * p.opex_retador_anual
            base.append(round(b, 0))
            ret.append(round(r, 0))
            neto.append(round(b - r, 0))
        return {
            "anios": list(range(anios + 1)),
            "base": base, "retador": ret, "ahorro_neto": neto,
            "punto": p.como_dict(),
            "cruce": p.payback_anios,
        }
