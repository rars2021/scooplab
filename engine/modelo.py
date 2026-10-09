# -*- coding: utf-8 -*-
"""
Motor de calculo — espejo del Excel V3.

Toda formula lleva al lado la celda del Excel que replica, para poder auditar
el motor contra la fuente. Los siete valores de control estan en tests/.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .red import Red, RevisionCurva, radio_eje_min_mm

def _rutas_datos() -> tuple[Path, Path]:
    """(datos_de_fabrica, datos_de_trabajo).

    Empaquetado: los JSON viajan dentro del ejecutable (solo lectura) y la copia
    editable vive junto al .exe, para que los cambios del usuario sobrevivan al
    cierre. En desarrollo ambas son la misma carpeta del repositorio.
    """
    import sys as _sys
    if getattr(_sys, "frozen", False):
        fabrica = Path(getattr(_sys, "_MEIPASS", Path(_sys.executable).parent)) / "datos"
        trabajo = Path(_sys.executable).parent / "datos"
        if not trabajo.exists():
            import shutil
            try:
                shutil.copytree(fabrica, trabajo)
            except Exception:
                trabajo = fabrica          # ultimo recurso: solo lectura
        else:
            # carpeta de una version anterior: se agregan los JSON que no existian
            import shutil
            for f in fabrica.glob("*.json"):
                if not (trabajo / f.name).exists():
                    try:
                        shutil.copy2(f, trabajo / f.name)
                    except Exception:
                        pass
        return fabrica, trabajo
    raiz = Path(__file__).resolve().parent.parent
    return raiz / "datos", raiz / "datos"


RAIZ = Path(__file__).resolve().parent.parent
DATOS_FABRICA, DATOS = _rutas_datos()

CFM_POR_M3MIN = 35.3147          # constante fisica
AIRE_M3MIN_POR_HP = 3.0          # D.S. 024-2016-EM
AIRE_M3MIN_POR_PERSONA = 6.0     # idem, sobre 4,000 msnm
HP_REFERENCIA_VENT = 182.0       # scoop de la tesis, base del factor relativo
TCS_POR_TONELADA = 1.10231       # 1 t metrica = 1.10231 TCS


# ============================================================== carga de datos

def _leer(nombre: str) -> dict:
    return json.loads((DATOS / nombre).read_text(encoding="utf-8"))


@dataclass
class Equipo:
    n: int
    id: str
    modelo: str
    fabricante: str
    energia: str
    situacion: str
    cuchara_m3: float
    cuchara_yd3: float
    carga_util_kg: float
    ancho_mm: float
    alto_mm: float
    largo_mm: float
    potencia_kw: float
    potencia_hp: float
    peso_kg: float
    fuerza_arranque_kg: float | None
    radio_giro_mm: float | None
    vel_max_kmh: float
    autonomia: str
    precio_usd: float
    vida_util_h: float
    consumo: float
    consumo_unidad: str
    flexibilidad: float
    fuente: str
    render: dict = field(default_factory=dict)
    radio_giro_int_mm: float | None = None       # el Excel no lo trae: ver engine/red.py
    radio_giro_int_estimado: bool = False

    @property
    def es_diesel(self) -> bool:
        return self.energia == "Diesel"

    @property
    def es_electrico(self) -> bool:
        return not self.es_diesel

    @property
    def es_bateria(self) -> bool:
        return self.energia == "Bateria"

    @classmethod
    def desde_json(cls, d: dict) -> "Equipo":
        campos = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in d.items() if k in campos})


@dataclass
class Seccion:
    clave: str
    nombre: str
    ancho_mm: float
    alto_mm: float
    critica: bool


class Parametros:
    """Acceso por atributo a los valores editables de params.json."""

    def __init__(self, valores: dict[str, Any]):
        self._v = dict(valores)

    def __getattr__(self, k: str) -> Any:
        try:
            return self._v[k]
        except KeyError as e:
            raise AttributeError(f"parametro inexistente: {k}") from e

    def __getitem__(self, k: str) -> Any:
        return self._v[k]

    def get(self, k: str, por_defecto: Any = None) -> Any:
        return self._v.get(k, por_defecto)

    def set(self, k: str, v: Any) -> None:
        self._v[k] = v

    def como_dict(self) -> dict[str, Any]:
        return dict(self._v)


# ============================================================== resultados

@dataclass
class Geometria:
    ancho_req_mm: float
    alto_req_mm: float
    encaje: dict[str, bool]          # clave de seccion -> entra
    holgura_critica_mm: float        # holgura por lado en la labor de produccion
    indice_holgura: float            # holgura / ancho equipo
    apto_produccion: bool
    veredicto: str
    # revision de curvas de la red (no esta en el Excel; no altera el veredicto)
    radio_eje_min_mm: float = 0.0
    curvas: list[RevisionCurva] = field(default_factory=list)
    apto_curvas: bool = True


@dataclass
class Costos:
    propietario: float
    energia: float
    neumaticos: float
    mantenimiento: float
    operador: float
    consumibles: float
    horario_total: float
    opex_cash_h: float               # sin depreciacion (para payback)
    por_tcs: float
    por_tcs_con_transporte: float


@dataclass
class Kpis:
    """Indicadores que el Excel no trae."""
    productividad_especifica: float   # TCS/h por m3 de cuchara
    intensidad_energetica: float      # consumo por TCS movida
    huella_aire: float                # CFM requerido por TCS/h
    indice_holgura: float             # holgura / ancho
    densidad_potencia: float          # kW por t de carga util
    oee: float                        # DM x UE
    capacidad_diaria_tcs: float


@dataclass
class Resultado:
    equipo: Equipo
    capacidad_cuchara_tcs: float
    cucharas_hora: float
    rend_nominal_tcsh: float
    rend_efectivo_tcsh: float
    capacidad_diaria_tcs: float
    n_equipos: int
    geometria: Geometria
    costos: Costos
    co2_kgh: float
    factor_ventilacion: float
    aire_m3min: float
    aire_cfm: float
    kpis: Kpis


# ============================================================== motor

class Modelo:
    def __init__(self, params: Parametros | None = None,
                 equipos: list[Equipo] | None = None,
                 secciones: list[Seccion] | None = None,
                 red: Red | None = None):
        if params is None:
            params = Parametros(_leer("params.json")["valores"])
        if equipos is None:
            equipos = [Equipo.desde_json(e) for e in _leer("equipos.json")["equipos"]]
        if secciones is None:
            secciones = [Seccion(**s) for s in _leer("secciones.json")["secciones"]]
        self.p = params
        self.equipos = equipos
        self.secciones = secciones
        self.red = red if red is not None else Red.cargar(DATOS / "red.json", secciones)

    # ---------------------------------------------------------- utilidades

    def equipo(self, ref: int | str) -> Equipo:
        for e in self.equipos:
            if e.n == ref or e.id == ref or e.modelo == ref:
                return e
        raise KeyError(f"equipo no encontrado: {ref}")

    @property
    def seleccionado(self) -> Equipo:
        return self.equipo(int(self.p.n_de_equipo))

    @property
    def seccion_critica(self) -> Seccion:
        for s in self.secciones:
            if s.critica:
                return s
        return self.secciones[-1]

    @property
    def horas_dia(self) -> float:
        """Horas nominales por dia. El rendimiento efectivo ya lleva DM y UE."""
        return self.p.horas_por_guardia * self.p.guardias_por_dia   # Datos_Entrada B41*B42

    # ---------------------------------------------------------- calculo

    def capacidad_cuchara(self, e: Equipo) -> float:
        """Datos_Entrada B24 — volumen x densidad / (1+esponjamiento) x llenado."""
        return (e.cuchara_m3 * self.p.densidad_mineral_in_situ
                / (1.0 + self.p.esponjamiento) * self.p.factor_de_llenado)

    def rend_efectivo(self, e: Equipo) -> float:
        """Comparativo!G — TCS/h promedio sobre la guardia (incluye DM y UE)."""
        cap = self.capacidad_cuchara(e)
        return (cap * (60.0 / self.p.ciclo_de_la_tesis)
                * self.p.disponibilidad_mecanica * self.p.utilizacion_efectiva)

    def n_equipos(self, e: Equipo, meta_tcs_dia: float | None = None) -> int:
        """Comparativo!H — redondeo hacia arriba; de aqui sale el escalon."""
        meta = self.p.produccion_objetivo if meta_tcs_dia is None else meta_tcs_dia
        cap_dia = self.rend_efectivo(e) * self.horas_dia
        return max(1, math.ceil(meta / cap_dia)) if cap_dia > 0 else 0

    def costos(self, e: Equipo) -> Costos:
        """Comparativo!J y K — cada componente con su formula visible."""
        p = self.p
        propietario = e.precio_usd / e.vida_util_h
        precio_energia = p.precio_diesel if e.es_diesel else p.precio_energia_electrica
        energia = e.consumo * precio_energia
        neumaticos = p.precio_juego_de_neumaticos / p.vida_de_neumaticos
        mantenimiento = p.mantenimiento_y_repuestos
        operador = p.salario_operador / p.horas_operador_por_mes
        consumibles = p.consumibles_varios
        total = (propietario + energia + neumaticos
                 + mantenimiento + operador + consumibles)
        rend = self.rend_efectivo(e)
        por_tcs = total / rend if rend else float("inf")
        return Costos(
            propietario=propietario, energia=energia, neumaticos=neumaticos,
            mantenimiento=mantenimiento, operador=operador, consumibles=consumibles,
            horario_total=total,
            opex_cash_h=total - propietario,
            por_tcs=por_tcs,
            por_tcs_con_transporte=por_tcs + p.costo_transporte_camion,
        )

    def geometria(self, e: Equipo) -> Geometria:
        """Restriccion_Seccion — filtro que se aplica antes que costo o productividad."""
        p = self.p
        ancho_req = e.ancho_mm + 2.0 * p.holgura_minima_por_lado
        alto_req = e.alto_mm + p.holgura_minima_al_techo
        encaje = {s.clave: (ancho_req <= s.ancho_mm and alto_req <= s.alto_mm)
                  for s in self.secciones}
        sc = self.seccion_critica
        holgura = (sc.ancho_mm - e.ancho_mm) / 2.0
        apto = encaje.get(sc.clave, False)
        principal = self.secciones[0]
        if apto:
            veredicto = "Apto para produccion"
        elif encaje.get(principal.clave, False):
            veredicto = "Solo transito por rampa principal"
        else:
            veredicto = "No apto"
        curvas = self.red.revisar(e, p.holgura_minima_por_lado) if self.red else []
        return Geometria(
            ancho_req_mm=ancho_req, alto_req_mm=alto_req, encaje=encaje,
            holgura_critica_mm=holgura,
            indice_holgura=holgura / e.ancho_mm if e.ancho_mm else 0.0,
            apto_produccion=apto, veredicto=veredicto,
            radio_eje_min_mm=radio_eje_min_mm(e),
            curvas=curvas, apto_curvas=all(c.cabe for c in curvas),
        )

    def ciclo_calculado(self, por_ruta: bool = False) -> float:
        """Ciclo por tiempos y distancias, en minutos (Datos_Entrada).

        por_ruta=True cambia las dos distancias del Excel por la longitud real
        de la ruta en la red, maniobras incluidas. El ciclo en uso sigue siendo
        `ciclo_de_la_tesis`: esto no toca el rendimiento.
        """
        p = self.p
        ida, vuelta = p.distancia_ida_cargado, p.distancia_retorno_vacio
        if por_ruta and self.red:
            ida, vuelta = self.red.longitud_ruta("acarreo"), self.red.longitud_ruta("retorno")
        return (p.tiempo_de_carga + (ida / 1000) / p.velocidad_cargado * 60
                + p.tiempo_de_descarga + (vuelta / 1000) / p.velocidad_vacio * 60
                + p.demoras_variables)

    def co2_kgh(self, e: Equipo) -> float:
        """Comparativo!L — cero en punto de uso para los electricos."""
        return e.consumo * self.p.factor_co2_diesel if e.es_diesel else 0.0

    def factor_ventilacion(self, e: Equipo) -> float:
        """Comparativo!M — diesel escala por potencia; electrico = 1 - reduccion."""
        if e.es_diesel:
            return e.potencia_hp / HP_REFERENCIA_VENT
        return 1.0 - self.p.reduccion_de_ventilacion_con_equipo_electrico

    def aire_equipo(self, e: Equipo) -> tuple[float, float]:
        """Caudal exigido por UNA unidad: (m3/min, CFM). Electrico = 0."""
        m3 = e.potencia_hp * AIRE_M3MIN_POR_HP if e.es_diesel else 0.0
        return m3, m3 * CFM_POR_M3MIN

    def kpis(self, e: Equipo) -> Kpis:
        """Indicadores nuevos, no presentes en el Excel."""
        rend = self.rend_efectivo(e)
        _, cfm = self.aire_equipo(e)
        geo = self.geometria(e)
        return Kpis(
            productividad_especifica=rend / e.cuchara_m3 if e.cuchara_m3 else 0.0,
            intensidad_energetica=e.consumo / rend if rend else 0.0,
            huella_aire=cfm / rend if rend else 0.0,
            indice_holgura=geo.indice_holgura,
            densidad_potencia=e.potencia_kw / (e.carga_util_kg / 1000.0) if e.carga_util_kg else 0.0,
            oee=self.p.disponibilidad_mecanica * self.p.utilizacion_efectiva,
            capacidad_diaria_tcs=rend * self.horas_dia,
        )

    def evaluar(self, e: Equipo | int | str) -> Resultado:
        if not isinstance(e, Equipo):
            e = self.equipo(e)
        cap = self.capacidad_cuchara(e)
        ciclo = self.p.ciclo_de_la_tesis
        cucharas_h = 60.0 / ciclo
        nominal = cap * cucharas_h
        efectivo = nominal * self.p.disponibilidad_mecanica * self.p.utilizacion_efectiva
        m3, cfm = self.aire_equipo(e)
        return Resultado(
            equipo=e,
            capacidad_cuchara_tcs=cap,
            cucharas_hora=cucharas_h,
            rend_nominal_tcsh=nominal,
            rend_efectivo_tcsh=efectivo,
            capacidad_diaria_tcs=efectivo * self.horas_dia,
            n_equipos=self.n_equipos(e),
            geometria=self.geometria(e),
            costos=self.costos(e),
            co2_kgh=self.co2_kgh(e),
            factor_ventilacion=self.factor_ventilacion(e),
            aire_m3min=m3, aire_cfm=cfm,
            kpis=self.kpis(e),
        )

    def evaluar_todos(self) -> list[Resultado]:
        return [self.evaluar(e) for e in self.equipos]

    def admisibles(self) -> list[Resultado]:
        """Solo los que entran en la labor de produccion."""
        return [r for r in self.evaluar_todos() if r.geometria.apto_produccion]


# ============================================================== conversiones

def tcs_a_toneladas(tcs: float) -> float:
    return tcs / TCS_POR_TONELADA


def toneladas_a_tcs(t: float) -> float:
    return t * TCS_POR_TONELADA
