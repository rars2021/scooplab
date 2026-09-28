# ScoopLab

Plataforma local para el estudio de carguío de la Mina Socorro, U.P. Uchucchacua.
Convierte el modelo de `Caso_Practico_Scoop_Uchucchacua v3.xlsx` en una aplicación
con render 3D, barra de tareas por secciones e indicadores de rendimiento.

## Uso

```bash
python main.py
```

Ejecutable (no requiere Python): `dist/ScoopLab.exe`, 24 MB. Al abrirlo crea una
carpeta `datos/` a su lado con los JSON editables; los cambios persisten allí.

Modo navegador, útil para revisar la interfaz:

```bash
python main.py --web 8777
```

## Estructura

| Carpeta | Contenido |
|---|---|
| `engine/` | Motor de cálculo: `modelo`, `ventilacion`, `payback`, `matriz`, `importar` |
| `datos/` | Cuatro JSON: equipos, parámetros, secciones, referencias |
| `ui/` | Interfaz: `index.html`, `rockwedge.css`, `app.js`, `vistas.js`, `render3d.js`, `iconos.js` |
| `tests/` | 19 pruebas de control contra el Excel |

## Validación

El motor reproduce el Excel. `python -m pytest tests/ -q` comprueba, entre otros:

| Control | Valor |
|---|---|
| Capacidad de cuchara, scoop de la tesis | 4.17 TCS |
| Capacidad de cuchara, LH307 | 4.8313 TCS |
| Rendimiento efectivo LH307 | 58.0 TCS/h |
| Costo horario LH307 | 94.40 US$/h |
| Ventilación, escenario de control | 47,092 CFM |
| Payback a 500 TCS/día | 18.9 años |
| Payback a 1,000 TCS/día | 7.0 años |

Si una prueba falla, el motor está mal, no el Excel.

## Las once secciones

Entrada → proceso → salida, en ese orden en la barra inferior:

Flota · Equipo · Geometría · Ciclo · Costos · Ventilación · Comparador ·
Matriz · Payback · Parámetros · Opciones

## Render 3D

Cada equipo se construye por código desde sus cotas reales del catálogo: no hay
modelos externos. El túnel de sección se dibuja alrededor; si el equipo no cabe,
las paredes se tiñen y se cotan las interferencias.

Cada tipo de energía se distingue a la vista:

| Energía | Señal |
|---|---|
| Diésel | bloque motor, escape con penacho animado, acento ámbar |
| Eléctrico-cable | carrete trasero y traza acotada del radio de 120 m, acento celeste |
| Batería | pack visible con barra de estado de carga, acento verde |

## Indicadores nuevos

Siete que el Excel no trae. El más relevante para el caso es **huella de aire**
(CFM requerido por TCS/h): une productividad y ventilación, que en el Excel viven
en hojas separadas.

También: productividad específica, intensidad energética, índice de holgura,
densidad de potencia, OEE y capacidad diaria.

## Reimportar el Excel

`Opciones → Reimportar desde Excel` vuelve a leer el libro y regenera los JSON.
`Restablecer` descarta los cambios manuales y vuelve a los valores del Excel.

## Compilar

```bash
python -m PyInstaller build.spec --noconfirm
```
