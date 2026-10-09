# -*- coding: utf-8 -*-
"""
Ciclo de minado completo de un tajo: perforacion, voladura, ventilacion,
desatado y limpieza con scoop.

Los datos de perforacion, voladura, produccion y aire son los de la tesis
(tajo 6675-2, tajeo por subniveles con taladros largos). La tesis no da la
duracion del carguio de taladros, de la ventilacion ni del desatado: esos tres
tiempos son supuestos editables y se marcan como tales en cada fase.

La limpieza se calcula para el equipo elegido: cucharas necesarias para la
produccion de la guardia por el ciclo del scoop en el trazo del caso.
"""
from __future__ import annotations

import math

from .modelo import AIRE_M3MIN_POR_HP, AIRE_M3MIN_POR_PERSONA, CFM_POR_M3MIN


def caudal_requerido_cfm(e, d: dict) -> float:
    """Tabla 24 de la tesis: personal + scoop + jumbo + camion, a 3 m3/HP/min."""
    m3 = (d["personas"] * AIRE_M3MIN_POR_PERSONA
          + (e.potencia_hp * AIRE_M3MIN_POR_HP if e.es_diesel else 0.0)
          + d["hp_jumbo"] * AIRE_M3MIN_POR_HP
          + d["hp_camion"] * AIRE_M3MIN_POR_HP)
    return m3 * CFM_POR_M3MIN


def ciclo_de_minado(m, e, red, d: dict) -> dict:
    """Fases del ciclo con su duracion en minutos y de donde sale cada dato."""
    scoop = m.ciclo_en_red(e, red)
    cap = m.capacidad_cuchara(e)
    cucharas = math.ceil(d["produccion_guardia_tcs"] / cap)
    t_limpieza = cucharas * scoop["ciclo"]
    t_perf = d["taladros_por_guardia"] * d["min_por_taladro"]
    metros = d["taladros_por_guardia"] * d["longitud_taladro_m"]
    tcs_disparo = metros * d["tcs_por_metro"]
    cfm = caudal_requerido_cfm(e, d)
    anfo = d["taladros_por_guardia"] * d["kg_anfo_por_taladro"]

    fases = [
        {"id": "perforacion", "nombre": "Perforacion", "min": t_perf, "supuesto": False,
         "detalle": f"{d['taladros_por_guardia']} taladros de {d['longitud_taladro_m']:g} m, "
                    f"{d['diametro_mm']} mm, jumbo Mercury",
         "fuente": "Tesis, Tablas 15 y 16: 8 taladros por guardia, 45 min por taladro"},
        {"id": "voladura", "nombre": "Carguio y voladura", "min": d["min_carguio_voladura"], "supuesto": True,
         "detalle": f"{anfo:.0f} kg de ANFO, retardos de 25 ms",
         "fuente": "Carga segun tesis, Tabla 19 (33.1 kg/taladro); la duracion es un supuesto"},
        {"id": "ventilacion", "nombre": "Ventilacion", "min": d["min_ventilacion"], "supuesto": True,
         "detalle": f"{cfm:,.0f} CFM requeridos",
         "fuente": "Caudal segun tesis, Tabla 24; la espera es un supuesto"},
        {"id": "desatado", "nombre": "Desatado", "min": d["min_desatado"], "supuesto": True,
         "detalle": "barretillas, antes de ingresar el equipo",
         "fuente": "La tesis lo menciona sin tiempos; la duracion es un supuesto"},
        {"id": "limpieza", "nombre": "Limpieza y acarreo", "min": t_limpieza, "supuesto": False,
         "detalle": f"{cucharas} cucharas de {cap:.2f} TCS, ciclo de {scoop['ciclo']:.2f} min",
         "fuente": "Calculado: produccion de la guardia / capacidad de cuchara x ciclo del trazo"},
    ]
    total = sum(f["min"] for f in fases)
    guardia = m.p.horas_por_guardia * 60.0
    return {
        "metodo": d["metodo"], "fases": fases, "total_min": total,
        "guardia_min": guardia, "guardias": total / guardia,
        "cucharas": cucharas, "limpieza_min": t_limpieza,
        "metros_perforados": metros, "tcs_disparo": tcs_disparo,
        "guardias_de_limpieza_por_disparo": tcs_disparo / d["produccion_guardia_tcs"],
        "caudal_cfm": cfm, "anfo_kg": anfo,
    }
