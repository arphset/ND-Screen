// «Почему такой результат и чего не хватает»: пояснения к статусам, критериям DSM-5-TR, уровню и индексу.
// Только читает результат ND.scoring.evaluate и ответы, ничего не пересчитывает и на баллы не влияет.
window.ND = window.ND || {};
ND.explain = (function () {
  const P = ND.PARAMS, ST = ND.ST;
  const pct = (x) => Math.round(x * 100);
  const gap = (x, th) => Math.max(1, Math.ceil(th * 100 - x * 100 - 1e-9));
  const LBL = { met: "выполнен", probable: "вероятно", no: "нет", nodata: "нет данных" };
  const PER = { now: "сейчас", child: "в детстве" };

  // статус одной темы РАС или одного симптома СДВГ за период
  function status(k, extra) {
    if (k.status === ST.NODATA) return "Отвечено меньше половины основных вопросов, поэтому оценки нет.";
    // округление не должно давать «40: ниже 40»: значение показывается в пределах своего диапазона
    const s = k.status === ST.NO ? Math.min(39, pct(k.s)) : k.status === ST.PROB && k.s < P.thetaHi ? Math.min(59, Math.max(40, pct(k.s))) : pct(k.s);
    if (k.status === ST.MET) return `Выраженность ${s}: не ниже порога 60.` + (k.hi > k.lo ? ` Даже с учётом «не уверен(а)» нижняя граница ${pct(k.lo)} не ниже 60.` : "");
    if (k.status === ST.PROB) {
      const parts = [];
      if (k.s >= P.thetaHi && k.lo < P.thetaHi && !extra) parts.push(`Выраженность ${s} выше 60, но из-за отметок «не уверен(а)» нижняя граница ${pct(k.lo)}. Чтобы засчитать «выполнен», весь диапазон должен быть не ниже 60.`);
      else if (k.s >= P.thetaHi && extra) parts.push(`Выраженность ${s} выше 60, но ${extra}.`);
      else {
        parts.push(`Выраженность ${s}: между 40 и 60. До «выполнен» не хватает ${gap(k.s, P.thetaHi)}.`);
        if (extra) parts.push(`Кроме того, ${extra}.`);
      }
      return parts.join(" ");
    }
    return `Выраженность ${s}: ниже 40.` + (k.hi > k.s ? ` С учётом «не уверен(а)» верхняя граница ${pct(k.hi)}, тоже ниже 40.` : ` До «вероятно» не хватает ${gap(k.s, P.thetaLo)}.`);
  }

  // DSM требует «часто»: есть ли у симптома ответ с частотой «часто» или «почти всегда»
  function frequent(sid, R, p) {
    return ND.ITEMS.filter((x) => x.s === sid && ND.eligible(x, R)).some((it) => { const r = R[it.id]; const a = r && !r.na && r[p]; return a && a.I >= 2 && (a.F === "often" || a.F === "always"); });
  }
  const freqNote = "ни в одном ответе по этому симптому нет частоты «часто» или «почти всегда», а DSM-5-TR описывает каждый симптом СДВГ словом «часто»";

  // ответы, сильнее всего повлиявшие на тему или симптом
  function top(items, R, p, n = 3) {
    return items.filter((it) => !it.rev && ND.eligible(it, R))
      .map((it) => ({ it, sc: ND.scoring.itemScore(it, R[it.id], p) })).filter((x) => x.sc)
      .sort((a, b) => b.sc.s - a.sc.s).slice(0, n)
      .map((x) => ({ id: x.it.id, t: x.it.t, s: pct(x.sc.s) }));
  }

  function construct(cid, E, R) {
    const items = ND.ITEMS.filter((it) => it.c === cid);
    const out = ND.PERIODS.map((p) => ({ period: p, label: PER[p], text: status(E.constructs[cid][p]), top: top(items, R, p) }));
    const note = alexNote(cid, E);
    if (note) out.push({ period: "note", label: "учтите", text: note, top: [] });
    return out;
  }

  // Высокая алекситимия (PAQ) может частично объяснять трудности в A1 и A2. Баллы от этого не меняются.
  function alexNote(cid, E) {
    const x = E.scales && E.scales.PAQ;
    if (!x || x.score == null || (cid !== "ASD.A1" && cid !== "ASD.A2")) return "";
    const high = Object.entries(x.subs).filter(([k, s]) => k !== "GEOT" && s.band === "высокая").map(([, s]) => s.label.toLowerCase());
    if (!x.positive && !high.length) return "";
    return `По шкале PAQ ${x.positive ? "алекситимия высокая" : `высокие трудности: ${high.join(", ")}`}. Трудно распознавать свои чувства значит и чужие читать труднее, поэтому часть трудностей здесь может объясняться алекситимией, а не РАС (Bird & Cook, 2013). Баллы от этого не меняются, это стоит обсудить со специалистом.`;
  }

  function symptom(sid, E, R) {
    const items = ND.ITEMS.filter((it) => it.s === sid);
    return ND.PERIODS.map((p) => {
      const k = E.symptoms[sid][p];
      const extra = k.status !== ST.MET && k.status !== ST.NODATA && !frequent(sid, R, p) ? freqNote : "";
      return { period: p, label: PER[p], text: status(k, extra), top: top(items, R, p, 2) };
    });
  }

  // критерии DSM-5-TR одной строкой каждый
  function asdCriteria(E) {
    const C = E.constructs, a = E.asd, w = a.why;
    const A = ["ASD.A1", "ASD.A2", "ASD.A3"], B = ["ASD.B1", "ASD.B2", "ASD.B3", "ASD.B4"];
    const name = (c) => `${ND.CONSTRUCTS[c].dsm} «${ND.CONSTRUCTS[c].label.toLowerCase()}»`;
    const aNot = A.filter((c) => C[c].now.status !== ST.MET);
    const core = a.core === ST.MET ? "Все три A выполнены и выполнено не меньше двух B."
      : [aNot.length ? `Нужны все три A, не выполнены: ${aNot.map((c) => `${name(c)} (${LBL[C[c].now.status]})`).join(", ")}.` : "Все три A выполнены.",
         a.bMet >= 2 ? `B выполнено ${a.bMet} из 4, нужно 2.` : `Нужно 2 выполненных B из 4, выполнено ${a.bMet}, «вероятно» ${a.bProb - a.bMet}.`].join(" ");
    const c = a.C === ST.MET ? `В детстве признаки есть в ${a.childHits} темах из 7, нужно 3.`
      : a.C === ST.PROB ? `В детстве признаки есть в ${a.childHits} темах из 7, для «выполнен» нужно 3. Либо о детстве мало ответов.`
      : "По ответам о детстве признаков нет ни в одной теме, а DSM-5-TR требует их появления в раннем возрасте.";
    const d = !w.any ? "Признаков РАС нет даже на уровне «вероятно», поэтому общие вопросы о трудностях в жизни сюда не засчитываются."
      : a.D === ST.MET ? "Есть заметное влияние на жизнь: " + [w.fMax >= 2 && "хотя бы в одной сфере «мешает заметно» или сильнее", w.burnout >= P.thetaHi && "выраженное истощение", w.harm2 >= 3 && `в ${w.harm2} вопросах «мешает заметно» или «сильно»`].filter(Boolean).join("; ") + "."
      : a.D === ST.PROB ? "Влияние на жизнь есть, но слабое: «немного» в сферах жизни или «заметно» меньше чем в 3 вопросах. Для «выполнен» нужно «заметно» хотя бы в одной сфере, истощение от 60 или 3 вопроса с «мешает заметно»."
      : a.D === ST.NODATA ? "Вопросы о влиянии на жизнь не заполнены." : "По ответам признаки не мешают в жизни.";
    return [["Ядро: A1–A3 и два из B1–B4", a.core, core], ["C: проявления в детстве", a.C, c], ["D: влияние на жизнь", a.D, d]];
  }

  function adhdCriteria(E) {
    const h = E.adhd, w = h.why, n = P.adhdAdult;
    const core = h.core === ST.MET ? `Выполнено ${Math.max(h.nA1, h.nA2)} симптомов в одной группе, нужно ${n}.`
      : `Нужно ${n} выполненных симптомов в одной группе. Невнимательность: выполнено ${h.nA1}, «вероятно» ещё ${h.nA1p - h.nA1}. Гиперактивность: выполнено ${h.nA2}, «вероятно» ещё ${h.nA2p - h.nA2}.` +
        (h.core === ST.PROB ? " Симптомы есть, но чаще всего не хватает частоты «часто» или выраженности от 60." : "");
    const b = h.B === ST.MET ? `До 12 лет выполнено ${h.nChild} симптомов, нужно ${P.adhdChildDsm}.`
      : `До 12 лет нужно ${P.adhdChildDsm} выполненных симптома, выполнено ${h.nChild}, «вероятно» ещё ${h.nChildP - h.nChild}.` + (h.B === ST.NO ? " DSM-5-TR требует начала до 12 лет." : "");
    const ctxN = h.contexts.length;
    const c = !w.any ? "Признаков СДВГ мало, поэтому этот критерий не оценивается."
      : h.C === ST.MET ? `Симптомы проявляются в нескольких обстановках: ${ctxN >= 2 ? `отмечено мест: ${ctxN}` : `«мешает заметно» в ${w.spheres2} сферах жизни`}.`
      : `Нужны две обстановки (поле «где проявляется») или две сферы жизни с «мешает заметно». Сейчас мест: ${ctxN}, сфер: ${w.spheres2}.`;
    const d = !w.any ? "Признаков СДВГ мало, поэтому общие вопросы о трудностях сюда не засчитываются."
      : h.D === ST.MET ? "Есть заметное влияние на жизнь: " + [w.fMax >= 2 && "хотя бы в одной сфере «мешает заметно» или сильнее", w.harm2 >= 3 && `в ${w.harm2} вопросах «мешает заметно» или «сильно»`].filter(Boolean).join("; ") + "."
      : h.D === ST.PROB ? "Влияние на жизнь есть, но слабое. Для «выполнен» нужно «заметно» хотя бы в одной сфере или 3 вопроса с «мешает заметно»."
      : h.D === ST.NODATA ? "Вопросы о влиянии на жизнь не заполнены." : "По ответам симптомы не мешают в жизни.";
    return [["A: 5 из 9 симптомов в группе", h.core, core], ["B: симптомы до 12 лет", h.B, b], ["C: несколько обстановок", h.C, c], ["D: влияние на жизнь", h.D, d]];
  }

  // почему такой уровень и что мешает следующему
  function level(lv, crits) {
    const not = (st) => crits.filter(([, s]) => !st(s)).map(([n]) => `«${n}»`);
    const met = (s) => s === ST.MET, prob = (s) => s === ST.MET || s === ST.PROB;
    if (lv === "high") return "Все критерии выполнены, существенных противоречий в ответах нет.";
    if (lv === "unreliable") return "Все критерии выполнены, но в ответах существенные противоречия. Если перепроверить противоречивые ответы, уровень может стать «высоким».";
    if (lv === "partial") return `Все критерии хотя бы «вероятно». До «высокого» не хватает, чтобы стали «выполнен»: ${not(met).join(", ")}.`;
    if (lv === "subclinical") return `Признаки есть, но не все критерии хотя бы «вероятно». Для «частичного» не хватает: ${not(prob).join(", ")}.`;
    return "Признаков почти нет: ни один критерий не доходит до «вероятно».";
  }

  // из чего сложился индекс
  const PART = { core: "симптомы сейчас", imp: "влияние на жизнь (засчитывается пропорционально признакам)", child: "симптомы в детстве" };
  function index(x) {
    const lines = x.indexParts.map((p) => `${PART[p.key]}: ${pct(p.v)} из 100, вес ${Math.round(p.w * 100)}%, вклад ${Math.round(p.pts)}`);
    if (x.indexRaw > x.index) lines.push(`Без ограничения индекс был бы ${x.indexRaw}. Он ограничен 49, потому что не выполнено обязательное условие DSM-5-TR (начало в детстве или влияние на жизнь).`);
    return lines;
  }

  return { construct, symptom, asdCriteria, adhdCriteria, level, index };
})();
