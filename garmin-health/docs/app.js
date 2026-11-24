"use strict";
// =====================================================================
//  Dekryptering (samma format som scripts/crypto_util.py)
// =====================================================================
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function decrypt(blob, password) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64(blob.salt), iterations: blob.iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(blob.iv) }, key, b64(blob.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

const PW_KEY = "halsa-pw";
const store = {
  get: () => { try { return localStorage.getItem(PW_KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(PW_KEY, v); } catch {} },
  clear: () => { try { localStorage.removeItem(PW_KEY); } catch {} },
};

async function unlock(password, remember) {
  const res = await fetch("data.enc?t=" + Date.now());
  if (!res.ok) throw new Error("Ingen data");
  const data = await decrypt(await res.json(), password);
  if (remember) store.set(password);
  return data;
}

// =====================================================================
//  Hjälpare
// =====================================================================
const $ = (s) => document.querySelector(s);
const nf = new Intl.NumberFormat("sv-SE");
const nf1 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });
const iso = (d) => d.toLocaleDateString("sv-SE");                 // YYYY-MM-DD i lokal tid
const parse = (s) => new Date(s.slice(0, 10) + "T12:00");
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const short = (s) => parse(s).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
const fmtH = (sec) => { sec = Math.round(sec || 0); return `${Math.floor(sec / 3600)}h ${String(Math.floor(sec % 3600 / 60)).padStart(2, "0")}m`; };
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m` : `${Math.round(m)} min`);
const fmtPace = (p) => (p ? `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, "0")}` : "–");
const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
const clean = (a) => a.filter((x) => x != null && !Number.isNaN(x));
const mean = (a) => { a = clean(a); return a.length ? sum(a) / a.length : null; };
const median = (a) => { a = clean(a).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const sd = (a) => { a = clean(a); if (a.length < 2) return null; const m = mean(a); return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)); };
const mondayOf = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };

// Linjär regression över index (dagar) -> lutning per dag
function slope(values) {
  const pts = values.map((y, x) => [x, y]).filter((p) => p[1] != null);
  if (pts.length < 5) return null;
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  const num = sum(pts.map(([x, y]) => (x - mx) * (y - my)));
  const den = sum(pts.map(([x]) => (x - mx) ** 2));
  return den ? num / den : null;
}
function pearson(pairs) {
  pairs = pairs.filter(([x, y]) => x != null && y != null);
  if (pairs.length < 8) return null;
  const mx = mean(pairs.map((p) => p[0])), my = mean(pairs.map((p) => p[1]));
  const num = sum(pairs.map(([x, y]) => (x - mx) * (y - my)));
  const den = Math.sqrt(sum(pairs.map(([x]) => (x - mx) ** 2)) * sum(pairs.map(([, y]) => (y - my) ** 2)));
  return den ? num / den : null;
}
function describeR(r) {
  if (r == null) return "för lite data än";
  const a = Math.abs(r);
  const s = a < 0.1 ? "inget tydligt samband" : a < 0.3 ? "svagt" : a < 0.5 ? "måttligt" : "starkt";
  return `r = ${r.toFixed(2).replace(".", ",")}, ${s}${a >= 0.1 ? (r > 0 ? " positivt samband" : " negativt samband") : ""}`;
}
function movingAvg(arr, n = 7) {
  return arr.map((_, i) => { const w = clean(arr.slice(Math.max(0, i - n + 1), i + 1)); return w.length >= 3 ? +(sum(w) / w.length).toFixed(1) : null; });
}

const TYPE_SV = {
  running: "Löpning", trail_running: "Trailrunning", treadmill_running: "Löpband", cycling: "Cykling",
  indoor_cycling: "Inomhuscykel", road_biking: "Landsväg", mountain_biking: "MTB", walking: "Promenad",
  hiking: "Vandring", strength_training: "Styrka", lap_swimming: "Simning", open_water_swimming: "Utomhussim",
  golf: "Golf", yoga: "Yoga", cardio: "Kondition", hiit: "HIIT", indoor_rowing: "Roddmaskin",
  cross_country_skiing_ws: "Längdskidor", resort_skiing_snowboarding_ws: "Utförsåkning",
};
const typeName = (t) => TYPE_SV[t] || (t || "Övrigt").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const isRun = (a) => /running/.test(a.type || "");
const paceOf = (a) => (a.distanceKm >= 1 ? a.durationMin / a.distanceKm : null);

// =====================================================================
//  Tillstånd
// =====================================================================
let DATA = null;
let DAYS = 30;
const C = {};
const charts = {};
let TODAY = iso(new Date());
let HEAT = { days: 0, hours: 0, streak: 0 };
let BEST_WEEK = { label: "", min: 0 };

// Aktiviteter per dag
function actsByDay() {
  const m = {};
  for (const a of DATA.activities) {
    if (!a.start) continue;
    const d = a.start.slice(0, 10);
    (m[d] ||= { min: 0, km: 0, load: 0, n: 0, list: [] });
    m[d].min += a.durationMin || 0; m[d].km += a.distanceKm || 0;
    m[d].load += a.trainingLoad || 0; m[d].n++; m[d].list.push(a);
  }
  return m;
}
const actsBetween = (from, to) => DATA.activities.filter((a) => a.start && a.start.slice(0, 10) >= from && a.start.slice(0, 10) <= to);
function dayRange(n, end = TODAY) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i)); return out; }

// =====================================================================
//  Diagram-grund
// =====================================================================
function setupChartDefaults() {
  const cs = getComputedStyle(document.documentElement);
  ["--panel", "--line", "--ink", "--ink-2", "--muted", "--series-1", "--series-2", "--series-3", "--series-4", "--amber"]
    .forEach((v) => (C[v] = cs.getPropertyValue(v).trim()));
  Chart.defaults.color = C["--muted"];
  Chart.defaults.font.family = '"Instrument Sans", system-ui, sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation = false;
  Chart.defaults.interaction = { mode: "index", intersect: false };
  Chart.defaults.plugins.legend.display = false;
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: "#0a1019", titleColor: C["--ink"], bodyColor: C["--ink-2"], footerColor: C["--ink"],
    borderColor: C["--line"], borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
    titleFont: { weight: "600" },
  });
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.elements.line.tension = 0.3;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.point.hoverRadius = 5;
  Chart.defaults.elements.point.hitRadius = 10;
  Chart.defaults.elements.bar.borderRadius = 4;
  Chart.defaults.elements.bar.borderSkipped = "start";
}
const axes = (x = {}, y = {}) => ({
  x: { grid: { display: false }, border: { color: C["--line"] }, ticks: { maxRotation: 0, autoSkipPadding: 14 }, ...x },
  y: { grid: { color: "rgba(38,53,72,.7)" }, border: { display: false }, beginAtZero: true, ...y },
});
const legendTop = { display: true, position: "top", align: "start", labels: { boxWidth: 10, boxHeight: 10, color: "#b8c3d1", padding: 12 } };
function draw(id, config) { charts[id]?.destroy(); charts[id] = new Chart(document.getElementById(id), config); }
const line = (label, data, color, extra = {}) => ({ type: "line", label, data, borderColor: color, backgroundColor: color, spanGaps: true, ...extra });
const avgLine = (data) => line("7-dagarssnitt", movingAvg(data), C["--ink"], { borderWidth: 1.5, borderDash: [], tension: 0.4 });
const stackSeg = (label, data, color, extra = {}) => ({
  label, data, backgroundColor: color, borderColor: C["--panel"], borderWidth: { top: 2 }, borderRadius: 0, maxBarThickness: 28, stack: "s", ...extra,
});

// =====================================================================
//  Coach: beröm och iakttagelser baserade på datan
// =====================================================================
function weekStats() {
  const mon = mondayOf(TODAY);
  const lastMon = addDays(mon, -7);
  const thisW = actsBetween(mon, TODAY);
  const lastW = actsBetween(lastMon, addDays(mon, -1));
  return {
    mon, thisW, lastW,
    min: sum(thisW.map((a) => a.durationMin)), lastMin: sum(lastW.map((a) => a.durationMin)),
    km: sum(thisW.map((a) => a.distanceKm)),
    days: new Set(thisW.map((a) => a.start.slice(0, 10))).size,
  };
}

function stepStreak() {
  let streak = 0;
  const t = DATA.days[TODAY];
  let d = t && t.steps >= (t.stepGoal || 10000) ? TODAY : addDays(TODAY, -1);
  while (DATA.days[d] && DATA.days[d].steps >= (DATA.days[d].stepGoal || 10000)) { streak++; d = addDays(d, -1); }
  return streak;
}

function coachMessages() {
  const out = [];
  const w = weekStats();
  const days = (n, end = TODAY) => dayRange(n, end).map((d) => DATA.days[d] || {});

  if (w.min >= 150) out.push({ t: "Veckans 150 minuter är klara", d: `Det är WHO:s rekommendation, och du ligger redan på ${Math.round(w.min)}. Riktigt starkt jobbat!` });
  else if (w.min > 0) out.push({ t: `${Math.round(w.min)} minuter hittills`, d: `${Math.round(150 - w.min)} minuter kvar till veckans 150. Ett pass till så är du där.` });

  if (w.lastMin > 0 && w.min > w.lastMin) out.push({ t: `+${Math.round((w.min / w.lastMin - 1) * 100)} % mot förra veckan`, d: `Du har redan passerat förra veckans ${Math.round(w.lastMin)} minuter.` });

  const streak = stepStreak();
  if (streak >= 3) out.push({ t: `${streak} dagar i rad över stegmålet`, d: streak >= 7 ? "En hel vecka utan miss. Det är vana, inte tur." : "Håll i kedjan, den växer." });

  const s7 = mean(days(7).map((d) => d.sleepSec)), s30 = mean(days(30).map((d) => d.sleepSec));
  if (s7 && s30 && s7 - s30 > 600) out.push({ t: `${Math.round((s7 - s30) / 60)} min mer sömn per natt`, d: `Snittet för senaste veckan är ${fmtH(s7)}, jämfört med ${fmtH(s30)} över 30 dagar.` });

  const rhr = days(30).map((d) => d.restingHR), sl = slope(rhr);
  if (sl != null && sl * 30 <= -1) out.push({ t: `Vilopulsen ner ${nf1.format(-sl * 30)} slag`, d: "Trenden de senaste 30 dagarna pekar nedåt. Ett klassiskt tecken på bättre kondition." });

  const h7 = mean(days(7).map((d) => d.hrv)), h30 = mean(days(30).map((d) => d.hrv));
  if (h7 && h30 && h7 > h30 * 1.05) out.push({ t: `HRV ${Math.round((h7 / h30 - 1) * 100)} % över ditt snitt`, d: "Kroppen återhämtar sig bra just nu." });

  // Nya rekord senaste 7 dagarna
  const weekAgo = addDays(TODAY, -6);
  const runs = DATA.activities.filter(isRun);
  const longest = runs.reduce((b, a) => (a.distanceKm > (b?.distanceKm || 0) ? a : b), null);
  if (longest && longest.start.slice(0, 10) >= weekAgo) out.push({ t: "Nytt distansrekord!", d: `${nf1.format(longest.distanceKm)} km är ditt längsta löppass hittills.` });
  const fast = runs.filter((a) => a.distanceKm >= 3).reduce((b, a) => (!b || paceOf(a) < paceOf(b) ? a : b), null);
  if (fast && fast.start.slice(0, 10) >= weekAgo) out.push({ t: "Snabbaste tempot hittills", d: `${fmtPace(paceOf(fast))} min/km över ${nf1.format(fast.distanceKm)} km.` });
  const stepRec = Object.entries(DATA.days).reduce((b, e) => ((e[1].steps || 0) > (b?.[1].steps || 0) ? e : b), null);
  if (stepRec && stepRec[0] >= weekAgo) out.push({ t: "Rekorddag i steg", d: `${nf.format(stepRec[1].steps)} steg den ${short(stepRec[0])}, bästa dagen i historiken.` });

  const t = DATA.days[TODAY] || {};
  if (t.readiness >= 75) out.push({ t: `Readiness ${t.readiness}`, d: "Kroppen är redo. Bra dag att ta i ordentligt." });

  if (!out.length) out.push({ t: "Ny dag, nya möjligheter", d: "Varje promenad och varje pass räknas. Coachen är redo att heja så fort du rör dig." });
  return out.slice(0, 5);
}

function renderCoach() {
  const html = coachMessages().map((m) => `<li><b>${m.t}</b>${m.d}</li>`).join("");
  $("#coach").innerHTML = html;
  $("#coachMobile").innerHTML = html;
}

// =====================================================================
//  Hero: rubrik byggd av veckans data + ringar
// =====================================================================
function renderHero() {
  const h = new Date().getHours();
  const w = weekStats();
  $("#greet").textContent = (h < 10 ? "God morgon" : h < 18 ? "Hej" : "God kväll") + ", vecka " + isoWeek(TODAY);
  if (w.min > 0) {
    $("#headline").innerHTML = `Du har tränat <span class="n">0</span> minuter den här veckan.`;
    countUp($("#headline .n"), Math.round(w.min));
    const parts = [`${w.thisW.length} pass på ${w.days} ${w.days === 1 ? "dag" : "dagar"}`];
    if (w.km > 0.5) parts.push(`${nf1.format(w.km)} km`);
    let lede = parts.join(" och ") + ".";
    if (w.min >= 150) lede += " Över rekommendationen på 150 minuter. Riktigt starkt!";
    else if (w.lastMin) lede += ` Förra veckan landade på ${Math.round(w.lastMin)} minuter.`;
    $("#lede").textContent = lede;
  } else {
    $("#headline").textContent = "Ny vecka, blankt blad.";
    $("#lede").textContent = w.lastMin ? `Förra veckan blev det ${Math.round(w.lastMin)} minuter. Första passet sätter tonen.` : "Första passet sätter tonen.";
  }

  // Ringar: träning mot 150 min, stegsnitt mot mål, sömnsnitt mot 8 h (måndag till idag)
  const wd = dayRange(Math.max(1, (parse(TODAY).getDay() + 6) % 7 + 1)).map((d) => DATA.days[d] || {});
  const stepAvg = mean(wd.map((d) => d.steps)) || 0, goal = mean(wd.map((d) => d.stepGoal)) || 10000;
  const sleepAvg = mean(wd.map((d) => d.sleepSec)) || 0;
  const rings = [
    { label: "Träning", v: w.min / 150, txt: `${Math.round(w.min)} / 150 min`, c: C["--series-1"] },
    { label: "Steg, snitt", v: stepAvg / goal, txt: `${nf.format(Math.round(stepAvg))} / ${nf.format(Math.round(goal))}`, c: C["--series-2"] },
    { label: "Sömn, snitt", v: sleepAvg / (8 * 3600), txt: `${fmtH(sleepAvg)} / 8h`, c: C["--series-3"] },
  ];
  const R = [82, 64, 46], SW = 14;
  const svg = rings.map((r, i) => {
    const circ = 2 * Math.PI * R[i], frac = Math.min(r.v, 1);
    return `<circle cx="100" cy="100" r="${R[i]}" fill="none" stroke="${r.c}" stroke-opacity=".18" stroke-width="${SW}"/>
      <circle class="ring-arc" cx="100" cy="100" r="${R[i]}" fill="none" stroke="${r.c}" stroke-width="${SW}" stroke-linecap="round"
        stroke-dasharray="${circ}" style="--c:${circ};--off:${circ * (1 - frac)}" transform="rotate(-90 100 100)"><title>${r.label}: ${r.txt}</title></circle>`;
  }).join("");
  $("#rings").innerHTML = `<svg viewBox="0 0 200 200" role="img" aria-label="Veckans mål">${svg}</svg>
    <div class="ring-legend">${rings.map((r) => `<div><i style="background:${r.c}"></i><b>${Math.round(r.v * 100)} %</b><span>${r.label}: ${r.txt}</span></div>`).join("")}</div>`;
}
function isoWeek(s) {
  const d = parse(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

// =====================================================================
//  Dagens nyckeltal
// =====================================================================
function renderTiles() {
  const t = DATA.days[TODAY] || DATA.days[addDays(TODAY, -1)] || {};
  const prev7 = dayRange(7, addDays(TODAY, -1)).map((d) => DATA.days[d] || {});
  const vs = (val, base, unit) => {
    if (val == null || base == null) return "";
    const diff = Math.round(val - base);
    return diff === 0 ? "som veckosnittet" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)} ${unit} mot veckosnittet`;
  };
  const steps = t.steps || 0, goal = t.stepGoal || 10000;
  const tiles = [
    { label: "Steg idag", value: nf.format(steps), sub: steps >= goal ? "Målet klart!" : `${nf.format(goal - steps)} kvar till målet`, meter: steps / goal },
    { label: "Sömn i natt", value: t.sleepSec ? fmtH(t.sleepSec) : "–", sub: t.sleepScore ? `Poäng ${t.sleepScore}` : "" },
    { label: "Vilopuls", value: t.restingHR ?? "–", unit: "bpm", sub: vs(t.restingHR, mean(prev7.map((d) => d.restingHR)), "bpm") },
    { label: "HRV", value: t.hrv ?? "–", unit: "ms", sub: vs(t.hrv, mean(prev7.map((d) => d.hrv)), "ms") },
    { label: "Body Battery", value: t.bbHigh ?? "–", sub: t.bbLow != null ? `Lägst ${t.bbLow} idag` : "" },
    { label: "Readiness", value: t.readiness ?? "–", sub: t.readiness == null ? "" : t.readiness >= 70 ? "Redo för hårt pass" : t.readiness >= 40 ? "Lagom belastning" : "Prioritera vila" },
  ];
  $("#tiles").innerHTML = tiles.map((x) => `
    <div><div class="label">${x.label}</div>
      <div class="value">${x.value}${x.unit && x.value !== "–" ? `<small>${x.unit}</small>` : ""}</div>
      ${x.meter != null ? `<div class="meter"><i style="width:${Math.min(1, x.meter) * 100}%"></i></div>` : ""}
      <div class="sub">${x.sub}</div></div>`).join("");
}

