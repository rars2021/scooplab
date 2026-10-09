# -*- coding: utf-8 -*-
"""
Red de galerias y revision de curvas.

Esta parte no existe en el Excel: las pruebas fijan la geometria del metodo
(limites del ancho barrido) y que el trazo de datos/red.json sea coherente.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.modelo import Modelo
from engine.red import RECTO, ancho_barrido_mm, radio_eje_min_mm, radio_interior_mm


@pytest.fixture(scope="module")
def m():
    return Modelo()


# ----------------------------------------------------- ancho barrido

def test_barrido_en_giro_minimo_es_la_corona_del_catalogo(m):
    """Con el radio minimo la franja es R_ext - R_int."""
    for e in m.equipos:
        corona = e.radio_giro_mm - radio_interior_mm(e)
        assert ancho_barrido_mm(e, radio_eje_min_mm(e)) == pytest.approx(corona, abs=0.5)


def test_barrido_tiende_al_ancho_en_recta(m):
    e = m.equipo(2)
    assert ancho_barrido_mm(e, 1e9) == pytest.approx(e.ancho_mm, abs=1.0)


def test_barrido_baja_al_abrir_la_curva(m):
    e = m.equipo(2)
    anchos = [ancho_barrido_mm(e, r) for r in (5000, 6000, 8000, 12000, 30000)]
    assert anchos == sorted(anchos, reverse=True)
    assert all(a > e.ancho_mm for a in anchos)


# ----------------------------------------------------- trazo

def test_pendientes_del_trazo_coinciden_con_las_declaradas(m):
    """Rampa Fernando -13 % y rampa positiva +15 %."""
    for t in m.red.tramos:
        assert m.red.pendiente_real(t) == pytest.approx(t["pendiente_pct"], abs=0.1), t["id"]


def test_toda_esquina_de_la_ruta_tiene_curva(m):
    for fase in ("acarreo", "retorno"):
        for leg in m.red.doc["ruta"][fase]:
            ns = leg["nodos"]
            for a, b, c in zip(ns, ns[1:], ns[2:]):
                if m.red._deflexion(a, b, c) > RECTO:
                    assert m.red.curva_en(a, b, c), f"sin curva en {a}-{b}-{c}"


def test_ruta_empieza_y_termina_donde_debe(m):
    r = m.red.doc["ruta"]
    assert r["acarreo"][0]["nodos"][0] == "F" and r["acarreo"][-1]["nodos"][-1] == "O"
    assert r["retorno"][0]["nodos"][0] == "O" and r["retorno"][-1]["nodos"][-1] == "F"
    # cada tramo de marcha arranca donde termino el anterior
    for fase in r.values():
        for a, b in zip(fase, fase[1:]):
            assert a["nodos"][-1] == b["nodos"][0]


def test_curva_acorta_respecto_de_la_poligonal(m):
    recta = m.red._dist("J2", "C1") + m.red._dist("C1", "C2")
    assert m.red.longitud(["J2", "C1", "C2"]) < recta * 1.01


# ----------------------------------------------------- revision por equipo

def test_lh307_pasa_todas_las_curvas(m):
    g = m.geometria(m.equipo(2))
    assert len(g.curvas) == len(m.red.curvas)
    assert g.apto_curvas


def test_sin_sobreancho_no_se_gira_en_la_labor_de_3_m(m):
    """En recta entran todos; el giro de 90 grados exige ensanchar la interseccion."""
    red = m.red
    curva = next(c for c in red.curvas if c["id"] == "t_maniobra")
    original = curva["sobreancho_mm"]
    try:
        curva["sobreancho_mm"] = 0.0
        for n in (2, 3, 4):
            fila = next(f for f in red.revisar(m.equipo(n), 300) if f.id == "t_maniobra")
            assert fila.gira and not fila.cabe
    finally:
        curva["sobreancho_mm"] = original


def test_barrido_del_lh307_es_coherente_con_su_ficha(m):
    """Sandvik da 3059 mm de ancho de tunel para girar (T2); el modelo, en su
    radio minimo, da la corona R2 - R1 = 2930 mm: mismo orden."""
    e = m.equipo(2)
    assert e.radio_giro_int_mm == 2998.0 and not e.radio_giro_int_estimado
    assert ancho_barrido_mm(e, radio_eje_min_mm(e)) == pytest.approx(2930, abs=1)


def test_curva_mas_cerrada_que_el_giro_minimo_no_se_puede_seguir(m):
    e = m.equipo(9)
    red = m.red
    original = red.curvas[0]["radio_m"]
    try:
        red.curvas[0]["radio_m"] = radio_eje_min_mm(e) / 1000 - 0.5
        fila = red.revisar(e, 300)[0]
        assert not fila.gira and not fila.cabe
    finally:
        red.curvas[0]["radio_m"] = original


def test_revision_de_curvas_no_altera_el_veredicto_del_excel(m):
    """El filtro de seccion recta sigue siendo el del Excel."""
    e = m.equipo(4)
    g = m.geometria(e)
    sc = m.seccion_critica
    assert g.apto_produccion == (g.ancho_req_mm <= sc.ancho_mm and g.alto_req_mm <= sc.alto_mm)


# ----------------------------------------------------- ciclo por ruta

def test_ruta_real_es_mas_larga_que_la_distancia_del_excel(m):
    assert m.red.longitud_ruta("acarreo") > m.p.distancia_ida_cargado
    assert m.ciclo_calculado(por_ruta=True) > m.ciclo_calculado()


def test_ciclo_por_ruta_no_toca_el_rendimiento(m):
    antes = m.rend_efectivo(m.equipo(2))
    m.ciclo_calculado(por_ruta=True)
    assert m.rend_efectivo(m.equipo(2)) == antes
