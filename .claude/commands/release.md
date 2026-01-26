# Release Command

Create a new release by committing changes, creating a version tag, and pushing to origin.

## Instructions

1. Check `git status` to see all changed files
2. Review the changes with `git diff --stat`
3. Look at `apps/backend/src/thermo_raw/__init__.py` to get the current version
4. Stage all relevant changes (avoid staging unrelated files)
5. Create a commit with a descriptive message following conventional commits format
6. Create an annotated tag with the version from `__init__.py` (e.g., `v0.4.1`)
7. Push the commit and tag to origin: `git push origin main --tags`
8. Report the GitHub Actions workflow URL: `https://github.com/RusEu/thermo-raw/actions`

## Version Sync

Ensure version is consistent across these files before committing:
- `apps/backend/src/thermo_raw/__init__.py`
- `apps/backend/pyproject.toml`
- `apps/backend/thermoraw.spec` (CFBundleVersion and CFBundleShortVersionString)
- `apps/frontend/package.json`

If versions are inconsistent, update them all to match before committing.
