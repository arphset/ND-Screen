// Н15. «Мой спрайт»: пиксельный персонаж 32×32, которого человек собирает сам.
// Аксессуары подсказываются по ответам (без слов «РАС» и «СДВГ»), каждый можно убрать или добавить.
// grid() — чистая функция (тестируется), draw() рисует на canvas в браузере.
window.ND = window.ND || {};

ND.sprite = (function () {
  const N = 32;
  const SKIN = [[242, 196, 160], [222, 170, 132], [176, 118, 84], [120, 80, 56]];
  const HAIR = [[70, 46, 34], [196, 110, 50], [40, 36, 44], [230, 196, 110], [150, 150, 162], [140, 100, 180], [76, 140, 206]];
  const SHIRT = [[76, 120, 196], [214, 78, 78], [104, 176, 98], [246, 206, 92], [140, 100, 180], [70, 160, 160], [236, 150, 170], [60, 56, 84]];
  const STYLES = [["short", "Короткие"], ["long", "Длинные"], ["bun", "Пучок"], ["curly", "Кудри"], ["none", "Без волос"]];
  const ACC = [
    ["headphones", "Наушники"], ["notes", "Стикеры-напоминалки"], ["books", "Стопка книг"],
    ["magnifier", "Лупа"], ["sparkles", "Искры идей"], ["mask", "Маска в руке"], ["glasses", "Очки"], ["cat", "Кот"],
  ];
  const INK = [34, 32, 52], WHITE = [247, 244, 236], PINK = [236, 150, 170], PANTS = [52, 60, 92], SHOE = [60, 46, 40];
  const shade = (c, k = 0.78) => c.map((v) => Math.min(255, Math.round(v * k)));
  const DEFAULT = { skin: 0, hair: 0, style: "short", shirt: 0, acc: null };

  // какие аксессуары подсказать по ответам; why — простыми словами, без диагнозов
  function suggest(E) {
    const P = ND.PARAMS, out = [];
    const cs = (c) => (E.constructs[c] && E.constructs[c].now.n ? E.constructs[c].now.s : 0);
    const st = (k) => (E.strengths.find((x) => x.key === k) || {}).s || 0;
    const a1 = Object.keys(ND.ADHD_SYMPTOMS).filter((s) => s.startsWith("A1")).map((s) => E.symptoms[s].now).filter((x) => x.status !== ND.ST.NODATA).map((x) => x.s);
    const inatt = a1.length ? a1.reduce((x, y) => x + y, 0) / a1.length : 0;
    if (cs("ASD.B4") >= P.thetaLo) out.push(["headphones", "звуки и шум ощущаются сильнее"]);
    if (inatt >= P.thetaLo) out.push(["notes", "напоминалки помогают удерживать дела"]);
    if (cs("ASD.B3") >= P.thetaLo || st("deep") >= P.thetaLo) out.push(["books", "глубокие увлечения"]);
    if (cs("DETAIL") >= P.thetaLo || st("detail") >= P.thetaLo) out.push(["magnifier", "внимание к деталям"]);
    if (st("creative") >= P.thetaLo || st("energy") >= P.thetaLo) out.push(["sparkles", "идеи и энергия"]);
    if (cs("CAMO") >= P.thetaLo) out.push(["mask", "часто приходится подстраиваться"]);
    return out;
  }

  function grid(look) {
    const L = { ...DEFAULT, ...(look || {}) };
    const acc = new Set(L.acc || []);
    const g = Array.from({ length: N }, () => Array(N).fill(null));
    const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N && c) g[y][x] = c; };
    const rect = (x, y, w, h, c) => { for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) px(i, j, c); };
    const skin = SKIN[L.skin] || SKIN[0], hair = HAIR[L.hair] || HAIR[0], shirt = SHIRT[L.shirt] || SHIRT[0];
    const body = [];  // слой персонажа, обводится контуром
    // длинные волосы сзади, за телом
    if (L.style === "long") { rect(8, 8, 3, 13, hair); rect(21, 8, 3, 13, hair); rect(8, 20, 3, 1, shade(hair)); rect(21, 20, 3, 1, shade(hair)); }
    if (L.style === "bun") { rect(14, 1, 4, 3, hair); rect(13, 2, 6, 1, hair); px(15, 1, shade(hair, 1.15)); }
    // голова со скруглёнными углами
    rect(9, 4, 14, 13, skin); for (const [x, y] of [[9, 4], [22, 4], [9, 16], [22, 16]]) g[y][x] = null;
    rect(9, 15, 14, 2, null); rect(10, 15, 12, 1, skin); rect(11, 16, 10, 1, skin);
    // глаза, румянец, рот
    rect(12, 10, 2, 2, INK); rect(19, 10, 2, 2, INK); px(12, 10, WHITE); px(19, 10, WHITE);
    px(11, 13, PINK); px(21, 13, PINK); rect(15, 13, 3, 1, shade(skin, 0.6));
    // волосы
    if (L.style !== "none") {
      rect(9, 4, 14, 3, hair); rect(10, 3, 12, 1, hair); rect(9, 7, 2, 3, hair); rect(21, 7, 2, 3, hair);
      px(12, 7, hair); px(13, 7, hair); px(16, 7, hair); px(17, 7, hair); px(18, 7, hair); px(20, 7, hair);
      rect(11, 3, 5, 1, shade(hair, 1.12));
      if (L.style === "curly") { for (let x = 8; x <= 23; x += 2) { px(x, 3, hair); px(x + 1, 2, hair); } rect(8, 5, 1, 6, hair); rect(23, 5, 1, 6, hair); px(8, 11, hair); px(23, 11, hair); }
      if (L.style === "long") { rect(9, 7, 2, 9, hair); rect(21, 7, 2, 9, hair); }
    }
    if (acc.has("glasses")) { for (const x0 of [11, 18]) { rect(x0, 9, 4, 1, INK); rect(x0, 12, 4, 1, INK); px(x0, 10, INK); px(x0, 11, INK); px(x0 + 3, 10, INK); px(x0 + 3, 11, INK); } rect(15, 10, 3, 1, INK); }
    // туловище, руки, ноги
    rect(11, 17, 10, 8, shirt); rect(11, 17, 10, 1, shade(shirt, 1.12)); rect(15, 17, 2, 2, shade(shirt));
    rect(9, 18, 2, 6, shirt); rect(21, 18, 2, 6, shirt); rect(11, 19, 1, 5, shade(shirt)); rect(20, 19, 1, 5, shade(shirt)); rect(9, 24, 2, 1, skin); rect(21, 24, 2, 1, skin);
    rect(11, 25, 10, 4, PANTS); rect(15, 27, 2, 2, null);
    rect(11, 29, 4, 2, SHOE); rect(17, 29, 4, 2, SHOE);
    if (acc.has("headphones")) { rect(9, 2, 14, 1, [110, 110, 126]); px(8, 3, [110, 110, 126]); px(23, 3, [110, 110, 126]); rect(7, 8, 3, 6, [214, 78, 78]); rect(22, 8, 3, 6, [214, 78, 78]); rect(7, 4, 1, 4, [110, 110, 126]); rect(24, 4, 1, 4, [110, 110, 126]); }
    // контур вокруг персонажа
    const solid = g.map((r) => r.map((c) => !!c));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (solid[y][x]) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => solid[y + dy] && solid[y + dy][x + dx])) body.push([x, y]);
    }
    for (const [x, y] of body) g[y][x] = INK;
    // предметы рядом с персонажем (у каждого свой контур)
    const item = (fn) => {
      const t = Array.from({ length: N }, () => Array(N).fill(null));
      fn((x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) t[y][x] = c; });
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (t[y][x]) { g[y][x] = t[y][x]; continue; }
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => t[y + dy] && t[y + dy][x + dx]) && !g[y][x]) g[y][x] = INK;
      }
    };
    const R = (p, x, y, w, h, c) => { for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) p(i, j, c); };
    if (acc.has("notes")) item((p) => { R(p, 1, 2, 5, 5, [246, 206, 92]); R(p, 2, 4, 3, 1, [222, 170, 60]); R(p, 3, 8, 4, 4, PINK); p(4, 10, [200, 110, 130]); p(5, 10, [200, 110, 130]); });
    if (acc.has("books")) item((p) => { R(p, 24, 28, 7, 2, [76, 120, 196]); R(p, 25, 26, 6, 2, [104, 176, 98]); R(p, 24, 24, 6, 2, [214, 78, 78]); p(30, 29, WHITE); p(30, 27, WHITE); p(29, 25, WHITE); });
    if (acc.has("magnifier")) item((p) => { for (let a = 0; a < 360; a += 20) p(Math.round(27 + 2.6 * Math.cos(a * Math.PI / 180)), Math.round(18 + 2.6 * Math.sin(a * Math.PI / 180)), [156, 98, 62]); R(p, 26, 17, 3, 3, [170, 214, 236]); p(26, 17, WHITE); p(25, 21, [120, 72, 46]); p(24, 22, [120, 72, 46]); p(23, 23, [120, 72, 46]); });
    if (acc.has("mask")) item((p) => { R(p, 2, 17, 6, 6, WHITE); p(2, 17, null); p(7, 17, null); p(2, 22, null); p(7, 22, null); p(3, 19, INK); p(6, 19, INK); p(2, 20, PINK); p(7, 20, PINK); p(3, 21, INK); p(4, 22, INK); p(5, 22, INK); p(6, 21, INK); R(p, 4, 23, 1, 2, [156, 98, 62]); });
    if (acc.has("cat")) item((p) => { R(p, 24, 26, 6, 4, [238, 146, 70]); R(p, 25, 24, 4, 2, [238, 146, 70]); p(25, 23, [238, 146, 70]); p(28, 23, [238, 146, 70]); p(26, 25, INK); p(27, 25, INK); p(30, 25, [238, 146, 70]); p(30, 24, [238, 146, 70]); p(31, 23, [238, 146, 70]); p(25, 28, [200, 110, 50]); p(27, 28, [200, 110, 50]); });
    if (acc.has("sparkles")) for (const [x, y] of [[3, 13], [27, 3], [28, 10]]) { const Y = [246, 206, 92]; g[y][x] = WHITE; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g[y + dy][x + dx] = Y; }
    return g;
  }

  // canvas: прозрачный фон или картинка-фон (Image) под персонажем
  function draw(canvas, look, scale = 8, bg = null) {
    const g = grid(look);
    canvas.width = N * scale; canvas.height = N * scale;
    const c = canvas.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, canvas.width, canvas.height);
    if (bg) c.drawImage(bg, 0, 0, canvas.width, canvas.height);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const p = g[y][x]; if (!p) continue;
      c.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; c.fillRect(x * scale, y * scale, scale, scale);
    }
    return canvas;
  }
  function dataURL(look, scale = 4) {
    if (typeof document === "undefined") return "";
    return draw(document.createElement("canvas"), look, scale).toDataURL("image/png");
  }
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  return { N, SKIN, HAIR, SHIRT, STYLES, ACC, DEFAULT, suggest, grid, draw, dataURL, rgb };
})();