// =====================================================================
//  Heatmap: träningsminuter per dag, 53 veckor
// =====================================================================
const HEAT_LEVELS = [[0, "Vila"], [1, "1–29 min"], [30, "30–59 min"], [60, "60–89 min"], [90, "90+ min"]];
function heatLevel(m) { return m >= 90 ? 4 : m >= 60 ? 3 : m >= 30 ? 2 : m > 0 ? 1 : 0; }

function renderHeat() {
  const by = actsByDay();
  const end = TODAY, start = addDays(mondayOf(end), -52 * 7);
  let html = "", d = start, active = 0, total = 0;
  while (d <= end) {
    const e = by[d], m = e?.min || 0;
    if (m > 0) { active++; total += m; }
    const tip = e ? `<b>${short(d)}</b><br>${e.list.map((a) => `${typeName(a.type)} ${fmtMin(a.durationMin)}`).join("<br>")}` : `<b>${short(d)}</b><br>Vilodag`;
    html += `<i data-l="${heatLevel(m)}" data-tip="${encodeURIComponent(tip)}"></i>`;
    d = addDays(d, 1);
  }
  // Fyll ut veckan så att rutnätet blir jämnt
  for (let i = (parse(end).getDay() + 6) % 7; i < 6; i++) html += `<i class="empty"></i>`;
  $("#heat").innerHTML = html;
  requestAnimationFrame(() => { const w = $(".heat-wrap"); w.scrollLeft = w.scrollWidth; });
  const colors = ["var(--panel-2)", "#184f95", "#256abf", "#3987e5", "#86b6ef"];
  $("#heatLegend").innerHTML = `
    <span class="scale">${HEAT_LEVELS.map((l, i) => `<i title="${l[1]}" style="background:${colors[i]}"></i>`).join("")}</span>
    <span>mörk = vila, ljus = 90+ min</span>
    <span><b>${active}</b> träningsdagar</span>
    <span><b>${nf.format(Math.round(total / 60))}</b> timmar totalt</span>
    <span>Längsta svit: <b>${longestStreak(by, start, end)}</b> dagar</span>`;
  HEAT = { days: active, hours: Math.round(total / 60), streak: longestStreak(by, start, end) };
  startProfessor(HEAT);
}
function longestStreak(by, start, end) {
  let best = 0, cur = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) { cur = by[d]?.min > 0 ? cur + 1 : 0; best = Math.max(best, cur); }
  return best;
}
function setupTooltip() {
  const tip = $("#tip");
  $("#heat").addEventListener("mousemove", (e) => {
    const t = e.target.dataset?.tip;
    if (!t) { tip.hidden = true; return; }
    tip.innerHTML = decodeURIComponent(t); tip.hidden = false;
    tip.style.left = Math.min(e.clientX + 12, innerWidth - 250) + "px"; tip.style.top = e.clientY + 12 + "px";
  });
  $("#heat").addEventListener("mouseleave", () => (tip.hidden = true));
}

