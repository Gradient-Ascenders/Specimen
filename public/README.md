# Play Specimen locally

Do not open `index.html` directly. Browsers must load the game through an
ordinary HTTP server.

## Linux / macOS

Open a terminal in this folder and run:

```bash
bash start-server.sh
```

## Windows PowerShell

Open PowerShell in this folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-server.ps1
```

Both launchers serve this folder at `http://127.0.0.1:4173/` and attempt to
open the URL in your default browser. Press `Ctrl+C` in the terminal to stop
the server. Python 3 must be installed and available as `python3`, `python`,
or the Windows `py` launcher.

To use another port, pass it as the first argument:

```bash
bash start-server.sh 8080
```

```powershell
powershell -ExecutionPolicy Bypass -File .\start-server.ps1 -Port 8080
```

## GitHub Actions download

GitHub Actions downloads an outer workflow-artifact ZIP. Extract that wrapper
first, then extract its inner `specimen-production.zip`. These instructions
and launchers are inside the inner ZIP alongside `index.html`.

For Moodle deployment, submit the inner `specimen-production.zip`, not the
outer GitHub Actions wrapper.
