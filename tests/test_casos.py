# -*- coding: utf-8 -*-
"""
Casos de simulacion (datos/casos.json) y velocidad en pendiente.

La velocidad en subida se contrasta con las tablas de desempeno en pendiente de
las fichas de fabricante, no con el Excel.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.modelo import Modelo
from engine.red import RECTO, velocidad_en_pendiente


@pytest.fixture(scope="module")
def m():
    return Modelo()


def test_hay_tres_casos_y_el_primero_es_la_rampa_fernando(m):
    assert [c["id"] for c in m.casos] == ["rampa_fernando", "subida", "ventana_negativa"]
    assert m.caso == "rampa_fernando"


def test_trazo_de_cada_caso_es_coherente(m):
    for cid, red in m.redes.items():
        for t in red.tramos:
            assert red.pendiente_real(t) == pytest.approx(t["pendiente_pct"], abs=0.1), (cid, t["id"])
        for fase in ("acarreo", "retorno"):
            legs = red.doc["ruta"][fase]
            for a, b in zip(legs, legs[1:]):
                assert a["nodos"][-1] == b["nodos"][0], cid
            for leg in legs:
                ns = leg["nodos"]
                for a, b, c in zip(ns, ns[1:], ns[2:]):
                    if red._deflexion(a, b, c) > RECTO:
                        assert red.curva_en(a, b, c), f"{cid}: sin curva en {a}-{b}-{c}"


def test_los_equipos_con_ficha_giran_en_todos_los_casos(m):
    for cid, red in m.redes.items():
        for n in (1, 2, 3, 4, 5):
            assert all(f.cabe for f in red.revisar(m.equipo(n), 300)), (cid, n)


# ----------------------------------------------------- velocidad en pendiente

def test_velocidad_cargado_en_subida_reproduce_la_ficha_del_st35(m):
    """Ficha 9851 2254 01g: cargado, 12.5 % -> 6.9 km/h; 16 % -> 5.6 km/h."""
    e = m.equipo(1)
    assert velocidad_en_pendiente(e, 12.5, True, 99) == pytest.approx(6.9, abs=0.3)
    assert velocidad_en_pendiente(e, 16.0, True, 99) == pytest.approx(5.6, abs=0.3)


def test_velocidad_en_subida_se_contrasta_con_la_ficha_del_st7(m):
    """Ficha 9869 0107 01d: cargado, 10 % -> 8.1 km/h. Verificacion independiente."""
    assert velocidad_en_pendiente(m.equipo(3), 10.0, True, 99) == pytest.approx(8.1, abs=0.8)


def test_en_plano_y_en_bajada_manda_la_velocidad_del_modelo(m):
    e = m.equipo(2)
    assert velocidad_en_pendiente(e, 0.0, True, 8.0) == 8.0
    assert velocidad_en_pendiente(e, -13.0, True, 8.0) == 8.0


def test_subir_cargado_alarga_el_ciclo(m):
    e = m.equipo(2)
    baja = m.ciclo_en_red(e, m.redes["rampa_fernando"])
    sube = m.ciclo_en_red(e, m.redes["subida"])
    assert baja["desnivel"] < 0 < sube["desnivel"]
    # minutos por metro de acarreo: en subida cargado rinde menos
    assert sube["t_acarreo"] / sube["d_acarreo"] > baja["t_acarreo"] / baja["d_acarreo"]


def test_cambiar_de_caso_no_toca_el_rendimiento_del_excel(m):
    e = m.equipo(2)
    antes = m.rend_efectivo(e)
    m.usar_caso("subida")
    try:
        assert m.rend_efectivo(e) == antes
        assert m.red is m.redes["subida"]
    finally:
        m.usar_caso("rampa_fernando")
