// «Лаборатория»: необязательные мини-эксперименты. Чистые функции без DOM.
// Ничего отсюда не входит в баллы, критерии, индексы и проверку согласованности: результаты показываются отдельно и помечены как экспериментальные.
window.ND = window.ND || {};

ND.lab = (function () {
  // ───────── Н9. «Где были ваши мысли?» (пробы блуждания мыслей) ─────────
  // Короткий вопрос появляется несколько раз за анкету, в случайный момент внутри раздела, а не на границе разделов.
  // Методика проб с вопросом «о чём вы думали только что» используется в исследованиях блуждания мыслей
  // (Seli et al., 2015; Killingsworth & Gilbert, 2010). Пороги — число отвеченных вопросов основной части.
  const PROBE_SECS = ["social", "imag", "routine", "sensory", "camo", "attention", "activity", "exec", "life"];
  const PROBE_N = 6;
  // детерминированный генератор, чтобы расписание не менялось после перезагрузки страницы
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function probeSchedule(seed, total) {
    // total — сколько вопросов основной части открыто сейчас; пробы равномерно по анкете с разбросом ±35% шага
    const r = rng(seed), step = total / (PROBE_N + 1), out = [];
    for (let k = 1; k <= PROBE_N; k++) out.push(Math.max(4, Math.round(k * step + (r() - 0.5) * 0.7 * step)));
    return out.sort((a, b) => a - b).filter((x, i, a) => i === 0 || x > a[i - 1]);
  }
  const PROBE_OPTS = [
    ["task", "На вопросе"],
    ["other", "О чём-то другом"],
    ["blank", "Ни о чём, в голове пусто"],
    ["unsure", "Не могу сказать"],
  ];
  const PROBE_HOW = [["spont", "Само, я не собирался(-ась)"], ["delib", "Сознательно, решил(а) подумать о другом"]];
  function probeSummary(list) {
    const xs = (list || []).filter((p) => p && ["task", "other", "blank", "unsure"].includes(p.a));
    const rated = xs.filter((p) => p.a !== "unsure");
    const off = rated.filter((p) => p.a === "other" || p.a === "blank");
    const share = (a) => (a.length ? a.filter((p) => p.a === "other" || p.a === "blank").length / a.length : null);
    const half = Math.ceil(rated.length / 2);
    return {
      n: xs.length, rated: rated.length, off: off.length, blank: rated.filter((p) => p.a === "blank").length,
      share: share(rated),
      spont: xs.filter((p) => p.a === "other" && p.how === "spont").length,
      delib: xs.filter((p) => p.a === "other" && p.how === "delib").length,
      first: rated.length >= 4 ? share(rated.slice(0, half)) : null,
      second: rated.length >= 4 ? share(rated.slice(half)) : null,
      enough: rated.length >= 3,
    };
  }

  // ───────── Н10. «Сейчас или потом» (обесценивание отсроченной награды) ─────────
  // Процедура с подстройкой суммы (adjusting amount; Du, Green & Myerson, 2002): поздняя награда фиксирована,
  // немедленная начинается с половины и после каждого выбора сдвигается на половину предыдущего шага.
  // После последнего выбора точка безразличия — сумма, которая была бы предложена следующей.
  const LATER = 10000;
  const DELAYS = [
    { key: "w1", days: 7, label: "через 1 неделю" },
    { key: "m1", days: 30, label: "через 1 месяц" },
    { key: "m6", days: 182, label: "через 6 месяцев" },
    { key: "y1", days: 365, label: "через 1 год" },
  ];
  const STEPS = 5;
  // choices: массив выборов для одной задержки: "now" или "later"
  function offer(choices) {
    let amt = LATER / 2, step = LATER / 4;
    for (const c of choices) { amt += c === "now" ? -step : step; step /= 2; }
    return Math.round(amt);
  }
  const done = (ch) => ch && ch.length >= STEPS;
  // ответы: { w1: ["now","later",...], ... }
  function nextTrial(ans) {
    for (const d of DELAYS) { const ch = (ans && ans[d.key]) || []; if (!done(ch)) return { delay: d, step: ch.length + 1, now: offer(ch) }; }
    return null;
  }
  function indifference(ans) {
    return DELAYS.filter((d) => ans && done(ans[d.key])).map((d) => ({ ...d, ip: offer(ans[d.key].slice(0, STEPS)), rel: offer(ans[d.key].slice(0, STEPS)) / LATER }));
  }
  // Площадь под кривой (Myerson, Green & Warusawitharana, 2001): задержки и суммы нормированы на максимум,
  // точка (0; 1) добавляется в начало. 1 — награду не обесценивают совсем, ближе к 0 — сильно предпочитают «сейчас».
  function auc(points) {
    if (!points.length) return null;
    const maxD = DELAYS[DELAYS.length - 1].days;
    const pts = [{ x: 0, y: 1 }, ...points.map((p) => ({ x: p.days / maxD, y: p.rel }))].sort((a, b) => a.x - b.x);
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += ((pts[i].x - pts[i - 1].x) * (pts[i].y + pts[i - 1].y)) / 2;
    return s;
  }
  function discount(ans) {
    const pts = indifference(ans);
    const complete = pts.length === DELAYS.length;
    // проверка на непоследовательность: точка безразличия при большей задержке выше, чем при меньшей, больше чем на 20% поздней суммы
    // (критерий 1 из Johnson & Bickel, 2008)
    let jumps = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].ip > pts[i - 1].ip + 0.2 * LATER) jumps++;
    return { points: pts, complete, auc: complete ? auc(pts) : null, jumps };
  }

  // ───────── общие помощники ─────────
  const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); };
  function shuffle(arr, r) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ───────── Б10. «Ровно или волнами» (изменчивость времени реакции) ─────────
  // Простая реакция: после случайной паузы 1–3 с появляется знак, нужно как можно быстрее нажать.
  // Главный показатель не скорость, а разброс: коэффициент вариации (SD / среднее).
  // Повышенная изменчивость времени реакции — один из самых устойчивых лабораторных признаков СДВГ
  // (Kofler et al., 2013, метаанализ 319 исследований; у взрослых различие меньше, чем у детей).
  const RT = { N: 50, PRACTICE: 3, MIN: 150, MAX: 1500, TIMEOUT: 2000, FP: [1000, 3000] };
  function rtForeperiods(seed) { const r = rng(seed); return Array.from({ length: RT.N + RT.PRACTICE }, () => Math.round(RT.FP[0] + r() * (RT.FP[1] - RT.FP[0]))); }
  // trials: [{ rt: мс | null (не нажал), early: true (нажал до сигнала), practice }]
  function rtSummary(trials) {
    const xs = (trials || []).filter((t) => t && !t.practice);
    const ok = xs.filter((t) => !t.early && t.rt != null && t.rt >= RT.MIN && t.rt <= RT.MAX).map((t) => t.rt);
    const m = mean(ok), s = sd(ok), md = median(ok);
    const cvOf = (a) => (a.length >= 8 ? sd(a) / mean(a) : null);
    const h = ok.length >> 1;
    return {
      n: xs.length, valid: ok.length, done: xs.length >= RT.N, enough: ok.length >= 30,
      early: xs.filter((t) => t.early).length,
      miss: xs.filter((t) => !t.early && (t.rt == null || t.rt > RT.MAX)).length,
      tooFast: xs.filter((t) => !t.early && t.rt != null && t.rt < RT.MIN).length,
      mean: m, sd: s, median: md, cv: m ? s / m : null,
      // «провалы»: ответы вдвое медленнее вашего обычного (медианы)
      slow: md ? ok.filter((x) => x >= 2 * md).length : 0,
      cv1: cvOf(ok.slice(0, h)), cv2: cvOf(ok.slice(h)),
      series: xs.map((t) => (t.early ? null : t.rt)),
    };
  }

  // ───────── Б11. «Тридцать секунд» (воспроизведение интервала по ощущению) ─────────
  // Задача на производство интервала (time production): нажать «Стоп», когда, по ощущению, прошло N секунд.
  // В метаанализе у людей с СДВГ точность производства и оценки интервалов ниже, что авторы объясняют
  // «ускоренными внутренними часами» (Marx et al., 2021); ср. Zheng et al., 2022 (дети и подростки).
  const TP_TARGETS = [10, 30, 60, 30, 10];
  // list: [{ target: с, produced: с }]
  function tpSummary(list) {
    const xs = (list || []).filter((t) => t && t.target > 0 && t.produced > 0);
    const ratios = xs.map((t) => t.produced / t.target);
    // среднее геометрическое: 2 раза дольше и 2 раза короче одинаково далеки от точного
    const gm = ratios.length ? Math.exp(mean(ratios.map(Math.log))) : null;
    const err = ratios.length ? mean(ratios.map((r) => Math.abs(r - 1))) : null;
    const dir = gm == null ? null : gm < 0.9 ? "fast" : gm > 1.1 ? "slow" : "ok";
    // разброс: насколько отличались повторы одного и того же интервала (10 и 30 с даются дважды)
    const pairs = [];
    for (const T of new Set(xs.map((t) => t.target))) { const r = xs.filter((t) => t.target === T).map((t) => t.produced / T); if (r.length >= 2) pairs.push(Math.abs(r[0] - r[1])); }
    return { n: xs.length, done: xs.length >= TP_TARGETS.length, items: xs.map((t, i) => ({ ...t, ratio: ratios[i] })), gm, err, dir, repeatDiff: pairs.length ? mean(pairs) : null };
  }

  // ───────── Б12. «Сколько вы замечаете» (ёмкость восприятия) ─────────
  // По образцу задач Лави: в кольце из 6 позиций на 0,1 с появляется буква X или N.
  // Низкая нагрузка: остальные позиции — одинаковые кружочки «o»; высокая: другие угловатые буквы.
  // В половине попыток одновременно сбоку появляется маленький серый квадрат, после ответа спрашиваем, был ли он.
  // У типичных взрослых при высокой нагрузке квадрат замечают заметно реже, у аутичных взрослых нагрузка
  // на обнаружение почти не влияла (Remington, Swettenham & Lavie, 2012; см. также Remington et al., 2009).
  const LOAD = { N: 32, SHOW: 100, LETTERS: "HKMVWZ", POS: 6 };
  function loadTrials(seed) {
    const r = rng(seed), out = [];
    for (const load of ["low", "high"]) for (let k = 0; k < LOAD.N / 2; k++) {
      out.push({ load, target: k % 2 ? "N" : "X", extra: k % 4 < 2, pos: Math.floor(r() * LOAD.POS), side: r() < 0.5 ? "left" : "right",
        fill: load === "high" ? shuffle(LOAD.LETTERS.split(""), r).slice(0, LOAD.POS - 1) : Array(LOAD.POS - 1).fill("o") });
    }
    return shuffle(out, r);
  }
  // rows: [{ load, extra, ans: "X"|"N", target, saw: true|false }]
  function loadSummary(rows) {
    const xs = (rows || []).filter((x) => x && x.load && typeof x.saw === "boolean");
    const by = (load) => {
      const a = xs.filter((x) => x.load === load), ex = a.filter((x) => x.extra), no = a.filter((x) => !x.extra);
      return { n: a.length, acc: a.length ? a.filter((x) => x.ans === x.target).length / a.length : null,
        hit: ex.length ? ex.filter((x) => x.saw).length / ex.length : null, fa: no.length ? no.filter((x) => x.saw).length / no.length : null, nEx: ex.length };
    };
    const low = by("low"), high = by("high");
    // поправка на догадки: доля замеченных квадратов минус доля «увиденных», когда квадрата не было
    const net = (b) => (b.hit != null && b.fa != null ? b.hit - b.fa : null);
    low.net = net(low); high.net = net(high);
    const drop = low.net != null && high.net != null ? low.net - high.net : null;
    // если квадрат «видели» почти всегда и когда его не было, ответы о квадрате ничего не говорят
    const faAll = xs.length ? xs.filter((x) => !x.extra && x.saw).length / Math.max(1, xs.filter((x) => !x.extra).length) : null;
    return { n: xs.length, done: xs.length >= LOAD.N, low, high, drop, unreliable: faAll != null && faAll > 0.4, guessing: high.acc != null && high.acc < 0.6,
      // если и при лёгком поиске квадрат почти не замечали, сравнивать уровни нагрузки бессмысленно
      lowMissed: low.net != null && low.net < 0.5,
      // порог 0,2: в каждом уровне по 8 квадратов, один промах (0,125) ещё не различие
      bigCapacity: drop != null && drop < 0.2 };
  }

  // ───────── Б13. «Лес или деревья» (фигуры Навона) ─────────
  // Большая буква Н или С, собранная из маленьких Н или С. В одном блоке называем большую букву, в другом — маленькие.
  // Navon, 1977; метаанализ van der Hallen et al., 2015: при аутизме нет общей «неспособности видеть целое»,
  // но целое в среднем замечается немного позже. Поэтому результат описывается как стиль.
  const NAVON = { PER: 16, PRACTICE: 4, MIN: 200, MAX: 3000, LETTERS: ["Н", "С"] };
  // 5×7 точек для больших букв
  const NAVON_SHAPES = {
    "Н": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "С": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  };
  function navonTrials(seed) {
    const r = rng(seed), L = NAVON.LETTERS, base = [];
    for (const big of L) for (const small of L) base.push({ big, small });
    const order = r() < 0.5 ? ["global", "local"] : ["local", "global"];
    const out = [];
    for (const block of order) {
      shuffle(base, r).forEach((s) => out.push({ block, practice: true, ...s }));
      let list = [];
      for (let k = 0; k < NAVON.PER / base.length; k++) list = list.concat(base);
      shuffle(list, r).forEach((s) => out.push({ block, ...s }));
    }
    return out;
  }
  // rows: [{ block, big, small, ans, rt, practice }]
  function navonSummary(rows) {
    const xs = (rows || []).filter((x) => x && !x.practice && x.block);
    const want = (x) => (x.block === "global" ? x.big : x.small);
    const okRt = (x) => x.ans === want(x) && x.rt >= NAVON.MIN && x.rt <= NAVON.MAX;
    const cell = (block, cong) => median(xs.filter((x) => x.block === block && (x.big === x.small) === cong && okRt(x)).map((x) => x.rt));
    const blk = (block) => {
      const a = xs.filter((x) => x.block === block), c = cell(block, true), i = cell(block, false);
      return { n: a.length, acc: a.length ? a.filter((x) => x.ans === want(x)).length / a.length : null,
        rt: median(a.filter(okRt).map((x) => x.rt)), cong: c, incong: i, interf: c != null && i != null ? i - c : null };
    };
    const g = blk("global"), l = blk("local");
    return { n: xs.length, done: xs.length >= 2 * NAVON.PER, global: g, local: l,
      // > 0: целое называете быстрее деталей (так у большинства людей)
      globalAdv: g.rt != null && l.rt != null ? l.rt - g.rt : null,
      enough: g.n >= NAVON.PER && l.n >= NAVON.PER && g.acc >= 0.7 && l.acc >= 0.7 };
  }

  return { PROBE_SECS, PROBE_N, PROBE_OPTS, PROBE_HOW, probeSchedule, probeSummary, rng, LATER, DELAYS, STEPS, offer, nextTrial, indifference, auc, discount,
    median, mean, sd, shuffle,
    RT, rtForeperiods, rtSummary, TP_TARGETS, tpSummary, LOAD, loadTrials, loadSummary, NAVON, NAVON_SHAPES, navonTrials, navonSummary };
})();
