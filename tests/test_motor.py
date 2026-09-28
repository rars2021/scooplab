# -*- coding: utf-8 -*-
"""
Control del motor contra el Excel V3.

Si alguna de estas pruebas falla, el motor esta mal, no el Excel.
Los valores esperados salen de 'Caso_Practico_Scoop_Uchucchacua v3.xlsx'.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.matriz import Matriz
from engine.modelo import Modelo
from engine.payback import Payback
from engine.ventilacion import comparar, escenario_tesis


@pytest.fixture(scope="module")
def m():
    return Modelo()


# ----------------------------------------------------- 1-2. capacidad cuchara

def test_capacidad_cuchara_scoop_tesis(m):
    """Tabla 21 de la tesis: 4.17 TCS. Es el ancla de todo el modelo."""
    assert m.capacidad_cuchara(m.equipo(1)) == pytest.approx(4.17, abs=0.01)


def test_capacidad_cuchara_lh307(m):
    assert m.capacidad_cuchara(m.equipo(2)) == pytest.approx(4.8313, abs=0.0005)


# ----------------------------------------------------- 3. rendimiento

def test_rendimiento_efectivo_lh307(m):
    """Comparativo!G6 — incluye DM 80 % y UE 75 %."""
    assert m.rend_efectivo(m.equipo(2)) == pytest.approx(58.0, abs=0.05)


def test_nominal_y_efectivo_se_distinguen(m):
    r = m.evaluar(2)
    assert r.rend_nominal_tcsh == pytest.approx(96.6, abs=0.1)
    assert r.rend_efectivo_tcsh < r.rend_nominal_tcsh


# ----------------------------------------------------- 4. costos

def test_costo_horario_lh307(m):
    assert m.costos(m.equipo(2)).horario_total == pytest.approx(94.40, abs=0.01)


def test_opex_cash_excluye_depreciacion(m):
    c = m.costos(m.equipo(2))
    assert c.opex_cash_h == pytest.approx(56.40, abs=0.01)
    assert c.opex_cash_h == pytest.approx(c.horario_total - c.propietario, abs=1e-9)


# ----------------------------------------------------- 5. ventilacion

def test_control_ventilacion_reproduce_la_tesis():
    """47,092 CFM (PDF p. 76). Valida el metodo antes de proyectarlo."""
    assert escenario_tesis().cfm == pytest.approx(47092.0, abs=2.0)


def test_escenario_diesel_a_1000_no_cabe(m):
    r = comparar(m, m.equipo(2), m.equipo(9), meta_tcs_dia=1000)
    b = r["escenarios"][1]
    assert b["cabe"] is False
    assert b["uso_ventilador"] > 0.9          # se come casi todo el ventilador


def test_bev_reduce_el_aire_entre_35_y_50_pct(m):
    """Contraste con Hooli y Halim (2025): 40-50 %, y Borden: 50 %."""
    r = comparar(m, m.equipo(2), m.equipo(9), meta_tcs_dia=1000)
    assert 0.35 <= r["reduccion"] <= 0.50


# ----------------------------------------------------- 6. payback

def test_payback_500_es_desfavorable(m):
    pb = Payback(m, m.equipo(2), m.equipo(9))
    assert pb.punto(500).payback_anios == pytest.approx(18.9, abs=0.2)


def test_payback_1000_es_la_ventana(m):
    """A 1,000 TCS/dia el BEV resuelve con 1 unidad y el diesel necesita 2."""
    p = Payback(m, m.equipo(2), m.equipo(9)).punto(1000)
    assert p.n_base == 2 and p.n_retador == 1
    assert p.payback_anios == pytest.approx(7.0, abs=0.2)
    assert p.ventana_favorable


def test_payback_es_diente_de_sierra(m):
    """No es monotono: a 1,250 vuelve a subir. Es el hallazgo del caso."""
    pb = Payback(m, m.equipo(2), m.equipo(9))
    p1000, p1250 = pb.punto(1000), pb.punto(1250)
    assert p1250.payback_anios > p1000.payback_anios


def test_ventanas_favorables_son_1000_y_2000(m):
    pb = Payback(m, m.equipo(2), m.equipo(9))
    metas = {p.meta_tcs_dia for p in pb.ventanas([500, 750, 1000, 1250, 1500, 2000])}
    assert 1000 in metas and 2000 in metas
    assert 1250 not in metas


# ----------------------------------------------------- 7. matriz

def test_pesos_suman_cien(m):
    assert Matriz(m).suma_pesos() == pytest.approx(1.0, abs=1e-6)


def test_seccion_es_knock_out(m):
    """Un equipo que no entra en la labor debe quedar en cero."""
    filas = Matriz(m).evaluar()
    for f in filas:
        if not f.admisible:
            assert f.total == 0.0


def test_matriz_ordena_por_puntaje(m):
    filas = Matriz(m).evaluar()
    assert [f.puesto for f in filas] == sorted(f.puesto for f in filas)
    assert all(filas[i].total >= filas[i + 1].total for i in range(len(filas) - 1))


# ----------------------------------------------------- integridad de datos

def test_geometria_usa_holgura_por_lado(m):
    g = m.geometria(m.equipo(2))
    assert g.ancho_req_mm == m.equipo(2).ancho_mm + 2 * m.p.holgura_minima_por_lado


def test_electricos_no_emiten_co2_en_punto_de_uso(m):
    for r in m.evaluar_todos():
        if r.equipo.es_electrico:
            assert r.co2_kgh == 0.0
            assert r.aire_cfm == 0.0


def test_todos_los_equipos_tienen_dimensiones(m):
    for e in m.equipos:
        assert e.ancho_mm and e.alto_mm and e.largo_mm, f"{e.id} sin cotas"
        assert e.cuchara_m3 > 0, f"{e.id} sin cuchara"
