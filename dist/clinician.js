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
      if (x.unknown) return p === "now" ? "не знает" : "не помнит";
      if (x.I == null) return x.custom ? "только свой ответ" : "нет ответа";
      return U.I_LABELS[x.I].toLowerCase() + (x.F ? ", " + F[x.F].toLowerCase() : "");
    };
    const parts = [`сейчас: ${per("now")}`, ...(r.child ? [`детство: ${per("child")}`] : [])];
    // где, мешает и видно ли учитываются только при «частично» и выше (старые сохранённые ответы могут их содержать)
    if (r.now && r.now.I >= 2) {
      if (r.mask === 1) parts.push("частично сдерживает");
      if (r.mask === 2) parts.push("скрывает с усилием");
      if (r.maskUnk) parts.push("видно ли со стороны: не знает");
      if (r.harm >= 1) parts.push("мешает " + U.D_LABELS[r.harm].toLowerCase());
      if (r.harmUnk) parts.push("мешает ли: не знает");
      if (r.ctx && r.ctx.length) parts.push("где: " + r.ctx.map((c) => CTX_LABEL()[c].toLowerCase()).join(", "));
      if (r.ctxUnk) parts.push("где: не знает");
    }
    return parts.join(" · ");
  }

  // Одна часть противоречия (см. scoring validity → details.refs): текст вопроса и выбранный ответ
  function refAnswer(ref, R) {
    const U = ND.UI, F = Object.fromEntries(U.F_OPTS), r = R[ref.id] || {};
    const it = ND.ITEMS.find((x) => x.id === ref.id);
    if (ref.fields.includes("spheres")) {
      const sp = Object.entries(ND.LIFE_SPHERES).map(([f, l]) => { const x = R[f] && R[f].now; return x && x.D != null ? `${l.toLowerCase()}: ${U.D_LABELS[x.D].toLowerCase()}` : null; }).filter(Boolean);
      return { q: "Итоговые вопросы «Влияние на жизнь»", a: sp.join("; ") };
    }
    const parts = [];
    if (ref.fields.includes("I")) {
      const one = (p) => { const x = r[p]; return x && x.I != null ? U.I_LABELS[x.I] + (x.F ? ", " + F[x.F].toLowerCase() : "") : "нет ответа"; };
      const ps = ref.periods || [ref.period];
      parts.push(ps.map((p) => (p === "child" ? "в детстве: " : "сейчас: ") + one(p)).join("; ").replace(/^./, (c) => c.toUpperCase()));
    }
    if (ref.fields.includes("harm")) parts.push("мешает: " + U.D_LABELS[r.harm || 0].replace("Не мешали", "не мешает").toLowerCase());
    if (ref.fields.includes("mask")) parts.push("видно ли со стороны: " + U.MASK[r.mask || 0].toLowerCase());
    return { q: it ? it.t : ref.id, a: parts.join(" · ") };
  }

  // Степень согласованности одной строкой
  function summaryLine(V) {
    const s = V.summary || { checks: 0, conflicts: 0, strong: 0 };
    if (!s.checks) return "Сопоставлять пока нечего: ответов слишком мало.";
    return `Проверено сопоставлений ответов: ${s.checks}. Противоречий: ${s.conflicts}` + (s.conflicts ? ` (${Math.round(s.share * 100)}%, из них сильных: ${s.strong}).` : ".");
  }
  const STRENGTH = { strong: "Сильное противоречие", moderate: "Противоречие" };
  // Одно противоречие: вопросы с ответами и объяснение. goto — показать кнопку перехода к вопросу.
  function conflictHtml(d, R, goto) {
    const rows = d.refs.map((ref) => {
      const x = refAnswer(ref, R);
      const btn = goto && !ref.fields.includes("spheres") ? `<button class="btn ghost small no-print" data-act="goto" data-id="${esc(ref.id)}">Изменить ответ</button>` : "";
      return `<li><span class="cq">${esc(x.q)}</span><span class="ca mono">${esc(x.a)}</span>${btn}</li>`;
    }).join("");
    const label = STRENGTH[d.strength];
    return `<div class="conflict ${d.strength}"><b>${label}</b><ul>${rows}</ul><p class="small muted">${esc(d.why)}</p></div>`;
  }
  function conflictText(d, R) {
    return [...d.refs.map((ref) => { const x = refAnswer(ref, R); return `• ${x.q} → ${x.a}`; }), `  ${d.why}`];
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

  // Одна строка о шкале: сумма и степень (PHQ-9, GAD-7, PAQ) или средний балл без порогов (ABSI)
  function scaleLine(x, short) {
    const head = short ? "" : `${x.name}: `;
    if (x.mean) return head + `средний балл ${String(x.score).replace(".", ",")} из 7 (выше — тяжелее, порогов нет)`;
    return head + (short ? `${x.score}/${x.max}` : `${x.score} из ${x.max}`) + (x.d === "alexithymia" ? `, ${x.band} алекситимия` : `, ${x.band} степень`);
  }

  function build(R, lab) {
    const U = ND.UI, E = ND.scoring.evaluate(R), O = ND.scoring.overall(E), ST = U.ST_LABEL;
    const C = E.constructs, S = E.symptoms, asd = E.asd, adhd = E.adhd;
    const sc = Object.keys(ND.SCALES).map((k) => E.scales[k]).filter((x) => x.answered);
    const co = ND.ITEMS.filter((it) => it.kind === "comorb" && R[it.id] && !R[it.id].na && R[it.id].now && R[it.id].now.I === 0);
    const opened = ND.ITEMS.filter((it) => ND.eligible(it, R));
    const answered = opened.filter((it) => R[it.id] && (R[it.id].na || R[it.id].h != null || (R[it.id].now && (R[it.id].now.I != null || R[it.id].now.D != null || R[it.id].now.unknown)))).length;
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
      <tr><td>Общий вывод</td><td><b>${esc(O.title)}</b>${O.adhdType ? `<br>${esc(O.adhdType)}` : ""}</td></tr>
      <tr><td>РАС</td><td>${L(asd.level)}, индекс ${asd.index}/100${asd.indexRaw > asd.index ? ` (ограничен; без ограничения ${asd.indexRaw})` : ""}</td></tr>
      <tr><td>СДВГ</td><td>${L(adhd.level)}, индекс ${adhd.index}/100${adhd.indexRaw > adhd.index ? ` (ограничен; без ограничения ${adhd.indexRaw})` : ""}${adhd.presentation ? `, ${adhd.presentation}` : ""}</td></tr>
      <tr><td>Согласованность</td><td>${consist} (проверено пар: ${E.validity.pairsChecked || 0})</td></tr>
      <tr><td>Камуфляж</td><td>${pct(C.CAMO.now.s)}/100; CAT-Q (пересчёт) ${r0(E.legacy.CATQ.total)}/175</td></tr>
      ${sc.map((x) => `<tr><td>${x.name}</td><td>${x.score == null ? `неполные ответы (${x.answered} из ${x.n})` : esc(scaleLine(x, true))}</td></tr>`).join("")}
      ${E.scales.safety ? `<tr><td><b>PHQ-9, пункт 9</b></td><td><b>Отмечены мысли о смерти или самоповреждении: требуется оценка риска</b></td></tr>` : ""}
      ${co.length ? `<tr><td>Сопутствующие состояния (со слов)</td><td>${co.map((it) => esc(it.t.replace(/\.$/, ""))).join("; ")}</td></tr>` : ""}
      <tr><td>Дифференциальные флаги</td><td>${E.differential.length ? E.differential.map((d) => esc(d.label) + (d.lateOnset ? " (начало не в детстве)" : "")).join("; ") : "нет"}</td></tr>
    </tbody></table></div></section>`);
    T.push("СВОДКА", `Общий вывод: ${O.title}${O.adhdType ? ". " + O.adhdType : ""}`, `РАС: ${L(asd.level)}, индекс ${asd.index}/100`,
      `СДВГ: ${L(adhd.level)}, индекс ${adhd.index}/100${adhd.presentation ? ", " + adhd.presentation : ""}`,
      `Согласованность: ${consist}`, `Камуфляж: ${pct(C.CAMO.now.s)}/100`,
      ...sc.map((x) => `${x.name}: ${x.score == null ? `неполные ответы (${x.answered} из ${x.n})` : scaleLine(x, true)}`),
      ...(E.scales.safety ? ["PHQ-9, пункт 9: отмечены мысли о смерти или самоповреждении, требуется оценка риска"] : []),
      ...(co.length ? [`Сопутствующие состояния (со слов): ${co.map((it) => it.t.replace(/\.$/, "")).join("; ")}`] : []),
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
      const note = ND.explain ? (ND.explain.construct(cid, E, R).find((w) => w.period === "note") || {}).text : "";
      h.push(crit(d.dsm, d.label, stNow(k), stChild(k), ev.html + (note ? `<p class="small"><b>Учесть:</b> ${esc(note)}</p>` : "")));
      T.push(`  ${d.dsm} ${d.label}: ${stNow(k)}, ${stChild(k)}`, ...ev.text, ...(note ? [`    Учесть: ${note}`] : []));
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

    // Дополнительные шкалы (не входят в РАС и СДВГ) и сопутствующие состояния
    const f1 = (v) => String(v).replace(".", ",");
    const extra = [];
    const P = E.scales.PAQ, A = E.scales.ABSI;
    if (P && P.score != null) extra.push([`PAQ (алекситимия, Preece 2018; рус. Ларионов 2023): ${P.score}/168, ${P.band}`,
      Object.values(P.subs).map((x) => `${x.label}: ${x.score == null ? "—" : `${x.score}/${x.max}, ${x.band}`}`)]);
    if (A && A.gate === 1) extra.push(["ABSI (аутистическое выгорание): со слов, выгорания не было", []]);
    else if (A && A.score != null) extra.push([`ABSI (аутистическое выгорание, Arnold 2023, неофициальный перевод): среднее ${f1(A.score)} из 7, выше — тяжелее; порогов нет`,
      Object.values(A.subs).map((x) => `${x.label}: ${x.score == null ? "—" : f1(x.score)}`)]);
    const AC = E.scales.ACI;
    if (AC && AC.score != null) extra.push([`ACI (вялый когнитивный темп, Becker 2018, неофициальный перевод): среднее ${AC.score.toFixed(2).replace(".", ",")} из 3; порогов нет, общая выборка взрослых США ${f1(AC.ref)} ± ${f1(AC.refSd)} (Fredrick 2021)`, []]);
    const TRL = { 0: "нет", 1: "отчасти", 2: "да" };
    const tr = ND.ITEMS.filter((it) => it.kind === "trait" && !it.opts && R[it.id] && !R[it.id].na && R[it.id].now && R[it.id].now.I >= 1);
    if (tr.length) {
      const dep = R["TR-6"], depI = dep && dep.now && ND.eligible(ND.ITEMS.find((x) => x.id === "TR-6"), R) ? dep.now.I : null;
      const DEP = ["хочется, но не получается начать", "ничего не хочется", "по-разному", "не знает"];
      extra.push(["Черты вне DSM (самоотчёт, в подсчёт не входят)", tr.map((it) => `${ND.TRAITS[it.tr].label}: ${TRL[Math.min(2, R[it.id].now.I)]}`).concat(depI != null ? [`Инерция при PHQ-9 ≥ 10: ${DEP[Math.min(3, depI)]}`] : [])]);
    }
    if (extra.length || co.length) {
      h.push(`<section class="block"><h2>Дополнительные шкалы и сопутствующие состояния</h2>
        ${extra.map(([t, l]) => `<p><b>${esc(t)}</b></p>${l.length ? `<ul class="small stack">${l.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`).join("")}
        ${co.length ? `<p><b>Сопутствующие состояния (со слов): ${co.length}</b></p><ul class="small stack">${co.map((it) => `<li>${esc(it.t)}<br><span class="muted">${it.co.map((c) => esc(`${c.g}: ${c.t}`)).join(" ")}</span></li>`).join("")}</ul>` : ""}
        <p class="small muted">На критерии и индексы РАС и СДВГ не влияют. Высокая алекситимия может частично объяснять трудности в A1–A2; выгорание по ABSI не отделяется от депрессии, смотреть вместе с PHQ-9.</p></section>`);
      T.push("ДОПОЛНИТЕЛЬНЫЕ ШКАЛЫ И СОПУТСТВУЮЩИЕ СОСТОЯНИЯ", ...extra.flatMap(([t, l]) => ["  " + t, ...l.map((x) => "    – " + x)]),
        ...(co.length ? ["  Сопутствующие состояния (со слов):", ...co.map((it) => "    – " + it.t)] : []), "");
    }

    // Согласованность
    const V = E.validity;
    h.push(`<section class="block"><h2>Согласованность ответов</h2><p>${esc(summaryLine(V))}</p>${V.map((f) => `<div class="flag"><b>${f.severity === "hard" ? "Существенно" : "Незначительно"}</b><span>${esc(f.text)}</span></div>${(f.details || []).map((d) => conflictHtml(d, R)).join("")}`).join("")}</section>`);
    T.push("СОГЛАСОВАННОСТЬ", "  " + summaryLine(V), ...V.flatMap((f) => [`  [${f.severity === "hard" ? "существенно" : "незначительно"}] ${f.text}`, ...(f.details || []).flatMap((d) => conflictText(d, R).map((x) => "    " + x))]), "");

    // Раннее развитие и семья (со слов, в подсчёт не входит)
    const HX = ND.insights ? ND.insights.history(R) : { rows: [], notes: [] };
    if (HX.rows.length) {
      h.push(`<section class="block"><h2>Раннее развитие и семья (со слов)</h2><div class="tbl-wrap"><table><tbody>${HX.rows.map((x) => `<tr><td>${esc(x.t)}</td><td>${x.flagged ? "<b>" : ""}${esc(x.answer)}${x.flagged ? "</b>" : ""}</td></tr>`).join("")}</tbody></table></div>
        ${HX.notes.map((n) => `<p class="small muted">${esc(n.text)}</p>`).join("")}</section>`);
      T.push("РАННЕЕ РАЗВИТИЕ И СЕМЬЯ (со слов, в подсчёт не входит)", ...HX.rows.map((x) => `  ${x.t}: ${x.answer}`), "");
    }
    // Карта масок: где и что пациент скрывает (по полям «где проявляется» и «видно ли со стороны»)
    const MM = ND.insights ? ND.insights.maskMap(E, R) : { n: 0 };
    if (MM.n >= 3) {
      const pl = MM.places.map((x) => `${x.label.toLowerCase()} ${x.hidden}/${x.n}`).join(", ");
      const ar = MM.areas.map((x) => `${x.label.toLowerCase()} ${x.hidden}/${x.n}`).join(", ");
      h.push(`<section class="block"><h2>Карта масок (самоотчёт)</h2><p>Скрывает ${MM.hidden} из ${MM.n} признаков с ответом «видно ли со стороны», с усилием ${MM.effort}.</p><p class="small">По обстановке: ${esc(pl)}.<br>По сферам: ${esc(ar)}.</p><p class="small muted">Вопрос о видимости задан про признак в целом, а не про каждую обстановку, поэтому распределение приблизительное.</p></section>`);
      T.push("КАРТА МАСОК (самоотчёт)", `  Скрывает ${MM.hidden} из ${MM.n} признаков, с усилием ${MM.effort}`, `  По обстановке: ${pl}`, `  По сферам: ${ar}`, "");
    }

    // Лаборатория: необязательные мини-эксперименты, в подсчёт не входят
    if (lab && ND.lab) {
      const PS = ND.lab.probeSummary(lab.probes), DD = ND.lab.discount(lab.dd || {});
      const rows = [], tx = [];
      if (PS.enough) {
        const line = `Пробы «где были мысли»: ${PS.rated} с ответом, не на задании ${PS.off} (${Math.round(PS.share * 100)}%, из них «пусто» ${PS.blank}); само ${PS.spont}, намеренно ${PS.delib}` + (PS.first != null ? `; первая половина ${Math.round(PS.first * 100)}%, вторая ${Math.round(PS.second * 100)}%` : "");
        rows.push(line); tx.push("  " + line);
      }
      if (DD.complete) {
        const line = `«Сейчас или потом» (подстройка суммы, 10 000 ₽, гипотетически): точки безразличия ${DD.points.map((p) => `${p.label.replace("через ", "")} ${p.ip} ₽`).join(", ")}; AUC ${DD.auc.toFixed(2)}` + (DD.jumps ? `; непоследовательных скачков: ${DD.jumps}` : "");
        rows.push(line); tx.push("  " + line);
      }
      const r0_ = (x) => (x == null ? "—" : Math.round(x));
      const RTs = ND.lab.rtSummary(lab.rt), TPs = ND.lab.tpSummary(lab.tp), LDs = ND.lab.loadSummary(lab.load), NVs = ND.lab.navonSummary(lab.navon);
      const add = (line) => { rows.push(line); tx.push("  " + line); };
      if (RTs.done) add(RTs.enough
        ? `Простая реакция (${RTs.valid}/${RTs.n} засчитано): медиана ${r0_(RTs.median)} мс, среднее ${r0_(RTs.mean)} мс, SD ${r0_(RTs.sd)} мс, CV ${RTs.cv.toFixed(2)}; медленных (≥2× медианы) ${RTs.slow}; заранее ${RTs.early}, пропусков ${RTs.miss}` + (RTs.cv1 != null ? `; CV 1-я/2-я половина ${RTs.cv1.toFixed(2)}/${RTs.cv2.toFixed(2)}` : "")
        : `Простая реакция: засчитано только ${RTs.valid} из ${RTs.n}, разброс не рассчитан`);
      if (TPs.done) add(`Отмеривание интервалов: ${TPs.items.map((t) => `${t.target}→${t.produced} с`).join(", ")}; отношение (геом. среднее) ${TPs.gm.toFixed(2)}, средняя ошибка ${Math.round(TPs.err * 100)}%` + (lab.tpCounted ? "; считал(а) про себя" : ""));
      if (LDs.done) add(`Перцептивная нагрузка: обнаружение квадрата низкая/высокая ${Math.round(LDs.low.hit * 100)}%/${Math.round(LDs.high.hit * 100)}% (ложные ${Math.round(LDs.low.fa * 100)}%/${Math.round(LDs.high.fa * 100)}%), точность букв ${Math.round(LDs.low.acc * 100)}%/${Math.round(LDs.high.acc * 100)}%` + (LDs.unreliable ? "; много ложных обнаружений" : "") + (LDs.guessing ? "; при высокой нагрузке на уровне угадывания" : ""));
      if (NVs.done) add(`Фигуры Навона: медиана глоб./лок. ${r0_(NVs.global.rt)}/${r0_(NVs.local.rt)} мс (глоб. преимущество ${r0_(NVs.globalAdv)} мс), точность ${Math.round(NVs.global.acc * 100)}%/${Math.round(NVs.local.acc * 100)}%, интерференция глоб.→лок. ${r0_(NVs.local.interf)} мс, лок.→глоб. ${r0_(NVs.global.interf)} мс` + (NVs.enough ? "" : "; много ошибок, ненадёжно"));
      const V = [["Мысли", ND.lab.verdict("probe", PS)], ["Сейчас или потом", ND.lab.verdict("dd", DD)], ["Реакция", RTs.done ? ND.lab.verdict("rt", RTs) : null],
        ["Интервалы", TPs.done ? ND.lab.verdict("tp", { ...TPs, counted: !!lab.tpCounted }) : null], ["Нагрузка", LDs.done ? ND.lab.verdict("load", LDs) : null], ["Навон", NVs.done ? ND.lab.verdict("navon", NVs) : null]].filter(([, v]) => v);
      const SPs = ND.lab.spanSummary(lab.span), TAs = ND.lab.tapSummary(lab.tap), PIs = ND.lab.pitchSummary(lab.pitch), TRs = ND.lab.traceSummary(lab.trace);
      const f2 = (x) => (x == null ? "—" : x.toFixed(2).replace(".", ","));
      if (SPs.done) add(`Цифровой ряд: прямой ${SPs.fwd == null ? "—" : SPs.fwd}, обратный ${SPs.bwd == null ? "—" : SPs.bwd} (наибольшая длина с хотя бы одним верным повтором)`);
      if (TAs.done) add(`Стук в ритм (700 мс): асинхронность с тактом ${r0_(TAs.asynMean)} ± ${r0_(TAs.asynSd)} мс; без такта средний интервал ${r0_(TAs.itiMean)} мс, CV ${f2(TAs.cv)}` + (TAs.drift != null ? `, темп ${Math.round(TAs.drift * 100)}% от заданного` : "") + (TAs.enough ? "" : "; мало данных"));
      if (PIs.done) add(`Различение высоты (1000 Гц, лестница 2-вниз/1-вверх): порог ${PIs.thr == null ? "—" : PIs.thr.toFixed(2).replace(".", ",") + "%"}; точность на лёгких шагах ${PIs.easyAcc == null ? "—" : Math.round(PIs.easyAcc * 100) + "%"}` + (PIs.enough ? "" : "; ненадёжно"));
      if (TRs.done) add(`Обведение дорожки: вне дорожки ${Math.round(TRs.out * 100)}% пути, среднее отклонение ${f2(TRs.dev)} полуширины, ${r0_(TRs.time)} с на дорожку, отрывов ${TRs.lifts}` + (TRs.pointer ? ` (${TRs.pointer === "touch" ? "палец" : TRs.pointer === "pen" ? "стилус" : "мышь"})` : ""));
      V.push(...[["Цифровой ряд", SPs.done ? ND.lab.verdict("span", SPs) : null], ["Ритм", TAs.done ? ND.lab.verdict("tap", TAs) : null], ["Высота звука", PIs.done ? ND.lab.verdict("pitch", PIs) : null], ["Линия", TRs.done ? ND.lab.verdict("trace", TRs) : null]].filter(([, v]) => v));
      if (V.length) add(`Выводы (ориентир, не норма): ${V.map(([k, v]) => `${k} — ${v.title.toLowerCase()}`).join("; ")}`);
      V.filter(([, v]) => v.you).forEach(([k, v]) => add(`${k}, в контексте РАС/СДВГ: ${v.you}`));
      const DV = lab.dev || {}, bad = Object.entries(DV).filter(([, d]) => d && !d.ok);
      if (bad.length) add(`Устройство: ${bad.map(([k, d]) => `${k} — ${d.issues.join(", ")}`).join("; ")}; результаты этих заданий могут быть искажены`);
      if (ND.views) {
        const sums = { probe: PS, dd: DD, rt: RTs, tp: { ...TPs, counted: !!lab.tpCounted }, load: LDs, navon: NVs, span: SPs, tap: TAs, pitch: PIs, trace: TRs };
        const vs = {}; for (const k of Object.keys(sums)) vs[k] = sums[k] && (sums[k].done || sums[k].complete || sums[k].enough) ? ND.lab.verdict(k, sums[k]) : null;
        const WDr = ND.views.wordsDeeds(R, sums, vs);
        if (WDr.length) add(`Анкета и задания: ${WDr.map((x) => `${x.what.toLowerCase()} — анкета ${x.qHi ? "выражено" : "нет"}, задание ${x.tHi ? "выражено" : "нет"} (${x.agree ? "совпадает" : "расходится"})`).join("; ")}`);
      }
      if (rows.length) {
        h.push(`<section class="block"><h2>Лаборатория (экспериментально)</h2><ul class="small stack">${rows.map((r) => `<li>${esc(r)}</li>`).join("")}</ul><p class="small muted">Необязательные задания в браузере. Норм для взрослых в России нет, в индексы и критерии не входят. Пробы: Seli et al., 2015. Обесценивание: Du, Green & Myerson, 2002; AUC по Myerson et al., 2001. Изменчивость реакции: Kofler et al., 2013. Интервалы: Marx et al., 2021. Нагрузка: Remington, Swettenham & Lavie, 2012. Навон: Navon, 1977; van der Hallen et al., 2015. Цифровой ряд: Pievsky & McGrath, 2018; Wang et al., 2017. Ритм: Hove et al., 2017; Kasten, Jacoby & Ahissar, 2023. Высота звука: Bonnel et al., 2003, 2010. Моторика: Kaiser et al., 2015; Fournier et al., 2010. Связь анкет и заданий слабая (Toplak, West & Stanovich, 2013).</p></section>`);
        T.push("ЛАБОРАТОРИЯ (экспериментально, в подсчёт не входит)", ...tx, "");
      }
    }

    // v0.13: сенсорика, исполнительные функции, компенсация, желание общаться (самоотчёт, в подсчёт не входит)
    if (ND.views) {
      const VW = [], P_ = (x) => (x == null ? "—" : pct(x));
      const SN = ND.views.sensory(R); // порог высоты звука — в разделе лаборатории
      if (SN.answered >= 3) VW.push(["Сенсорный профиль по каналам", SN.rows.filter((x) => x.now != null).map((x) => `${x.label}: ${P_(x.now)}${x.child != null ? ` (детство ${P_(x.child)})` : ""}${x.types.length ? ", " + x.types.map((t) => ND.views.TYPE_LABEL[t]).join(", ") : ""}`)]);
      const EFv = ND.views.ef(R);
      if (EFv.rows.length >= 3) VW.push(["Исполнительные функции (области Баркли, наше распределение вопросов)", EFv.rows.map((x) => `${x.label}: ${P_(x.now)}${x.child != null ? ` (детство ${P_(x.child)})` : ""}`)]);
      const KV = ND.views.compensation(R);
      if (KV.n || KV.lighter.length) VW.push([`Признаки детства, ослабевшие сейчас: компенсировано ${KV.learned.length}, на усилии ${KV.effort.length}, просто легче ${KV.lighter.length}` + (KV.effort.length && (KV.cost.fatigue || KV.cost.burnout) ? "; при этом отмечены усталость после общения или истощение" : ""),
        [...KV.effort.map((x) => `[на усилии] ${x.t} (детство ${x.child}, сейчас ${x.now} из 4)`), ...KV.learned.map((x) => `[компенсировано] ${x.t} (детство ${x.child}, сейчас ${x.now} из 4)`)].slice(0, 10)]);
      const WN = ND.views.want(R);
      if (WN.rows.length) VW.push([`Мотивация к общению: ${WN.kind === "want" ? "хочет, но трудно" : WN.kind === "content" ? "в основном не хочет больше общения" : "смешанно"} (да ${WN.yes}, нет ${WN.no}, по-разному ${WN.mix})` + (WN.kind !== "want" && E.scales.PHQ9 && E.scales.PHQ9.positive ? "; учесть PHQ-9 ≥ 10 (ангедония?)" : ""), WN.rows.map((x) => `${x.t}: ${x.label.toLowerCase()}`)]);
      if (VW.length) {
        h.push(`<section class="block"><h2>Дополнительные профили (самоотчёт)</h2>${VW.map(([t, l]) => `<p><b>${esc(t)}</b></p>${l.length ? `<ul class="small stack">${l.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`).join("")}
          <p class="small muted">Пересказ тех же ответов в другом разрезе; в индексы и критерии не входит. Каналы — по образцу Glasgow Sensory Questionnaire (Robertson & Simmons, 2013); области исполнительных функций — по модели BDEFS (Barkley, 2011), сама шкала не используется. Компенсация: Livingston, Shah & Happé, 2019. Мотивация: Jaswal & Akhtar, 2019.</p></section>`);
        T.push("ДОПОЛНИТЕЛЬНЫЕ ПРОФИЛИ (самоотчёт, в подсчёт не входит)", ...VW.flatMap(([t, l]) => ["  " + t, ...l.map((x) => "    – " + x)]), "");
      }
    }

    // Темы для интервью
    const scored = opened.filter((it) => !it.rev && !it.kind && R[it.id] && !R[it.id].na && R[it.id].now && R[it.id].now.I >= 2);
    const topics = [
      ["Скрывает с усилием (вероятная маскировка, уточнить у близких)", scored.filter((it) => R[it.id].mask === 2)],
      ["Выражено сейчас, но детство не вспомнил(а) (нужен рассказ родителя)", scored.filter((it) => R[it.id].child && R[it.id].child.unknown)],
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

  return { build, scaleLine, answerLine, evidence, refAnswer, conflictHtml, conflictText, summaryLine };
})();
