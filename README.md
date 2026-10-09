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
| `engine/` | Motor de cálculo: `modelo`, `red`, `minado`, `ventilacion`, `payback`, `matriz`, `importar` |
| `datos/` | Equipos, parámetros, secciones, referencias, `red` y `casos/` (trazos de galerías), `ajustes_equipos` y `evidencia` |
| `ui/fuentes/` | Capturas de las fichas de fabricante y de la tesis que se muestran en las ventanas |
| `ui/` | Interfaz: `index.html`, `rockwedge.css`, `app.js`, `vistas.js`, `iconos.js` y el 3D en módulos ES: `render3d.js`, `equipo3d.js`, `modelos.js`, `red3d.js`, `minado3d.js`, `camaras.js`, `minimapa.js` |
| `ui/vendor/` | three.js r169, OrbitControls, three-mesh-bvh y three-bvh-csg, locales (sin internet) |
| `tests/` | 21 pruebas de control contra el Excel, 14 de la red de galerías, 8 de casos y velocidad en pendiente y 6 del ciclo de minado |

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

Cada equipo se construye por código desde sus cotas del catálogo y los rasgos
de su ficha (`ui/modelos.js`): posición real de ejes y articulación, tipo de
cabina, baterías y colores de marca. La cuchara es hueca y se ve llenarse.
No hay modelos externos. El túnel de sección se dibuja alrededor; si el equipo no cabe,
las paredes se tiñen y se cotan las interferencias.

Cada tipo de energía se distingue a la vista: los diésel llevan escape con
penacho y rejilla de radiador; los de batería, el paquete de baterías sobre el
bastidor trasero.

## Red de galerías

`datos/red.json` define nodos (x, y, z), tramos con su sección y pendiente, curvas
con radio y sobreancho, y la ruta del scoop. **El trazo incluido es de diseño, no
topografía**: Rampa Fernando 4×4 a −13 % con un zig-zag, intersección en Y hacia la
rampa positiva 3×3.7 a +15 %, ventana 3×3 con cámara de maniobra y cámara lateral
del echadero. Se edita a mano; el render y la revisión se actualizan solos.

En modo **Simulación** las secciones se barren a lo largo del eje y se unen con
operaciones booleanas; el equipo recorre la ruta articulando en las curvas y
cambia de sentido con maniobras en la cámara y en la intersección.

Revisión de curvas (`engine/red.py`, pestaña Geometría): el equipo gira si el radio
de la curva es mayor que su radio de eje mínimo, y entra si
`barrido + 2 × holgura ≤ sección + sobreancho`. Es adicional al Excel y no cambia
el veredicto de sección. El Excel solo trae el radio de giro exterior; el interior
(`radio_giro_int_mm` en `equipos.json`) está **estimado** como exterior − 1.21 × ancho
hasta cargar el de catálogo.

## Casos de simulación y velocidad

En Simulación, el selector sobre el minimapa cambia de trazo (`datos/casos.json`):
Rampa Fernando (cargado en bajada), profundización (cargado en subida a +13 %),
corte y relleno con ventana negativa de −17 % a la veta y el **ciclo de minado
completo** del tajo 6675-2 (perforación, carguío y voladura, ventilación, desatado
y limpieza). En ese caso los datos de perforación, voladura, producción y aire son
los de la tesis; la duración del carguío, de la ventilación y del desatado no está
en la tesis y son supuestos editables en `datos/casos/ciclo_minado.json`. Cada caso muestra su
recorrido, ciclo y rendimiento para el equipo elegido, junto al del Excel.

La animación corre en tiempo real (1×, con 2×/4×/8×): la velocidad que se ve es
la del cálculo. En cada tramo vale la velocidad del modelo, salvo que la potencia
no alcance en subida: `v = η·P / (m·g·(rodadura + pendiente))`, con η = 0.49 y 3 %
de rodadura, calibrado con la tabla de desempeño en pendiente de la ficha del
ST3.5 y contrastado con la del ST7. El modo **Ciclo** es el ciclo del Excel a
nivel (80 m), con su maniobra y su giro.

## Fuentes reales

La ventana Equipo muestra capturas de la ficha del fabricante (con su
identificador y enlace al original) y, donde lo hay, un video. Ciclo, Costos,
Ventilación y Geometría muestran la página de la tesis de donde sale el dato.
Las fichas son propiedad de Sandvik, Epiroc/Atlas Copco y Caterpillar: se citan
como fuente; revisa sus condiciones antes de redistribuirlas. Los radios de giro
de ST3.5, LH307, ST7, R1300G y LH203 son los de esas fichas. El Artisan A10 tiene
ficha (peso, potencia y batería salen de ella) pero no trae radios de giro; del
ST7 Battery no hay ficha pública. En esos dos el radio interior sigue estimado.

## Cámaras

| Cámara | Uso |
|---|---|
| Órbita | girar con clic izquierdo, desplazar con clic derecho, zoom hacia el cursor |
| Vuelo | WASD, Q/E para bajar y subir, Shift acelera, arrastrar para mirar |
| Caminar | a pie dentro de la galería, con choque contra las paredes (solo Simulación) |
| Seguir / Cabina | detrás del equipo o desde el asiento del operador |

El teclado actúa cuando la escena tiene el foco (clic sobre ella). En Simulación
hay además vistas guardadas, estilo corte / transparente y un minimapa en planta:
un clic lleva la cámara a ese punto.

## Indicadores nuevos

Siete que el Excel no trae. El más relevante para el caso es **huella de aire**
(CFM requerido por TCS/h): une productividad y ventilación, que en el Excel viven
en hojas separadas.

También: productividad específica, intensidad energética, índice de holgura,
densidad de potencia, OEE y capacidad diaria.

## Catálogo de equipos

Solo se evalúan equipos con ficha técnica de fabricante. `datos/ajustes_equipos.json`
se aplica en cada importación del Excel:

- El scoop de 3.5 yd³ de la tesis se identifica como **Atlas Copco Scooptram ST3.5**
  (136 kW = 182 HP, cuchara de 2.7 m³) y toma las cotas de su ficha. La tesis no
  nombra el modelo: la identificación es inferida.
- Los scoops eléctricos de 2.2 yd³ de Orcopampa (cable y STB a batería) se retiran:
  ninguna fuente pública da su marca ni modelo.

Los `n` no se renumeran (siguen la columna N del Excel), por eso faltan el 6 y el 7.

## Reimportar el Excel

`Opciones → Reimportar desde Excel` vuelve a leer el libro y regenera los JSON.
`Restablecer` descarta los cambios manuales y vuelve a los valores del Excel.

## Compilar

```bash
python -m PyInstaller build.spec --noconfirm
```
