"use strict";
// =====================================================================
//  Maskotar och små animationer. Allt är ren SVG + CSS, inga bibliotek.
// =====================================================================
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Loggan: tre ringar med ett blinkande ansikte ----------
const LOGO_SVG = `
<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
  <circle class="r1" cx="32" cy="32" r="28"/>
  <circle class="r2" cx="32" cy="32" r="20.5"/>
  <circle class="r3" cx="32" cy="32" r="13"/>
  <g class="face">
    <ellipse class="eye eye-l" cx="28" cy="30" rx="1.9" ry="2.2"/>
    <ellipse class="eye eye-r" cx="36" cy="30" rx="1.9" ry="2.2"/>
    <path class="smile" d="M27.2 34.6 Q32 39 36.8 34.6"/>
  </g>
</svg>`;
document.querySelectorAll("[data-logo]").forEach((el) => (el.innerHTML = LOGO_SVG));

// ---------- Armhävningsgubben ----------
// Kroppen roterar kring fötterna, armarna böjs. SMIL fungerar i alla moderna webbläsare.
const PUSHUP_SVG = `
<svg viewBox="0 0 48 34" width="80" height="57" aria-hidden="true">
  <g stroke="#e9eef4" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <line x1="6" y1="32" x2="32.6" y2="23.3">
      <animate attributeName="x2" values="32.6;33.8;32.6" keyTimes="0;.45;1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>
      <animate attributeName="y2" values="23.3;28.6;23.3" keyTimes="0;.45;1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>
    </line>
    <polyline points="32.6,23.3 33,27.6 33,32">
      <animate attributeName="points" values="32.6,23.3 33,27.6 33,32;33.8,28.6 29.6,30.2 33,32;32.6,23.3 33,27.6 33,32" keyTimes="0;.45;1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>
    </polyline>
  </g>
  <circle r="3.3" cx="37.9" cy="21.6" fill="#f2b65c">
    <animate attributeName="cx" values="37.9;39.3;37.9" keyTimes="0;.45;1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>
    <animate attributeName="cy" values="21.6;27.9;21.6" keyTimes="0;.45;1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>
  </circle>
  <path d="M41 17 q1.2 2 0 3 q-1.2 -1 0 -3z" fill="#86b6ef" class="sweat"/>
</svg>`;

let pushupTimer = null;
function placePushupGuy(chart) {
  const host = chart.canvas.parentElement;
  let guy = host.querySelector(".pushup");
  if (!guy) {
    guy = document.createElement("div");
    guy.className = "pushup";
    guy.innerHTML = `<span class="reps" title="Armhävningar sedan du öppnade sidan">×<b>0</b></span>${PUSHUP_SVG}`;
    host.appendChild(guy);
    if (REDUCED) guy.querySelectorAll("animate").forEach((a) => a.remove());
    else {
      let n = 0;
      clearInterval(pushupTimer);
      pushupTimer = setInterval(() => { const b = document.querySelector(".pushup .reps b"); if (b) b.textContent = ++n; }, 1100);
    }
  }
  // Hitta veckan med högst total och ställ gubben på toppen av stapeln
  const metas = chart.data.datasets.map((_, i) => chart.getDatasetMeta(i)).filter((m) => !m.hidden && m.data.length);
  if (!metas.length) { guy.hidden = true; return; }
  const totals = chart.data.labels.map((_, i) => chart.data.datasets.reduce((s, d) => s + (d.data[i] || 0), 0));
  const best = totals.indexOf(Math.max(...totals));
  if (best < 0 || totals[best] <= 0) { guy.hidden = true; return; }
  const top = Math.min(...metas.map((m) => m.data[best].y));
  const x = metas[0].data[best].x;
  guy.hidden = false;
  // Marken i SVG:n ligger på y=32 av 34 -> 57 * 32/34 ≈ 54 px under SVG-toppen, plus räknaren ovanför
  const ground = guy.querySelector(".reps").offsetHeight + 54;
  guy.style.left = `${x - 42}px`;
  guy.style.top = `${top - ground + 1}px`;
}