// =====================================================================
//  Diagram för vald period
// =====================================================================
function renderCharts() {
  const days = dayRange(DAYS);
  const D = days.map((d) => DATA.days[d] || {});
  const labels = days.map(short);
  const pick = (k, f = (x) => x) => D.map((d) => (d[k] == null ? null : f(d[k])));
  const from = days[0];
  const bar = { maxBarThickness: 18 };

  // --- Träning per vecka per typ (3 vanligaste + Övrigt) ---
  const weeks = [];
  for (let w = mondayOf(from); w <= TODAY; w = addDays(w, 7)) weeks.push(w);
  const acts = actsBetween(weeks[0], TODAY);
  const totals = {};
  acts.forEach((a) => (totals[a.type] = (totals[a.type] || 0) + a.durationMin));
  const top = Object.keys(totals).sort((a, b) => totals[b] - totals[a]).slice(0, 3);
  const groups = [...top, ...(Object.keys(totals).some((t) => !top.includes(t)) ? ["_other"] : [])];
  const M = Object.fromEntries(groups.map((g) => [g, weeks.map(() => 0)]));
  const Z = [0, 1, 2, 3, 4].map(() => weeks.map(() => 0));
  acts.forEach((a) => {
    const i = weeks.indexOf(mondayOf(a.start));
    if (i < 0) return;
    M[top.includes(a.type) ? a.type : "_other"][i] += a.durationMin;
    (a.zones || []).forEach((z, k) => (Z[k][i] += z || 0));
  });
  const colors = [C["--series-1"], C["--series-2"], C["--series-3"], C["--series-4"]];
  const wLabels = weeks.map((w) => "v" + isoWeek(w));
  draw("cTraining", {
    type: "bar",
    data: { labels: wLabels, datasets: groups.map((g, i) => stackSeg(g === "_other" ? "Övrigt" : typeName(g), M[g].map(Math.round), colors[i])) },
    options: {
      scales: { ...axes({ stacked: true }, { stacked: true }) },
      plugins: { legend: { ...legendTop, display: groups.length > 1 }, tooltip: { callbacks: {
        title: (it) => `Vecka ${wLabels[it[0].dataIndex].slice(1)}, från ${short(weeks[it[0].dataIndex])}`,
        label: (c) => ` ${c.dataset.label}: ${fmtMin(c.raw)}`,
        footer: (it) => `Totalt ${fmtMin(sum(it.map((i) => i.raw)))}`,
      } } },
      onResize: (ch) => requestAnimationFrame(() => placePushupGuy(ch)),
    },
  });
  requestAnimationFrame(() => placePushupGuy(charts.cTraining));
  BEST_WEEK = (() => { const t = weeks.map((_, i) => sum(groups.map((g) => M[g][i]))); const i = t.indexOf(Math.max(...t)); return { label: wLabels[i], min: t[i] || 0 }; })();

  // --- Pulszoner (ordinal blå skala, zon 5 ljusast) ---
  const zc = ["#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"];
  const hasZones = Z.some((z) => z.some((v) => v > 0));
  draw("cZones", {
    type: "bar",
    data: { labels: wLabels, datasets: hasZones ? Z.map((z, k) => stackSeg(`Zon ${k + 1}`, z.map(Math.round), zc[k])) : [] },
    options: { scales: axes({ stacked: true }, { stacked: true }), plugins: { legend: { ...legendTop, display: hasZones },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw} min` } } } },
  });

  // --- Löptempo ---
  const runs = actsBetween(from, TODAY).filter((a) => isRun(a) && paceOf(a)).reverse();
  draw("cPace", {
    type: "line",
    data: { labels: runs.map((a) => short(a.start)), datasets: [
      line("Tempo", runs.map((a) => +paceOf(a).toFixed(2)), C["--series-1"], { pointRadius: 4, pointBackgroundColor: C["--series-1"], pointBorderColor: C["--panel"], pointBorderWidth: 2, tension: 0 }),
    ] },
    options: {
      scales: axes({}, { reverse: true, beginAtZero: false, ticks: { callback: (v) => fmtPace(v) } }),
      plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtPace(c.raw)} min/km, ${nf1.format(runs[c.dataIndex].distanceKm)} km` } } },
    },
  });

  // --- Steg ---
  draw("cSteps", {
    type: "bar",
    data: { labels, datasets: [
      { label: "Steg", data: pick("steps"), backgroundColor: C["--series-1"], ...bar },
      avgLine(pick("steps")),
      line("Mål", pick("stepGoal"), C["--muted"], { borderDash: [4, 4], borderWidth: 1.5, tension: 0 }),
    ] },
    options: { scales: axes(), plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw == null ? "–" : nf.format(Math.round(c.raw))}` } } } },
  });

  // --- VO2max ---
  const vo = actsBetween(from, TODAY).filter((a) => a.vo2max).reverse();
  draw("cVo2", {
    type: "line",
    data: { labels: vo.map((a) => short(a.start)), datasets: [line("VO2max", vo.map((a) => a.vo2max), C["--series-1"], { tension: 0, stepped: "before" })] },
    options: { scales: axes({}, { beginAtZero: false, suggestedMin: Math.min(...vo.map((a) => a.vo2max), 50) - 2 }) },
  });

  // --- Sömnfaser ---
  const ph = (label, key, color, extra) => stackSeg(label, pick(key, (s) => +(s / 3600).toFixed(2)), color, { maxBarThickness: 18, ...extra });
  draw("cSleep", {
    type: "bar",
    data: { labels, datasets: [
      ph("Djup", "deepSec", C["--series-1"]), ph("Lätt", "lightSec", C["--series-2"]),
      ph("REM", "remSec", C["--series-3"]), ph("Vaken", "awakeSec", C["--series-4"], { borderRadius: { topLeft: 4, topRight: 4 } }),
    ] },
    options: { scales: axes({ stacked: true }, { stacked: true }), plugins: { legend: legendTop,
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtH(c.raw * 3600)}`, footer: (it) => `Sömn: ${fmtH(sum(it.slice(0, 3).map((i) => i.raw)) * 3600)}` } } } },
  });

  // --- Sovtider (timmar efter 18:00 så att natten blir sammanhängande) ---
  const hrs = (s) => { if (!s) return null; const [h, m] = s.slice(11, 16).split(":").map(Number); let v = h + m / 60; if (v < 18) v += 24; return +v.toFixed(2); };
  const clock = (v) => `${String(Math.floor(v % 24)).padStart(2, "0")}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}`;
  draw("cSchedule", {
    type: "bar",
    data: { labels, datasets: [{
      label: "Sömn", data: D.map((d) => (d.sleepStart && d.sleepEnd ? [hrs(d.sleepStart), hrs(d.sleepEnd)] : null)),
      backgroundColor: C["--series-3"], borderSkipped: false, maxBarThickness: 14,
    }] },
    options: {
      scales: axes({}, { reverse: true, beginAtZero: false, ticks: { callback: clock, stepSize: 2 } }),
      plugins: { tooltip: { callbacks: { label: (c) => ` ${clock(c.raw[0])} till ${clock(c.raw[1])}` } } },
    },
  });

  draw("cSleepScore", {
    type: "bar",
    data: { labels, datasets: [{ label: "Sömnpoäng", data: pick("sleepScore"), backgroundColor: "rgba(57,135,229,.35)", ...bar }, avgLine(pick("sleepScore"))] },
    options: { scales: axes({}, { beginAtZero: false, suggestedMin: 40, max: 100 }) },
  });

  // Sömnstatistik
  const bed = clean(D.map((d) => hrs(d.sleepStart))), wake = clean(D.map((d) => hrs(d.sleepEnd)));
  const sleepSec = clean(pick("sleepSec"));
  const deepShare = mean(D.map((d) => (d.sleepSec ? d.deepSec / d.sleepSec : null)));
  const remShare = mean(D.map((d) => (d.sleepSec ? d.remSec / d.sleepSec : null)));
  $("#sleepStats").innerHTML = `
    <div><div class="k">Snitt per natt</div><div class="v">${fmtH(mean(sleepSec))}</div><div class="d">median ${fmtH(median(sleepSec))}</div></div>
    <div><div class="k">Sömnskuld mot 8 h</div><div class="v">${fmtH(Math.max(0, sleepSec.length * 8 * 3600 - sum(sleepSec)))}</div><div class="d">över ${sleepSec.length} nätter</div></div>
    <div><div class="k">Läggdags, snitt</div><div class="v">${bed.length ? clock(mean(bed)) : "–"}</div><div class="d">spridning ±${bed.length > 1 ? Math.round(sd(bed) * 60) : "–"} min</div></div>
    <div><div class="k">Uppvaknande, snitt</div><div class="v">${wake.length ? clock(mean(wake)) : "–"}</div><div class="d">spridning ±${wake.length > 1 ? Math.round(sd(wake) * 60) : "–"} min</div></div>
    <div><div class="k">Andel djupsömn</div><div class="v">${deepShare != null ? Math.round(deepShare * 100) + " %" : "–"}</div><div class="d">vanligt intervall 13–23 %</div></div>
    <div><div class="k">Andel REM</div><div class="v">${remShare != null ? Math.round(remShare * 100) + " %" : "–"}</div><div class="d">vanligt intervall 20–25 %</div></div>`;

  // --- Återhämtning ---
  const recov = (id, key, label, color) => draw(id, {
    type: "line",
    data: { labels, datasets: [line(label, pick(key), color, { borderWidth: 1.5, borderColor: "rgba(57,135,229,.55)", pointRadius: DAYS <= 30 ? 2.5 : 0 }), avgLine(pick(key))] },
    options: { scales: axes({}, { beginAtZero: false }) },
  });
  recov("cRHR", "restingHR", "Vilopuls", C["--series-1"]);
  recov("cHRV", "hrv", "HRV", C["--series-1"]);
  draw("cBB", {
    type: "bar",
    data: { labels, datasets: [{ label: "Body Battery", data: D.map((d) => (d.bbLow != null && d.bbHigh != null ? [d.bbLow, d.bbHigh] : null)), backgroundColor: C["--series-1"], borderSkipped: false, maxBarThickness: 14 }] },
    options: { scales: axes({}, { max: 100 }), plugins: { tooltip: { callbacks: { label: (c) => ` ${c.raw[0]} till ${c.raw[1]}` } } } },
  });
  draw("cStress", {
    type: "line",
    data: { labels, datasets: [line("Stress", pick("stress"), C["--series-1"], { fill: true, backgroundColor: "rgba(57,135,229,.12)" })] },
    options: { scales: axes({}, { suggestedMax: 60 }) },
  });

  renderNerd(days, D);
}

