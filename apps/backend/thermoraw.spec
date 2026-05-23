# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec file for ThermoRaw standalone application."""
import sys
import zipfile
import shutil
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

block_cipher = None

# fisher_py reads the Thermo Trailer Extra directly from .raw via pythonnet.
# Its import is lazy, and it ships native .NET DLLs (RawFileReader) as package
# data, so bundle the package, pythonnet/clr_loader and all their data/binaries.
dotnet_datas, dotnet_binaries, dotnet_hidden = [], [], []
for _pkg in ('fisher_py', 'pythonnet', 'clr_loader'):
    try:
        _d, _b, _h = collect_all(_pkg)
        dotnet_datas += _d
        dotnet_binaries += _b
        dotnet_hidden += _h
        print(f"Bundling {_pkg}: {len(_d)} datas, {len(_b)} binaries")
    except Exception as e:
        print(f"WARNING: could not collect {_pkg}: {e}")

# Extract ThermoRawFileParser from zip if needed
parser_zip = Path('vendor/ThermoRawFileParser.zip')
parser_extract_dir = Path('build/ThermoRawFileParser')

if parser_zip.exists():
    # Clean and extract
    if parser_extract_dir.exists():
        shutil.rmtree(parser_extract_dir)
    parser_extract_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(parser_zip, 'r') as zf:
        zf.extractall(parser_extract_dir)

    parser_datas = [(str(parser_extract_dir), 'ThermoRawFileParser')]
    print(f"Including ThermoRawFileParser from {parser_zip}")
else:
    parser_datas = []
    print(f"WARNING: ThermoRawFileParser not found at {parser_zip}")

# Static files (frontend build)
static_path = Path('src/thermo_raw/static')
static_datas = []
if static_path.exists() and any(static_path.iterdir()):
    static_datas = [('src/thermo_raw/static', 'thermo_raw/static')]
else:
    print("WARNING: Static frontend files not found at src/thermo_raw/static")

a = Analysis(
    ['src/thermo_raw/main.py'],
    pathex=[],
    binaries=dotnet_binaries,
    datas=static_datas + parser_datas + dotnet_datas,
    hiddenimports=[
        # Uvicorn and its dependencies
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        # FastAPI and Starlette
        'fastapi',
        'starlette',
        'starlette.responses',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.staticfiles',
        # Pydantic
        'pydantic',
        'pydantic_core',
        # Other dependencies
        'multipart',
        'python_multipart',
        'h11',
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',
        # Data processing
        'numpy',
        'pandas',
        'pyteomics',
        'pyteomics.mzml',
        'lxml',
        'lxml.etree',
        # Bokeh for plots
        'bokeh',
        'bokeh.embed',
        'bokeh.models',
        'bokeh.plotting',
        'bokeh.resources',
        'bokeh.palettes',
        # Email for validators
        'email_validator',
        # pywebview for native GUI
        'webview',
        'webview.platforms',
        'webview.platforms.cocoa',
        'webview.platforms.winforms',
        'webview.platforms.edgechromium',
        'webview.platforms.gtk',
        'webview.platforms.qt',
        # macOS pyobjc for WebKit
        'objc',
        'Foundation',
        'AppKit',
        'WebKit',
        'PyObjCTools',
        # Trailer Extra (.raw) reader and Excel export
        'clr',
        'fisher_py',
        'openpyxl',
    ] + dotnet_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'scipy',
        'PIL',
        'IPython',
        'jupyter',
        'notebook',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# Use onedir mode for faster startup (no extraction on each run)
exe = EXE(
    pyz,
    a.scripts,
    [],  # Don't include binaries/data here - use COLLECT instead
    exclude_binaries=True,
    name='ThermoRaw',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='icon.ico' if sys.platform == 'win32' and Path('icon.ico').exists() else None,
)

# Collect all files into a directory (onedir mode)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ThermoRaw',
)

# macOS app bundle
if sys.platform == 'darwin':
    app = BUNDLE(
        coll,  # Use COLLECT output for app bundle
        name='ThermoRaw.app',
        icon='icon.icns' if Path('icon.icns').exists() else None,
        bundle_identifier='com.thermoraw.app',
        info_plist={
            'CFBundleName': 'ThermoRaw',
            'CFBundleDisplayName': 'ThermoRaw',
            'CFBundleVersion': '0.4.9',
            'CFBundleShortVersionString': '0.4.9',
            'NSHighResolutionCapable': True,
            'LSMinimumSystemVersion': '10.15',
        },
    )
