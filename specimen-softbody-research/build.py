"""Build the dependency-free HTML lab from the original JS core and UI."""
from pathlib import Path
root = Path(__file__).resolve().parent
core = (root / "softbody.js").read_text(encoding="utf-8")
ui = (root / "ui.html").read_text(encoding="utf-8")
assert ui.count("/* CORE_INSERT */") == 1
(root / "sandbox.html").write_text(ui.replace("/* CORE_INSERT */", core), encoding="utf-8")
print(root / "sandbox.html")
