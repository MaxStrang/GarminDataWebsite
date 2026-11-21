// ---------- Dekryptering (samma format som scripts/crypto_util.py) ----------
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

// ---------- Hjälpare ----------
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const C = {};
const H = (sec) => (sec || 0) / 3600;
const fmtH = (sec) => { sec = Math.round(sec || 0); return `${Math.floor(sec / 3600)}h ${String(Math.floor(sec % 3600 / 60)).padStart(2, "0")}m`; };
const nf = new Intl.NumberFormat("sv-SE");
const short = (iso) => new Date(iso + "T12:00").toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
const TYPE_SV = {
  running: "Löpning", trail_running: "Trail", treadmill_running: "Löpband", cycling: "Cykling",
  indoor_cycling: "Inomhuscykel", walking: "Promenad", hiking: "Vandring", strength_training: "Styrka",
  lap_swimming: "Simning", golf: "Golf", yoga: "Yoga",
};
const typeName = (t) => TYPE_SV[t] || (t || "Övrigt").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function mondayOf(iso) {
  const d = new Date(iso.slice(0, 10) + "T12:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// ---------- Diagram ----------
let DATA = null;
let DAYS = 30;
const charts = {};

function setupChartDefaults() {
  ["--surface-1", "--grid", "--text-primary", "--text-secondary", "--text-muted",
   "--series-1", "--series-2", "--series-3", "--series-4"].forEach((v) => (C[v] = css(v)));
  Chart.defaults.color = C["--text-muted"];
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 11;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation = false;
  Chart.defaults.interaction = { mode: "index", intersect: false };
  Chart.defaults.plugins.legend.display = false;
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: "#0d0d0c", titleColor: C["--text-primary"], bodyColor: C["--text-secondary"],
    borderColor: C["--grid"], borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
  });
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.elements.line.tension = 0.3;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.point.hoverRadius = 5;
  Chart.defaults.elements.point.hitRadius = 10;
  Chart.defaults.elements.bar.borderRadius = 4;
  Chart.defaults.elements.bar.borderSkipped = "start";
}

const axes = (extra = {}) => ({
  x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 }, ...extra.x },
  y: { grid: { color: C["--grid"] }, border: { display: false }, beginAtZero: true, ...extra.y },
});

function draw(id, config) {
  charts[id]?.destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}

function lineDs(label, data, color) {
  return { type: "line", label, data, borderColor: color, backgroundColor: color, spanGaps: true };
}

