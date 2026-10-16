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
  presentLegacy: 0.45, // с какого балла пункт считается «присутствует» при пересчёте в старые тесты
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
    const Fn = p.F ? ND.FREQ[p.F] : p.I >= 2 ? 0.5 : 0.2;
    let s = In * (0.5 + 0.5 * Fn);
    const m = r.mask || 0;
    // поправка на маскировку пропорциональна силе признака: при «скорее нет» она почти не действует
    if (s > 0 && m > 0) s = s + P.alpha * (m / 2) * (1 - s) * In;
    const band = r.unsure ? P.unsureBand : 0;
    return { s, lo: Math.max(0, s - band), hi: Math.min(1, s + band) };
  }

  function classify(agg, coverage, extraOk = true) {
    if (coverage < P.minCoverage) return ST.NODATA;
    if (agg.s >= P.thetaHi && extraOk) return ST.MET;
    if (agg.s >= P.thetaLo || agg.hi >= P.thetaHi) return ST.PROB;
    return ST.NO;
  }
  const atLeastProb = (st) => st === ST.MET || st === ST.PROB;

  // общий расчёт по набору пунктов: учитываются только открытые (eligible) пункты
  function aggregate(items, R, period) {
    const open = items.filter((it) => !it.rev && ND.eligible(it, R));
    const scores = open.map((it) => ({ it, sc: itemScore(it, R[it.id], period) })).filter((x) => x.sc);
    const core = items.filter((it) => !it.rev && !it.fu);
    const coreAnswered = core.filter((it) => itemScore(it, R[it.id], period)).length;
    const coverage = core.length ? coreAnswered / core.length : 0;
    if (!scores.length) return { s: 0, lo: 0, hi: 0, coverage, n: 0, scores };
    return {
      s: mean(scores.map((x) => x.sc.s)), lo: mean(scores.map((x) => x.sc.lo)), hi: mean(scores.map((x) => x.sc.hi)),
      coverage, n: scores.length, scores,
    };
  }

  // L2: конструкт за период
  function constructScore(cid, R, period) {
    const a = aggregate(ND.ITEMS.filter((it) => it.c === cid), R, period);
    const sd = a.n ? Math.sqrt(mean(a.scores.map((x) => (x.sc.s - a.s) ** 2))) : 0;
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
  // Каждый флаг: { code, severity: "hard" | "soft", text, items? }. «hard» снимает уровень «высокое соответствие».
  function validity(R) {
    const flags = [];
    const ans = (id) => { const r = R[id]; return r && !r.na ? r : null; };

    // 1. Обратные пары: «да» на прямой и «да» на обратный вопрос (или «нет» на оба), по каждому периоду
    const pairs = ND.ITEMS.filter((x) => x.rev);
    const badPairs = [];
    let checkedPairs = 0;
    for (const it of pairs) {
      const a = ans(it.id), b = ans(it.pair);
      if (!a || !b) continue;
      let checked = false, bad = false;
      for (const p of ND.PERIODS) {
        if (!a[p] || !b[p] || a[p].I == null || b[p].I == null) continue;
        checked = true;
        if (Math.abs(b[p].I - (4 - a[p].I)) >= 3) bad = true;
      }
      if (checked) checkedPairs++;
      if (bad) badPairs.push([it.pair, it.id]);
    }
    if (badPairs.length)
      flags.push({ code: "pair", severity: badPairs.length >= 2 ? "hard" : "soft", items: badPairs.flat(),
        text: `Противоречат друг другу ответы в ${badPairs.length} из ${checkedPairs} пар вопросов с противоположным смыслом: ` +
          badPairs.slice(0, 3).map(([x, y]) => `«${short(x)}» и «${short(y)}»`).join("; ") + (badPairs.length > 3 ? ` и ещё ${badPairs.length - 3}` : "") + "." });

    // 2. Противоречия внутри одного ответа: «совсем нет», но «мешает заметно/сильно», «полностью скрываю» или указаны места
    const inner = [];
    for (const it of ND.ITEMS.filter((x) => !x.rev && !x.kind && ND.eligible(x, R))) {
      const r = ans(it.id);
      if (!r || !r.now || r.now.I !== 0) continue;
      const why = [];
      if (r.harm >= 2) why.push("мешает");
      if (r.mask === 2) why.push("скрываю");
      if (r.ctx && r.ctx.length) why.push("указано, где проявляется");
      if (why.length) inner.push({ id: it.id, why });
    }
    if (inner.length)
      flags.push({ code: "inner", severity: inner.length >= 5 ? "hard" : "soft", items: inner.map((x) => x.id),
        text: `В ${inner.length} ответах выбрано «совсем нет», но при этом отмечено, что признак мешает, скрывается или где-то проявляется` +
          (inner.length <= 3 ? `: ${inner.map((x) => `«${short(x.id)}»`).join("; ")}` : "") + "." });

    // 3. Разброс внутри темы: похожие вопросы одной темы получили очень разные ответы
    const spread = [];
    for (const cid of Object.keys(ND.CONSTRUCTS)) {
      const k = constructScore(cid, R, "now");
      if (k.n >= 4 && k.sd > 0.33) spread.push(ND.CONSTRUCTS[cid].label);
    }
    if (spread.length)
      flags.push({ code: "spread", severity: spread.length >= 3 ? "hard" : "soft",
        text: `Сильный разброс ответов внутри темы: ${spread.join(", ")}. Похожие вопросы получили очень разные ответы.` });

    // 4. Однообразие, скорость, «неприменимо»
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
    flags.pairsChecked = checkedPairs;
    flags.pairsBad = badPairs.length;
    return flags;
  }
  function short(id) {
    const t = ND.ITEMS.find((x) => x.id === id).t;
    return t.length > 60 ? t.slice(0, 57) + "…" : t;
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

    const present = (it, r, period) => { const sc = itemScore(it, r, period); return sc ? sc.s >= P.presentLegacy : null; };
    out.RAADS = build("RAADS", (it, r) => {
      const n = present(it, r, "now");
      let c = present(it, r, "child");
      if (c == null) c = n; // «не помню»: считаем как сейчас
      return n && c ? 3 : n ? 2 : c ? 1 : 0;
    });
    out.AQ = build("AQ", (it, r) => (present(it, r, "now") ? 1 : 0));
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
    const childVals = [...A, ...B].filter((x) => C[x].child.status !== ST.NODATA).map((x) => C[x].child.s);
    const top2B = B.map(sNow).sort((a, b) => b - a).slice(0, 2);
    let parts = [[0.45, mean(A.map(sNow))], [0.3, mean(top2B)], [0.1, imp]];
    if (childVals.length) parts.push([0.15, mean(childVals)]);
    const asd = Math.round((100 * parts.reduce((x, [w, v]) => x + w * v, 0)) / parts.reduce((x, [w]) => x + w, 0));

    const top5 = (pre, p) => mean(Object.keys(ND.ADHD_SYMPTOMS).filter((s) => s.startsWith(pre)).map((s) => S[s][p].s).sort((a, b) => b - a).slice(0, 5));
    // ASRS v1.1, часть A: 6 симптомов, которые в исследовании Kessler et al. (2005) лучше всего отличали СДВГ.
    // В ядре индекса они весят в 1,5 раза больше остальных: 0.7·(5 сильнейших) + 0.3·(среднее части A).
    const partA = (p) => mean(ND.ASRS_PART_A.map((sid) => S[sid][p].s));
    const core = (p) => 0.7 * Math.max(top5("A1", p), top5("A2", p)) + 0.3 * partA(p);
    const childND = Object.keys(S).every((s) => S[s].child.status === ST.NODATA);
    parts = [[0.6, core("now")], [0.2, Math.max(fMax != null ? fMax / 3 : 0, hAdhd.mean)]];
    if (!childND) parts.push([0.2, core("child")]);
    const adhd = Math.round((100 * parts.reduce((x, [w, v]) => x + w * v, 0)) / parts.reduce((x, [w]) => x + w, 0));
    return { asd, adhd };
  }
  ND.indexBand = (x) => (x >= 70 ? "высокий" : x >= 50 ? "выраженный" : x >= 30 ? "умеренный" : "низкий");

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
    // D: нарушения по сферам жизни, выгоранию или по ответам «мешает» на отдельные признаки (≥3 вопроса «заметно/сильно»)
    const asdD = fMax >= 2 || burnout.s >= P.thetaHi || hAsd.n2 >= 3 ? ST.MET
      : fMax === 1 || burnout.status === ST.PROB || hAsd.n2 >= 1 ? ST.PROB : fMax == null && !hAsd.n ? ST.NODATA : ST.NO;

    // ── СДВГ ──
    const sids = Object.keys(ND.ADHD_SYMPTOMS);
    const cnt = (pre, p, f) => sids.filter((s) => s.startsWith(pre) && f(S[s][p].status)).length;
    const nA1 = cnt("A1", "now", (x) => x === ST.MET), nA2 = cnt("A2", "now", (x) => x === ST.MET);
    const nA1p = cnt("A1", "now", atLeastProb), nA2p = cnt("A2", "now", atLeastProb);
    const adhdCore = nA1 >= P.adhdAdult || nA2 >= P.adhdAdult ? ST.MET : nA1p >= P.adhdAdult || nA2p >= P.adhdAdult ? ST.PROB : ST.NO;
    const nChild = sids.filter((s) => S[s].child.status === ST.MET).length;
    const nChildP = sids.filter((s) => atLeastProb(S[s].child.status)).length;
    const nChildND = sids.filter((s) => S[s].child.status === ST.NODATA).length;
    const adhdB = nChild >= P.adhdChildDsm ? ST.MET : nChildP >= P.adhdChildDsm || nChildND >= 9 ? ST.PROB : ST.NO;
    const ctx = contextsUsed(R, (it) => !!it.s);
    const adhdC = fSpheres2 >= 2 || ctx.size >= 2 ? ST.MET : fSpheres2 === 1 || ctx.size === 1 ? ST.PROB : ST.NO;
    const adhdD = fMax >= 2 || hAdhd.n2 >= 3 ? ST.MET : fMax === 1 || hAdhd.n2 >= 1 ? ST.PROB : fMax == null && !hAdhd.n ? ST.NODATA : ST.NO;
    let presentation = null;
    if (nA1 >= P.adhdAdult && nA2 >= P.adhdAdult) presentation = "комбинированная";
    else if (nA1 >= P.adhdAdult) presentation = "преимущественно невнимательная";
    else if (nA2 >= P.adhdAdult) presentation = "преимущественно гиперактивно-импульсивная";

    // ── L4 ──
    const validOk = !valid.some((f) => f.severity === "hard");
    function level(core, others, anyTrait) {
      if (core === ST.MET && others.every((x) => x === ST.MET) && validOk) return "high";
      if (atLeastProb(core) && others.every(atLeastProb)) return "partial";
      if (anyTrait) return "subclinical";
      return "none";
    }
    const asdAny = [...A, ...B].some((x) => atLeastProb(st(x, "now")));
    const adhdAny = nA1p + nA2p >= 3;
    const idx = indices(C, S, fMax, hAsd, hAdhd);

    return {
      constructs: C, symptoms: S, func: F, validity: valid, differential: diff, legacy: legacy(R), strengths: strengths(R),
      asd: { core: asdCore, C: asdC, D: asdD, bMet, bProb, childHits, level: level(asdCore, [asdC, asdD], asdAny), camo: C.CAMO.now, index: idx.asd },
      adhd: {
        core: adhdCore, B: adhdB, C: adhdC, D: adhdD, nA1, nA2, nA1p, nA2p, nChild, nChildP,
        divaChild: nChild >= P.adhdChildDiva, presentation, contexts: [...ctx],
        level: level(adhdCore, [adhdB, adhdC, adhdD], adhdAny), index: idx.adhd,
      },
    };
  }

  // L4c: общий вывод по двум направлениям
  // strong — высокое или частичное соответствие; trait — отдельные черты; none — не соответствует
  function overall(E) {
    const cls = (lv) => (lv === "high" || lv === "partial" ? "strong" : lv === "subclinical" ? "trait" : "none");
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
    if (flags && code !== "both") text += " Отмеченные ниже состояния стоит обсудить со специалистом отдельно.";
    if (E.validity.some((f) => f.severity === "hard")) text += " Ответы местами противоречат друг другу, поэтому вывод ненадёжный: см. блок «Согласованность ответов».";
    else if (E.validity.length) text += " В ответах есть отдельные противоречия, см. блок «Согласованность ответов».";
    return { code, title, text };
  }

  return { itemScore, constructScore, symptomScore, legacy, evaluate, overall };
})();
