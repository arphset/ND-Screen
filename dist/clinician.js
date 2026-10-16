// Отчёт для специалиста: критерии DSM-5-TR с ответами, на которых держится каждая оценка,
// пересчёт в шкалы оригинальных тестов, согласованность и темы для очного интервью.
// Использует подписи из ND.UI (задаются в app.js) и движок ND.scoring.
window.ND = window.ND || {};
ND.clinician = (function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = (x) => Math.round(x * 100);
  const r0 = (x) => (x == null ? "—" : Math.round(x));
  const ASD_A = ["ASD.A1", "ASD.A2", "ASD.A3"], ASD_B = ["ASD.B1", "ASD.B2", "ASD.B3", "ASD.B4"];
  const CTX_LABEL = () => Object.fromEntries(ND.UI.CTX);

  // Ответ одной строкой: «сейчас: В основном да, часто · детство: Частично · скрывает с усилием · мешает заметно»
  function answerLine(r) {
    const U = ND.UI, F = Object.fromEntries(U.F_OPTS);
    const per = (p) => {
      const x = r[p];
      if (!x) return "нет ответа";
      if (x.unknown) return "не помнит";
      if (x.I == null) return x.custom ? "только свой ответ" : "нет ответа";
      return U.I_LABELS[x.I].toLowerCase() + (x.F ? ", " + F[x.F].toLowerCase() : "");
    };
    const parts = [`сейчас: ${per("now")}`, `детство: ${per("child")}`];
    if (r.mask === 1) parts.push("частично сдерживает");
    if (r.mask === 2) parts.push("скрывает с усилием");
    if (r.harm >= 1) parts.push("мешает " + U.D_LABELS[r.harm].toLowerCase());
    if (r.ctx && r.ctx.length) parts.push("где: " + r.ctx.map((c) => CTX_LABEL()[c].toLowerCase()).join(", "));
    if (r.unsure) parts.push("не уверен(а)");
    return parts.join(" · ");
  }

  // Ответы, на которых держится оценка: открытые пункты набора с баллом от «вероятно» сейчас или в детстве
  function evidence(items, R, limit = 4) {
    const P = ND.PARAMS, sc = ND.scoring.itemScore;
    return items
      .filter((it) => !it.rev && ND.eligible(it, R) && R[it.id] && !R[it.id].na)
      .map((it) => {
        const n = sc(it, R[it.id], "now"), c = sc(it, R[it.id], "child");
        return { it, r: R[it.id], key: Math.max(n ? n.s : 0, c ? c.s * 0.9 : 0) };
      })
      .filter((x) => x.key >= P.thetaLo)
      .sort((a, b) => b.key - a.key)
      .slice(0, limit);
  }

  function build(R) {
    const U = ND.UI, E = ND.scoring.evaluate(R), O = ND.scoring.overall(E), ST = U.ST_LABEL;
    const C = E.constructs, S = E.symptoms, asd = E.asd, adhd = E.adhd;
    const opened = ND.ITEMS.filter((it) => ND.eligible(it, R));
    const answered = opened.filter((it) => R[it.id] && (R[it.id].na || (R[it.id].now && (R[it.id].now.I != null || R[it.id].now.D != null || R[it.id].now.unknown)))).length;
    const hard = E.validity.some((f) => f.severity === "hard");
    const T = []; // текстовая версия
    const h = [];

    const date = new Date().toLocaleDateString("ru-RU");
    h.push(`<div class="stack"><span class="eyebrow">ND-Screen 0.4 · отчёт для специалиста · ${esc(date)}</span>
      <h1>Самоотчёт по критериям DSM-5-TR</h1>
      <p class="muted">Структурированный самоотчёт взрослого с отдельными ответами о настоящем и о детстве до 12 лет. Статусы критериев рассчитаны алгоритмом с неоткалиброванными порогами: это материал для клинического интервью, а не диагноз. Отвечено ${answered} из ${opened.length} открытых вопросов.</p></div>`);
    T.push("ND-Screen 0.4, отчёт для специалиста, " + date, "Самоотчёт, не диагноз. Пороги не откалиброваны.", `Отвечено ${answered} из ${opened.length} открытых вопросов.`, "");

    // Сводка
    const L = (lv) => U.LEVEL[lv][0];
    const consist = !E.validity.length ? "противоречий не найдено" : hard ? "противоречивые ответы, результат ненадёжен" : "отдельные противоречия";
    h.push(`<section class="block"><h2>Сводка</h2><div class="tbl-wrap"><table><tbody>
      <tr><td>Общий вывод</td><td><b>${esc(O.title)}</b></td></tr>
      <tr><td>РАС</td><td>${L(asd.level)}, индекс ${asd.index}/100</td></tr>
      <tr><td>СДВГ</td><td>${L(adhd.level)}, индекс ${adhd.index}/100${adhd.presentation ? `, ${adhd.presentation}` : ""}</td></tr>
      <tr><td>Согласованность</td><td>${consist} (проверено пар: ${E.validity.pairsChecked || 0})</td></tr>
      <tr><td>Камуфляж</td><td>${pct(C.CAMO.now.s)}/100; CAT-Q (пересчёт) ${r0(E.legacy.CATQ.total)}/175</td></tr>
      <tr><td>Дифференциальные флаги</td><td>${E.differential.length ? E.differential.map((d) => esc(d.label) + (d.lateOnset ? " (начало не в детстве)" : "")).join("; ") : "нет"}</td></tr>
    </tbody></table></div></section>`);
    T.push("СВОДКА", `Общий вывод: ${O.title}`, `РАС: ${L(asd.level)}, индекс ${asd.index}/100`,
      `СДВГ: ${L(adhd.level)}, индекс ${adhd.index}/100${adhd.presentation ? ", " + adhd.presentation : ""}`,
      `Согласованность: ${consist}`, `Камуфляж: ${pct(C.CAMO.now.s)}/100`,
      `Дифференциальные флаги: ${E.differential.length ? E.differential.map((d) => d.label).join("; ") : "нет"}`, "");

    const evList = (items) => {
      const ev = evidence(items, R);
      return { html: ev.length ? `<ul class="ev">${ev.map((x) => `<li>${esc(x.it.t)}<br><span class="muted small">${esc(answerLine(x.r))}</span></li>`).join("")}</ul>` : `<p class="small muted">Ответов от «частично» нет.</p>`,
        text: ev.map((x) => `    – ${x.it.t} [${answerLine(x.r)}]`) };
    };

    // РАС
    const crit = (code, title, now, child, body) => `<div class="crit"><div class="crit-head"><b class="mono">${code}</b><span>${esc(title)}</span><span class="small">${now}</span>${child ? `<span class="small muted">${child}</span>` : ""}</div>${body || ""}</div>`;
    const stNow = (k) => `сейчас: ${ST[k.now.status]} (${pct(k.now.s)})`;
    const stChild = (k) => `детство: ${ST[k.child.status]} (${pct(k.child.s)})`;
    h.push(`<section class="block"><h2>РАС: критерии DSM-5-TR</h2>
      <p class="small muted">A: нужны все три (A1–A3). B: нужны не меньше двух из четырёх. Под каждым критерием ответы с наибольшим баллом. Ядро: ${ST[asd.core]}; B выполнено ${asd.bMet}, вероятно ещё ${asd.bProb - asd.bMet}.</p>`);
    T.push("РАС: КРИТЕРИИ DSM-5-TR", `Ядро: ${ST[asd.core]}; B выполнено ${asd.bMet}, вероятно ещё ${asd.bProb - asd.bMet}.`);
    for (const cid of [...ASD_A, ...ASD_B]) {
      const k = C[cid], d = ND.CONSTRUCTS[cid], ev = evList(ND.ITEMS.filter((it) => it.c === cid));
      h.push(crit(d.dsm, d.label, stNow(k), stChild(k), ev.html));
      T.push(`  ${d.dsm} ${d.label}: ${stNow(k)}, ${stChild(k)}`, ...ev.text);
    }
    const asdLines = [
      ["C", "Признаки с раннего развития", `${ST[asd.C]}: в детстве от «вероятно» ${asd.childHits} из 7 критериев`],
      ["D", "Клинически значимые нарушения", `${ST[asd.D]}: по сферам жизни, выгоранию (${pct(C.BURNOUT.now.s)}/100) и ответам «мешает»`],
      ["E", "Не объясняется интеллектуальным нарушением или задержкой развития", "анкетой не оценивается"],
    ];
    asdLines.forEach(([c, t, v]) => { h.push(crit(c, t, esc(v))); T.push(`  ${c} ${t}: ${v}`); });
    h.push(`<p class="small muted">Уровень поддержки, наличие интеллектуального и языкового нарушения, кататония (спецификаторы DSM-5-TR) требуют очной оценки.</p></section>`);
    T.push("");

    // СДВГ
    const symRow = (sid) => {
      const s = S[sid], items = ND.ITEMS.filter((it) => it.s === sid), main = items.find((it) => !it.fu);
      const r = R[main.id];
      return `<tr><td><b class="mono">${sid}</b> ${esc(ND.ADHD_SYMPTOMS[sid])}</td><td>${ST[s.now.status]} <span class="mono small muted">${pct(s.now.s)}</span></td><td>${ST[s.child.status]} <span class="mono small muted">${pct(s.child.s)}</span></td><td class="small muted">${r && !r.na ? esc(answerLine(r)) : "—"}</td></tr>`;
    };
    const sids = Object.keys(ND.ADHD_SYMPTOMS);
    const ctxL = CTX_LABEL();
    h.push(`<section class="block"><h2>СДВГ: критерии DSM-5-TR</h2>
      <p class="small muted">A: для взрослых (17+) нужно не меньше 5 симптомов в одной из групп, с частотой «часто» и выше. Сейчас A1 ${adhd.nA1}/9 (вероятно ещё ${adhd.nA1p - adhd.nA1}), A2 ${adhd.nA2}/9 (вероятно ещё ${adhd.nA2p - adhd.nA2}).</p>
      <div class="tbl-wrap"><table><thead><tr><th>Симптом</th><th>Сейчас</th><th>До 12 лет</th><th>Ответ на основной вопрос</th></tr></thead><tbody>${sids.map(symRow).join("")}</tbody></table></div>`);
    T.push("СДВГ: КРИТЕРИИ DSM-5-TR", `A1 ${adhd.nA1}/9 (вероятно ещё ${adhd.nA1p - adhd.nA1}), A2 ${adhd.nA2}/9 (вероятно ещё ${adhd.nA2p - adhd.nA2})`,
      ...sids.map((sid) => `  ${sid} ${ND.ADHD_SYMPTOMS[sid]}: сейчас ${ST[S[sid].now.status]} (${pct(S[sid].now.s)}), до 12 лет ${ST[S[sid].child.status]} (${pct(S[sid].child.s)})`));
    const adhdLines = [
      ["B", "Несколько симптомов до 12 лет", `${ST[adhd.B]}: выполнено ${adhd.nChild}, вероятно ${adhd.nChildP}; порог DIVA-5 (6) ${adhd.divaChild ? "достигнут" : "не достигнут"}`],
      ["C", "Проявления в двух и более обстановках", `${ST[adhd.C]}: ${adhd.contexts.length ? adhd.contexts.map((c) => ctxL[c].toLowerCase()).join(", ") : "обстановки не указаны"}`],
      ["D", "Снижают качество функционирования", ST[adhd.D]],
      ["E", "Не объясняются другим психическим расстройством", E.differential.length ? "есть флаги, см. ниже" : "флагов нет; требует клинической оценки"],
    ];
    adhdLines.forEach(([c, t, v]) => { h.push(crit(c, t, esc(v))); T.push(`  ${c} ${t}: ${v}`); });
    h.push(`</section>`);
    T.push("");

    // Функционирование
    const D = U.D_LABELS, v = (x) => (x == null ? "—" : D[x]);
    h.push(`<section class="block"><h2>Функционирование</h2><div class="tbl-wrap"><table><thead><tr><th>Сфера</th><th>Сейчас</th><th>В детстве</th></tr></thead><tbody>${Object.entries(ND.LIFE_SPHERES).map(([f, l]) => `<tr><td>${l}</td><td>${v(E.func[f].now)}</td><td>${v(E.func[f].child)}</td></tr>`).join("")}</tbody></table></div></section>`);
    T.push("ФУНКЦИОНИРОВАНИЕ (сейчас / детство)", ...Object.entries(ND.LIFE_SPHERES).map(([f, l]) => `  ${l}: ${v(E.func[f].now)} / ${v(E.func[f].child)}`), "");

    // Шкалы
    const Lg = E.legacy, LD = ND.LEGACY;
    const scales = [
      `RAADS-R ≈ ${r0(Lg.RAADS.total)}/240 (порог ${LD.RAADS.cutoff}); ` + Object.values(Lg.RAADS.subs).map((x) => `${x.label.toLowerCase()} ${r0(x.est)}`).join(", "),
      `AQ ≈ ${r0(Lg.AQ.total)}/50 (пороги ${LD.AQ.cutoffScreen} и ${LD.AQ.cutoff})`,
      `CAT-Q ≈ ${r0(Lg.CATQ.total)}/175; ` + Object.values(Lg.CATQ.subs).map((x) => `${x.label.toLowerCase()} ${r0(x.est)}`).join(", "),
      `RBQ-2A, средний балл ≈ ${Lg.RBQ.mean == null ? "—" : Lg.RBQ.mean.toFixed(2)}`,
      `ASRS v1.1: часть A ${Lg.ASRS.partA}/6 (${Lg.ASRS.partAPositive == null ? "мало ответов" : Lg.ASRS.partAPositive ? "положительный скрининг" : "ниже порога"}); невнимательность ${Lg.ASRS.inatt}/36, гиперактивность ${Lg.ASRS.hyper}/36`,
    ];
    h.push(`<section class="block"><h2>Пересчёт в шкалы оригинальных тестов</h2><ul class="stack small">${scales.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p class="small muted">Оценки по собственным формулировкам вопросов, сведённым к структуре оригиналов; нормы оригиналов применимы приблизительно.</p></section>`);
    T.push("ПЕРЕСЧЁТ В ШКАЛЫ (оценка)", ...scales.map((x) => "  " + x), "");

    // Согласованность
    h.push(`<section class="block"><h2>Согласованность ответов</h2>${E.validity.length ? E.validity.map((f) => `<div class="flag"><b>${f.severity === "hard" ? "Существенно" : "Незначительно"}</b><span>${esc(f.text)}</span></div>`).join("") : `<p>Противоречий не найдено (пар с противоположным смыслом: ${E.validity.pairsChecked || 0}).</p>`}</section>`);
    T.push("СОГЛАСОВАННОСТЬ", ...(E.validity.length ? E.validity.map((f) => `  [${f.severity === "hard" ? "существенно" : "незначительно"}] ${f.text}`) : ["  противоречий не найдено"]), "");

    // Темы для интервью
    const scored = opened.filter((it) => !it.rev && !it.kind && R[it.id] && !R[it.id].na && R[it.id].now && R[it.id].now.I >= 2);
    const topics = [
      ["Скрывает с усилием (вероятная маскировка, уточнить у близких)", scored.filter((it) => R[it.id].mask === 2)],
      ["Выражено сейчас, но детство не вспомнил(а) (нужен рассказ родителя)", scored.filter((it) => R[it.id].child && R[it.id].child.unknown)],
      ["Не уверен(а) в ответе", scored.filter((it) => R[it.id].unsure)],
      ["Выражено сейчас, в детстве не было (уточнить начало и возможные другие причины)", scored.filter((it) => R[it.id].child && R[it.id].child.I != null && R[it.id].child.I <= 0 && R[it.id].now.I >= 3)],
    ].filter(([, list]) => list.length);
    const own = ND.ITEMS.filter((it) => R[it.id]).map((it) => {
      const r = R[it.id], t = [r.note, r.now && r.now.custom && r.now.text && "сейчас: " + r.now.text, r.child && r.child.custom && r.child.text && "детство: " + r.child.text].filter((x) => x && x.trim());
      return t.length ? [it, t] : null;
    }).filter(Boolean);
    const lim = (list) => list.slice(0, 8);
    h.push(`<section class="block"><h2>Что уточнить на интервью</h2>${topics.length ? topics.map(([t, list]) => `<h3>${esc(t)}: ${list.length}</h3><ul class="small stack">${lim(list).map((it) => `<li>${esc(it.t)}</li>`).join("")}${list.length > 8 ? `<li class="muted">и ещё ${list.length - 8}</li>` : ""}</ul>`).join("") : `<p class="muted">Особых тем не найдено.</p>`}
      ${own.length ? `<h3>Ответы своими словами: ${own.length}</h3><ul class="small stack">${own.map(([it, t]) => `<li><span class="muted">${esc(it.t)}</span><br>${t.map(esc).join("<br>")}</li>`).join("")}</ul>` : ""}</section>`);
    T.push("ЧТО УТОЧНИТЬ НА ИНТЕРВЬЮ", ...topics.flatMap(([t, list]) => [`  ${t}: ${list.length}`, ...lim(list).map((it) => `    – ${it.t}`)]),
      ...(own.length ? ["  Ответы своими словами:", ...own.map(([it, t]) => `    – ${it.t}: ${t.join("; ")}`)] : []), "");

    // Сильные стороны
    const th = ND.PARAMS.thetaLo, strong = E.strengths.filter((x) => x.s >= th);
    if (E.strengths.length) {
      const byId = (id) => ND.ITEMS.find((x) => x.id === id);
      h.push(`<section class="block"><h2>Сильные стороны (самоотчёт, не валидировано)</h2>
        ${strong.length ? strong.map((x) => `<div class="crit"><div class="crit-head"><b>${esc(x.label)}</b><span class="small">сейчас ${pct(x.s)}${x.child != null ? `, в детстве ${pct(x.child)}` : ""}</span></div>
          <ul class="ev">${x.items.map((id) => `<li>${esc(byId(id).t)}<br><span class="muted small">${esc(answerLine(R[id]))}</span></li>`).join("")}</ul>
          ${x.also.length ? `<p class="small muted">Та же черта в анкете как трудность: ${x.also.map((id) => `«${esc(byId(id).t.replace(/\.$/, ""))}»`).join("; ")}.</p>` : ""}</div>`).join("") : `<p class="muted">Выраженных сильных сторон по ответам нет.</p>`}
        <p class="small muted">Пригодится для формулировки рекомендаций и выбора опор в работе с пациентом. В индексы и критерии не входит.</p></section>`);
      T.push("СИЛЬНЫЕ СТОРОНЫ (не валидировано, в индексы не входит)",
        ...(strong.length ? strong.flatMap((x) => [`  ${x.label}: сейчас ${pct(x.s)}${x.child != null ? `, в детстве ${pct(x.child)}` : ""}`,
          ...x.items.map((id) => `    – ${byId(id).t} [${answerLine(R[id])}]`)]) : ["  выраженных нет"]), "");
    }

    // Следующие шаги
    const steps = [];
    if (asd.level !== "none") steps.push("ADOS-2 (модуль 4) и ADI-R или другое интервью о развитии с родителем либо человеком, знавшим пациента в детстве.");
    if (adhd.level !== "none") steps.push("DIVA-5 с информантом; школьные характеристики или табели, если сохранились.");
    E.differential.forEach((d) => steps.push(`${d.label}: ${d.note}`));
    if (hard) steps.push("Ответы противоречивы: перед интерпретацией обсудить с пациентом спорные пары вопросов.");
    if (!steps.length) steps.push("По самоотчёту выраженных признаков нет; дальнейшая оценка по клиническим показаниям.");
    h.push(`<section class="block"><h2>Предлагаемые следующие шаги</h2><ul class="stack">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>`);
    T.push("СЛЕДУЮЩИЕ ШАГИ", ...steps.map((s) => "  – " + s));

    return { html: h.join("\n"), text: T.join("\n") };
  }

  return { build, answerLine, evidence };
})();
