#!/usr/bin/env python3
"""Собирает dist/ (для Vercel) и artifact/ (превью) из src/."""
import pathlib, shutil
root = pathlib.Path(__file__).parent
src, dist, art = root / "src", root / "dist", root / "artifact"
FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Commissioner:wght@500;600;700&family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">'
SCRIPTS = "".join(f'<script src="{n}"></script>' for n in ["items.js", "hints.js", "scoring.js", "sample.js", "clinician.js", "support.js", "explain.js", "insights.js", "lab.js", "sprite.js", "music.js", "pixels.js", "app.js"])
BODY = '<main id="app"></main><noscript>Для работы анкеты нужен JavaScript.</noscript>'
TITLE = "<title>ND-Screen</title>"
META = '<meta name="description" content="Экспериментальный скрининг признаков РАС и СДВГ у взрослых с учётом детства">'

for d in (dist, art):
    if d.exists(): shutil.rmtree(d)
    d.mkdir()
    for f in src.iterdir(): shutil.copy(f, d / f.name)

(dist / "index.html").write_text(f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{TITLE}{META}{FONTS}<link rel="stylesheet" href="style.css"></head>
<body>{BODY}{SCRIPTS}</body></html>
''', encoding="utf-8")

css = (src / "style.css").read_text(encoding="utf-8")
(art / "page.html").write_text(f'''{TITLE}
<meta name="claude:viewport-fit-sides" content="cover">
{FONTS}
<style>{css}</style>
{BODY}{SCRIPTS}
''', encoding="utf-8")
(art / "style.css").unlink()
print("ok")
