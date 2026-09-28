# -*- coding: utf-8 -*-
"""
Genera el icono de la aplicacion a partir del emblema de la interfaz.

Dibuja la silueta del cargador de bajo perfil con las tres barras de
indicadores, en las resoluciones que Windows pide para el archivo, la barra de
tareas y el titulo de la ventana.

    python hacer_icono.py

Salida: ui/scooplab.ico  y  ui/scooplab.png
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent
DESTINO_ICO = RAIZ / "ui" / "scooplab.ico"
DESTINO_PNG = RAIZ / "ui" / "scooplab.png"

# Paleta fija: el icono no sigue el tema de la aplicacion, tiene que leerse
# igual sobre fondo claro y oscuro del explorador o de la barra de tareas.
FONDO = (24, 27, 31, 255)        # pizarra oscura
BORDE = (74, 158, 224, 255)      # acento
CHAPA = (206, 214, 222, 255)     # cuerpo de la maquina
CHAPA_OSC = (150, 160, 172, 255)
ACENTO = (74, 158, 224, 255)     # cuchara, cabina y barras
LLANTA = (38, 43, 49, 255)

# Alturas de las tres barras (rendimiento, costo, holgura) en el lienzo de 24
STATS = (0.58, 0.88, 0.42)

SS = 16          # supermuestreo para bordes suaves
N = 24           # lado del lienzo logico, igual que el viewBox del SVG


def _e(v: float) -> float:
    """De coordenada logica (0..24) a pixel del lienzo supermuestreado."""
    return v * SS


def dibujar(lado_ss: int) -> Image.Image:
    img = Image.new("RGBA", (lado_ss, lado_ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # --- fondo redondeado y marco de acento ---
    r = _e(3.2)
    d.rounded_rectangle([_e(0.5), _e(0.5), _e(23.5), _e(23.5)],
                        radius=r, fill=FONDO)
    d.rounded_rectangle([_e(0.5), _e(0.5), _e(23.5), _e(23.5)],
                        radius=r, outline=BORDE, width=max(1, int(_e(0.42))))

    # La maquina ocupa la franja alta (y 5..17) y las barras la baja (y 18..22),
    # para que no se pisen entre si a 16 px.

    # --- brazo: nace del chasis delantero y baja hacia la cuchara ---
    d.line([(_e(10.2), _e(11.3)), (_e(6.6), _e(12.9))],
           fill=CHAPA_OSC, width=int(_e(1.05)))

    # --- cuchara, unida al extremo del brazo ---
    d.polygon([(_e(3.0), _e(11.7)), (_e(7.1), _e(10.6)),
               (_e(7.8), _e(14.1)), (_e(3.6), _e(15.2))], fill=ACENTO)
    # labio
    d.line([(_e(3.0), _e(11.7)), (_e(3.6), _e(15.2))],
           fill=CHAPA, width=int(_e(0.5)))

    # --- chasis delantero, junta de articulacion y chasis trasero ---
    d.rectangle([_e(9.6), _e(9.4), _e(12.7), _e(13.4)], fill=CHAPA_OSC)
    d.rectangle([_e(12.6), _e(10.2), _e(13.6), _e(12.6)], fill=ACENTO)
    d.rectangle([_e(13.5), _e(8.4), _e(20.8), _e(13.4)], fill=CHAPA)

    # --- ROPS: postes y techo de acento ---
    d.rectangle([_e(14.6), _e(6.2), _e(17.9), _e(8.5)], fill=CHAPA_OSC)
    d.rectangle([_e(14.2), _e(5.4), _e(18.3), _e(6.3)], fill=ACENTO)

    # --- ruedas ---
    for cx in (11.0, 18.0):
        d.ellipse([_e(cx - 2.15), _e(14.9 - 2.15), _e(cx + 2.15), _e(14.9 + 2.15)],
                  fill=LLANTA)
        d.ellipse([_e(cx - 0.95), _e(14.9 - 0.95), _e(cx + 0.95), _e(14.9 + 0.95)],
                  fill=CHAPA_OSC)

    # --- barras de indicadores, sobre la linea de piso ---
    d.rectangle([_e(3.6), _e(21.9), _e(20.4), _e(22.3)], fill=CHAPA_OSC)
    for i, v in enumerate(STATS):
        h = 1.1 + max(0.0, min(1.0, v)) * 3.5
        x = 4.4 + i * 5.4
        d.rectangle([_e(x), _e(21.9 - h), _e(x + 3.2), _e(21.9)],
                    fill=(ACENTO[0], ACENTO[1], ACENTO[2], min(255, 175 + 30 * i)))

    return img


def main() -> None:
    maestro = dibujar(N * SS)
    tamanos = [256, 128, 64, 48, 32, 24, 16]
    capas = [maestro.resize((t, t), Image.LANCZOS) for t in tamanos]

    capas[0].save(DESTINO_PNG)
    capas[0].save(DESTINO_ICO, format="ICO",
                  sizes=[(t, t) for t in tamanos])
    print(f"  {DESTINO_ICO.relative_to(RAIZ)}  ({', '.join(str(t) for t in tamanos)} px)")
    print(f"  {DESTINO_PNG.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
