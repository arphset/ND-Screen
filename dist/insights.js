// Дополнительные выводы для отчёта: раннее развитие и семья, бюджет энергии, карта масок.
// Чистые функции без DOM. Ничего из этого не меняет баллы, критерии, индексы и проверку согласованности.
window.ND = window.ND || {};

ND.insights = (function () {
  const P = ND.PARAMS;
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const byId = (id) => ND.ITEMS.find((x) => x.id === id);

  // ───────── Раннее развитие и семья ─────────
  // Ответ на вопрос этого раздела: { h: индекс варианта } или { h: [индексы] } для вопросов с несколькими вариантами.
  function histAnswer(it, r) {
    if (!r || r.na || r.h == null) return null;
    const idx = Array.isArray(r.h) ? r.h : [r.h];
    if (!idx.length) return null;
    return idx.map((i) => it.opts[i]).filter(Boolean);
  }
  function history(R) {
    const rows = [], notes = [];
    for (const it of ND.ITEMS.filter((x) => x.kind === "hist")) {
      const r = R[it.id], ans = histAnswer(it, r);
      if (!ans) continue;
      const idx = Array.isArray(r.h) ? r.h : [r.h];
      const hits = (it.flags || []).filter((f) => f.on.some((i) => idx.includes(i)));
      rows.push({ id: it.id, t: it.short || it.t, answer: ans.join("; "), flagged: hits.length > 0 });
      for (const f of hits) if (!notes.some((n) => n.key === f.key)) notes.push({ key: f.key, text: f.note });
    }
    return { rows, notes };
  }

  // ───────── Бюджет энергии ─────────
  // Что, судя по выраженным признакам, отнимает силы и что может их возвращать. Значения — выраженность «сейчас» 0–1.
  const adhdGroup = (E, pre) => {
    const xs = Object.keys(ND.ADHD_SYMPTOMS).filter((s) => s.startsWith(pre)).map((s) => E.symptoms[s].now).filter((x) => x.status !== ND.ST.NODATA);
    return xs.length ? mean(xs.map((x) => x.s)) : null;
  };
  const cs = (E, cid) => (E.constructs[cid].now.n ? E.constructs[cid].now.s : null);
  const DRAINS = [
    { key: "social", label: "Общение и разговоры", heavy: "встречи и созвоны", val: (E) => { const v = ["ASD.A1", "ASD.A2", "ASD.A3"].map((c) => cs(E, c)).filter((x) => x != null); return v.length ? mean(v) : null; },
      why: "Чем больше в общении приходится угадывать и обдумывать, тем больше сил уходит на то, что другим даётся само.", ev: "lived", src: "Raymaker et al., 2020 (интервью с аутичными взрослыми о выгорании)" },
    { key: "masking", label: "Подстройка под окружающих", heavy: "дела на людях, где нужно держать лицо", val: (E) => cs(E, "CAMO"),
      why: "Маскировка требует постоянного самоконтроля. Участники исследований описывают её как изматывающую.", ev: "lived", src: "Hull et al., 2017; Cage & Troxell-Whitman, 2019" },
    { key: "sensory", label: "Шум, свет, толпа", heavy: "шумные места и поездки", val: (E) => cs(E, "ASD.B4"),
      why: "Сенсорная перегрузка накапливается за день, даже если в моменте её удаётся терпеть.", ev: "lived", src: "Raymaker et al., 2020 (сенсорная перегрузка среди причин выгорания)" },
    { key: "change", label: "Перемены и неопределённость", heavy: "новое и непривычное", val: (E) => cs(E, "ASD.B2"),
      why: "Когда планы меняются без предупреждения, силы уходят на перестройку.", ev: "lived", src: "Boulter et al., 2014: у аутичных детей и подростков непереносимость неопределённости связана с тревогой; о «цене» в силах отдельных исследований нет" },
    { key: "org", label: "Скучные дела, где нужна организованность", heavy: "бумажные и рутинные дела", val: (E) => { const a = adhdGroup(E, "A1"), x = cs(E, "EXEC"); const v = [a, x].filter((y) => y != null); return v.length ? mean(v) : null; },
      why: "Удерживать внимание на неинтересном требует постоянного усилия, и к вечеру его остаётся меньше.", ev: "lived", src: "рассказы взрослых с СДВГ; отдельных исследований о «цене» в силах нет" },
    { key: "still", label: "Долго сидеть и ждать", heavy: "долгие совещания и очереди", val: (E) => adhdGroup(E, "A2"),
      why: "Сдерживать потребность двигаться тоже тратит силы.", ev: "lived", src: "рассказы взрослых с СДВГ; отдельных исследований о «цене» в силах нет" },
  ];
  const CHARGES = [
    { key: "interest", label: "Свои интересы", when: (E, d) => (cs(E, "ASD.B3") || 0) >= P.thetaLo || E.strengths.some((x) => x.key === "deep" && x.s >= P.thetaLo),
      how: "Время на любимую тему без цели и отчёта перед кем-то.", ev: "lived", src: "Grove et al., 2018: у аутичных взрослых сильные интересы связаны с более высоким благополучием" },
    { key: "quiet", label: "Тишина и время одному", when: (E, d) => d.social >= P.thetaLo || d.sensory >= P.thetaLo,
      how: "Тихое место, приглушённый свет, наушники, никого рядом. Хотя бы 20–30 минут после нагрузки.", ev: "lived", src: "Raymaker et al., 2020" },
    { key: "unmask", label: "Люди, с которыми можно не притворяться", when: (E, d) => d.masking >= P.thetaLo,
      how: "Встречи, где можно говорить и вести себя как удобно, без контроля над собой.", ev: "lived", src: "Hull et al., 2017; Cage & Troxell-Whitman, 2019" },
    { key: "move", label: "Движение", when: (E, d) => d.still >= P.thetaLo || d.org >= P.thetaLo,
      how: "Прогулка, спорт, любая физическая нагрузка, особенно перед делами, где нужна сосредоточенность.", ev: "rct", src: "Cerrillo-Urbina et al., 2015 (метаанализ, дети и подростки с СДВГ); у взрослых данных меньше" },
    { key: "routine", label: "Предсказуемый распорядок", when: (E, d) => d.change >= P.thetaLo,
      how: "Одинаковое начало и конец дня, заранее известный план, предупреждение о переменах.", ev: "lived", src: "рассказы аутичных людей; NICE CG142 советует подстраивать среду и заранее предупреждать о переменах" },
    { key: "novelty", label: "Новизна и азарт", when: (E, d) => d.still >= P.thetaLo || E.strengths.some((x) => x.key === "energy" && x.s >= P.thetaLo),
      how: "Новые задачи короткими рывками, соревнование с собой, работа с понятным дедлайном.", ev: "lived", src: "Sedgwick et al., 2019 (взрослые с СДВГ о своих сильных сторонах)" },
  ];
  const RECOVER = { interest: "время на свой интерес", quiet: "тишина и время одному", unmask: "встреча с «своими» людьми", move: "прогулка или спорт", routine: "спокойный привычный вечер", novelty: "что-то новое и интересное" };
  function energy(E) {
    const d = {};
    const drains = DRAINS.map((x) => { const v = x.val(E); d[x.key] = v || 0; return { ...x, s: v }; })
      .filter((x) => x.s != null && x.s >= P.thetaLo).sort((a, b) => b.s - a.s);
    const charges = CHARGES.filter((x) => x.when(E, d));
    if (!drains.length) return { drains, charges, week: [] };
    const h1 = drains[0].heavy, h2 = (drains[1] || drains[0]).heavy;
    const c1 = RECOVER[(charges[0] || {}).key] || "отдых без дел", c2 = RECOVER[(charges[1] || charges[0] || {}).key] || "отдых без дел";
    const week = [
      ["Пн", `главное: ${h1}`, `вечером: ${c1}`],
      ["Вт", "дела полегче", `${c2}`],
      ["Ср", `главное: ${h2}`, `вечером: ${c1}`],
      ["Чт", "дела полегче, запас на непредвиденное", `${c2}`],
      ["Пт", `немного: ${h1}, без перегруза`, `вечером: ${c1}`],
      ["Сб", "ничего тяжёлого", `${c1}, ${c2}`],
      ["Вс", "спокойно посмотреть план на неделю", `${c2}`],
    ];
    return { drains, charges, week };
  }

  // ───────── Карта масок ─────────
  // По вопросам о признаках РАС и СДВГ, где сейчас «частично» и выше и есть ответ «видно ли это со стороны».
  // mask: 0 — видно, 1 — отчасти прячу, 2 — скрываю с усилием.
  const PLACES = [["work", "Работа или учёба"], ["strangers", "С незнакомыми"], ["friends", "С друзьями"], ["home", "Дома"]];
  const AREAS = [
    ["Общение", (it) => /^ASD\.A/.test(it.c || "")],
    ["Привычки и интересы", (it) => ["ASD.B1", "ASD.B2", "ASD.B3"].includes(it.c)],
    ["Ощущения", (it) => it.c === "ASD.B4"],
    ["Внимание и организация", (it) => /^A1\./.test(it.s || "")],
    ["Активность и импульсивность", (it) => /^A2\./.test(it.s || "")],
  ];
  function maskMap(E, R) {
    const list = ND.ITEMS.filter((it) => (it.s || /^ASD\./.test(it.c || "")) && !it.noMask && !it.rev && ND.eligible(it, R)).map((it) => [it, R[it.id]])
      .filter(([, r]) => r && !r.na && r.now && r.now.I >= 2 && r.mask != null);
    const stat = (xs) => ({ n: xs.length, hidden: xs.filter(([, r]) => r.mask >= 1).length, effort: xs.filter(([, r]) => r.mask === 2).length, level: xs.length ? mean(xs.map(([, r]) => r.mask / 2)) : 0 });
    const places = PLACES.map(([k, label]) => ({ key: k, label, ...stat(list.filter(([, r]) => (r.ctx || []).includes(k))) })).filter((x) => x.n);
    const areas = AREAS.map(([label, f]) => ({ label, ...stat(list.filter(([it]) => f(it))) })).filter((x) => x.n);
    const top = list.filter(([, r]) => r.mask === 2).sort((a, b) => b[1].now.I - a[1].now.I).slice(0, 5).map(([it]) => it.t);
    const all = stat(list);
    const cmp = places.filter((x) => x.n >= 2);
    const most = cmp.slice().sort((a, b) => b.level - a.level)[0] || null;
    const least = cmp.slice().sort((a, b) => a.level - b.level)[0] || null;
    // если разница между местами меньше 10 пунктов, говорить «сильнее всего там-то» нечестно
    const even = !most || cmp.length < 2 || most.level - least.level < 0.1;
    return { ...all, places, areas, top, even, most: even ? null : most, least: even ? null : least, catq: E.legacy.CATQ.total };
  }

  return { history, histAnswer, energy, maskMap };
})();
