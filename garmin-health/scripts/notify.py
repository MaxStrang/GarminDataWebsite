"""Push-notiser via ntfy.sh (gratis app för iOS/Android). Reglerna är enkla att ändra här."""
import os
from datetime import datetime, timedelta

import requests

TOPIC = os.environ.get("NTFY_TOPIC")  # hemligt, långt namn, t.ex. "slyfe-halsa-8f3k2x9q"

TYPE_SV = {
    "running": "löpning", "trail_running": "trailrunning", "treadmill_running": "löpband",
    "cycling": "cykling", "indoor_cycling": "inomhuscykling", "walking": "promenad",
    "hiking": "vandring", "strength_training": "styrketräning", "lap_swimming": "simning",
    "golf": "golf", "yoga": "yoga", "skating_ws": "skridskor", "inline_skating": "inlines",
    "cross_country_skiing_ws": "längdskidor", "resort_skiing_snowboarding_ws": "utförsåkning",
    "indoor_rowing": "roddmaskin", "hiit": "HIIT", "cardio": "konditionsträning",
}


def send(title: str, msg: str, tags: str = "", priority: str = "default"):
    print(f"NOTIS: {title} – {msg}")
    if not TOPIC:
        return
    try:
        requests.post(
            f"https://ntfy.sh/{TOPIC}",
            data=msg.encode("utf-8"),
            headers={"Title": title.encode("utf-8"), "Tags": tags, "Priority": priority},
            timeout=10,
        )
    except Exception as e:
        print(f"ntfy misslyckades: {e}")


def fmt_h(sec):
    sec = int(sec or 0)
    return f"{sec // 3600}h {sec % 3600 // 60:02d}m"


def week_summary(data, now):
    monday = (now - timedelta(days=now.weekday())).date().isoformat()
    week = [a for a in data["activities"] if (a["start"] or "")[:10] >= monday]
    km = sum(a["distanceKm"] or 0 for a in week)
    mins = sum(a["durationMin"] or 0 for a in week)
    text = f"Veckan hittills: {len(week)} pass, {mins:.0f} min"
    return text + (f", {km:.1f} km." if km >= 1 else ".")


def run(data, new_acts, now: datetime):
    st = data["state"]
    notified = set(st.get("notified", []))
    today = now.date().isoformat()
    day = data["days"].get(today, {})

    # 1) Ny aktivitet -> beröm
    for a in new_acts:
        if a["id"] in notified:
            continue
        typ = TYPE_SV.get(a["type"], a["type"].replace("_", " "))
        parts = [f"{a['durationMin']:.0f} min {typ}"]
        if a["distanceKm"] > 0.2:
            parts.append(f"{a['distanceKm']:.1f} km")
        if a.get("avgHR"):
            parts.append(f"snittpuls {a['avgHR']:.0f}")
        send("Snyggt jobbat! 💪", ", ".join(parts) + ". " + week_summary(data, now), "muscle")
        notified.add(a["id"])
    st["notified"] = sorted(notified)[-500:]

    # 2) Morgonrapport (en gång per dag, efter 07:00 när sömndatan finns)
    if 7 <= now.hour < 12 and st.get("lastMorning") != today and day.get("sleepSec"):
        score, rd = day.get("sleepScore"), day.get("readiness")
        msg = f"Du sov {fmt_h(day['sleepSec'])}" + (f" (score {score})" if score else "") + "."
        if rd is not None:
            if rd >= 70:
                msg += f" Readiness {rd} – bra dag för ett tufft pass! 🔥"
            elif rd >= 40:
                msg += f" Readiness {rd} – kör lugnt till medel."
            else:
                msg += f" Readiness {rd} – vila eller lätt rörelse idag."
        send("God morgon ☀️", msg, "sunrise")
        st["lastMorning"] = today

    # 3) Kvällspush (en gång per dag efter 19:00)
    if now.hour >= 19 and st.get("lastEvening") != today:
        steps, goal = day.get("steps") or 0, day.get("stepGoal") or 10000
        last = max((a["start"] or "" for a in data["activities"]), default="")
        days_since = (now.date() - datetime.fromisoformat(last[:10]).date()).days if last else 99
        if steps < goal:
            send("Lite kvar! 🚶", f"{goal - steps:,} steg kvar till målet. En kvällspromenad fixar det.".replace(",", " "), "walking")
        elif days_since >= 3:
            send("Dags att röra på sig?", f"{days_since} dagar sedan senaste passet. Ett kort pass imorgon?", "alarm_clock")
        st["lastEvening"] = today
