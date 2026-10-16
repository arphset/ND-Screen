// Проверки движка подсчёта ND-Screen. Запуск: node tests/scoring.test.js
const fs = require("fs");
const path = require("path");
global.window = global;
for (const f of ["items.js", "scoring.js", "sample.js"]) eval(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"));

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
  return { now: p(), child: rnd() < 0.1 ? { unknown: true } : p(), mask: pick([0, 0, 1, 2]), harm: pick([0, 1, 2, 3]), ctx: [pick(["home", "work", "friends"])], unsure: rnd() < 0.1, rt: 5000 };
}
function profile(lvlFn) { const R = {}; for (const it of ITEMS) R[it.id] = answer(it, lvlFn(it)); return R; }
const uniform = (l) => () => l;

// ── 3. Границы значений на случайных профилях ──
const okSt = new Set(Object.values(ND.ST));
const okLevel = new Set(["high", "partial", "subclinical", "none"]);
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
  check("«не уверен» расширяет интервал", u.lo < u.s && u.hi > u.s);
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
  check("5 ответов «совсем нет, но мешает сильно» → жёсткий флаг", ev(R2).validity.some((f) => f.code === "inner" && f.severity === "hard"), ev(R2).validity);

  const R3 = consistent();
  const one = ITEMS.find((x) => x.id === "A1-1"); R3[one.id].now = { I: 0 }; R3[one.id].harm = 3;
  check("одна такая ошибка → только мягкое предупреждение", !ev(R3).validity.some((f) => f.code === "inner" && f.severity === "hard"));
}

console.log(`\n${passed} проверок пройдено, ${failed} не пройдено`);
process.exit(failed ? 1 : 0);
