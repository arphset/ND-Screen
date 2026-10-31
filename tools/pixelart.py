#!/usr/bin/env python3
"""Пиксельные картинки ND-Screen. Рисует сцены 120×60 и пишет src/pixels.js (PNG в base64).
Запуск: python3 tools/pixelart.py [--sheet out.png]"""
import base64, io, math, pathlib, sys
from PIL import Image

W, H = 120, 60
PAL = {
    "ink": (34, 32, 52), "ink2": (60, 56, 84), "white": (247, 244, 236), "paper": (232, 226, 210),
    "sky1": (118, 172, 214), "sky2": (160, 204, 232), "sky3": (206, 230, 242), "night1": (34, 44, 84), "night2": (58, 70, 120),
    "wall": (236, 222, 196), "wall2": (220, 202, 172), "wallg": (196, 222, 206), "wallg2": (170, 202, 184), "wallb": (200, 214, 236), "wallb2": (176, 192, 222),
    "floor": (176, 128, 90), "floor2": (150, 104, 72), "wood": (156, 98, 62), "wood2": (120, 72, 46), "wood3": (190, 132, 86),
    "skin": (242, 196, 160), "skin2": (214, 160, 126), "skinD": (176, 118, 84), "skinD2": (140, 90, 62),
    "hair1": (70, 46, 34), "hair2": (196, 128, 60), "hair3": (40, 36, 44), "hair4": (230, 196, 110),
    "red": (214, 78, 78), "red2": (168, 52, 60), "orange": (238, 146, 70), "yellow": (246, 206, 92), "yellow2": (222, 170, 60),
    "green": (104, 176, 98), "green2": (66, 132, 80), "green3": (150, 206, 120), "teal": (70, 160, 160), "teal2": (44, 118, 126),
    "blue": (76, 120, 196), "blue2": (52, 84, 150), "purple": (140, 100, 180), "purple2": (104, 70, 140), "pink": (236, 150, 170),
    "grey": (150, 150, 162), "grey2": (110, 110, 126), "grey3": (196, 196, 204), "metal": (176, 186, 196),
    "glass": (170, 214, 236), "glass2": (130, 184, 216), "screen": (96, 200, 210), "lamp": (255, 236, 160),
}

# Тема оформления и номер кадра анимации задаются перед отрисовкой сцены (см. render).
G = {"theme": "default", "f": 0}
F = lambda: G["f"]
bob = lambda i=0: (G["f"] + i) % 2
THEMES = {
    "default": {},
    "space": {"wall": (44, 48, 86), "wall2": (56, 62, 104), "wallg": (40, 56, 78), "wallg2": (52, 70, 96), "wallb": (38, 44, 82), "wallb2": (50, 58, 104),
              "floor": (122, 130, 150), "floor2": (98, 106, 126), "sky1": (18, 22, 50), "sky2": (30, 36, 80), "sky3": (54, 58, 116),
              "ground": (150, 150, 172), "ground2": (112, 112, 134), "ground3": (182, 182, 198)},
    "ocean": {"wall": (216, 238, 236), "wall2": (192, 222, 224), "wallg": (204, 234, 226), "wallg2": (178, 216, 206), "wallb": (200, 226, 242), "wallb2": (174, 206, 232),
              "floor": (232, 208, 160), "floor2": (210, 182, 132), "ground": (234, 212, 160), "ground2": (206, 180, 128), "ground3": (244, 228, 188)},
    "trains": {"wall": (240, 220, 190), "wall2": (220, 184, 150), "wallg": (226, 222, 196), "wallg2": (204, 196, 160), "wallb": (222, 214, 228), "wallb2": (198, 184, 206)},
}
GROUND = {"ground": (104, 176, 98), "ground2": (66, 132, 80), "ground3": (150, 206, 120)}

class C:
    def __init__(s, bg="wall"):
        s.im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); s.p = s.im.load()
        if bg: s.rect(0, 0, W, H, bg)
    def px(s, x, y, c):
        if 0 <= x < W and 0 <= y < H and c:
            col = (THEMES[G["theme"]].get(c) or PAL.get(c) or GROUND[c]) if isinstance(c, str) else c
            s.p[int(x), int(y)] = col + (255,) if len(col) == 3 else col
    def get(s, x, y):
        return s.p[x, y] if 0 <= x < W and 0 <= y < H else (0, 0, 0, 0)
    def blend(s, x, y, col, a):
        if 0 <= x < W and 0 <= y < H:
            r, g, b, al = s.p[x, y]; t = (THEMES[G["theme"]].get(col) or PAL[col]) if isinstance(col, str) else col
            s.p[x, y] = (round(r + (t[0] - r) * a), round(g + (t[1] - g) * a), round(b + (t[2] - b) * a), al)
    def rect(s, x, y, w, h, c):
        for i in range(int(x), int(x + w)):
            for j in range(int(y), int(y + h)): s.px(i, j, c)
    def box(s, x, y, w, h, fill, line="ink"):
        s.rect(x, y, w, h, line); s.rect(x + 1, y + 1, w - 2, h - 2, fill)
    def dither(s, x, y, w, h, a, b):
        for i in range(int(x), int(x + w)):
            for j in range(int(y), int(y + h)): s.px(i, j, a if (i + j) % 2 else b)
    def hl(s, x, y, w, c): s.rect(x, y, w, 1, c)
    def vl(s, x, y, h, c): s.rect(x, y, 1, h, c)
    def disc(s, cx, cy, r, c):
        for i in range(int(cx - r - 1), int(cx + r + 2)):
            for j in range(int(cy - r - 1), int(cy + r + 2)):
                if (i - cx) ** 2 + (j - cy) ** 2 <= r * r + 0.5: s.px(i, j, c)
    def ring(s, cx, cy, r, c):
        for a in range(0, 360, 4):
            s.px(round(cx + r * math.cos(math.radians(a))), round(cy + r * math.sin(math.radians(a))), c)
    def arc(s, cx, cy, r, a0, a1, c):
        for a in range(a0, a1, 3):
            s.px(round(cx + r * math.cos(math.radians(a))), round(cy + r * math.sin(math.radians(a))), c)
    def sprite(s, x, y, rows, cmap):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch != "." and ch in cmap: s.px(x + i, y + j, cmap[ch])
    def png(s, scale=1):
        im = s.im.convert("RGB")
        im = im if scale == 1 else im.resize((W * scale, H * scale), Image.NEAREST)
        b = io.BytesIO(); im.save(b, "PNG", optimize=True); return b.getvalue()

