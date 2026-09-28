# -*- mode: python ; coding: utf-8 -*-
"""
Empaquetado de ScoopLab en un unico ejecutable.

    python -m PyInstaller build.spec --noconfirm

Salida: dist/ScoopLab.exe  (no requiere Python ni instalacion)
La interfaz (ui/) y los datos (datos/) viajan dentro del ejecutable.
"""
from pathlib import Path

RAIZ = Path(SPECPATH)

a = Analysis(
    ["main.py"],
    pathex=[str(RAIZ)],
    binaries=[],
    datas=[
        ("ui", "ui"),
        ("datos", "datos"),
    ],
    hiddenimports=["openpyxl", "webview.platforms.edgechromium"],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "pandas", "PIL", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz, a.scripts, a.binaries, a.datas, [],
    name="ScoopLab",
    icon=str(RAIZ / "ui" / "scooplab.ico"),
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,          # sin ventana de consola
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
