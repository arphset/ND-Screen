// Проверки движка подсчёта ND-Screen. Запуск: node tests/scoring.test.js
const fs = require("fs");
const path = require("path");
global.window = global;
for (const f of ["items.js", "hints.js", "scoring.js", "sample.js", "clinician.js", "support.js", "explain.js", "insights.js", "lab.js", "sprite.js", "music.js"]) eval(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"));

let failed = 0, passed = 0;
function check(name, cond, info) {
  if (cond) passed++;
  else { failed++; console.log("FAIL:", name, info !== undefined ? JSON.stringify(info) : ""); }
}
const ev = (R) => ND.scoring.evaluate(R);
const ITEMS = ND.ITEMS;
const FREQ = ["rare", "some", "often", "always"];

// ── 1. Структура банка ──
const ids = ITEMS.map((x) => x.id);
check("уникальные id", new Set(ids).size === ids.length);
for (const it of ITEMS) {
  if (it.rev) { check(`обратный ${it.id} ссылается на существующий пункт`, ids.includes(it.pair)); continue; }
  if (it.kind === "func") { check(`${it.id}: сфера жизни`, !!ND.LIFE_SPHERES[it.f]); continue; }
  if (it.kind === "diff") { check(`${it.id}: флаг`, !!ND.DIFF_LABELS[it.d]); continue; }
  if (it.kind === "scale") { check(`${it.id}: шкала`, !!ND.SCALES[it.scale] && !it.c && !it.s && !it.src); continue; }
  if (it.kind === "comorb") { check(`${it.id}: сопутствующее состояние с данными и источником`, !it.c && !it.s && !it.src && it.co.length > 0 && it.co.every((c) => /\(.*\d{4}/.test(c.t)) && ["strong", "moderate", "weak"].includes(it.conf)); continue; }
  if (it.kind === "hist") { check(`${it.id}: вопрос о раннем развитии без связи с подсчётом`, !it.c && !it.s && !it.src && it.opts.length >= 2 && (it.flags || []).every((f) => f.on.every((i) => i < it.opts.length) && /\d{4}|DSM/.test(f.note))); continue; }
  if (it.kind === "strength") { check(`${it.id}: домен сильной стороны`, !!ND.STRENGTHS[it.st] && !it.c && !it.s && !it.src); continue; }
  check(`${it.id} входит в подсчёт (конструкт или симптом)`, (it.c && ND.CONSTRUCTS[it.c]) || (it.s && ND.ADHD_SYMPTOMS[it.s]), it);
  if (it.fu) check(`${it.id}: у уточняющего есть основной вопрос в группе`, ITEMS.some((x) => !x.fu && !x.rev && ND.groupOf(x) === ND.groupOf(it)));
  for (const t of (it.src || "").split(" ").filter(Boolean)) {
    const [test, sub] = t.split(".");
    check(`${it.id}: подшкала ${t} существует`, ND.LEGACY[test] && ND.LEGACY[test].sub[sub]);
  }
}
for (const sid of Object.keys(ND.ADHD_SYMPTOMS)) check(`симптом ${sid} имеет основной вопрос`, ITEMS.some((x) => x.s === sid && !x.fu));
for (const cid of Object.keys(ND.CONSTRUCTS)) check(`конструкт ${cid} имеет основной вопрос`, ITEMS.some((x) => x.c === cid && !x.fu && !x.rev));
for (const [test, d] of Object.entries(ND.LEGACY)) for (const sub of Object.keys(d.sub))
  check(`подшкала ${test}.${sub} покрыта вопросами`, ITEMS.some((x) => (x.src || "").split(" ").includes(`${test}.${sub}`)));

// ── 2. Генерация профилей ──
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
function answer(it, lvl) {
  if (it.kind === "func") return { now: { D: Math.min(3, lvl) }, child: { D: Math.min(3, lvl) }, rt: 5000 };
  const p = () => { const I = Math.max(0, Math.min(4, lvl + pick([-1, 0, 0, 1]))); return I >= 2 ? { I, F: pick(FREQ) } : { I }; };
  return { now: p(), child: rnd() < 0.1 ? { unknown: true } : p(), mask: pick([0, 0, 1, 2]), harm: pick([0, 1, 2, 3]), ctx: [pick(["home", "work", "friends"])], rt: 5000 };
}
function profile(lvlFn) { const R = {}; for (const it of ITEMS) R[it.id] = answer(it, lvlFn(it)); return R; }
const uniform = (l) => () => l;

// ── 3. Границы значений на случайных профилях ──
const okSt = new Set(Object.values(ND.ST));
const okLevel = new Set(["high", "unreliable", "partial", "subclinical", "none"]);
for (let k = 0; k < 400; k++) {
  const base = Math.floor(rnd() * 5);
  const E = ev(profile(() => Math.max(0, Math.min(4, base + pick([-1, 0, 1])))));
  check("индекс РАС 0–100", E.asd.index >= 0 && E.asd.index <= 100, E.asd.index);
  check("индекс СДВГ 0–100", E.adhd.index >= 0 && E.adhd.index <= 100, E.adhd.index);
  check("уровни корректны", okLevel.has(E.asd.level) && okLevel.has(E.adhd.level));
  for (const c of Object.values(E.constructs)) for (const x of [c.now, c.child]) {
    check("балл конструкта 0–1", x.s >= 0 && x.s <= 1 && x.lo <= x.s + 1e-9 && x.hi >= x.s - 1e-9, x);
    check("статус конструкта", okSt.has(x.status));
  }
  const L = E.legacy;
  if (L.RAADS.total != null) check("RAADS-R 0–240", L.RAADS.total >= 0 && L.RAADS.total <= 240, L.RAADS.total);
  if (L.AQ.total != null) check("AQ 0–50", L.AQ.total >= 0 && L.AQ.total <= 50, L.AQ.total);
  if (L.CATQ.total != null) check("CAT-Q 25–175", L.CATQ.total >= 25 - 1e-9 && L.CATQ.total <= 175 + 1e-9, L.CATQ.total);
  if (L.RBQ.mean != null) check("RBQ-2A 1–3", L.RBQ.mean >= 1 && L.RBQ.mean <= 3, L.RBQ.mean);
  check("ASRS 0–36", L.ASRS.inatt >= 0 && L.ASRS.inatt <= 36 && L.ASRS.hyper >= 0 && L.ASRS.hyper <= 36);
  check("ASRS часть A 0–6", L.ASRS.partA >= 0 && L.ASRS.partA <= 6);
}

// ── 4. Монотонность: более сильный ответ не снижает балл ──
for (let k = 0; k < 300; k++) {
  const R = profile(() => Math.floor(rnd() * 5));
  const it = pick(ITEMS.filter((x) => !x.rev && !x.kind && !x.fu));
  const r = R[it.id];
  if (r.now.I == null || r.now.I >= 4) continue;
  const before = ev(R);
  const R2 = JSON.parse(JSON.stringify(R));
  R2[it.id].now.I = r.now.I + 1; if (R2[it.id].now.I >= 2 && !R2[it.id].now.F) R2[it.id].now.F = "some";
  // монотонность проверяем, только если набор открытых уточняющих не изменился
  const sameOpen = ITEMS.every((x) => ND.eligible(x, R) === ND.eligible(x, R2));
  if (!sameOpen) continue;
  const after = ev(R2);
  const key = it.c ? ["constructs", it.c] : ["symptoms", it.s];
  check(`монотонность ${it.id}`, after[key[0]][key[1]].now.s >= before[key[0]][key[1]].now.s - 1e-9);
  if (it.c && it.c.startsWith("ASD.")) check(`индекс РАС не падает (${it.id})`, after.asd.index >= before.asd.index);
  if (it.s) check(`индекс СДВГ не падает (${it.id})`, after.adhd.index >= before.adhd.index);
}

// ── 5. Модификаторы ответа ──
{
  const it = ITEMS.find((x) => x.id === "A1-1");
  const base = { now: { I: 3, F: "some" }, child: { I: 3, F: "some" } };
  const s0 = ND.scoring.itemScore(it, base, "now").s;
  check("частота повышает балл", ND.scoring.itemScore(it, { ...base, now: { I: 3, F: "always" } }, "now").s > s0);
  check("маскировка повышает балл", ND.scoring.itemScore(it, { ...base, mask: 2 }, "now").s > s0);
  const u = ND.scoring.itemScore(it, { ...base, unsure: true }, "now");
  check("старая галочка «не уверен(а)» больше не влияет (v0.9)", u.s === s0 && u.lo === s0 && u.hi === s0, u);
  const low = { now: { I: 1 }, child: { I: 1 } }, l0 = ND.scoring.itemScore(it, low, "now").s;
  check("при «скорее нет» «видно ли со стороны» не учитывается", ND.scoring.itemScore(it, { ...low, mask: 2 }, "now").s === l0);
  check("«не знаю» в поле «видно ли» = нет ответа", ND.scoring.itemScore(it, { ...base, maskUnk: true }, "now").s === s0);
  check("«не помню» исключает период", ND.scoring.itemScore(it, { ...base, child: { unknown: true } }, "child") === null);
  check("свой ответ без варианта не считается", ND.scoring.itemScore(it, { now: { custom: true, text: "иногда" }, child: {} }, "now") === null);
  check("«неприменимо» исключает вопрос", ND.scoring.itemScore(it, { ...base, na: true }, "now") === null);
}

// ── 6. Эталонные профили ──
{
  const nt = profile(() => 0);
  for (const it of ITEMS) if (it.rev) nt[it.id] = { now: { I: 4 }, child: { I: 4 } };
  const E = ev(nt);
  check("без признаков: РАС не соответствует", E.asd.level === "none", E.asd.level);
  check("без признаков: СДВГ не соответствует", E.adhd.level === "none", E.adhd.level);
  check("без признаков: индексы низкие", E.asd.index < 15 && E.adhd.index < 15, [E.asd.index, E.adhd.index]);

  const adhd = {};
  for (const it of ITEMS) {
    if (it.kind === "func") adhd[it.id] = { now: { D: 2 }, child: { D: 2 } };
    else if (it.s) adhd[it.id] = { now: { I: 3, F: "often" }, child: { I: 3, F: "often" }, ctx: ["work", "home"], harm: 2 };
    else if (it.rev) adhd[it.id] = { now: { I: 3 }, child: { I: 3 } };
    else adhd[it.id] = { now: { I: 1 }, child: { I: 1 } };
  }
  const A = ev(adhd);
  check("только СДВГ: СДВГ высокое", A.adhd.level === "high", A.adhd.level);
  check("только СДВГ: РАС не выше «отдельных черт»", ["none", "subclinical"].includes(A.asd.level), A.asd.level);
  check("только СДВГ: индекс СДВГ > индекса РАС", A.adhd.index > A.asd.index + 30, [A.adhd.index, A.asd.index]);

  const S = ev(ND.sampleResponses());
  check("пример: РАС высокое", S.asd.level === "high", S.asd.level);

  // нарушения только через «мешает» в вопросах (без блока «Влияние на жизнь»)
  const noFunc = JSON.parse(JSON.stringify(adhd));
  for (const f of Object.keys(ND.LIFE_SPHERES)) delete noFunc[f];
  check("D СДВГ выполняется по ответам «мешает»", ev(noFunc).adhd.D === "met", ev(noFunc).adhd.D);
}

// ── 7. Общий вывод ──
{
  const nt = profile(() => 0);
  for (const it of ITEMS) if (it.rev) nt[it.id] = { now: { I: 4 }, child: { I: 4 } };
  for (const it of ITEMS) if (nt[it.id].now) { nt[it.id].now = { I: 0 }; nt[it.id].child = { I: 0 }; nt[it.id].harm = 0; nt[it.id].mask = 0; }
  for (const it of ITEMS) if (it.rev) nt[it.id] = { now: { I: 4 }, child: { I: 4 } };
  for (const f of Object.keys(ND.LIFE_SPHERES)) nt[f] = { now: { D: 0 }, child: { D: 0 } };
  check("общий вывод: нейротипичный", ND.scoring.overall(ev(nt)).code === "nt", ND.scoring.overall(ev(nt)));
  const adhdOnly = {};
  for (const it of ITEMS) {
    if (it.kind === "func") adhdOnly[it.id] = { now: { D: 2 }, child: { D: 2 } };
    else if (it.s) adhdOnly[it.id] = { now: { I: 3, F: "often" }, child: { I: 3, F: "often" }, ctx: ["work", "home"], harm: 2 };
    else if (it.rev) adhdOnly[it.id] = { now: { I: 4 }, child: { I: 4 } };
    else adhdOnly[it.id] = { now: { I: 0 }, child: { I: 0 } };
  }
  check("общий вывод: только СДВГ", ND.scoring.overall(ev(adhdOnly)).code === "adhd", ND.scoring.overall(ev(adhdOnly)));
  const asdOnly = ND.sampleResponses();
  for (const it of ITEMS) if (it.s) asdOnly[it.id] = { now: { I: 0 }, child: { I: 0 } };
  check("общий вывод: РАС", ["asd"].includes(ND.scoring.overall(ev(asdOnly)).code), ND.scoring.overall(ev(asdOnly)));
  const both = JSON.parse(JSON.stringify(ND.sampleResponses()));
  for (const it of ITEMS) if (it.s) both[it.id] = { now: { I: 4, F: "always" }, child: { I: 4, F: "always" }, ctx: ["work", "home"], harm: 2 };
  check("общий вывод: оба", ND.scoring.overall(ev(both)).code === "both", ND.scoring.overall(ev(both)));
}

// ── 8. Согласованность ответов на случайных профилях ──
{
  const hard = (E) => E.validity.some((f) => f.severity === "hard");
  const has = (E, code) => E.validity.some((f) => f.code === code);
  // согласованный профиль: у каждой темы свой уровень, ответы близко к нему, обратные вопросы зеркальны
  function consistent() {
    const lvl = {}, R = {};
    const L = (g) => (lvl[g] ??= Math.floor(rnd() * 5));
    for (const it of ITEMS) {
      if (it.rev) continue;
      if (it.kind === "func") { const d = Math.floor(rnd() * 4); R[it.id] = { now: { D: d }, child: { D: d } }; continue; }
      const g = ND.groupOf(it) || it.d;
      const mk = () => { const I = Math.max(0, Math.min(4, L(g) + pick([-1, 0, 0, 0, 0, 1]))); return I >= 2 ? { I, F: pick(FREQ) } : { I }; };
      const now = mk(), child = mk();
      R[it.id] = { now, child, rt: 5000, harm: now.I >= 2 ? pick([0, 1, 2, 3]) : 0, mask: now.I >= 1 ? pick([0, 1, 2]) : 0, ctx: now.I >= 1 ? [pick(["home", "work"])] : [] };
    }
    for (const it of ITEMS.filter((x) => x.rev)) {
      const b = R[it.pair];
      R[it.id] = { now: { I: 4 - b.now.I }, child: { I: 4 - b.child.I }, rt: 5000 };
    }
    return R;
  }
  function noise() {
    const R = {};
    for (const it of ITEMS) {
      if (it.kind === "hist") continue; // вопросы о раннем развитии в подсчёт не входят: поток случайных чисел как до v0.10
      if (it.kind === "func") { R[it.id] = { now: { D: Math.floor(rnd() * 4) }, child: { D: Math.floor(rnd() * 4) } }; continue; }
      const mk = () => { const I = Math.floor(rnd() * 5); return I >= 2 ? { I, F: pick(FREQ) } : { I }; };
      R[it.id] = { now: mk(), child: mk(), rt: 5000, harm: Math.floor(rnd() * 4), mask: Math.floor(rnd() * 3), ctx: rnd() < 0.5 ? ["home"] : [] };
    }
    return R;
  }
  let consHard = 0, consPair = 0, noiseHard = 0;
  const N = 300;
  for (let k = 0; k < N; k++) {
    const E = ev(consistent());
    if (hard(E)) consHard++;
    if (has(E, "pair")) consPair++;
    if (hard(ev(noise()))) noiseHard++;
  }
  console.log(`  согласованные профили: жёсткий флаг в ${consHard}/${N}, флаг пар в ${consPair}/${N}; случайный шум: жёсткий флаг в ${noiseHard}/${N}`);
  check("согласованные профили почти не получают жёсткий флаг (≤5%)", consHard <= N * 0.05, consHard);
  check("зеркальные обратные пары никогда не дают флаг пар", consPair === 0, consPair);
  check("случайный шум почти всегда получает жёсткий флаг (≥90%)", noiseHard >= N * 0.9, noiseHard);

  // подложенные противоречия
  const R1 = consistent();
  const revs = ITEMS.filter((x) => x.rev).slice(0, 3);
  for (const it of revs) { R1[it.pair].now = { I: 4, F: "often" }; R1[it.id].now = { I: 4 }; }
  const E1 = ev(R1);
  check("3 противоречивые пары → жёсткий флаг пар", E1.validity.some((f) => f.code === "pair" && f.severity === "hard"), E1.validity);
  check("противоречия снимают уровень «высокое»", E1.asd.level !== "high" && E1.adhd.level !== "high");
  check("в общем выводе сказано о противоречиях", /противореч/.test(ND.scoring.overall(E1).text), ND.scoring.overall(E1).text);

  const R2 = consistent();
  ITEMS.filter((x) => !x.rev && !x.kind && !x.fu).slice(0, 5).forEach((it) => { R2[it.id].now = { I: 0 }; R2[it.id].harm = 3; });
  check("«совсем нет» с сохранённым «мешает сильно» больше не противоречие: поле скрыто", !ev(R2).validity.some((f) => f.code === "inner"), ev(R2).validity);
  check("скрытые поля при «совсем нет» не меняют индексы", ev(R2).asd.index === ev((() => { const X = JSON.parse(JSON.stringify(R2)); for (const k in X) if (X[k].now && X[k].now.I === 0) delete X[k].harm; return X; })()).asd.index);

  const R3 = consistent();
  const one = ITEMS.find((x) => x.id === "A1-1"); R3[one.id].now = { I: 0 }; R3[one.id].harm = 3;
  check("одна такая отметка флага не даёт", !ev(R3).validity.some((f) => f.code === "inner"));
}

// ── Логика весов (v0.4.2) ──
{
  const base = () => { const R = {}; for (const it of ITEMS) if (it.c === "ASD.A1") R[it.id] = { now: { I: 3, F: "often" }, child: { I: 3, F: "often" } }; return R; };
  const st = (R) => ev(R).constructs["ASD.A1"].now.status;
  check("A1 «выполнен»", st(base()) === "met", ev(base()).constructs["ASD.A1"].now);
  const U = base(); for (const k in U) U[k].unsure = true;
  check("старая отметка «не уверен(а)» статус не меняет", st(U) === "met", ev(U).constructs["ASD.A1"].now);
  const W = {}; for (const it of ITEMS) if (it.c === "ASD.A1") W[it.id] = { now: { I: 2, F: "rare" }, child: { I: 0 } };
  check("слабый признак → «нет»", st(W) === "no", ev(W).constructs["ASD.A1"].now);
  const K = base(); for (const k in K) { K[k].harmUnk = true; K[k].maskUnk = true; K[k].ctxUnk = true; }
  check("«не знаю» в доп. полях не меняет баллы", ev(K).asd.index === ev(base()).asd.index && st(K) === "met");

  const it = ITEMS.find((x) => x.id === "A1-1");
  const r0 = { now: { I: 3, F: "often" }, child: { I: 3, F: "often" } }, r2 = { ...r0, mask: 2 };
  check("маскировка повышает балл «сейчас»", ND.scoring.itemScore(it, r2, "now").s > ND.scoring.itemScore(it, r0, "now").s);
  check("маскировка не трогает балл «в детстве»", ND.scoring.itemScore(it, r2, "child").s === ND.scoring.itemScore(it, r0, "child").s);

  const A = {}; for (const x of ITEMS) if (x.s) A[x.id] = { now: { I: 3, F: "often" }, child: { I: 3, F: "often" }, ctx: ["alone"] };
  check("«наедине с собой» не даёт критерий C СДВГ", ev(A).adhd.contexts.length === 0 && ev(A).adhd.C !== "met", ev(A).adhd.contexts);

  const q = {}; for (const x of ITEMS.filter((y) => (y.src || "").includes("AQ."))) q[x.id] = { now: { I: 2, F: "often" }, child: { I: 2, F: "often" } };
  const aq = ev(q).legacy.AQ.total;
  check("AQ: все ответы «частично» ≈ середина шкалы (25)", Math.abs(aq - 25) < 1.5, aq);
  const q4 = {}; for (const x of ITEMS.filter((y) => (y.src || "").includes("RAADS."))) q4[x.id] = { now: { I: 4, F: "always" }, child: { I: 0 } };
  const ra = ev(q4).legacy.RAADS;
  check("RAADS-R: «только сейчас» = 2 балла за пункт", Math.abs(ra.total - 160) < 2, ra.total);
}

// ── Трудные профили (v0.4.4) ──
{
  // симптомы СДВГ только сейчас, в детстве нет
  const late = {};
  for (const it of ITEMS) {
    if (it.s && it.s.startsWith("A1")) late[it.id] = { now: { I: 4, F: "always" }, child: { I: 0 }, ctx: ["work", "home"], harm: 2 };
    else if (it.kind === "func") late[it.id] = { now: { D: 3 }, child: { D: 0 } };
    else if (!it.rev) late[it.id] = { now: { I: 0 }, child: { I: 0 } };
  }
  const E = ev(late);
  check("позднее начало: критерий B СДВГ не выполнен", E.adhd.B === "no", E.adhd.B);
  check("позднее начало: уровень не выше «отдельных черт»", E.adhd.level === "subclinical", E.adhd.level);
  check("позднее начало: индекс ограничен 49", E.adhd.index <= 49 && E.adhd.indexRaw > 49, [E.adhd.index, E.adhd.indexRaw]);
  check("позднее начало: тип проявления не указывается", E.adhd.presentation === null, E.adhd.presentation);
  check("позднее начало: в выводе сказано про начало в детстве", /до 12 лет/.test(ND.scoring.overall(E).text), ND.scoring.overall(E).text);
  check("трудности из-за СДВГ не дают критерий D РАС, если признаков РАС нет", E.asd.D !== "met", E.asd.D);
  // те же симптомы, но с детства: ограничения нет
  const early = JSON.parse(JSON.stringify(late));
  for (const it of ITEMS) if (it.s && it.s.startsWith("A1")) early[it.id].child = { I: 4, F: "always" };
  for (const f of ["F1", "F2", "F3", "F4", "F5"]) early[f].child = { D: 3 };
  const E2 = ev(early);
  check("начало в детстве: индекс не ограничен, тип указан", E2.adhd.index === E2.adhd.indexRaw && E2.adhd.presentation === "преимущественно невнимательная", [E2.adhd.index, E2.adhd.presentation]);
}

// ── Реальные ответы участников (v0.4.5) ──
{
  check("диапазоны индекса совпадают с порогами", ND.indexBand(39) === "низкий" && ND.indexBand(40) === "умеренный" && ND.indexBand(59) === "умеренный" && ND.indexBand(60) === "выраженный" && ND.indexBand(80) === "высокий");
  // все критерии выполнены, но противоречивые пары → «под вопросом», а не «частичное»
  const R = {};
  for (const it of ITEMS) {
    if (it.s) R[it.id] = { now: { I: 4, F: "always" }, child: { I: 4, F: "always" }, ctx: ["work", "home"], harm: 2 };
    else if (it.kind === "func") R[it.id] = { now: { D: 3 }, child: { D: 3 } };
    else if (!it.rev) R[it.id] = { now: { I: 0 }, child: { I: 0 } };
  }
  for (const it of ITEMS.filter((x) => x.rev && ITEMS.find((y) => y.id === x.pair).s)) R[it.id] = { now: { I: 4 }, child: { I: 4 } };
  const E = ev(R);
  check("все критерии СДВГ + противоречия → «под вопросом»", E.adhd.level === "unreliable", [E.adhd.level, E.validity.map((f) => f.code + f.severity)]);
  check("«под вопросом» в общем выводе считается признаком", ND.scoring.overall(E).code === "adhd", ND.scoring.overall(E).code);
  // «совсем нет» + отмеченные места — не противоречие
  const R2 = {};
  for (const it of ITEMS.filter((x) => !x.rev && !x.kind && !x.fu)) R2[it.id] = { now: { I: 0 }, child: { I: 0 }, ctx: ["home", "work"], harm: 0 };
  check("«совсем нет» с отмеченными местами не даёт флаг противоречия", !ev(R2).validity.some((f) => f.code === "inner"), ev(R2).validity);
  // разброс внутри темы — только мягкий
  check("разброс внутри темы не считается противоречием", !ev(R).validity.some((f) => f.code === "spread"));
}

// ── v0.5: какие ответы противоречат, уточняющие вопросы, нарушения без признаков ──
{
  // противоречащие пары показываются поимённо, с периодом и силой
  const R = {};
  for (const it of ITEMS.filter((x) => !x.rev && !x.kind)) R[it.id] = { now: { I: 1 }, child: { I: 1 } };
  for (const it of ITEMS.filter((x) => x.rev)) { R[it.pair] = { now: { I: 4, F: "always" }, child: { I: 1 } }; R[it.id] = { now: { I: 4 }, child: { I: 3 } }; }
  const V = ev(R).validity, pf = V.find((f) => f.code === "pair");
  check("флаг пар перечисляет каждое противоречие", pf && pf.details.length === ITEMS.filter((x) => x.rev).length, pf && pf.details.length);
  check("у противоречия есть оба вопроса, период и объяснение", pf && pf.details.every((d) => d.refs.length === 2 && d.refs.every((r) => ITEMS.some((x) => x.id === r.id) && r.periods.join() === "now") && d.why.length > 20));
  check("«полностью да» на оба вопроса пары — сильное противоречие", pf && pf.details.every((d) => d.strength === "strong"));
  check("степень согласованности: число проверок и противоречий", V.summary.checks > 0 && V.summary.conflicts >= pf.details.length && V.summary.share > 0 && V.summary.share <= 1, V.summary);
  const ok = ev({}).validity;
  check("без ответов противоречий нет", ok.summary.conflicts === 0 && ok.summary.checks === 0);

  // «мешает сильно» в отдельных вопросах, но во всех сферах «не мешали» → мягкий флаг с деталями
  const R2 = {};
  for (const it of ITEMS.filter((x) => !x.rev && !x.kind)) R2[it.id] = { now: { I: 0 }, child: { I: 0 } };
  for (const id of ["H1-a", "H1-b", "H1-c", "H1-d"]) R2[id] = { now: { I: 3, F: "often" }, child: { I: 3, F: "often" }, harm: 3 };
  for (const f of Object.keys(ND.LIFE_SPHERES)) R2[f] = { now: { D: 0 }, child: { D: 0 } };
  const sf = ev(R2).validity.find((f) => f.code === "spheres");
  check("«мешает» в вопросах против «не мешали» в сферах → мягкий флаг", sf && sf.severity === "soft" && sf.details[0].refs.some((r) => r.fields.includes("spheres")), ev(R2).validity);

  // уточняющий вопрос с ответом «нет» не опускает балл ниже основного
  const core = ITEMS.find((x) => x.s === "A1.a" && !x.fu), fu = ITEMS.find((x) => x.s === "A1.a" && x.fu);
  const base = { [core.id]: { now: { I: 4, F: "always" }, child: { I: 4, F: "always" } } };
  const withFu = { ...base, [fu.id]: { now: { I: 0 }, child: { I: 0 } } };
  const s0 = ND.scoring.symptomScore("A1.a", base, "now"), s1 = ND.scoring.symptomScore("A1.a", withFu, "now");
  check("«нет» на уточняющий не снижает балл симптома", s1.s >= s0.s && s1.status === ND.ST.MET, [s0, s1]);
  const withFuYes = { ...base, [core.id]: { now: { I: 3, F: "often" }, child: { I: 3, F: "often" } }, [fu.id]: { now: { I: 4, F: "always" }, child: { I: 4, F: "always" } } };
  check("«да» на уточняющий поднимает балл", ND.scoring.symptomScore("A1.a", withFuYes, "now").s > ND.scoring.itemScore(core, withFuYes[core.id], "now").s);

  // нарушения без признаков не дают баллов индекса
  const R3 = {};
  for (const it of ITEMS.filter((x) => !x.rev && !x.kind)) R3[it.id] = { now: { I: 0 }, child: { I: 0 } };
  for (const f of Object.keys(ND.LIFE_SPHERES)) R3[f] = { now: { D: 3 }, child: { D: 3 } };
  const E3 = ev(R3);
  check("нет признаков, но всё сильно мешает → индексы 0", E3.asd.index === 0 && E3.adhd.index === 0, [E3.asd.index, E3.adhd.index]);
}

// ── «Что может помочь» ──
{
  const all = [...ND.SUPPORT.flatMap((g) => g.items), ...ND.SUPPORT_BASE];
  check("у каждого совета есть уровень доказательности и источник", all.every((x) => x.ev.length && x.ev.every((k) => ND.EVIDENCE[k]) && x.src.length > 5 && x.how.length > 40));
  check("у каждого недоказанного метода есть источник", ND.SUPPORT_UNPROVEN.every((x) => x.src && x.note));
  const zero = {};
  for (const it of ITEMS) zero[it.id] = it.kind === "func" ? { now: { D: 0 }, child: { D: 0 } } : { now: { I: 0 }, child: { I: 0 } };
  const SPz = ND.support(ev(zero), zero);
  check("без признаков блок «Что может помочь» пуст", !SPz.groups.length && !SPz.base.length, SPz.groups.map((g) => g.key));
  const Rs = ND.sampleResponses(), before = JSON.stringify(ev(Rs).asd) + JSON.stringify(ev(Rs).adhd);
  const SPs = ND.support(ev(Rs), Rs);
  check("на примере отчёта подбираются советы", SPs.groups.length >= 2 && SPs.base.length === 2, SPs.groups.map((g) => g.key));
  check("подбор советов не меняет результат", JSON.stringify(ev(Rs).asd) + JSON.stringify(ev(Rs).adhd) === before);
  for (let k = 0; k < 50; k++) { const R = profile(() => Math.floor(rnd() * 5)); try { ND.support(ev(R), R); } catch (e) { check("подбор советов без ошибок", false, e.message); break; } }
}

// ── Поле «Видно ли это со стороны?» убрано у 37 вопросов ──
{
  {
    const it = ITEMS.find((x) => x.id === "A3-7");
    check("у вопросов без детства ответ о детстве не учитывается", it.noChild && ND.scoring.itemScore(it, { now: { I: 3 }, child: { I: 4, F: "always" } }, "child") === null);
    check("вопросов без детства 4, все существуют", ND.NO_CHILD.size === 4 && [...ND.NO_CHILD].every((id) => ITEMS.some((x) => x.id === id)));
  }
  {
    const it = ITEMS.find((x) => x.id === "B3-5");
    const sc = (r) => ND.scoring.itemScore(it, r, "now").s;
    check("у устойчивых черт балл равен уровню, частота не влияет", sc({ now: { I: 3, F: "rare" } }) === 0.75 && sc({ now: { I: 4 } }) === 1 && ND.NO_FREQ.size === 14);
  }
  check("поле маскировки убрано у 48 вопросов (37 + 11 «мне говорят»)", ND.NO_MASK.size === 48 && [...ND.NO_MASK].every((id) => ITEMS.some((x) => x.id === id && x.noMask)), ND.NO_MASK.size);
  const it = ITEMS.find((x) => x.id === "B4-5"), r = { now: { I: 2, F: "some" }, child: { I: 2 }, mask: 2 };
  check("старый ответ «скрываю» у такого вопроса не даёт поправки", ND.scoring.itemScore(it, r, "now").s === ND.scoring.itemScore(it, { ...r, mask: 0 }, "now").s);
}

// ── PHQ-9 и GAD-7 ──
{
  const sc = (id) => ITEMS.filter((x) => x.scale === id && !x.fx);
  const fill = (v, skip = 0) => { const R = {}; for (const k of ["PHQ9", "GAD7"]) sc(k).forEach((it, i) => { if (i >= skip) R[it.id] = { now: { I: v } }; }); return R; };
  check("PHQ-9: 9 пунктов, GAD-7: 7 пунктов", sc("PHQ9").length === 9 && sc("GAD7").length === 7);
  const all3 = ND.scoring.scales(fill(3));
  check("максимум: PHQ-9 = 27, GAD-7 = 21", all3.PHQ9.score === 27 && all3.GAD7.score === 21 && all3.PHQ9.band === "тяжёлая" && all3.GAD7.band === "выраженная");
  const one = ND.scoring.scales(fill(2, 1)), two = ND.scoring.scales(fill(2, 2));
  check("один пропуск — пропорциональный пересчёт, два — балла нет", one.PHQ9.score === 18 && one.GAD7.score === 14 && two.PHQ9.score === null && two.GAD7.score === null);
  const b = (v) => ND.scoring.scales(fill(0)).PHQ9.band;
  check("ноль — минимальная степень, флага нет", ND.scoring.scales(fill(0)).PHQ9.band === "минимальная" && !ND.scoring.scales(fill(0)).PHQ9.positive);
  check("9-й пункт PHQ-9 ≥ 1 включает блок помощи", ND.scoring.scales({ "PHQ-9": { now: { I: 1 } } }).safety && !ND.scoring.scales({ "PHQ-9": { now: { I: 0 } } }).safety);
  const E10 = ev({ ...fill(0), "PHQ-1": { now: { I: 3 } }, "PHQ-2": { now: { I: 3 } }, "PHQ-3": { now: { I: 2 } }, "PHQ-4": { now: { I: 2 } } });
  check("PHQ-9 от 10 → флаг депрессии", E10.scales.PHQ9.score === 10 && E10.differential.some((d) => d.d === "depression") && !E10.differential.some((d) => d.d === "anxiety"));
  // шкалы не влияют на РАС и СДВГ
  let same = 0, tot = 0;
  for (let k = 0; k < 80; k++) {
    const R = profile(() => Math.floor(rnd() * 5));
    const a = ev({ ...R, ...fill(0) }), c = ev({ ...R, ...fill(3) });
    tot++; if (JSON.stringify([a.asd, a.adhd, a.constructs, a.symptoms, a.validity, a.legacy]) === JSON.stringify([c.asd, c.adhd, c.constructs, c.symptoms, c.validity, c.legacy])) same++;
  }
  check("ответы PHQ-9 и GAD-7 не меняют РАС, СДВГ, согласованность и пересчёт в тесты", same === tot, `${same}/${tot}`);
}

// ── PAQ и ABSI ──
{
  const sc = (id) => ITEMS.filter((x) => x.scale === id && !x.fx && !x.gate);
  const paq = (v) => { const R = {}; sc("PAQ").forEach((it) => (R[it.id] = { now: { I: v } })); return R; };
  const absi = (g, v) => { const R = { "ABSI-0": { now: { I: g } } }; sc("ABSI").forEach((it) => (R[it.id] = { now: { I: v } })); return R; };
  check("PAQ: 24 пункта, ABSI: 20 пунктов и вход", sc("PAQ").length === 24 && sc("ABSI").length === 20 && ITEMS.some((x) => x.id === "ABSI-0" && x.gate));
  const lo = ND.scoring.scales(paq(0)).PAQ, hi = ND.scoring.scales(paq(6)).PAQ;
  check("PAQ: минимум 24, максимум 168, границы по нормам", lo.score === 24 && lo.band === "низкая" && hi.score === 168 && hi.band === "высокая" && hi.positive && !lo.positive);
  check("PAQ: подшкалы по ключу (N-DIF 2, 8, 14, 20)", (() => { const R = paq(0); [2, 8, 14, 20].forEach((n) => (R[`PAQ-${n}`] = { now: { I: 6 } })); const x = ND.scoring.scales(R).PAQ; return x.subs.NDIF.score === 28 && x.subs.PDIF.score === 4 && x.score === 48; })());
  check("PAQ 112 — средняя, 113 — высокая", (() => { const R = paq(3); const a = ND.scoring.scales(R).PAQ.score; R["PAQ-1"] = { now: { I: 6 } }; R["PAQ-2"] = { now: { I: 6 } }; R["PAQ-3"] = { now: { I: 6 } }; R["PAQ-4"] = { now: { I: 6 } }; R["PAQ-5"] = { now: { I: 6 } }; R["PAQ-6"] = { now: { I: 6 } }; R["PAQ-7"] = { now: { I: 6 } }; R["PAQ-8"] = { now: { I: 6 } }; const b = ND.scoring.scales(R).PAQ; return a === 96 && b.score === 120 && b.band === "высокая"; })());
  const Ea = ev(paq(6));
  check("высокая алекситимия → флаг и пояснение к A1", Ea.differential.some((d) => d.d === "alexithymia") && ND.explain.construct("ASD.A1", Ea, paq(6)).some((w) => w.period === "note") && !ND.explain.construct("ASD.B1", Ea, paq(6)).some((w) => w.period === "note"));
  check("ABSI: при ответе «нет» вопросы закрыты и балла нет", !ND.eligible(ITEMS.find((x) => x.id === "ABSI-1"), absi(1, 6)) && ND.scoring.scales(absi(1, 6)).ABSI.score === null && ND.scoring.scales(absi(1, 6)).ABSI.answered === 0);
  check("ABSI: среднее 1–7, «не уверен(а)» тоже открывает", ND.scoring.scales(absi(0, 6)).ABSI.score === 7 && ND.scoring.scales(absi(2, 0)).ABSI.score === 1 && ND.scoring.scales(absi(0, 3)).ABSI.subs.COG.score === 4);
  check("ABSI: два пропуска — балл есть, три — нет", (() => { const R = absi(0, 4); delete R["ABSI-1"]; delete R["ABSI-2"]; const a = ND.scoring.scales(R).ABSI.score; delete R["ABSI-3"]; return a === 5 && ND.scoring.scales(R).ABSI.score === null; })());
  check("ABSI не даёт флагов: порогов у шкалы нет", !ev(absi(0, 6)).differential.length);
  let same = 0, tot = 0;
  for (let k = 0; k < 80; k++) {
    const R = profile(() => Math.floor(rnd() * 5));
    const a = ev({ ...R, ...paq(0), ...absi(1, 0) }), c = ev({ ...R, ...paq(6), ...absi(0, 6) });
    tot++; if (JSON.stringify([a.asd, a.adhd, a.constructs, a.symptoms, a.validity, a.legacy]) === JSON.stringify([c.asd, c.adhd, c.constructs, c.symptoms, c.validity, c.legacy])) same++;
  }
  check("ответы PAQ и ABSI не меняют РАС, СДВГ, согласованность и пересчёт в тесты", same === tot, `${same}/${tot}`);
}

// ── Сопутствующие состояния ──
{
  const co = ITEMS.filter((x) => x.kind === "comorb");
  check("сопутствующих состояний 14", co.length === 14);
  let same = 0, tot = 0;
  for (let k = 0; k < 80; k++) {
    const R = profile(() => Math.floor(rnd() * 5));
    const yes = {}, no = {};
    co.forEach((it) => { yes[it.id] = { now: { I: 0 }, rt: 500 }; no[it.id] = { now: { I: 1 }, rt: 500 }; });
    const a = ev({ ...R, ...no }), c = ev({ ...R, ...yes }), b = ev(R);
    tot++; if (JSON.stringify([a.asd, a.adhd, a.constructs, a.symptoms, a.validity, a.legacy, a.differential]) === JSON.stringify([c.asd, c.adhd, c.constructs, c.symptoms, c.validity, c.legacy, c.differential]) && JSON.stringify([a.asd, a.validity]) === JSON.stringify([b.asd, b.validity])) same++;
  }
  check("ответы о сопутствующих состояниях ничего не меняют, даже быстрые", same === tot, `${same}/${tot}`);
}

// ── Тип СДВГ в общем выводе ──
{
  const E = ev(ND.sampleResponses()), O = ND.scoring.overall(E);
  const strong = ["high", "unreliable", "partial"].includes(E.adhd.level);
  check("тип СДВГ показан в общем выводе, только если признаки СДВГ выражены", strong ? /^Тип СДВГ/.test(O.adhdType || "") : O.adhdType == null, O.adhdType);
  check("при нейротипичном профиле типа нет", ND.scoring.overall(ev({})).adhdType == null);
}

// ── «Почему такой результат» ──
{
  let bad = 0;
  const profiles = [{}, ND.sampleResponses()];
  for (let k = 0; k < 60; k++) profiles.push(profile(() => Math.floor(rnd() * 5)));
  for (const R of profiles) {
    const E = ev(R), X = ND.explain;
    const txt = JSON.stringify([
      Object.keys(ND.CONSTRUCTS).filter((c) => c.startsWith("ASD.")).map((c) => X.construct(c, E, R)),
      Object.keys(ND.ADHD_SYMPTOMS).map((s) => X.symptom(s, E, R)),
      X.asdCriteria(E), X.adhdCriteria(E), X.level(E.asd.level, X.asdCriteria(E)), X.level(E.adhd.level, X.adhdCriteria(E)), X.index(E.asd), X.index(E.adhd)]);
    if (/undefined|NaN|null из/.test(txt)) bad++;
    // вклады частей индекса складываются в сам индекс
    for (const x of [E.asd, E.adhd]) if (Math.abs(x.indexParts.reduce((a, p) => a + p.pts, 0) - x.indexRaw) > 0.51) bad++;
    // текст статуса не противоречит статусу
    for (const s of Object.keys(ND.ADHD_SYMPTOMS)) { const w = X.symptom(s, E, R)[0], st = E.symptoms[s].now.status; if (st === "met" && !/не ниже порога 60/.test(w.text)) bad++; if (st === "no" && !/ниже 40/.test(w.text)) bad++; }
  }
  check("пояснения строятся без ошибок, вклады индекса сходятся, тексты совпадают со статусами", bad === 0, bad);
}

// ── Пояснения к вопросам ──
for (const it of ITEMS.filter((x) => x.kind !== "scale")) {
  const h = ND.HINTS[it.id];
  check(`${it.id}: есть пояснение`, typeof h === "string" && h.length >= 40 && h.length <= 260, h);
}
check("нет пояснений к несуществующим вопросам", Object.keys(ND.HINTS).every((id) => ids.includes(id)));

// ── Сильные стороны не влияют на подсчёт ──
{
  for (const domain of Object.values(ND.STRENGTHS)) for (const id of domain.also) check(`сильная сторона ссылается на ${id}`, ids.includes(id));
  const strip = (E) => JSON.stringify({ asd: E.asd, adhd: E.adhd, c: E.constructs, s: E.symptoms, v: E.validity, l: E.legacy, d: E.differential });
  let same = 0;
  for (let k = 0; k < 100; k++) {
    const base = Math.floor(rnd() * 5);
    const R = profile(() => Math.max(0, Math.min(4, base + pick([-1, 0, 1]))));
    const a = strip(ev(R));
    for (const it of ITEMS.filter((x) => x.kind === "strength")) R[it.id] = answer(it, 4 - base);
    if (strip(ev(R)) === a) same++;
  }
  check("ответы о сильных сторонах не меняют индексы, критерии и согласованность", same === 100, same);
  const R = {};
  for (const it of ITEMS.filter((x) => x.kind === "strength")) R[it.id] = { now: { I: it.st === "detail" ? 4 : 1, F: "often" }, child: { I: 1 } };
  const S = ev(R).strengths;
  check("сильные стороны сортируются по выраженности", S[0].key === "detail" && S.every((x, i) => !i || S[i - 1].s >= x.s), S);
  check("без ответов о сильных сторонах блок пуст", ev({}).strengths.length === 0);
  const full = {}; for (const it of ITEMS.filter((x) => x.kind === "strength")) full[it.id] = { now: { I: 4 }, child: { I: 4 } };
  check("сильная сторона «полностью да» = 100", ev(full).strengths.every((x) => Math.abs(x.s - 1) < 1e-9), ev(full).strengths);
  for (const [k, d] of Object.entries(ND.STRENGTHS)) check(`направление ${k} описано полностью`, [d.desc, d.uses, d.link].every((x) => typeof x === "string" && x.length > 40 && !x.includes("—")), k);
  check("у сильной стороны есть ответы-основания", S.every((x) => x.items.length >= 1));
}

// ── Отчёт для специалиста строится на любых ответах ──
{
  ND.UI = {
    I_LABELS: ["Совсем нет", "Скорее нет", "Частично", "В основном да", "Полностью да"],
    F_OPTS: [["rare", "Редко"], ["some", "Иногда"], ["often", "Часто"], ["always", "Почти всегда"]],
    D_LABELS: ["Не мешали", "Немного", "Заметно", "Сильно"],
    CTX: [["home", "Дома"], ["work", "Работа или учёба"], ["friends", "С друзьями"], ["strangers", "С незнакомыми"], ["alone", "Наедине с собой"]],
    MASK: ["Да, видно", "Отчасти прячу", "Не видно, скрываю с усилием"],
    ST_LABEL: { met: "выполнен", probable: "вероятно", no: "нет", nodata: "нет данных" },
    LEVEL: { high: ["Высокое соответствие"], unreliable: ["Соответствие под вопросом"], partial: ["Частичное соответствие"], subclinical: ["Отдельные черты"], none: ["Не соответствует"] },
  };
  let errs = 0, bad = 0;
  const profiles = [{}, ND.sampleResponses()];
  for (let k = 0; k < 60; k++) { const base = Math.floor(rnd() * 5); profiles.push(profile(() => Math.max(0, Math.min(4, base + pick([-1, 0, 1]))))); }
  for (const R of profiles) {
    try {
      const C = ND.clinician.build(R);
      if (/undefined|NaN/.test(C.html + C.text) || !/A1/.test(C.text) || !/СЛЕДУЮЩИЕ ШАГИ/.test(C.text)) bad++;
    } catch (e) { errs++; if (errs === 1) console.log(e); }
  }
  check("отчёт для специалиста строится без ошибок", errs === 0, errs);
  check("в отчёте для специалиста нет undefined/NaN и есть все разделы", bad === 0, bad);
  const C = ND.clinician.build(ND.sampleResponses());
  check("в отчёте для специалиста под критерием есть ответы-основания", /сейчас: (в основном да|полностью да)/.test(C.text), C.text.slice(0, 400));
}

// ── v0.10: раннее развитие, бюджет энергии, карта масок ни на что не влияют ──
{
  const HX = ITEMS.filter((x) => x.kind === "hist");
  check("в разделе о раннем развитии 7 вопросов", HX.length === 7 && HX.every((x) => x.sec === "history"));
  const key = (E) => JSON.stringify([E.asd, E.adhd, E.constructs, E.symptoms, E.validity, E.legacy, E.scales, E.strengths, E.differential]);
  let same = 0, n = 0;
  for (let k = 0; k < 150; k++) {
    const R = {};
    for (const it of ITEMS) {
      if (it.kind === "hist") continue;
      if (it.kind === "func") { R[it.id] = { now: { D: Math.floor(rnd() * 4) }, child: { D: Math.floor(rnd() * 4) } }; continue; }
      const I = Math.floor(rnd() * 5);
      R[it.id] = { now: { I, F: FREQ[Math.floor(rnd() * 4)] }, child: { I: Math.floor(rnd() * 5), F: FREQ[Math.floor(rnd() * 4)] }, ctx: ["home", "work", "friends", "strangers"].filter(() => rnd() > 0.5), mask: Math.floor(rnd() * 3), harm: Math.floor(rnd() * 4), rt: 3000 + rnd() * 9000 };
    }
    const R2 = JSON.parse(JSON.stringify(R));
    for (const it of HX) R2[it.id] = { h: it.multi ? [0, 1] : 1, rt: 50 };
    const E = ev(R), E2 = ev(R2);
    n++; if (key(E) === key(E2)) same++;
    const EN = ND.insights.energy(E), M = ND.insights.maskMap(E, R), H = ND.insights.history(R2);
    check("бюджет энергии: только выраженные сферы, по убыванию, неделя из 7 дней",
      EN.drains.every((x, i) => x.s >= ND.PARAMS.thetaLo && (!i || EN.drains[i - 1].s >= x.s)) && (EN.drains.length ? EN.week.length === 7 : !EN.week.length) && [...EN.drains, ...EN.charges].every((x) => ND.EVIDENCE[x.ev] && x.src));
    check("карта масок: счётчики сходятся", M.hidden <= M.n && M.effort <= M.hidden && [...M.places, ...M.areas].every((x) => x.hidden <= x.n && x.level >= 0 && x.level <= 1));
    check("раннее развитие: все ответы показаны, пояснения без повторов", H.rows.length === HX.length && new Set(H.notes.map((x) => x.key)).size === H.notes.length);
  }
  check("ответы о раннем развитии и семье не меняют баллы, критерии, индексы и согласованность", same === n, `${same}/${n}`);
  const H0 = ND.insights.history({ "HX-5": { h: [6] }, "HX-1": { h: 2 } });
  check("«Ничего особенного» и «Не знаю» не дают пояснений", H0.rows.length === 2 && !H0.notes.length);
  const H1 = ND.insights.history({ "HX-1": { h: 1 }, "HX-2": { h: 1 } });
  check("одинаковое пояснение о речи показывается один раз", H1.notes.length === 1 && H1.notes[0].key === "speech");
  const S = ND.sampleResponses(), C = ND.clinician.build(S);
  check("в отчёте для специалиста есть раннее развитие и карта масок", /РАННЕЕ РАЗВИТИЕ И СЕМЬЯ/.test(C.text) && /КАРТА МАСОК/.test(C.text));
}


// ── v0.11: лаборатория (пробы, «сейчас или потом»), персонаж, музыка ──
{
  const L = ND.lab;
  // расписание проб: детерминировано, по возрастанию, внутри анкеты
  for (const seed of [1, 7, 12345, 999999]) for (const total of [60, 120, 176]) {
    const a = L.probeSchedule(seed, total), b = L.probeSchedule(seed, total);
    check(`пробы: расписание ${seed}/${total} стабильно и возрастает`, JSON.stringify(a) === JSON.stringify(b) && a.every((x, i) => (!i || x > a[i - 1]) && x >= 4 && x < total) && a.length >= L.PROBE_N - 1, a);
  }
  const PS = L.probeSummary([{ a: "task" }, { a: "other", how: "spont" }, { a: "missed" }, { a: "skip" }, { a: "blank" }, { a: "unsure" }, { a: "other", how: "delib" }, { a: "task" }]);
  check("пробы: сводка считает только ответы, «не могу сказать» не в доле", PS.n === 6 && PS.rated === 5 && PS.off === 3 && Math.abs(PS.share - 0.6) < 1e-9 && PS.spont === 1 && PS.delib === 1 && PS.blank === 1 && PS.enough, PS);
  check("пробы: меньше трёх ответов — итога нет", !L.probeSummary([{ a: "task" }, { a: "other" }]).enough);
  // подстройка суммы: всегда «сейчас» -> к нулю, всегда «потом» -> к 10 000
  const all = (c) => Object.fromEntries(L.DELAYS.map((d) => [d.key, Array(L.STEPS).fill(c)]));
  const Dn = L.discount(all("now")), Dl = L.discount(all("later"));
  check("сейчас-или-потом: всегда «сейчас» даёт малые точки и малую AUC", Dn.complete && Dn.points.every((p) => p.ip < 200) && Dn.auc < 0.05, Dn);
  check("сейчас-или-потом: всегда «потом» даёт AUC около 1", Dl.complete && Dl.points.every((p) => p.ip > 9800) && Dl.auc > 0.97, Dl);
  check("сейчас-или-потом: первое предложение 5000, затем ±2500", L.offer([]) === 5000 && L.offer(["now"]) === 2500 && L.offer(["later"]) === 7500 && L.offer(["later", "now"]) === 6250);
  check("сейчас-или-потом: AUC прямой линии от 1 до 0 равна 0,5", Math.abs(L.auc([{ days: 365, rel: 0 }]) - 0.5) < 1e-9);
  let tr = L.nextTrial({}), cnt = 0; const ans = {};
  while (tr && cnt < 100) { (ans[tr.delay.key] = ans[tr.delay.key] || []).push(cnt % 3 ? "later" : "now"); cnt++; tr = L.nextTrial(ans); }
  check("сейчас-или-потом: ровно 20 выборов", cnt === L.DELAYS.length * L.STEPS, cnt);
  const SL = ND.sampleLab(), SD = L.discount(SL.dd);
  check("пример лаборатории: кривая убывает, без скачков", SD.complete && SD.points.every((p, i) => !i || p.ip <= SD.points[i - 1].ip) && SD.jumps === 0 && SD.auc > 0 && SD.auc < 1, SD);
  check("скачок по Johnson & Bickel находится", L.discount({ w1: Array(5).fill("now"), m1: Array(5).fill("later"), m6: Array(5).fill("later"), y1: Array(5).fill("later") }).jumps === 1);
  // лаборатория не трогает баллы: evaluate не видит её данных, отчёт специалиста только дописывает раздел
  const S = ND.sampleResponses(), E1 = ND.scoring.evaluate(S), C0 = ND.clinician.build(S), C1 = ND.clinician.build(S, SL);
  check("лаборатория попадает в отчёт специалиста как отдельный раздел", /ЛАБОРАТОРИЯ/.test(C1.text) && !/ЛАБОРАТОРИЯ/.test(C0.text) && C1.text.replace(/ЛАБОРАТОРИЯ[\s\S]*?\n\n/, "") === C0.text);
  check("лаборатория не меняет evaluate", JSON.stringify(ND.scoring.evaluate(S)) === JSON.stringify(E1));
  // персонаж
  const G = ND.sprite.grid({}), G2 = ND.sprite.grid({ style: "long", hair: 3, skin: 2, shirt: 4, acc: ND.sprite.ACC.map((x) => x[0]) });
  check("персонаж: сетка 32×32 из цветов или пустоты", [G, G2].every((g) => g.length === 32 && g.every((r) => r.length === 32 && r.every((c) => c === null || (Array.isArray(c) && c.length === 3 && c.every((v) => v >= 0 && v <= 255))))));
  check("персонаж: предметы меняют картинку", JSON.stringify(G) !== JSON.stringify(G2));
  const sug = ND.sprite.suggest(E1);
  check("персонаж: подсказки — известные предметы, без слов РАС/СДВГ", sug.every(([k, w]) => ND.sprite.ACC.some((x) => x[0] === k) && !/РАС|СДВГ|аутизм/i.test(w)) && sug.length > 0, sug);
  check("персонаж: у пустых ответов подсказок нет", ND.sprite.suggest(ND.scoring.evaluate({})).length === 0);
  // музыка: петля детерминирована и в пентатонике
  const m1 = ND.music.makeLoop(ND.music.hash("social")), m2 = ND.music.makeLoop(ND.music.hash("social"));
  check("музыка: петля одинакова для раздела, 16 шагов, 4 баса", JSON.stringify(m1) === JSON.stringify(m2) && m1.mel.length === 16 && m1.bass.length === 4);
}

// ── v0.12: лаборатория, задания Б10–Б13 ──
{
  const L = ND.lab;
  // Б10: разброс времени реакции
  const flat = Array.from({ length: L.RT.N }, () => ({ rt: 300 }));
  const wavy = Array.from({ length: L.RT.N }, (_, i) => ({ rt: i % 2 ? 250 : 650 }));
  const F = L.rtSummary(flat), W = L.rtSummary(wavy);
  check("реакция: одинаковые ответы дают нулевой разброс", F.done && F.enough && F.cv === 0 && F.median === 300 && F.slow === 0, F);
  check("реакция: «волны» дают большой разброс", W.cv > 0.4 && W.median === 450, W);
  const mixed = [{ rt: 300, practice: true }, { rt: null, early: true }, { rt: 90 }, { rt: null }, { rt: 1800 }, ...Array(30).fill({ rt: 300 })];
  const M = L.rtSummary(mixed);
  check("реакция: тренировка не считается, ранние/пропуски/слишком быстрые отдельно", M.n === 34 && M.valid === 30 && M.early === 1 && M.miss === 2 && M.tooFast === 1 && !M.done, M);
  check("реакция: меньше 30 засчитанных — разброса нет", !L.rtSummary(Array(20).fill({ rt: 300 })).enough);
  const fp = L.rtForeperiods(7);
  check("реакция: паузы 1–3 с, детерминированы", fp.length === L.RT.N + L.RT.PRACTICE && fp.every((x) => x >= 1000 && x <= 3000) && JSON.stringify(fp) === JSON.stringify(L.rtForeperiods(7)));
  // Б11: интервалы
  const T1 = L.tpSummary(L.TP_TARGETS.map((t) => ({ target: t, produced: t * 0.5 })));
  const T2 = L.tpSummary(L.TP_TARGETS.map((t) => ({ target: t, produced: t * 2 })));
  const T3 = L.tpSummary(L.TP_TARGETS.map((t) => ({ target: t, produced: t })));
  check("интервалы: вдвое короче и вдвое дольше симметричны", T1.done && Math.abs(T1.gm - 0.5) < 1e-9 && Math.abs(T2.gm - 2) < 1e-9 && T1.dir === "fast" && T2.dir === "slow" && T3.dir === "ok" && T3.err === 0);
  check("интервалы: различие повторов считается", Math.abs(L.tpSummary([{ target: 10, produced: 8 }, { target: 10, produced: 12 }]).repeatDiff - 0.4) < 1e-9);
  // Б12: нагрузка
  const LT = L.loadTrials(3);
  const cnt = (f) => LT.filter(f).length;
  check("нагрузка: 32 попытки, 16/16, квадрат в половине каждого уровня, X и N поровну", LT.length === 32 && cnt((t) => t.load === "low") === 16 && cnt((t) => t.load === "low" && t.extra) === 8 && cnt((t) => t.load === "high" && t.extra) === 8 && cnt((t) => t.target === "X") === 16);
  check("нагрузка: при низкой нагрузке только «o», при высокой разные буквы без X и N", LT.every((t) => t.fill.length === 5 && (t.load === "low" ? t.fill.every((c) => c === "o") : new Set(t.fill).size === 5 && !t.fill.some((c) => c === "X" || c === "N"))));
  const typical = LT.map((t) => ({ ...t, ans: t.target, saw: t.extra && (t.load === "low" || t.target === "X") }));
  const LS = L.loadSummary(typical);
  check("нагрузка: падение обнаружения при высокой нагрузке считается", LS.done && LS.low.hit === 1 && LS.high.hit === 0.5 && Math.abs(LS.drop - 0.5) < 1e-9 && LS.low.fa === 0 && !LS.unreliable, LS);
  check("нагрузка: типичное падение — не «большой запас»", !LS.bigCapacity && !LS.lowMissed);
  const all = L.loadSummary(LT.map((t) => ({ ...t, ans: t.target, saw: t.extra })));
  check("нагрузка: замечает при любой нагрузке — «большой запас»", all.bigCapacity && all.drop === 0);
  const fa = L.loadSummary(LT.map((t) => ({ ...t, ans: t.target, saw: t.extra || (t.load === "high" && t.target === "X") })));
  check("нагрузка: ложные «видел» вычитаются из замеченных", Math.abs(fa.high.net - 0.5) < 1e-9 && !fa.bigCapacity, fa.high);
  check("нагрузка: не замечал и при лёгком поиске — сравнение не делается", L.loadSummary(LT.map((t) => ({ ...t, ans: t.target, saw: false }))).lowMissed);
  check("нагрузка: «вижу всегда» помечается как ненадёжное", L.loadSummary(LT.map((t) => ({ ...t, ans: t.target, saw: true }))).unreliable);
  // Б13: Навон
  const NT = L.navonTrials(11), real = NT.filter((t) => !t.practice);
  check("Навон: 2 блока по 16 и по 4 тренировочные, все 4 сочетания поровну", real.length === 32 && NT.length === 40 && ["global", "local"].every((b) => real.filter((t) => t.block === b).length === 16 && real.filter((t) => t.block === b && t.big === t.small).length === 8));
  const ans = real.map((t) => ({ ...t, ans: t.block === "global" ? t.big : t.small, rt: (t.block === "global" ? 500 : 600) + (t.big !== t.small ? 50 : 0) }));
  const NS = L.navonSummary(ans);
  check("Навон: глобальное преимущество и интерференция", NS.enough && NS.globalAdv === 100 && NS.global.interf === 50 && NS.local.interf === 50 && NS.global.acc === 1, NS);
  check("Навон: много ошибок — ненадёжно", !L.navonSummary(real.map((t) => ({ ...t, ans: "Н", rt: 500 }))).enough);
  check("Навон: формы букв 5×7", Object.values(L.NAVON_SHAPES).every((g) => g.length === 7 && g.every((r) => r.length === 5)));
  // ничего из этого не трогает баллы
  const S = ND.sampleResponses(), E1 = JSON.stringify(ND.scoring.evaluate(S)), SL = ND.sampleLab();
  check("пример: все четыре задания пройдены", L.rtSummary(SL.rt).enough && L.tpSummary(SL.tp).done && L.loadSummary(SL.load).done && L.navonSummary(SL.navon).enough);
  const C = ND.clinician.build(S, SL);
  check("задания попадают в отчёт специалиста внутри раздела лаборатории", /Простая реакция/.test(C.text) && /Отмеривание интервалов/.test(C.text) && /Перцептивная нагрузка/.test(C.text) && /Фигуры Навона/.test(C.text) && C.text.replace(/ЛАБОРАТОРИЯ[\s\S]*?\n\n/, "") === ND.clinician.build(S).text);
  check("задания не меняют evaluate", JSON.stringify(ND.scoring.evaluate(S)) === E1);
}

console.log(`\n${passed} проверок пройдено, ${failed} не пройдено`);
process.exit(failed ? 1 : 0);