// =====================================================================
//  Nördhörnan
// =====================================================================
function renderNerd(days, D) {
  const pick = (k) => D.map((d) => d[k] ?? null);
  const rows = [
    ["Steg", pick("steps"), (v) => nf.format(Math.round(v)), 0],
    ["Sömn", pick("sleepSec").map((s) => (s == null ? null : s / 3600)), (v) => fmtH(v * 3600), (v) => `${Math.round(v * 60)} min`],
    ["Sömnpoäng", pick("sleepScore"), (v) => nf1.format(v), 1],
    ["Vilopuls", pick("restingHR"), (v) => nf1.format(v), 1],
    ["HRV", pick("hrv"), (v) => nf1.format(v), 1],
    ["Stress", pick("stress"), (v) => nf1.format(v), 1],
    ["Body Battery, max", pick("bbHigh"), (v) => nf1.format(v), 1],
    ["Readiness", pick("readiness"), (v) => nf1.format(v), 1],
    ["Intensitetsminuter", pick("intensityMin"), (v) => nf1.format(v), 1],
  ];
  $("#statsTable").innerHTML = `<thead><tr><th>Mått</th><th class="num">Snitt</th><th class="num">Median</th><th class="num">Std.avv.</th><th class="num">Min</th><th class="num">Max</th><th class="num">Trend per vecka</th><th class="num">Dagar</th></tr></thead><tbody>` +
    rows.map(([name, vals, f, ft]) => {
      ft = typeof ft === "function" ? ft : f;
      const v = clean(vals);
      if (!v.length) return "";
      const s = slope(vals);
      const tr = s == null ? "–" : `${s * 7 > 0 ? "▲ +" : s * 7 < 0 ? "▼ −" : ""}${ft(Math.abs(s * 7))}`;
      return `<tr><td class="metric">${name}</td><td class="num">${f(mean(v))}</td><td class="num">${f(median(v))}</td><td class="num">${v.length > 1 ? f(sd(v)) : "–"}</td><td class="num">${f(Math.min(...v))}</td><td class="num">${f(Math.max(...v))}</td><td class="num trend">${tr}</td><td class="num">${v.length}</td></tr>`;
    }).join("") + "</tbody>";

  renderAcwr();

  // Steg per veckodag
  const wdNames = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
  const wd = wdNames.map(() => []);
  days.forEach((d, i) => { if (D[i].steps != null) wd[(parse(d).getDay() + 6) % 7].push(D[i].steps); });
  draw("cWeekday", {
    type: "bar",
    data: { labels: wdNames, datasets: [{ label: "Snitt steg", data: wd.map((a) => (a.length ? Math.round(mean(a)) : null)), backgroundColor: C["--series-1"], maxBarThickness: 36 }] },
    options: { scales: axes(), plugins: { tooltip: { callbacks: { label: (c) => ` ${nf.format(c.raw)} steg i snitt (${wd[c.dataIndex].length} dagar)` } } } },
  });

  // Korrelationer
  const scatter = (id, rId, pairs, xl, yl, xf = (v) => v) => {
    pairs = pairs.filter(([x, y]) => x != null && y != null);
    $(rId).textContent = describeR(pearson(pairs));
    draw(id, {
      type: "scatter",
      data: { datasets: [{ label: `${xl} / ${yl}`, data: pairs.map(([x, y]) => ({ x, y })), backgroundColor: "rgba(57,135,229,.75)", borderColor: C["--panel"], borderWidth: 1.5, pointRadius: 5, pointHoverRadius: 7 }] },
      options: {
        interaction: { mode: "nearest", intersect: true },
        scales: { x: { ...axes().y, beginAtZero: false, title: { display: true, text: xl }, ticks: { callback: xf } }, y: { ...axes().y, beginAtZero: false, title: { display: true, text: yl } } },
        plugins: { tooltip: { callbacks: { label: (c) => ` ${xl}: ${xf(c.raw.x)}, ${yl}: ${c.raw.y}` } } },
      },
    });
  };
  scatter("cCorr1", "#r1", D.map((d) => [d.sleepSec ? +(d.sleepSec / 3600).toFixed(2) : null, d.hrv ?? null]), "Sömn (h)", "HRV (ms)", (v) => nf1.format(v));
  scatter("cCorr2", "#r2", D.map((d) => [d.sleepScore ?? null, d.bbHigh ?? null]), "Sömnpoäng", "Body Battery max");
}