function render() {
  const allDays = Object.keys(DATA.days).sort();
  const days = allDays.slice(-DAYS);
  const D = days.map((d) => DATA.days[d]);
  const labels = days.map(short);
  const pick = (k, f = (x) => x) => D.map((d) => (d[k] == null ? null : f(d[k])));

  // Steg + mål (mål ritas som streckad linje på samma axel)
  draw("cSteps", {
    type: "bar",
    data: { labels, datasets: [
      { label: "Steg", data: pick("steps"), backgroundColor: C["--series-1"], maxBarThickness: 18 },
      { ...lineDs("Mål", pick("stepGoal"), C["--text-muted"]), borderDash: [4, 4], borderWidth: 1.5, tension: 0 },
    ] },
    options: { scales: axes() },
  });

  draw("cIntensity", {
    type: "bar",
    data: { labels, datasets: [{ label: "Intensitetsminuter", data: pick("intensityMin"), backgroundColor: C["--series-1"], maxBarThickness: 18 }] },
    options: { scales: axes() },
  });

  // Sömnfaser staplade (2px mellanrum mellan segment)
  const phase = (label, key, color) => ({
    label, data: pick(key, (s) => +H(s).toFixed(2)), backgroundColor: color,
    borderColor: C["--surface-1"], borderWidth: { top: 2 }, borderRadius: 0, maxBarThickness: 18, stack: "s",
  });
  draw("cSleep", {
    type: "bar",
    data: { labels, datasets: [
      phase("Djup", "deepSec", C["--series-1"]),
      phase("Lätt", "lightSec", C["--series-2"]),
      phase("REM", "remSec", C["--series-3"]),
      { ...phase("Vaken", "awakeSec", C["--series-4"]), borderRadius: { topLeft: 4, topRight: 4 } },
    ] },
    options: {
      scales: { ...axes(), x: { ...axes().x, stacked: true }, y: { ...axes().y, stacked: true } },
      plugins: {
        legend: { display: true, position: "top", align: "start", labels: { boxWidth: 10, boxHeight: 10, color: C["--text-secondary"] } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtH(c.raw * 3600)}` } },
      },
    },
  });

  draw("cSleepScore", {
    type: "line",
    data: { labels, datasets: [lineDs("Sömnpoäng", pick("sleepScore"), C["--series-1"])] },
    options: { scales: axes({ y: { beginAtZero: false, suggestedMin: 40, suggestedMax: 100 } }) },
  });

  draw("cRHR", {
    type: "line",
    data: { labels, datasets: [lineDs("Vilopuls", pick("restingHR"), C["--series-1"])] },
    options: { scales: axes({ y: { beginAtZero: false } }) },
  });

  draw("cHRV", {
    type: "line",
    data: { labels, datasets: [lineDs("HRV", pick("hrv"), C["--series-1"])] },
    options: { scales: axes({ y: { beginAtZero: false } }) },
  });

  // Body Battery som flytande staplar (lägsta -> högsta)
  draw("cBB", {
    type: "bar",
    data: { labels, datasets: [{
      label: "Body Battery",
      data: D.map((d) => (d.bbLow != null && d.bbHigh != null ? [d.bbLow, d.bbHigh] : null)),
      backgroundColor: C["--series-1"], borderSkipped: false, maxBarThickness: 14,
    }] },
    options: {
      scales: axes({ y: { max: 100 } }),
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.raw[0]} → ${c.raw[1]}` } } },
    },
  });

  draw("cStress", {
    type: "line",
    data: { labels, datasets: [lineDs("Stress", pick("stress"), C["--series-1"])] },
    options: { scales: axes({ y: { suggestedMax: 60 } }) },
  });

  renderTraining(days[0]);
  renderTiles(allDays);
  renderActivities();
}