// ---------- Professorn som räknar träningsåret ----------
const PROF_SVG = `
<svg viewBox="0 0 60 84" width="84" height="118" aria-hidden="true">
  <g class="legs" stroke="#2b3a52" stroke-width="4.5" stroke-linecap="round">
    <line class="leg leg-a" x1="27" y1="60" x2="27" y2="80"/>
    <line class="leg leg-b" x1="33" y1="60" x2="33" y2="80"/>
  </g>
  <path d="M19 40 q11 -6 22 0 l2 22 h-26z" fill="#8a6a4f"/>
  <path d="M27 38 l3 7 l3 -7" fill="#e9eef4"/>
  <path d="M29.2 41 l.8 6 l.8 -6z" fill="#d55181"/>
  <g class="arm-point" stroke="#8a6a4f" stroke-width="4" stroke-linecap="round">
    <line x1="41" y1="43" x2="50" y2="50"/>
    <line x1="50" y1="50" x2="58" y2="38" stroke="#c9a37a" stroke-width="1.6"/>
  </g>
  <g class="arm-thumb" stroke="#8a6a4f" stroke-width="4" stroke-linecap="round">
    <line x1="41" y1="43" x2="49" y2="34"/>
    <circle cx="50" cy="31" r="3.2" fill="#f2d2b6" stroke="none"/>
    <line x1="50.5" y1="28.5" x2="50.5" y2="24.5" stroke="#f2d2b6" stroke-width="2.4"/>
  </g>
  <line x1="19" y1="43" x2="15" y2="56" stroke="#8a6a4f" stroke-width="4" stroke-linecap="round"/>
  <circle cx="30" cy="26" r="11" fill="#f2d2b6"/>
  <path d="M19 24 q-4 -6 1 -9 q0 -6 6 -5 q4 -5 9 -1 q6 -2 7 4 q5 2 1 9 q-2 -5 -6 -6 q-6 2 -12 0 q-4 2 -6 8z" fill="#e9eef4"/>
  <g fill="none" stroke="#1b293b" stroke-width="1.3">
    <circle cx="26" cy="26" r="3.2"/><circle cx="34.5" cy="26" r="3.2"/><line x1="29.2" y1="26" x2="31.3" y2="26"/>
  </g>
  <g class="pupils" fill="#1b293b"><circle cx="26.6" cy="26.2" r="1.1"/><circle cx="35.1" cy="26.2" r="1.1"/></g>
  <g class="brows" stroke="#e9eef4" stroke-width="1.4" stroke-linecap="round">
    <path class="brow brow-l" d="M23.4 20.8 l5 .6"/><path class="brow brow-r" d="M31.8 21.4 l5 -1.6"/>
  </g>
  <g fill="none" stroke="#7a3b2e" stroke-width="1.5" stroke-linecap="round">
    <path class="m m-talk" d="M27 32 q3 3.4 6 0 q-3 1 -6 0z" fill="#7a3b2e"/>
    <path class="m m-smile" d="M26 31.4 q4.2 4.6 8.4 0"/>
    <path class="m m-grimace" d="M26 32.6 q1.4 -1.4 2.8 0 q1.4 1.4 2.8 0 q1.4 -1.4 2.8 0"/>
    <ellipse class="m m-wow" cx="30.2" cy="32.6" rx="2.1" ry="2.8" fill="#7a3b2e"/>
  </g>
</svg>`;