def ol(c, fn, *a, line="ink", **k):
    """Рисует fn на прозрачном слое, обводит контуром и кладёт на холст."""
    t = C(None); fn(t, *a, **k)
    src = t.im.load(); out = t.im.copy(); o = out.load()
    for x in range(W):
        for y in range(H):
            if src[x, y][3]: continue
            if any(0 <= x + dx < W and 0 <= y + dy < H and src[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                o[x, y] = PAL[line] + (255,)
    c.im.alpha_composite(out); c.p = c.im.load()

def shadow(c, cx, y, w, a=0.28):
    for i in range(-w // 2, w // 2 + 1):
        c.blend(cx + i, y, "ink", a); 
        if abs(i) < w // 2 - 1: c.blend(cx + i, y + 1, "ink", a * 0.6)

def light(c, x, y, w, h, a=0.18):
    """Пятно света от окна на полу (параллелограмм)."""
    for j in range(h):
        for i in range(w): c.blend(x + i + j, y + j, "white", a)

def chair(c, x, y, face="r"):
    bx = x if face == "r" else x + 7
    c.rect(bx, y - 8, 2, 14, "wood2"); c.rect(x, y + 1, 9, 2, "wood"); c.hl(x, y + 1, 9, "wood3")
    c.rect(x + 1, y + 3, 1, 7, "wood2"); c.rect(x + 7, y + 3, 1, 7, "wood2")

def rug(c, x, y, w, col="red"):
    c.rect(x, y, w, 4, col); c.dither(x + 1, y + 1, w - 2, 2, col, shade(col)); c.hl(x, y, w, shade(col))
    for i in range(x, x + w, 2): c.px(i, y + 4, "paper")

def picture(c, x, y, w=12, h=9, kind="sea"):
    c.box(x, y, w, h, "sky3", "wood2")
    th = G["theme"]
    if th == "space":
        c.rect(x + 1, y + 1, w - 2, h - 2, "night1"); c.disc(x + w // 2, y + h // 2, 2, "orange"); c.hl(x + w // 2 - 4, y + h // 2, 9, "paper"); c.px(x + 2, y + 2, "white"); return
    if th == "trains":
        c.hl(x + 1, y + h - 3, w - 2, "grey2"); c.rect(x + 2, y + h - 6, 5, 3, "red"); c.rect(x + 7, y + h - 5, 3, 2, "blue"); c.px(x + 3, y + h - 7, "ink"); return
    if th == "ocean":
        c.rect(x + 1, y + 1, w - 2, h - 2, "blue"); c.sprite(x + 3, y + 3, [".##.#", "####.", ".##.#"], {"#": "orange"}); c.px(x + w - 3, y + 2, "white"); return
    if kind == "sea":
        c.rect(x + 1, y + h // 2, w - 2, h // 2 - 1, "blue"); c.dither(x + 1, y + h // 2, w - 2, 1, "blue", "glass"); c.disc(x + w - 4, y + 3, 1, "yellow")
    else:
        mountain(c, x + 1, y + 2, w - 2, h - 3)

# ── фоны ──
def room(c, wall="wall", wall2="wall2", floor_y=44, floor="floor", floor2="floor2"):
    c.rect(0, 0, W, floor_y, wall)
    for x in range(0, W, 6): c.vl(x, 0, floor_y, wall2)  # обои в полоску
    c.hl(0, floor_y - 3, W, "white"); c.rect(0, floor_y - 2, W, 2, "wood3"); c.hl(0, floor_y - 1, W, "wood2")
    c.rect(0, floor_y, W, H - floor_y, floor)
    for y in range(floor_y + 2, H, 4):
        c.hl(0, y, W, floor2)
        off = (y // 4) * 7
        for x in range(off % 16, W, 16): c.vl(x, y - 3, 3, floor2)

def window(c, x, y, w, h, night=False, rain=False):
    c.box(x - 1, y - 1, w + 2, h + 2, "wood", "wood2")
    top, mid, low = ("night1", "night2", "night2") if night else ("sky1", "sky2", "sky3")
    c.rect(x + 1, y + 1, w - 2, h - 2, top)
    c.dither(x + 1, y + h // 3, w - 2, h // 3, top, mid); c.rect(x + 1, y + 2 * h // 3, w - 2, h - 2 * h // 3 - 1, low if not night else mid)
    th = G["theme"]
    if night or th == "space":
        if th == "space" and not night: c.rect(x + 1, y + 1, w - 2, h - 2, "night1"); c.dither(x + 1, y + h - 5, w - 2, 4, "night1", "night2")
        for k, (i, j) in enumerate([(3, 3), (w - 5, 4), (w // 2, 2), (6, h - 6), (w - 8, h - 5)]):
            if (k + F()) % 4: c.px(x + i, y + j, "white")
        if th == "space":
            c.disc(x + w - 7, y + 6, 3, "orange"); c.px(x + w - 8, y + 5, "yellow"); c.hl(x + w - 12, y + 6, 11, "paper"); c.px(x + w - 7, y + 6, "orange")
        else:
            c.disc(x + w - 6, y + 5, 2, "yellow"); c.px(x + w - 5, y + 4, "night1"); c.px(x + w - 5, y + 5, "night1")
    elif th == "ocean":
        hy = y + h // 2 + 1
        c.rect(x + 1, hy, w - 2, y + h - 1 - hy, "blue"); c.hl(x + 1, hy, w - 2, "glass")
        for i in range(x + 1 + F() % 4, x + w - 1, 4): c.px(i, hy + 2, "white"); c.px(i + 2, hy + 4, "glass")
        c.disc(x + 5, y + 4, 2, "yellow")
    else:
        cloud(c, x + 3, y + 4)
    if th == "trains" and not night:
        ty = y + h - 5; c.hl(x + 1, ty + 3, w - 2, "grey2")
        tx = x + 1 + (F() * 4) % max(1, w - 2) - 8
        for i in range(10):
            for j in range(3):
                if x + 1 <= tx + i < x + w - 1: c.px(tx + i, ty + j, "red" if j < 2 else "ink")
        if x + 1 <= tx + 7 < x + w - 1: c.px(tx + 7, ty, "glass")
    if rain:
        for i in range(x + 2, x + w - 2, 3):
            for j in range(y + 2 + (i + F()) % 4, y + h - 2, 4): c.px(i, j, "glass"); c.px(i, j + 1, "glass2")
    c.vl(x + w // 2, y, h, "wood2"); c.hl(x, y + h // 2, w, "wood2")
    c.hl(x - 2, y + h + 1, w + 4, "wood3")

def cloud(c, x, y):
    c.rect(x + 1, y, 4, 1, "white"); c.rect(x, y + 1, 7, 2, "white"); c.rect(x + 2, y - 1, 2, 1, "white")

def sky_out(c, ground_y=46, night=False):
    cols = ["sky1", "sky2", "sky3"]
    band = ground_y / 3
    for y in range(ground_y):
        k = min(2, int(y / band)); f = (y - k * band) / band
        for x in range(W):
            col = cols[k]
            if k < 2 and f > 0.75 and (x + y) % 2: col = cols[k + 1]
            c.px(x, y, col)
    th = G["theme"]
    if th == "space":
        for k in range(26):
            sx, sy = (k * 37) % W, (k * 13) % max(1, ground_y - 4)
            if (k + F()) % 5: c.px(sx, sy, "white")
        c.disc(W - 26, 10, 5, "orange"); c.disc(W - 27, 9, 2, "yellow"); c.hl(W - 34, 11, 17, "paper")
    else:
        cloud(c, 10, 6); cloud(c, 60, 12)
    if th == "ocean":
        sea = ground_y - 6
        c.rect(0, sea, W, 6, "blue"); c.hl(0, sea, W, "glass")
        for i in range(F() % 4, W, 4): c.px(i, sea + 2, "white"); c.px(i + 2, sea + 4, "glass")
        bx = 40 + F(); c.rect(bx, sea - 1, 7, 2, "wood"); c.vl(bx + 3, sea - 7, 6, "ink2"); c.sprite(bx + 4, sea - 7, ["#..", "##.", "###"], {"#": "white"})
    c.rect(0, ground_y, W, H - ground_y, "ground")
    c.dither(0, ground_y, W, 2, "ground", "ground3")
    for x in range(0, W, 5): c.px(x, ground_y + 4 + (x % 3), "ground2")
    if th == "trains":
        ry = ground_y + 1
        c.hl(0, ry + 3, W, "grey2"); c.hl(0, ry, W, "grey2")
        for x in range(0, W, 3): c.vl(x, ry, 4, "wood2")
        tx = (F() * 10) % (W + 40) - 30
        for (dx, col, hh) in [(0, "red", 6), (10, "blue", 5), (19, "yellow", 5)]:
            for i in range(9):
                for j in range(hh):
                    c.px(tx + dx + i, ry - hh + j, col if j < hh - 1 else "ink")
            c.px(tx + dx + 2, ry - 1, "ink"); c.px(tx + dx + 6, ry - 1, "ink")
        c.rect(tx + 6, ry - 9, 2, 3, "ink2"); c.px(tx + 6 - F() % 2, ry - 11, "grey3")

# ── люди ──
def person(c, x, y, hair="hair1", shirt="blue", pants="ink2", skin="skin", face="r", pose="stand", hair_style="short", mouth="smile", extra=None):
    """x, y — левый верх головы. Высота стоя 22."""
    sk2 = {"skin": "skin2", "skinD": "skinD2"}[skin]
    # голова 6×6
    c.rect(x + 1, y + 1, 6, 6, skin)
    c.rect(x + 1, y + 6, 6, 1, sk2)
    # волосы
    c.rect(x + 1, y, 6, 2, hair); c.px(x, y + 1, hair); c.px(x + 7, y + 1, hair)
    if face == "r": c.rect(x + 1, y + 2, 2, 2, hair)
    elif face == "l": c.rect(x + 5, y + 2, 2, 2, hair)
    else: c.px(x + 1, y + 2, hair); c.px(x + 6, y + 2, hair)
    if hair_style == "long":
        c.rect(x, y + 2, 1, 6, hair); c.rect(x + 7, y + 2, 1, 6, hair)
    if hair_style == "bun": c.rect(x + 3, y - 2, 2, 2, hair)
    c.px(x + 3, y, {"hair1": (110, 76, 56), "hair2": (232, 170, 96), "hair3": (84, 78, 96), "hair4": (250, 226, 160)}.get(hair, "white"))
    # глаза
    if face == "r": c.px(x + 4, y + 3, "ink"); c.px(x + 6, y + 3, "ink")
    elif face == "l": c.px(x + 2, y + 3, "ink"); c.px(x + 4, y + 3, "ink")
    else: c.px(x + 2, y + 3, "ink"); c.px(x + 5, y + 3, "ink")
    if face != "back":
        mx = x + 5 if face == "r" else x + 3 if face == "l" else x + 3
        if mouth == "smile": c.px(mx, y + 5, "red2"); c.px(mx + 1, y + 5, "red2") if face == "f" else None
        elif mouth == "flat": c.px(mx, y + 5, "skinD2")
        elif mouth == "o": c.px(mx, y + 5, "ink")
        c.px(x + (5 if face == "r" else 2), y + 4, "pink") if face != "f" else (c.px(x + 1, y + 4, "pink"), c.px(x + 6, y + 4, "pink"))
    # шея
    c.px(x + 3, y + 7, sk2); c.px(x + 4, y + 7, sk2)
    by = y + 8
    if pose == "sit":
        c.rect(x, by, 8, 7, shirt); c.hl(x, by + 6, 8, "ink2")
        c.rect(x + 1, by + 7, 9, 3, pants)  # бёдра вперёд
        c.rect(x + 8, by + 10, 2, 4, pants); c.rect(x + 8, by + 14, 3, 1, "ink")
        c.rect(x - 1, by + 1, 1, 4, shirt); c.px(x - 1, by + 5, skin)
        c.rect(x + 8, by + 1, 1, 3, shirt); c.rect(x + 8, by + 4, 2, 1, skin)
        return
    c.rect(x, by, 8, 8, shirt); c.hl(x, by + 7, 8, "ink2")
    c.vl(x, by, 8, shade(shirt)); c.px(x + 3, by, sk2); c.px(x + 4, by, sk2); c.px(x + 2, by, "white"); c.px(x + 5, by, "white")
    # руки
    if pose == "wave":
        c.rect(x + 8, by - 3, 1, 4, shirt); c.px(x + 8, by - 4, skin); c.rect(x - 1, by + 1, 1, 6, shirt); c.px(x - 1, by + 7, skin)
    elif pose == "hold":
        c.rect(x + 8, by + 1, 1, 3, shirt); c.rect(x + 8, by + 4, 3, 1, skin); c.rect(x - 1, by + 1, 1, 6, shirt); c.px(x - 1, by + 7, skin)
    elif pose == "cheer":
        c.rect(x + 8, by - 4, 1, 5, shirt); c.px(x + 8, by - 5, skin); c.rect(x - 1, by - 4, 1, 5, shirt); c.px(x - 1, by - 5, skin)
    else:
        c.rect(x - 1, by + 1, 1, 6, shirt); c.px(x - 1, by + 7, skin); c.rect(x + 8, by + 1, 1, 6, shirt); c.px(x + 8, by + 7, skin)
    # ноги
    c.rect(x + 1, by + 8, 3, 5, pants); c.rect(x + 4, by + 8, 3, 5, pants); c.vl(x + 4, by + 9, 4, "ink")
    c.rect(x + 1, by + 13, 3, 1, "ink"); c.rect(x + 4, by + 13, 4, 1, "ink")

def child(c, x, y, hair="hair2", shirt="red", pants="blue2", face="r", skin="skin"):
    """Ребёнок: высота 16."""
    sk2 = {"skin": "skin2", "skinD": "skinD2"}[skin]
    c.rect(x + 1, y + 1, 5, 5, skin); c.rect(x + 1, y, 5, 2, hair); c.px(x, y + 1, hair); c.px(x + 6, y + 1, hair)
    if face == "r": c.px(x + 4, y + 3, "ink"); c.px(x + 5, y + 3, "ink"); c.px(x + 1, y + 2, hair)
    else: c.px(x + 2, y + 3, "ink"); c.px(x + 1, y + 3, "ink"); c.px(x + 5, y + 2, hair)
    c.px(x + (4 if face == "r" else 2), y + 5, "red2"); c.px(x + 3, y + 6, sk2)
    c.rect(x, y + 7, 7, 5, shirt); c.px(x - 1, y + 8, shirt); c.px(x + 7, y + 8, shirt); c.px(x - 1, y + 10, skin); c.px(x + 7, y + 10, skin)
    c.rect(x + 1, y + 12, 2, 3, pants); c.rect(x + 4, y + 12, 2, 3, pants); c.rect(x + 1, y + 15, 2, 1, "ink"); c.rect(x + 4, y + 15, 3, 1, "ink")

def shade(col):
    return {"blue": "blue2", "red": "red2", "green": "green2", "teal": "teal2", "purple": "purple2", "yellow": "yellow2", "orange": "red", "pink": "red", "grey3": "grey", "white": "paper"}.get(col, "ink2")

# ── предметы ──
def table(c, x, y, w, top="wood3"):
    c.rect(x, y, w, 2, top); c.hl(x, y + 2, w, "wood2"); c.rect(x + 1, y + 3, 2, 9, "wood2"); c.rect(x + w - 3, y + 3, 2, 9, "wood2")

def mug(c, x, y, col="red", steam=True):
    c.rect(x, y, 3, 3, col); c.px(x + 3, y + 1, col); c.hl(x, y, 3, "white")
    if steam:
        o = bob(); c.px(x + 1 + o, y - 2, "grey3"); c.px(x + 2 - o, y - 3, "grey3"); c.px(x + 1 + o, y - 4, "grey3")

def bubble(c, x, y, w, h, icon=None, col="white", tail="l"):
    c.box(x, y, w, h, col, "ink")
    tx = x + 2 if tail == "l" else x + w - 4
    c.px(tx, y + h, "ink"); c.px(tx + 1, y + h, col); c.px(tx + 1, y + h + 1, "ink"); c.px(tx + 2, y + h, "ink")
    if icon: icon(c, x + 2, y + 2)

def dots(c, x, y):
    for i in range(3): c.px(x + i * 2, y + 1, "ink2")

QMARK = [".##.", "#..#", "...#", "..#.", "....", "..#."]
EXCL = ["#", "#", "#", ".", "#"]
HEART = [".#.#.", "#####", "#####", ".###.", "..#.."]
STAR = ["..#..", ".###.", "#####", ".#.#."]
NOTE = ["..##", "..#.", "..#.", "###.", "##.."]

def star(c, x, y, col, i=0):
    """Мерцающая звёздочка: в одном кадре из трёх она маленькая."""
    if (i + F()) % 3 == 0: c.sprite(x + 1, y + 1, [".#.", "###", ".#."], {"#": "white"})
    else: c.sprite(x, y, STAR, {"#": col})

def plant(c, x, y):
    c.rect(x, y + 6, 6, 4, "orange"); c.hl(x, y + 6, 6, "red"); c.rect(x + 1, y + 10, 4, 1, "red2")
    for (i, j, col) in [(2, 0, "green"), (1, 1, "green"), (3, 1, "green2"), (0, 2, "green"), (2, 2, "green2"), (4, 2, "green"), (1, 3, "green2"), (3, 3, "green"), (5, 3, "green2"), (2, 4, "green"), (0, 4, "green2"), (4, 4, "green2"), (2, 5, "green2")]:
        c.px(x + i, y + j, col)

def shelf(c, x, y, w, items):
    c.hl(x, y, w, "wood2"); c.hl(x, y + 1, w, "wood")
    px = x + 1
    for (h, col) in items:
        c.rect(px, y - h, 2, h, col); c.px(px, y - h, shade(col)); px += 3

def clock(c, x, y):
    c.disc(x + 4, y + 4, 4, "ink"); c.disc(x + 4, y + 4, 3, "white"); c.vl(x + 4, y + 2, 3, "ink")
    dx, dy = [(1, 0), (0, 1), (-1, 0), (0, -1)][F() % 4]
    c.px(x + 4 + dx, y + 4 + dy, "red"); c.px(x + 4 + 2 * dx, y + 4 + 2 * dy, "red")

def lamp(c, x, y, on=True):
    c.rect(x, y, 6, 3, "yellow2"); c.hl(x + 1, y, 4, "yellow"); c.vl(x + 3, y + 3, 6, "grey2"); c.rect(x + 1, y + 9, 5, 1, "grey2")
    if on:
        for k in range(1, 4): c.px(x - k, y + 3 + k, "lamp"); c.px(x + 5 + k, y + 3 + k, "lamp"); c.px(x + 3, y + 3 + k + 5, None)

def laptop(c, x, y, notif=False):
    c.box(x, y, 12, 8, "screen", "ink"); c.hl(x + 2, y + 2, 6, "white"); c.hl(x + 2, y + 4, 8, "teal2"); c.hl(x + 2, y + 5, 5, "teal2")
    c.rect(x - 1, y + 8, 14, 1, "grey"); c.hl(x - 1, y + 9, 14, "grey2")
    if notif and F() < 2: c.disc(x + 11, y, 2, "red"); c.px(x + 11, y, "white")

def phone(c, x, y, notif=0):
    c.box(x, y, 5, 8, "screen", "ink"); c.px(x + 2, y + 6, "white")
    for k in range(notif):
        if (F() + k) % 4 < 2: c.disc(x + 4 + k * 3, y - 2 - k * 2, 1, "red")

def sticky(c, x, y, col="yellow"):
    c.rect(x, y, 5, 5, col); c.hl(x + 1, y + 2, 3, shade(col)); c.px(x + 4, y + 4, shade(col))

def papers(c, x, y, n=3):
    for k in range(n):
        c.box(x + k * 2, y - k * 2, 9, 11, "white", "grey2")
        for j in range(3, 9, 2): c.hl(x + k * 2 + 2, y - k * 2 + j, 5, "grey3")

def waves(c, x, y, n=3, col="orange", d="r"):
    for k in range(min(n, 1 + F())):
        r = 3 + k * 3
        if d == "r": c.arc(x, y, r, -45, 46, col)
        else: c.arc(x, y, r, 135, 226, col)

def rays(c, cx, cy, r0, r1, col="yellow", n=8):
    for k in range(n):
        a = 2 * math.pi * k / n + F() * math.pi / n / 2
        for t in range(r0, r1): c.px(round(cx + t * math.cos(a)), round(cy + t * math.sin(a)), col)

def speaker(c, x, y):
    c.box(x, y, 7, 11, "grey2", "ink"); c.disc(x + 3, y + 7, 2, "ink"); c.disc(x + 3, y + 7, 1, "grey"); c.disc(x + 3, y + 3, 1, "ink")

def headphones(c, x, y):
    c.arc(x + 4, y + 3, 4, 180, 361, "ink"); c.rect(x - 1, y + 2, 2, 3, "red"); c.rect(x + 7, y + 2, 2, 3, "red")

def mask_face(c, x, y):
    c.sprite(x, y, [".#####.", "#######", "#.###.#", "#######", "#p###p#", "##r.r##", ".##r##.", "..###.."], {"#": "white", "p": "pink", "r": "red2"})
    c.rect(x + 3, y + 8, 1, 4, "wood2")

def battery(c, x, y, level, col=None):
    c.box(x, y, 12, 7, "white", "ink"); c.rect(x + 12, y + 2, 1, 3, "ink")
    n = max(0, min(4, level)); colr = col or ("red" if n <= 1 else "yellow2" if n == 2 else "green")
    for k in range(n): c.rect(x + 2 + k * 2, y + 2, 2, 3, colr)

def bed(c, x, y, w=30):
    c.rect(x, y, 2, 12, "wood2"); c.rect(x + w - 2, y + 4, 2, 8, "wood2")
    c.rect(x + 2, y + 5, w - 4, 4, "white"); c.rect(x + 2, y + 8, w - 4, 2, "wood"); c.rect(x + 3, y + 3, 7, 3, "paper")
    c.rect(x + 9, y + 4, w - 12, 4, "blue"); c.dither(x + 9, y + 4, w - 12, 1, "blue", "blue2")

def sofa(c, x, y, w=30, col="teal"):
    c.rect(x, y, w, 4, col); c.rect(x - 2, y + 3, w + 4, 6, col); c.hl(x - 2, y + 3, w + 4, shade(col))
    c.rect(x - 3, y + 2, 3, 7, shade(col)); c.rect(x + w, y + 2, 3, 7, shade(col)); c.rect(x, y + 9, 2, 2, "wood2"); c.rect(x + w - 2, y + 9, 2, 2, "wood2")

def chalkboard(c, x, y, w, h):
    c.box(x - 1, y - 1, w + 2, h + 2, "green2", "wood2"); c.rect(x, y, w, h, "green2")
    c.hl(x + 3, y + 3, 8, "white"); c.hl(x + 3, y + 6, 12, "paper"); c.hl(x + 3, y + 9, 6, "paper")
    c.sprite(x + w - 12, y + 3, ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"], {"#": "white"}); c.sprite(x + w - 6, y + 3, ["###", "..#", "###", "#..", "###"], {"#": "yellow"})
    c.hl(x, y + h + 1, w, "wood3"); c.rect(x + 4, y + h, 3, 1, "white")

def desk(c, x, y, w=14):
    c.rect(x, y, w, 2, "wood3"); c.hl(x, y + 2, w, "wood2"); c.rect(x + 1, y + 3, 1, 6, "grey2"); c.rect(x + w - 2, y + 3, 1, 6, "grey2")

def house(c, x, y, col="red"):
    c.rect(x + 1, y + 7, 14, 10, "paper"); c.vl(x + 1, y + 7, 10, "wall2")
    for k in range(8): c.hl(x + 7 - k, y + k, 2 + 2 * k, col)
    c.rect(x + 6, y + 11, 4, 6, "wood"); c.box(x + 2, y + 9, 3, 3, "glass", "ink2"); c.box(x + 11, y + 9, 3, 3, "glass", "ink2")

def office(c, x, y, h=26):
    c.rect(x, y, 16, h, "grey3"); c.vl(x, y, h, "grey")
    for j in range(y + 2, y + h - 3, 4):
        for i in range(x + 2, x + 14, 4): c.rect(i, j, 2, 2, "glass2")
    c.rect(x + 6, y + h - 4, 4, 4, "ink2")

def tree(c, x, y):
    c.disc(x + 4, y + 4, 4, "green2"); c.disc(x + 3, y + 3, 3, "green"); c.px(x + 2, y + 2, "green3"); c.rect(x + 3, y + 8, 2, 5, "wood2")

def mountain(c, x, y, w, h):
    for k in range(h):
        hw = int(w / 2 * k / h)
        c.hl(x + w // 2 - hw, y + k, hw * 2 + 1, "grey2" if k > h // 3 else "white")
        c.hl(x + w // 2 - hw, y + k, max(1, hw), "grey" if k > h // 3 else "grey3")

def flag(c, x, y, col="red"):
    c.vl(x, y, 9, "ink")
    if bob(): c.rect(x + 1, y, 5, 3, col); c.px(x + 6, y + 1, col)
    else: c.rect(x + 1, y + 1, 5, 3, col); c.px(x + 6, y + 1, col); c.px(x + 3, y, col)

def cake(c, x, y):
    c.rect(x, y + 4, 12, 6, "pink"); c.hl(x, y + 4, 12, "white"); c.dither(x, y + 5, 12, 1, "white", "pink"); c.hl(x, y + 7, 12, "wood3")
    c.vl(x + 6, y, 4, "yellow"); c.px(x + 6, y - 1, "orange"); c.rect(x - 1, y + 10, 14, 1, "grey3")

def frame(c, x, y, w, h, inner):
    c.box(x, y, w, h, "paper", "wood2"); c.rect(x + 1, y + 1, w - 2, h - 2, "sky3"); inner(c, x + 1, y + 1)

def blocks(c, x, y):
    for (i, j, col, ch) in [(0, 4, "red", "А"), (5, 4, "blue", "Б"), (2, 0, "yellow", "В")]:
        c.box(x + i, y + j, 5, 5, col, "ink")
        c.px(x + i + 2, y + j + 2, "white")

def magnifier(c, x, y):
    c.ring(x + 3, y + 3, 3, "ink"); c.disc(x + 3, y + 3, 2, "glass"); c.px(x + 2, y + 2, "white")
    for k in range(4): c.px(x + 6 + k, y + 6 + k, "wood2"); c.px(x + 7 + k, y + 6 + k, "wood2")

def puzzle(c, x, y, col="purple"):
    c.rect(x, y, 6, 6, col); c.rect(x + 2, y - 1, 2, 1, col); c.rect(x + 6, y + 2, 1, 2, col); c.hl(x, y + 5, 6, shade(col))

def calendar(c, x, y):
    c.box(x, y, 11, 10, "white", "ink"); c.rect(x + 1, y + 1, 9, 2, "red")
    for j in range(4, 9, 2):
        for i in range(2, 10, 2): c.px(x + i, y + j, "grey2")
    c.px(x + 4, y + 6, "red"); c.ring(x + 4, y + 6, 1, "red")

def train_toy(c, x, y):
    c.rect(x, y, 7, 4, "red"); c.rect(x + 4, y - 3, 3, 3, "red2"); c.rect(x + 1, y - 2, 1, 2, "ink"); c.rect(x + 8, y + 1, 5, 3, "blue"); c.px(x + 7, y + 2, "ink")
    for i in (1, 5, 9, 11): c.px(x + i, y + 4, "ink")

def storm(c, x, y):
    c.rect(x + 1, y, 8, 3, "grey2"); c.rect(x, y + 1, 10, 2, "grey2"); c.rect(x + 3, y - 1, 3, 1, "grey2")
    if F() in (1, 2): c.sprite(x + 4, y + 3, [".#", "#.", "##", ".#", "#."], {"#": "yellow"})

def kettle(c, x, y):
    c.rect(x + 1, y + 2, 7, 6, "metal"); c.hl(x + 2, y + 1, 5, "metal"); c.hl(x + 1, y + 7, 7, "grey2"); c.rect(x - 1, y + 3, 2, 1, "metal"); c.px(x + 8, y + 3, "ink"); c.px(x + 9, y + 4, "ink"); c.px(x + 9, y + 5, "ink")

def steam(c, x, y):
    for k in range(3): o = (k + F()) % 2; c.px(x - k - o, y - k * 2, "white"); c.px(x - 1 - k + o, y - 1 - k * 2, "grey3")

def cup_tea(c, x, y):
    c.rect(x, y, 6, 4, "white"); c.hl(x + 1, y, 4, "wood3"); c.rect(x + 6, y + 1, 1, 2, "white"); c.hl(x - 1, y + 4, 8, "grey3")
    for k in range(3): c.px(x + 2 + ((k + F()) % 2), y - 2 - k, "grey3")

def stethoscope_doc(c, x, y):
    person(c, x, y, hair="hair3", shirt="white", pants="blue2", face="l")
    c.arc(x + 4, y + 10, 2, 0, 181, "grey2"); c.px(x + 4, y + 13, "grey2")

def runner(c, x, y, shirt="orange"):
    c.rect(x + 1, y + 1, 6, 6, "skin"); c.rect(x + 1, y, 6, 2, "hair2"); c.px(x + 5, y + 3, "ink"); c.px(x + 6, y + 5, "red2")
    c.rect(x + 1, y + 8, 7, 7, shirt); c.rect(x + 8, y + 9, 3, 1, shirt); c.px(x + 11, y + 8, "skin"); c.rect(x - 2, y + 11, 3, 1, shirt); c.px(x - 3, y + 12, "skin")
    c.rect(x + 2, y + 15, 3, 3, "ink2"); c.rect(x + 5, y + 15, 3, 2, "ink2"); c.rect(x + 7, y + 17, 3, 1, "ink2"); c.rect(x - 1, y + 18, 4, 1, "ink"); c.rect(x + 9, y + 17, 2, 1, "ink")
    for k in range(3): c.hl(x - 8 - (k + F()) % 3, y + 6 + k * 4, 5, "grey3")

def bars(c, x, y, vals, cols):
    for k, (v, col) in enumerate(zip(vals, cols)):
        c.rect(x + k * 5, y - v, 3, v, col); c.px(x + k * 5, y - v, shade(col))

# ── сцены ──
S = {}
def scene(name):
    def deco(f): S[name] = f; return f
    return deco

P = lambda c, x, y, **k: (shadow(c, x + 4, y + 22, 10), ol(c, person, x, y, **k))          # стоящий человек с тенью
PS = lambda c, x, y, **k: ol(c, person, x, y, pose="sit", **k)                                # сидящий
K = lambda c, x, y, **k: (shadow(c, x + 3, y + 16, 8), ol(c, child, x, y, **k))

@scene("social")
def _(c):
    room(c, "wallb", "wallb2"); window(c, 8, 6, 22, 16); light(c, 14, 46, 18, 10)
    picture(c, 50, 8, 14, 10, "sea"); lamp(c, 96, 4)
    rug(c, 30, 54, 60, "red"); shadow(c, 60, 49, 44)
    ol(c, chair, 22, 36, "r"); ol(c, chair, 89, 36, "l")
    PS(c, 26, 20, hair="hair2", shirt="green", face="r", hair_style="long")
    PS(c, 86, 20, hair="hair3", shirt="purple", face="l")
    ol(c, table, 38, 36, 44); mug(c, 46, 33, "red"); mug(c, 72, 33, "teal", steam=False); c.rect(56, 34, 6, 2, "yellow"); c.hl(56, 34, 6, "white")
    ol(c, bubble, 34, 6, 18, 9, lambda c, x, y: dots(c, x + 4, y + 1), tail="l")
    ol(c, bubble, 70, 4, 11, 11, lambda c, x, y: c.sprite(x + 2, y + 0, QMARK, {"#": "blue2"}), "yellow", tail="r")
    ol(c, plant, 108, 33)

@scene("imag")
def _(c):
    room(c, "wallg", "wallg2"); window(c, 92, 6, 20, 15); light(c, 96, 46, 16, 10)
    shelf(c, 34, 12, 28, [(6, "red"), (7, "blue"), (5, "green"), (7, "purple"), (6, "orange"), (8, "teal")])
    shadow(c, 54, 50, 62); ol(c, desk, 22, 38, 64)
    papers(c, 28, 27, 2)
    c.box(48, 28, 20, 10, "white", "grey2")
    for i in range(6):
        for j in range(3): c.px(50 + i * 3, 30 + j * 2, ["red", "blue", "yellow"][(i + j) % 3])
    c.px(59, 34, "ink"); c.ring(59, 34, 2, "red")
    ol(c, magnifier, 62, 22); puzzle(c, 74, 32, "purple"); puzzle(c, 80, 33, "teal")
    P(c, 8, 22, hair="hair1", shirt="yellow", face="r", pose="hold")
    ol(c, bubble, 18, 6, 12, 10, lambda c, x, y: c.sprite(x + 1, y + 1, STAR, {"#": "yellow2"}), tail="l")

@scene("routine")
def _(c):
    room(c, "wall", "wall2"); ol(c, calendar, 10, 8); ol(c, clock, 28, 8)
    shelf(c, 62, 16, 46, [(7, "red"), (7, "red"), (7, "red"), (7, "blue"), (7, "blue"), (7, "blue"), (7, "green"), (7, "green"), (7, "green"), (7, "yellow"), (7, "yellow"), (7, "yellow"), (7, "purple"), (7, "purple"), (7, "purple")])
    shelf(c, 62, 30, 46, []); ol(c, train_toy, 66, 26); ol(c, train_toy, 86, 26)
    rug(c, 8, 52, 40, "teal")
    P(c, 26, 22, hair="hair3", shirt="teal", face="r", pose="hold")
    c.box(35, 29, 6, 5, "red", "ink"); c.hl(36, 30, 4, "white")
    for k in range(5): c.rect(58 + k * 9, 53, 5, 2, "paper"); c.hl(58 + k * 9, 55, 5, "wood2")

@scene("sensory")
def _(c):
    sky_out(c, 40); ol(c, office, 4, 14, 26); ol(c, office, 98, 10, 30); ol(c, tree, 86, 27)
    c.rect(0, 52, W, 8, "grey"); c.hl(0, 52, W, "grey2")
    for x in range(2, W, 10): c.hl(x, 55, 5, "white")
    rays(c, 74, 8, 5, 11, "yellow", 12); ol(c, lambda c: c.disc(74, 8, 4, "yellow")); c.disc(73, 7, 1, "lamp")
    shadow(c, 23, 46, 10); ol(c, speaker, 20, 34); waves(c, 27, 39, 3, "orange")
    P(c, 50, 24, hair="hair2", shirt="red", face="l", mouth="flat", hair_style="long")
    headphones(c, 50, 23)
    c.sprite(64, 18, EXCL, {"#": "red2"}); c.sprite(38, 18 - bob(), NOTE, {"#": "purple"}); c.sprite(34, 26 - bob(1), NOTE, {"#": "blue2"})

@scene("camo")
def _(c):
    room(c, "wallb", "wallb2"); rug(c, 4, 52, 56, "purple")
    ol(c, lambda c: (c.box(76, 8, 20, 32, "glass", "wood2"), c.dither(78, 10, 16, 28, "glass", "glass2")))
    for k in range(4): c.px(80 + k, 12 + k, "white")
    ol(c, person, 82, 18, hair="hair1", shirt="green", face="f", mouth="flat")
    P(c, 34, 22, hair="hair1", shirt="green", face="r", pose="hold")
    ol(c, mask_face, 44, 22)
    P(c, 10, 22, hair="hair4", shirt="pink", face="r", pose="wave", hair_style="bun")
    ol(c, bubble, 18, 6, 12, 10, lambda c, x, y: c.sprite(x + 2, y + 1, HEART, {"#": "red"}), tail="l")

@scene("attention")
def _(c):
    room(c, "wall", "wall2"); window(c, 92, 6, 20, 15); light(c, 96, 46, 16, 10)
    for (x, y, col) in [(10, 8, "yellow"), (17, 6, "pink"), (24, 10, "green3"), (12, 15, "orange"), (30, 7, "yellow"), (21, 16, "glass")]: sticky(c, x, y, col)
    ol(c, clock, 46, 6)
    shadow(c, 46, 50, 66); ol(c, chair, 70, 36, "l")
    PS(c, 66, 20, hair="hair2", shirt="blue", face="l", mouth="o")
    ol(c, desk, 14, 38, 64); laptop(c, 40, 29, notif=True); papers(c, 18, 28, 3); phone(c, 58, 31, 2); mug(c, 32, 35, "teal")
    c.sprite(72, 9 - bob(), QMARK, {"#": "red"})

@scene("activity")
def _(c):
    sky_out(c, 42); ol(c, tree, 8, 30); ol(c, tree, 104, 28); ol(c, house, 76, 26, "blue")
    c.rect(0, 50, W, 10, "paper"); c.dither(0, 50, W, 1, "paper", "wall2")
    shadow(c, 45, 49, 12); ol(c, runner, 40, 30, "orange"); ol(c, clock, 56, 8)
    c.sprite(20, 14, ["#.#", ".#.", "#.#"], {"#": "yellow"})
    for (x, y) in [(28, 36), (24, 40)]: c.hl(x, y, 6, "white")

@scene("exec")
def _(c):
    room(c, "wallg", "wallg2"); window(c, 6, 6, 20, 15)
    shadow(c, 97, 47, 28); ol(c, table, 84, 34, 26); ol(c, kettle, 94, 25); steam(c, 92, 26)
    P(c, 30, 22, hair="hair3", shirt="red", face="r", mouth="o")
    ol(c, storm, 28, 7)
    P(c, 58, 22, hair="hair2", shirt="yellow", face="l", pose="cheer", hair_style="long")
    for i, (x, y) in enumerate([(52, 10), (70, 8), (62, 3)]): star(c, x, y, "yellow2", i)

@scene("life")
def _(c):
    sky_out(c, 36); ol(c, house, 6, 20, "red"); ol(c, office, 98, 10, 27); ol(c, tree, 30, 22); ol(c, tree, 80, 24)
    for x in range(0, W):
        y = 46 + int(3 * math.sin(x / 14)); c.rect(x, y, 1, 4, "paper"); c.px(x, y + 4, "wall2")
    P(c, 50, 24, hair="hair1", shirt="purple", face="r")
    P(c, 62, 24, hair="hair4", shirt="teal", face="l", hair_style="long")
    ol(c, bubble, 54, 7, 12, 10, lambda c, x, y: c.sprite(x + 1, y + 1, HEART, {"#": "red"}), tail="l")

@scene("history")
def _(c):
    room(c, "wall", "wall2"); window(c, 94, 6, 20, 15); light(c, 98, 46, 14, 10)
    def fam(c, x, y):
        c.rect(x, y + 10, 20, 3, "green3")
        for (dx, col, h) in [(1, "blue", 8), (6, "red", 9), (11, "yellow", 5), (16, "teal", 6)]:
            c.rect(x + dx, y + 10 - h, 3, h, col); c.rect(x + dx, y + 8 - h, 3, 3, "skin"); c.hl(x + dx, y + 8 - h, 3, "hair1")
    frame(c, 12, 5, 24, 16, fam)
    frame(c, 42, 8, 14, 12, lambda c, x, y: (c.disc(x + 6, y + 5, 4, "yellow"), c.px(x + 5, y + 4, "ink"), c.px(x + 7, y + 4, "ink"), c.px(x + 6, y + 7, "red2")))
    rug(c, 52, 53, 40, "red")
    ol(c, sofa, 14, 38, 34, "teal")
    PS(c, 20, 26, hair="hair1", shirt="purple", face="r")
    K(c, 74, 38, hair="hair2", shirt="red", face="l"); ol(c, blocks, 60, 45)
    c.sprite(84, 30, ["#.#", ".#.", "#.#"], {"#": "yellow2"})

@scene("mood")
def _(c):
    room(c, "wallb", "wallb2"); window(c, 70, 6, 30, 22, rain=True)
    rug(c, 6, 53, 54, "purple"); ol(c, sofa, 14, 38, 38, "purple")
    PS(c, 26, 26, hair="hair3", shirt="grey3", face="r", mouth="flat")
    ol(c, cup_tea, 62, 44); ol(c, plant, 106, 33)

@scene("emo")
def _(c):
    room(c, "wallg", "wallg2")
    P(c, 56, 22, hair="hair4", shirt="teal", face="f", mouth="flat", hair_style="long")
    for (x, y, col) in [(28, 8, "red"), (40, 2, "yellow"), (76, 4, "blue"), (88, 12, "purple"), (22, 22, "orange"), (94, 26, "green")]:
        ol(c, lambda c, x=x, y=y - bob(x), col=col: (c.disc(x, y + 4, 4, col), c.disc(x - 1, y + 3, 1, "white")))
    c.sprite(58, 6 - bob(), QMARK, {"#": "ink2"})
    ol(c, plant, 8, 33); ol(c, plant, 106, 33)

@scene("burnout")
def _(c):
    room(c, "wallb", "wallb2"); window(c, 84, 6, 24, 16, night=True)
    shadow(c, 45, 47, 50); ol(c, bed, 20, 34, 50)
    c.rect(24, 35, 6, 4, "skin"); c.rect(24, 34, 6, 2, "hair1"); c.px(28, 37, "ink2")
    ol(c, battery, 40, 14, 1 if F() % 2 == 0 else 0); c.sprite(57, 15, ["#..#", ".##.", ".##.", "#..#"], {"#": "red"})
    ol(c, phone, 80, 46); ol(c, lamp, 6, 32, on=False)

@scene("wellbeing")
def _(c):
    room(c, "night1", "night2", floor="wood2", floor2="ink2"); window(c, 70, 6, 28, 18, night=True)
    shadow(c, 38, 47, 52); ol(c, bed, 12, 34, 52); c.rect(16, 35, 6, 4, "skin"); c.rect(16, 34, 6, 2, "hair2")
    for k, (x, y) in enumerate([(30, 14), (36, 9), (43, 4)]): c.sprite(x, y - bob(k), ["####", "..#.", ".#..", "####"], {"#": "white"})
    ol(c, clock, 104, 30)

@scene("health")
def _(c):
    room(c, "white", "paper", floor="grey3", floor2="grey")
    ol(c, lambda c: (c.box(14, 8, 16, 16, "white", "grey2"), c.rect(20, 11, 4, 10, "red"), c.rect(17, 14, 10, 4, "red")))
    shadow(c, 70, 49, 40); ol(c, desk, 50, 38, 40)
    c.box(62, 32, 8, 6, "white", "grey2"); c.hl(63, 34, 6, "red"); bars(c, 74, 37, [3, 5, 2], ["teal", "blue", "purple"])
    shadow(c, 96, 44, 10); ol(c, stethoscope_doc, 92, 22)
    P(c, 34, 22, hair="hair1", shirt="green", face="r")
    c.sprite(44, 8, HEART, {"#": "red"})

@scene("strengths")
def _(c):
    sky_out(c, 50); mountain(c, -10, 28, 50, 26); mountain(c, 80, 26, 50, 28); mountain(c, 20, 14, 80, 40)
    ol(c, person, 56, 0, hair="hair2", shirt="red", face="f", pose="cheer")
    ol(c, flag, 68, 4, "yellow")
    for i, (x, y) in enumerate([(14, 6), (100, 4), (34, 2), (88, 14)]): star(c, x, y, "yellow", i)

@scene("school")
def _(c):
    room(c, "wallg", "wallg2"); chalkboard(c, 30, 6, 46, 20); window(c, 94, 6, 18, 18); light(c, 98, 46, 14, 10); ol(c, clock, 10, 6)
    K(c, 20, 30, hair="hair2", shirt="blue", face="r"); K(c, 72, 30, hair="hair3", shirt="yellow", face="l")
    ol(c, desk, 14, 40, 18); ol(c, desk, 66, 40, 18)
    ol(c, lambda c: (c.box(42, 36, 10, 8, "red", "ink"), c.hl(43, 38, 8, "yellow"), c.rect(46, 35, 2, 1, "ink")))
    c.rect(18, 39, 5, 1, "white"); c.rect(70, 39, 5, 1, "white")

@scene("practice")
def _(c):
    room(c, "wall", "wall2"); window(c, 8, 6, 22, 16); light(c, 14, 46, 18, 10)
    shadow(c, 60, 49, 44); ol(c, table, 40, 36, 40); ol(c, cake, 54, 25)
    P(c, 88, 22, hair="hair4", shirt="pink", face="l", hair_style="bun")
    ol(c, bubble, 96, 4, 12, 10, lambda c, x, y: c.sprite(x + 1, y + 1, HEART, {"#": "red"}), tail="l")
    ol(c, plant, 108, 33)

@scene("break")
def _(c):
    room(c, "wallg", "wallg2"); window(c, 70, 6, 30, 22); light(c, 74, 46, 26, 10)
    rug(c, 6, 53, 54, "yellow"); ol(c, sofa, 14, 38, 38, "teal")
    PS(c, 26, 26, hair="hair1", shirt="yellow", face="r")
    ol(c, cup_tea, 62, 44); ol(c, plant, 106, 33); c.sprite(40, 14 - bob(), NOTE, {"#": "purple"})

@scene("energy")
def _(c):
    room(c, "wall", "wall2")
    ol(c, battery, 12, 10, 1); c.sprite(29, 11, ["..#..", "..##.", "#####", "..##.", "..#.."], {"#": "ink2"}); ol(c, battery, 38, 10, 1 + F())
    rug(c, 6, 53, 46, "purple"); ol(c, sofa, 14, 38, 30, "purple")
    P(c, 72, 22, hair="hair3", shirt="green", face="l", pose="hold"); ol(c, lambda c: c.box(66, 29, 6, 6, "yellow", "ink"))
    for i, (x, y) in enumerate([(86, 8), (96, 14)]): star(c, x, y, "yellow2", i)

@scene("masks")
def _(c):
    room(c, "wallb", "wallb2")
    ol(c, house, 8, 4, "red"); ol(c, office, 32, 4, 17)
    ol(c, lambda c: (c.box(76, 6, 18, 12, "sky3", "wood2"), tree(c, 80, 7)))
    ol(c, lambda c: (c.box(98, 6, 18, 12, "night2", "wood2"), c.px(101, 9, "white"), c.px(110, 11, "white"), c.disc(106, 12, 2, "yellow")))
    P(c, 50, 22, hair="hair1", shirt="teal", face="r", pose="hold"); ol(c, mask_face, 60, 22)
    rug(c, 30, 53, 60, "teal")

THEME_NAMES = ["default", "space", "trains", "ocean"]
FRAMES = 4

def render(name, theme="default", f=0):
    G["theme"], G["f"] = theme, f
    c = C(); S[name](c); G["theme"], G["f"] = "default", 0
    return c

def b64(im):
    b = io.BytesIO(); im.save(b, "PNG", optimize=True); return base64.b64encode(b.getvalue()).decode()

def anim_strip(name, theme):
    """Полоса FRAMES×W: в кадре k только пиксели, которые отличаются от кадра 0. None, если сцена не меняется."""
    fr = [render(name, theme, f).im.convert("RGB") for f in range(FRAMES)]
    strip = Image.new("RGBA", (W * FRAMES, H), (0, 0, 0, 0)); sp = strip.load(); changed = False
    p0 = fr[0].load()
    diff = set()
    for k in range(1, FRAMES):
        pk = fr[k].load()
        for x in range(W):
            for y in range(H):
                if pk[x, y] != p0[x, y]: diff.add((x, y))
    if not diff: return None
    for k in range(FRAMES):
        pk = fr[k].load()
        for (x, y) in diff: sp[k * W + x, y] = pk[x, y] + (255,)
    return strip

if __name__ == "__main__":
    root = pathlib.Path(__file__).resolve().parent.parent
    base, anim = {}, {}
    for th in THEME_NAMES:
        base[th] = {n: b64(render(n, th).im.convert("RGB")) for n in S}
        anim[th] = {}
        for n in S:
            st = anim_strip(n, th)
            if st is not None: anim[th][n] = b64(st)
    js = "// Пиксельные картинки ND-Screen (120×60, 4 темы, анимация 4 кадра). Сгенерировано tools/pixelart.py, руками не править.\nwindow.ND = window.ND || {};\n"
    js += f"ND.PIXFRAMES = {FRAMES};\n"
    for var, data in (("PIXELS", base), ("PIXANIM", anim)):
        js += f"ND.{var} = {{\n"
        for th, d in data.items():
            js += f"  {th}: {{\n" + "".join(f'    {n}: "data:image/png;base64,{b}",\n' for n, b in d.items()) + "  },\n"
        js += "};\n"
    (root / "src" / "pixels.js").write_text(js, encoding="utf-8")
    if "--sheet" in sys.argv:
        out = sys.argv[sys.argv.index("--sheet") + 1]; names = list(S); sc = 3
        ths = [a for a in sys.argv if a.startswith("--theme=")]
        ths = [ths[0][8:]] if ths else THEME_NAMES
        for th in ths:
            cols = 4
            sheet = Image.new("RGB", (cols * (W * sc + 6), ((len(names) + cols - 1) // cols) * (H * sc + 6)), (30, 30, 30))
            for k, n in enumerate(names):
                im = render(n, th).im.resize((W * sc, H * sc), Image.NEAREST)
                sheet.paste(im, ((k % cols) * (W * sc + 6), (k // cols) * (H * sc + 6)))
            sheet.save(out.replace(".png", f"-{th}.png"))
        if "--frames" in sys.argv:
            n = sys.argv[sys.argv.index("--frames") + 1]
            fs = Image.new("RGB", (FRAMES * (W * 4 + 6), len(THEME_NAMES) * (H * 4 + 6)), (30, 30, 30))
            for j, th in enumerate(THEME_NAMES):
                for f in range(FRAMES):
                    fs.paste(render(n, th, f).im.resize((W * 4, H * 4), Image.NEAREST), (f * (W * 4 + 6), j * (H * 4 + 6)))
            fs.save(out.replace(".png", f"-frames-{n}.png"))
    tot = sum(len(b) for d in base.values() for b in d.values()) + sum(len(b) for d in anim.values() for b in d.values())
    print(len(S), "сцен ×", len(THEME_NAMES), "тем; анимированных:", {th: len(d) for th, d in anim.items()}, tot // 1024, "КБ base64")
