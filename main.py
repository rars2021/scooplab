# -*- coding: utf-8 -*-
"""
ScoopLab — arranque de la aplicacion de escritorio.

Ventana nativa (WebView2 en Windows) con la interfaz en ui/ y el motor de
calculo en engine/. Sin servidor, sin internet.

    python main.py
"""
from __future__ import annotations

import json
import sys
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

import webview

RAIZ = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
sys.path.insert(0, str(RAIZ))

from engine import importar as mod_importar          # noqa: E402
from engine.matriz import Matriz                      # noqa: E402
from engine.modelo import DATOS, Modelo, Parametros   # noqa: E402
from engine.payback import Payback                    # noqa: E402
from engine.ventilacion import comparar, escenario_tesis  # noqa: E402


def _plano(o: Any) -> Any:
    """Convierte dataclasses anidadas a dict serializable."""
    if is_dataclass(o) and not isinstance(o, type):
        return {k: _plano(v) for k, v in asdict(o).items()}
    if isinstance(o, dict):
        return {k: _plano(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_plano(v) for v in o]
    if isinstance(o, float):
        return round(o, 6)
    return o


class Api:
    """Superficie que consume ui/app.js. Un metodo por necesidad de la UI."""

    def __init__(self) -> None:
        self.m = Modelo()
        self._ruta_params = DATOS / "params.json"

    # ------------------------------------------------------------ arranque

    def datos_iniciales(self) -> dict:
        eq = json.loads((DATOS / "equipos.json").read_text(encoding="utf-8"))
        pa = json.loads((DATOS / "params.json").read_text(encoding="utf-8"))
        se = json.loads((DATOS / "secciones.json").read_text(encoding="utf-8"))
        rf = json.loads((DATOS / "referencias.json").read_text(encoding="utf-8"))
        return {
            "equipos": eq["equipos"], "params": pa,
            "secciones": se["secciones"], "referencias": rf["referencias"],
        }

    # ------------------------------------------------------------ flota

    def resumen_flota(self) -> list[dict]:
        """Una fila compacta por equipo, para tabla, HUD y selector."""
        filas = []
        for r in self.m.evaluar_todos():
            e = r.equipo
            filas.append({
                "id": e.id, "n": e.n, "modelo": e.modelo, "fabricante": e.fabricante,
                "energia": e.energia, "situacion": e.situacion,
                "cuchara_m3": e.cuchara_m3, "ancho_mm": e.ancho_mm,
                "precio": e.precio_usd,
                "cap_cuchara": round(r.capacidad_cuchara_tcs, 3),
                "rend": round(r.rend_efectivo_tcsh, 2),
                "rend_nominal": round(r.rend_nominal_tcsh, 2),
                "cap_dia": round(r.capacidad_diaria_tcs, 1),
                "n_equipos": r.n_equipos,
                "costo_h": round(r.costos.horario_total, 2),
                "costo_tcs": round(r.costos.por_tcs, 3),
                "costo_total_tcs": round(r.costos.por_tcs_con_transporte, 3),
                "co2": round(r.co2_kgh, 1),
                "factor_vent": round(r.factor_ventilacion, 3),
                "aire_cfm": round(r.aire_cfm, 0),
                "holgura": round(r.geometria.holgura_critica_mm, 0),
                "apto": r.geometria.apto_produccion,
                "veredicto": r.geometria.veredicto,
                "kpis": _plano(r.kpis),
            })
        return filas

    def detalle_equipo(self, n: int) -> dict:
        return _plano(self.m.evaluar(int(n)))

    # ------------------------------------------------------------ escena 3D

    def contexto_escena(self, n: int | None = None, n_ref: int | None = None) -> dict:
        """Todo lo que la escena necesita: tiempos del ciclo y equivalencia de flota."""
        e = self.m.equipo(int(n)) if n else self.m.seleccionado
        ref = self.m.equipo(int(n_ref)) if n_ref else self._referencia_diesel(e)
        p = self.m.p
        meta = p.produccion_objetivo

        cap_sel = self.m.rend_efectivo(e) * self.m.horas_dia
        cap_ref = self.m.rend_efectivo(ref) * self.m.horas_dia

        # tiempos de cada fase, en minutos del modelo
        d_ida, d_ret = p.distancia_ida_cargado, p.distancia_retorno_vacio
        if self.m.red and p.get("usar_longitud_de_ruta", 0):
            d_ida = self.m.red.longitud_ruta("acarreo")
            d_ret = self.m.red.longitud_ruta("retorno")
        t_acarreo = (d_ida / 1000) / p.velocidad_cargado * 60
        t_retorno = (d_ret / 1000) / p.velocidad_vacio * 60

        return {
            "red": self.red(e.n),
            "holguraLado": p.holgura_minima_por_lado,
            "holguraTecho": p.holgura_minima_al_techo,
            "t_carga": p.tiempo_de_carga,
            "t_acarreo": round(t_acarreo, 3),
            "t_descarga": p.tiempo_de_descarga,
            "t_retorno": round(t_retorno, 3),
            "distancia_m": d_ida,
            "cap_cuchara": round(self.m.capacidad_cuchara(e), 3),
            "meta": meta,
            "n_sel": self.m.n_equipos(e, meta),
            "n_ref": self.m.n_equipos(ref, meta),
            "cap_sel": round(cap_sel, 1),
            "cap_ref": round(cap_ref, 1),
            "pases_sel": round(cap_sel / self.m.capacidad_cuchara(e), 0),
            "pases_ref": round(cap_ref / self.m.capacidad_cuchara(ref), 0),
            "referencia": {
                "n": ref.n, "modelo": ref.modelo, "energia": ref.energia,
                "largo_mm": ref.largo_mm, "ancho_mm": ref.ancho_mm,
                "alto_mm": ref.alto_mm, "cuchara_m3": ref.cuchara_m3,
                "carga_util_kg": ref.carga_util_kg, "render": ref.render,
            },
        }

    def equivalencia(self, n: int | None = None, meta: float = 1000.0,
                     n_ref: int | None = None) -> dict:
        """Cuantos equipos de cada tipo exige una meta dada. Es el escalon."""
        e = self.m.equipo(int(n)) if n else self.m.seleccionado
        ref = self.m.equipo(int(n_ref)) if n_ref else self._referencia_diesel(e)
        meta = float(meta)
        cap_sel = self.m.rend_efectivo(e) * self.m.horas_dia
        cap_ref = self.m.rend_efectivo(ref) * self.m.horas_dia
        ns, nr = self.m.n_equipos(e, meta), self.m.n_equipos(ref, meta)
        return {
            "meta": meta, "n_sel": ns, "n_ref": nr,
            "cap_sel": round(cap_sel, 1), "cap_ref": round(cap_ref, 1),
            "equipos_ahorrados": nr - ns,
            "capex_sel": round(ns * e.precio_usd, 0),
            "capex_ref": round(nr * ref.precio_usd, 0),
        }

    def _referencia_diesel(self, distinto_de=None):
        """Diesel admisible de mayor rendimiento: el patron de comparacion."""
        cands = [e for e in self.m.equipos
                 if e.es_diesel and self.m.geometria(e).apto_produccion
                 and (distinto_de is None or e.n != distinto_de.n)]
        if not cands:
            cands = [e for e in self.m.equipos if e.es_diesel]
        return max(cands, key=lambda e: self.m.rend_efectivo(e))

    # ------------------------------------------------------------ red de galerias

    def red(self, n: int | None = None) -> dict | None:
        """Trazo de la red y revision de curvas para un equipo."""
        red = self.m.red
        if red is None:
            return None
        e = self.m.equipo(int(n)) if n else self.m.seleccionado
        g = self.m.geometria(e)
        return {
            **red.doc,
            "revision": {c.id: _plano(c) for c in g.curvas},
            "apto_curvas": g.apto_curvas,
            "radio_eje_min_m": round(g.radio_eje_min_mm / 1000, 3),
            "radio_int_estimado": bool(e.radio_giro_int_estimado or not e.radio_giro_int_mm),
            "longitud_acarreo_m": round(red.longitud_ruta("acarreo"), 1),
            "longitud_retorno_m": round(red.longitud_ruta("retorno"), 1),
        }

    # ------------------------------------------------------------ geometria

    def geometria(self) -> dict:
        secciones = [{"clave": s.clave, "nombre": s.nombre,
                      "ancho_mm": s.ancho_mm, "alto_mm": s.alto_mm,
                      "critica": s.critica} for s in self.m.secciones]
        filas = []
        for r in self.m.evaluar_todos():
            g = r.geometria
            filas.append({
                "id": r.equipo.id, "n": r.equipo.n, "modelo": r.equipo.modelo,
                "ancho_mm": r.equipo.ancho_mm, "alto_mm": r.equipo.alto_mm,
                "largo_mm": r.equipo.largo_mm,
                "ancho_req": g.ancho_req_mm, "alto_req": g.alto_req_mm,
                "encaje": g.encaje, "holgura": round(g.holgura_critica_mm, 0),
                "indice_holgura": round(g.indice_holgura, 4),
                "apto": g.apto_produccion, "veredicto": g.veredicto,
                "apto_curvas": g.apto_curvas,
                "curvas": _plano(g.curvas),
                "radio_eje_min": round(g.radio_eje_min_mm, 0),
                "radio_giro": r.equipo.radio_giro_mm,
                "radio_int": round(g.radio_eje_min_mm - r.equipo.ancho_mm / 2, 0),
                "radio_int_estimado": bool(r.equipo.radio_giro_int_estimado
                                           or not r.equipo.radio_giro_int_mm),
            })
        return {"secciones": secciones, "filas": filas,
                "hay_red": self.m.red is not None,
                "holgura_lado": self.m.p.holgura_minima_por_lado,
                "holgura_techo": self.m.p.holgura_minima_al_techo}

    # ------------------------------------------------------------ ciclo y costos

    def ciclo(self, n: int | None = None) -> dict:
        e = self.m.equipo(int(n)) if n else self.m.seleccionado
        r = self.m.evaluar(e)
        p = self.m.p
        return {
            "equipo": e.modelo,
            "capacidad_cuchara": round(r.capacidad_cuchara_tcs, 3),
            "cucharas_hora": round(r.cucharas_hora, 2),
            "rend_nominal": round(r.rend_nominal_tcsh, 2),
            "rend_efectivo": round(r.rend_efectivo_tcsh, 2),
            "cap_guardia": round(r.rend_efectivo_tcsh * p.horas_por_guardia, 1),
            "cap_dia": round(r.capacidad_diaria_tcs, 1),
            "cap_anio": round(r.capacidad_diaria_tcs * p.dias_operativos_por_ano, 0),
            "n_equipos": r.n_equipos,
            "ciclo_min": p.ciclo_de_la_tesis,
            "ciclo_calculado": round(self.m.ciclo_calculado(), 3),
            "ciclo_ruta": round(self.m.ciclo_calculado(por_ruta=True), 3) if self.m.red else None,
            "distancia_excel": [p.distancia_ida_cargado, p.distancia_retorno_vacio],
            "distancia_ruta": ([round(self.m.red.longitud_ruta("acarreo"), 1),
                                round(self.m.red.longitud_ruta("retorno"), 1)]
                               if self.m.red else None),
            "usar_ruta": bool(p.get("usar_longitud_de_ruta", 0)),
            "dm": p.disponibilidad_mecanica, "ue": p.utilizacion_efectiva,
            "meta": p.produccion_objetivo,
            "kpis": _plano(r.kpis),
        }

    def costos(self, n: int | None = None) -> dict:
        e = self.m.equipo(int(n)) if n else self.m.seleccionado
        r = self.m.evaluar(e)
        c = r.costos
        p = self.m.p
        horas_anio = (p.horas_por_guardia * p.guardias_por_dia * p.dias_operativos_por_ano
                      * p.disponibilidad_mecanica * p.utilizacion_efectiva)
        return {
            "equipo": e.modelo, "energia": e.energia,
            "desglose": [
                {"rubro": "Propietario (depreciacion)", "formula": "precio / vida util", "valor": round(c.propietario, 2)},
                {"rubro": f"Energia ({e.consumo_unidad})", "formula": "consumo x precio", "valor": round(c.energia, 2)},
                {"rubro": "Mantenimiento y repuestos", "formula": "referencia CostMine", "valor": round(c.mantenimiento, 2)},
                {"rubro": "Operador", "formula": "salario / horas mes", "valor": round(c.operador, 2)},
                {"rubro": "Neumaticos", "formula": "juego / vida", "valor": round(c.neumaticos, 2)},
                {"rubro": "Consumibles varios", "formula": "estimacion", "valor": round(c.consumibles, 2)},
            ],
            "horario_total": round(c.horario_total, 2),
            "opex_cash_h": round(c.opex_cash_h, 2),
            "por_tcs": round(c.por_tcs, 3),
            "transporte_tcs": p.costo_transporte_camion,
            "total_tcs": round(c.por_tcs_con_transporte, 3),
            "horas_anio": round(horas_anio, 0),
            "opex_anual": round(c.opex_cash_h * horas_anio, 0),
            "co2_anual_t": round(r.co2_kgh * horas_anio / 1000, 1),
        }

    # ------------------------------------------------------------ ventilacion

    def ventilacion(self, meta: float = 1000.0, n_diesel: int | None = None,
                    n_bev: int | None = None, personal: int = 12,
                    jumbos: int = 2, camiones: int = 2) -> dict:
        base = self.m.equipo(int(n_diesel)) if n_diesel else self.m.equipo(2)
        bev = self.m.equipo(int(n_bev)) if n_bev else self._mejor_bev()
        r = comparar(self.m, base, bev, meta_tcs_dia=float(meta),
                     personal=personal, jumbos=jumbos, camiones=camiones)
        r["base"] = base.modelo
        r["bev"] = bev.modelo
        r["meta"] = meta
        r["control_cfm"] = round(escenario_tesis().cfm, 0)
        return r

    def _mejor_bev(self):
        bevs = [e for e in self.m.equipos if e.es_bateria]
        return max(bevs, key=lambda e: self.m.rend_efectivo(e)) if bevs else self.m.equipos[-1]

    # ------------------------------------------------------------ economico

    def payback(self, n_base: int | None = None, n_retador: int | None = None,
                poseidas: int = 1) -> dict:
        base = self.m.equipo(int(n_base)) if n_base else self.m.equipo(2)
        ret = self.m.equipo(int(n_retador)) if n_retador else self._mejor_bev()
        pb = Payback(self.m, base, ret, unidades_ya_poseidas=int(poseidas))
        barrido = [p.como_dict() for p in pb.barrido()]
        return {
            "base": base.modelo, "retador": ret.modelo,
            "barrido": barrido,
            "ventanas": [p["meta"] for p in barrido if p["ventana"]],
            "flujo": pb.flujo_acumulado(self.m.p.produccion_objetivo),
            "capex_unitario_retador": round(pb.capex_unitario_retador(), 0),
        }

    def flujo(self, meta: float, n_base: int | None = None,
              n_retador: int | None = None, poseidas: int = 1) -> dict:
        base = self.m.equipo(int(n_base)) if n_base else self.m.equipo(2)
        ret = self.m.equipo(int(n_retador)) if n_retador else self._mejor_bev()
        return Payback(self.m, base, ret, int(poseidas)).flujo_acumulado(float(meta))

    # ------------------------------------------------------------ matriz

    def matriz(self) -> dict:
        return Matriz(self.m).como_dict()

    # ------------------------------------------------------------ parametros

    def params(self) -> dict:
        return json.loads(self._ruta_params.read_text(encoding="utf-8"))

    def set_param(self, clave: str, valor: Any) -> dict:
        """Cambia un parametro, recalcula y persiste."""
        try:
            v = float(valor)
        except (TypeError, ValueError):
            v = valor
        self.m.p.set(clave, v)
        doc = self.params()
        doc["valores"][clave] = v
        for g in doc["grupos"]:
            for c in g["campos"]:
                if c["clave"] == clave and c["editable"]:
                    c["valor"] = v
        self._ruta_params.write_text(
            json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"ok": True, "clave": clave, "valor": v}

    def restablecer(self) -> dict:
        """Vuelve a importar el Excel: descarta los cambios manuales."""
        mod_importar.importar()
        self.m = Modelo()
        return {"ok": True}

    def reimportar(self, ruta: str | None = None) -> dict:
        try:
            salidas = mod_importar.importar(Path(ruta) if ruta else None)
            self.m = Modelo()
            return {"ok": True, "archivos": {k: str(v) for k, v in salidas.items()}}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def elegir_excel(self) -> dict:
        rutas = webview.windows[0].create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=False,
            file_types=("Excel (*.xlsx)",))
        if not rutas:
            return {"ok": False, "error": "cancelado"}
        return self.reimportar(rutas[0])

    # ------------------------------------------------------------ equipos

    def set_equipo(self, n: int, campo: str, valor: Any) -> dict:
        """Edicion manual del catalogo (precio, consumo, vida util...)."""
        ruta = DATOS / "equipos.json"
        doc = json.loads(ruta.read_text(encoding="utf-8"))
        for e in doc["equipos"]:
            if e["n"] == int(n):
                try:
                    e[campo] = float(valor)
                except (TypeError, ValueError):
                    e[campo] = valor
                break
        else:
            return {"ok": False, "error": f"equipo {n} no existe"}
        ruta.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        self.m = Modelo()
        return {"ok": True}

    def referencias(self) -> list[dict]:
        rf = json.loads((DATOS / "referencias.json").read_text(encoding="utf-8"))
        return rf["referencias"]