function startProfessor(stats) {
  const lane = document.getElementById("profLane");
  if (!lane) return;
  lane.innerHTML = `<div class="prof talk"><div class="bubble" aria-live="off"></div>${PROF_SVG}</div>`;
  const prof = lane.querySelector(".prof"), bubble = lane.querySelector(".bubble");
  const set = (cls, text) => { prof.className = "prof " + cls; bubble.textContent = text; };
  const fmt = (n) => new Intl.NumberFormat("sv-SE").format(n);

  if (REDUCED) {
    prof.style.left = "12px";
    set("thumb happy", `${fmt(stats.days)} träningsdagar på ett år. Godkänt!`);
    return;
  }

  const W = () => Math.max(0, lane.clientWidth - 90);
  let x = 0, dir = 1, phase = "count", t0 = performance.now(), raf;
  const SPEED = 70; // px per sekund

  // Sekvens: räkna dagar åt höger, jubla, grimasera åt timmarna, räkna timmar tillbaka, tumme upp
  const pauses = {
    days: [["thumb happy", () => `${fmt(stats.days)} träningsdagar! Imponerande.`, 2600],
           ["grimace", () => `Och ${fmt(stats.hours)} timmar... Det måste räknas om.`, 2400]],
    hours: [["thumb happy", () => `Jodå, ${fmt(stats.hours)} timmar. Siffrorna ljuger inte!`, 2600],
            ["smile", () => `Längsta svit: ${stats.streak} dagar i rad.`, 2400]],
  };
  let queue = [], pauseUntil = 0;
  let counting = "days";

  function frame(now) {
    const dt = Math.min(50, now - t0) / 1000; t0 = now;
    if (now < pauseUntil) { raf = requestAnimationFrame(frame); return; }
    if (queue.length) {
      const [cls, txt, ms] = queue.shift();
      set(cls, txt()); pauseUntil = now + ms;
      if (!queue.length) {             // vänd och börja räkna nästa sak
        dir = -dir; counting = counting === "days" ? "hours" : "days";
      }
      raf = requestAnimationFrame(frame); return;
    }
    x = Math.max(0, Math.min(W(), x + dir * SPEED * dt));
    const progress = dir > 0 ? x / (W() || 1) : 1 - x / (W() || 1);
    const target = counting === "days" ? stats.days : stats.hours;
    const label = counting === "days" ? "dagar" : "timmar";
    set("walk talk" + (dir < 0 ? " left" : ""), `${fmt(Math.round(target * progress))} ${label}...`);
    prof.style.transform = `translateX(${x}px)`;
    bubble.classList.toggle("bflip", x > W() - 190);
    if ((dir > 0 && x >= W()) || (dir < 0 && x <= 0)) queue = [...pauses[counting]];
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame((n) => { t0 = n; frame(n); });
  document.addEventListener("visibilitychange", () => { t0 = performance.now(); });
}

// ---------- Sovande måne vid sömnrubriken ----------
const MOON_SVG = `
<span class="moon" aria-hidden="true">
  <svg viewBox="0 0 40 40" width="40" height="40">
    <path d="M27 6 a15 15 0 1 0 7 22 a12 12 0 1 1 -7 -22z" fill="#f2b65c"/>
    <path d="M14 22 q2 2 4 0 M21 24 q2 2 4 0" stroke="#7a4f12" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M17 29 q2 1.4 4 0" stroke="#7a4f12" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  </svg>
  <i>z</i><i>z</i><i>z</i>
</span>`;
document.querySelectorAll("[data-moon]").forEach((el) => el.insertAdjacentHTML("beforeend", MOON_SVG));

// ---------- Räkna upp en siffra ----------
function countUp(el, to, ms = 900) {
  if (!el) return;
  if (REDUCED) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- "Ge mig beröm": professorn går runt och pekar på din data ----------
let touring = false, cancelTour = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function praiseTour(stops) {
  if (touring) return;
  touring = true; cancelTour = false;
  const lane = document.getElementById("profLane");
  lane?.classList.add("away");
  const prof = document.createElement("div");
  prof.className = "prof tour walk talk";
  prof.innerHTML = `<div class="bubble"></div>${PROF_SVG}`;
  document.body.appendChild(prof);
  const bubble = prof.querySelector(".bubble");
  const PW = 84, PH = 118;
  prof.style.left = "16px"; prof.style.top = `${innerHeight - PH - 16}px`;
  const stop = () => (cancelTour = true);
  const onKey = (e) => e.key === "Escape" && stop();
  setTimeout(() => document.addEventListener("click", stop, { once: true }), 50);
  document.addEventListener("keydown", onKey);

  function say(cls, text) {
    prof.className = "prof tour " + cls;
    bubble.textContent = text;
    const left = parseFloat(prof.style.left), top = parseFloat(prof.style.top);
    bubble.classList.toggle("bflip", left > innerWidth - 250);
    bubble.classList.toggle("bbelow", top < 150);
  }

  for (const s of stops) {
    if (cancelTour) break;
    const el = s.el && document.querySelector(s.el);
    if (el) {
      el.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
      await sleep(REDUCED ? 50 : 700);
      const r = el.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
      let left = r.left - PW - 4, flip = false;                  // helst till vänster, pekar höger
      if (left < 8) { left = r.right + 4; flip = true; }          // annars till höger, pekar vänster
      if (left + PW > vw - 8) { left = Math.max(8, Math.min(r.left + 8, vw - PW - 8)); flip = false; }
      const top = Math.max(64, Math.min(vh - PH - 8, r.top + r.height / 2 - PH / 2));
      say("walk talk" + (flip ? " left" : ""), "");
      prof.style.left = `${left}px`; prof.style.top = `${top}px`;
      await sleep(REDUCED ? 0 : 1150);
      if (cancelTour) break;
      el.classList.add("spot");
      say(s.mood + (flip ? " left" : ""), s.text);
      await sleep(s.ms || 3600);
      el.classList.remove("spot");
    } else {
      say(s.mood || "thumb happy", s.text);
      await sleep(s.ms || 3800);
    }
  }
  document.querySelectorAll(".spot").forEach((e) => e.classList.remove("spot"));
  document.removeEventListener("click", stop);
  document.removeEventListener("keydown", onKey);
  prof.remove();
  lane?.classList.remove("away");
  touring = false;
}
