# ThermoRawFileParser Binaries

This directory contains platform-specific ThermoRawFileParser binaries for standalone builds.

## Download

Download the appropriate version from:
https://github.com/compomics/ThermoRawFileParser/releases

## Setup

### Windows
1. Download `ThermoRawFileParser.zip`
2. Extract `ThermoRawFileParser.exe` to `vendor/windows/`

### macOS
1. Download the mono version (or .NET Core version if available)
2. Place `ThermoRawFileParser` binary in `vendor/macos/`
3. Make it executable: `chmod +x vendor/macos/ThermoRawFileParser`

### Linux
1. Download the Linux version
2. Place `ThermoRawFileParser` binary in `vendor/linux/`
3. Make it executable: `chmod +x vendor/linux/ThermoRawFileParser`
4. Install libicu if needed: `apt-get install libicu-dev`

## Notes

- These binaries are not included in the repository due to licensing
- The standalone app will work without them, but won't be able to convert `.raw` files
- Users can still upload pre-converted `.mzML` files
