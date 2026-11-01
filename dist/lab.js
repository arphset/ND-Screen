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

  // ───────── Проверка устройства (B11) ─────────
  // Перед заданиями на время 1,5 с измеряем частоту кадров, потерянные кадры и опоздание таймеров.
  // В браузере разброс времени обычно меньше 10 мс, но постоянное запаздывание зависит от браузера и системы
  // (Bridges et al., 2020; Anwyl-Irvine et al., 2021). Потерянные кадры и 30 Гц искажают время показа и реакции.
  // frames: интервалы между кадрами, мс; late: насколько позже срабатывали таймеры на 20 мс, мс
  function devSummary(frames, late, extra) {
    const f = (frames || []).filter((x) => x > 0 && x < 1000), md = median(f);
    const hz = md ? 1000 / md : null, drop = f.length && md ? f.filter((x) => x > 1.5 * md).length / f.length : null, lt = median(late || []);
    const issues = [];
    if (hz != null && hz < 50) issues.push(`экран обновляется ${Math.round(hz)} раз в секунду, а нужно не меньше 50–60`);
    if (drop != null && drop > 0.1) issues.push(`теряется ${Math.round(drop * 100)}% кадров (браузер или устройство заняты)`);
    if (lt != null && lt > 8) issues.push(`таймеры опаздывают на ${Math.round(lt)} мс (часто из-за режима энергосбережения)`);
    return { hz, drop, late: lt, n: f.length, ok: issues.length === 0, issues, ...(extra || {}) };
  }

  // ───────── B7. «Удержать в уме» (ряд цифр в прямом и обратном порядке) ─────────
  // Цифры появляются по одной в секунду; ряд растёт, пока человек не ошибётся в обеих попытках одной длины.
  // Объём — самая длинная длина, где была верна хотя бы одна из двух попыток.
  // Рабочая память — одно из заметных лабораторных различий при СДВГ (Pievsky & McGrath, 2018) и при РАС (Wang et al., 2017).
  const SPAN = { FWD: [3, 9], BWD: [2, 8], PER: 2, ON: 800, OFF: 200 };
  function spanSeq(r, len) { const out = []; while (out.length < len) { const d = 1 + Math.floor(r() * 9); if (d !== out[out.length - 1]) out.push(d); } return out; }
  // rows: [{ dir: "f"|"b", len, seq: [..], ans: [..], ok }]
  function spanNext(rows, seed) {
    const r = rng(seed + rows.length * 101);
    for (const dir of ["f", "b"]) {
      const [lo, hi] = dir === "f" ? SPAN.FWD : SPAN.BWD, mine = rows.filter((x) => x.dir === dir);
      // остановка: две ошибки на одной длине или дошли до предела
      const lens = [...new Set(mine.map((x) => x.len))];
      if (lens.some((L) => mine.filter((x) => x.len === L).length >= SPAN.PER && mine.filter((x) => x.len === L).every((x) => !x.ok))) continue;
      const last = mine[mine.length - 1];
      let len = !last ? lo : mine.filter((x) => x.len === last.len).length < SPAN.PER ? last.len : last.len + 1;
      if (len > hi) continue;
      return { dir, len, seq: spanSeq(r, len) };
    }
    return null;
  }
  function spanSummary(rows) {
    const xs = (rows || []).filter((x) => x && x.dir && !x.practice);
    const span = (dir) => { const ok = xs.filter((x) => x.dir === dir && x.ok).map((x) => x.len); return ok.length ? Math.max(...ok) : xs.some((x) => x.dir === dir) ? (dir === "f" ? SPAN.FWD[0] : SPAN.BWD[0]) - 1 : null; };
    return { n: xs.length, fwd: span("f"), bwd: span("b"), done: xs.length > 0 && !spanNext(xs, 1), rows: xs };
  }

  // ───────── B8. «В ритм» (стук в такт и без такта) ─────────
  // Сначала кружок мигает с интервалом 700 мс, нужно стучать вместе с ним; потом мигание пропадает, и нужно держать тот же темп.
  // Такт задаётся миганием, а не звуком: звук в браузере запаздывает непредсказуемо (Bridges et al., 2020).
  // Показатели: разброс асинхронии в фазе с тактом (мс) и коэффициент вариации интервалов без такта.
  const TAP = { ISI: 700, SYNC: 24, SKIP: 4, CONT: 30, CSKIP: 3 };
  // flashes: моменты миганий; taps: [{t, phase: "sync"|"cont"}]
  function tapSummary(data) {
    if (!data || !data.taps) return { done: false };
    const fl = data.flashes || [], sync = data.taps.filter((x) => x.phase === "sync").map((x) => x.t), cont = data.taps.filter((x) => x.phase === "cont").map((x) => x.t);
    // асинхрония: стук минус ближайшее мигание (отрицательная — раньше мигания, так бывает у всех)
    const asyn = [];
    for (const t of sync) {
      let bi = -1; fl.forEach((f, i) => { if (bi < 0 || Math.abs(t - f) < Math.abs(t - fl[bi])) bi = i; });
      if (bi >= TAP.SKIP && Math.abs(t - fl[bi]) < TAP.ISI / 2) asyn.push(t - fl[bi]);
    }
    const iti = []; for (let i = 1; i < cont.length; i++) iti.push(cont[i] - cont[i - 1]);
    const okIti = iti.slice(TAP.CSKIP).filter((x) => x > TAP.ISI * 0.5 && x < TAP.ISI * 1.6);
    const m = mean(okIti), s = sd(okIti);
    return { done: cont.length >= TAP.CONT, nSync: asyn.length, asynMean: mean(asyn), asynSd: sd(asyn), nCont: okIti.length, outliers: iti.slice(TAP.CSKIP).length - okIti.length,
      itiMean: m, cv: m && s != null ? s / m : null, drift: m ? m / TAP.ISI : null, enough: asyn.length >= 10 && okIti.length >= 15 };
  }

  // ───────── B9. «Слух на высоту звука» (адаптивная лесенка «2 вниз — 1 вверх») ─────────
  // Два коротких чистых тона, нужно сказать, какой выше. Основная частота каждый раз своя (800–1250 Гц), чтобы сравнивались два звука, а не память.
  // После двух верных ответов подряд разница уменьшается, после ошибки увеличивается; порог — среднее геометрическое последних 6 разворотов
  // (примерно 71% верных ответов, Levitt, 1971). Тонкое различение высоты находили у части аутичных людей (Bonnel et al., 2003; 2010).
  const PITCH = { START: 20, MIN: 0.1, MAX: 40, REV: 10, MAXN: 60, TONE: 250, GAP: 400 };
  // rows: [{ delta: %, ok }]; возвращает следующий шаг лесенки
  function pitchState(rows) {
    let delta = PITCH.START, streak = 0, dirPrev = 0; const revs = [];
    for (const x of rows || []) {
      let dir = 0;
      if (x.ok) { streak++; if (streak >= 2) { dir = -1; streak = 0; } } else { dir = 1; streak = 0; }
      if (dir) {
        if (dirPrev && dir !== dirPrev) revs.push(delta);
        const f = revs.length < 4 ? 2 : Math.SQRT2;
        delta = Math.min(PITCH.MAX, Math.max(PITCH.MIN, dir < 0 ? delta / f : delta * f));
        dirPrev = dir;
      }
    }
    const n = (rows || []).length, done = revs.length >= PITCH.REV || n >= PITCH.MAXN;
    return { delta, revs, n, done };
  }
  function pitchSummary(rows) {
    const st = pitchState(rows), last = st.revs.slice(-6);
    const thr = last.length >= 4 ? Math.exp(mean(last.map(Math.log))) : null;
    // ответы на самых лёгких шагах (разница от 10%) должны быть почти все верны: иначе звук или внимание подвели
    const easy = (rows || []).filter((x) => x.delta >= 10), easyAcc = easy.length ? easy.filter((x) => x.ok).length / easy.length : null;
    return { n: st.n, done: st.done, thr, revs: st.revs.length, easyAcc, enough: thr != null && (easyAcc == null || easyAcc >= 0.75) };
  }

  // ───────── B10. «Провести линию» (точность движения) ─────────
  // Провести пальцем или мышью по извилистой дорожке от кружка до кружка. Дорожка — синусоида; отклонение считается
  // по перпендикуляру к средней линии и выражается в долях полуширины дорожки (1 — край дорожки).
  // Координация движений заметно отличается при РАС (Fournier et al., 2010) и часто при СДВГ (Kaiser et al., 2015).
  const TRACE = { N: 3, W: 600, H: 240, HALF: 16, X0: 40, X1: 560 };
  const TRACE_PATHS = [{ A: 70, L: 260, ph: 0 }, { A: 60, L: 200, ph: 1.6 }, { A: 80, L: 320, ph: 3.1 }];
  function traceY(p, x) { return TRACE.H / 2 + p.A * Math.sin((2 * Math.PI * (x - TRACE.X0)) / p.L + p.ph); }
  function traceDev(p, x, y) {
    const k = (2 * Math.PI) / p.L, dy = p.A * k * Math.cos(k * (x - TRACE.X0) + p.ph);
    return Math.abs(y - traceY(p, x)) / Math.sqrt(1 + dy * dy) / TRACE.HALF;
  }
  // trials: [{ path: i, pts: [[x, y, t]], lifts, done }]; координаты — в системе 600×240
  function traceTrial(tr) {
    const p = TRACE_PATHS[tr.path % TRACE_PATHS.length], pts = (tr.pts || []).filter((q) => q[0] >= TRACE.X0 && q[0] <= TRACE.X1);
    if (pts.length < 10) return null;
    const d = pts.map((q) => traceDev(p, q[0], q[1]));
    return { dev: mean(d), out: d.filter((x) => x > 1).length / d.length, time: (pts[pts.length - 1][2] - pts[0][2]) / 1000, lifts: tr.lifts || 0 };
  }
  function traceSummary(data) {
    const trials = ((data && data.trials) || []).map(traceTrial).filter(Boolean);
    return { n: trials.length, done: trials.length >= TRACE.N, trials, dev: mean(trials.map((t) => t.dev)), out: mean(trials.map((t) => t.out)),
      time: mean(trials.map((t) => t.time)), lifts: trials.reduce((a, t) => a + t.lifts, 0), pointer: data && data.pointer };
  }

  // ───────── Выводы по заданиям ─────────
  // Каждое задание даёт понятный итог: уровень, что это может значить в жизни, с чем это связывают исследования и что может помочь.
  // Норм для этих коротких браузерных заданий нет. Границы между уровнями — наш ориентир для чтения результата, а не клиническая норма;
  // там, где есть опорное число из исследований (47% у Killingsworth & Gilbert, 2010), границы построены вокруг него.
  // tone: ok — ничего особенного, mid — заметно, high — выражено, style — стиль без «лучше/хуже», na — оценить нельзя.
  // Что результат может значить для РАС и для СДВГ: что показали исследования и насколько задание их различает.
  // Тексты одинаковы для всех уровней результата одного задания; источники проверены (ideas-6.md, 01.11.2026).
  const CONTEXT = {
    probe: {
      adhd: "Непроизвольное блуждание мыслей (мысли уходят сами, а не потому, что вы решили подумать о другом) связано с признаками СДВГ (Seli et al., 2015). Если мысли часто уходили сами, это согласуется с трудностями удержания внимания из анкеты.",
      asd: "Для РАС этот показатель не специфичен: о блуждании мыслей у аутичных людей данных мало, и на картину РАС он не указывает ни в какую сторону.",
    },
    dd: {
      adhd: "Сильное предпочтение немедленной награды в среднем чаще при СДВГ (метаанализ Jackson & MacKillop, 2016, эффект умеренный). Это одна из основ импульсивных решений и откладывания дел с далёкой выгодой.",
      asd: "В одном исследовании подростки и взрослые с РАС тоже ценили отложенные деньги меньше, чем сверстники («Social and delay discounting in ASD», Autism Research, 2019). Поэтому задание не отличает РАС от СДВГ.",
    },
    rt: {
      adhd: "Большой разброс времени реакции — один из самых устойчивых лабораторных признаков СДВГ (Kofler et al., 2013, 319 исследований). У взрослых различие меньше, чем у детей.",
      asd: "При РАС разброс в обзоре был повышен только в выборках, где у участников был и СДВГ (Karalunas et al., 2014). Поэтому высокий разброс говорит скорее о СДВГ, чем о РАС.",
    },
    tp: {
      adhd: "Отмеривать интервалы людям с СДВГ в среднем труднее, внутренние часы чаще «спешат» (метаанализ Marx et al., 2021). Это лабораторная сторона «слепоты ко времени».",
      asd: "При РАС в простых заданиях на время результаты исследований противоречивы, различия устойчивее в сложных задачах на порядок событий (обзор 45 исследований, Casassus et al., 2019). Для РАС это задание мало что говорит.",
    },
    load: {
      adhd: "При СДВГ насыщенная задача, наоборот, помогает: посторонние картинки отвлекали взрослых с СДВГ сильнее, но высокая нагрузка снижала это отвлечение (Forster et al., 2014). Поэтому совет «брать насыщенные задачи вместо скучных» подходит и при СДВГ.",
      asd: "«Большой запас восприятия» чаще находили у аутичных взрослых: при трудной задаче они продолжали замечать лишнее (Remington, Swettenham & Lavie, 2012). Это сильная сторона, которая в шумной обстановке может вести к перегрузке. Бывает и без аутизма.",
    },
    navon: {
      adhd: "Со СДВГ стиль «целое или детали» в исследованиях не связывают, это задание о СДВГ ничего не говорит.",
      asd: "При аутизме целое в среднем замечается немного позже, но «неспособности видеть целое» нет (метаанализ 56 исследований, van der Hallen et al., 2015). «Сначала детали» согласуется с аутичным стилем восприятия, но встречается и без аутизма.",
    },
    span: {
      adhd: "Рабочая память — одно из заметных лабораторных различий при СДВГ (обзор метаанализов, d ≈ 0,54; Pievsky & McGrath, 2018). В жизни это «забыл, зачем пришёл», потеря нити разговора и инструкций из нескольких шагов.",
      asd: "При РАС рабочая память в среднем тоже слабее (метаанализ, d ≈ 0,6), причём пространственная сильнее, чем словесная (Wang et al., 2017). Это задание словесное, поэтому для РАС оно менее чувствительно и РАС от СДВГ не отличает.",
    },
    tap: {
      adhd: "У взрослых с СДВГ стук был неровнее и с опорой на такт, и без неё (Hove et al., 2017). Если ритм «плывёт» именно без опоры, это похоже на картину при СДВГ.",
      asd: "У аутичных взрослых трудности были с подстройкой под внешний такт, а свой темп без такта они держали так же ровно, как другие (Kasten, Jacoby & Ahissar, 2023). Если трудно попадать в такт, но свой ритм ровный, это похоже на картину при РАС.",
    },
    pitch: {
      adhd: "О различении высоты звука при СДВГ исследований почти нет, на СДВГ задание не указывает.",
      asd: "Тонкое различение высоты чистых тонов находили у части аутичных людей (Bonnel et al., 2003). Но позже оно подтвердилось только у тех, у кого в детстве была задержка речи, а не при синдроме Аспергера (Bonnel et al., 2010). Обычный результат РАС не исключает, тонкий слух её не доказывает.",
    },
    trace: {
      adhd: "Трудности с мелкой и крупной моторикой есть больше чем у половины детей с СДВГ (обзор Kaiser et al., 2015), особенно при невнимательном типе.",
      asd: "При РАС различия в координации движений большие (метаанализ Fournier et al., 2010). Неловкость встречается и при РАС, и при СДВГ, и при диспраксии, поэтому задание их не различает.",
    },
  };
  // Ваш результат в контексте РАС и СДВГ: одна фраза, зависящая от уровня результата
  const NONE = "На СДВГ и РАС этот результат не указывает ни в какую сторону.";
  const YOU = {
    probe: (v, S) => (v.tone === "high" ? (S.spont >= S.delib ? "Мысли уходили часто и в основном сами: это согласуется с СДВГ, если и в анкете есть трудности внимания. На РАС не указывает." : "Мысли уходили часто, но в основном намеренно: с СДВГ это связано слабее, чем непроизвольные уходы. На РАС не указывает.") : "Мысли уходили не чаще обычного: в пользу СДВГ это не говорит, но и не исключает его. На РАС не указывает."),
    dd: (v) => (v.tone === "high" ? "Похоже на то, что чаще находят при СДВГ, а иногда и при РАС. Какое из двух, задание не различает." : v.tone === "mid" ? "Промежуточный результат: ни на СДВГ, ни на РАС определённо не указывает." : "Вы легко ждёте: на типичную для СДВГ картину это не похоже."),
    rt: (v) => (v.tone === "high" ? "Похоже на то, что чаще находят при СДВГ. При РАС без СДВГ такой разброс нетипичен." : v.tone === "mid" ? "Колебания небольшие: на СДВГ указывают слабо, на РАС не указывают." : "Ровные ответы не говорят в пользу СДВГ, но и не исключают его: многие взрослые с СДВГ проходят короткое задание ровно."),
    tp: (v) => (v.tone === "ok" ? "Чувство времени точное: на СДВГ не указывает, но и не исключает. О РАС не говорит." : "Похоже на «слепоту ко времени», которую чаще описывают при СДВГ. О РАС не говорит."),
    load: (v, S) => (S.bigCapacity ? "Похоже на стиль, который чаще находили у аутичных взрослых. Это не трудность и не признак расстройства, бывает и без РАС. О СДВГ не говорит." : "Обычный фильтр внимания: ни на РАС, ни на СДВГ не указывает."),
    navon: (v, S) => (S.globalAdv < -30 ? "Похоже на стиль восприятия, который чаще встречается при РАС, но бывает и без неё. О СДВГ не говорит." : NONE),
    span: (v) => (v.tone === "ok" ? "Рабочая память в порядке: в пользу ни СДВГ, ни РАС это не говорит." : "Такое бывает и при СДВГ, и при РАС, задание их не различает. Если в анкете есть похожие трудности, задание их подтверждает."),
    tap: (v) => (v.tone === "ok" ? NONE : /плывёт/.test(v.title) ? "Ритм «плывёт» без опоры: это ближе к картине, описанной при СДВГ." : "Свой ритм ровный, а подстроиться под такт трудно: это ближе к картине, описанной при РАС."),
    pitch: (v, S) => (S.thr != null && S.thr < 0.6 ? "Согласуется с особенностью, которую находили у части аутичных людей, но сам тонкий слух на РАС не указывает. О СДВГ не говорит." : NONE),
    trace: (v) => (v.tone === "ok" ? NONE : "Неловкость движений бывает и при РАС, и при СДВГ, и при диспраксии. Задание их не различает, но может быть поводом обсудить координацию со специалистом."),
  };
  function verdict(task, S) {
    const v = verdict0(task, S);
    if (!v || v.tone === "na" || !CONTEXT[task]) return v;
    return { ...v, ...CONTEXT[task], you: YOU[task] ? YOU[task](v, S) : "" };
  }
  function verdict0(task, S) {
    if (!S) return null;
    if (task === "probe") {
      if (!S.enough) return null;
      const x = Math.round(S.share * 100) / 100;
      if (x < 0.3) return { tone: "ok", title: "Мысли в основном были на вопросах", means: "Вы реже уходили в мысли, чем люди в среднем в обычной жизни (около 47%). Длинная анкета удерживала ваше внимание.", link: "", tips: [] };
      if (x <= 0.6) return { tone: "mid", title: "Мысли уходили примерно как у всех", means: "Доля отвлечений близка к обычной для людей в повседневной жизни (около 47%). Мысли уходят у всех, особенно на однообразном деле.", link: "", tips: [] };
      return { tone: "high", title: "Мысли часто уходили от вопросов", means: "Вы были не на вопросе чаще, чем люди в среднем в обычной жизни. На долгом однообразном деле удерживать внимание вам, похоже, тяжело.",
        link: S.spont > S.delib ? "Мысли уходили в основном сами, а не намеренно: именно такое непроизвольное блуждание связано с признаками СДВГ (Seli et al., 2015). Бывает и без СДВГ, например при усталости или тревоге." : "Связь с признаками СДВГ показана для непроизвольного блуждания мыслей (Seli et al., 2015).",
        tips: ["Делить однообразную работу на короткие отрезки с перерывами.", "Оставлять под рукой лист для «посторонних» мыслей, чтобы записать и вернуться к делу."] };
    }
    if (task === "dd") {
      if (!S.complete) return null;
      const a = Math.round(S.auc * 100) / 100, note = S.jumps ? " Были непоследовательные выборы, поэтому вывод менее надёжен." : "";
      if (a >= 0.7) return { tone: "ok", title: "Вы готовы ждать", means: "Отложенные деньги почти не теряют для вас ценности. Вам, вероятно, легче откладывать, копить и работать ради далёкой цели." + note, link: "", tips: [] };
      if (a >= 0.4) return { tone: "mid", title: "Ожидание заметно снижает ценность", means: "Вы выбираете «потом», но только если награда за ожидание заметна. Далёкие цели работают, если их подкреплять по пути." + note,
        link: "Сильное предпочтение немедленной награды в среднем чаще встречается при СДВГ (Jackson & MacKillop, 2016), но зависит и от нехватки денег, доверия к обещаниям и инфляции.",
        tips: ["Делить большую цель на этапы с маленькими наградами за каждый.", "Автоматизировать то, что требует терпения: автоплатёж в копилку, автоматические переводы."] };
      return { tone: "high", title: "«Сейчас» для вас намного важнее «потом»", means: "Даже небольшая задержка сильно обесценивает награду. В жизни это может выглядеть как трудности с накоплением, импульсивные покупки, откладывание дел с далёкой выгодой." + note,
        link: "Такой выбор в среднем чаще встречается при СДВГ (Jackson & MacKillop, 2016) и связан с более слабой реакцией системы вознаграждения на отложенную награду. Но он бывает и без СДВГ, особенно когда деньги нужны прямо сейчас.",
        tips: ["Давать себе немедленную награду за шаги к далёкой цели.", "Делать будущее «ближе»: видимый прогресс, сроки на неделю, а не на год.", "Убрать соблазны из быстрого доступа: сохранённые карты, приложения магазинов."] };
    }
    if (task === "rt") {
      if (!S.done) return null;
      if (!S.enough) return { tone: "na", title: "Оценить не удалось", means: "Слишком много нажатий заранее или пропусков. Попробуйте пройти ещё раз в спокойной обстановке.", link: "", tips: [] };
      // сравниваем с тем же округлением, что видит человек (два знака), чтобы «0,30» не попадало в уровень «до 0,3»
      const c = Math.round(S.cv * 100) / 100, tired = S.cv1 != null && S.cv2 != null && S.cv2 - S.cv1 >= 0.08;
      const t = tired ? " Во второй половине разброс вырос, так проявляется усталость." : "";
      if (c < 0.2) return { tone: "ok", title: "Вы отвечали ровно", means: "Время ответа почти не прыгало от попытки к попытке: внимание держалось стабильно все три минуты." + t, link: "", tips: [] };
      if (c < 0.3) return { tone: "mid", title: "Небольшие волны внимания", means: "Ответы иногда замедлялись, но в целом внимание держалось. Небольшие колебания бывают у всех." + t,
        link: "Сильная изменчивость времени реакции — один из самых надёжных лабораторных признаков СДВГ (Kofler et al., 2013), но у взрослых различие с людьми без СДВГ меньше, чем у детей.", tips: [] };
      return { tone: "high", title: "Внимание шло волнами", means: "Время ответа заметно прыгало: то быстро, то с провалами. В жизни это похоже на «сегодня получается, завтра нет» или «то включён, то выпадаю», и это не лень." + t,
        link: "Такая изменчивость — один из самых надёжных лабораторных признаков СДВГ (метаанализ 319 исследований, Kofler et al., 2013). Её дают и недосып, усталость, тревога, поэтому один результат — повод присмотреться, а не диагноз.",
        tips: ["Ставить важные дела на своё «хорошее» время дня.", "Иметь упрощённый запасной план на плохие часы и дни.", "Объяснить близким, что колебания — не «когда хочет, может»."] };
    }
    if (task === "tp") {
      if (!S.done) return null;
      const e = Math.round(S.err * 100) / 100, dir = S.dir === "fast" ? "Внутренние часы спешат: время кажется прошедшим раньше, чем на самом деле." : S.dir === "slow" ? "Внутренние часы отстают: время проходит незаметнее, чем кажется." : "";
      const cnt = S.counted ? " Вы считали про себя, а со счётом задача проще, поэтому в жизни ошибка может быть больше." : "";
      if (e < 0.15) return { tone: "ok", title: "Точное чувство времени", means: "Вы отмеряли интервалы почти без ошибки." + cnt, link: "", tips: [] };
      const tips = ["Сделать время видимым: аналоговые часы, визуальный таймер.", "Ставить будильник на начало сборов, а не только на само событие.", "Умножать свои оценки времени на 1,5 и проверять, сколько дела заняли на самом деле."];
      const link = "Трудности с отмериванием и оценкой интервалов чаще встречаются при СДВГ (метаанализ Marx et al., 2021). Короткое задание из 5 интервалов — только подсказка.";
      if (e < 0.3) return { tone: "mid", title: "Время немного ускользает", means: `Ошибка заметная, около ${Math.round(e * 100)}%. ${dir}`.trim() + cnt, link, tips: tips.slice(0, 2) };
      return { tone: "high", title: "Время сильно ускользает", means: `Ошибка большая, около ${Math.round(e * 100)}%. ${dir} В жизни это может выглядеть как опоздания, «ещё полно времени», а потом вдруг поздно.`.replace("  ", " ") + cnt, link, tips };
    }
    if (task === "load") {
      if (!S.done) return null;
      if (S.unreliable || S.guessing || S.lowMissed) return { tone: "na", title: "Оценить не удалось", means: "Ответы о квадрате или о букве были слишком неуверенными. Попробуйте пройти ещё раз на компьютере, глядя на крестик в центре.", link: "", tips: [] };
      if (S.bigCapacity) return { tone: "style", title: "Большой запас восприятия", means: "Вы замечали лишнее даже при трудной задаче. Плюс: вы видите детали, ошибки и перемены, которые пропускают другие, и легче держите сложную, насыщенную задачу. Минус: в шумной и пёстрой обстановке мозг продолжает обрабатывать всё подряд, и перегрузка наступает быстрее.",
        link: "Так в среднем отвечали аутичные взрослые в похожем опыте: нагрузка почти не мешала им замечать лишнее (Remington, Swettenham & Lavie, 2012). Бывает и без аутизма.",
        tips: ["Для работы выбирать сложные, насыщенные задачи, а не скучные и простые: так меньше отвлечений.", "Беречь себя в пёстрой среде: наушники, тихое место, перерывы после торговых центров и толп."] };
      return { tone: "style", title: "Обычный фильтр внимания", means: "Когда задача трудная, внимание целиком уходит на неё и отсекает постороннее. Так у большинства людей: вы хорошо сосредотачиваетесь, но можете не заметить то, что происходит сбоку.", link: "", tips: [] };
    }
    if (task === "navon") {
      if (!S.done) return null;
      if (!S.enough) return { tone: "na", title: "Оценить не удалось", means: "Ошибок было слишком много. Можно пройти ещё раз, не торопясь.", link: "", tips: [] };
      const a = S.globalAdv;
      if (a > 30) return { tone: "style", title: "Сначала лес, потом деревья", means: "Целое вы схватываете быстрее деталей, как большинство людей. Вам проще увидеть общую картину, а мелочи требуют отдельного внимания.", link: "", tips: ["В проверке работы, текстов и цифр помогает отдельный проход «только по деталям»."] };
      if (a < -30) return { tone: "style", title: "Сначала деревья, потом лес", means: "Детали вы замечаете быстрее целого. Это сила в редактуре, проверке, анализе данных и ремесле. Обратная сторона: в рассказе и в задачах иногда трудно сразу выделить главное.",
        link: "При аутизме в среднем целое замечается немного позже, но «неспособности видеть целое» нет (метаанализ van der Hallen et al., 2015). Такой стиль бывает и без аутизма.",
        tips: ["В рассказе и письмах начинать с вывода, а детали давать потом.", "Перед большой задачей набросать общий план на одну страницу."] };
      return { tone: "style", title: "Лес и деревья одинаково", means: "Целое и детали вы называете примерно с одной скоростью и легко переключаетесь между ними.", link: "", tips: [] };
    }
    if (task === "span") {
      if (!S.done) return null;
      if (S.fwd != null && S.fwd < 4) return { tone: "na", title: "Оценить не удалось", means: "Даже короткие ряды в прямом порядке не получились. Скорее всего, что-то отвлекло. Попробуйте ещё раз в тишине.", link: "", tips: [] };
      const b = S.bwd;
      const tips = ["Записывать сразу: инструкции, номера, просьбы, договорённости.", "Просить инструкции по одному шагу или письменно.", "Держать «внешнюю память» на виду: список дел, стикеры, напоминания в телефоне."];
      if (b >= 5) return { tone: "ok", title: "Хорошо удерживаете в уме", means: `В обратном порядке вы удержали ${b} цифр. Держать в голове и одновременно перекладывать информацию вам, похоже, нетрудно.`, link: "", tips: [] };
      if (b === 4) return { tone: "mid", title: "Удерживаете в уме средне", means: "В обратном порядке вы удержали 4 цифры. Если нагрузка растёт или вы устали, держать в голове несколько вещей сразу может быть трудно.", link: "", tips: tips.slice(0, 2) };
      return { tone: "high", title: "Держать в уме трудно", means: `В обратном порядке вы удержали ${b} цифр${b === 1 ? "у" : b < 5 && b > 1 ? "ы" : ""}. В жизни это может выглядеть как «забыл, зачем пришёл», потерянная нить разговора, трудности с инструкциями из нескольких шагов и счётом в уме.`, link: "", tips };
    }
    if (task === "tap") {
      if (!S.done) return null;
      if (!S.enough) return { tone: "na", title: "Оценить не удалось", means: "Слишком много пропущенных или случайных нажатий. Попробуйте ещё раз, стуча одним пальцем.", link: "", tips: [] };
      const cvHi = S.cv >= 0.09, cvMid = S.cv >= 0.06, syHi = S.asynSd >= 70, syMid = S.asynSd >= 45;
      const drift = S.drift != null && Math.abs(S.drift - 1) >= 0.12 ? ` Без такта вы ${S.drift < 1 ? "ускорялись" : "замедлялись"}: в среднем ${Math.round(S.itiMean)} мс вместо 700.` : "";
      if (!cvMid && !syMid) return { tone: "ok", title: "Ровный ритм", means: "Вы ровно попадали в такт и так же ровно держали темп без него." + drift, link: "", tips: [] };
      if (cvHi || (cvMid && !syMid)) return { tone: cvHi ? "high" : "mid", title: "Без опоры ритм «плывёт»", means: `Без мигания промежутки между нажатиями заметно менялись (разброс ${Math.round(S.cv * 100)}%).${syMid ? " С миганием попадать тоже было нелегко." : " С миганием получалось ровнее."} Похоже, вам легче держать темп, когда есть внешняя опора.` + drift,
        link: "", tips: ["Опираться на внешний ритм: метроном, музыка, таймер с сигналом.", "В делах с темпом (спорт, танцы, речь на выступлении) репетировать под музыку."] };
      return { tone: syHi ? "high" : "mid", title: "Трудно подстроиться под внешний такт", means: `Свой темп без мигания вы держали ровно, а попадать в мигание было труднее: нажатия уходили от него в среднем на ${Math.round(S.asynSd)} мс в разные стороны. Похоже, свой ритм у вас устойчивый, а подстройка под чужой требует больше времени.` + drift,
        link: "", tips: ["В совместных делах (танцы, спорт, работа в паре) давать себе время приноровиться к чужому темпу.", "Где можно, задавать темп самому."] };
    }
    if (task === "pitch") {
      if (!S.done) return null;
      if (!S.enough) return { tone: "na", title: "Оценить не удалось", means: "Даже на самых больших разницах было много ошибок. Скорее всего, звук был слишком тихим или искажённым. Попробуйте ещё раз в наушниках.", link: "", tips: [] };
      const t = S.thr, f = t < 1 ? t.toFixed(1).replace(".", ",") : String(Math.round(t * 10) / 10).replace(".", ",");
      if (t < 0.6) return { tone: "style", title: "Очень тонкий слух на высоту", means: `Вы различали звуки, которые отличаются всего на ${f}%. Это заметно тоньше, чем обычно получается у людей без музыкальной подготовки в таком задании. Сила для музыки, языков, работы со звуком, а иногда и причина, почему фальшь или писк мешают сильнее, чем другим.`,
        link: "", tips: ["Если звуки утомляют, беречь слух: наушники с шумоподавлением, тихие места для работы."] };
      if (t <= 2) return { tone: "style", title: "Обычное различение высоты", means: `Вы различали звуки, которые отличаются на ${f}%. Так бывает у большинства взрослых без музыкальной подготовки.`, link: "", tips: [] };
      return { tone: "mid", title: "Близкие звуки различать трудно", means: `Уверенно вы различали звуки только с разницей около ${f}%. Так бывает и без каких-либо особенностей: при тихом звуке, плохих динамиках, усталости. Музыкальный слух тренируется.`, link: "", tips: [] };
    }
    if (task === "trace") {
      if (!S.done) return null;
      const o = Math.round(S.out * 100), slow = S.time > 15 ? " Вы вели линию медленно: так точнее, поэтому в жизни при спешке неточностей может быть больше." : "";
      const dev = S.pointer === "touch" ? " Палец закрывает дорожку, поэтому на телефоне ошибок обычно больше, чем мышью." : "";
      if (o < 5) return { tone: "ok", title: "Точные движения", means: `Вы почти не выходили за края дорожки (${o}% пути).` + slow + dev, link: "", tips: [] };
      if (o < 15) return { tone: "mid", title: "Движения в целом точные", means: `За края дорожки вы выходили на ${o}% пути. Небольшие неточности бывают у всех, особенно в спешке.` + slow + dev, link: "", tips: [] };
      return { tone: "high", title: "Тонкие движения даются труднее", means: `За края дорожки вы выходили на ${o}% пути. В жизни это может быть неровный почерк, трудности с мелкими предметами, спортом и танцами.` + slow + dev,
        link: "", tips: ["Не стыдиться удобных замен: клавиатура вместо почерка, застёжки-липучки, крупные ручки.", "Если неловкость заметно мешает, обсудить с врачом диспраксию (нарушение координации): с ней работают эрготерапевты."] };
    }
    return null;
  }

  return { PROBE_SECS, PROBE_N, PROBE_OPTS, PROBE_HOW, probeSchedule, probeSummary, rng, LATER, DELAYS, STEPS, offer, nextTrial, indifference, auc, discount,
    median, mean, sd, shuffle,
    RT, rtForeperiods, rtSummary, TP_TARGETS, tpSummary, LOAD, loadTrials, loadSummary, NAVON, NAVON_SHAPES, navonTrials, navonSummary, verdict, CONTEXT,
    devSummary, SPAN, spanNext, spanSummary, TAP, tapSummary, PITCH, pitchState, pitchSummary, TRACE, TRACE_PATHS, traceY, traceDev, traceSummary };
})();
