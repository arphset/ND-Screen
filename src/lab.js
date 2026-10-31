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

  return { PROBE_SECS, PROBE_N, PROBE_OPTS, PROBE_HOW, probeSchedule, probeSummary, rng, LATER, DELAYS, STEPS, offer, nextTrial, indifference, auc, discount };
})();
