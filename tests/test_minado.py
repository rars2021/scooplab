# -*- coding: utf-8 -*-
"""
Ciclo de minado completo (caso 4). Los valores de control son los de la tesis
para el tajo 6675-2 con el scoop de 3.5 yd3.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.minado import caudal_requerido_cfm, ciclo_de_minado
from engine.modelo import Modelo


@pytest.fixture(scope="module")
def m():
    return Modelo()


@pytest.fixture(scope="module")
def caso(m):
    red = m.redes["ciclo_minado"]
    return red, red.doc["minado"]


def test_cucharas_de_la_guardia_reproducen_la_tesis(m, caso):
    """Tesis p. 60: 250 TCS por guardia = 60 cucharas del scoop de 3.5 yd3."""
    red, d = caso
    assert ciclo_de_minado(m, m.equipo(1), red, d)["cucharas"] == 60


def test_caudal_reproduce_la_tabla_24(m, caso):
    """47,092 CFM con el scoop diesel de 182 HP."""
    assert caudal_requerido_cfm(m.equipo(1), caso[1]) == pytest.approx(47092.0, abs=2.0)


def test_perforacion_segun_la_tabla_16(m, caso):
    red, d = caso
    r = ciclo_de_minado(m, m.equipo(1), red, d)
    perf = r["fases"][0]
    assert perf["id"] == "perforacion" and perf["min"] == 8 * 45
    assert r["metros_perforados"] == pytest.approx(104.0)       # 8 taladros de 13 m
    assert r["tcs_disparo"] == pytest.approx(1216.8, abs=0.1)   # 11.7 TCS por metro


def test_limpieza_es_cucharas_por_ciclo_del_trazo(m, caso):
    red, d = caso
    e = m.equipo(2)
    r = ciclo_de_minado(m, e, red, d)
    assert r["limpieza_min"] == pytest.approx(r["cucharas"] * m.ciclo_en_red(e, red)["ciclo"])
    assert r["total_min"] == pytest.approx(sum(f["min"] for f in r["fases"]))


def test_los_tiempos_que_la_tesis_no_da_van_marcados_como_supuestos(m, caso):
    red, d = caso
    fases = {f["id"]: f for f in ciclo_de_minado(m, m.equipo(2), red, d)["fases"]}
    assert [i for i, f in fases.items() if f["supuesto"]] == ["voladura", "ventilacion", "desatado"]


def test_scoop_electrico_pide_menos_aire_y_cuchara_grande_menos_viajes(m, caso):
    red, d = caso
    diesel, bev = m.equipo(2), m.equipo(9)
    assert caudal_requerido_cfm(bev, d) < caudal_requerido_cfm(diesel, d)
    assert ciclo_de_minado(m, bev, red, d)["cucharas"] < ciclo_de_minado(m, diesel, red, d)["cucharas"]
