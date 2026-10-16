// Интерфейс ND-Screen: вступление → вопросы → отчёт. Состояние хранится в localStorage этого браузера.
(function () {
  const ST = ND.ST;
  const KEY = "nd-screen-v0.2";
  const app = document.getElementById("app");

  const I_LABELS = ["Совсем нет", "Скорее нет", "Частично", "В основном да", "Полностью да"];
  const F_OPTS = [["rare", "Редко"], ["some", "Иногда"], ["often", "Часто"], ["always", "Почти всегда"]];
  const D_LABELS = ["Не мешали", "Немного", "Заметно", "Сильно"];
  const CTX = [["home", "Дома"], ["work", "Работа или учёба"], ["friends", "С друзьями"], ["strangers", "С незнакомыми"], ["alone", "Наедине с собой"]];
  const MASK = ["Нет, это видно", "Частично сдерживаю", "Полностью скрываю, с усилием"];
  const PERIOD_LABEL = { now: "Сейчас, во взрослой жизни", child: "В детстве, до 12 лет" };
  const ST_LABEL = { met: "выполнен", probable: "вероятно", no: "нет", nodata: "нет данных" };
  const LEVEL = {
    high: ["Высокое соответствие", "Признаки по самоотчёту соответствуют критериям DSM-5-TR."],
    unreliable: ["Соответствие под вопросом", "Все критерии выполнены, но в ответах много противоречий, поэтому уверенно сказать нельзя. См. блок «Согласованность ответов»."],
    partial: ["Частичное соответствие", "Часть критериев выполнена или выполнена не полностью."],
    subclinical: ["Отдельные черты", "Есть выраженные черты, но картина не складывается в критерии."],
    none: ["Не соответствует", "Признаки ниже порогов критериев."],
  };
  ND.UI = { I_LABELS, F_OPTS, D_LABELS, CTX, MASK, ST_LABEL, LEVEL };
  const embedded = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  let state = load() || fresh();
  let shownAt = Date.now();
  let confirmReset = false;

  function fresh() { return { R: {}, idx: 0, view: "intro", sample: false }; }
  function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function save() { if (state.sample) return; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const ITEMS = ND.ITEMS;
  const resp = (id) => (state.R[id] = state.R[id] || { now: {}, child: {} });
  const isSimple = (it) => it.rev || it.kind === "diff" || it.kind === "strength";
  const open = (it) => ND.eligible(it, state.R);
  const openItems = () => ITEMS.filter(open);
  const nextOpen = (from, dir) => { for (let j = from + dir; j >= 0 && j < ITEMS.length; j += dir) if (open(ITEMS[j])) return j; return -1; };

  function answered(it) {
    const r = state.R[it.id];
    if (!r) return false;
    if (r.na) return true;
    const f = it.kind === "func" ? "D" : "I";
    const ok = (p) => p && (p[f] != null || p.unknown || (p.custom && (p.text || "").trim()));
    return ok(r.now) && ok(r.child);
  }

  // ───────── render ─────────
  function render() {
    if (state.view === "intro") renderIntro();
    else if (state.view === "q") renderQ();
    else if (state.view === "clin") renderClin();
    else renderReport();
  }

  function renderIntro() {
    const done = openItems().filter(answered).length;
    app.innerHTML = `
      <div class="wrap intro">
        <span class="eyebrow">Экспериментальный скрининг · версия 0.4</span>
        <h1>ND-Screen</h1>
        <p>Анкета о признаках аутизма (РАС) и СДВГ у взрослых. Она собирает содержание RAADS-R, AQ, CAT-Q, ASRS, RBQ-2A и доменов ADOS-2, ADI-R, DIVA-5 и сводит ответы к критериям DSM-5-TR.</p>
        <p>Вместо «да» или «нет» на каждый вопрос можно ответить точнее:</p>
        <div class="axis-demo">
          <div><b>Насколько</b><span class="muted small">от «совсем нет» до «полностью», включая «частично»</span></div>
          <div><b>Как часто</b><span class="muted small">редко, иногда, часто, почти всегда</span></div>
          <div><b>Когда</b><span class="muted small">отдельно сейчас и в детстве до 12 лет</span></div>
          <div><b>Своими словами</b><span class="muted small">если ни один вариант не подходит, опишите сами; есть и «не помню»</span></div>
        </div>
        <ul class="muted small">
          <li>От ${ITEMS.filter((x) => !x.fu).length} до ${ITEMS.length} вопросов: уточняющие появляются, только если признак у вас есть. Примерно 25–45 минут. Можно прерваться: ответы сохраняются в этом браузере и никуда не отправляются.</li>
          <li>Результат описывает, насколько ответы соответствуют критериям. Это материал для разговора со специалистом, а не диагноз: ADOS-2 и ADI-R проводятся только очно.</li>
          <li>Под каждым вопросом есть пояснение с примерами. Если вопрос всё равно непонятен или не про вас, есть кнопка «Неприменимо».</li>
          <li>В конце будет отдельный отчёт для специалиста: по критериям DSM-5-TR, с вашими ответами под каждым критерием.</li>
        </ul>
        <div class="row">
          <button class="btn primary" data-act="start">${done ? `Продолжить (отвечено ${done})` : "Начать анкету"}</button>
          <button class="btn" data-act="sample">Посмотреть пример отчёта</button>
          ${done ? `<button class="btn ghost" data-act="report">Отчёт по текущим ответам</button>` : ""}
        </div>
      </div>`;
  }

  function scaleBtns(p, val, labels, field, cls = "") {
    return `<div class="scale ${cls}" role="group">${labels.map((l, i) =>
      `<button class="opt" data-act="set" data-p="${p}" data-f="${field}" data-v="${i}" aria-pressed="${val === i}">${l}</button>`).join("")}</div>`;
  }

  function periodBlock(it, r, p) {
    const pr = r[p] || {};
    const isFunc = it.kind === "func";
    const val = isFunc ? pr.D : pr.I;
    let html = `<fieldset class="period"><legend>${PERIOD_LABEL[p]}</legend>`;
    html += isFunc ? scaleBtns(p, val, D_LABELS, "D", "four") : scaleBtns(p, val, I_LABELS, "I");
    html += `<div class="chips">
      <button class="chip" data-act="custom" data-p="${p}" aria-pressed="${!!pr.custom}">Свой ответ</button>
      <button class="chip" data-act="unknown" data-p="${p}" aria-pressed="${!!pr.unknown}">Не помню</button></div>`;
    if (pr.custom) html += `<div class="sub"><label class="sub-label" for="text-${it.id}-${p}">Опишите своими словами. Если можете, отметьте и вариант выше: тогда ответ попадёт в подсчёт баллов.</label>
      <textarea id="text-${it.id}-${p}" data-act="text" data-p="${p}" placeholder="Например: в детстве только в школе, дома нет">${esc(pr.text || "")}</textarea></div>`;
    if (!isFunc && !isSimple(it) && pr.I >= 2) {
      html += `<div class="sub"><span class="sub-label">Как часто это бывает${p === "child" ? " (было)" : ""}?</span><div class="chips">${F_OPTS.map(([k, l]) =>
        `<button class="chip" data-act="freq" data-p="${p}" data-v="${k}" aria-pressed="${pr.F === k}">${l}</button>`).join("")}</div></div>`;
    }
    return html + "</fieldset>";
  }

  // Дополнительные стороны ответа: показываются сразу, без раскрытия
  function extrasBlock(it, r) {
    const unsure = `<label class="check"><input type="checkbox" id="unsure-${it.id}" data-act="unsure" ${r.unsure ? "checked" : ""}> Не уверен(а) в ответе</label>${r.unsure ? `<span class="sub-label">Ответ будет учтён с запасом в обе стороны: по нему одному признак не засчитают ни как точно выполненный, ни как точно отсутствующий. В отчёте такие оценки показаны диапазоном.</span>` : ""}`;
    if (it.kind === "func" || isSimple(it)) return unsure;
    const ctx = r.ctx || [];
    return `<div class="extras">
        <div class="sub"><span class="sub-label">Где проявляется (можно несколько)</span><div class="chips">${CTX.map(([k, l]) =>
          `<button class="chip" data-act="ctx" data-v="${k}" aria-pressed="${ctx.includes(k)}">${l}</button>`).join("")}</div></div>
        <div class="sub"><span class="sub-label">Скрываете ли вы это от окружающих?</span><div class="chips">${MASK.map((l, i) =>
          `<button class="chip" data-act="mask" data-v="${i}" aria-pressed="${r.mask === i}">${l}</button>`).join("")}</div></div>
        <div class="sub"><span class="sub-label">Насколько это мешает сейчас?</span><div class="chips">${D_LABELS.map((l, i) =>
          `<button class="chip" data-act="harm" data-v="${i}" aria-pressed="${r.harm === i}">${l.replace("Не мешали", "Не мешает")}</button>`).join("")}</div></div>
        ${unsure}
      </div>`;
  }

  function renderQ() {
    const it = ITEMS[state.idx];
    const r = resp(it.id);
    const sec = ND.SECTIONS.find((s) => s.id === it.sec);
    const secItems = openItems().filter((x) => x.sec === it.sec);
    const pos = secItems.indexOf(it) + 1;
    const opened = openItems();
    const done = opened.filter(answered).length;
    const pct = Math.round((done / opened.length) * 100);
    const isLast = nextOpen(state.idx, 1) === -1;
    const closedFu = ITEMS.filter((x) => x.fu && !open(x) && ITEMS.indexOf(x) > state.idx).length;
    app.innerHTML = `
      <div class="wrap">
        <div class="progress">
          <div class="row" style="justify-content:space-between">
            <span class="eyebrow">${esc(sec.title)} · ${pos} из ${secItems.length}</span>
            <span class="small muted mono" title="Уточняющие вопросы добавляются, если признак у вас есть">${done}/${opened.length}${closedFu ? ` <span class="muted">(+ до ${closedFu} уточняющих)</span>` : ""}</span>
          </div>
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="card">
          ${it.fu ? `<span class="eyebrow">Уточняющий вопрос</span>` : ""}<div class="q-text">${esc(it.t)}</div>
          ${ND.HINTS && ND.HINTS[it.id] ? `<p class="hint"><b>Что имеется в виду.</b> ${esc(ND.HINTS[it.id])}</p>` : ""}
          ${it.kind === "strength" && it === ITEMS.find((x) => x.kind === "strength") ? `<p class="small muted">Этот раздел о сильных сторонах. На индексы и критерии он не влияет и показывается в отчёте отдельно.</p>` : ""}
          ${r.na ? `<p class="muted">Отмечено как неприменимое. Нажмите ещё раз, чтобы ответить.</p>` : periodBlock(it, r, "now") + periodBlock(it, r, "child") + extrasBlock(it, r)}
          <div class="nav">
            <button class="btn ghost" data-act="na" aria-pressed="${!!r.na}">${r.na ? "Ответить на вопрос" : "Неприменимо или непонятно"}</button>
            <div class="row">
              <button class="btn" data-act="prev" ${nextOpen(state.idx, -1) === -1 ? "disabled" : ""}>Назад</button>
              <button class="btn primary" data-act="next" ${answered(it) ? "" : "disabled"}>${isLast ? "К отчёту" : "Далее"}</button>
            </div>
          </div>
        </div>
        <div class="row no-print"><button class="btn ghost small" data-act="home">На главную</button><button class="btn ghost small" data-act="report">Отчёт по текущим ответам</button></div>
      </div>`;
  }

  // ───────── report ─────────
  const stTag = (s) => `<span class="st ${s}">${ST_LABEL[s]}</span>`;
  const pct = (x) => Math.round(x * 100);
  function meter(now, child) {
    const P = ND.PARAMS;
    return `<div class="meters" aria-hidden="true">
      <div class="meter"><i style="width:${pct(now)}%"></i><b style="left:${pct(P.thetaLo)}%"></b><b style="left:${pct(P.thetaHi)}%"></b></div>
      <div class="meter"><i class="child" style="width:${pct(child)}%"></i><b style="left:${pct(P.thetaLo)}%"></b><b style="left:${pct(P.thetaHi)}%"></b></div></div>`;
  }

  function renderReport() {
    const E = ND.scoring.evaluate(state.R);
    const opened = openItems();
    const done = opened.filter(answered).length;
    const C = E.constructs;
    const asdRows = ["ASD.A1", "ASD.A2", "ASD.A3", "ASD.B1", "ASD.B2", "ASD.B3", "ASD.B4"].map((cid) => {
      const k = C[cid], d = ND.CONSTRUCTS[cid];
      return `<tr><td><b class="mono">${d.dsm}</b> ${d.label}</td><td>${meter(k.now.s, k.child.s)}</td>
        <td>${stTag(k.now.status)} <span class="small muted mono">${k.now.hi > k.now.lo ? `${pct(k.now.lo)}–${pct(k.now.hi)}` : pct(k.now.s)}</span></td>
        <td>${stTag(k.child.status)} <span class="small muted mono">${pct(k.child.s)}</span></td></tr>`;
    }).join("");
    const symRows = Object.entries(ND.ADHD_SYMPTOMS).map(([sid, label]) => {
      const s = E.symptoms[sid];
      return `<tr><td><b class="mono">${sid}</b> ${label}</td><td>${meter(s.now.s, s.child.s)}</td><td>${stTag(s.now.status)}</td><td>${stTag(s.child.status)}</td></tr>`;
    }).join("");
    const fRows = Object.entries(ND.LIFE_SPHERES).map(([f, l]) => {
      const x = E.func[f];
      const v = (d) => (d == null ? `<span class="muted">—</span>` : D_LABELS[d]);
      return `<tr><td>${l}</td><td>${v(x.now)}</td><td>${v(x.child)}</td></tr>`;
    }).join("");
    const textsOf = (r) => [r.note, r.now && r.now.custom && r.now.text && "Сейчас: " + r.now.text, r.child && r.child.custom && r.child.text && "В детстве: " + r.child.text].filter((x) => x && x.trim());
    const notes = ITEMS.filter((it) => state.R[it.id] && textsOf(state.R[it.id]).length).map((it) =>
      `<li><span class="muted small">${esc(it.t)}</span><br>${textsOf(state.R[it.id]).map(esc).join("<br>")}</li>`).join("");

    const gaps = [];
    if (done < opened.length) gaps.push(`Отвечено ${done} из ${opened.length} открытых вопросов. Неотвеченные в расчёт не входят.`);
    const childUnknown = opened.filter((it) => state.R[it.id] && state.R[it.id].child && state.R[it.id].child.unknown).length;
    if (childUnknown >= 5) gaps.push(`Про детство отмечено «не помню» в ${childUnknown} вопросах. Сильнее всего уверенность повысит рассказ родителя или человека, знавшего вас в детстве.`);
    gaps.push("Самоотчёт не заменяет наблюдение: ADOS-2 (наблюдение специалистом) и ADI-R или DIVA-5 (структурированное интервью) дают то, чего анкета дать не может.");

    const asd = E.asd, adhd = E.adhd;
    app.innerHTML = `
      <div class="wrap wide">
        <div class="stack">
          <span class="eyebrow">${state.sample ? "Пример отчёта на вымышленных ответах" : "Отчёт по вашим ответам"} · ND-Screen 0.4</span>
          <h1>Профиль признаков</h1>
          <p class="muted">Это структурированный самоотчёт, сведённый к критериям DSM-5-TR. Его можно показать психиатру или клиническому психологу как отправную точку; диагноз ставит специалист.</p>
        </div>

        ${(() => { const O = ND.scoring.overall(E); return `<div class="overall ${O.code}"><span class="eyebrow">Общий вывод</span><h2>${O.title}</h2><p>${esc(O.text)}</p></div>`; })()}

        <div class="summary">
          ${verdict("РАС", asd.level, asd.index, [
            `Ядро (A1–A3 и не меньше двух B): ${ST_LABEL[asd.core]}`,
            `Проявления в детстве (C): ${ST_LABEL[asd.C]}`,
            `Влияние на жизнь (D): ${ST_LABEL[asd.D]}`,
            `Камуфляж: ${pct(asd.camo.s)} из 100`,
            asd.indexRaw > asd.index ? `Индекс ограничен 49 (без ограничения ${asd.indexRaw}): не выполнено обязательное условие C или D` : "",
          ])}
          ${verdict("СДВГ", adhd.level, adhd.index, [
            `Невнимательность: ${adhd.nA1} из 9 (ещё ${adhd.nA1p - adhd.nA1} вероятно)`,
            `Гиперактивность и импульсивность: ${adhd.nA2} из 9 (ещё ${adhd.nA2p - adhd.nA2} вероятно)`,
            `Симптомы до 12 лет (B): ${ST_LABEL[adhd.B]}; выполнено ${adhd.nChild}, вероятно ещё ${adhd.nChildP - adhd.nChild}`,
            `Несколько сфер (C): ${ST_LABEL[adhd.C]}; нарушения (D): ${ST_LABEL[adhd.D]}`,
            adhd.presentation ? `Тип проявления: ${adhd.presentation}` : "",
            adhd.indexRaw > adhd.index ? `Индекс ограничен 49 (без ограничения ${adhd.indexRaw}): не выполнено обязательное условие B или D` : "",
          ])}
        </div>

        ${radarBlock(E)}

        ${consistencyBlock(E.validity)}

        ${supportBlock(ND.support(E, state.R))}

        ${strengthsBlock(E.strengths)}

        ${E.differential.length ? `<section class="block"><h2>Что стоит учесть</h2>
          ${E.differential.map((d) => `<div class="flag"><b>${esc(d.label)}${d.lateOnset ? ", началось не в детстве" : ""}</b><span>${esc(d.note)}</span></div>`).join("")}
        </section>` : ""}

        <section class="block">
          <h2>РАС по критериям DSM-5-TR</h2>
          <div class="legend"><span><i class="sw"></i>сейчас</span><span><i class="sw child"></i>в детстве</span><span>отметки на шкале: пороги 40 («вероятно») и 60 («выполнен»)</span></div>
          <div class="tbl-wrap"><table><thead><tr><th>Критерий</th><th>Выраженность</th><th>Сейчас</th><th>Детство</th></tr></thead><tbody>${asdRows}</tbody></table></div>
          <p class="small muted">Выраженность учитывает силу и частоту признака; если признак скрывается с усилием, к ней добавляется поправка на маскировку.</p>
        </section>

        <section class="block">
          <h2>СДВГ: 18 симптомов DSM-5-TR</h2>
          <div class="tbl-wrap"><table><thead><tr><th>Симптом</th><th>Выраженность</th><th>Сейчас</th><th>Детство</th></tr></thead><tbody>${symRows}</tbody></table></div>
          <p class="small muted">Симптом считается выполненным при выраженности от 60 и частоте «часто» или «почти всегда». Для взрослых нужно не меньше 5 в одной из групп. DIVA-5 для детства использует порог 6: ${adhd.divaChild ? "он достигнут" : "он не достигнут"}.
</p>
        </section>

        ${modsBlock(E)}

        ${legacyBlock(E.legacy)}

        <section class="block">
          <h2>Влияние на жизнь</h2>
          <div class="tbl-wrap"><table><thead><tr><th>Сфера</th><th>Сейчас</th><th>В детстве</th></tr></thead><tbody>${fRows}</tbody></table></div>
        </section>

        ${notes ? `<section class="block"><h2>Ваши ответы своими словами</h2><ul class="stack">${notes}</ul></section>` : ""}

        <section class="block"><h2>Пробелы</h2><ul class="stack muted">${gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></section>

        <div class="row no-print">
          ${state.sample ? `<button class="btn primary" data-act="home">Вернуться и начать анкету</button>` : `<button class="btn primary" data-act="resume">Вернуться к вопросам</button>`}
          <button class="btn" data-act="clin">Отчёт для специалиста</button>
          <button class="btn" data-act="copy-summary">Скопировать сводку</button>
          <button class="btn" data-act="export">${embedded ? "Показать данные (JSON)" : "Скачать данные (JSON)"}</button>
          ${embedded ? "" : `<button class="btn" data-act="print">Печать или PDF</button>`}
          ${state.sample ? "" : `<button class="btn ghost" data-act="reset">Начать заново</button>`}
        </div>
        ${confirmReset ? `<div class="confirm no-print"><span>Удалить все ответы из этого браузера? Это нельзя отменить.</span><div class="row"><button class="btn primary" data-act="reset-yes">Удалить ответы</button><button class="btn" data-act="reset-no">Отмена</button></div></div>` : ""}
        <div id="export-box"></div>
      </div>`;
  }

  // Профиль-радар: 7 критериев РАС и две группы симптомов СДВГ, сейчас и в детстве
  function radarBlock(E) {
    const C = E.constructs, S = E.symptoms;
    const grp = (pre, p) => { const xs = Object.keys(ND.ADHD_SYMPTOMS).filter((s) => s.startsWith(pre)).map((s) => S[s][p]); return xs.some((x) => x.status !== ST.NODATA) ? xs.reduce((a, x) => a + x.s, 0) / xs.length : null; };
    // короткие названия для подписей на картинке; полные — в списке под ней и в таблицах
    const SHORT = { "ASD.A1": "Взаимность в общении", "ASD.A2": "Невербальное общение", "ASD.A3": "Отношения и правила", "ASD.B1": "Повторяющиеся действия",
      "ASD.B2": "Неизменность, ритуалы", "ASD.B3": "Сильные интересы", "ASD.B4": "Сенсорика" };
    const axes = [
      ...["ASD.A1", "ASD.A2", "ASD.A3", "ASD.B1", "ASD.B2", "ASD.B3", "ASD.B4"].map((cid) => ({ code: ND.CONSTRUCTS[cid].dsm, short: SHORT[cid], label: ND.CONSTRUCTS[cid].label, g: "РАС",
        now: C[cid].now.n ? C[cid].now.s : null, child: C[cid].child.n ? C[cid].child.s : null })),
      { code: "A1", short: "Невнимательность", label: "Невнимательность", g: "СДВГ", now: grp("A1", "now"), child: grp("A1", "child") },
      { code: "A2", short: "Гиперактивность", label: "Гиперактивность и импульсивность", g: "СДВГ", now: grp("A2", "now"), child: grp("A2", "child") },
    ];
    if (axes.every((a) => a.now == null)) return "";
    const W = 640, H = 470, cx = W / 2, cy = H / 2 + 6, Rr = 150, n = axes.length;
    const ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;
    const pt = (i, v) => [cx + Rr * v * Math.cos(ang(i)), cy + Rr * v * Math.sin(ang(i))];
    const poly = (k) => axes.map((a, i) => pt(i, a[k] || 0).map((x) => x.toFixed(1)).join(",")).join(" ");
    const ring = (v, cls) => `<polygon class="${cls}" points="${axes.map((_, i) => pt(i, v).map((x) => x.toFixed(1)).join(",")).join(" ")}"/>`;
    const spokes = axes.map((_, i) => { const [x, y] = pt(i, 1); return `<line class="spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join("");
    const labels = axes.map((a, i) => {
      const [x, y0] = pt(i, 1.14), c = Math.cos(ang(i)), sn = Math.sin(ang(i));
      const y = y0 - (sn < -0.5 ? 14 : sn > 0.5 ? -4 : 6);
      const anchor = Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end";
      const [nx, ny] = pt(i, 1.1);
      return `<text class="lbl lbl-full" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle"><tspan class="lbl-g">${esc(a.short)}</tspan><tspan x="${x.toFixed(1)}" dy="1.25em">${a.g} ${a.code} · ${pct(a.now || 0)}${a.child != null ? ` / ${pct(a.child)}` : ""}</tspan></text>` +
        `<text class="lbl-num" x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${i + 1}</text>`;
    }).join("");
    const hasChild = axes.some((a) => a.child != null);
    const rows = axes.map((a, i) => `<li><b class="mono">${i + 1}</b> ${esc(a.label)} <span class="muted">(${a.g} ${a.code})</span>: сейчас ${a.now == null ? "—" : pct(a.now)}, в детстве ${a.child == null ? "—" : pct(a.child)}</li>`).join("");
    return `<section class="block"><h2>Профиль</h2>
      <div class="legend"><span><i class="sw"></i>сейчас</span>${hasChild ? `<span><i class="sw child"></i>в детстве</span>` : ""}<span>кольца: пороги 40 («вероятно») и 60 («выполнен»)</span></div>
      <div class="radar"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Профиль признаков: выраженность критериев РАС и групп симптомов СДВГ сейчас и в детстве">
        ${ring(1, "r-out")}${ring(ND.PARAMS.thetaHi, "r-hi")}${ring(ND.PARAMS.thetaLo, "r-lo")}${spokes}
        ${hasChild ? `<polygon class="p-child" points="${poly("child")}"/>` : ""}
        <polygon class="p-now" points="${poly("now")}"/>
        ${axes.map((a, i) => { const [x, y] = pt(i, a.now || 0); return `<circle class="d-now" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"/>`; }).join("")}
        ${labels}
      </svg></div>
      <ul class="radar-key small">${rows}</ul>
      <details class="small muted radar-more"><summary>Значения по осям</summary><ul class="stack">${rows}</ul></details>
      <p class="small muted">Каждая ось — выраженность от 0 до 100: для РАС по критерию DSM-5-TR, для СДВГ средняя по 9 симптомам группы. Подпись у оси: название, код критерия DSM-5-TR и баллы «сейчас / в детстве». Коды РАС: A1–A3 — социальное общение, B1–B4 — повторяющееся поведение и интересы; коды СДВГ: A1 — невнимательность, A2 — гиперактивность и импульсивность. Картинка показывает форму профиля и что изменилось с детства. Решение о критериях принимается по таблицам ниже.</p></section>`;
  }

  // «Что может помочь»: проверенные методики по выраженным признакам (src/support.js)
  function supportBlock(SP) {
    if (!SP.groups.length && !SP.base.length) return "";
    const tag = (k) => `<span class="evtag evtag-${k}">${esc(ND.EVIDENCE[k])}</span>`;
    const item = (x) => `<li><div class="row" style="gap:6px;align-items:baseline"><b>${esc(x.t)}</b>${x.ev.map(tag).join("")}</div><span>${esc(x.how)}</span><span class="small muted">Источник: ${esc(x.src)}</span></li>`;
    return `<section class="block"><h2>Что может помочь</h2>
      <p class="muted">Методики и приспособления, подобранные по выраженным у вас признакам. У каждого указано, насколько он проверен, и источник. Это не лечение и не замена специалисту: лекарства и терапию подбирает врач после диагностики.</p>
      ${SP.groups.map((g) => `<div class="support"><h3>${esc(g.label)}</h3><p class="small muted">${esc(g.why)}</p><ul class="sup">${g.items.map(item).join("")}</ul></div>`).join("")}
      ${SP.base.length ? `<div class="support"><h3>В любом случае</h3><ul class="sup">${SP.base.map(item).join("")}</ul></div>` : ""}
      ${SP.unproven.length ? `<details class="support"><summary><b>Часто советуют, но польза не доказана</b></summary><ul class="sup">${SP.unproven.map((x) => `<li><b>${esc(x.t)}</b><span>${esc(x.note)}.</span><span class="small muted">Источник: ${esc(x.src)}</span></li>`).join("")}</ul></details>` : ""}
    </section>`;
  }

  function strengthsBlock(list) {
    if (!list.length) return "";
    const th = ND.PARAMS.thetaLo;
    const shown = list.filter((x) => x.s >= th), rest = list.filter((x) => x.s < th);
    const byId = (id) => ITEMS.find((x) => x.id === id);
    const card = (x) => {
      const d = ND.STRENGTHS[x.key];
      const answers = x.items.map((id) => `<li>${esc(byId(id).t)}<br><span class="muted small">${esc(ND.clinician.answerLine(state.R[id]))}</span></li>`).join("");
      return `<div class="strength">
        <div class="row" style="justify-content:space-between"><h3>${esc(x.label)}</h3><span class="mono small">сейчас ${pct(x.s)}${x.child != null ? ` · в детстве ${pct(x.child)}` : ""}</span></div>
        ${meter(x.s, x.child || 0)}
        <p>${esc(d.desc)}</p>
        <p class="small"><b>Где пригождается.</b> ${esc(d.uses)}</p>
        <p class="small muted"><b>Связь с РАС и СДВГ.</b> ${esc(d.link)}</p>
        ${x.also.length ? `<p class="small muted"><b>Обратная сторона.</b> В основной анкете та же черта прозвучала как трудность: ${x.also.map((id) => `«${esc(byId(id).t.replace(/\.$/, ""))}»`).join("; ")}. У одной особенности бывают обе стороны, и от обстановки зависит, какая из них проявится.</p>` : ""}
        <div class="small"><b>Ваши ответы</b><ul class="ev">${answers}</ul></div>
      </div>`;
    };
    return `<section class="block"><h2>Сильные стороны</h2>
      <p class="muted">Направления, которые по вашим ответам выражены (от ${pct(th)} из 100). Верхняя полоска показывает «сейчас», нижняя «в детстве».</p>
      ${shown.length ? `<div class="strengths">${shown.map(card).join("")}</div>` : `<p class="muted">По ответам ни одно из направлений не выражено.</p>`}
      ${rest.length ? `<p class="small muted">Не выражены по ответам: ${rest.map((x) => `${esc(x.label.toLowerCase())} (${pct(x.s)})`).join(", ")}.</p>` : ""}
      <p class="small muted">Направления взяты из тем Aspie-quiz о талантах и из исследований сильных сторон взрослых с РАС и СДВГ. Шкала не валидирована, поэтому на индексы, критерии и общий вывод блок не влияет.</p></section>`;
  }

  function renderClin() {
    const C = ND.clinician.build(state.R);
    app.innerHTML = `<div class="wrap wide clin">
      <div class="row no-print"><button class="btn" data-act="report">Назад к отчёту</button>
        <button class="btn" data-act="clin-copy">Скопировать текстом</button>
        ${embedded ? "" : `<button class="btn" data-act="print">Печать или PDF</button>`}</div>
      ${C.html}
      <div id="export-box"></div></div>`;
  }

  function verdict(name, level, index, lines) {
    const [title, desc] = LEVEL[level];
    return `<div class="verdict"><div class="row" style="justify-content:space-between"><h2>${name}</h2><span class="pill ${level}">${title}</span></div>
      <div class="index"><span class="index-num mono">${index}</span><span class="small muted">индекс из 100<br>уровень: ${ND.indexBand(index)}</span></div>
      <div class="meter"><i style="width:${index}%"></i></div>
      <p>${desc}</p><ul class="small muted stack" style="margin:0;padding-left:1.1em;gap:4px">${lines.filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`;
  }

  function consistencyBlock(V) {
    const hard = V.some((f) => f.severity === "hard");
    const head = !V.length
      ? `<div class="consist ok"><b>Ответы согласованы</b><span>Противоречий не найдено. Проверены пары вопросов с противоположным смыслом, ответы внутри каждого вопроса, связь отдельных вопросов с итоговыми и разброс по темам.</span></div>`
      : `<div class="consist ${hard ? "bad" : "warn"}"><b>${hard ? "У вас противоречивые ответы" : "В ответах есть отдельные противоречия"}</b><span>${hard
          ? "Противоречий много, поэтому результат ненадёжный. Уровень «высокое соответствие» в таком случае не ставится. Ниже показано, какие именно ответы расходятся: их можно открыть и исправить."
          : "Противоречий немного, на вывод они влияют слабо. Ниже показано, какие именно ответы расходятся: их стоит перечитать."}</span></div>`;
    const goto = !state.sample;
    return `<section class="block"><h2>Согласованность ответов</h2>${head}
      <p class="small muted">${esc(ND.clinician.summaryLine(V))} Проверка не меняет баллы: противоречивые ответы не обнуляют друг друга, они только отмечаются здесь.</p>
      ${V.map((f) => `<div class="flag"><span>${esc(f.text)}</span></div>${(f.details || []).map((d) => ND.clinician.conflictHtml(d, state.R, goto)).join("")}`).join("")}</section>`;
  }

  function modsBlock(E) {
    const rows = ["CAMO", "DETAIL", "MOTOR", "EXEC", "BURNOUT"].map((cid) => {
      const k = E.constructs[cid];
      return `<tr><td>${ND.CONSTRUCTS[cid].label}</td><td>${meter(k.now.s, k.child.s)}</td><td class="mono">${k.now.n ? pct(k.now.s) : "—"}</td><td class="mono">${k.child.n ? pct(k.child.s) : "—"}</td></tr>`;
    }).join("");
    return `<section class="block"><h2>Дополнительные черты</h2>
      <div class="tbl-wrap"><table><thead><tr><th>Черта</th><th>Выраженность</th><th>Сейчас</th><th>Детство</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">Эти черты не входят в критерии DSM-5-TR, но помогают понять картину: высокий камуфляж объясняет, почему признаки могли не замечать.</p></section>`;
  }

  const r0 = (x) => (x == null ? "—" : Math.round(x));
  function legacyBlock(L) {
    const D = ND.LEGACY;
    const row = (name, val, range, cut, note) => `<tr><td>${name}</td><td class="mono">${val}</td><td class="mono small muted">${range}</td><td class="small">${cut}</td><td class="small muted">${note || ""}</td></tr>`;
    const rows = [];
    const over = (v, c) => (v == null ? "" : v >= c ? "выше порога" : "ниже порога");
    rows.push(row(`<b>RAADS-R</b>, всего`, r0(L.RAADS.total), "0–240", `${D.RAADS.cutoff}: ${over(L.RAADS.total, D.RAADS.cutoff)}`));
    for (const [k, x] of Object.entries(L.RAADS.subs)) rows.push(row(`&nbsp;&nbsp;${x.label}`, r0(x.est), `0–${x.n * 3}`, `${x.cutoff}: ${over(x.est, x.cutoff)}`, `по ${x.items} вопр.`));
    rows.push(row(`<b>AQ</b>, всего`, r0(L.AQ.total), "0–50", `${D.AQ.cutoff}: ${over(L.AQ.total, D.AQ.cutoff)}; скрининг ${D.AQ.cutoffScreen}: ${over(L.AQ.total, D.AQ.cutoffScreen)}`));
    for (const [k, x] of Object.entries(L.AQ.subs)) rows.push(row(`&nbsp;&nbsp;${x.label}`, r0(x.est), "0–10", "", `по ${x.items} вопр.`));
    rows.push(row(`<b>CAT-Q</b>, всего`, r0(L.CATQ.total), "25–175", "официального нет", "в исследованиях часто ориентир около 100"));
    for (const [k, x] of Object.entries(L.CATQ.subs)) rows.push(row(`&nbsp;&nbsp;${x.label}`, r0(x.est), `${x.n}–${x.n * 7}`, "", `по ${x.items} вопр.`));
    rows.push(row(`<b>RBQ-2A</b>, средний балл`, L.RBQ.mean == null ? "—" : L.RBQ.mean.toFixed(2), "1–3", "", ""));
    for (const [k, x] of Object.entries(L.RBQ.subs)) rows.push(row(`&nbsp;&nbsp;${x.label}`, x.mean == null ? "—" : x.mean.toFixed(2), "1–3", "", `по ${x.items} вопр.`));
    const A = L.ASRS;
    rows.push(row(`<b>ASRS v1.1</b>, часть A`, `${A.partA}/6`, "0–6", A.partAPositive == null ? "мало ответов" : `4: ${A.partAPositive ? "положительный скрининг" : "ниже порога"}`));
    rows.push(row(`&nbsp;&nbsp;Невнимательность`, A.inatt, "0–36", "", ""));
    rows.push(row(`&nbsp;&nbsp;Гиперактивность и импульсивность`, A.hyper, "0–36", "", ""));
    return `<section class="block"><h2>Пересчёт в шкалы оригинальных тестов</h2>
      <div class="tbl-wrap"><table><thead><tr><th>Шкала</th><th>Балл</th><th>Диапазон</th><th>Порог</th><th>Основа</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
      <p class="small muted">Это оценка, а не результат самих тестов: ваши ответы переведены в формат каждого теста, а подшкала достроена до числа вопросов оригинала. Нормы оригиналов к таким баллам применимы приблизительно.</p></section>`;
  }
  function legacyText(L) {
    return `Пересчёт (оценка): RAADS-R ${r0(L.RAADS.total)}/240, AQ ${r0(L.AQ.total)}/50, CAT-Q ${r0(L.CATQ.total)}/175, RBQ-2A ${L.RBQ.mean == null ? "—" : L.RBQ.mean.toFixed(2)}, ASRS часть A ${L.ASRS.partA}/6.`;
  }

  function summaryText() {
    const E = ND.scoring.evaluate(state.R);
    const L = (lv) => LEVEL[lv][0];
    const lines = [
      "ND-Screen 0.4, экспериментальный самоотчёт (не диагноз)",
      `Общий вывод: ${ND.scoring.overall(E).title}. ${ND.scoring.overall(E).text}`,
      `РАС: ${L(E.asd.level)}, индекс ${E.asd.index}/100. Ядро ${ST_LABEL[E.asd.core]}, детство ${ST_LABEL[E.asd.C]}, нарушения ${ST_LABEL[E.asd.D]}, камуфляж ${pct(E.asd.camo.s)}/100.`,
      ...["ASD.A1", "ASD.A2", "ASD.A3", "ASD.B1", "ASD.B2", "ASD.B3", "ASD.B4"].map((c) =>
        `  ${ND.CONSTRUCTS[c].dsm} ${ND.CONSTRUCTS[c].label}: сейчас ${pct(E.constructs[c].now.s)} (${ST_LABEL[E.constructs[c].now.status]}), детство ${pct(E.constructs[c].child.s)}`),
      `СДВГ: ${L(E.adhd.level)}, индекс ${E.adhd.index}/100. A1 ${E.adhd.nA1}/9, A2 ${E.adhd.nA2}/9, до 12 лет ${E.adhd.nChild} симптомов${E.adhd.presentation ? ", " + E.adhd.presentation : ""}.`,
      legacyText(E.legacy),
      ...(E.strengths.some((x) => x.s >= ND.PARAMS.thetaLo) ? ["Сильные стороны (не входят в индексы):", ...E.strengths.filter((x) => x.s >= ND.PARAMS.thetaLo).map((x) => `  ${x.label}: сейчас ${pct(x.s)}${x.child != null ? `, в детстве ${pct(x.child)}` : ""}`)] : []),
      ...E.differential.map((d) => `Флаг: ${d.label}`),
      E.validity.length ? `Согласованность: ${E.validity.some((f) => f.severity === "hard") ? "противоречивые ответы" : "отдельные противоречия"}.` : "Согласованность: противоречий не найдено.",
      ...E.validity.flatMap((f) => [`  ${f.text}`, ...(f.details || []).flatMap((d) => ND.clinician.conflictText(d, state.R).map((x) => "    " + x))]),
    ];
    return lines.join("\n");
  }

  // ───────── events ─────────
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }
  function go(idx) {
    const cur = ITEMS[state.idx];
    if (state.view === "q" && cur && state.R[cur.id]) state.R[cur.id].rt = (state.R[cur.id].rt || 0) + (Date.now() - shownAt);
    if (idx >= 0) state.idx = Math.max(0, Math.min(ITEMS.length - 1, idx));
    shownAt = Date.now();
    save(); render(); window.scrollTo(0, 0);
  }

  app.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.tagName === "DETAILS" || b.tagName === "TEXTAREA" || b.tagName === "INPUT") return;
    const act = b.dataset.act;
    const it = ITEMS[state.idx];
    const r = state.view === "q" ? resp(it.id) : null;
    switch (act) {
      case "start":
        if (state.sample) state = load() || fresh();
        state.view = "q"; state.sample = false;
        { const first = ITEMS.findIndex((x) => open(x) && !answered(x)); state.idx = first === -1 ? 0 : first; }
        shownAt = Date.now(); save(); render(); return;
      case "resume": state.view = "q"; if (!open(ITEMS[state.idx])) state.idx = Math.max(0, nextOpen(state.idx, -1)); shownAt = Date.now(); save(); render(); return;
      case "sample": state = { R: ND.sampleResponses(), idx: 0, view: "report", sample: true }; render(); window.scrollTo(0, 0); return;
      case "home": if (state.sample) state = load() || fresh(); state.view = "intro"; save(); render(); return;
      case "report": state.view = "report"; save(); render(); window.scrollTo(0, 0); return;
      case "goto": { const i = ITEMS.findIndex((x) => x.id === b.dataset.id); if (i < 0) return; state.view = "q"; state.idx = i; shownAt = Date.now(); save(); render(); window.scrollTo(0, 0); return; }
      case "set": {
        const p = b.dataset.p, f = b.dataset.f, v = +b.dataset.v;
        r[p][f] = v; r[p].unknown = false;
        if (f === "I" && v < 2) delete r[p].F;
        break;
      }
      case "unknown": { const p = b.dataset.p; r[p] = r[p].unknown ? {} : { unknown: true }; break; }
      case "custom": { const p = b.dataset.p; r[p].custom = !r[p].custom; r[p].unknown = false; break; }
      case "freq": r[b.dataset.p].F = b.dataset.v; break;
      case "ctx": { const c = r.ctx || (r.ctx = []); const i = c.indexOf(b.dataset.v); i >= 0 ? c.splice(i, 1) : c.push(b.dataset.v); r._open = true; break; }
      case "mask": r.mask = +b.dataset.v; r._open = true; break;
      case "harm": r.harm = +b.dataset.v; r._open = true; break;
      case "na": r.na = !r.na; break;
      case "prev": go(nextOpen(state.idx, -1)); return;
      case "next": {
        const j = nextOpen(state.idx, 1);
        if (j === -1) { go(-1); state.view = "report"; save(); render(); window.scrollTo(0, 0); return; }
        go(j); return;
      }
      case "copy-summary": {
        const txt = summaryText();
        navigator.clipboard.writeText(txt).then(() => toast("Сводка скопирована"), () => showBox(txt));
        return;
      }
      case "export": {
        const data = JSON.stringify({ version: "0.4", exported: new Date().toISOString(), responses: state.R, result: ND.scoring.evaluate(state.R) }, null, 2);
        if (embedded) { showBox(data); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
        a.download = "nd-screen-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
        return;
      }
      case "print": window.print(); return;
      case "clin": state.view = "clin"; save(); render(); window.scrollTo(0, 0); return;
      case "clin-copy": {
        const txt = ND.clinician.build(state.R).text;
        navigator.clipboard.writeText(txt).then(() => toast("Отчёт скопирован"), () => showBox(txt));
        return;
      }
      case "reset": confirmReset = true; render(); return;
      case "reset-no": confirmReset = false; render(); return;
      case "reset-yes": confirmReset = false; state = fresh(); save(); render(); return;
      default: return;
    }
    save(); render();
  });

  function showBox(text) {
    const box = document.getElementById("export-box");
    if (box) { box.innerHTML = `<pre class="copybox"></pre>`; box.firstChild.textContent = text; }
  }

  app.addEventListener("change", (e) => {
    if (e.target.dataset.act === "unsure") { resp(ITEMS[state.idx].id).unsure = e.target.checked; save(); render(); }
  });
  app.addEventListener("input", (e) => {
    if (e.target.dataset.act === "text") {
      const it = ITEMS[state.idx], r = resp(it.id);
      const before = answered(it);
      r[e.target.dataset.p].text = e.target.value; save();
      if (answered(it) !== before) { const nb = app.querySelector('[data-act="next"]'); if (nb) nb.disabled = !answered(it); }
    }
  });
  app.addEventListener("toggle", (e) => {
    if (e.target.dataset && e.target.dataset.act === "toggle-more" && state.view === "q") { resp(ITEMS[state.idx].id)._open = e.target.open; save(); }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (state.view !== "q" || e.target.tagName === "TEXTAREA") return;
    const it = ITEMS[state.idx];
    if (e.key === "Enter" && answered(it)) { e.preventDefault(); app.querySelector('[data-act="next"]').click(); }
  });

  render();
})();
