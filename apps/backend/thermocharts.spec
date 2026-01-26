# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec file for ThermoCharts standalone application."""
import sys
from pathlib import Path

block_cipher = None

# Determine platform-specific ThermoRawFileParser directory
if sys.platform == 'win32':
    parser_src = 'vendor/windows'
    parser_name = 'ThermoRawFileParser.exe'
elif sys.platform == 'darwin':
    parser_src = 'vendor/macos'
    parser_name = 'ThermoRawFileParser'
else:
    parser_src = 'vendor/linux'
    parser_name = 'ThermoRawFileParser'

# Check if parser exists
parser_path = Path(parser_src)
parser_datas = []
if parser_path.exists() and (parser_path / parser_name).exists():
    parser_datas = [(parser_src, 'ThermoRawFileParser')]
else:
    print(f"WARNING: ThermoRawFileParser not found at {parser_src}/{parser_name}")
    print("The built application will not be able to convert .raw files.")
    print(f"Download from: https://github.com/compomics/ThermoRawFileParser/releases")

# Static files (frontend build)
static_path = Path('src/thermo_stats/static')
static_datas = []
if static_path.exists():
    static_datas = [('src/thermo_stats/static', 'thermo_stats/static')]
else:
    print("WARNING: Static frontend files not found at src/thermo_stats/static")
    print("Build the frontend first: cd ../frontend && npm run build")

a = Analysis(
    ['src/thermo_stats/main.py'],
    pathex=[],
    binaries=[],
    datas=static_datas + parser_datas,
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
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary modules to reduce size
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

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='ThermoCharts',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window (GUI app)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='icon.ico' if sys.platform == 'win32' else None,
)

# macOS app bundle
if sys.platform == 'darwin':
    app = BUNDLE(
        exe,
        name='ThermoCharts.app',
        icon='icon.icns' if Path('icon.icns').exists() else None,
        bundle_identifier='com.thermocharts.app',
        info_plist={
            'CFBundleName': 'ThermoCharts',
            'CFBundleDisplayName': 'ThermoCharts',
            'CFBundleVersion': '0.1.0',
            'CFBundleShortVersionString': '0.1.0',
            'NSHighResolutionCapable': True,
            'LSMinimumSystemVersion': '10.15',
        },
    )