def servir_web(puerto: int = 8777) -> None:
    """Modo desarrollo: sirve ui/ por HTTP y expone la Api en POST /api/<metodo>.

    Permite abrir la interfaz en un navegador comun para revisarla. La aplicacion
    de escritorio no usa este camino.
    """
    import http.server
    import socketserver
    import urllib.parse

    api = Api()
    ui = RAIZ / "ui"

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(ui), **kw)

        def log_message(self, *a):
            pass

        def end_headers(self):
            # en desarrollo nunca se cachea: cada recarga trae los cambios
            self.send_header("Cache-Control", "no-store, must-revalidate")
            super().end_headers()

        def _json(self, obj, codigo=200):
            cuerpo = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)

        def do_POST(self):
            ruta = urllib.parse.urlparse(self.path).path
            if not ruta.startswith("/api/"):
                return self.send_error(404)
            metodo = ruta[5:]
            fn = getattr(api, metodo, None)
            if not callable(fn) or metodo.startswith("_"):
                return self._json({"error": f"metodo desconocido: {metodo}"}, 404)
            largo = int(self.headers.get("Content-Length") or 0)
            args = json.loads(self.rfile.read(largo) or "[]") if largo else []
            try:
                return self._json(fn(*args))
            except Exception as e:  # noqa: BLE001
                return self._json({"error": str(e)}, 500)

    # con hilos: el navegador abre varias conexiones para los modulos ES y una
    # sola en espera bloquearia a las demas
    class Servidor(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    with Servidor(("127.0.0.1", puerto), Handler) as srv:
        print(f"ScoopLab (modo web) -> http://127.0.0.1:{puerto}/index.html")
        srv.serve_forever()


def main() -> None:
    if "--web" in sys.argv:
        idx = sys.argv.index("--web")
        puerto = int(sys.argv[idx + 1]) if len(sys.argv) > idx + 1 and sys.argv[idx + 1].isdigit() else 8777
        return servir_web(puerto)

    api = Api()
    webview.create_window(
        "ScoopLab — Carguio Uchucchacua",
        str(RAIZ / "ui" / "index.html"),
        js_api=api, width=1440, height=900, min_size=(1024, 680),
        background_color="#15171a",
    )
    # los modulos ES no cargan desde file://: pywebview sirve ui/ por su HTTP local
    webview.start(debug="--debug" in sys.argv, http_server=True)


if __name__ == "__main__":
    main()
