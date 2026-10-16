// Движок подсчёта ND-Screen v0.2 (см. spec §5). Чистые функции, без DOM.
// Ответ на пункт:
//   { now: {I, F}, child: {I, F, unknown}, ctx: [], mask: 0..2, harm: 0..3, unsure, note, na, rt }
//   для kind=func: { now: {D}, child: {D} }
// I: 0..4, F: "rare"|"some"|"often"|"always", D: 0..3

window.ND = window.ND || {};

ND.PARAMS = {
  alpha: 0.5,      // вес добавки за маскировку
  thetaHi: 0.6,    // порог «выполнен»
  thetaLo: 0.4,    // порог «вероятно»
  unsureBand: 0.2, // ширина интервала для неуверенных ответов
  minCoverage: 0.5,
  adhdAdult: 5,    // DSM-5-TR, 17+ лет
  adhdChildDsm: 3, // «несколько симптомов до 12 лет»
  adhdChildDiva: 6,
};

ND.PERIODS = ["now", "child"];
ND.ASRS_PART_A = ["A1.d", "A1.e", "A1.i", "A1.f", "A2.a", "A2.e"];
ND.FREQ = { rare: 0.25, some: 0.5, often: 0.75, always: 1 };
ND.ST = { MET: "met", PROB: "probable", NO: "no", NODATA: "nodata" };

// Оригинальные подшкалы: число пунктов, диапазон и пороги из публикаций (сверить с первоисточниками, spec §12)
ND.LEGACY = {
  RAADS: { name: "RAADS-R", max: 240, cutoff: 65, sub: {
    soc: { label: "Социальные отношения", n: 39, cutoff: 31 },
    int: { label: "Ограниченные интересы", n: 14, cutoff: 15 },
    lang: { label: "Язык", n: 7, cutoff: 4 },
    sm: { label: "Сенсомоторика", n: 20, cutoff: 16 } } },
  AQ: { name: "AQ", max: 50, cutoff: 32, cutoffScreen: 26, sub: {
    soc: { label: "Социальные навыки", n: 10 }, sw: { label: "Переключение внимания", n: 10 },
    det: { label: "Внимание к деталям", n: 10 }, com: { label: "Коммуникация", n: 10 }, imag: { label: "Воображение", n: 10 } } },
  CATQ: { name: "CAT-Q", min: 25, max: 175, sub: {
    comp: { label: "Компенсация", n: 9 }, mask: { label: "Маскировка", n: 8 }, assim: { label: "Ассимиляция", n: 8 } } },
  RBQ: { name: "RBQ-2A", sub: { rmb: { label: "Повторяющиеся движения", n: 12 }, is: { label: "Настаивание на неизменности", n: 8 } } },
};