// Träningstid per vecka, staplat per aktivitetstyp (3 vanligaste + Övrigt, fast färgordning)
function renderTraining(fromDay) {
  const from = mondayOf(fromDay || "2000-01-01");
  const acts = DATA.activities.filter((a) => a.start && a.start.slice(0, 10) >= from);
  const totals = {};
  acts.forEach((a) => (totals[a.type] = (totals[a.type] || 0) + a.durationMin));
  const top = Object.keys(totals).sort((a, b) => totals[b] - totals[a]).slice(0, 3);
  const groupOf = (t) => (top.includes(t) ? t : "_other");
  const groups = [...top, ...(Object.keys(totals).some((t) => !top.includes(t)) ? ["_other"] : [])];

  const weeks = [];
  for (let d = new Date(from + "T12:00"); d <= new Date(); d.setDate(d.getDate() + 7)) weeks.push(d.toISOString().slice(0, 10));
  const matrix = Object.fromEntries(groups.map((g) => [g, weeks.map(() => 0)]));
  acts.forEach((a) => {
    const i = weeks.indexOf(mondayOf(a.start));
    if (i >= 0) matrix[groupOf(a.type)][i] += a.durationMin;
  });
  const colors = [C["--series-1"], C["--series-2"], C["--series-3"], C["--series-4"]];

  draw("cTraining", {
    type: "bar",
    data: {
      labels: weeks.map((w) => "v. " + short(w)),
      datasets: groups.map((g, i) => ({
        label: g === "_other" ? "Övrigt" : typeName(g),
        data: matrix[g].map((m) => Math.round(m)),
        backgroundColor: colors[i], borderColor: C["--surface-1"], borderWidth: { top: 2 },
        borderRadius: 0, maxBarThickness: 36, stack: "t",
      })),
    },
    options: {
      scales: { ...axes(), x: { ...axes().x, stacked: true }, y: { ...axes().y, stacked: true } },
      plugins: {
        legend: { display: groups.length > 1, position: "top", align: "start", labels: { boxWidth: 10, boxHeight: 10, color: C["--text-secondary"] } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw} min`, footer: (items) => `Totalt: ${items.reduce((s, i) => s + i.raw, 0)} min` } },
      },
    },
  });
}

function avg(arr) { const v = arr.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }

function renderTiles(allDays) {
  const last = allDays[allDays.length - 1];
  const t = DATA.days[last] || {};
  const prev7 = allDays.slice(-8, -1).map((d) => DATA.days[d]);
  const lastSleep = [...allDays].reverse().map((d) => DATA.days[d]).find((d) => d.sleepSec) || {};
  const delta = (val, base, unit, lowerIsBetter = false) => {
    if (val == null || base == null) return "";
    const diff = Math.round(val - base);
    if (diff === 0) return "samma som 7-dagarssnittet";
    const better = lowerIsBetter ? diff < 0 : diff > 0;
    return `${diff > 0 ? "+" : ""}${diff} ${unit} mot 7 d snitt ${better ? "▲" : "▼"}`;
  };
  const steps = t.steps || 0, goal = t.stepGoal || 10000;
  const tiles = [
    { label: "Steg idag", value: nf.format(steps), sub: `mål ${nf.format(goal)}`, bar: Math.min(1, steps / goal) },
    { label: "Sömn i natt", value: lastSleep.sleepSec ? fmtH(lastSleep.sleepSec) : "–", sub: lastSleep.sleepScore ? `poäng ${lastSleep.sleepScore}` : "" },
    { label: "Vilopuls", value: t.restingHR ?? "–", unit: "bpm", sub: delta(t.restingHR, avg(prev7.map((d) => d.restingHR)), "bpm", true) },
    { label: "HRV", value: lastSleep.hrv ?? t.hrv ?? "–", unit: "ms", sub: (t.hrvStatus || "").toLowerCase() },
    { label: "Body Battery", value: t.bbHigh ?? "–", sub: t.bbLow != null ? `lägst ${t.bbLow} idag` : "" },
    { label: "Training readiness", value: t.readiness ?? "–", sub: t.readiness == null ? "" : t.readiness >= 70 ? "redo för hårt pass" : t.readiness >= 40 ? "måttlig" : "vila" },
  ];
  document.getElementById("tiles").innerHTML = tiles.map((x) => `
    <div class="tile">
      <div class="label">${x.label}</div>
      <div class="value">${x.value}${x.unit && x.value !== "–" ? `<small>${x.unit}</small>` : ""}</div>
      ${x.sub ? `<div class="sub">${x.sub}</div>` : ""}
      ${x.bar != null ? `<div class="bar"><i style="width:${x.bar * 100}%"></i></div>` : ""}
    </div>`).join("");
}

function renderActivities() {
  const rows = DATA.activities.slice(0, 25).map((a) => `
    <tr>
      <td>${new Date(a.start.replace(" ", "T")).toLocaleString("sv-SE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
      <td>${a.name || typeName(a.type)}</td>
      <td class="num">${a.distanceKm > 0.1 ? a.distanceKm.toFixed(1) + " km" : "–"}</td>
      <td class="num">${Math.floor(a.durationMin / 60) ? Math.floor(a.durationMin / 60) + "h " : ""}${Math.round(a.durationMin % 60)}m</td>
      <td class="num">${a.avgHR ? Math.round(a.avgHR) : "–"}</td>
      <td class="num">${a.calories ? Math.round(a.calories) : "–"}</td>
    </tr>`).join("");
  document.querySelector("#acts tbody").innerHTML = rows || `<tr><td colspan="6" class="muted">Inga aktiviteter ännu</td></tr>`;
}

// ---------- Start ----------
function show(data) {
  DATA = data;
  document.getElementById("lock").hidden = true;
  document.getElementById("app").hidden = false;
  document.getElementById("updated").textContent = "Uppdaterad " +
    new Date(data.updated).toLocaleString("sv-SE", { weekday: "long", hour: "2-digit", minute: "2-digit" });
  setupChartDefaults();
  render();
}

document.getElementById("lockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("lockErr");
  err.hidden = true;
  try {
    show(await unlock(document.getElementById("pw").value, document.getElementById("remember").checked));
  } catch {
    err.hidden = false;
  }
});

document.getElementById("range").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  document.querySelectorAll("#range button").forEach((x) => x.classList.toggle("on", x === b));
  DAYS = +b.dataset.days;
  render();
});

document.getElementById("logout").addEventListener("click", () => { store.clear(); location.reload(); });

(async () => {
  const saved = store.get();
  if (saved) {
    try { show(await unlock(saved, true)); } catch { store.clear(); }
  }
})();
