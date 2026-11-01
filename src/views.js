// v0.13: новые взгляды на уже данные ответы (ideas-6: С13–С16, А4, B12).
// Чистые функции без DOM. Ничего отсюда не меняет баллы, критерии, индексы, вывод и проверку согласованности:
// они читают ответы и результат evaluate(), но не пишут в них.
window.ND = window.ND || {};

ND.views = (function () {
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const byId = (id) => ND.ITEMS.find((x) => x.id === id);
  // балл пункта «сейчас» или «в детстве» по тем же правилам, что в подсчёте (0–1), только для открытых пунктов
  function sc(R, id, period) {
    const it = byId(id);
    if (!it || !ND.eligible(it, R)) return null;
    const x = ND.scoring.itemScore(it, R[id], period || "now");
    return x ? x.s : null;
  }
  const avg = (R, ids, period) => { const v = ids.map((id) => sc(R, id, period)).filter((x) => x != null); return v.length ? { s: mean(v), n: v.length } : null; };

  // ───────── А4. «Хочется ли вам этого?» в вопросах об общении ─────────
  // Уточнение к 5 пунктам об общении. Показывается, только если признак сейчас есть хотя бы «частично»,
  // как остальные дополнительные поля. В баллы, критерии и согласованность не входит.
  // Желание общаться и трудность общения — разные вещи: многие аутичные люди хотят дружбы, но им трудно (Jaswal & Akhtar, 2019).
  const WANT = {
    "A1-1": "Хотелось бы вам легко поддерживать такие разговоры?",
    "A1-3": "Хочется ли вам участвовать в таких разговорах?",
    "A3-1": "Хочется ли вам быть своим(ей) в новой компании?",
    "A3-2": "Хочется ли вам дружить и общаться больше, чем сейчас получается?",
    "A3-13": "Хочется ли вам бывать на таких встречах?",
  };
  const WANT_OPTS = ["Да, но трудно", "Скорее нет, мне и так хорошо", "По-разному"];
  function want(R) {
    const rows = Object.keys(WANT).map((id) => [byId(id), R[id]]).filter(([it, r]) => it && ND.eligible(it, R) && r && !r.na && r.now && r.now.I >= 2 && r.want != null)
      .map(([it, r]) => ({ id: it.id, t: it.t, q: WANT[it.id], a: r.want, label: WANT_OPTS[r.want] }));
    const yes = rows.filter((x) => x.a === 0).length, no = rows.filter((x) => x.a === 1).length, mix = rows.filter((x) => x.a === 2).length;
    let kind = null;
    if (rows.length) kind = yes > no + mix ? "want" : no > yes + mix ? "content" : "mixed";
    return { rows, yes, no, mix, kind };
  }

  // ───────── С13. Сенсорный паспорт ─────────
  // Ответы о сенсорике по каналам восприятия. hyper — повышенная чувствительность, hypo — пониженная, seek — поиск ощущений.
  // Основа: DSM-5-TR, критерий B4 (повышенная или пониженная реакция и необычный интерес к ощущениям);
  // разбор по каналам и типам реакции — как в Glasgow Sensory Questionnaire (Robertson & Simmons, 2013).
  const CHANNELS = [
    { key: "sound", label: "Звуки", parts: [["hyper", ["B4-1", "B4-12", "B4-9"]]] },
    { key: "light", label: "Свет и узоры", parts: [["hyper", ["B4-2"]], ["seek", ["B1-4", "B1-11"]]] },
    { key: "touch", label: "Прикосновения и одежда", parts: [["hyper", ["B4-3"]], ["seek", ["B4-7"]]] },
    { key: "taste", label: "Запахи и вкус", parts: [["hyper", ["B4-4"]], ["seek", ["B1-5"]]] },
    { key: "temp", label: "Температура", parts: [["hyper", ["B4-8"]]] },
    { key: "body", label: "Сигналы тела: голод, жажда, боль, усталость", parts: [["hypo", ["B4-5"]]] },
    { key: "emo", label: "Эмоции как ощущение в теле", parts: [["hypo", ["B4-11"]]] },
    { key: "crowd", label: "Всё сразу: шум, люди, толпа", parts: [["hyper", ["B4-6", "B4-13", "B4-10"]]] },
    { key: "move", label: "Тело в пространстве: координация, равновесие", parts: [["motor", ["MO-1", "MO-2"]]] },
  ];
  const TYPE_LABEL = { hyper: "повышенная чувствительность", hypo: "пониженное восприятие", seek: "ищете ощущения", motor: "неловкость движений" };
  function sensory(R, pitch) {
    const rows = CHANNELS.map((ch) => {
      const parts = ch.parts.map(([type, ids]) => ({ type, now: avg(R, ids, "now"), child: avg(R, ids, "child"),
        top: ids.filter((id) => (sc(R, id) || 0) >= ND.PARAMS.thetaLo).map((id) => byId(id).t) })).filter((p) => p.now || p.child);
      const now = parts.length ? Math.max(...parts.map((p) => (p.now ? p.now.s : 0))) : null;
      const child = parts.some((p) => p.child) ? Math.max(...parts.map((p) => (p.child ? p.child.s : 0))) : null;
      const types = parts.filter((p) => p.now && p.now.s >= ND.PARAMS.thetaLo).map((p) => p.type);
      return { key: ch.key, label: ch.label, now, child, types, top: parts.flatMap((p) => p.top).slice(0, 3) };
    });
    const answered = rows.filter((r) => r.now != null);
    const strong = answered.filter((r) => r.now >= ND.PARAMS.thetaLo).sort((a, b) => b.now - a.now);
    const pitchNote = pitch && pitch.done && pitch.enough ? pitch.thr : null;
    return { rows, answered: answered.length, strong, pitch: pitchNote };
  }

  // ───────── С14. Профиль исполнительных функций ─────────
  // Ответы о внимании, организации и эмоциях, разложенные по 5 областям модели Р. Баркли (BDEFS; Barkley, 2011).
  // Сама шкала BDEFS коммерческая и здесь не используется. Распределение наших вопросов по областям — наше.
  const EF = [
    { key: "time", label: "Управление временем", what: "чувствовать время, укладываться в сроки, помнить о делах в нужный момент", support: "attention",
      ids: ["EX-3", "H1-e2", "H1-i", "H1-i2", "H1-f2"] },
    { key: "org", label: "Организация и решение задач", what: "планировать, раскладывать задачу на шаги, держать порядок, переключаться", support: "attention",
      ids: ["H1-e", "H1-d", "H1-d2", "H1-g", "H1-g2", "H1-a", "H1-a2", "SW-1", "SW-2", "SW-3", "H1-b2"] },
    { key: "restraint", label: "Сдерживание", what: "остановиться и подумать, прежде чем сказать или сделать, дождаться", support: "hyper",
      ids: ["H2-g", "H2-g2", "H2-h", "H2-h2", "H2-i", "H2-i2", "EX-4"] },
    { key: "motivation", label: "Самомотивация", what: "начать и довести дело без внешнего толчка, делать неинтересное", support: "attention",
      ids: ["H1-f", "EX-5", "EX-7", "B3-9", "H1-h2"] },
    { key: "emotion", label: "Регуляция эмоций", what: "успокаиваться, не застревать в обиде, отвечать соразмерно", support: "emotion",
      ids: ["EX-1", "EX-6"] },
  ];
  function ef(R) {
    const rows = EF.map((d) => {
      const now = avg(R, d.ids, "now"), child = avg(R, d.ids, "child");
      const top = d.ids.map((id) => [id, sc(R, id)]).filter(([, s]) => s != null && s >= ND.PARAMS.thetaLo).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => byId(id).t);
      return { ...d, now: now && now.s, n: now ? now.n : 0, child: child && child.s, top };
    }).filter((x) => x.n >= 1);
    const ranked = rows.filter((x) => x.now >= ND.PARAMS.thetaLo).sort((a, b) => b.now - a.now);
    return { rows, first: ranked[0] || null };
  }

  // ───────── С15. «Где вы научились компенсировать» ─────────
  // Признаки РАС и СДВГ, которые в детстве были выражены («в основном да» и выше), а сейчас слабее.
  // learned — сейчас «совсем нет» или «скорее нет»: признак ушёл или вы научились его обходить;
  // effort — сейчас слабее, но есть «частично» и выше и вы его прикрываете (ответ «видно ли со стороны»): справляетесь ценой усилия.
  // DSM-5-TR (критерий C для РАС) прямо допускает, что признаки «могут маскироваться выученными стратегиями в дальнейшей жизни».
  // Компенсация помогает в работе и отношениях, но связана с усталостью, тревогой и поздним диагнозом (Livingston, Shah & Happé, 2019).
  function compensation(R) {
    const list = ND.ITEMS.filter((it) => (it.s || /^ASD\./.test(it.c || "")) && !it.rev && !it.kind && !it.noChild && ND.eligible(it, R)).map((it) => [it, R[it.id]])
      .filter(([, r]) => r && !r.na && r.child && r.child.I != null && !r.child.unknown && r.child.I >= 3 && r.now && r.now.I != null && !r.now.unknown && r.now.I < r.child.I);
    const area = (it) => (/^ASD\.A/.test(it.c || "") ? "общение" : it.c === "ASD.B4" ? "ощущения" : /^ASD\.B/.test(it.c || "") ? "привычки и интересы" : /^A1\./.test(it.s || "") ? "внимание и организация" : "активность и импульсивность");
    const row = ([it, r]) => ({ id: it.id, t: it.t, area: area(it), child: r.child.I, now: r.now.I, mask: r.now.I >= 2 && !it.noMask ? r.mask : null });
    const learned = list.filter(([, r]) => r.now.I <= 1).map(row);
    const effort = list.filter(([it, r]) => r.now.I >= 2 && !it.noMask && r.mask >= 1).map(row);
    const lighter = list.filter(([it, r]) => r.now.I >= 2 && (it.noMask || !(r.mask >= 1))).map(row);
    const areas = {};
    for (const x of [...learned, ...effort]) areas[x.area] = (areas[x.area] || 0) + 1;
    const cm4 = R["CM-4"] && R["CM-4"].now && R["CM-4"].now.I >= 3; // сильная усталость после общения
    const bo = R["BO-1"] && R["BO-1"].now && R["BO-1"].now.I >= 3; // периоды истощения
    return { learned, effort, lighter, areas: Object.entries(areas).sort((a, b) => b[1] - a[1]), cost: { fatigue: !!cm4, burnout: !!bo }, n: learned.length + effort.length };
  }

  // ───────── С16. «Что значит такой результат»: 1000 человек ─────────
  // Пример на исходном тесте, а не на ND-Screen: для ND-Screen таких цифр пока нет.
  // ASRS v1.1, часть A (6 вопросов): чувствительность 68,7%, специфичность 99,5% (Kessler et al., 2005);
  // стойкий СДВГ у взрослых в мире — 2,58% (Song et al., 2021).
  function thousand() {
    const prev = 0.0258, sens = 0.687, spec = 0.995, N = 1000;
    const sick = Math.round(N * prev), tp = Math.round(sick * sens), fn = sick - tp, fp = Math.round((N - sick) * (1 - spec)), tn = N - sick - fp;
    return { N, sick, tp, fn, fp, tn, ppv: tp / (tp + fp), prev, sens, spec };
  }

  // ───────── B12. «Слова и дела»: анкета рядом с похожим заданием ─────────
  // Опросники и задания измеряют разное: анкета — как вы справляетесь в жизни за месяцы, задание — как сработали за 3 минуты в тишине.
  // Связь между ними в исследованиях слабая (Toplak, West & Stanovich, 2013), поэтому расхождение — обычное дело, а не ошибка.
  // q — пункты анкеты; sig(v, S) — «показывает ли задание то же, о чём говорят пункты» (true / false / null — не сравниваем).
  const hiTone = (v) => (v ? (v.tone === "high" || v.tone === "mid" ? true : v.tone === "ok" ? false : null) : null);
  const WD = [
    { task: "rt", what: "Ровность внимания", q: ["H1-b", "H1-h", "H1-c"], sig: hiTone },
    { task: "probe", what: "Мысли уходят в сторону", q: ["H1-b", "H1-c", "H1-h"], sig: hiTone },
    { task: "tp", what: "Чувство времени", q: ["EX-3", "H1-e2"], sig: hiTone },
    { task: "dd", what: "Ждать ради большего", q: ["H2-h", "EX-4"], sig: hiTone },
    { task: "span", what: "Удерживать в уме", q: ["H1-i2", "H1-b2", "SW-3"], sig: hiTone },
    { task: "load", what: "Замечать лишнее и детали", q: ["DT-1", "B4-6"], sig: (v, S) => (S && S.done && !S.unreliable && !S.guessing && !S.lowMissed ? !!S.bigCapacity : null) },
    { task: "navon", what: "Детали раньше целого", q: ["DT-4", "DT-1"], sig: (v, S) => (S && S.enough ? S.globalAdv < -30 : null) },
    { task: "tap", what: "Ритм и координация", q: ["MO-1", "MO-2"], sig: hiTone },
    { task: "trace", what: "Точность движений", q: ["MO-1", "MO-2"], sig: hiTone },
    { task: "pitch", what: "Тонкий слух", q: ["DT-1", "B4-1"], sig: (v, S) => (S && S.enough ? S.thr < 0.6 : null) },
  ];
  // sums: { task: summary }, verdicts: { task: verdict }
  function wordsDeeds(R, sums, verdicts) {
    const out = [];
    for (const w of WD) {
      const v = verdicts[w.task], S = sums[w.task];
      if (!v || v.tone === "na") continue;
      const q = avg(R, w.q, "now");
      if (!q) continue;
      const qHi = q.s >= ND.PARAMS.thetaLo, tHi = w.sig(v, S);
      if (tHi == null) continue;
      out.push({ task: w.task, what: w.what, q: q.s, qHi, tHi, agree: qHi === tHi, title: v.title, items: w.q.filter((id) => sc(R, id) != null).map((id) => byId(id).t) });
    }
    return out;
  }

  return { WANT, WANT_OPTS, want, CHANNELS, TYPE_LABEL, sensory, EF, ef, compensation, thousand, WD, wordsDeeds };
})();
