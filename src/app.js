// Интерфейс ND-Screen: вступление → вопросы → отчёт. Состояние хранится в localStorage этого браузера.
(function () {
  const ST = ND.ST;
  const KEY = "nd-screen-v0.2";
  const app = document.getElementById("app");

  const I_LABELS = ["Совсем нет", "Скорее нет", "Частично", "В основном да", "Полностью да"];
  const F_OPTS = [["rare", "Редко"], ["some", "Иногда"], ["often", "Часто"], ["always", "Почти всегда"]];
  const D_LABELS = ["Не мешали", "Немного", "Заметно", "Сильно"];
  const CTX = [["home", "Дома"], ["work", "Работа или учёба"], ["friends", "С друзьями"], ["strangers", "С незнакомыми"], ["alone", "Наедине с собой"]];
  const MASK = ["Да, видно", "Отчасти прячу", "Не видно, скрываю с усилием"];
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
  // старые сохранённые ответы на поля, которые у пункта больше не спрашиваются (детство, частота, где, видно ли, мешает), не нужны
  ND.normalizeR(state.R);
  state.seen = state.seen || {}; state.breaks = state.breaks || [];
  // экраны «пример вопроса» и «машина времени» не могут быть сохранены как текущие: после перезагрузки начинаем с вопроса
  if (state.view === "practice" || state.view === "recall" || state.view === "brk" || state.view === "probe") state.view = "q";
  state.look = state.look || "default";
  delete state.probeCur;
  let shownAt = Date.now();
  let confirmReset = false;

  function fresh() { return { R: {}, idx: 0, view: "intro", sample: false, seen: {}, breaks: [] }; }
  function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function save() { if (state.sample) return; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const ITEMS = ND.ITEMS;
  const isHist = (it) => it.kind === "hist";
  const resp = (id) => (state.R[id] = state.R[id] || (ND.NO_CHILD.has(id) ? { now: {} } : isHist(ITEMS.find((x) => x.id === id) || {}) ? {} : { now: {}, child: {} }));
  const isSimple = (it) => it.rev || it.kind === "diff" || it.kind === "strength";
  const open = (it) => ND.eligible(it, state.R);
  const openItems = () => ITEMS.filter(open);
  const nextOpen = (from, dir) => { for (let j = from + dir; j >= 0 && j < ITEMS.length; j += dir) if (open(ITEMS[j])) return j; return -1; };

  function answered(it) {
    const r = state.R[it.id];
    if (!r) return false;
    if (r.na) return true;
    if (isHist(it)) return Array.isArray(r.h) ? r.h.length > 0 : r.h != null;
    const f = it.kind === "func" ? "D" : "I";
    const ok = (p) => p && (p[f] != null || p.unknown || (p.custom && (p.text || "").trim()));
    if (it.kind === "scale" || it.kind === "comorb" || it.kind === "trait") return !!(r.now && r.now.I != null);
    return ok(r.now) && (it.noChild || ok(r.child));
  }

  // ───────── render ─────────
  function render() {
    if (state.view === "intro") renderIntro();
    else if (state.view === "q") renderQ();
    else if (state.view === "practice") renderPractice();
    else if (state.view === "recall") renderRecall();
    else if (state.view === "brk") renderBreak();
    else if (state.view === "clin") renderClin();
    else if (state.view === "map") renderMap();
    else if (state.view === "probe") renderProbe();
    else if (state.view === "lab") renderLab();
    else if (state.view === "sprite") renderSprite();
    else renderReport();
    document.documentElement.dataset.look = lookOf();
    syncMusic();
  }

  function renderIntro() {
    const done = openItems().filter(answered).length;
    app.innerHTML = `
      <div class="wrap intro">
        ${pix("social", "pix-hero")}
        <span class="eyebrow">Экспериментальный скрининг · версия 0.4</span>
        <h1>ND-Screen</h1>
        <p>Анкета о признаках аутизма (РАС) и СДВГ у взрослых. Она собирает содержание RAADS-R, AQ, CAT-Q, ASRS, RBQ-2A и доменов ADOS-2, ADI-R, DIVA-5 и сводит ответы к критериям DSM-5-TR.</p>
        <p>Вместо «да» или «нет» на каждый вопрос можно ответить точнее:</p>
        <div class="axis-demo">
          <div><b>Насколько</b><span class="muted small">от «совсем нет» до «полностью», включая «частично»</span></div>
          <div><b>Как часто</b><span class="muted small">редко, иногда, часто, почти всегда</span></div>
          <div><b>Когда</b><span class="muted small">отдельно сейчас и в детстве до 12 лет</span></div>
          <div><b>Своими словами</b><span class="muted small">если ни один вариант не подходит, опишите сами; есть и «не знаю» или «не помню»</span></div>
        </div>
        <ul class="muted small">
          <li>От ${ITEMS.filter((x) => !x.fu).length} до ${ITEMS.length} вопросов: уточняющие появляются, только если признак у вас есть. Примерно 25–45 минут. Можно прерваться: ответы сохраняются в этом браузере и никуда не отправляются.</li>
          <li>Результат описывает, насколько ответы соответствуют критериям. Это материал для разговора со специалистом, а не диагноз: ADOS-2 и ADI-R проводятся только очно.</li>
          <li>«Скорее нет» значит, что это в целом не про вас: бывает слабо или лишь изредка. «Частично» значит, что это есть заметно, но не во всём или не всегда. Вопросы о том, где это проявляется, мешает ли и видно ли со стороны, появляются, только если сейчас выбрано хотя бы «частично». В них есть вариант «не знаю».</li>
          <li>Под каждым вопросом есть пояснение с примерами. Если вопрос всё равно непонятен или не про вас, есть кнопка «Неприменимо».</li>
          <li>В конце будет отдельный отчёт для специалиста: по критериям DSM-5-TR, с вашими ответами под каждым критерием.</li>
          <li>Несколько раз по ходу анкеты появится короткий вопрос «Где были ваши мысли?», а после отчёта можно заглянуть в необязательную «Лабораторию». На баллы это не влияет.</li>
        </ul>
        <div class="row">
          <button class="btn primary" data-act="start">${done ? `Продолжить (отвечено ${done})` : "Начать анкету"}</button>
          <button class="btn" data-act="sample">Посмотреть пример отчёта</button>
          <button class="btn ghost" data-act="practice">Как отвечать: пример вопроса</button>
          ${done ? `<button class="btn ghost" data-act="report">Отчёт по текущим ответам</button>` : ""}
          ${done ? `<button class="btn ghost" data-act="map">Карта анкеты</button>` : ""}
        </div>
        ${lookBlock()}
      </div>`;
  }

  function scaleBtns(p, val, labels, field, cls = "") {
    return `<div class="scale ${cls}" role="group">${labels.map((l, i) =>
      `<button class="opt" data-act="set" data-p="${p}" data-f="${field}" data-v="${i}" aria-pressed="${val === i}">${l}</button>`).join("")}</div>`;
  }

  // Пункт валидированной шкалы: оригинальная форма ответа, один период, без дополнительных полей
  const SCALE_OPTS = ["Ни разу", "Несколько дней", "Более половины дней", "Почти каждый день"];
  const FX_OPTS = ["Совсем не затрудняло", "Немного затрудняло", "Сильно затрудняло", "Крайне сильно затрудняло"];
  // PAQ: подписаны только 1, 4 и 7, как в оригинале
  const AGREE7 = ["1", "2", "3", "4", "5", "6", "7"];
  const AGREE7_KEY = `<div class="scale-key small muted"><span>1 — совершенно не согласен(на)</span><span>4 — ни согласен(на), ни не согласен(на)</span><span>7 — совершенно согласен(на)</span></div>`;
  const GATE_OPTS = ["Да", "Нет", "Не уверен(а)"];
  const SCALE_UI = {
    PHQ9: { legend: "Как часто за последние 2 недели вас беспокоило это?", opts: SCALE_OPTS, cls: "four" },
    GAD7: { legend: "Как часто за последние 2 недели вас беспокоило это?", opts: SCALE_OPTS, cls: "four" },
    PAQ: { legend: "Насколько вы согласны, что это верно для вас?", opts: AGREE7, cls: "seven" },
    ABSI: { legend: "Во время последнего (или нынешнего) аутистического выгорания…", opts: AGREE7, cls: "seven" },
    ACI: { legend: "Насколько это про вас за последние 6 месяцев?", opts: ["Совсем нет", "Иногда", "Часто", "Очень часто"], cls: "four" },
  };
  function scaleBlock(it, r) {
    const pr = r.now || {}, ui = SCALE_UI[it.scale];
    const [legend, opts, cls] = it.fx ? ["Затруднения в жизни", FX_OPTS, "four"] : it.gate ? ["Ваш ответ", GATE_OPTS, "three"] : [ui.legend, ui.opts, ui.cls];
    return `<fieldset class="period"><legend>${legend}</legend>
      ${scaleBtns("now", pr.I, opts, "I", cls)}${cls === "seven" ? AGREE7_KEY : ""}</fieldset>
      ${it.id === "PHQ-9" && pr.I >= 1 ? safetyBlock() : ""}`;
  }
  // Сопутствующее состояние: только «да / нет», без периодов и дополнительных полей
  // «Не знаю» (v0.12.2): гипермобильность, синестезия, дислексия часто не диагностированы. В отчёте это «нет ответа».
  const YESNO = ["Да", "Нет", "Не знаю"];
  const comorbQ = (r) => `<fieldset class="period"><legend>Есть ли это у вас сейчас или было раньше?</legend>${scaleBtns("now", (r.now || {}).I, YESNO, "I", "three")}</fieldset>`;
  // Черта вне DSM: «нет / отчасти / да», у уточняющего вопроса свои варианты
  const TRAIT_OPTS = ["Нет, не про меня", "Отчасти", "Да, это про меня"];
  const traitQ = (it, r) => `<fieldset class="period"><legend>${it.opts ? "Ваш ответ" : "Насколько это про вас сейчас?"}</legend>${scaleBtns("now", (r.now || {}).I, it.opts || TRAIT_OPTS, "I", it.opts ? "two" : "three")}</fieldset>`;
  // Показывается при любом ответе, кроме «ни разу», на 9-й пункт PHQ-9
  function safetyBlock() {
    return `<div class="safety" role="note"><b>Если вам сейчас тяжело, вы не одни</b>
      <span>Мысли о смерти или о том, чтобы причинить себе вред, — серьёзный повод поговорить с кем-то уже сегодня: с близким человеком, психиатром или психотерапевтом.</span>
      <span>Если есть риск, что вы можете навредить себе прямо сейчас, звоните <b class="mono">112</b> (в России и большинстве стран Европы) или в местную экстренную службу.</span>
      <span class="small muted">Эта анкета не может оценить риск и не заменяет помощь специалиста.</span></div>`;
  }

  // Что значат средние варианты. «Скорее нет» по баллам остаётся ниже порога признака.
  const I_KEY = `<div class="scale-key small muted"><span>«Скорее нет» — в целом не про вас: бывает слабо или лишь изредка</span><span>«Частично» — есть заметно, но не во всём или не всегда</span></div>`;
  // Про нынешнюю жизнь «не помню» звучит странно: в колонке «Сейчас» та же кнопка подписана «Не знаю»
  const UNK_P = { now: "Не знаю", child: "Не помню" };
  // У вопросов о сферах жизни в колонке «Сейчас» настоящее время
  const dLabels = (p) => (p === "now" ? D_LABELS.map((l) => l.replace("Не мешали", "Не мешают")) : D_LABELS);
  function periodBlock(it, r, p) {
    const pr = r[p] || {};
    const isFunc = it.kind === "func";
    const val = isFunc ? pr.D : pr.I;
    let html = `<fieldset class="period"><legend>${PERIOD_LABEL[p]}</legend>`;
    html += isFunc ? scaleBtns(p, val, dLabels(p), "D", "four") : scaleBtns(p, val, I_LABELS, "I") + I_KEY;
    html += `<div class="chips">
      <button class="chip" data-act="custom" data-p="${p}" aria-pressed="${!!pr.custom}">Свой ответ</button>
      <button class="chip" data-act="unknown" data-p="${p}" aria-pressed="${!!pr.unknown}">${UNK_P[p]}</button></div>`;
    if (pr.custom) html += `<div class="sub"><label class="sub-label" for="text-${it.id}-${p}">Опишите своими словами. Если можете, отметьте и вариант выше: тогда ответ попадёт в подсчёт баллов.</label>
      <textarea id="text-${it.id}-${p}" data-act="text" data-p="${p}" placeholder="Например: в детстве только в школе, дома нет">${esc(pr.text || "")}</textarea></div>`;
    if (!isFunc && !isSimple(it) && !it.noFreq && pr.I >= 2) {
      html += `<div class="sub"><span class="sub-label">Как часто это бывает${p === "child" ? " (было)" : ""}?</span><div class="chips">${F_OPTS.map(([k, l]) =>
        `<button class="chip" data-act="freq" data-p="${p}" data-v="${k}" aria-pressed="${pr.F === k}">${l}</button>`).join("")}</div></div>`;
    }
    return html + "</fieldset>";
  }

  // Дополнительные стороны ответа. Показываются, только если признак сейчас есть хотя бы «частично»:
  // при «совсем нет» и «скорее нет» спрашивать, где он проявляется и мешает ли, бессмысленно, и в баллы эти поля тогда не идут.
  const UNK = "Не знаю";
  function extrasBlock(it, r) {
    if (it.kind === "func" || isSimple(it)) return "";
    if (!r.now || !(r.now.I >= 2)) return "";
    const ctx = r.ctx || [];
    const unk = (f, on) => `<button class="chip" data-act="unk" data-v="${f}" aria-pressed="${!!on}">${UNK}</button>`;
    const places = it.noAlone ? CTX.filter(([k]) => k !== "alone") : CTX;
    return `<div class="extras">
${it.noWhere ? "" : `<div class="sub"><span class="sub-label">Где проявляется (можно несколько)</span><div class="chips">${places.map(([k, l]) =>
          `<button class="chip" data-act="ctx" data-v="${k}" aria-pressed="${ctx.includes(k)}">${l}</button>`).join("")}${unk("ctx", r.ctxUnk)}</div></div>`}
${it.noMask ? "" : `<div class="sub"><span class="sub-label">Видно ли это со стороны? <span class="muted">Например, замечают ли другие, что вам трудно, или вы это прикрываете. Если к вопросу не подходит, пропустите.</span></span><div class="chips">${MASK.map((l, i) =>
          `<button class="chip" data-act="mask" data-v="${i}" aria-pressed="${r.mask === i}">${l}</button>`).join("")}${unk("mask", r.maskUnk)}</div></div>`}
${it.noHarm ? "" : `<div class="sub"><span class="sub-label">Насколько это мешает сейчас?</span><div class="chips">${D_LABELS.map((l, i) =>
          `<button class="chip" data-act="harm" data-v="${i}" aria-pressed="${r.harm === i}">${l.replace("Не мешали", "Не мешает")}</button>`).join("")}${unk("harm", r.harmUnk)}</div></div>`}
${ND.views && ND.views.WANT[it.id] ? `<div class="sub want-q"><span class="sub-label">${esc(ND.views.WANT[it.id])} <span class="muted">Это не входит в баллы, а помогает понять, в чём трудность.</span></span><div class="chips">${ND.views.WANT_OPTS.map((l, i) =>
          `<button class="chip" data-act="want" data-v="${i}" aria-pressed="${r.want === i}">${l}</button>`).join("")}${unk("want", r.wantUnk)}</div></div>` : ""}
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
          ${pix(SEC_PIX[it.sec], "pix-q")}
          ${it.fu ? `<span class="eyebrow">Уточняющий вопрос</span>` : ""}<div class="q-text">${esc(it.t)}</div>
          ${ND.HINTS && ND.HINTS[it.id] ? `<p class="hint"><b>Что имеется в виду.</b> ${esc(ND.HINTS[it.id])}</p>` : ""}
          ${it.kind === "strength" && it === ITEMS.find((x) => x.kind === "strength") ? `<p class="small muted">Этот раздел о сильных сторонах. На индексы и критерии он не влияет и показывается в отчёте отдельно.</p>` : ""}
          ${isHist(it) && it === ITEMS.find(isHist) ? `<p class="small muted">Несколько вопросов о раннем детстве и семье. Это факты для врача: на баллы, критерии и индексы они не влияют. Если не знаете ответа, можно спросить родных или выбрать «Не знаю».</p>` : ""}
          ${r.na ? `<p class="muted">Отмечено как неприменимое. Нажмите ещё раз, чтобы ответить.</p>` : (it.kind === "scale" ? scaleBlock(it, r) : it.kind === "comorb" ? comorbQ(r) : it.kind === "trait" ? traitQ(it, r) : isHist(it) ? histBlock(it, r) : periodBlock(it, r, "now") + (it.noChild ? "" : periodBlock(it, r, "child")) + extrasBlock(it, r))}
          <div class="nav">
            <button class="btn ghost" data-act="na" aria-pressed="${!!r.na}">${r.na ? "Ответить на вопрос" : "Неприменимо или непонятно"}</button>
            <div class="row">
              <button class="btn" data-act="prev" ${nextOpen(state.idx, -1) === -1 ? "disabled" : ""}>Назад</button>
              <button class="btn primary" data-act="next" ${answered(it) ? "" : "disabled"}>${isLast ? "К отчёту" : "Далее"}</button>
            </div>
          </div>
        </div>
        <div class="row no-print"><button class="btn ghost small" data-act="home">На главную</button><button class="btn ghost small" data-act="map">Карта</button><button class="btn ghost small" data-act="report">Отчёт по текущим ответам</button>${CALM.has(it.sec) ? "" : musicCtl(true)}</div>
      </div>`;
  }

  // ───────── пиксельные картинки (src/pixels.js) ─────────
  const SEC_PIX = { social: "social", imag: "imag", routine: "routine", sensory: "sensory", camo: "camo", attention: "attention", activity: "activity",
    exec: "exec", life: "life", history: "history", mood: "mood", emo: "emo", burnout: "burnout", cds: "attention", traits: "exec", wellbeing: "wellbeing", health: "health", strengths: "strengths" };
  // Н14: тема картинок; Н22: поверх базовой картинки слой-анимация (полоса из 4 кадров, меняются только движущиеся пиксели)
  const LOOKS = [["default", "Обычное"], ["space", "Космос"], ["trains", "Поезда"], ["ocean", "Океан"]];
  const lookOf = () => (ND.PIXELS && ND.PIXELS[state.look] ? state.look : "default");
  const pixOf = (th, name, cls = "", still = false) => {
    const base = ND.PIXELS && ND.PIXELS[th] && ND.PIXELS[th][name];
    if (!base) return "";
    const an = !still && state.anim !== false && ND.PIXANIM && ND.PIXANIM[th] && ND.PIXANIM[th][name];
    return `<span class="pix ${cls}" aria-hidden="true"><img src="${base}" alt="" width="120" height="60">${an ? `<i class="pix-anim" style="background-image:url(${an})"></i>` : ""}</span>`;
  };
  const pix = (name, cls = "", still = false) => pixOf(lookOf(), name, cls, still);

  // ───────── раннее развитие и семья: свои варианты ответа ─────────
  function histBlock(it, r) {
    const sel = Array.isArray(r.h) ? r.h : r.h == null ? [] : [r.h];
    return `<fieldset class="period"><legend>${it.multi ? "Можно выбрать несколько" : "Ваш ответ"}</legend>
      <div class="hist-opts">${it.opts.map((l, i) => `<button class="opt" data-act="hist" data-v="${i}" aria-pressed="${sel.includes(i)}">${esc(l)}</button>`).join("")}</div></fieldset>`;
  }

  // ───────── пример вопроса перед анкетой (K6) ─────────
  const PRACTICE = { id: "PRACTICE", sec: "practice", t: "Я люблю сладкое." };
  const pr = () => (state.prR = state.prR || { now: {}, child: {} });
  function practiceNotes(r) {
    const out = [];
    const lvl = (p, w) => {
      const x = r[p] || {};
      if (x.unknown) return `${w}: «${UNK_P[p]}». Так можно ответить, если правда не ${p === "now" ? "знаете" : "помните"}: вопрос просто не войдёт в подсчёт.`;
      if (x.I == null) return `${w}: пока нет ответа.`;
      const means = ["это совсем не про вас", "в целом не про вас: бывает слабо или изредка", "есть заметно, но не во всём или не всегда", "это скорее про вас", "это точно про вас"][x.I];
      return `${w}: «${I_LABELS[x.I]}» значит, что ${means}.${x.I >= 2 && !x.F ? " Ниже появился вопрос, как часто это бывает." : x.F ? ` Частота «${F_OPTS.find(([k]) => k === x.F)[1].toLowerCase()}» уточняет ответ: чем чаще, тем сильнее признак.` : ""}`;
    };
    out.push(lvl("now", "Сейчас"));
    out.push(lvl("child", "В детстве"));
    if (r.now && r.now.I >= 2) out.push("Когда сейчас выбрано «Частично» и выше, появляются вопросы о том, где это проявляется, видно ли со стороны и насколько мешает. Если не знаете, есть «Не знаю».");
    out.push("«Свой ответ» нужен, если ни один вариант не подходит: можно написать своими словами.");
    return out;
  }
  function renderPractice() {
    const r = pr();
    app.innerHTML = `
      <div class="wrap">
        <span class="eyebrow">Пример вопроса · ответ никуда не идёт</span>
        <div class="card">
          ${pix("practice", "pix-q")}
          <p class="muted small">Так выглядит каждый вопрос анкеты. Попробуйте ответить на этот: он ничего не значит и в отчёт не попадёт.</p>
          <div class="q-text">${esc(PRACTICE.t)}</div>
          <p class="hint"><b>Что имеется в виду.</b> Под каждым вопросом анкеты будет такое пояснение с примерами.</p>
          ${periodBlock(PRACTICE, r, "now")}${periodBlock(PRACTICE, r, "child")}${extrasBlock(PRACTICE, r)}
          <div class="practice-notes"><b>Что значит ваш ответ</b><ul class="small stack">${practiceNotes(r).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div class="nav"><button class="btn ghost" data-act="practice-skip">Пропустить</button>
            <button class="btn primary" data-act="practice-done">Понятно, дальше</button></div>
        </div>
      </div>`;
  }

  // ───────── «Машина времени» перед вопросами о детстве (K1) ─────────
  // Перед тем как отвечать о детстве, полезно сначала вспомнить обстановку: так воспоминания точнее
  // (метод календаря жизни, Belli, 1998; восстановление контекста в когнитивном интервью, Fisher & Geiselman, 1992).
  const RECALL_STEPS = [
    "Вспомните свою начальную школу: здание, класс, где вы сидели.",
    "Вспомните учительницу или учителя и кого-то из одноклассников по имени.",
    "Вспомните, что вы делали на переменах и после уроков, с кем дружили.",
    "Вспомните свой дом тех лет: комнату, любимые игры и занятия.",
  ];
  const RECALL_BY_SEC = {
    social: "Вспомните перемены и дни рождения в начальной школе: с кем вы играли, как знакомились, о чём говорили.",
    imag: "Вспомните свои игры лет в 7–10: во что играли, придумывали ли истории, что любили разглядывать.",
    routine: "Вспомните, чем вы увлекались в детстве, что собирали и как проходили ваши обычные утро и вечер.",
    sensory: "Вспомните, что раздражало вас в детстве: одежда, еда, звуки, запахи, шум в столовой.",
    camo: "Вспомните, как вы вели себя в классе и как дома: были ли вы разными.",
    attention: "Вспомните уроки и домашние задания: как вы их делали и что говорили про ваши тетради и портфель.",
    activity: "Вспомните, как вам сиделось на уроках, в очередях и в гостях.",
    exec: "Вспомните, как вы злились, расстраивались и радовались в детстве и как быстро успокаивались.",
    life: "Вспомните, как шли дела в школе, дома и с друзьями до 12 лет.",
    strengths: "Вспомните, что у вас в детстве получалось лучше всего и за что вас хвалили.",
  };
  function renderRecall() {
    app.innerHTML = `
      <div class="wrap">
        <div class="card recall">
          ${pix("school", "pix-wide")}
          <span class="eyebrow">Машина времени · 30 секунд</span>
          <h2>Сначала вспомните себя в 7–10 лет</h2>
          <p>В каждом вопросе анкеты есть ответ «В детстве, до 12 лет». Воспоминания точнее, если сначала мысленно вернуться в ту обстановку.</p>
          <ol class="recall-steps">${RECALL_STEPS.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
          <div class="timer" aria-hidden="true"><i></i></div>
          <p class="small muted">Если что-то не вспоминается, это нормально: в каждом вопросе есть «Не помню». Приём взят из методов, которые помогают вспоминать прошлое точнее (Belli, 1998; Fisher & Geiselman, 1992).</p>
          <div class="nav"><button class="btn ghost" data-act="recall-done">Пропустить</button><button class="btn primary" data-act="recall-done">Я вспомнил(а), к вопросам</button></div>
        </div>
      </div>`;
  }

  // ───────── v0.11: оформление, музыка, карта, пробы, лаборатория, спрайт ─────────
  // Разделы PHQ-9, GAD-7 и ABSI проходят без игровых элементов: без музыки, персонажа и проб.
  const CALM = new Set(["mood", "burnout"]);
  const restore = () => { const x = load() || fresh(); x.seen = x.seen || {}; x.breaks = x.breaks || []; return x; };
  const labState = () => { const L = state.lab || {}; return { probes: state.probe && state.probe.list, dd: L.dd, rt: L.rt, tp: L.tp, tpCounted: L.tpCounted, load: L.load, navon: L.navon, span: L.span, tap: L.tap, pitch: L.pitch, trace: L.trace, dev: L.dev }; };
  // в примере отчёта настройки оформления тоже сохраняем, но в настоящие ответы
  function savePref() {
    if (!state.sample) return;
    const x = restore(); x.look = state.look; x.anim = state.anim; x.music = state.music; x.vol = state.vol;
    try { localStorage.setItem(KEY, JSON.stringify(x)); } catch (e) {}
  }

  function musicCtl(small) {
    if (!ND.music || !ND.music.supported()) return "";
    return `<span class="music-ctl"><button class="${small ? "btn ghost small" : "chip"}" data-act="music" aria-pressed="${!!state.music}">♪ Музыка: ${state.music ? "вкл" : "выкл"}</button>${state.music ? `<input type="range" min="0" max="100" value="${Math.round((state.vol == null ? 0.5 : state.vol) * 100)}" data-act="vol" aria-label="Громкость музыки">` : ""}</span>`;
  }
  function syncMusic() {
    if (!ND.music) return;
    const inQ = ["q", "brk", "probe"].includes(state.view);
    const sec = inQ ? ITEMS[state.idx].sec : state.view === "map" ? "map" : state.view === "intro" ? "intro" : null;
    if (state.music && sec && !CALM.has(sec) && !state.sample) ND.music.play(sec); else ND.music.stop();
  }

  function lookBlock() {
    return `<section class="look-set no-print"><h2>Оформление</h2>
      <div class="looks">${LOOKS.map(([k, l]) => `<button class="look-btn" data-act="look" data-v="${k}" aria-pressed="${lookOf() === k}">${pixOf(k, "social", "pix-thumb", true)}<span>${l}</span></button>`).join("")}</div>
      <div class="row"><button class="chip" data-act="anim" aria-pressed="${state.anim !== false}">Анимация картинок</button>${musicCtl()}<button class="chip" data-act="sprite">Мой персонаж</button></div>
      <p class="small muted">Тема меняет картинки и цвет кнопок. Анимацию можно выключить; если в системе включено «уменьшить движение», картинки и так неподвижны. Музыка тихая, по умолчанию выключена и сама замолкает в разделах о настроении и выгорании.</p></section>`;
  }

  // ───────── Н13. Карта-путешествие ─────────
  const shortTitle = (t) => t.replace(/\s*\(.*\)$/, "").replace(/:.*$/, "").replace(" за последние 2 недели", "");
  function mapData() {
    const cur = ITEMS[state.idx] && ITEMS[state.idx].sec;
    return ND.SECTIONS.map((s) => { const xs = secOpen(s.id); return { s, n: xs.length, done: xs.filter(answered).length }; })
      .filter((x) => x.n).map((x) => ({ ...x, st: x.done === x.n ? "done" : x.s.id === cur ? "cur" : x.done ? "part" : "todo" }));
  }
  const ST_MAP = { done: "пройдено", cur: "вы здесь", part: "начато", todo: "впереди" };
  function mapBlock(compact) {
    const D = mapData(), cols = compact ? Math.min(D.length, 8) : window.innerWidth < 600 ? 2 : 4, rows = Math.ceil(D.length / cols);
    const pos = (k) => { const r = Math.floor(k / cols), c0 = k % cols; return [r, r % 2 ? cols - 1 - c0 : c0]; };
    const pts = D.map((_, k) => { const [r, c] = pos(k); return `${(c + 0.5) * 100},${(r + 0.5) * 100}`; }).join(" ");
    const tiles = D.map((x, k) => {
      const [r, c] = pos(k), me = x.st === "cur" && !CALM.has(x.s.id);
      return `<button class="mt ${x.st}" data-act="map-go" data-sec="${x.s.id}" style="grid-row:${r + 1};grid-column:${c + 1}" title="${esc(x.s.title)}: ${x.done} из ${x.n}" aria-label="${k + 1}. ${esc(x.s.title)}, ${ST_MAP[x.st]}, ${x.done} из ${x.n}">
        ${pix(SEC_PIX[x.s.id] || "break", "pix-tile", true)}
        ${me ? `<img class="mt-me" src="${spriteURL()}" alt="">` : ""}
        ${x.st === "done" ? `<span class="mt-ok" aria-hidden="true">✓</span>` : ""}
        ${compact ? "" : `<span class="mt-t"><b>${k + 1}.</b> ${esc(shortTitle(x.s.title))}</span><span class="mt-s small muted">${ST_MAP[x.st]} · ${x.done}/${x.n}</span>`}
      </button>`;
    }).join("");
    return `<div class="map ${compact ? "compact" : ""}" style="--cols:${cols}">
      <svg class="map-path" viewBox="0 0 ${cols * 100} ${rows * 100}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" vector-effect="non-scaling-stroke"/></svg>${tiles}</div>`;
  }
  function renderMap() {
    const D = mapData(), done = D.filter((x) => x.st === "done").length;
    app.innerHTML = `<div class="wrap wide">
      <span class="eyebrow">Карта анкеты · пройдено разделов ${done} из ${D.length}</span>
      <h1>Карта</h1>
      <p class="muted">Каждая клетка — раздел анкеты. Нажмите на любой, чтобы перейти к его первому вопросу без ответа. Ответы сохраняются, порядок можно менять.</p>
      ${mapBlock(false)}
      <div class="row no-print"><button class="btn primary" data-act="resume">Вернуться к вопросам</button><button class="btn" data-act="sprite">Мой персонаж</button><button class="btn ghost" data-act="report">Отчёт по текущим ответам</button>${musicCtl(true)}</div>
    </div>`;
  }

  // ───────── Н9. «Где были ваши мысли?» ─────────
  function probeDue(it, j) {
    if (state.sample || state.probesOff || !ND.lab) return 0;
    if (!ND.lab.PROBE_SECS.includes(it.sec) || ITEMS[j].sec !== it.sec) return 0;
    const P = state.probe || (state.probe = { seed: Math.floor(Math.random() * 1e9), list: [] });
    const core = openItems().filter((x) => ND.lab.PROBE_SECS.includes(x.sec)), n = core.filter(answered).length;
    const due = ND.lab.probeSchedule(P.seed, core.length).filter((t) => t <= n).length;
    return due > P.list.length ? due : 0;
  }
  function finishProbe(x) {
    const P = state.probe || (state.probe = { seed: 1, list: [] });
    P.list.push({ a: x.a, how: x.how, sec: ITEMS[state.idx].sec, n: openItems().filter(answered).length });
    delete state.probeCur; state.view = "q"; shownAt = Date.now(); save(); render(); window.scrollTo(0, 0);
  }
  function renderProbe() {
    const P = state.probe || { list: [] }, k = P.list.filter((x) => x.a !== "missed").length + 1, cur = state.probeCur || {};
    const ok = cur.a && (cur.a !== "other" || cur.how);
    app.innerHTML = `<div class="wrap"><div class="card probe">
      ${pix("attention", "pix-q")}
      <span class="eyebrow">Мини-эксперимент · ${Math.min(k, ND.lab.PROBE_N)} из ${ND.lab.PROBE_N}</span>
      <h2>Где только что были ваши мысли?</h2>
      <p class="muted">Вспомните последние секунды перед этим экраном, пока вы читали вопрос и отвечали.</p>
      ${k === 1 ? `<p class="small muted">Такой вопрос появится несколько раз в случайный момент. Мысли уходят в сторону у всех, так что честный ответ здесь важнее «правильного». На баллы это не влияет: итог будет в отчёте, в блоке «Лаборатория».</p>` : ""}
      <div class="hist-opts">${ND.lab.PROBE_OPTS.map(([v, l]) => `<button class="opt" data-act="probe-a" data-v="${v}" aria-pressed="${cur.a === v}">${l}</button>`).join("")}</div>
      ${cur.a === "other" ? `<fieldset class="period"><legend>Мысли ушли сами или вы решили подумать о другом?</legend>
        <div class="hist-opts">${ND.lab.PROBE_HOW.map(([v, l]) => `<button class="opt" data-act="probe-how" data-v="${v}" aria-pressed="${cur.how === v}">${l}</button>`).join("")}</div></fieldset>` : ""}
      <div class="nav"><button class="btn ghost" data-act="probe-off">Больше не спрашивать</button>
        <div class="row"><button class="btn" data-act="probe-skip">Пропустить</button><button class="btn primary" data-act="probe-done" ${ok ? "" : "disabled"}>Дальше</button></div></div>
    </div></div>`;
  }

  // ───────── Н10. Лаборатория: «Сейчас или потом» ─────────
  const rub = (x) => Math.round(x).toLocaleString("ru-RU") + " ₽";
  function probeHtml(PS) {
    if (!PS.n) return state.probesOff ? `<p class="small muted">Вопросы «Где были ваши мысли?» вы отключили.</p>` : `<p class="small muted">Вопросы «Где были ваши мысли?» появятся по ходу основной части анкеты.</p>`;
    if (!PS.enough) return `<p class="small muted">Вопросов «Где были ваши мысли?» с ответом пока ${PS.rated}. Итог появится после трёх.</p>`;
    const pc = (x) => Math.round(x * 100) + "%";
    return `<h3>Где были ваши мысли</h3>
      <p>Мысли были не на вопросе в <b>${PS.off} из ${PS.rated}</b> проверок (${pc(PS.share)})${PS.blank ? `, из них «пусто в голове» ${PS.blank}` : ""}.
      ${PS.spont + PS.delib ? `Когда мысли уходили к другому: само — ${PS.spont}, сознательно — ${PS.delib}.` : ""}
      ${PS.first != null ? `В первой половине анкеты ${pc(PS.first)}, во второй ${pc(PS.second)}${PS.second - PS.first >= 0.25 ? ": к концу отвлечений стало заметно больше, так обычно проявляется усталость" : ""}.` : ""}</p>
      <p class="small muted">Для ориентира: в исследовании с такими же внезапными вопросами в обычной жизни мысли были не на текущем деле примерно в 47% случаев (Killingsworth & Gilbert, 2010). В анкете условия другие, а проверок всего несколько, поэтому это наблюдение, а не измерение. В выборке студентов с разной выраженностью признаков СДВГ с ними было связано именно непроизвольное блуждание мыслей, а намеренное нет (Seli et al., 2015). Для взрослых с СДВГ есть отдельный опросник «избыточного блуждания мыслей» MEWS (Mowlem et al., 2019), на русский он официально не переведён.</p>`;
  }
  function ddChart(D) {
    const W = 320, H = 170, x = (d) => 36 + (d / 365) * (W - 50), y = (v) => 14 + (1 - v / ND.lab.LATER) * (H - 44);
    const pts = [{ days: 0, ip: ND.lab.LATER }, ...D.points];
    return `<svg class="dd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Сколько стоят для вас 10 000 ₽ через разное время">
      <line x1="36" y1="${y(ND.lab.LATER)}" x2="${W - 14}" y2="${y(ND.lab.LATER)}" class="ref"/>
      <line x1="36" y1="${y(0)}" x2="${W - 14}" y2="${y(0)}" class="axis"/>
      ${[0, 5000, 10000].map((v) => `<text x="30" y="${y(v) + 4}" text-anchor="end">${v / 1000}к</text>`).join("")}
      ${[[0, "сегодня"], [182, "6 мес"], [365, "1 год"]].map(([dd, l], i) => `<text x="${x(dd)}" y="${H - 12}" text-anchor="${i ? (i === 2 ? "end" : "middle") : "start"}">${l}</text>`).join("")}
      <polygon points="${x(0)},${y(0)} ${pts.map((p) => `${x(p.days)},${y(p.ip)}`).join(" ")} ${x(365)},${y(0)}" class="area"/>
      <polyline points="${pts.map((p) => `${x(p.days)},${y(p.ip)}`).join(" ")}" class="curve"/>
      ${D.points.map((p) => `<circle cx="${x(p.days)}" cy="${y(p.ip)}" r="4"/>`).join("")}
    </svg>`;
  }
  function ddHtml(D, full) {
    if (!D.complete) return "";
    const a = D.auc;
    const words = a >= 0.8 ? "Вы почти не обесцениваете отложенные деньги: ожидание мало что у них отнимает." : a >= 0.5 ? "Ожидание заметно уменьшает для вас ценность денег, но не обнуляет её." : "Отложенные деньги для вас сильно теряют в цене: синица в руках заметно важнее.";
    return `<h3>Сейчас или потом</h3>
      <div class="dd">${ddChart(D)}<div><p>Площадь под кривой: <b class="mono">${a.toFixed(2).replace(".", ",")}</b> из 1. ${words}</p>
      <p class="small">Сколько для вас стоят 10 000 ₽: ${D.points.map((p) => `${p.label} ≈ ${rub(p.ip)}`).join("; ")}.</p></div></div>
      ${D.jumps ? `<p class="small muted">При большем сроке вы иногда соглашались на большую сумму, чем при меньшем. Так бывает при невнимательном выборе, поэтому результат менее надёжен (критерий Johnson & Bickel, 2008).</p>` : ""}
      ${full ? `<p class="small muted">Норм для взрослых в России нет, поэтому сравнить с «обычным» значением нельзя. В метаанализе у людей с СДВГ предпочтение немедленной награды в среднем умеренно сильнее, чем без СДВГ (Jackson & MacKillop, 2016), но разброс между людьми большой, и по одному результату ничего сказать нельзя. Выбор зависит и от инфляции, доверия к обещаниям и того, насколько сейчас нужны деньги. Методика: подстройка суммы (Du, Green & Myerson, 2002), площадь под кривой (Myerson, Green & Warusawitharana, 2001); гипотетические и реальные деньги дают близкие результаты (Johnson & Bickel, 2002).</p>` : ""}`;
  }
  // ───────── Б10–Б13. Задания на время реакции и восприятие ─────────
  const ms = (x) => (x == null ? "—" : Math.round(x) + " мс");
  const pc0 = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
  const dec2 = (x) => (x == null ? "—" : x.toFixed(2).replace(".", ","));
  const MAPLINK = (id, t) => `<a href="https://neurodivergentmap.vercel.app/#${id}" target="_blank" rel="noopener">${t}</a>`;
  const TASKS = {
    rt: { title: "Ровно или волнами", time: "около 3 минут",
      what: "Нажимайте как можно быстрее, когда появится кружок. Смотрим не на скорость, а на то, насколько ровно вы отвечаете.",
      how: ["В центре будет крестик. Через 1–3 секунды вместо него появится кружок.", "Как только он появится, нажмите пробел или коснитесь серой области.", "Не нажимайте заранее. Всего 50 попыток и 3 тренировочные.", "Лучше проходить на компьютере, в тишине и не отвлекаясь."] },
    tp: { title: "Тридцать секунд", time: "около 3 минут",
      what: "Отмерьте по ощущению 10, 30 и 60 секунд без часов. Так видно, спешат ваши внутренние часы или отстают.",
      how: ["Нажмите «Старт», а потом «Стоп», когда, по ощущению, пройдёт названное время.", "Не смотрите на часы и постарайтесь не считать про себя: просто почувствуйте, когда пора.", "Всего 5 интервалов: 10, 30, 60, 30 и 10 секунд."] },
    load: { title: "Сколько вы замечаете", time: "около 3 минут",
      what: "На долю секунды появится кольцо из букв. Нужно найти X или N, а заодно сказать, не мелькнуло ли сбоку что-то ещё.",
      how: ["Смотрите на крестик в центре. На 0,1 секунды вокруг него появятся буквы.", "Среди них есть X или N. Ответьте, какая это была буква (клавиши X и N или кнопки).", "Затем ответьте, был ли сбоку маленький серый квадрат. Он бывает не всегда.", "Сначала 4 тренировочные попытки помедленнее, потом 32 настоящие."] },
    navon: { title: "Лес или деревья", time: "около 2 минут",
      what: "Большая буква сложена из маленьких. В одной части называете большую букву, в другой маленькие. Сравниваем, что вы видите быстрее: целое или детали.",
      how: ["Буквы только две: Н и С.", "Отвечайте кнопками или клавишами: ← или Н — это «Н», → или С — это «С».", "Отвечайте быстро, но без ошибок. В каждой части сначала 4 тренировочные попытки."] },
    span: { title: "Удержать в уме", time: "около 4 минут",
      what: "По одной появятся цифры. Нужно ввести их в том же порядке, а во второй части в обратном. Так видно, сколько вы удерживаете в уме.",
      how: ["Цифры показываются по одной, раз в секунду. Записывать нельзя, проговаривать про себя можно.", "Потом введите их кнопками или клавишами 1–9. Ошиблись в цифре — кнопка «Стереть».", "Ряд постепенно удлиняется. Задание закончится, когда обе попытки одной длины не получатся.", "Сначала прямой порядок, потом обратный. Перед каждой частью есть пример."] },
    tap: { title: "В ритм", time: "около 1 минуты",
      what: "Стучите в такт мигающему кружку, а когда он перестанет мигать, держите тот же темп сами.",
      how: ["Стучите по серой области или нажимайте пробел одним пальцем, ровно в момент мигания.", "После 24 миганий кружок погаснет. Продолжайте стучать в том же темпе, пока счётчик не дойдёт до нуля.", "Не считайте вслух и не отбивайте ногой: просто держите ритм."] },
    pitch: { title: "Слух на высоту звука", time: "около 4 минут",
      what: "Прозвучат два коротких тона. Нужно сказать, какой из них выше. Разница становится всё меньше, пока не станет неразличимой.",
      how: ["Лучше в наушниках и в тишине. Громкость — комфортная, не громкая.", "После двух звуков нажмите «Первый выше» или «Второй выше» (клавиши 1 и 2 или ← и →).", "Если не уверены, всё равно выберите: угадывание тоже часть задания.", "Сначала 2 лёгких тренировочных пары."] },
    trace: { title: "Провести линию", time: "около 1 минуты",
      what: "Проведите пальцем или мышью по извилистой дорожке от зелёного кружка до красного, стараясь не выходить за края.",
      how: ["Нажмите на зелёный кружок и, не отрывая палец или кнопку мыши, ведите по дорожке до красного.", "Ведите в своём обычном темпе: не нужно ни спешить, ни ползти.", "Всего 3 дорожки. Если оторвали палец, продолжите с того же места."] },
  };
  // Задания, где важно точное время на экране: перед ними 1,5 секунды проверяем устройство
  const TIMED = ["rt", "load", "navon", "span", "tap"];
  const labData = () => state.lab || (state.lab = { dd: {} });
  const labSeed = () => { const L = labData(); if (!L.seed) L.seed = (Math.random() * 4294967295) >>> 0 || 1; return L.seed; };
  const sumOf = (task, L) => {
    L = L || state.lab || {};
    if (task === "rt") return ND.lab.rtSummary(L.rt);
    if (task === "tp") return { ...ND.lab.tpSummary(L.tp), counted: !!L.tpCounted };
    if (task === "load") return ND.lab.loadSummary(L.load);
    if (task === "navon") return ND.lab.navonSummary(L.navon);
    if (task === "span") return ND.lab.spanSummary(L.span);
    if (task === "tap") return ND.lab.tapSummary(L.tap);
    if (task === "pitch") return ND.lab.pitchSummary(L.pitch);
    if (task === "trace") return ND.lab.traceSummary(L.trace);
    return null;
  };
  // Заметка об устройстве под результатом задания на время
  const devNote = (task) => { const d = ((state.lab || {}).dev || {})[task]; return d && !d.ok ? `<p class="small dev-note">Устройство во время задания: ${esc(d.issues.join("; "))}. Результат может быть искажён, лучше пройти ещё раз на компьютере с закрытыми лишними вкладками.</p>` : ""; };
  function spark(series) {
    const W = 320, H = 90, vals = series.filter((x) => x != null), max = Math.min(1500, Math.max(400, ...vals));
    const x = (i) => 6 + (i / Math.max(1, series.length - 1)) * (W - 12), y = (v) => H - 8 - (Math.min(v, max) / max) * (H - 16);
    const pts = series.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
    return `<svg class="rt-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Время каждого ответа по порядку">
      <line x1="6" x2="${W - 6}" y1="${H - 8}" y2="${H - 8}" class="axis"/>
      <polyline points="${pts}" class="curve"/>
      ${series.map((v, i) => (v == null ? `<text x="${x(i)}" y="${H - 1}" text-anchor="middle">·</text>` : "")).join("")}
    </svg>`;
  }
  function rtHtml(S, full) {
    if (!S || !S.done) return "";
    if (!S.enough) return `<h3>${TASKS.rt.title}</h3><p class="small muted">Засчитанных ответов ${S.valid} из ${S.n}: слишком много нажатий заранее или пропусков, чтобы посчитать разброс. Попробуйте пройти ещё раз в спокойной обстановке.</p>`;
    const tired = S.cv1 != null && S.cv2 != null && S.cv2 - S.cv1 >= 0.08;
    return `<h3>${TASKS.rt.title}</h3>
      <p>Обычное время ответа ${ms(S.median)}. Разброс: коэффициент вариации <b class="mono">${dec2(S.cv)}</b> (стандартное отклонение ${ms(S.sd)} при среднем ${ms(S.mean)}). Очень медленных ответов, вдвое дольше обычного: ${S.slow} из ${S.valid}.${S.early ? ` Нажатий заранее: ${S.early}.` : ""}${S.miss ? ` Пропусков: ${S.miss}.` : ""}</p>
      ${spark(S.series)}
      <p class="small">Чем выше коэффициент вариации, тем сильнее ответы «гуляют» от попытки к попытке.${tired ? ` Во второй половине разброс стал больше (${dec2(S.cv1)} → ${dec2(S.cv2)}): так часто проявляется усталость.` : ""}</p>
      ${full ? `<p class="small muted">Это один из самых устойчивых лабораторных признаков СДВГ: в метаанализе 319 исследований время реакции при СДВГ было заметно изменчивее, а если это учесть, люди с СДВГ в среднем не медленнее. У взрослых различие меньше, чем у детей (Kofler et al., 2013). В жизни это похоже на «сегодня получается, завтра нет», и это не лень. Норм для такого короткого задания в браузере нет. Разброс зависит и от усталости, сна, кофе и устройства, поэтому по одному результату ничего нельзя сказать о диагнозе. Подробнее: ${MAPLINK("rt_variability", "«Нестабильность внимания» на карте")}.</p>` : ""}${devNote("rt")}`;
  }
  function tpHtml(S, full) {
    if (!S || !S.done) return "";
    const L = state.lab || {};
    const words = { fast: "Вы в среднем останавливались раньше, чем нужно: внутренние часы, похоже, спешат, и время кажется прошедшим раньше, чем на самом деле.", slow: "Вы в среднем останавливались позже, чем нужно: внутренние часы, похоже, отстают, и время проходит незаметнее, чем кажется.", ok: "В среднем вы отмеряли время довольно точно." }[S.dir];
    const rel = (r) => (r < 1 ? `на ${Math.round((1 - r) * 100)}% короче` : r > 1 ? `на ${Math.round((r - 1) * 100)}% дольше` : "точно");
    return `<h3>${TASKS.tp.title}</h3>
      <p>${S.items.map((t) => `${t.target} с → <b class="mono">${t.produced.toFixed(1).replace(".", ",")} с</b>`).join(" · ")}</p>
      <p>${words} В среднем ${rel(S.gm)}, средняя ошибка ${pc0(S.err)}.${S.repeatDiff != null && S.repeatDiff >= 0.25 ? " Повторы одного и того же интервала заметно отличались, то есть чувство времени у вас нестабильно." : ""}</p>
      ${L.tpCounted ? `<p class="small muted">Вы отметили, что считали про себя. Со счётом задача проще, поэтому результат меньше говорит о чувстве времени.</p>` : ""}
      ${full ? `<p class="small muted">В метаанализе у людей с СДВГ точность отмеривания и оценки интервалов была ниже, что авторы объясняют «ускоренными внутренними часами» (Marx et al., 2021); у детей и подростков с СДВГ оценки менее точны и менее стабильны (Zheng et al., 2022). По одному прохождению из 5 интервалов судить о диагнозе нельзя. Если время ускользает в жизни, помогает сделать его видимым: аналоговые часы, визуальный таймер, будильники на начало сборов. Подробнее: ${MAPLINK("time_blindness", "«Слепота ко времени» на карте")}.</p>` : ""}`;
  }
  function loadHtml(S, full) {
    if (!S || !S.done) return "";
    const big = S.bigCapacity, ok = !S.unreliable && !S.guessing && !S.lowMissed;
    return `<h3>${TASKS.load.title}</h3>
      <p>Квадрат сбоку вы заметили в <b>${pc0(S.low.hit)}</b> попыток при лёгком поиске и в <b>${pc0(S.high.hit)}</b> при трудном. Букву назвали верно в ${pc0(S.low.acc)} и ${pc0(S.high.acc)} попыток.</p>
      <p>${S.drop == null || !ok ? "" : big ? "Трудный поиск почти не мешал замечать лишнее. Похоже, у вас большой запас восприятия: вы видите больше, чем нужно для задачи. Это помогает замечать детали, ошибки и перемены. Обратная сторона: в насыщенной обстановке мозг продолжает обрабатывать всё подряд, и усталость приходит быстрее." : "При трудном поиске лишнее вы замечали реже. Так у большинства людей: трудная задача забирает внимание целиком и отсекает всё постороннее."}</p>
      ${S.unreliable ? `<p class="small muted">Квадрат часто «виделся» и тогда, когда его не было (${pc0((S.low.fa + S.high.fa) / 2)} таких попыток), поэтому ответы о нём ненадёжны.</p>` : ""}
      ${S.lowMissed ? `<p class="small muted">Квадрат редко замечался даже при лёгком поиске, поэтому сравнить уровни нагрузки не получается. Возможно, он слишком мелкий на вашем экране или взгляд уходил от центра.</p>` : ""}
      ${S.guessing ? `<p class="small muted">При трудном поиске буква угадывалась не лучше случайного, поэтому сравнение ненадёжно.</p>` : ""}
      ${full ? `<p class="small muted">Задание сделано по образцу опытов Нилли Лави. Типичные взрослые при высокой нагрузке замечали лишний объект заметно реже, а у аутичных взрослых нагрузка на это почти не влияла: авторы объясняют это большей ёмкостью восприятия (Remington, Swettenham & Lavie, 2012; Remington et al., 2009; у детей: Swettenham et al., 2014). Исследований немного, а в задании всего 8 попыток с квадратом на каждый уровень, поэтому это наблюдение, а не измерение. Время показа зависит от экрана. Подробнее: ${MAPLINK("perceptual_capacity", "«Ёмкость восприятия» на карте")}.</p>` : ""}${devNote("load")}`;
  }
  function navonHtml(S, full) {
    if (!S || !S.done) return "";
    if (!S.enough) return `<h3>${TASKS.navon.title}</h3><p class="small muted">Ошибок было много (большая буква: ${pc0(S.global.acc)} верно, маленькие: ${pc0(S.local.acc)}), поэтому сравнение ненадёжно. Можно пройти ещё раз.</p>`;
    const a = S.globalAdv;
    const words = a > 30 ? "Целое вы называли быстрее деталей. Так у большинства людей: сначала лес, потом деревья." : a < -30 ? "Детали вы называли быстрее целого: сначала деревья, потом лес. Это стиль восприятия, а не недостаток." : "Целое и детали вы называли примерно одинаково быстро.";
    const gI = S.local.interf, lI = S.global.interf;
    const itf = (x, what) => (x == null ? `${what}: нет данных` : x > 20 ? `${what} (ответ медленнее на ${ms(x)})` : `${what.replace("мешало", "почти не мешало").replace("мешали", "почти не мешали")}`);
    return `<h3>${TASKS.navon.title}</h3>
      <p>Большую букву вы называли за ${ms(S.global.rt)}, маленькие за ${ms(S.local.rt)}. ${words}</p>
      <p class="small">Когда большая и маленькие буквы не совпадали, ${itf(gI, "целое мешало называть детали")}, ${itf(lI, "детали мешали называть целое")}.</p>
      ${full ? `<p class="small muted">Задание на основе фигур Навона (Navon, 1977). В метаанализе 56 исследований у аутичных людей не нашли ни общего преимущества в деталях, ни «неспособности видеть целое», но целое в среднем замечалось немного позже (van der Hallen et al., 2015). Поэтому результат описывает стиль, а не дефицит. Норм нет, попыток немного. Подробнее: ${MAPLINK("detail_focus", "«Внимание к деталям» на карте")}.</p>` : ""}${devNote("navon")}`;
  }
  function spanHtml(S, full) {
    if (!S || !S.done) return "";
    const f = S.rows.filter((x) => x.dir === "f"), b = S.rows.filter((x) => x.dir === "b");
    return `<h3>${TASKS.span.title}</h3>
      <p>В прямом порядке вы удержали <b>${S.fwd}</b> цифр, в обратном <b>${S.bwd}</b>. Верных попыток: ${f.filter((x) => x.ok).length} из ${f.length} и ${b.filter((x) => x.ok).length} из ${b.length}.</p>
      <p class="small">Прямой порядок больше говорит о внимании и объёме, обратный — о рабочей памяти: удержать и одновременно переставить.</p>
      ${full ? `<p class="small muted">Задание по образцу «ряда цифр» из классических тестов памяти. Норм для этой браузерной версии нет: границы в выводе — наш ориентир. Результат зависит от усталости, тревоги и того, проговаривали ли вы цифры про себя.</p>` : ""}${devNote("span")}`;
  }
  function tapHtml(S, full) {
    if (!S || !S.done) return "";
    if (!S.enough) return `<h3>${TASKS.tap.title}</h3><p class="small muted">Засчитанных нажатий слишком мало (с тактом ${S.nSync}, без такта ${S.nCont}). Попробуйте ещё раз.</p>`;
    return `<h3>${TASKS.tap.title}</h3>
      <p>С миганием: нажатия отклонялись от него в среднем на ${ms(S.asynSd)} в разные стороны${S.asynMean != null ? ` и ${S.asynMean < 0 ? "чуть опережали" : "чуть отставали от"} его на ${ms(Math.abs(S.asynMean))}` : ""}.</p>
      <p>Без мигания: средний промежуток ${ms(S.itiMean)} при нужных 700 мс, разброс промежутков <b class="mono">${Math.round(S.cv * 100)}%</b>.</p>
      ${full ? `<p class="small muted">Опережать мигание на несколько десятков миллисекунд — нормально, так делает большинство людей. Главные показатели — разброс с тактом (насколько точно вы подстраиваетесь) и разброс без такта (насколько ровно идут ваши внутренние часы). Такт задаётся миганием, а не звуком: звук в браузере запаздывает непредсказуемо (Bridges et al., 2020). Норм нет, границы — наш ориентир.</p>` : ""}${devNote("tap")}`;
  }
  function pitchHtml(S, full) {
    if (!S || !S.done) return "";
    if (!S.enough) return `<h3>${TASKS.pitch.title}</h3><p class="small muted">На лёгких парах было много ошибок (верно ${pc0(S.easyAcc)}), поэтому порог не определён.</p>`;
    const f = S.thr < 1 ? S.thr.toFixed(1).replace(".", ",") : String(Math.round(S.thr * 10) / 10).replace(".", ",");
    return `<h3>${TASKS.pitch.title}</h3>
      <p>Порог различения: <b class="mono">${f}%</b>. Это примерно ${Math.max(1, Math.round(S.thr * 10))} Гц при звуке 1000 Гц. Пар прослушано ${S.n}, разворотов лесенки ${S.revs}.</p>
      ${full ? `<p class="small muted">Порог — разница в высоте, которую вы различаете примерно в 7 случаях из 10 (лесенка «2 вниз — 1 вверх», Levitt, 1971). Основная частота каждый раз своя, чтобы сравнивались два звука, а не память. Результат зависит от наушников, громкости и музыкального опыта. Норм для этой версии нет, границы — наш ориентир.</p>` : ""}`;
  }
  function traceHtml(S, full) {
    if (!S || !S.done) return "";
    return `<h3>${TASKS.trace.title}</h3>
      <p>За края дорожки вы выходили на <b>${pc0(S.out)}</b> пути, среднее отклонение — ${Math.round(S.dev * 100)}% от полуширины дорожки. Одна дорожка в среднем заняла ${S.time.toFixed(1).replace(".", ",")} с${S.lifts ? `, палец или кнопку отрывали ${S.lifts} раз` : ""}.</p>
      <p class="small">Устройство: ${S.pointer === "touch" ? "палец на сенсорном экране" : S.pointer === "pen" ? "стилус" : "мышь или тачпад"}. Сравнивать результат можно только с собой на том же устройстве.</p>
      ${full ? `<p class="small muted">Точность движения зависит от устройства, размера экрана и скорости. Норм нет, границы — наш ориентир.</p>` : ""}`;
  }
  const TASK_HTML = { rt: rtHtml, tp: tpHtml, load: loadHtml, navon: navonHtml, span: spanHtml, tap: tapHtml, pitch: pitchHtml, trace: traceHtml };
  // Блок «Вывод»: итог задания, что это значит, связь с исследованиями и что может помочь
  function verdictHtml(v, full) {
    if (!v) return "";
    return `<div class="verdict t-${v.tone}"><span class="eyebrow">Вывод</span><b class="v-title">${esc(v.title)}</b><p>${esc(v.means)}</p>
      ${full && v.link && !v.adhd ? `<p class="small">${esc(v.link)}</p>` : ""}
      ${v.adhd || v.asd ? `<dl class="v-ctx small">${v.you ? `<dt>Ваш результат</dt><dd><b>${esc(v.you)}</b></dd>` : ""}${v.adhd ? `<dt>Что это может значить для СДВГ</dt><dd>${esc(v.adhd)}</dd>` : ""}${v.asd ? `<dt>Что это может значить для РАС</dt><dd>${esc(v.asd)}</dd>` : ""}</dl>` : ""}
      ${full && v.tips.length ? `<p class="small"><b>Что может помочь:</b></p><ul class="small">${v.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      ${full ? `<p class="small muted">Норм для этого задания нет. Границы между уровнями — наш ориентир для чтения результата, а не клиническая норма, и по одному прохождению диагноз не ставится.</p>` : ""}</div>`;
  }
  const withVerdict = (html, v, full) => (html && v ? html.replace("</h3>", "</h3>" + verdictHtml(v, full)) : html);
  const taskHtml = (k, S, full) => withVerdict(TASK_HTML[k](S, full), S && S.done ? ND.lab.verdict(k, S) : null, full);
  const ddFull = (D, full) => withVerdict(ddHtml(D, full), ND.lab.verdict("dd", D), full);
  const probeFull = (PS, full) => withVerdict(probeHtml(PS), ND.lab.verdict("probe", PS), full);

  // Прохождение заданий: состояние в RUN, экран обновляется точечно, чтобы не сбивать время.
  let RUN = null;
  const now = () => performance.now();
  function runClear() { if (RUN) { RUN.timers.forEach(clearTimeout); RUN.timers = []; } }
  function later(fn, t) { const id = setTimeout(fn, t); RUN.timers.push(id); return id; }
  const stage = () => document.getElementById("lab-stage");
  const setStage = (html) => { const s = stage(); if (s) s.innerHTML = html; };
  const setControls = (html) => { const c = document.getElementById("lab-ctl"); if (c) c.innerHTML = html; };
  const setCount = (txt) => { const c = document.getElementById("lab-count"); if (c) c.textContent = txt; };
  function onPaint(fn) { requestAnimationFrame(() => requestAnimationFrame(fn)); }

  function runStart(task) {
    runClear();
    const seed = labSeed() + (task.charCodeAt(0) * 7919);
    RUN = { task, i: 0, rows: [], timers: [], phase: "", seed };
    if (task === "rt") RUN.fps = ND.lab.rtForeperiods(seed);
    if (task === "tp") RUN.list = ND.lab.TP_TARGETS;
    if (task === "load") {
      const pr = ND.lab.loadTrials(seed + 1).slice(0, 4).map((t, k) => ({ ...t, load: k % 2 ? "high" : "low", extra: k < 2 ? k === 0 : k === 3, practice: true }));
      RUN.list = pr.concat(ND.lab.loadTrials(seed));
    }
    if (task === "navon") RUN.list = ND.lab.navonTrials(seed);
    if (task === "tap") { RUN.flashes = []; RUN.taps = []; }
    if (task === "pitch") { RUN.rows = []; RUN.practiceLeft = 2; try { RUN.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { RUN.ac = null; } }
    if (task === "trace") { RUN.trials = []; RUN.pointer = null; }
    renderRunShell();
    if (TIMED.includes(task)) devCheck(() => runNext()); else runNext();
  }
  // B11: 1,5 секунды измеряем кадры и таймеры, результат сохраняется для заметки под заданием
  function devCheck(then) {
    const R = RUN; R.phase = "dev";
    setStage(`<p class="small muted">Проверяем устройство, 2 секунды…</p>`); setControls("");
    const frames = [], late = []; let last = null; const t0 = now();
    const tick = (ts) => { if (RUN !== R) return; if (last != null) frames.push(ts - last); last = ts; if (now() - t0 < 1500) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const timer = (k) => { const want = now() + 20; later(() => { late.push(now() - want); if (k < 15) timer(k + 1); }, 20); };
    timer(0);
    later(() => {
      if (RUN !== R) return;
      const L = labData(); L.dev = L.dev || {};
      L.dev[R.task] = ND.lab.devSummary(frames, late, { coarse: !!(window.matchMedia && matchMedia("(pointer: coarse)").matches), at: new Date().toISOString() });
      R.phase = ""; then();
    }, 1700);
  }
  function renderRunShell() {
    const T = TASKS[RUN.task];
    app.innerHTML = `<div class="wrap"><div class="card lab lab-run">
      <div class="row" style="justify-content:space-between"><span class="eyebrow">${esc(T.title)}</span><span class="eyebrow mono" id="lab-count"></span></div>
      <div class="lab-stage t-${RUN.task}" id="lab-stage" data-run="stage" aria-live="polite"></div>
      <div class="lab-ctl" id="lab-ctl"></div>
      <div class="nav"><button class="btn ghost" data-act="lab-stop">Прервать</button></div>
    </div></div>`;
  }
  function runFinish() {
    runClear();
    const L = labData(), task = RUN.task;
    if (task === "rt") L.rt = RUN.rows;
    if (task === "tp") { L.tp = RUN.rows; L.tpCounted = RUN.counted; }
    if (task === "load") L.load = RUN.rows.filter((r) => !r.practice);
    if (task === "navon") L.navon = RUN.rows.filter((r) => !r.practice);
    if (task === "span") L.span = RUN.rows.filter((r) => !r.practice);
    if (task === "tap") L.tap = { flashes: RUN.flashes.map(Math.round), taps: RUN.taps.map((x) => ({ t: Math.round(x.t), phase: x.phase })) };
    if (task === "pitch") { L.pitch = RUN.rows; if (RUN.ac) RUN.ac.close().catch(() => {}); }
    if (task === "trace") L.trace = { trials: RUN.trials, pointer: RUN.pointer };
    L.when = L.when || {}; L.when[task] = new Date().toISOString();
    RUN = null; state.labTask = task; save(); render(); window.scrollTo(0, 0);
  }
  function runNext() {
    const R = RUN;
    if (R.task === "rt") {
      const total = ND.lab.RT.N + ND.lab.RT.PRACTICE;
      if (R.i >= total) return runFinish();
      const practice = R.i < ND.lab.RT.PRACTICE;
      setCount(practice ? `тренировка ${R.i + 1} из ${ND.lab.RT.PRACTICE}` : `${R.i - ND.lab.RT.PRACTICE + 1} из ${ND.lab.RT.N}`);
      setStage(`<span class="fix">+</span>`); R.phase = "wait"; R.practice = practice;
      later(() => { setStage(`<span class="rt-dot"></span>`); onPaint(() => { if (RUN !== R) return; R.t0 = now(); R.phase = "go";
        later(() => { if (R.phase !== "go") return; R.rows.push({ rt: null, practice }); rtFeedback("Не успели"); }, ND.lab.RT.TIMEOUT); }); }, R.fps[R.i]);
      setControls(`<p class="small muted">Пробел или касание серой области</p>`);
    } else if (R.task === "tp") {
      if (R.i >= R.list.length) {
        setStage(`<p>Последний вопрос: вы считали про себя?</p>`); setCount("");
        setControls(`<div class="hist-opts"><button class="opt" data-run="tp-count" data-v="1">Да, считал(а)</button><button class="opt" data-run="tp-count" data-v="0">Нет, по ощущению</button></div>`);
        R.phase = "ask"; return;
      }
      setCount(`${R.i + 1} из ${R.list.length}`); R.phase = "ready";
      setStage(`<p class="tp-goal">Отмерьте <b>${R.list[R.i]} секунд</b></p>`);
      setControls(`<button class="btn primary big" data-run="tp-start">Старт</button>`);
    } else if (R.task === "load") {
      if (R.i >= R.list.length) return runFinish();
      const t = R.list[R.i];
      setCount(t.practice ? `тренировка ${R.i + 1} из 4` : `${R.i - 3} из ${ND.lab.LOAD.N}`);
      if (R.i === 4 && !R.toldReal) { R.toldReal = true; R.phase = "pause"; setStage(`<p>Тренировка закончилась. Теперь буквы будут появляться быстрее.</p>`); setControls(`<button class="btn primary" data-run="go">Начать</button>`); return; }
      R.phase = "fix"; setControls(""); setStage(`<span class="fix">+</span>`);
      later(() => {
        const ring = [], letters = [...t.fill]; letters.splice(t.pos, 0, t.target);
        letters.forEach((ch, k) => { const ang = (k / 6) * 2 * Math.PI - Math.PI / 2; ring.push(`<span class="ld-l" style="left:calc(50% + ${Math.round(80 * Math.cos(ang))}px);top:calc(50% + ${Math.round(80 * Math.sin(ang))}px)">${ch}</span>`); });
        setStage(`<span class="fix">+</span>${ring.join("")}${t.extra ? `<span class="ld-sq ${t.side}"></span>` : ""}`);
        onPaint(() => { if (RUN !== R) return; R.t0 = now();
          later(() => { setStage(`<span class="fix">+</span>`); R.phase = "ans";
            setControls(`<p class="small">Какая была буква?</p><div class="dd-choice"><button class="dd-opt" data-run="ld-ans" data-v="X"><b>X</b></button><button class="dd-opt" data-run="ld-ans" data-v="N"><b>N</b></button></div>`); }, t.practice ? 250 : ND.lab.LOAD.SHOW);
        });
      }, 600);
    } else if (R.task === "navon") {
      if (R.i >= R.list.length) return runFinish();
      const t = R.list[R.i], first = !R.i || R.list[R.i - 1].block !== t.block;
      const blk = t.block === "global" ? "Называйте <b>большую</b> букву" : "Называйте <b>маленькие</b> буквы";
      if (first && R.shownBlock !== t.block) { R.shownBlock = t.block; R.phase = "pause"; setCount(R.i ? "часть 2 из 2" : "часть 1 из 2"); setStage(`<p class="tp-goal">${blk}</p><p class="small muted">Сначала 4 тренировочные попытки.</p>`); setControls(`<button class="btn primary" data-run="go">Начать</button>`); return; }
      const inBlock = R.list.filter((x, k) => k <= R.i && x.block === t.block && !x.practice).length;
      setCount(t.practice ? "тренировка" : `${inBlock} из ${ND.lab.NAVON.PER}`);
      R.phase = "fix"; setStage(`<span class="fix">+</span>`);
      setControls(`<p class="small">${blk}</p><div class="dd-choice"><button class="dd-opt" data-run="nv-ans" data-v="Н"><b>Н</b><span>← или Н</span></button><button class="dd-opt" data-run="nv-ans" data-v="С"><b>С</b><span>→ или С</span></button></div>`);
      later(() => {
        const rows = ND.lab.NAVON_SHAPES[t.big].map((row) => `<div>${row.split("").map((c) => `<span>${c === "1" ? t.small : ""}</span>`).join("")}</div>`).join("");
        setStage(`<div class="navon">${rows}</div>`);
        onPaint(() => { if (RUN !== R) return; R.t0 = now(); R.phase = "go";
          later(() => { if (R.phase !== "go") return; navonAnswer(null); }, ND.lab.NAVON.MAX + 500); });
      }, 500);
    } else if (R.task === "span") spanNext();
    else if (R.task === "tap") tapNext();
    else if (R.task === "pitch") pitchNext();
    else if (R.task === "trace") traceNext();
  }

  // ── B7 «Удержать в уме» ──
  function spanNext() {
    const R = RUN, real = R.rows.filter((x) => !x.practice);
    const nx = ND.lab.spanNext(real, R.seed);
    if (!nx) return runFinish();
    R.told = R.told || {};
    if (!R.told[nx.dir]) {
      R.told[nx.dir] = true; R.phase = "pause"; setCount(nx.dir === "f" ? "часть 1 из 2" : "часть 2 из 2");
      R.cur = { dir: nx.dir, len: 2, seq: [3 + Math.floor(Math.random() * 3), 7 + Math.floor(Math.random() * 3)], practice: true };
      setStage(`<p class="tp-goal">${nx.dir === "f" ? "Вводите цифры <b>в том же порядке</b>" : "Теперь вводите цифры <b>в обратном порядке</b>: с последней до первой"}</p><p class="small muted">Сначала пример из 2 цифр.${nx.dir === "b" ? " Например, 3 7 нужно ввести как 7 3." : ""}</p>`);
      setControls(`<button class="btn primary" data-run="go">Начать</button>`); return;
    }
    if (!R.cur) R.cur = nx;
    const c = R.cur;
    setCount(c.practice ? "пример" : `${c.dir === "f" ? "прямой" : "обратный"} порядок · ${c.len} цифр`);
    R.phase = "show"; R.ans = []; setControls(""); setStage(`<span class="fix">+</span>`);
    c.seq.forEach((d, k) => {
      later(() => setStage(`<span class="span-d">${d}</span>`), 600 + k * (ND.lab.SPAN.ON + ND.lab.SPAN.OFF));
      later(() => setStage(``), 600 + k * (ND.lab.SPAN.ON + ND.lab.SPAN.OFF) + ND.lab.SPAN.ON);
    });
    later(() => { R.phase = "input"; spanInputView(); }, 600 + c.seq.length * (ND.lab.SPAN.ON + ND.lab.SPAN.OFF));
  }
  function spanInputView() {
    const R = RUN, c = R.cur;
    setStage(`<p class="span-ans mono">${Array.from({ length: c.len }, (_, k) => (R.ans[k] != null ? R.ans[k] : "_")).join(" ")}</p><p class="small muted">${c.dir === "f" ? "В том же порядке" : "В обратном порядке"}</p>`);
    setControls(`<div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button class="dd-opt" data-run="sp-d" data-v="${d}"><b>${d}</b></button>`).join("")}
      <button class="btn ghost" data-run="sp-del">Стереть</button><button class="btn primary" data-run="sp-ok" ${R.ans.length === c.len ? "" : "disabled"}>Готово</button></div>`);
  }
  function spanInput(kind, v) {
    const R = RUN, c = R.cur; if (R.phase !== "input" || !c) return;
    if (kind === "sp-d" && R.ans.length < c.len) R.ans.push(+v);
    if (kind === "sp-del") R.ans.pop();
    if (kind === "sp-ok" && R.ans.length === c.len) {
      const want = c.dir === "f" ? c.seq : [...c.seq].reverse(), ok = want.every((d, k) => d === R.ans[k]);
      R.rows.push({ dir: c.dir, len: c.len, seq: c.seq, ans: [...R.ans], ok, practice: !!c.practice });
      R.phase = "fb"; R.cur = null; setControls("");
      setStage(c.practice ? `<span class="rt-fb">${ok ? "Верно" : `Нужно было: ${want.join(" ")}`}</span>` : `<span class="rt-fb">Записано</span>`);
      later(() => runNext(), c.practice && !ok ? 1800 : 700); return;
    }
    spanInputView();
  }

  // ── B8 «В ритм» ──
  function tapNext() {
    const R = RUN, T = ND.lab.TAP;
    if (!R.told) { R.told = true; R.phase = "pause"; setStage(`<p class="tp-goal">Стучите вместе с миганием</p><p class="small muted">После ${T.SYNC} миганий кружок погаснет: продолжайте в том же темпе.</p>`); setControls(`<button class="btn primary" data-run="go">Начать</button>`); return; }
    R.phase = "sync"; setControls(`<p class="small muted">Пробел или касание серой области</p>`);
    setStage(`<span class="tap-dot" id="tap-dot"></span><p class="small muted tap-left" id="tap-left"></p>`);
    const dot = document.getElementById("tap-dot"); let next = null, k = 0;
    const loop = (ts) => {
      if (RUN !== R || R.phase === "done") return;
      if (next == null) next = ts + 600;
      if (k < T.SYNC && ts >= next) { dot.classList.add("on"); R.flashes.push(ts); k++; next += T.ISI; const off = ts; later(() => dot.classList.remove("on"), 100); }
      if (k >= T.SYNC && R.phase === "sync" && ts >= R.flashes[R.flashes.length - 1] + T.ISI / 2) { R.phase = "cont"; tapLeft(); later(tapWatch, 3000); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  const TAP_NEED = () => ND.lab.TAP.CONT + ND.lab.TAP.CSKIP;
  function tapLeft() { const el = document.getElementById("tap-left"), n = RUN.taps.filter((x) => x.phase === "cont").length; if (el) el.textContent = RUN.phase === "cont" ? `Сами, тем же темпом: осталось ${Math.max(0, TAP_NEED() - n)}` : ""; }
  function tapWatch() { const R = RUN; if (!R || R.task !== "tap" || R.phase !== "cont") return; const last = R.taps.length ? R.taps[R.taps.length - 1].t : 0; if (now() - last > 2500) { R.phase = "done"; runFinish(); } else later(tapWatch, 500); }
  function tapPress() {
    const R = RUN; if (R.phase !== "sync" && R.phase !== "cont") return;
    R.taps.push({ t: now(), phase: R.phase });
    if (R.phase === "cont") { tapLeft(); if (R.taps.filter((x) => x.phase === "cont").length >= TAP_NEED()) { R.phase = "done"; runFinish(); } }
  }

  // ── B9 «Слух на высоту звука» ──
  function tone(ac, f, at) {
    const o = ac.createOscillator(), g = ac.createGain(), d = ND.lab.PITCH.TONE / 1000;
    o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.2, at + 0.015); g.gain.setValueAtTime(0.2, at + d - 0.015); g.gain.linearRampToValueAtTime(0, at + d);
    o.start(at); o.stop(at + d + 0.02);
  }
  function pitchNext() {
    const R = RUN, P = ND.lab.PITCH;
    if (!R.ac) { setStage(`<p>Браузер не даёт воспроизвести звук. Попробуйте другой браузер.</p>`); setControls(""); R.phase = "x"; return; }
    if (!R.told) { R.told = true; R.phase = "pause"; setStage(`<p class="tp-goal">Наденьте наушники и проверьте громкость</p><p class="small muted">Звук должен быть отчётливым, но не громким.</p>`); setControls(`<button class="btn" data-run="pt-test">Прослушать пример</button> <button class="btn primary" data-run="go">Слышно, начать</button>`); return; }
    const st = ND.lab.pitchState(R.rows);
    if (!R.practiceLeft && st.done) return runFinish();
    const delta = R.practiceLeft ? 20 : st.delta, base = 800 + Math.random() * 450, hiFirst = Math.random() < 0.5;
    const f1 = hiFirst ? base * (1 + delta / 100) : base, f2 = hiFirst ? base : base * (1 + delta / 100);
    R.cur = { delta, hiFirst, base }; R.phase = "play";
    setCount(R.practiceLeft ? "тренировка" : `пара ${st.n + 1}`);
    setStage(`<p class="tp-goal">Слушайте…</p>`); setControls("");
    if (R.ac.state === "suspended") R.ac.resume();
    const t = R.ac.currentTime + 0.15, gap = (P.TONE + P.GAP) / 1000;
    tone(R.ac, f1, t); tone(R.ac, f2, t + gap);
    later(() => { R.phase = "ans"; setStage(`<p class="tp-goal">Какой звук выше?</p>`);
      setControls(`<div class="dd-choice"><button class="dd-opt" data-run="pt-ans" data-v="1"><b>Первый выше</b><span>1 или ←</span></button><button class="dd-opt" data-run="pt-ans" data-v="2"><b>Второй выше</b><span>2 или →</span></button></div>`); }, 150 + (P.TONE * 2 + P.GAP) + 100);
  }
  function pitchAnswer(v) {
    const R = RUN, c = R.cur; if (R.phase !== "ans") return;
    const ok = (v === "1") === c.hiFirst; R.phase = "fb"; setControls("");
    if (R.practiceLeft) R.practiceLeft--; else R.rows.push({ delta: Math.round(c.delta * 1000) / 1000, ok });
    setStage(`<span class="rt-fb">${ok ? "Верно" : "Неверно"}</span>`);
    later(() => runNext(), 600);
  }

  // ── B10 «Провести линию» ──
  function traceNext() {
    const R = RUN, T = ND.lab.TRACE;
    if (R.trials.length >= T.N) return runFinish();
    const i = R.trials.length, p = ND.lab.TRACE_PATHS[i % ND.lab.TRACE_PATHS.length];
    setCount(`дорожка ${i + 1} из ${T.N}`); R.phase = "trace"; setControls(`<p class="small muted">Нажмите на зелёный кружок и ведите до красного, не отрывая</p>`);
    setStage(`<canvas id="trace-cv" class="trace-cv" width="${T.W * 2}" height="${T.H * 2}" aria-label="Дорожка"></canvas>`);
    const cv = document.getElementById("trace-cv"), g = cv.getContext("2d");
    const tr = { path: i, pts: [], lifts: 0 }; let drawing = false, started = false;
    const css = getComputedStyle(document.body), ink = css.getPropertyValue("--ink").trim() || "#222", acc = css.getPropertyValue("--accent").trim() || "#2a6";
    const draw = () => {
      g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, T.W, T.H);
      g.lineCap = "round"; g.lineJoin = "round";
      const line = (w, c) => { g.beginPath(); for (let x = T.X0; x <= T.X1; x += 2) { const y = ND.lab.traceY(p, x); x === T.X0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.lineWidth = w; g.strokeStyle = c; g.stroke(); };
      line(T.HALF * 2, "rgba(127,127,127,0.25)"); line(1, "rgba(127,127,127,0.6)");
      g.fillStyle = "#3a9d5d"; g.beginPath(); g.arc(T.X0, ND.lab.traceY(p, T.X0), 11, 0, 7); g.fill();
      g.fillStyle = "#c8553d"; g.beginPath(); g.arc(T.X1, ND.lab.traceY(p, T.X1), 11, 0, 7); g.fill();
      if (tr.pts.length) { g.beginPath(); tr.pts.forEach((q, k) => (k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.lineWidth = 3; g.strokeStyle = acc || ink; g.stroke(); }
    };
    draw();
    const pos = (e) => { const b = cv.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * T.W, ((e.clientY - b.top) / b.height) * T.H]; };
    cv.addEventListener("pointerdown", (e) => {
      if (RUN !== R || R.phase !== "trace") return;
      const [x, y] = pos(e), lastP = tr.pts[tr.pts.length - 1];
      const near = !started ? Math.hypot(x - T.X0, y - ND.lab.traceY(p, T.X0)) < 30 : Math.hypot(x - lastP[0], y - lastP[1]) < 40;
      if (!near) return;
      e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = true; started = true; R.pointer = R.pointer || e.pointerType;
      tr.pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(now())]); draw();
    });
    cv.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs.length ? evs : [e]) { const [x, y] = pos(ev); tr.pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(now())]); }
      draw();
      const [x] = pos(e);
      if (x >= T.X1) finish();
    });
    const finish = () => { if (!drawing) return; drawing = false; R.trials.push(tr); R.phase = "fb"; setControls(""); later(() => runNext(), 500); };
    cv.addEventListener("pointerup", () => { if (!drawing) return; const lastP = tr.pts[tr.pts.length - 1]; if (lastP && lastP[0] >= T.X1 - 15) finish(); else { drawing = false; tr.lifts++; setControls(`<p class="small muted">Продолжите с того места, где остановились</p>`); } });
  }
  function rtFeedback(txt) {
    const R = RUN; R.phase = "fb"; setStage(`<span class="rt-fb">${txt}</span>`);
    later(() => { R.i++; runNext(); }, 700);
  }
  function rtPress(e) {
    const R = RUN;
    if (R.phase === "go") { const rt = now() - R.t0; R.phase = "fb"; runClear(); R.rows.push({ rt: Math.round(rt), practice: R.practice }); rtFeedback(`${Math.round(rt)} мс`); }
    else if (R.phase === "wait") { runClear(); R.rows.push({ rt: null, early: true, practice: R.practice }); rtFeedback("Рано! Ждите кружок"); }
  }
  function navonAnswer(v) {
    const R = RUN, t = R.list[R.i]; if (R.phase !== "go") return;
    const rt = v == null ? null : Math.round(now() - R.t0); runClear(); R.phase = "fb";
    R.rows.push({ block: t.block, big: t.big, small: t.small, ans: v, rt, practice: !!t.practice });
    const want = t.block === "global" ? t.big : t.small;
    setStage(v === want ? "" : `<span class="rt-fb">${v == null ? "Не успели" : "Неверно"}</span>`);
    later(() => { R.i++; runNext(); }, v === want ? 300 : 900);
  }
  function runInput(kind, v) {
    const R = RUN; if (!R) return;
    if (R.task === "rt" && kind === "press") return rtPress();
    if (R.task === "tap" && kind === "press") return tapPress();
    if (kind === "go" && R.phase === "pause") { R.phase = ""; runNext(); return; }
    if (R.task === "tp") {
      if (kind === "tp-start" && R.phase === "ready") { R.phase = "run"; R.t0 = now(); setStage(`<p class="tp-goal">Идёт отсчёт… Нажмите «Стоп», когда пройдёт <b>${R.list[R.i]} секунд</b></p>`); setControls(`<button class="btn primary big" data-run="tp-stop">Стоп</button>`); return; }
      if (kind === "tp-stop" && R.phase === "run") { const sec = (now() - R.t0) / 1000; R.rows.push({ target: R.list[R.i], produced: Math.round(sec * 10) / 10 }); R.phase = "fb"; setStage(`<p class="tp-goal">Записано</p>`); setControls(""); later(() => { R.i++; runNext(); }, 800); return; }
      if (kind === "tp-count" && R.phase === "ask") { R.counted = v === "1"; return runFinish(); }
    }
    if (R.task === "load") {
      const t = R.list[R.i];
      if (kind === "ld-ans" && R.phase === "ans") { R.ans = v; R.phase = "det"; setControls(`<p class="small">${t.practice && v !== t.target ? `Это была буква ${t.target}. ` : ""}Был ли сбоку маленький серый квадрат?</p><div class="dd-choice"><button class="dd-opt" data-run="ld-det" data-v="1"><b>Да</b></button><button class="dd-opt" data-run="ld-det" data-v="0"><b>Нет</b></button></div>`); return; }
      if (kind === "ld-det" && R.phase === "det") { R.rows.push({ load: t.load, extra: t.extra, target: t.target, ans: R.ans, saw: v === "1", practice: !!t.practice }); R.phase = "fb"; setControls(""); later(() => { R.i++; runNext(); }, 250); return; }
    }
    if (R.task === "navon" && kind === "nv-ans") navonAnswer(v);
    if (R.task === "span") spanInput(kind, v);
    if (R.task === "tap" && kind === "press") tapPress();
    if (R.task === "pitch" && kind === "pt-ans") pitchAnswer(v);
    if (R.task === "pitch" && kind === "pt-test" && R.ac) { if (R.ac.state === "suspended") R.ac.resume(); tone(R.ac, 1000, R.ac.currentTime + 0.05); tone(R.ac, 1200, R.ac.currentTime + 0.7); }
  }

  // если вкладку свернули, таймеры браузера замедляются и время искажается: попытку не засчитываем, задание прерываем
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !RUN) return;
    runClear(); RUN = null; render(); toast("Задание прервано: вкладка была свёрнута. Начните заново, когда будет удобно");
  });
  document.addEventListener("pointerdown", (e) => {
    if (!RUN || state.view !== "lab") return;
    const b = e.target.closest("[data-run]");
    if (!b) return;
    if (b.dataset.run === "stage") { if (RUN.task === "rt" || RUN.task === "tap") { e.preventDefault(); runInput("press"); } return; }
    e.preventDefault(); runInput(b.dataset.run, b.dataset.v);
  });
  document.addEventListener("keydown", (e) => {
    if (!RUN || state.view !== "lab" || e.repeat) return;
    const R = RUN, c = e.code;
    if (R.task === "rt" && (c === "Space" || c === "Enter")) { e.preventDefault(); return runInput("press"); }
    if ((c === "Enter" || c === "Space") && R.phase === "pause") { e.preventDefault(); return runInput("go"); }
    if (R.task === "tp" && (c === "Space" || c === "Enter")) { e.preventDefault(); return runInput(R.phase === "ready" ? "tp-start" : "tp-stop"); }
    if (R.task === "load" && R.phase === "ans" && (c === "KeyX" || c === "KeyN")) { e.preventDefault(); return runInput("ld-ans", c === "KeyX" ? "X" : "N"); }
    if (R.task === "load" && R.phase === "det" && (c === "KeyY" || c === "KeyD" || c === "ArrowLeft" || c === "Digit1")) { e.preventDefault(); return runInput("ld-det", "1"); }
    if (R.task === "load" && R.phase === "det" && (c === "KeyN" || c === "ArrowRight" || c === "Digit2")) { e.preventDefault(); return runInput("ld-det", "0"); }
    if (R.task === "tap" && (c === "Space" || c === "Enter") && R.phase !== "pause") { e.preventDefault(); return runInput("press"); }
    if (R.task === "span" && R.phase === "input") {
      const d = /^(Digit|Numpad)([1-9])$/.exec(c);
      if (d) { e.preventDefault(); return runInput("sp-d", d[2]); }
      if (c === "Backspace") { e.preventDefault(); return runInput("sp-del"); }
      if (c === "Enter") { e.preventDefault(); return runInput("sp-ok"); }
    }
    if (R.task === "pitch" && R.phase === "ans" && (c === "Digit1" || c === "ArrowLeft" || c === "Numpad1")) { e.preventDefault(); return runInput("pt-ans", "1"); }
    if (R.task === "pitch" && R.phase === "ans" && (c === "Digit2" || c === "ArrowRight" || c === "Numpad2")) { e.preventDefault(); return runInput("pt-ans", "2"); }
    if (R.task === "navon" && (c === "ArrowLeft" || c === "KeyY")) { e.preventDefault(); return runInput("nv-ans", "Н"); }
    if (R.task === "navon" && (c === "ArrowRight" || c === "KeyC")) { e.preventDefault(); return runInput("nv-ans", "С"); }
  });

  // B12: «Слова и дела» — результаты заданий рядом с похожими вопросами анкеты
  function labWD(L) {
    const sums = {}, verdicts = {};
    L = L || state.lab || {};
    sums.probe = ND.lab.probeSummary(state.probe && state.probe.list); verdicts.probe = ND.lab.verdict("probe", sums.probe);
    sums.dd = ND.lab.discount(L.dd || {}); verdicts.dd = ND.lab.verdict("dd", sums.dd);
    for (const k of Object.keys(TASKS)) { const S = sumOf(k, L); sums[k] = S; verdicts[k] = S && S.done ? ND.lab.verdict(k, S) : null; }
    return { rows: ND.views.wordsDeeds(state.R, sums, verdicts), sums, verdicts };
  }
  const TASK_TITLE = (k) => (k === "probe" ? "Где были ваши мысли" : k === "dd" ? "Сейчас или потом" : TASKS[k].title);
  function wdHtml(rows) {
    if (!rows.length) return "";
    const lvl = (q) => (q >= ND.PARAMS.thetaHi ? "выражено" : q >= ND.PARAMS.thetaLo ? "частично" : "мало");
    return `<h3>Слова и дела: анкета рядом с заданиями</h3>
      <div class="tbl-wrap"><table class="wd"><thead><tr><th>Что сравниваем</th><th>В анкете</th><th>В задании</th><th></th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td>${esc(x.what)}<br><span class="small muted">${esc(TASK_TITLE(x.task))}</span></td><td>${lvl(x.q)} <span class="small muted mono">${pct(x.q)}</span></td><td>${esc(x.title)}</td><td class="${x.agree ? "agree" : "differ"}">${x.agree ? "совпадает" : "расходится"}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="small muted">«В анкете» — средняя выраженность похожих вопросов (${[...new Set(rows.flatMap((x) => x.items))].length} вопросов, например «${esc(rows[0].items[0].replace(/\.$/, ""))}»). Расхождение — не ошибка и не повод сомневаться в ответах. Анкета описывает, как вы справляетесь в жизни за месяцы, а задание — как вы сработали за 3 минуты в тишине, когда всё внимание на нём. Связь между такими опросниками и заданиями в исследованиях слабая (Toplak, West & Stanovich, 2013). Частая картина при СДВГ: в жизни трудно, а в коротком интересном задании получается хорошо.</p>`;
  }
  function labBlock() {
    if (!ND.lab) return "";
    const PS = ND.lab.probeSummary(state.probe && state.probe.list), D = ND.lab.discount((state.lab || {}).dd || {});
    const done = Object.keys(TASKS).filter((k) => sumOf(k) && sumOf(k).done);
    const rest = Object.keys(TASKS).filter((k) => !done.includes(k)).map((k) => `«${TASKS[k].title}»`);
    const WD = labWD();
    return `<section class="block lab-block"><h2>Лаборатория <span class="tag">эксперимент</span></h2>
      <p class="muted">Необязательные мини-задания. Они не входят в баллы, критерии и общий вывод: это наблюдения о вашем стиле, а не тесты с нормами. Под каждым выводом написано, что такой результат может значить для СДВГ и для РАС по данным исследований. Ни одно задание не отличает РАС от СДВГ надёжно и не ставит диагноз: смотрите на них вместе с анкетой.</p>
      ${probeFull(PS, false)}
      ${D.complete ? ddFull(D, false) : `<p class="small">Задание «Сейчас или потом»: 20 выборов между деньгами сегодня и позже, около 2 минут.</p>`}
      ${done.map((k) => taskHtml(k, sumOf(k), false)).join("")}
      ${wdHtml(WD.rows)}
      ${rest.length ? `<p class="small">Ещё задания на 1–4 минуты: ${rest.join(", ")}.</p>` : ""}
      <div class="row no-print"><button class="btn" data-act="lab">Открыть лабораторию</button></div></section>`;
  }
  function renderLab() {
    if (RUN) { runClear(); renderRunShell(); runNext(); return; }
    const L = state.lab || { dd: {} }, task = state.labTask;
    const home = `<button class="btn ghost" data-act="lab-home">К лаборатории</button>`;
    let body;
    if (task === "dd") {
      const t = state.sample ? null : ND.lab.nextTrial(L.dd || {}), D = ND.lab.discount(L.dd || {});
      const total = ND.lab.DELAYS.length * ND.lab.STEPS, made = Object.values(L.dd || {}).reduce((a, x) => a + x.length, 0);
      if (t && !L.started && !made) {
        body = `<h1>Сейчас или потом</h1>
          <p>Представьте, что вам предлагают деньги. Можно взять сумму сегодня или 10 000 ₽ позже. Каждый раз выбирайте то, что выбрали бы на самом деле. Правильных ответов нет.</p>
          <p class="muted small">20 выборов, около 2 минут. Сумма «сегодня» подстраивается под ваши ответы, чтобы найти, сколько для вас стоят деньги через неделю, месяц, полгода и год. Это необязательное задание, в баллы оно не входит.</p>
          <div class="nav">${home}<button class="btn primary" data-act="lab-start">Начать</button></div>`;
      } else if (t) {
        body = `<span class="eyebrow">Выбор ${made + 1} из ${total}</span>
          <div class="bar"><i style="width:${Math.round((made / total) * 100)}%"></i></div>
          <h2>Что вы выберете?</h2>
          <div class="dd-choice">
            <button class="dd-opt" data-act="lab-c" data-v="now"><b>${rub(t.now)}</b><span>сегодня</span></button>
            <button class="dd-opt" data-act="lab-c" data-v="later"><b>${rub(ND.lab.LATER)}</b><span>${esc(t.delay.label)}</span></button>
          </div>
          <p class="small muted">Представьте, что деньги настоящие и обе выплаты гарантированы.</p>
          <div class="nav">${home}</div>`;
      } else {
        body = `<h1>Сейчас или потом</h1>${D.complete ? ddFull(D, true).replace(/^\s*<h3>[^<]*<\/h3>/, "") : `<p class="muted">В примере отчёта задание пройти нельзя. Начните анкету, чтобы пройти его самому.</p>`}
          <div class="nav">${home}${state.sample ? "" : `<button class="btn" data-act="lab-reset">Пройти заново</button>`}</div>`;
      }
    } else if (TASKS[task]) {
      const T = TASKS[task], S = sumOf(task);
      if (S && S.done) {
        body = `<h1>${esc(T.title)}</h1>${taskHtml(task, S, true).replace(/^<h3>[^<]*<\/h3>/, "")}
          <div class="nav">${home}${state.sample ? "" : `<button class="btn" data-act="lab-run" data-t="${task}">Пройти заново</button>`}</div>`;
      } else {
        body = `<h1>${esc(T.title)}</h1><p>${esc(T.what)}</p>
          <ul class="small">${T.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          <p class="small muted">${T.time}. Необязательное задание, в баллы и вывод оно не входит. Прервать можно в любой момент.</p>
          <div class="nav">${home}${state.sample ? `<span class="small muted">В примере отчёта задания пройти нельзя.</span>` : `<button class="btn primary" data-act="lab-run" data-t="${task}">Начать</button>`}</div>`;
      }
    } else {
      const D = ND.lab.discount(L.dd || {});
      const vOf = (k) => (k === "dd" ? ND.lab.verdict("dd", D) : sumOf(k) && sumOf(k).done ? ND.lab.verdict(k, sumOf(k)) : null);
      const card = (k, title, what, time, done) => `<li class="lab-task"><div><b>${esc(title)}</b> <span class="small muted">· ${time}</span><p class="small">${esc(what)}</p>${done && vOf(k) ? `<p class="small v-line t-${vOf(k).tone}">Вывод: <b>${esc(vOf(k).title)}</b></p>` : ""}</div>
        <button class="btn ${done ? "" : "primary"}" data-act="lab-open" data-t="${k}">${done ? "Результат" : "Пройти"}</button></li>`;
      body = `<h1>Лаборатория</h1>
        <p class="muted">Короткие задания в браузере. Они не входят в баллы, критерии и вывод: это наблюдения о вашем стиле, а не тесты с нормами. Лучше проходить на компьютере, когда вы не очень устали.</p>
        <ul class="lab-tasks">
          ${card("dd", "Сейчас или потом", "20 выборов между деньгами сегодня и позже.", "около 2 минут", D.complete)}
          ${Object.entries(TASKS).map(([k, T]) => card(k, T.title, T.what, T.time, sumOf(k).done)).join("")}
        </ul>
        ${probeFull(ND.lab.probeSummary(state.probe && state.probe.list), true)}
        ${wdHtml(labWD().rows)}
        <div class="nav"><button class="btn ghost" data-act="lab-back">Назад</button></div>`;
    }
    app.innerHTML = `<div class="wrap"><div class="card lab">${pix("strengths", "pix-q")}${body}</div></div>`;
  }

  // ───────── Н15. Мой персонаж ─────────
  let spriteCache = {};
  let suggestCache = null;
  function spriteSuggest() {
    const key = JSON.stringify(state.R);
    if (!suggestCache || suggestCache.key !== key) { let s = []; try { s = ND.sprite.suggest(ND.scoring.evaluate(state.R)); } catch (e) {} suggestCache = { key, s }; }
    return suggestCache.s;
  }
  function spriteLook() {
    const L = { ...ND.sprite.DEFAULT, ...(state.sprite || {}) };
    if (!Array.isArray(L.acc)) L.acc = spriteSuggest().map((x) => x[0]);
    return L;
  }
  function spriteURL(scale = 3) {
    const L = spriteLook(), k = JSON.stringify(L) + scale;
    return spriteCache[k] || (spriteCache[k] = ND.sprite.dataURL(L, scale));
  }
  const LOOK_BG = { default: "#dce8f2", space: "#2b3160", trains: "#f0dcc0", ocean: "#cfeaf2" };
  function spritePNG() {
    const s = ND.sprite.draw(document.createElement("canvas"), spriteLook(), 12), c = document.createElement("canvas");
    c.width = c.height = 480; const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    g.fillStyle = LOOK_BG[lookOf()]; g.fillRect(0, 0, 480, 480);
    g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, 400, 480, 80); g.beginPath(); g.ellipse(240, 420, 110, 14, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(s, 48, 48);
    return c.toDataURL("image/png");
  }
  function spriteBlock() {
    if (!ND.sprite) return "";
    return `<section class="block no-print"><div class="row-pix"><img class="sprite-mini" src="${spriteURL(3)}" alt="Ваш пиксельный персонаж">
      <div><h2>Мой персонаж</h2><p class="small muted">Пиксельный персонаж, которого можно собрать под себя и сохранить картинкой. Предметы в руках подсказаны ответами, но их можно поменять. Никаких диагнозов на картинке нет.</p>
      <button class="btn" data-act="sprite">Собрать персонажа</button></div></div></section>`;
  }
  function renderSprite() {
    const L = spriteLook(), sug = spriteSuggest(), why = Object.fromEntries(sug);
    const sw = (k, list) => `<div class="swatches">${list.map((c, i) => `<button class="sw-btn" data-act="sp" data-k="${k}" data-v="${i}" aria-pressed="${L[k] === i}" style="background:${ND.sprite.rgb(c)}" aria-label="Вариант ${i + 1}"></button>`).join("")}</div>`;
    app.innerHTML = `<div class="wrap"><div class="card sprite-ed">
      <h1>Мой персонаж</h1>
      <div class="sprite-stage"><canvas id="sprite-cv" width="256" height="256" aria-label="Ваш персонаж"></canvas></div>
      <fieldset class="period"><legend>Кожа</legend>${sw("skin", ND.sprite.SKIN)}</fieldset>
      <fieldset class="period"><legend>Волосы</legend>${sw("hair", ND.sprite.HAIR)}
        <div class="chips">${ND.sprite.STYLES.map(([v, l]) => `<button class="chip" data-act="sp" data-k="style" data-v="${v}" aria-pressed="${L.style === v}">${l}</button>`).join("")}</div></fieldset>
      <fieldset class="period"><legend>Одежда</legend>${sw("shirt", ND.sprite.SHIRT)}</fieldset>
      <fieldset class="period"><legend>Предметы</legend>
        <div class="chips">${ND.sprite.ACC.map(([v, l]) => `<button class="chip" data-act="sp" data-k="acc" data-v="${v}" aria-pressed="${L.acc.includes(v)}">${l}${why[v] ? " ★" : ""}</button>`).join("")}</div>
        ${sug.length ? `<p class="small muted">★ подсказано ответами: ${sug.map(([v, w]) => `${esc(ND.sprite.ACC.find((x) => x[0] === v)[1].toLowerCase())} (${esc(w)})`).join("; ")}. ${state.sprite && Array.isArray(state.sprite.acc) ? `<button class="linkish" data-act="sp-auto">Вернуть подсказки</button>` : ""}</p>` : `<p class="small muted">Когда ответов станет больше, здесь появятся подсказки по ним.</p>`}
      </fieldset>
      <div class="nav"><button class="btn" data-act="sp-dl">Скачать картинку</button><button class="btn primary" data-act="sp-done">Готово</button></div>
    </div></div>`;
    const cv = document.getElementById("sprite-cv");
    if (cv) ND.sprite.draw(cv, L, 8);
  }


  // ───────── остановка между разделами (10) ─────────
  const secOpen = (sid) => openItems().filter((x) => x.sec === sid);
  function minutesLeft() {
    const rts = ITEMS.map((x) => state.R[x.id] && state.R[x.id].rt).filter((x) => x > 1500 && x < 300000).sort((a, b) => a - b);
    const med = rts.length >= 5 ? rts[Math.floor(rts.length / 2)] : 15000;
    const left = openItems().filter((x) => !answered(x)).length;
    return { left, min: Math.max(1, Math.round((left * med) / 60000)) };
  }
  function renderBreak() {
    const next = ITEMS[state.idx], prev = ND.SECTIONS.find((x) => x.id === state.breaks[state.breaks.length - 1]) || {};
    const nsec = ND.SECTIONS.find((x) => x.id === next.sec);
    const secs = ND.SECTIONS.filter((x) => secOpen(x.id).length);
    const doneSecs = secs.filter((x) => secOpen(x.id).every(answered)).length;
    const T = minutesLeft();
    const hasChild = secOpen(next.sec).some((x) => !x.noChild && !x.kind) || secOpen(next.sec).some((x) => x.kind === "strength");
    const tip = hasChild && RECALL_BY_SEC[next.sec];
    app.innerHTML = `
      <div class="wrap">
        <div class="card break">
          ${pix(SEC_PIX[next.sec] || "break", "pix-wide")}
          <span class="eyebrow">Готово разделов: ${doneSecs} из ${secs.length}</span>
          <h2>Раздел «${esc(prev.title || "")}» готов</h2>
          ${mapBlock(true)}
          <p>Дальше: <b>${esc(nsec.title)}</b>. По вашему темпу осталось примерно <b>${T.min} мин</b> (${T.left} вопр.${ITEMS.some((x) => x.fu && !open(x) && ITEMS.indexOf(x) > state.idx) ? ", плюс уточняющие, если понадобятся" : ""}).</p>
          ${tip ? `<div class="recall-tip">${pix("school", "pix-mini")}<span><b>Перед ответами о детстве.</b> ${esc(tip)}</span></div>` : ""}
          <p class="small muted">Все ответы сохранены в этом браузере. Можно сделать перерыв и вернуться позже: анкета продолжится с этого места.</p>
          <div class="nav"><button class="btn ghost" data-act="brk-pause">Сделать перерыв</button><button class="btn primary" data-act="brk-go">Дальше</button></div>
        </div>
      </div>`;
  }

  // ───────── отчёт: раннее развитие, бюджет энергии, карта масок ─────────
  function historyBlock(H) {
    if (!H.rows.length) return "";
    return `<section class="block"><h2>Раннее развитие и семья</h2>
      <div class="tbl-wrap"><table><tbody>${H.rows.map((x) => `<tr><td>${esc(x.t)}</td><td>${x.flagged ? "<b>" : ""}${esc(x.answer)}${x.flagged ? "</b>" : ""}</td></tr>`).join("")}</tbody></table></div>
      ${H.notes.map((n) => `<div class="flag"><span>${esc(n.text)}</span></div>`).join("")}
      <p class="small muted">Это факты со слов, а не оценка. На баллы, критерии и индексы они не влияют, но для врача важны: DSM-5-TR требует, чтобы признаки были с раннего детства.</p></section>`;
  }
  const EV = (k) => `<span class="evtag evtag-${k}">${esc(ND.EVIDENCE[k])}</span>`;
  function energyBlock(EN) {
    if (!EN.drains.length) return "";
    const bar = (s) => `<div class="meter"><i style="width:${pct(s)}%"></i></div>`;
    return `<section class="block energy"><h2>Бюджет энергии</h2>
      <div class="row-pix">${pix("energy", "pix-side")}<p class="muted">Черновик того, на что у вас, судя по ответам, уходят силы и что может их возвращать. Это не оценка и не лечение, а отправная точка для планирования. Отмечайте, что совпадает, а что нет.</p></div>
      <div class="energy-cols">
        <div><h3>Что, вероятно, тратит силы</h3><ul class="sup">${EN.drains.map((x) => `<li><div class="row" style="justify-content:space-between"><b>${esc(x.label)}</b><span class="mono small">${pct(x.s)}</span></div>${bar(x.s)}<span class="small">${esc(x.why)}</span><span class="small muted">${EV(x.ev)} ${esc(x.src)}</span></li>`).join("")}</ul></div>
        <div><h3>Что может восстанавливать</h3>${EN.charges.length ? `<ul class="sup">${EN.charges.map((x) => `<li><b>${esc(x.label)}</b><span class="small">${esc(x.how)}</span><span class="small muted">${EV(x.ev)} ${esc(x.src)}</span></li>`).join("")}</ul>` : `<p class="small muted">По ответам подсказать не получилось. Подумайте, после чего вы чувствуете себя лучше, и впишите это в черновик недели.</p>`}</div>
      </div>
      <h3>Черновик недели</h3>
      <div class="tbl-wrap"><table class="week"><thead><tr><th>День</th><th>Нагрузка</th><th>Восстановление</th></tr></thead><tbody>${EN.week.map(([d, a, b]) => `<tr><td class="mono">${d}</td><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">Принцип: не ставить тяжёлые дни подряд и после каждой нагрузки оставлять время на восстановление. Идея «бюджета сил» пришла из опыта людей с хроническими состояниями и нейроотличных людей («теория ложек», Miserandino, 2003). Исследований её пользы пока нет. На баллы, критерии и индексы блок не влияет.</p></section>`;
  }
  function maskMapBlock(M) {
    if (M.n < 3) return "";
    const lvl = (x) => `<div class="meter mask"><i style="width:${pct(x.level)}%"></i></div>`;
    const row = (x) => `<tr><td>${esc(x.label)}</td><td>${lvl(x)}</td><td class="small">скрываете ${x.hidden} из ${x.n}${x.effort ? `, с усилием ${x.effort}` : ""}</td></tr>`;
    const head = M.most ? `Сильнее всего вы прячете себя ${M.most.key === "work" ? "на работе или учёбе" : M.most.key === "strangers" ? "с незнакомыми" : M.most.key === "friends" ? "с друзьями" : "дома"}: скрываете там ${M.most.hidden} из ${M.most.n} признаков, которые там проявляются.${M.least ? ` Меньше всего: ${M.least.key === "home" ? "дома" : M.least.key === "friends" ? "с друзьями" : M.least.key === "strangers" ? "с незнакомыми" : "на работе или учёбе"} (${M.least.hidden} из ${M.least.n}).` : ""}`
      : `Вы скрываете ${M.hidden} из ${M.n} признаков${M.places.length >= 2 ? ", и почти одинаково во всех местах, где они проявляются" : ""}.`;
    return `<section class="block"><h2>Карта масок</h2>
      <div class="row-pix">${pix("masks", "pix-side")}<p><b>${esc(head)}</b></p></div>
      <h3>Где</h3>
      <div class="tbl-wrap"><table><thead><tr><th>Обстановка</th><th>Насколько скрываете</th><th>Признаков</th></tr></thead><tbody>${M.places.map(row).join("")}</tbody></table></div>
      <h3>Что</h3>
      <div class="tbl-wrap"><table><thead><tr><th>Сфера</th><th>Насколько скрываете</th><th>Признаков</th></tr></thead><tbody>${M.areas.map(row).join("")}</tbody></table></div>
      ${M.top.length ? `<p class="small"><b>Скрываете с усилием:</b> ${M.top.map((t) => `«${esc(t.replace(/\.$/, ""))}»`).join("; ")}.</p>` : ""}
      <p class="small muted">Карта собрана из ваших ответов «где проявляется» и «видно ли это со стороны» по признакам РАС и СДВГ, где сейчас выбрано «частично» и выше. Вопрос о том, видно ли со стороны, задавался про признак в целом, а не про каждое место отдельно, поэтому карта приблизительная. Маскировка связана с усталостью, тревогой и выгоранием (Hull et al., 2017; Cage & Troxell-Whitman, 2019), поэтому полезно знать, где она отнимает больше всего сил. На баллы, критерии и индексы карта не влияет${M.catq != null ? `; общий камуфляж по пересчёту в CAT-Q — ${Math.round(M.catq)} из 175, он показан ниже` : ""}.</p></section>`;
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

  // ───────── v0.13: новые взгляды на ответы (src/views.js). На баллы и вывод не влияют ─────────
  const lvlWord = (s) => (s == null ? "—" : s >= ND.PARAMS.thetaHi ? "выражено" : s >= ND.PARAMS.thetaLo ? "заметно" : "слабо или нет");
  function sensoryBlock(SN) {
    if (SN.answered < 3) return "";
    const row = (x) => x.now == null ? "" : `<tr><td><b>${esc(x.label)}</b>${x.top.length ? `<br><span class="small muted">${x.top.map(esc).join("; ")}</span>` : ""}</td>
      <td>${meter(x.now, x.child == null ? 0 : x.child)}</td><td class="small">${lvlWord(x.now)} <span class="mono muted">${pct(x.now)}</span></td>
      <td>${x.types.map((t) => `<span class="chan-type ${t === "hypo" ? "hypo" : ""}">${esc(ND.views.TYPE_LABEL[t])}</span>`).join(" ") || `<span class="muted small">—</span>`}</td></tr>`;
    const strong = SN.strong.map((x) => x.label.toLowerCase());
    const pitch = SN.pitch == null ? "" : `<p class="small">Задание «Слух на высоту звука»: вы различали тоны, отличающиеся на ${String(SN.pitch.toFixed(SN.pitch < 1 ? 2 : 1)).replace(".", ",")}%. ${SN.pitch < 0.6 ? "Это очень тонкий слух. У части аутичных людей различение высоты звука лучше среднего (Bonnel et al., 2003), и это часто идёт рядом с чувствительностью к звукам." : "Это обычный диапазон, особой остроты слуха задание не показало. Чувствительность к звукам в жизни бывает и без неё: «громко и неприятно» и «тонко различаю» — разные вещи."}</p>`;
    return `<section class="block"><h2>Сенсорный паспорт</h2>
      <p class="muted">Ваши ответы о восприятии, разложенные по каналам: что ощущается слишком сильно, что слабо и каких ощущений вы ищете. ${strong.length ? `Сильнее всего: ${esc(strong.join(", "))}.` : "Ни один канал не выделяется."}</p>
      <div class="legend"><span><i class="sw"></i>сейчас</span><span><i class="sw child"></i>в детстве</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Канал</th><th>Выраженность</th><th>Сейчас</th><th>Тип реакции</th></tr></thead><tbody>${SN.rows.map(row).join("")}</tbody></table></div>
      ${pitch}
      <p class="small muted">Зачем: такую таблицу удобно показать близким, на работе или врачу, чтобы договориться о простых изменениях среды (наушники, свет, одежда, место в офисе). Для РАС необычная сенсорная реакция — один из четырёх признаков группы B в DSM-5-TR, причём засчитывается и повышенная, и пониженная чувствительность. При СДВГ необычная сенсорная реакция у взрослых тоже встречается чаще, даже без аутичных черт (Bijlenga et al., 2017), но в критерии СДВГ она не входит. Разбор по каналам и типам реакции — как в Glasgow Sensory Questionnaire (Robertson & Simmons, 2013). Выраженность считается по тем же ответам, что и критерий B4, но в отчёте не суммируется заново: на баллы не влияет.</p></section>`;
  }
  function efBlock(F, E) {
    if (F.rows.length < 3) return "";
    const grp = F.first && (ND.SUPPORT || []).find((g) => g.key === F.first.support && g.when(E, state.R));
    const row = (x) => `<li><div class="row" style="justify-content:space-between"><b>${esc(x.label)}</b><span class="small"><span class="muted">${lvlWord(x.now)}</span> <span class="mono">${pct(x.now)}</span></span></div>
      <div class="meter"><i style="width:${pct(x.now)}%"></i></div><span class="small muted">${esc(x.what)}${x.top.length ? `. Сильнее всего: ${x.top.map((t) => `«${esc(t.replace(/\.$/, ""))}»`).join(", ")}` : ""}</span></li>`;
    return `<section class="block"><h2>Профиль исполнительных функций</h2>
      <p class="muted">Исполнительные функции — это «диспетчер» мозга: планировать, помнить о деле в нужный момент, останавливаться, начинать неинтересное, успокаиваться. Здесь ваши ответы разложены по пяти областям модели Р. Баркли. Это помогает увидеть, где трудность на самом деле: «плохо с вниманием» часто оказывается трудностью с временем или с тем, чтобы начать.</p>
      <ul class="sup">${F.rows.map(row).join("")}</ul>
      ${F.first ? `<div class="flag"><b>С чего начать: ${esc(F.first.label.toLowerCase())}</b><span>Это самая выраженная область, с неё разумно начинать подбирать опоры. ${grp ? `Подходящие методики собраны в блоке «Что может помочь», раздел «${esc(grp.label)}»: ${grp.items.slice(0, 2).map((x) => esc(x.t.charAt(0).toLowerCase() + x.t.slice(1))).join("; ")}.` : ""}</span></div>` : `<p class="small">Ни одна область не выражена.</p>`}
      <p class="small muted">Для СДВГ: Р. Баркли описывает СДВГ прежде всего как трудность исполнительных функций в повседневной жизни, и его шкала BDEFS оценивает их по самоотчёту (Barkley, 2011); короткие тесты улавливают это хуже и слабо связаны с самоотчётом (Toplak, West & Stanovich, 2013). Для РАС: трудности исполнительных функций тоже встречаются, в том числе гибкость и планирование, эффект умеренный (метаанализ Demetriou et al., 2018). Профиль сам по себе РАС и СДВГ не различает. Шкала BDEFS коммерческая и здесь не используется; распределение наших вопросов по областям — наше. На баллы не влияет.</p></section>`;
  }
  function wantBlock(W, E) {
    if (!W.rows.length) return "";
    const lowMood = E.scales.PHQ9 && E.scales.PHQ9.positive;
    const text = W.kind === "want" ? "В основном вам хочется общаться, но это даётся трудно. Значит, трудность не в нежелании, а в том, как устроено общение: правила, темп, усталость, тревога. Это важно для того, что поможет: не «заставить себя хотеть», а сделать общение доступнее (свои люди, общие интересы, понятные правила, время на восстановление)."
      : W.kind === "content" ? "В основном вам и так хорошо: меньше общения — ваш выбор, а не потеря. Это не проблема и не признак болезни сам по себе. Для РАС учитывается трудность, а не количество общения; если меньший интерес к людям вам не мешает, помощь здесь не нужна."
      : "Ответы разные: в одних ситуациях общения хочется, в других нет. Так бывает часто, и это стоит обсудить подробнее: где именно хочется, но не получается.";
    return `<section class="block"><h2>Общение: трудно или не хочется?</h2>
      <p>${esc(text)}</p>
      <div class="tbl-wrap"><table><tbody>${W.rows.map((x) => `<tr><td>${esc(x.t)}<br><span class="small muted">${esc(x.q)}</span></td><td><b>${esc(x.label)}</b></td></tr>`).join("")}</tbody></table></div>
      ${lowMood && W.kind !== "want" ? `<div class="flag"><b>Учтите настроение</b><span>По PHQ-9 у вас от 10 баллов. Потеря интереса к людям может быть признаком подавленности, а не чертой характера. Если раньше общения хотелось больше, расскажите об этом врачу.</span></div>` : ""}
      <p class="small muted">Почему спрашиваем: долго считалось, что аутичным людям общение неинтересно. Сейчас известно, что многие хотят дружбы, но им трудно (Jaswal & Akhtar, 2019; у этой работы есть и критика). Для СДВГ трудность общения чаще связана с импульсивностью и вниманием (перебиваю, теряю нить), а желание общаться обычно есть. Ответы на этот вопрос в баллы и критерии не входят.</p></section>`;
  }
  function compensationBlock(K) {
    if (!K.n && !K.lighter.length) return "";
    const AL = ["совсем нет", "скорее нет", "частично", "в основном да", "да, полностью"];
    const li = (x) => `<li>${esc(x.t)} <span class="small muted">(${esc(x.area)}; в детстве «${AL[x.child] || x.child}», сейчас «${AL[x.now] || x.now}»)</span></li>`;
    const lim = (a) => a.slice(0, 6).map(li).join("") + (a.length > 6 ? `<li class="muted small">и ещё ${a.length - 6}</li>` : "");
    return `<section class="block"><h2>Где вы научились компенсировать</h2>
      <p class="muted">Признаки, которые в детстве были выражены, а сейчас слабее. Это может значить, что вы переросли трудность, нашли обходной путь или просто научились её прятать.</p>
      ${K.learned.length ? `<h3>Сейчас почти не мешает: ${K.learned.length}</h3><ul class="small stack">${lim(K.learned)}</ul>` : ""}
      ${K.effort.length ? `<h3>Слабее, но держится на усилии: ${K.effort.length}</h3><p class="small">Вы ответили, что это не видно со стороны или прячете его с усилием.</p><ul class="small stack">${lim(K.effort)}</ul>` : ""}
      ${K.lighter.length ? `<h3>Просто стало легче: ${K.lighter.length}</h3><ul class="small stack">${lim(K.lighter)}</ul>` : ""}
      ${K.areas.length ? `<p class="small">Больше всего компенсации: ${esc(K.areas.map(([a, n]) => `${a} (${n})`).join(", "))}.</p>` : ""}
      ${K.effort.length && (K.cost.fatigue || K.cost.burnout) ? `<div class="flag"><b>У компенсации есть цена</b><span>Вы также отметили ${[K.cost.fatigue && "сильную усталость после общения", K.cost.burnout && "периоды истощения"].filter(Boolean).join(" и ")}. Стратегии, которые требуют постоянного усилия, со временем могут приводить к выгоранию.</span></div>` : ""}
      <p class="small muted">Для РАС: DSM-5-TR прямо допускает, что признаки «могут маскироваться выученными стратегиями в дальнейшей жизни», поэтому для диагноза важен детский период. Компенсация помогает в работе и отношениях, но связана с усталостью, тревогой и поздним диагнозом (Livingston, Shah & Happé, 2019). Для СДВГ: у взрослых гиперактивность часто уменьшается, а невнимательность остаётся; многие держатся на внешних опорах и дедлайнах (Biederman, Mick & Faraone, 2000: с возрастом симптомы гиперактивности снижаются быстрее, чем невнимательности). Блок показывает изменения в ответах и не меняет баллы.</p></section>`;
  }
  function thousandBlock(E) {
    const T = ND.views.thousand(), A = E.legacy.ASRS;
    const cls = [];
    for (let i = 0; i < T.N; i++) cls.push(i < T.tp ? "tp" : i < T.sick ? "fn" : i < T.sick + T.fp ? "fp" : "tn");
    const g = (c) => `<g class="${c}">${cls.map((k, i) => (k === c ? `<circle cx="${(i % 40) * 10 + 5}" cy="${Math.floor(i / 40) * 10 + 5}" r="3.6"/>` : "")).join("")}</g>`;
    const you = A.partAPositive == null ? "Вы ответили не на все 6 вопросов части A, поэтому ваш результат по ней не посчитан."
      : A.partAPositive ? `Ваш пересчёт части A — ${A.partA} из 6, то есть положительный скрининг. На картинке вы среди ${T.tp + T.fp} закрашенных цветом: большинство из них действительно имеют СДВГ.`
      : `Ваш пересчёт части A — ${A.partA} из 6, ниже порога. На картинке вы среди серых и жёлтых точек: у большинства из них СДВГ нет, но ${T.fn} человек с СДВГ скрининг тоже не заметил.`;
    return `<section class="block"><h2>Что значит положительный скрининг: 1000 человек</h2>
      <p class="muted">Пример на исходном тесте ASRS (часть A, 6 вопросов), а не на ND-Screen: для ND-Screen таких цифр пока нет. Возьмём 1000 случайных взрослых.</p>
      <svg class="icons1000" viewBox="0 0 400 250" role="img" aria-label="1000 точек: ${T.tp} человек с СДВГ и положительным скринингом, ${T.fn} с СДВГ, но отрицательным, ${T.fp} без СДВГ с положительным, остальные без СДВГ">${["tn", "fp", "fn", "tp"].map(g).join("")}</svg>
      <div class="i-legend"><span><i style="background:#d0643c"></i>СДВГ, скрининг положительный: ${T.tp}</span><span><i style="background:#d29a2a"></i>СДВГ, скрининг пропустил: ${T.fn}</span><span><i style="background:var(--accent)"></i>нет СДВГ, но скрининг положительный: ${T.fp}</span><span><i style="background:color-mix(in srgb, var(--muted) 35%, transparent)"></i>нет СДВГ, скрининг отрицательный: ${T.tn}</span></div>
      <p>Из ${T.tp + T.fp} человек с положительным скринингом СДВГ есть у ${T.tp} (примерно ${Math.round(T.ppv * 100)}%). Ещё ${T.fn} из ${T.sick} человек с СДВГ скрининг не заметил. ${esc(you)}</p>
      <p class="small muted">Если вы проходите анкету, потому что подозреваете у себя СДВГ, ваша исходная вероятность выше, чем у случайного человека, и положительный результат значит больше. Поэтому скрининг — повод для очной оценки, а не диагноз в обе стороны. Цифры: ASRS часть A — чувствительность 68,7%, специфичность 99,5% (Kessler et al., 2005); стойкий СДВГ у взрослых — 2,58% (Song et al., 2021). Картинка с точками вместо процентов: Gigerenzer & Hoffrage, 1995.</p></section>`;
  }
  function nextSteps(E) {
    const S = [], asd = E.asd, adhd = E.adhd, SC = E.scales;
    if (E.scales.safety) S.push(["Сначала — безопасность", "Вы отметили мысли о смерти или самоповреждении. Если сейчас тяжело, позвоните 112 или в службу психологической помощи. Это важнее всего остального в отчёте."]);
    if ((SC.PHQ9 && SC.PHQ9.positive) || (SC.GAD7 && SC.GAD7.positive)) S.push(["Обсудите настроение и тревогу", "По PHQ-9 или GAD-7 у вас от 10 баллов. Тревога и подавленность лечатся и сами по себе могут давать трудности со вниманием и общением. Скажите о них врачу в первую очередь."]);
    if (asd.level !== "none") S.push(["Проверка РАС", "Взрослым обычно проводят наблюдение ADOS-2 (модуль 4) и интервью о детстве с родителем или человеком, знавшим вас ребёнком (например, ADI-R). Ищите психиатра или клинического психолога, который работает со взрослыми с РАС."]);
    if (adhd.level !== "none") S.push(["Проверка СДВГ", "Обычно проводят структурированное интервью DIVA-5, лучше вместе с близким человеком. Если сохранились школьные характеристики или дневники, возьмите их: признаки должны быть до 12 лет."]);
    E.differential.filter((d) => d.scale !== "PHQ9" && d.scale !== "GAD7").forEach((d) => S.push([d.label, d.note]));
    if (S.length || asd.level !== "none" || adhd.level !== "none") S.push(["Возьмите с собой отчёт", "Кнопка «Отчёт для специалиста» ниже собирает всё на одну страницу в привычном врачу виде. Его можно распечатать или сохранить в PDF."]);
    if (!S.length) S.push(["Выраженных признаков нет", "По ответам признаков РАС и СДВГ немного. Если трудности в жизни всё же есть, их стоит обсудить со специалистом: анкета охватывает не всё."]);
    S.push(["Пока ждёте приёма", "Посмотрите блок «Что может помочь»: там методики с доказанной пользой, которые не требуют диагноза."]);
    return `<section class="block"><h2>Что дальше</h2><ol class="stack">${S.map(([t, x]) => `<li><b>${esc(t)}.</b> ${esc(x)}</li>`).join("")}</ol></section>`;
  }

  function renderReport() {
    const E = ND.scoring.evaluate(state.R);
    const opened = openItems();
    const done = opened.filter(answered).length;
    const C = E.constructs;
    const asdRows = ["ASD.A1", "ASD.A2", "ASD.A3", "ASD.B1", "ASD.B2", "ASD.B3", "ASD.B4"].map((cid) => {
      const k = C[cid], d = ND.CONSTRUCTS[cid];
      return `<tr><td><b class="mono">${d.dsm}</b> ${d.label}${whyRow(ND.explain.construct(cid, E, state.R))}</td><td>${meter(k.now.s, k.child.s)}</td>
        <td>${stTag(k.now.status)} <span class="small muted mono">${pct(k.now.s)}</span></td>
        <td>${stTag(k.child.status)} <span class="small muted mono">${pct(k.child.s)}</span></td></tr>`;
    }).join("");
    const symRows = Object.entries(ND.ADHD_SYMPTOMS).map(([sid, label]) => {
      const s = E.symptoms[sid];
      return `<tr><td><b class="mono">${sid}</b> ${label}${whyRow(ND.explain.symptom(sid, E, state.R))}</td><td>${meter(s.now.s, s.child.s)}</td><td>${stTag(s.now.status)}</td><td>${stTag(s.child.status)}</td></tr>`;
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

        ${E.scales.safety ? safetyBlock() : ""}

        ${(() => { const O = ND.scoring.overall(E); return `<div class="overall ${O.code}"><span class="eyebrow">Общий вывод</span><h2>${O.title}</h2>${O.adhdType ? `<p><b>${esc(O.adhdType)}</b></p>` : ""}<p>${esc(O.text)}</p></div>`; })()}

        <div class="summary">
          ${verdict("РАС", asd.level, asd.index, [
            `Ядро (A1–A3 и не меньше двух B): ${ST_LABEL[asd.core]}`,
            `Проявления в детстве (C): ${ST_LABEL[asd.C]}`,
            `Влияние на жизнь (D): ${ST_LABEL[asd.D]}`,
            `Камуфляж: ${pct(asd.camo.s)} из 100`,
            asd.indexRaw > asd.index ? `Индекс ограничен 49 (без ограничения ${asd.indexRaw}): не выполнено обязательное условие C или D` : "",
          ], whyVerdict(asd, ND.explain.asdCriteria(E)))}
          ${verdict("СДВГ", adhd.level, adhd.index, [
            `Невнимательность: ${adhd.nA1} из 9 (ещё ${adhd.nA1p - adhd.nA1} вероятно)`,
            `Гиперактивность и импульсивность: ${adhd.nA2} из 9 (ещё ${adhd.nA2p - adhd.nA2} вероятно)`,
            `Симптомы до 12 лет (B): ${ST_LABEL[adhd.B]}; выполнено ${adhd.nChild}, вероятно ещё ${adhd.nChildP - adhd.nChild}`,
            `Несколько сфер (C): ${ST_LABEL[adhd.C]}; нарушения (D): ${ST_LABEL[adhd.D]}`,
            adhd.presentation ? `Тип проявления: ${adhd.presentation}` : "",
            adhd.indexRaw > adhd.index ? `Индекс ограничен 49 (без ограничения ${adhd.indexRaw}): не выполнено обязательное условие B или D` : "",
          ], whyVerdict(adhd, ND.explain.adhdCriteria(E)))}
        </div>

        ${radarBlock(E)}

        ${sensoryBlock(ND.views.sensory(state.R, ND.lab.pitchSummary((state.lab || {}).pitch)))}

        ${efBlock(ND.views.ef(state.R), E)}

        ${wantBlock(ND.views.want(state.R), E)}

        ${compensationBlock(ND.views.compensation(state.R))}

        ${maskMapBlock(ND.insights.maskMap(E, state.R))}

        ${consistencyBlock(E.validity)}

        ${supportBlock(ND.support(E, state.R))}

        ${energyBlock(ND.insights.energy(E))}

        ${strengthsBlock(E.strengths)}

        ${scalesBlock(E.scales)}

        ${traitsBlock(state.R)}

        ${comorbBlock(E)}

        ${historyBlock(ND.insights.history(state.R))}

        ${labBlock()}

        ${spriteBlock()}

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

        ${thousandBlock(E)}

        <section class="block">
          <h2>Влияние на жизнь</h2>
          <div class="tbl-wrap"><table><thead><tr><th>Сфера</th><th>Сейчас</th><th>В детстве</th></tr></thead><tbody>${fRows}</tbody></table></div>
        </section>

        ${notes ? `<section class="block"><h2>Ваши ответы своими словами</h2><ul class="stack">${notes}</ul></section>` : ""}

        ${nextSteps(E)}

        <section class="block"><h2>Пробелы</h2><ul class="stack muted">${gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></section>

        <div class="row no-print">
          ${state.sample ? `<button class="btn primary" data-act="home">Вернуться и начать анкету</button>` : `<button class="btn primary" data-act="resume">Вернуться к вопросам</button>`}
          <button class="btn" data-act="clin">Отчёт для специалиста</button>
          <button class="btn" data-act="lab">Лаборатория</button>
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

  // Шкалы рядом с РАС и СДВГ: баллы по правилам оригиналов. На РАС и СДВГ не влияют.
  function scalesBlock(SC) {
    const keys = ["PHQ9", "GAD7"].filter((k) => SC[k].answered);
    const row = (x) => `<tr><td><b>${x.name}</b> ${esc(x.label.toLowerCase())}</td><td class="mono">${x.score == null ? `— (отвечено ${x.answered} из ${x.n})` : `${x.score} из ${x.max}`}</td><td>${x.band ? `${x.band}${x.positive ? " · <b>от порога 10</b>" : ""}` : "—"}</td><td>${x.fx == null ? "—" : esc(FX_OPTS[x.fx].toLowerCase())}</td></tr>`;
    const mood = !keys.length ? "" : `<section class="block"><h2>Настроение и тревога</h2>
      <div class="tbl-wrap"><table><thead><tr><th>Шкала</th><th>Балл</th><th>Степень</th><th>Затруднения в жизни</th></tr></thead><tbody>${keys.map((k) => row(SC[k])).join("")}</tbody></table></div>
      <p class="small muted">PHQ-9 (Kroenke et al., 2001) и GAD-7 (Spitzer et al., 2006) — проверенные короткие шкалы за последние 2 недели. Степень: 0–4 минимальная, 5–9 лёгкая, 10–14 умеренная, дальше выше. От 10 баллов стоит обсудить результат со специалистом. Это скрининг, а не диагноз. На оценку РАС и СДВГ шкалы не влияют, но тревога и депрессия могут давать похожие трудности со вниманием и общением, поэтому их важно учитывать.</p></section>`;
    return mood + paqBlock(SC.PAQ) + absiBlock(SC.ABSI) + aciBlock(SC.ACI);
  }
  function aciBlock(x) {
    if (!x || !x.answered) return "";
    const f = (v) => v.toFixed(2).replace(".", ","), z = x.score == null ? null : (x.score - x.ref) / x.refSd;
    const where = z == null ? "" : z >= 2 ? "намного выше, чем в среднем у взрослых в этом исследовании (на 2 стандартных отклонения и больше)" : z >= 1 ? "выше, чем в среднем у взрослых в этом исследовании (на 1–2 стандартных отклонения)" : "в пределах обычного для взрослых в этом исследовании";
    return `<section class="block"><h2>Мечтательность и «туман» в голове</h2>
      <p>${x.score == null ? `Отвечено ${x.answered} из ${x.n}, для балла нужно не меньше ${x.n - x.maxMiss}.` : `ACI: средний балл <b>${f(x.score)} из 3</b>. Для сравнения: у взрослых из общей выборки в США в среднем ${f(x.ref)} (стандартное отклонение ${f(x.refSd)}), у вас ${where}.`}</p>
      <p class="small muted">Это 10 вопросов о «вялом когнитивном темпе», который сейчас всё чаще называют синдромом когнитивного отключения: мечтательность, «туман», медленные мысли, «зависания». В метаанализе (Becker et al., 2016, больше 19 тысяч человек) эти черты устойчиво выделялись в отдельную группу, а не в симптомы СДВГ, хотя часто встречаются вместе с невнимательным типом. Шкала: Adult Concentration Inventory (Becker et al., 2018), структура подтверждена у взрослых (Fredrick et al., 2021). Порогов у шкалы нет, диагнозом это состояние не является. Вялый темп связан и с депрессией, поэтому смотрите вместе с PHQ-9. Русской версии нет, перевод наш и неофициальный. На оценку РАС и СДВГ шкала не влияет.</p></section>`;
  }
  // Черты вне DSM: какие отмечены и что о них известно, со значком доказательности из базы знаний
  const EV_LABEL = { strong: "сильные данные", moderate: "умеренные данные", weak: "мало данных", contested: "спорно" };
  function traitsList(R) {
    const out = [];
    for (const [key, T] of Object.entries(ND.TRAITS)) {
      if (T.from) {
        const hit = T.from.some((id) => R[id] && !R[id].na && R[id].now && R[id].now.I >= 3);
        if (hit) out.push({ key, T, lvl: 2, derived: true });
        continue;
      }
      const it = ITEMS.find((x) => x.kind === "trait" && x.tr === key), r = it && R[it.id];
      if (r && !r.na && r.now && r.now.I >= 1) out.push({ key, T, lvl: r.now.I });
    }
    return out;
  }
  function traitsBlock(R) {
    const L = traitsList(R), dep = R["TR-6"], depI = dep && dep.now && dep.now.I != null && ND.eligible(ITEMS.find((x) => x.id === "TR-6"), R) ? Math.min(3, dep.now.I) : null;
    const asked = ITEMS.some((x) => x.kind === "trait" && R[x.id] && R[x.id].now && R[x.id].now.I != null);
    if (!asked && !L.length) return "";
    const depTxt = depI == null || depI === 3 ? "" : depI === 0 ? "Вы описали это как «хочется, но не получается начать»: это больше похоже на инерцию, чем на потерю желания при депрессии. Но при сниженном настроении стоит обсудить и то, и другое со специалистом." : depI === 1 ? "Вы описали это как «ничего не хочется»: так чаще проявляется сниженное настроение, а не инерция. По PHQ-9 оно сейчас заметно, это стоит обсудить со специалистом." : "Бывает и так, и так: возможно, есть и инерция, и сниженное настроение. Стоит обсудить со специалистом.";
    return `<section class="block"><h2>Черты, о которых часто говорят</h2>
      <p class="muted">Этих черт нет в критериях DSM-5-TR, но многие узнают их в себе по описаниям в сети. Рядом с каждой указано, насколько она изучена. В баллы и вывод они не входят.</p>
      ${L.length ? `<ul class="sup">${L.map(({ key, T, lvl, derived }) => `<li><div class="row" style="justify-content:space-between"><b>${esc(T.label)}</b><span class="ev-tag ev-${T.ev}">${EV_LABEL[T.ev]}</span></div>
        <span class="small">${derived ? "" : lvl >= 2 ? "Вы отметили: «да, это про меня». " : "Вы отметили: «отчасти». "}${esc(T.what)}</span>
        <span class="small muted">${esc(T.known)}</span>
        <span class="small"><b>Что может помочь:</b> ${esc(T.help)} <a href="https://neurodivergentmap.vercel.app/#${T.map}" target="_blank" rel="noopener">Подробнее на карте</a></span>
        ${key === "inertia" && depTxt ? `<span class="small"><b>Инерция или настроение?</b> ${depTxt}</span>` : ""}</li>`).join("")}</ul>` : `<p class="small muted">Ни одну из этих черт вы у себя не отметили.</p>`}</section>`;
  }
  const subRows = (x, fmt) => Object.values(x.subs).map((s) => `<tr><td>${esc(s.label)}</td><td class="mono">${s.score == null ? "—" : fmt(s)}</td>${s.bands ? `<td>${s.band || "—"}</td>` : ""}</tr>`).join("");
  function paqBlock(x) {
    if (!x || !x.answered) return "";
    return `<section class="block"><h2>Восприятие своих эмоций (алекситимия)</h2>
      <p>${x.score == null ? `Отвечено ${x.answered} из ${x.n}, для балла нужно не меньше ${x.n - 1}.` : `PAQ: <b>${x.score} из ${x.max}</b>, ${x.band} алекситимия.`}</p>
      <div class="tbl-wrap"><table><thead><tr><th>Сторона</th><th>Балл</th><th>Уровень</th></tr></thead><tbody>${subRows(x, (s) => `${s.score} из ${s.max}`)}</tbody></table></div>
      <p class="small muted">Алекситимия — трудность с распознаванием и описанием своих чувств. Это не диагноз и не признак РАС, но она встречается примерно у половины аутичных взрослых и примерно у 5% остальных (Kinnaird et al., 2019) и сама по себе затрудняет понимание эмоций, поэтому её важно учитывать при чтении результата по общению. Шкала PAQ (Preece et al., 2018), русская версия: Ларионов и соавт., 2023. Уровни — по нормам руководства PAQ для взрослых (высокая от 113), в русской выборке средний балл ниже (около 65). На оценку РАС и СДВГ шкала не влияет.</p></section>`;
  }
  function absiBlock(x) {
    if (!x || x.gate == null) return "";
    if (x.gate === 1) return `<section class="block"><h2>Аутистическое выгорание</h2><p class="small muted">Вы отметили, что такого состояния не было, поэтому вопросы о нём пропущены.</p></section>`;
    if (!x.answered) return "";
    const f = (v) => String(v).replace(".", ",");
    return `<section class="block"><h2>Аутистическое выгорание</h2>
      <p>${x.score == null ? `Отвечено ${x.answered} из ${x.n}, для балла нужно не меньше ${x.n - x.maxMiss}.` : `ABSI: средний балл <b>${f(x.score)} из 7</b> (выше — тяжелее). Для сравнения: у аутичных участников исследования во время выгорания в среднем около ${f(x.ref)}.`}</p>
      <div class="tbl-wrap"><table><thead><tr><th>Сторона выгорания</th><th>Средний балл</th></tr></thead><tbody>${subRows(x, (s) => `${f(s.score)} из 7`)}</tbody></table></div>
      <p class="small muted">Вопросы о последнем или нынешнем периоде выгорания из шкалы ABSI (Arnold et al., 2023). Порогов у шкалы нет, а стороны выгорания авторы советуют смотреть по отдельности. Надёжно отличить выгорание от депрессии пока не может ни одна шкала: в исследовании они заметно связаны, поэтому смотрите на результат вместе с PHQ-9. Русской версии нет, перевод наш и неофициальный. На оценку РАС и СДВГ шкала не влияет.</p></section>`;
  }

  // Карточка сильных сторон картинкой: 3–5 самых выраженных, без диагнозов и баллов. Рисуется в браузере, никуда не отправляется.
  const CARD_LINES = {
    deep: "Погружаюсь в интересное глубже большинства", detail: "Замечаю то, что ускользает от других",
    system: "Быстро понимаю, как всё устроено", memory: "Надолго запоминаю факты и подробности",
    honesty: "Говорю прямо и честно", values: "Держу слово и остро чувствую несправедливость",
    creative: "Нахожу нестандартные решения", energy: "Собираюсь и действую, когда всё горит",
    independent: "Думаю своей головой, а не как принято",
  };
  let cardImg = null;
  const cardPicks = (list) => list.filter((x) => x.s >= ND.PARAMS.thetaLo).sort((a, b) => b.s - a.s).slice(0, 5);
  function drawCard(list) {
    const W = 1080, H = 1350, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d"), F = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#1f3a5f"); bg.addColorStop(1, "#3d6b6b");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,0.7)"; g.font = `600 34px ${F}`; g.fillText("МОИ СИЛЬНЫЕ СТОРОНЫ", 96, 150);
    const picks = cardPicks(list);
    // раскладка: если не помещается, шрифт уменьшается
    const lines = (text, maxW) => { const out = []; let line = ""; for (const w of text.split(" ")) { const t = line ? line + " " + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); return out; };
    let k = 1, blocks;
    for (; k > 0.6; k -= 0.05) {
      blocks = picks.map((x) => { g.font = `700 ${50 * k}px ${F}`; const a = lines(x.label, W - 290); g.font = `400 ${36 * k}px ${F}`; const b = lines(CARD_LINES[x.key] || "", W - 290); return { a, b }; });
      const h = blocks.reduce((t, bl) => t + bl.a.length * 58 * k + bl.b.length * 44 * k + 56 * k, 0);
      if (h <= H - 260 - 180) break;
    }
    let y = 260;
    picks.forEach((x, i) => {
      const bl = blocks[i];
      y += 50 * k;
      g.fillStyle = "#f2c66d"; g.beginPath(); g.arc(126, y - 16 * k, 30 * k, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#1f3a5f"; g.font = `700 ${34 * k}px ${F}`; g.textAlign = "center"; g.fillText(String(i + 1), 126, y - 4 * k); g.textAlign = "left";
      g.fillStyle = "#ffffff"; g.font = `700 ${50 * k}px ${F}`;
      bl.a.forEach((l) => { g.fillText(l, 190, y); y += 58 * k; });
      g.fillStyle = "rgba(255,255,255,0.82)"; g.font = `400 ${36 * k}px ${F}`;
      y -= 6 * k;
      bl.b.forEach((l) => { g.fillText(l, 190, y); y += 44 * k; });
      y += 6 * k;
    });
    g.fillStyle = "rgba(255,255,255,0.6)"; g.font = `400 28px ${F}`;
    g.fillText("По ответам анкеты ND-Screen · nd-screen.vercel.app", 96, H - 90);
    return c.toDataURL("image/png");
  }
  function cardBlock(list) {
    if (cardPicks(list).length < 1) return "";
    if (!cardImg) return `<div class="row no-print"><button class="btn" data-act="card">Сделать карточку картинкой</button><span class="small muted">До 5 самых выраженных сторон, без диагнозов и баллов, чтобы сохранить себе или поделиться.</span></div>`;
    return `<div class="share-card no-print"><img src="${cardImg}" alt="Карточка: мои сильные стороны">
      <div class="row"><a class="btn" href="${cardImg}" download="moi-silnye-storony.png">Скачать картинку</a>
      ${navigator.canShare ? `<button class="btn ghost" data-act="card-share">Поделиться</button>` : ""}
      <button class="btn ghost" data-act="card-close">Скрыть</button></div>
      <p class="small muted">Если кнопка «Скачать» не сработала, нажмите на картинку и удерживайте, чтобы сохранить её.</p></div>`;
  }

  // Сопутствующие состояния: только если профиль не нейротипичный. Ни на что не влияют.
  const CONF = { strong: "надёжные данные", moderate: "данные средней надёжности", weak: "данных мало" };
  function comorbBlock(E) {
    const yes = ITEMS.filter((it) => it.kind === "comorb" && state.R[it.id] && !state.R[it.id].na && state.R[it.id].now && state.R[it.id].now.I === 0);
    if (!yes.length) return "";
    if (ND.scoring.overall(E).code === "nt") return `<section class="block"><h2>Сопутствующие состояния</h2><p class="small muted">Вы отметили ${yes.length} из ${ITEMS.filter((it) => it.kind === "comorb").length} состояний. Профиль по ответам нейротипичный, поэтому сопоставлять их с РАС и СДВГ нет смысла.</p></section>`;
    return `<section class="block"><h2>Сопутствующие состояния</h2>
      <p class="muted">Вы отметили состояния, которые при РАС или СДВГ встречаются чаще, чем в среднем. Они не доказывают ни РАС, ни СДВГ и на результат не влияют, но вместе с признаками дополняют картину, и о них стоит сказать врачу.</p>
      <ul class="sup">${yes.map((it) => `<li><b>${esc(it.t.replace(/\.$/, ""))}</b>${it.co.map((c) => `<span><b>${esc(c.g)}.</b> ${esc(c.t)}</span>`).join("")}<span class="small muted">${CONF[it.conf]}</span></li>`).join("")}</ul>
      <p class="small muted">Цифры взяты из метаанализов и крупных исследований, часть из них — у детей или в клинических выборках. «Чаще в 2 раза» значит, что состояние встречается чаще, а не что оно есть у большинства.</p></section>`;
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
      ${shown.length ? `${cardBlock(list)}<div class="strengths">${shown.map(card).join("")}</div>` : `<p class="muted">По ответам ни одно из направлений не выражено.</p>`}
      ${rest.length ? `<p class="small muted">Не выражены по ответам: ${rest.map((x) => `${esc(x.label.toLowerCase())} (${pct(x.s)})`).join(", ")}.</p>` : ""}
      <p class="small muted">Направления взяты из тем Aspie-quiz о талантах и из исследований сильных сторон взрослых с РАС и СДВГ. Шкала не валидирована, поэтому на индексы, критерии и общий вывод блок не влияет.</p></section>`;
  }

  function renderClin() {
    const C = ND.clinician.build(state.R, labState());
    app.innerHTML = `<div class="wrap wide clin">
      <div class="row no-print"><button class="btn" data-act="report">Назад к отчёту</button>
        <button class="btn" data-act="clin-copy">Скопировать текстом</button>
        ${embedded ? "" : `<button class="btn" data-act="print">Печать или PDF</button>`}</div>
      ${C.html}
      <div id="export-box"></div></div>`;
  }

  function verdict(name, level, index, lines, why) {
    const [title, desc] = LEVEL[level];
    return `<div class="verdict"><div class="row" style="justify-content:space-between"><h2>${name}</h2><span class="pill ${level}">${title}</span></div>
      <div class="index"><span class="index-num mono">${index}</span><span class="small muted">индекс из 100<br>уровень: ${ND.indexBand(index)}</span></div>
      <div class="meter"><i style="width:${index}%"></i></div>
      <p>${desc}</p><ul class="small muted stack" style="margin:0;padding-left:1.1em;gap:4px">${lines.filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${why || ""}</div>`;
  }

  // «Почему такой результат»: критерии, уровень и индекс (src/explain.js)
  function whyVerdict(x, crits) {
    const X = ND.explain;
    return `<details class="why"><summary>Почему такой результат</summary>
      <p class="small"><b>Уровень.</b> ${esc(X.level(x.level, crits))}</p>
      <ul class="why-list small">${crits.map(([n, st, t]) => `<li><span class="st ${st}">${ST_LABEL[st]}</span> <b>${esc(n)}.</b> ${esc(t)}</li>`).join("")}</ul>
      <p class="small"><b>Индекс ${x.index}</b> сложился так:</p>
      <ul class="why-list small">${X.index(x).map((l) => `<li>${esc(l)}</li>`).join("")}</ul></details>`;
  }
  function whyRow(list) {
    return `<details class="why"><summary>почему</summary>${list.map((w) => `<p class="small"><b>${w.label[0].toUpperCase() + w.label.slice(1)}.</b> ${esc(w.text)}${w.top.length && w.top[0].s >= 40 ? ` Сильнее всего повлияли: ${w.top.filter((t) => t.s >= 40).map((t) => `«${esc(t.t.replace(/\.$/, ""))}» (${t.s})`).join("; ")}.` : ""}</p>`).join("")}</details>`;
  }

  function consistencyBlock(V) {
    const hard = V.some((f) => f.severity === "hard");
    const head = !V.length
      ? `<div class="consist ok"><b>Ответы согласованы</b><span>Противоречий не найдено. Проверены пары вопросов с противоположным смыслом, ответы внутри каждого вопроса и связь отдельных вопросов с итоговыми.</span></div>`
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
      `Общий вывод: ${ND.scoring.overall(E).title}. ${ND.scoring.overall(E).adhdType ? ND.scoring.overall(E).adhdType + " " : ""}${ND.scoring.overall(E).text}`,
      `РАС: ${L(E.asd.level)}, индекс ${E.asd.index}/100. Ядро ${ST_LABEL[E.asd.core]}, детство ${ST_LABEL[E.asd.C]}, нарушения ${ST_LABEL[E.asd.D]}, камуфляж ${pct(E.asd.camo.s)}/100.`,
      ...["ASD.A1", "ASD.A2", "ASD.A3", "ASD.B1", "ASD.B2", "ASD.B3", "ASD.B4"].map((c) =>
        `  ${ND.CONSTRUCTS[c].dsm} ${ND.CONSTRUCTS[c].label}: сейчас ${pct(E.constructs[c].now.s)} (${ST_LABEL[E.constructs[c].now.status]}), детство ${pct(E.constructs[c].child.s)}`),
      `СДВГ: ${L(E.adhd.level)}, индекс ${E.adhd.index}/100. A1 ${E.adhd.nA1}/9, A2 ${E.adhd.nA2}/9, до 12 лет ${E.adhd.nChild} симптомов${E.adhd.presentation ? ", " + E.adhd.presentation : ""}.`,
      legacyText(E.legacy),
      ...(E.strengths.some((x) => x.s >= ND.PARAMS.thetaLo) ? ["Сильные стороны (не входят в индексы):", ...E.strengths.filter((x) => x.s >= ND.PARAMS.thetaLo).map((x) => `  ${x.label}: сейчас ${pct(x.s)}${x.child != null ? `, в детстве ${pct(x.child)}` : ""}`)] : []),
      ...Object.keys(ND.SCALES).map((k) => E.scales[k]).filter((x) => x.score != null).map((x) => ND.clinician.scaleLine(x)),
      ...E.differential.map((d) => `Флаг: ${d.label}`),
      ...(() => { const H = ND.insights.history(state.R); return H.rows.length ? ["Раннее развитие и семья (со слов): " + H.rows.map((x) => `${x.t.toLowerCase()}: ${x.answer}`).join("; ")] : []; })(),
      ...(() => { const y = ITEMS.filter((it) => it.kind === "comorb" && state.R[it.id] && state.R[it.id].now && state.R[it.id].now.I === 0); return y.length && ND.scoring.overall(E).code !== "nt" ? [`Сопутствующие состояния: ${y.map((it) => it.t.replace(/\.$/, "")).join("; ")}`] : []; })(),
      ...(() => { const SN = ND.views.sensory(state.R), F = ND.views.ef(state.R), K = ND.views.compensation(state.R), W = ND.views.want(state.R), o = [];
        if (SN.strong.length) o.push("Сенсорика, сильнее всего: " + SN.strong.map((x) => `${x.label.toLowerCase()} ${pct(x.now)}`).join(", "));
        if (F.first) o.push(`Исполнительные функции, самая выраженная область: ${F.first.label.toLowerCase()} ${pct(F.first.now)}`);
        if (K.n) o.push(`Признаки детства, ослабевшие сейчас: компенсировано ${K.learned.length}, держится на усилии ${K.effort.length}`);
        if (W.kind) o.push(`Общение: ${W.kind === "want" ? "хочется, но трудно" : W.kind === "content" ? "в основном и так хорошо" : "по-разному"}`);
        const LW = labWD(); const vs = Object.entries(LW.verdicts).filter(([, v]) => v && v.tone !== "na");
        if (vs.length) o.push("Лаборатория (не входит в баллы): " + vs.map(([k, v]) => `${TASK_TITLE(k)} — ${v.title.toLowerCase()}`).join("; "));
        return o; })(),
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
    const it = state.view === "practice" ? PRACTICE : ITEMS[state.idx];
    const r = state.view === "q" ? resp(it.id) : state.view === "practice" ? pr() : null;
    switch (act) {
      case "start":
        if (state.sample) { state = load() || fresh(); state.seen = state.seen || {}; state.breaks = state.breaks || []; }
        state.sample = false;
        // при первом запуске: пример вопроса, затем «машина времени»
        if (!openItems().some(answered) && !state.seen.practice) { state.view = "practice"; save(); render(); window.scrollTo(0, 0); return; }
        if (!openItems().some(answered) && !state.seen.recall) { state.view = "recall"; save(); render(); window.scrollTo(0, 0); return; }
        state.view = "q";
        { const first = ITEMS.findIndex((x) => open(x) && !answered(x)); state.idx = first === -1 ? 0 : first; }
        shownAt = Date.now(); save(); render(); return;
      case "resume": state.view = "q"; if (!open(ITEMS[state.idx])) state.idx = Math.max(0, nextOpen(state.idx, -1)); shownAt = Date.now(); save(); render(); return;
      case "sample": { const L = ND.sampleLab(), look = state.look, anim = state.anim; state = { R: ND.sampleResponses(), idx: 0, view: "report", sample: true, seen: {}, breaks: [], probe: { seed: 1, list: L.probes }, lab: { dd: L.dd, rt: L.rt, tp: L.tp, load: L.load, navon: L.navon, span: L.span, tap: L.tap, pitch: L.pitch, trace: L.trace }, look, anim }; render(); window.scrollTo(0, 0); return; }
      case "practice": if (state.sample) state = load() || fresh(); state.view = "practice"; state.seen = state.seen || {}; state.breaks = state.breaks || []; save(); render(); window.scrollTo(0, 0); return;
      case "practice-skip": case "practice-done": {
        state.seen.practice = true; delete state.prR;
        const first = !openItems().some(answered);
        state.view = first && !state.seen.recall ? "recall" : first ? "q" : "intro";
        if (state.view === "q") { const f = ITEMS.findIndex((x) => open(x) && !answered(x)); state.idx = f === -1 ? 0 : f; shownAt = Date.now(); }
        save(); render(); window.scrollTo(0, 0); return;
      }
      case "recall-done": {
        state.seen.recall = true; state.view = "q";
        const f = ITEMS.findIndex((x) => open(x) && !answered(x)); state.idx = f === -1 ? 0 : f;
        shownAt = Date.now(); save(); render(); window.scrollTo(0, 0); return;
      }
      case "brk-go": state.view = "q"; shownAt = Date.now(); save(); render(); window.scrollTo(0, 0); return;
      case "brk-pause": state.view = "intro"; save(); render(); window.scrollTo(0, 0); toast("Ответы сохранены. Возвращайтесь, когда будет удобно"); return;
      case "hist": {
        const v = +b.dataset.v;
        if (!it.multi) { r.h = r.h === v ? null : v; break; }
        let h = Array.isArray(r.h) ? r.h.slice() : [];
        const only = it.only || [];
        if (h.includes(v)) h = h.filter((x) => x !== v);
        else h = only.includes(v) ? [v] : h.filter((x) => !only.includes(x)).concat(v);
        r.h = h.sort((a, b) => a - b); break;
      }
      case "look": state.look = b.dataset.v; savePref(); break;
      case "anim": state.anim = state.anim === false; savePref(); break;
      case "music": state.music = !state.music; if (ND.music) ND.music.setVolume(state.vol == null ? 0.5 : state.vol); savePref(); break;
      case "map": if (state.sample) state = restore(); state.view = "map"; save(); render(); window.scrollTo(0, 0); return;
      case "map-go": {
        if (state.sample) return;
        const xs = ITEMS.map((x, i) => [x, i]).filter(([x]) => x.sec === b.dataset.sec && open(x));
        const f = xs.find(([x]) => !answered(x)) || xs[0];
        if (!f) return;
        state.view = "q"; state.idx = f[1]; shownAt = Date.now(); save(); render(); window.scrollTo(0, 0); return;
      }
      case "probe-a": state.probeCur = { a: b.dataset.v }; render(); return;
      case "probe-how": state.probeCur = { ...(state.probeCur || {}), how: b.dataset.v }; render(); return;
      case "probe-done": finishProbe(state.probeCur || { a: "skip" }); return;
      case "probe-skip": finishProbe({ a: "skip" }); return;
      case "probe-off": state.probesOff = true; finishProbe({ a: "skip" }); toast("Больше не спросим"); return;
      case "lab": state.labBack = state.view === "lab" ? state.labBack : state.view; state.view = "lab"; state.labTask = null; if (!state.sample) save(); render(); window.scrollTo(0, 0); return;
      case "lab-start": (state.lab = state.lab || { dd: {} }).started = true; save(); render(); return;
      case "lab-c": {
        if (state.sample) return;
        const L = state.lab || (state.lab = { dd: {} }), t = ND.lab.nextTrial(L.dd);
        if (!t) return;
        (L.dd[t.delay.key] = L.dd[t.delay.key] || []).push(b.dataset.v === "now" ? "now" : "later");
        save(); render(); return;
      }
      case "lab-reset": if (state.sample) return; state.lab = { ...(state.lab || {}), dd: {}, started: true }; save(); render(); return;
      case "lab-home": runClear(); RUN = null; state.labTask = null; save(); render(); window.scrollTo(0, 0); return;
      case "lab-open": state.labTask = b.dataset.t; save(); render(); window.scrollTo(0, 0); return;
      case "lab-run": if (state.sample || !TASKS[b.dataset.t]) return; state.labTask = b.dataset.t; runStart(b.dataset.t); window.scrollTo(0, 0); return;
      case "lab-stop": runClear(); RUN = null; render(); window.scrollTo(0, 0); return;
      case "lab-back": runClear(); RUN = null; state.labTask = null; state.view = state.labBack && state.labBack !== "lab" ? state.labBack : "report"; save(); render(); window.scrollTo(0, 0); return;
      case "sprite": state.spriteBack = state.view === "sprite" ? state.spriteBack : state.view; state.view = "sprite"; if (!state.sample) save(); render(); window.scrollTo(0, 0); return;
      case "sp": {
        const k = b.dataset.k, L = (state.sprite = { ...ND.sprite.DEFAULT, ...(state.sprite || {}) });
        if (k === "acc") { const a = new Set(spriteLook().acc); a.has(b.dataset.v) ? a.delete(b.dataset.v) : a.add(b.dataset.v); L.acc = [...a]; }
        else L[k] = k === "style" ? b.dataset.v : +b.dataset.v;
        spriteCache = {}; break;
      }
      case "sp-auto": if (state.sprite) state.sprite.acc = null; spriteCache = {}; break;
      case "sp-dl": { const a = document.createElement("a"); a.href = spritePNG(); a.download = "moi-personazh.png"; a.click(); return; }
      case "sp-done": state.view = state.spriteBack && state.spriteBack !== "sprite" ? state.spriteBack : "report"; save(); render(); window.scrollTo(0, 0); return;
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
      case "ctx": { const c = r.ctx || (r.ctx = []); const i = c.indexOf(b.dataset.v); i >= 0 ? c.splice(i, 1) : c.push(b.dataset.v); delete r.ctxUnk; r._open = true; break; }
      case "mask": r.mask = +b.dataset.v; delete r.maskUnk; r._open = true; break;
      case "harm": r.harm = +b.dataset.v; delete r.harmUnk; r._open = true; break;
      case "want": r.want = +b.dataset.v; delete r.wantUnk; r._open = true; break;
      // «Не знаю» в дополнительном поле: поле считается без ответа и в баллы не идёт
      case "unk": { const f = b.dataset.v, k = f + "Unk"; r[k] = !r[k]; if (r[k]) delete r[f]; r._open = true; break; }
      case "na": r.na = !r.na; break;
      case "prev": go(nextOpen(state.idx, -1)); return;
      case "next": {
        const j = nextOpen(state.idx, 1);
        if (j === -1) { go(-1); state.view = "report"; save(); render(); window.scrollTo(0, 0); return; }
        // переход в новый раздел: экран-остановка (один раз на раздел)
        if (ITEMS[j].sec !== it.sec && !state.breaks.includes(it.sec)) { state.breaks.push(it.sec); go(j); state.view = "brk"; save(); render(); return; }
        // Н9: проба «где были мысли» внутри раздела, не на границе
        const due = probeDue(it, j);
        if (due) { const P = state.probe; while (P.list.length < due - 1) P.list.push({ a: "missed" }); go(j); state.view = "probe"; save(); render(); window.scrollTo(0, 0); return; }
        go(j); return;
      }
      case "copy-summary": {
        const txt = summaryText();
        navigator.clipboard.writeText(txt).then(() => toast("Сводка скопирована"), () => showBox(txt));
        return;
      }
      case "export": {
        const data = JSON.stringify({ version: "0.4", exported: new Date().toISOString(), responses: state.R, result: ND.scoring.evaluate(state.R),
          traits: traitsList(state.R).map((x) => ({ key: x.key, label: x.T.label, level: x.lvl, evidence: x.T.ev, fromItems: !!x.derived })),
          comorbid: ITEMS.filter((it) => it.kind === "comorb" && state.R[it.id] && state.R[it.id].now && state.R[it.id].now.I != null).map((it) => ({ id: it.id, t: it.t, yes: state.R[it.id].now.I === 0, unknown: state.R[it.id].now.I === 2 })),
          lab: { note: "экспериментально, в баллы и критерии не входит", probes: labState().probes || [], probeSummary: ND.lab.probeSummary(labState().probes), discount: ND.lab.discount(labState().dd || {}),
            reactionTime: { raw: labState().rt || [], summary: ND.lab.rtSummary(labState().rt) },
            timeProduction: { raw: labState().tp || [], countedInHead: !!labState().tpCounted, summary: ND.lab.tpSummary(labState().tp) },
            perceptualLoad: { raw: labState().load || [], summary: ND.lab.loadSummary(labState().load) },
            navon: { raw: labState().navon || [], summary: ND.lab.navonSummary(labState().navon) },
            digitSpan: { raw: labState().span || [], summary: ND.lab.spanSummary(labState().span) },
            tapping: { raw: labState().tap || null, summary: ND.lab.tapSummary(labState().tap) },
            pitch: { raw: labState().pitch || [], summary: ND.lab.pitchSummary(labState().pitch) },
            tracing: { raw: labState().trace || null, summary: ND.lab.traceSummary(labState().trace) },
            device: labState().dev || {}, wordsVsDeeds: labWD().rows },
          views: { note: "в баллы и критерии не входит", sensory: ND.views.sensory(state.R, sumOf("pitch")), executive: ND.views.ef(state.R), compensation: ND.views.compensation(state.R), socialWant: ND.views.want(state.R) } }, null, 2);
        if (embedded) { showBox(data); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
        a.download = "nd-screen-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
        return;
      }
      case "print": window.print(); return;
      case "card": cardImg = drawCard(ND.scoring.evaluate(state.R).strengths); render(); return;
      case "card-close": cardImg = null; render(); return;
      case "card-share": {
        fetch(cardImg).then((x) => x.blob()).then((bl) => {
          const f = new File([bl], "moi-silnye-storony.png", { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: "Мои сильные стороны" }).catch(() => {});
        });
        return;
      }
      case "clin": state.view = "clin"; save(); render(); window.scrollTo(0, 0); return;
      case "clin-copy": {
        const txt = ND.clinician.build(state.R, labState()).text;
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
  });
  app.addEventListener("input", (e) => {
    if (e.target.dataset.act === "vol") { state.vol = +e.target.value / 100; if (ND.music) ND.music.setVolume(state.vol); save(); return; }
    if (e.target.dataset.act === "text") {
      if (state.view === "practice") { pr()[e.target.dataset.p].text = e.target.value; return; }
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