// Akut/kronisk belastningskvot (ACWR): senaste 7 dagarna mot snittvecka senaste 28
function renderAcwr() {
  const useLoad = DATA.activities.some((a) => a.trainingLoad);
  const val = (a) => (useLoad ? a.trainingLoad || 0 : a.durationMin || 0);
  const acute = sum(actsBetween(addDays(TODAY, -6), TODAY).map(val));
  const chronic = sum(actsBetween(addDays(TODAY, -27), TODAY).map(val)) / 4;
  const r = chronic ? acute / chronic : null;
  const zone = r == null ? ["För lite data", "Behöver några veckors träning."]
    : r < 0.8 ? ["Lägre än vanligt", "Du tränar mindre än de senaste veckorna. Bra för återhämtning, men konditionen kan sjunka om det fortsätter."]
    : r <= 1.3 ? ["Optimal zon", "Belastningen ökar i lagom takt. Det är här formen byggs med låg skaderisk."]
    : r <= 1.5 ? ["Hög", "Du har ökat snabbt. Lägg in en lugnare dag snart."]
    : ["Mycket hög", "Kraftig ökning mot din vana. Skaderisken stiger, så prioritera vila."];
  const pos = r == null ? 0 : Math.min(r, 2) / 2 * 100;
  $("#acwr").innerHTML = `
    <figcaption>Belastningskvot <span>akut/kronisk, ${useLoad ? "Garmin training load" : "träningsminuter"}</span></figcaption>
    <div class="big">${r == null ? "–" : r.toFixed(2).replace(".", ",")}</div>
    <div class="zone">${zone[0]}</div>
    <div class="gauge-wrap">
      <div class="gauge">
        <span style="width:40%;background:#1c5cab"></span><span style="width:25%;background:${C["--series-3"]}"></span>
        <span style="width:10%;background:${C["--series-4"]}"></span><span style="width:25%;background:${C["--series-2"]}"></span>
      </div>
      <div class="needle" style="left:${pos}%"></div>
    </div>
    <div class="ticks"><span>0</span><span>0,8</span><span>1,3</span><span>1,5</span><span>2+</span></div>
    <p>${zone[1]} Senaste 7 dagarna: ${nf.format(Math.round(acute))}, snittvecka: ${nf.format(Math.round(chronic))}.</p>`;
}

