// Вымышленный профиль для демонстрации отчёта: взрослый с маскируемыми аутичными чертами и отдельными чертами СДВГ.
window.ND = window.ND || {};
ND.sampleResponses = function () {
  const R = {};
  const t = (nowI, nowF, childI, childF, extra) => ({ now: { I: nowI, F: nowF }, child: childI == null ? { unknown: true } : { I: childI, F: childF }, rt: 7000, ...extra });
  const set = (ids, fn) => ids.forEach((id, i) => (R[id] = fn(i)));
  set(["A1-1", "A1-2", "A1-3", "A1-4"], (i) => t([4, 3, 3, 3][i], "often", [4, 4, 3, 2][i], "always", { mask: 2, ctx: ["work", "strangers"], harm: 2 }));
  set(["A2-1", "A2-2", "A2-3", "A2-4"], (i) => t([3, 3, 2, 3][i], "often", [4, 3, 3, 4][i], "always", { mask: 2, ctx: ["work", "friends"] }));
  set(["A3-1", "A3-2", "A3-3", "A3-4"], (i) => t([3, 3, 4, 2][i], "often", [4, 4, 3, 2][i], "always", { mask: 1 }));
  R["R-1"] = t(1, null, 0, null);
  set(["B1-1", "B1-2", "B1-3"], (i) => t([3, 2, 1][i], "often", [4, 2, 2][i], "often", { mask: 2, ctx: ["alone"] }));
  set(["B2-1", "B2-2", "B2-3", "B2-4"], (i) => t([3, 4, 3, 2][i], "often", [4, 4, 3, 3][i], "always", { ctx: ["home", "work"] }));
  set(["B3-1", "B3-2", "B3-3"], (i) => t([4, 4, 3][i], "always", [4, 4, 4][i], "always"));
  R["R-2"] = t(1, null, 0, null);
  set(["B4-1", "B4-2", "B4-3", "B4-4", "B4-5", "B4-6"], (i) => t([4, 2, 3, 2, 3, 4][i], "always", [4, 2, 4, 3, null, 3][i], "often", { ctx: ["work", "strangers"], harm: 2 }));
  R["B4-1"].note = "В опенспейсе без шумоподавляющих наушников не могу работать.";
  set(["CM-1", "CM-2", "CM-3", "CM-4", "CM-5", "CM-6"], (i) => t([4, 3, 4, 4, 3, 3][i], "always", [2, 2, 1, 3, 2, 3][i], "often"));
  R["CM-4"].note = "После рабочего дня с созвонами нужно пару часов полной тишины.";
  set(["H1-a", "H1-b", "H1-c", "H1-d", "H1-e", "H1-f", "H1-g", "H1-h", "H1-i"], (i) =>
    t([2, 2, 2, 3, 2, 4, 1, 3, 2][i], ["some", "often", "some", "often", "often", "always", null, "often", "some"][i], [2, 3, 2, 3, 2, 3, 1, 3, 2][i], "often", { ctx: ["work", "home"] }));
  R["R-3"] = t(1, null, 1, null);
  set(["H2-a", "H2-b", "H2-c", "H2-d", "H2-e", "H2-f", "H2-g", "H2-h", "H2-i"], (i) =>
    t([3, 1, 2, 1, 0, 1, 1, 2, 1][i], ["often", null, "some", null, null, null, null, "some", null][i], [3, 2, 1, 1, 0, 1, 1, 2, 1][i], "some"));
  set(["F1", "F2", "F3", "F4", "F5"], (i) => ({ now: { D: [2, 1, 3, 2, 2][i] }, child: { D: [2, 1, 3, 1, 2][i] }, rt: 5000 }));
  R["BO-1"] = t(3, "some", 1, "rare", { note: "Два раза за последние 5 лет было выгорание на несколько месяцев." });
  set(["IM-1", "IM-2"], (i) => t([3, 3][i], "often", [3, 3][i], "often"));
  R["R-4"] = t(1, null, 0, null);
  set(["DT-1", "DT-2"], (i) => t([4, 3][i], "always", [4, 4][i], "always"));
  set(["MO-1"], () => t(2, "some", 3, "often"));
  set(["EX-1", "EX-2", "EX-3"], (i) => t([2, 4, 3][i], "often", [3, 4, 2][i], "often"));
  set(["DF-2", "DF-4", "DF-5", "DF-6"], (i) => t([1, 0, 0, 2][i], "often", [1, 0, 0, 1][i], "rare"));
  // PHQ-9 и GAD-7: только «последние 2 недели»
  [1, 1, 2, 2, 0, 1, 2, 1, 0, 1].forEach((v, i) => (R[i < 9 ? `PHQ-${i + 1}` : "PHQ-F"] = { now: { I: v }, rt: 3000 }));
  [2, 2, 2, 2, 1, 1, 1, 1].forEach((v, i) => (R[i < 7 ? `GAD-${i + 1}` : "GAD-F"] = { now: { I: v }, rt: 3000 }));
  // PAQ: ответ 0–6 (балл 1–7); ABSI: вход «да», затем 0–6 (выше — тяжелее)
  [5, 5, 3, 3, 4, 2, 5, 5, 2, 3, 3, 3, 5, 5, 4, 3, 3, 2, 5, 5, 1, 3, 3, 1].forEach((v, i) => (R[`PAQ-${i + 1}`] = { now: { I: v }, rt: 3000 }));
  R["ABSI-0"] = { now: { I: 0 }, rt: 3000 };
  // сопутствующие состояния: 0 — да, 1 — нет
  [0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1].forEach((v, i) => (R[`CO-${i + 1}`] = { now: { I: v }, rt: 2000 }));
  [6, 5, 5, 6, 6, 5, 6, 5, 3, 3, 2, 4, 1, 4, 5, 6, 4, 5, 4, 5].forEach((v, i) => (R[`ABSI-${i + 1}`] = { now: { I: v }, rt: 3000 }));
  set(["ST-1", "ST-2", "ST-3", "ST-4", "ST-5", "ST-6", "ST-7", "ST-8", "ST-9", "ST-10", "ST-11"], (i) =>
    t([4, 4, 3, 3, 3, 4, 3, 2, 1, 1, 3][i], "often", [4, 3, 3, 4, 2, 3, null, 2, 1, 1, 2][i], "often"));
  // обратные вопросы: зеркально к своей паре
  ND.ITEMS.forEach((it) => {
    if (!it.rev || R[it.id] || !R[it.pair]) return;
    const m = (p) => (p && p.I != null ? { I: 4 - p.I } : { unknown: true });
    R[it.id] = { now: m(R[it.pair].now), child: m(R[it.pair].child), rt: 6000 };
  });
  // уточняющие вопросы: ответ чуть слабее основного вопроса группы
  ND.ITEMS.forEach((it, k) => {
    if (!it.fu || R[it.id] || !ND.eligible(it, R)) return;
    const base = ND.ITEMS.find((x) => !x.fu && !x.rev && ND.groupOf(x) === ND.groupOf(it));
    const b = JSON.parse(JSON.stringify(R[base.id]));
    const d = k % 3 === 0 ? 1 : 0;
    b.now.I = Math.max(0, b.now.I - d);
    if (b.child && b.child.I != null) b.child.I = Math.max(0, b.child.I - (k % 2));
    delete b.note;
    R[it.id] = b;
  });
  for (const id of ND.NO_CHILD) if (R[id]) delete R[id].child;
  return R;
};
