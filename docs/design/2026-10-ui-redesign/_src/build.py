"""Builds the prototype pages. Run: python3 -I build.py (from this folder)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import p_notes  # noqa: E402

pages = [p_notes]
for name in ["p_templates", "p_editor", "p_settings", "p_states", "p_desktop", "p_index"]:
    if (Path(__file__).resolve().parent / f"{name}.py").exists():
        pages.append(__import__(name))
for p in pages:
    size = p.build()
    print(p.__name__, size)