function renderRecords() {
  const A = DATA.activities, runs = A.filter(isRun);
  const best = (arr, f) => arr.reduce((b, x) => (f(x) != null && (b == null || f(x) > f(b)) ? x : b), null);
  const longRun = best(runs, (a) => a.distanceKm);
  const fastRun = runs.filter((a) => a.distanceKm >= 3).reduce((b, a) => (!b || paceOf(a) < paceOf(b) ? a : b), null);
  const longAct = best(A, (a) => a.durationMin);
  const stepDay = Object.entries(DATA.days).reduce((b, e) => ((e[1].steps || 0) > (b?.[1].steps || 0) ? e : b), null);
  const sleepBest = Object.entries(DATA.days).reduce((b, e) => ((e[1].sleepScore || 0) > (b?.[1].sleepScore || 0) ? e : b), null);
  const hrvBest = Object.entries(DATA.days).reduce((b, e) => ((e[1].hrv || 0) > (b?.[1].hrv || 0) ? e : b), null);
  const rhrLow = Object.entries(DATA.days).filter((e) => e[1].restingHR).reduce((b, e) => (!b || e[1].restingHR < b[1].restingHR ? e : b), null);
  const vo2 = best(A, (a) => a.vo2max);

  const year = TODAY.slice(0, 4), month = TODAY.slice(0, 7);
  const yearActs = A.filter((a) => a.start?.startsWith(year)), monthActs = A.filter((a) => a.start?.startsWith(month));
  const yearKm = sum(yearActs.map((a) => a.distanceKm));
  const beats = sum(monthActs.map((a) => (a.avgHR || 0) * (a.durationMin || 0)));
  const kcal = sum(monthActs.map((a) => a.calories));
  const yearSteps = sum(Object.entries(DATA.days).filter(([d]) => d.startsWith(year)).map(([, v]) => v.steps));

  const R = [
    longRun && ["Längsta löppass", `${nf1.format(longRun.distanceKm)} km`, short(longRun.start)],
    fastRun && ["Snabbaste tempo (minst 3 km)", `${fmtPace(paceOf(fastRun))} /km`, `${nf1.format(fastRun.distanceKm)} km, ${short(fastRun.start)}`],
    longAct && ["Längsta passet", fmtMin(longAct.durationMin), `${typeName(longAct.type)}, ${short(longAct.start)}`],
    stepDay && ["Flest steg på en dag", nf.format(stepDay[1].steps), short(stepDay[0])],
    sleepBest && ["Bästa sömnpoäng", sleepBest[1].sleepScore, short(sleepBest[0])],
    rhrLow && ["Lägsta vilopuls", `${rhrLow[1].restingHR} bpm`, short(rhrLow[0])],
    hrvBest && ["Högsta HRV", `${hrvBest[1].hrv} ms`, short(hrvBest[0])],
    vo2 && ["Högsta VO2max", vo2.vo2max, short(vo2.start)],
    ["Distans i år", `${nf.format(Math.round(yearKm))} km`, `${Math.round(yearKm / 1572 * 100)} % av Sverige på längden (1 572 km)`],
    ["Hjärtslag under träning", nf.format(Math.round(beats)), "den här månaden, snittpuls gånger tid"],
    ["Förbränt på passen", `${nf.format(Math.round(kcal))} kcal`, `ungefär ${nf.format(Math.round(kcal / 280))} kanelbullar den här månaden`],
    ["Steg i år", nf.format(yearSteps), `ungefär ${nf.format(Math.round(yearSteps * 0.75 / 1000))} km till fots`],
  ].filter(Boolean);
  $("#records").innerHTML = R.map(([k, v, d], i) => `<div data-rec="${i}" data-key="${k}"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join("");
}

// =====================================================================
//  Aktivitetstabell
// =====================================================================
function renderActivities() {
  const zc = ["#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"];
  const rows = DATA.activities.slice(0, 30).map((a) => {
    const zt = sum(a.zones || []);
    const zbar = zt ? `<div class="zbar" title="${(a.zones || []).map((z, i) => `Zon ${i + 1}: ${Math.round(z)} min`).join(", ")}">${a.zones.map((z, i) => `<i style="width:${z / zt * 100}%;background:${zc[i]}"></i>`).join("")}</div>` : "–";
    return `<tr>
      <td>${new Date(a.start.replace(" ", "T")).toLocaleString("sv-SE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
      <td>${a.name || typeName(a.type)}</td>
      <td class="num">${a.distanceKm > 0.1 ? nf1.format(a.distanceKm) + " km" : "–"}</td>
      <td class="num">${fmtMin(a.durationMin)}</td>
      <td class="num">${isRun(a) && paceOf(a) ? fmtPace(paceOf(a)) : "–"}</td>
      <td class="num">${a.avgHR ? Math.round(a.avgHR) : "–"}</td>
      <td class="num">${a.trainingLoad ? Math.round(a.trainingLoad) : "–"}</td>
      <td>${zbar}</td></tr>`;
  }).join("");
  $("#acts tbody").innerHTML = rows || `<tr><td colspan="8" class="muted">Inga aktiviteter än. De dyker upp här efter nästa synk.</td></tr>`;
}

// =====================================================================
//  Professorns rundtur: komplimanger byggda av riktig data
// =====================================================================
function buildPraiseStops() {
  const w = weekStats(), stops = [];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  if (w.min > 0) stops.push({ el: "#headline", mood: "wow", text: pick([
    `${Math.round(w.min)} minuter på en vecka! Det är ${Math.round(w.min / 150 * 100)} % av WHO:s rekommendation.`,
    `Titta här: ${Math.round(w.min)} minuter. Jag har kontrollräknat två gånger.`,
  ]) });
  const streak = stepStreak(), t = DATA.days[TODAY] || {};
  stops.push({ el: "#tiles > div:first-child", mood: streak >= 2 ? "wow" : "smile", text: streak >= 2
    ? `${streak} dagar i rad över stegmålet. Konsekvens är den vackraste konstanten.`
    : `${nf.format(t.steps || 0)} steg idag. Varje steg är en datapunkt i rätt riktning.` });
  if (HEAT.days) stops.push({ el: "#heat", mood: "grimace", text: pick([
    `${HEAT.days} träningsdagar på ett år. Det är ${Math.round(HEAT.days / 365 * 100)} % av alla dagar. Jag blir nästan rörd.`,
    `${HEAT.hours} timmar träning. Det är ${nf1.format(HEAT.hours / 24)} dygn i sträck. Galet!`,
  ]) });
  if (BEST_WEEK.min > 0) stops.push({ el: "#cTraining", mood: "wow", text:
    `Bästa veckan i perioden: ${fmtMin(BEST_WEEK.min)}. Till och med armhävningsgubben är imponerad.` });
  const run = DATA.activities.filter(isRun).reduce((b, a) => (a.distanceKm > (b?.distanceKm || 0) ? a : b), null);
  if (run) stops.push({ el: '[data-key="Längsta löppass"]', mood: "grimace", text:
    `${nf1.format(run.distanceKm)} km i ett svep. Det är ${Math.round(run.distanceKm / 42.195 * 100)} % av ett maraton!` });
  const rhr = dayRange(30).map((d) => DATA.days[d]?.restingHR ?? null), sl = slope(rhr);
  if (sl != null && sl < 0) stops.push({ el: "#cRHR", mood: "smile", text:
    `Vilopulsen lutar nedåt, ${nf1.format(-sl * 7)} slag per vecka. Hjärtat jobbar smartare, inte hårdare.` });
  stops.push({ mood: "thumb happy", text: pick([
    "Slutsats: du är statistiskt signifikant grym. p < 0,001.",
    "Jag har granskat datan. Inga avvikelser, bara framsteg. Fortsätt så!",
    "Min analys är klar: formen pekar uppåt. Tummen upp!",
  ]) });
  return stops;
}

// =====================================================================
//  Navigering: markera aktiv sektion
// =====================================================================
function setupNav() {
  const links = [...document.querySelectorAll("#nav a")];
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) links.forEach((l) => l.classList.toggle("on", l.getAttribute("href") === "#" + e.target.id));
    });
  }, { rootMargin: "-30% 0px -60% 0px" });
  document.querySelectorAll("main .sec").forEach((s) => obs.observe(s));
}

// =====================================================================
//  Start
// =====================================================================
function show(data) {
  DATA = data;
  const keys = Object.keys(DATA.days).sort();
  if (keys.length && keys[keys.length - 1] < TODAY) TODAY = keys[keys.length - 1] > addDays(TODAY, -2) ? TODAY : keys[keys.length - 1];
  $("#lock").hidden = true;
  $("#app").hidden = false;
  const stamp = data.updated ? "Uppdaterad " + new Date(data.updated).toLocaleString("sv-SE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "";
  $("#updated").textContent = stamp;
  $("#updatedTop").textContent = stamp;
  setupChartDefaults();
  renderHero(); renderCoach(); renderTiles(); renderHeat(); renderRecords(); renderActivities();
  renderCharts();
  setupTooltip(); setupNav();
  document.querySelectorAll("[data-praise]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); praiseTour(buildPraiseStops()); }));
}

$("#lockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#lockErr").hidden = true;
  try { show(await unlock($("#pw").value, $("#remember").checked)); }
  catch { $("#lockErr").hidden = false; }
});

$("#range").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  document.querySelectorAll("#range button").forEach((x) => x.classList.toggle("on", x === b));
  DAYS = +b.dataset.days;
  renderCharts();
});

$("#logout").addEventListener("click", () => { store.clear(); location.reload(); });

(async () => {
  const saved = store.get();
  if (saved) { try { show(await unlock(saved, true)); } catch { store.clear(); } }
})();