ND.scoring = (function () {
  const P = ND.PARAMS, ST = ND.ST;
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  // L1: балл пункта за период → {s, lo, hi} или null (нет данных)
  function itemScore(item, r, period) {
    if (!r || r.na) return null;
    const p = r[period];
    if (!p || p.unknown || p.I == null) return null;
    const In = p.I / 4;
    if (item.rev) return { s: 1 - In, lo: 1 - In, hi: 1 - In };
    // у сильных сторон частота не спрашивается, поэтому балл равен уровню согласия (иначе «полностью да» давало бы максимум 0.75)
    if (item.kind === "strength") { const band = r.unsure ? P.unsureBand : 0; return { s: In, lo: Math.max(0, In - band), hi: Math.min(1, In + band) }; }
    const Fn = p.F ? ND.FREQ[p.F] : p.I >= 2 ? 0.5 : 0.2;
    let s = In * (0.5 + 0.5 * Fn);
    // поправка на маскировку пропорциональна силе признака: при «скорее нет» она почти не действует.
    // Вопрос «скрываете ли вы» задан про настоящее, поэтому к ответам о детстве поправка не применяется.
    const m = period === "now" ? r.mask || 0 : 0;
    if (s > 0 && m > 0) s = s + P.alpha * (m / 2) * (1 - s) * In;
    const band = r.unsure ? P.unsureBand : 0;
    return { s, lo: Math.max(0, s - band), hi: Math.min(1, s + band) };
  }

  // Статус по интервалу [lo, hi]. Без «не уверен(а)» интервал сжат в точку и решает сам балл.
  // «Выполнен» — весь интервал не ниже верхнего порога; «нет» — весь интервал ниже нижнего;
  // если неуверенность не позволяет ни подтвердить, ни исключить, статус «вероятно».
  function classify(agg, coverage, extraOk = true) {
    if (coverage < P.minCoverage) return ST.NODATA;
    if (agg.lo >= P.thetaHi && extraOk) return ST.MET;
    if (agg.s >= P.thetaLo || agg.hi >= P.thetaLo) return ST.PROB;
    return ST.NO;
  }
  const atLeastProb = (st) => st === ST.MET || st === ST.PROB;

  // Общий расчёт по набору пунктов: учитываются только открытые (eligible) пункты.
  // Балл = большее из двух: среднее по основным пунктам или среднее по основным вместе с уточняющими.
  // Уточняющие вопросы открываются только тем, кто ответил «частично» и выше на основной, и описывают отдельные,
  // часто более редкие примеры признака. Если бы считалось только общее среднее, человек, которому они открылись,
  // получал бы меньше того, кому не открылись: «полностью да» на основной и «нет» на уточняющий давали бы половину
  // балла. Поэтому уточняющие вопросы могут поднять балл (больше проявлений), но не опустить его ниже основных.
  function aggregate(items, R, period) {
    const open = items.filter((it) => !it.rev && ND.eligible(it, R));
    const scores = open.map((it) => ({ it, sc: itemScore(it, R[it.id], period) })).filter((x) => x.sc);
    const core = items.filter((it) => !it.rev && !it.fu);
    const coreAnswered = core.filter((it) => itemScore(it, R[it.id], period)).length;
    const coverage = core.length ? coreAnswered / core.length : 0;
    if (!scores.length) return { s: 0, lo: 0, hi: 0, mean: 0, coverage, n: 0, scores };
    const avg = (xs) => ({ s: mean(xs.map((x) => x.sc.s)), lo: mean(xs.map((x) => x.sc.lo)), hi: mean(xs.map((x) => x.sc.hi)) });
    const all = avg(scores), coreScores = scores.filter((x) => !x.it.fu);
    const best = coreScores.length && avg(coreScores).s > all.s ? avg(coreScores) : all;
    return { ...best, mean: all.s, coverage, n: scores.length, scores };
  }

  // L2: конструкт за период
  function constructScore(cid, R, period) {
    const a = aggregate(ND.ITEMS.filter((it) => it.c === cid), R, period);
    const sd = a.n ? Math.sqrt(mean(a.scores.map((x) => (x.sc.s - a.mean) ** 2))) : 0;
    const evidence = a.scores.filter((x) => x.sc.s >= P.thetaLo).map((x) => x.it.id);
    return { cid, period, s: a.s, lo: a.lo, hi: a.hi, sd, coverage: a.coverage, n: a.n, status: a.n ? classify(a, a.coverage) : ST.NODATA, evidence };
  }

  // симптом СДВГ за период: «выполнен» требует ещё частоты «часто» и выше хотя бы в одном пункте
  function symptomScore(sid, R, period) {
    const items = ND.ITEMS.filter((x) => x.s === sid);
    const a = aggregate(items, R, period);
    if (!a.n) return { sid, period, s: 0, lo: 0, hi: 0, status: ST.NODATA };
    const frequent = a.scores.some((x) => { const p = R[x.it.id][period]; return p.I >= 2 && (p.F === "often" || p.F === "always"); });
    return { sid, period, s: a.s, lo: a.lo, hi: a.hi, status: classify(a, 1, frequent) };
  }

  function funcScores(R) {
    const out = {};
    for (const f of Object.keys(ND.LIFE_SPHERES)) {
      const r = R[f];
      out[f] = { now: r && r.now ? r.now.D : null, child: r && r.child ? r.child.D : null };
    }
    return out;
  }

  function contextsUsed(R, filter) {
    const set = new Set();
    for (const it of ND.ITEMS.filter(filter)) {
      const r = R[it.id];
      if (r && !r.na && r.now && r.now.I >= 2 && ND.eligible(it, R)) (r.ctx || []).forEach((c) => set.add(c));
    }
    return set;
  }

  // L3c: согласованность и надёжность ответов.
  // Каждый флаг: { code, severity: "hard" | "soft", text, items?, details? }. «hard» снимает уровень «высокое соответствие».
  // details — конкретные противоречия: { strength: "strong" | "moderate", why, refs: [{ id, period?, fields }] },
  // где fields — какие части ответа показать: "I" (уровень за период), "harm", "mask", "spheres".
  // Баллы проверка не меняет: она только находит и показывает противоречия.
  function validity(R) {
    const flags = [];
    const ans = (id) => { const r = R[id]; return r && !r.na ? r : null; };
    const plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; return (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many).replace("{n}", n); };
    const PER = { now: "сейчас", child: "в детстве" };
    let checks = 0;

    // 1. Обратные пары: «да» на прямой и «да» на обратный вопрос (или «нет» на оба), по каждому периоду.
    // Расхождение d = |обратный − (4 − прямой)|: 4 — ответы прямо противоположны («полностью да» на оба), 3 — почти.
    const badPairs = [], pairDetails = [];
    let checkedPairs = 0;
    for (const it of ND.ITEMS.filter((x) => x.rev)) {
      const a = ans(it.pair), b = ans(it.id);
      if (!a || !b) continue;
      let checked = false, worst = 0;
      const periods = [], yes = [];
      for (const p of ND.PERIODS) {
        if (!a[p] || !b[p] || a[p].I == null || b[p].I == null) continue;
        checked = true;
        const d = Math.abs(b[p].I - (4 - a[p].I));
        if (d < 3) continue;
        worst = Math.max(worst, d); periods.push(p); yes.push(a[p].I >= 2);
      }
      if (checked) { checkedPairs++; checks++; }
      if (!periods.length) continue;
      badPairs.push([it.pair, it.id]);
      const when = periods.map((p) => PER[p]).join(" и "), both = yes.every(Boolean) ? true : yes.every((x) => !x) ? false : null;
      pairDetails.push({ strength: worst === 4 ? "strong" : "moderate", periods,
        refs: [{ id: it.pair, periods, fields: ["I"] }, { id: it.id, periods, fields: ["I"] }],
        why: `Вопросы противоположны по смыслу, а ответы ${when} на оба ` +
          (both === true ? "утвердительные. Если верно первое утверждение, второе обычно неверно."
            : both === false ? "отрицательные. Обычно верно хотя бы одно из двух утверждений."
            : "совпадают по смыслу, хотя должны расходиться.") });
    }
    if (badPairs.length)
      flags.push({ code: "pair", severity: badPairs.length >= 2 ? "hard" : "soft", items: badPairs.flat(), details: pairDetails,
        text: `Противоречат друг другу ответы в ${badPairs.length} из ${checkedPairs} пар вопросов с противоположным смыслом.` });

    // 2. Противоречия внутри одного ответа: «совсем нет», но «мешает заметно/сильно» или «не видно, скрываю с усилием».
    // Отмеченные места при «совсем нет» не считаются противоречием: люди часто отмечают, где бывает сама ситуация,
    // а в подсчёт места при таком ответе и так не попадают.
    const inner = [];
    for (const it of ND.ITEMS.filter((x) => !x.rev && !x.kind && ND.eligible(x, R))) {
      const r = ans(it.id);
      if (!r || !r.now || r.now.I !== 0) continue;
      checks++;
      const fields = ["I"], why = [];
      if (r.harm >= 2) { fields.push("harm"); why.push("что он мешает"); }
      if (r.mask === 2) { fields.push("mask"); why.push("что вы его полностью скрываете"); }
      if (why.length) inner.push({ strength: r.harm === 3 || why.length === 2 ? "strong" : "moderate", refs: [{ id: it.id, period: "now", fields }],
        why: `Выбрано «совсем нет», то есть признака нет, но при этом отмечено, ${why.join(" и ")}. Одно из двух, скорее всего, отмечено по ошибке.` });
    }
    if (inner.length)
      flags.push({ code: "inner", severity: inner.length >= 5 ? "hard" : "soft", items: inner.map((x) => x.refs[0].id), details: inner,
        text: `${plural(inner.length, "В {n} ответе", "В {n} ответах", "В {n} ответах")} выбрано «совсем нет», но при этом отмечено, что признак мешает или скрывается с усилием.` });

    // 3. Отдельные вопросы против итоговых вопросов о жизни: по отдельным признакам «мешает заметно или сильно»,
    // а во всех сферах жизни «не мешали». Мягкий флаг: человек мог оценивать сферы по-другому.
    const spheres = Object.keys(ND.LIFE_SPHERES).map((f) => ans(f)).filter((r) => r && r.now && r.now.D != null);
    const harmed = ND.ITEMS.filter((it) => !it.rev && !it.kind && ND.eligible(it, R)).filter((it) => { const r = ans(it.id); return r && r.now && r.now.I >= 2 && r.harm >= 2; });
    if (spheres.length >= 3 && ND.ITEMS.some((it) => { const r = ans(it.id); return r && r.harm != null; })) {
      checks++;
      if (harmed.length >= 3 && spheres.every((r) => r.now.D === 0))
        flags.push({ code: "spheres", severity: "soft", items: harmed.map((x) => x.id),
          text: `${plural(harmed.length, "В {n} вопросе", "В {n} вопросах", "В {n} вопросах")} отмечено, что признак мешает заметно или сильно, но в итоговых вопросах о сферах жизни везде выбрано «не мешали».`,
          details: [{ strength: "moderate", refs: [...harmed.slice(0, 4).map((it) => ({ id: it.id, period: "now", fields: ["I", "harm"] })), { id: "F1", fields: ["spheres"] }],
            why: "Если отдельные особенности заметно мешают, это обычно видно хотя бы в одной сфере: работе, отношениях, быту или самооценке." }] });
    }

    // 4. Камуфляж: в вопросах о маскировке почти везде «нет», но в вопросах об общении многое «не видно, скрываю с усилием».
    const camo = constructScore("CAMO", R, "now");
    const hidden = ND.ITEMS.filter((it) => it.c && /^ASD\.A/.test(it.c) && ND.eligible(it, R)).filter((it) => { const r = ans(it.id); return r && r.now && r.now.I >= 1 && r.mask === 2; });
    if (camo.n >= 3) {
      checks++;
      if (camo.s < 0.25 && hidden.length >= 4) {
        const camoItems = ND.ITEMS.filter((it) => it.c === "CAMO" && !it.fu).filter((it) => { const r = ans(it.id); return r && r.now && r.now.I != null && r.now.I <= 1; });
        flags.push({ code: "camo", severity: "soft", items: [...hidden.map((x) => x.id), ...camoItems.map((x) => x.id)],
          text: `${plural(hidden.length, "В {n} вопросе", "В {n} вопросах", "В {n} вопросах")} об общении отмечено «не видно, скрываю с усилием», а в вопросах о маскировке в основном «нет».`,
          details: [{ strength: "moderate", refs: [...hidden.slice(0, 3).map((it) => ({ id: it.id, period: "now", fields: ["I", "mask"] })), ...camoItems.slice(0, 2).map((it) => ({ id: it.id, period: "now", fields: ["I"] }))],
            why: "Сильное сокрытие признаков в общении и есть маскировка, поэтому ответы в блоке о маскировке обычно тоже выше." }] });
      }
    }

    // 5. Разброс внутри темы: похожие вопросы одной темы получили очень разные ответы.
    // Это не противоречие: вопросы одной темы описывают разные проявления, и у живых людей часть из них бывает, а часть нет.
    // Поэтому флаг только мягкий и уровень не снимает. В деталях показаны самый высокий и самый низкий ответ темы.
    const spread = [], spreadDetails = [];
    for (const cid of Object.keys(ND.CONSTRUCTS)) {
      const k = constructScore(cid, R, "now");
      if (!(k.n >= 4 && k.sd > 0.33)) continue;
      spread.push(ND.CONSTRUCTS[cid].label);
      const items = ND.ITEMS.filter((it) => it.c === cid && !it.rev && ND.eligible(it, R))
        .map((it) => ({ it, sc: itemScore(it, R[it.id], "now") })).filter((x) => x.sc).sort((a, b) => b.sc.s - a.sc.s);
      spreadDetails.push({ strength: "moderate", theme: ND.CONSTRUCTS[cid].label,
        refs: [items[0], items[items.length - 1]].map((x) => ({ id: x.it.id, period: "now", fields: ["I"] })),
        why: `Тема «${ND.CONSTRUCTS[cid].label}»: самый высокий и самый низкий ответ. Это не обязательно ошибка, вопросы описывают разные проявления, но стоит перечитать оба.` });
    }
    if (spread.length)
      flags.push({ code: "spread", severity: "soft", details: spreadDetails,
        text: `Сильный разброс ответов внутри темы: ${spread.join(", ")}. Похожие вопросы получили очень разные ответы.` });

    // 6. Однообразие, скорость, «неприменимо»
    const Is = ND.ITEMS.filter((x) => x.kind !== "func" && x.kind !== "strength").map((x) => R[x.id]).filter((r) => r && !r.na && r.now && r.now.I != null).map((r) => r.now.I);
    if (Is.length >= 30) {
      const counts = {};
      Is.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
      if (Math.max(...Object.values(counts)) / Is.length > 0.8) flags.push({ code: "straight", severity: "hard", text: "Больше 80% ответов одинаковые. Возможно, анкета заполнялась не вчитываясь." });
    }
    const rts = Object.values(R).map((r) => r && r.rt).filter((x) => x > 0).sort((a, b) => a - b);
    if (rts.length >= 20 && rts[Math.floor(rts.length / 2)] < 2000)
      flags.push({ code: "speed", severity: "hard", text: "Ответы давались очень быстро (меньше 2 секунд на вопрос в среднем)." });
    const na = Object.values(R).filter((r) => r && r.na).length;
    if (na >= 10) flags.push({ code: "na", severity: "soft", text: `${na} вопросов отмечены как неприменимые или непонятные.` });

    // Степень согласованности: сколько сопоставлений ответов проверено и сколько из них противоречат.
    // Разброс по темам сюда не входит, потому что он не противоречие в строгом смысле.
    const conflicts = flags.filter((f) => ["pair", "inner", "spheres", "camo"].includes(f.code)).flatMap((f) => f.details);
    flags.pairsChecked = checkedPairs;
    flags.pairsBad = badPairs.length;
    flags.summary = { checks, conflicts: conflicts.length, strong: conflicts.filter((d) => d.strength === "strong").length,
      share: checks ? conflicts.length / checks : 0 };
    return flags;
  }
  function differential(R) {
    const out = [];
    for (const it of ND.ITEMS.filter((x) => x.kind === "diff")) {
      const r = R[it.id];
      if (!r || r.na || !r.now || r.now.I == null) continue;
      if (r.now.I >= 3) {
        const childLow = r.child && !r.child.unknown && r.child.I != null && r.child.I <= 1;
        out.push({ d: it.d, label: ND.DIFF_LABELS[it.d], note: ND.DIFF_NOTES[it.d], lateOnset: childLow });
      }
    }
    return out;
  }

  // Сильные стороны: среднее по пунктам домена. В индексы, критерии и согласованность не входят.
  function strengths(R) {
    const out = [];
    for (const [key, d] of Object.entries(ND.STRENGTHS)) {
      const items = ND.ITEMS.filter((it) => it.kind === "strength" && it.st === key);
      const sc = (p) => items.map((it) => itemScore(it, R[it.id], p)).filter(Boolean).map((x) => x.s);
      const now = sc("now"), child = sc("child");
      if (!now.length) continue;
      const also = d.also.filter((id) => { const it = ND.ITEMS.find((x) => x.id === id); const x = it && itemScore(it, R[id], "now"); return x && x.s >= P.thetaHi; });
      out.push({ key, label: d.label, s: mean(now), child: child.length ? mean(child) : null, also, items: items.filter((it) => R[it.id] && !R[it.id].na).map((it) => it.id) });
    }
    return out.sort((a, b) => b.s - a.s);
  }

  // L3a: пересчёт в шкалы оригинальных тестов.
  // Закрытый уточняющий пункт значит, что признак в группе слабый: он идёт как «отсутствует».
  // Неотвеченные и «неприменимо» пропускаются. Оценка подшкалы = средний балл пункта × число пунктов оригинала.
  function legacy(R) {
    const tagged = (test, sub) => ND.ITEMS.filter((it) => it.src && it.src.split(" ").includes(`${test}.${sub}`));
    const nowI = (it) => { const r = R[it.id]; return r && !r.na && r.now && r.now.I != null ? r : null; };
    const out = {};

    function build(test, valueOf) {
      const def = ND.LEGACY[test], subs = {};
      let total = 0, used = 0;
      for (const [k, d] of Object.entries(def.sub)) {
        const vals = [];
        for (const it of tagged(test, k)) {
          if (!ND.eligible(it, R)) {
            // закрытый уточняющий вопрос: берём среднее по основным вопросам его группы (там все ответы ниже «частично»)
            const core = ND.ITEMS.filter((x) => !x.fu && !x.rev && ND.groupOf(x) === ND.groupOf(it)).map((x) => [x, nowI(x)]).filter(([, r]) => r);
            if (core.length) vals.push(mean(core.map(([x, r]) => valueOf(x, r))));
            continue;
          }
          const r = nowI(it);
          if (r) vals.push(valueOf(it, r));
        }
        const est = vals.length ? mean(vals) * d.n : null;
        subs[k] = { ...d, est, items: vals.length };
        if (est != null) { total += est; used += vals.length; }
      }
      return { subs, total: used ? total : null, items: used };
    }

    // Оригиналы спрашивают только согласие, без частоты, поэтому берётся уровень согласия:
    // «в основном» и «полностью» = да (1), «частично» = середина шкалы (0.5), «скорее нет» и «совсем нет» = нет (0).
    const present = (r, period) => { const p = r[period]; return !p || p.unknown || p.I == null ? null : p.I >= 3 ? 1 : p.I === 2 ? 0.5 : 0; };
    // RAADS-R: 3 = верно сейчас и в детстве, 2 = только сейчас, 1 = только в детстве, 0 = никогда, то есть 2·сейчас + 1·детство
    out.RAADS = build("RAADS", (it, r) => {
      const n = present(r, "now");
      let c = present(r, "child");
      if (c == null) c = n; // «не помню»: считаем как сейчас
      return 2 * n + c;
    });
    out.AQ = build("AQ", (it, r) => present(r, "now"));
    out.CATQ = build("CATQ", (it, r) => 1 + 1.5 * r.now.I);
    const rbq = build("RBQ", (it, r) => (r.now.I < 2 ? 1 : r.now.F === "often" || r.now.F === "always" ? 3 : 2));
    for (const k of Object.keys(rbq.subs)) rbq.subs[k].mean = rbq.subs[k].est != null ? rbq.subs[k].est / rbq.subs[k].n : null;
    rbq.mean = rbq.total != null ? rbq.total / 20 : null;
    out.RBQ = rbq;

    // ASRS v1.1: частота 0–4 по основным пунктам 18 симптомов
    const fIdx = (r) => (r.now.I === 0 ? 0 : r.now.I === 1 ? 1 : { rare: 1, some: 2, often: 3, always: 4 }[r.now.F] ?? 2);
    const asrsItem = (sid) => ND.ITEMS.find((x) => x.s === sid && !x.fu);
    let inatt = 0, hyper = 0, n = 0;
    for (const sid of Object.keys(ND.ADHD_SYMPTOMS)) {
      const r = nowI(asrsItem(sid));
      if (!r) continue;
      n++; sid.startsWith("A1") ? (inatt += fIdx(r)) : (hyper += fIdx(r));
    }
    // часть A: пункты 1–3 от «иногда», 4–6 от «часто»
    const partA = [["A1.d", 2], ["A1.e", 2], ["A1.i", 2], ["A1.f", 3], ["A2.a", 3], ["A2.e", 3]];
    let a = 0, aAns = 0;
    for (const [sid, th] of partA) { const r = nowI(asrsItem(sid)); if (!r) continue; aAns++; if (fIdx(r) >= th) a++; }
    out.ASRS = { inatt, hyper, answered: n, partA: a, partAAnswered: aAns, partAPositive: aAns === 6 ? a >= 4 : null };
    return out;
  }

  // L4b: общий индекс 0–100 (экспериментальный, не откалиброван)
  // «Насколько мешает сейчас» по отдельным вопросам: доля и число вопросов с ответом «заметно» и «сильно»
  function harmOf(R, filter) {
    const hs = ND.ITEMS.filter((it) => filter(it) && ND.eligible(it, R)).map((it) => R[it.id])
      .filter((r) => r && !r.na && r.now && r.now.I >= 2 && r.harm != null).map((r) => r.harm);
    return { n: hs.length, n2: hs.filter((h) => h >= 2).length, mean: hs.length ? mean(hs) / 3 : 0 };
  }
  const isAsdItem = (it) => it.c && it.c.startsWith("ASD.");
  const isAdhdItem = (it) => !!it.s;

  function indices(C, S, fMax, hAsd, hAdhd) {
    const sNow = (cid) => C[cid].now.s;
    const A = ["ASD.A1", "ASD.A2", "ASD.A3"], B = ["ASD.B1", "ASD.B2", "ASD.B3", "ASD.B4"];
    const imp = Math.max(fMax != null ? fMax / 3 : 0, C.BURNOUT.now.s, hAsd.mean);
    // ядро: среднее A1–A3 (нужны все три) и среднее двух сильнейших B (нужны два из четырёх), в пропорции 0.45 : 0.3
    const coreOf = (p) => {
      const has = (x) => C[x][p].status !== ST.NODATA;
      const a = A.filter(has).map((x) => C[x][p].s), b = B.filter(has).map((x) => C[x][p].s).sort((x, y) => y - x).slice(0, 2);
      if (!a.length && !b.length) return null;
      return (0.45 * (a.length ? mean(a) : 0) + 0.3 * (b.length ? mean(b) : 0)) / 0.75;
    };
    // Нарушения входят в индекс в той мере, в какой есть сами признаки: DSM-5-TR требует, чтобы трудности были вызваны
    // симптомами. Без этого человек без признаков, но с тяжёлой депрессией, получал бы до 10–20 баллов только за нарушения.
    const attributed = (x, c) => x * Math.min(1, c / P.thetaHi);
    const asdNow = coreOf("now") || 0;
    let parts = [[0.75, asdNow], [0.1, attributed(imp, asdNow)]];
    const childCore = coreOf("child");
    if (childCore != null) parts.push([0.15, childCore]);
    const asd = Math.round((100 * parts.reduce((x, [w, v]) => x + w * v, 0)) / parts.reduce((x, [w]) => x + w, 0));

    const top5 = (pre, p) => mean(Object.keys(ND.ADHD_SYMPTOMS).filter((s) => s.startsWith(pre)).map((s) => S[s][p].s).sort((a, b) => b - a).slice(0, 5));
    // ASRS v1.1, часть A: 6 симптомов, которые в исследовании Kessler et al. (2005) лучше всего отличали СДВГ.
    // В ядре индекса они весят в 1,5 раза больше остальных: 0.7·(5 сильнейших) + 0.3·(среднее части A).
    const partA = (p) => mean(ND.ASRS_PART_A.map((sid) => S[sid][p].s));
    const core = (p) => 0.7 * Math.max(top5("A1", p), top5("A2", p)) + 0.3 * partA(p);
    const childND = Object.keys(S).every((s) => S[s].child.status === ST.NODATA);
    const adhdNow = core("now");
    parts = [[0.6, adhdNow], [0.2, attributed(Math.max(fMax != null ? fMax / 3 : 0, hAdhd.mean), adhdNow)]];
    if (!childND) parts.push([0.2, core("child")]);
    const adhd = Math.round((100 * parts.reduce((x, [w, v]) => x + w * v, 0)) / parts.reduce((x, [w]) => x + w, 0));
    return { asd, adhd };
  }
  // Диапазоны индекса совпадают с порогами критериев: 40 — «вероятно», 60 — «выполнен».
  ND.indexBand = (x) => (x >= 80 ? "высокий" : x >= 60 ? "выраженный" : x >= 40 ? "умеренный" : "низкий");

  // L3b + L4
  function evaluate(R) {
    const C = {};
    for (const cid of Object.keys(ND.CONSTRUCTS)) C[cid] = { now: constructScore(cid, R, "now"), child: constructScore(cid, R, "child") };
    const S = {};
    for (const sid of Object.keys(ND.ADHD_SYMPTOMS)) S[sid] = { now: symptomScore(sid, R, "now"), child: symptomScore(sid, R, "child") };
    const F = funcScores(R);
    const fNow = Object.values(F).map((x) => x.now).filter((x) => x != null);
    const fMax = fNow.length ? Math.max(...fNow) : null;
    const fSpheres2 = fNow.filter((x) => x >= 2).length;
    const valid = validity(R);
    const diff = differential(R);

    // ── РАС ──
    const A = ["ASD.A1", "ASD.A2", "ASD.A3"], B = ["ASD.B1", "ASD.B2", "ASD.B3", "ASD.B4"];
    const st = (cid, p) => C[cid][p].status;
    const bMet = B.filter((b) => st(b, "now") === ST.MET).length;
    const bProb = B.filter((b) => atLeastProb(st(b, "now"))).length;
    let asdCore = ST.NO;
    if (A.every((a) => st(a, "now") === ST.MET) && bMet >= 2) asdCore = ST.MET;
    else if (A.every((a) => atLeastProb(st(a, "now"))) && bProb >= 2) asdCore = ST.PROB;
    else if (A.some((a) => st(a, "now") === ST.NODATA)) asdCore = ST.NODATA;

    const childHits = [...A, ...B].filter((x) => atLeastProb(st(x, "child"))).length;
    const childNoData = [...A, ...B].filter((x) => st(x, "child") === ST.NODATA).length;
    const asdC = childHits >= 3 ? ST.MET : childHits >= 1 || childNoData >= 4 ? ST.PROB : ST.NO;
    const burnout = C.BURNOUT.now;
    const hAsd = harmOf(R, isAsdItem), hAdhd = harmOf(R, isAdhdItem);
    // Вопросы о сферах жизни и выгорании общие для обоих направлений. Для критерия D направления они засчитываются,
    // только если у него самого есть хоть какие-то признаки: иначе трудности из-за СДВГ или депрессии записывались бы в РАС.
    const asdAny = [...A, ...B].some((x) => atLeastProb(st(x, "now")));
    const fA = asdAny ? fMax : null, boA = asdAny ? burnout : { s: 0, status: ST.NO };
    // D: нарушения по сферам жизни, выгоранию или по ответам «мешает» на отдельные признаки (≥3 вопроса «заметно/сильно»)
    const asdD = fA >= 2 || boA.s >= P.thetaHi || hAsd.n2 >= 3 ? ST.MET
      : fA === 1 || boA.status === ST.PROB || hAsd.n2 >= 1 ? ST.PROB : fMax == null && !hAsd.n ? ST.NODATA : ST.NO;

    // ── СДВГ ──
    const sids = Object.keys(ND.ADHD_SYMPTOMS);
    const cnt = (pre, p, f) => sids.filter((s) => s.startsWith(pre) && f(S[s][p].status)).length;
    const nA1 = cnt("A1", "now", (x) => x === ST.MET), nA2 = cnt("A2", "now", (x) => x === ST.MET);
    const nA1p = cnt("A1", "now", atLeastProb), nA2p = cnt("A2", "now", atLeastProb);
    const adhdCore = nA1 >= P.adhdAdult || nA2 >= P.adhdAdult ? ST.MET : nA1p >= P.adhdAdult || nA2p >= P.adhdAdult ? ST.PROB : ST.NO;
    const nChild = sids.filter((s) => S[s].child.status === ST.MET).length;
    const nChildP = sids.filter((s) => atLeastProb(S[s].child.status)).length;
    const nChildND = sids.filter((s) => S[s].child.status === ST.NODATA).length;
    const adhdAny = nA1p + nA2p >= 3;
    const fH = adhdAny ? fMax : null, fS2 = adhdAny ? fSpheres2 : 0;
    const adhdB = nChild >= P.adhdChildDsm ? ST.MET : nChildP >= P.adhdChildDsm || nChildND >= 9 ? ST.PROB : ST.NO;
    // «Наедине с собой» не считается отдельной обстановкой для критерия C (DSM: дом, работа или учёба, друзья, другие занятия)
    const ctx = contextsUsed(R, (it) => !!it.s);
    ctx.delete("alone");
    const adhdC = fS2 >= 2 || ctx.size >= 2 ? ST.MET : fS2 === 1 || ctx.size === 1 ? ST.PROB : ST.NO;
    const adhdD = fH >= 2 || hAdhd.n2 >= 3 ? ST.MET : fH === 1 || hAdhd.n2 >= 1 ? ST.PROB : fMax == null && !hAdhd.n ? ST.NODATA : ST.NO;
    let presentation = null;
    if (!atLeastProb(adhdB)) presentation = null; // тип проявления указывается только при начале в детстве
    else if (nA1 >= P.adhdAdult && nA2 >= P.adhdAdult) presentation = "комбинированная";
    else if (nA1 >= P.adhdAdult) presentation = "преимущественно невнимательная";
    else if (nA2 >= P.adhdAdult) presentation = "преимущественно гиперактивно-импульсивная";

    // ── L4 ──
    const validOk = !valid.some((f) => f.severity === "hard");
    function level(core, others, anyTrait) {
      if (core === ST.MET && others.every((x) => x === ST.MET)) return validOk ? "high" : "unreliable";
      if (atLeastProb(core) && others.every(atLeastProb)) return "partial";
      if (anyTrait) return "subclinical";
      return "none";
    }
    const idx = indices(C, S, fMax, hAsd, hAdhd);
    // Начало в детстве (РАС C, СДВГ B) и нарушения (D) обязательны по DSM-5-TR. Если такой критерий явно не выполнен,
    // индекс не поднимается выше «умеренного» (49): выраженность симптомов есть, но картина не та, что требует DSM.
    const CAP = 49, failed = (x) => x === ST.NO;
    const asdIndex = failed(asdC) || failed(asdD) ? Math.min(idx.asd, CAP) : idx.asd;
    const adhdIndex = failed(adhdB) || failed(adhdD) ? Math.min(idx.adhd, CAP) : idx.adhd;

    return {
      constructs: C, symptoms: S, func: F, validity: valid, differential: diff, legacy: legacy(R), strengths: strengths(R),
      asd: { core: asdCore, C: asdC, D: asdD, bMet, bProb, childHits, level: level(asdCore, [asdC, asdD], asdAny), camo: C.CAMO.now, index: asdIndex, indexRaw: idx.asd },
      adhd: {
        core: adhdCore, B: adhdB, C: adhdC, D: adhdD, nA1, nA2, nA1p, nA2p, nChild, nChildP,
        divaChild: nChild >= P.adhdChildDiva, presentation, contexts: [...ctx],
        level: level(adhdCore, [adhdB, adhdC, adhdD], adhdAny), index: adhdIndex, indexRaw: idx.adhd,
      },
    };
  }

  // L4c: общий вывод по двум направлениям
  // strong — высокое или частичное соответствие; trait — отдельные черты; none — не соответствует
  function overall(E) {
    const cls = (lv) => (lv === "high" || lv === "unreliable" || lv === "partial" ? "strong" : lv === "subclinical" ? "trait" : "none");
    const a = cls(E.asd.level), h = cls(E.adhd.level);
    const flags = E.differential.length > 0;
    let code, title, text;
    if (a === "strong" && h === "strong") {
      code = "both"; title = "Признаки и РАС, и СДВГ";
      text = "Ответы соответствуют критериям обоих направлений. Такое сочетание встречается часто, и DSM-5-TR допускает оба диагноза одновременно.";
    } else if (a === "strong") {
      code = "asd"; title = "Признаки РАС";
      text = h === "trait" ? "Ответы соответствуют критериям РАС. По СДВГ есть отдельные черты, но до критериев они не дотягивают." : "Ответы соответствуют критериям РАС. Признаков СДВГ по ответам недостаточно.";
    } else if (h === "strong") {
      code = "adhd"; title = "Признаки СДВГ";
      text = a === "trait" ? "Ответы соответствуют критериям СДВГ. По РАС есть отдельные черты, но до критериев они не дотягивают." : "Ответы соответствуют критериям СДВГ. Признаков РАС по ответам недостаточно.";
    } else if (a === "trait" || h === "trait") {
      code = "traits"; title = "Отдельные нейроотличные черты";
      text = "Некоторые черты выражены, но ни по РАС, ни по СДВГ картина не складывается в критерии. Такое встречается и у нейротипичных людей.";
    } else {
      code = "nt"; title = "Нейротипичный профиль";
      text = "Ответы не соответствуют критериям ни РАС, ни СДВГ, выраженных черт тоже нет.";
    }
    if (atLeastProb(E.adhd.core) && E.adhd.B === ST.NO)
      text += " Симптомы СДВГ есть сейчас, но по ответам их не было до 12 лет. DSM-5-TR требует начала в детстве, поэтому сначала стоит проверить другие причины: тревогу, депрессию, сон, перегрузку.";
    if (atLeastProb(E.asd.core) && E.asd.C === ST.NO)
      text += " Признаки РАС есть сейчас, но по ответам их не было в детстве. Для РАС это обязательное условие, поэтому стоит обсудить другие объяснения.";
    if (flags && code !== "both") text += " Отмеченные ниже состояния стоит обсудить со специалистом отдельно.";
    if (E.validity.some((f) => f.severity === "hard")) text += " Ответы местами противоречат друг другу, поэтому вывод ненадёжный: см. блок «Согласованность ответов».";
    else if (E.validity.length) text += " В ответах есть отдельные противоречия, см. блок «Согласованность ответов».";
    return { code, title, text };
  }

  return { itemScore, constructScore, symptomScore, legacy, evaluate, overall };
})();
