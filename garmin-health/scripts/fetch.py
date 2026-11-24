"""Hämtar Garmin-data, sparar krypterat i docs/data.enc och skickar push-notiser.

Körs av GitHub Actions (se .github/workflows/update.yml) men går lika bra att köra lokalt:
    SITE_PASSWORD=... python scripts/fetch.py
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from garminconnect import Garmin

sys.path.insert(0, str(Path(__file__).parent))
from crypto_util import load_encrypted, save_encrypted  # noqa: E402
import notify  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
STORE = Path(os.environ.get("STORE_DIR", ROOT / "store"))  # = grenen "data" i GitHub
DATA_FILE = STORE / "data.enc"
TOKEN_FILE_ENC = STORE / "tokens.enc"
TOKEN_DIR = Path.home() / ".garminconnect"
TZ = ZoneInfo("Europe/Stockholm")

PASSWORD = os.environ["SITE_PASSWORD"]
BACKFILL_DAYS = int(os.environ.get("BACKFILL_DAYS", "90"))  # första körningen
REFRESH_DAYS = int(os.environ.get("REFRESH_DAYS") or 3)  # dagar som hämtas om varje körning


# ---------- inloggning ----------

def token_sources():
    """Först de förnyade tokens som sparats krypterat i repot, sedan GitHub-secret GARMIN_TOKENS."""
    if TOKEN_FILE_ENC.exists():
        yield "repo", json.dumps(load_encrypted(str(TOKEN_FILE_ENC), PASSWORD, {}))
    if os.environ.get("GARMIN_TOKENS"):
        yield "secret", os.environ["GARMIN_TOKENS"]


def login() -> Garmin:
    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    token_file = TOKEN_DIR / "garmin_tokens.json"
    sources = list(token_sources()) or [("lokal", None)]  # lokalt: använd ~/.garminconnect som den är
    for name, content in sources:
        if content:
            token_file.write_text(content)
        # E-post/lösenord är valfri reserv om tokens slutat gälla (fungerar inte med MFA).
        g = Garmin(os.environ.get("GARMIN_EMAIL") or None, os.environ.get("GARMIN_PASSWORD") or None)
        try:
            g.login(str(TOKEN_DIR))  # förnyar tokens automatiskt och sparar dem i TOKEN_DIR
            print(f"Inloggad (tokens från {name}).")
            return g
        except Exception as e:
            print(f"Inloggning med tokens från {name} misslyckades: {e}")
    raise SystemExit("Ingen giltig inloggning. Kör scripts/login_local.py och uppdatera GARMIN_TOKENS.")


def persist_tokens():
    """Spara (eventuellt förnyade) tokens krypterat i repot så nästa körning får färska."""
    token_file = TOKEN_DIR / "garmin_tokens.json"
    if not token_file.exists():
        return
    tokens = json.loads(token_file.read_text())
    old = load_encrypted(str(TOKEN_FILE_ENC), PASSWORD, None)
    if tokens != old:
        save_encrypted(str(TOKEN_FILE_ENC), tokens, PASSWORD)
        print("Tokens uppdaterade.")


# ---------- hämtning ----------

def safe(fn, *args):
    try:
        return fn(*args)
    except Exception as e:
        print(f"  {fn.__name__}{args}: {e}")
        return None


def fetch_day(g: Garmin, d: str) -> dict:
    day = {}
    s = safe(g.get_stats, d) or {}
    day.update(
        steps=s.get("totalSteps"),
        stepGoal=s.get("dailyStepGoal"),
        restingHR=s.get("restingHeartRate"),
        stress=s.get("averageStressLevel"),
        bbHigh=s.get("bodyBatteryHighestValue"),
        bbLow=s.get("bodyBatteryLowestValue"),
        calories=s.get("totalKilocalories"),
        activeCalories=s.get("activeKilocalories"),
        intensityMin=(s.get("moderateIntensityMinutes") or 0) + 2 * (s.get("vigorousIntensityMinutes") or 0),
        floors=s.get("floorsAscended"),
    )

    sl = (safe(g.get_sleep_data, d) or {}).get("dailySleepDTO") or {}
    scores = sl.get("sleepScores") or {}

    def local_ts(ms):  # Garmins "Local"-tidsstämplar är lokal klocktid uttryckt som epoch-ms
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M") if ms else None

    day.update(
        sleepStart=local_ts(sl.get("sleepStartTimestampLocal")),
        sleepEnd=local_ts(sl.get("sleepEndTimestampLocal")),
        sleepSec=sl.get("sleepTimeSeconds"),
        deepSec=sl.get("deepSleepSeconds"),
        lightSec=sl.get("lightSleepSeconds"),
        remSec=sl.get("remSleepSeconds"),
        awakeSec=sl.get("awakeSleepSeconds"),
        sleepScore=(scores.get("overall") or {}).get("value"),
    )

    hrv = (safe(g.get_hrv_data, d) or {}).get("hrvSummary") or {}
    day.update(hrv=hrv.get("lastNightAvg"), hrvStatus=hrv.get("status"))

    tr = safe(g.get_training_readiness, d)
    if isinstance(tr, list):
        tr = tr[0] if tr else None
    day["readiness"] = (tr or {}).get("score")

    return {k: v for k, v in day.items() if v is not None}


def fetch_activities(g: Garmin, limit: int) -> list:
    out = []
    for a in safe(g.get_activities, 0, limit) or []:
        out.append({
            "id": a.get("activityId"),
            "name": a.get("activityName"),
            "type": (a.get("activityType") or {}).get("typeKey", "other"),
            "start": a.get("startTimeLocal"),
            "distanceKm": round((a.get("distance") or 0) / 1000, 2),
            "durationMin": round((a.get("duration") or 0) / 60, 1),
            "avgHR": a.get("averageHR"),
            "maxHR": a.get("maxHR"),
            "calories": a.get("calories"),
            "elevation": a.get("elevationGain"),
            "trainingLoad": a.get("activityTrainingLoad"),
            "vo2max": a.get("vO2MaxValue"),
            "aerobicTE": a.get("aerobicTrainingEffect"),
            "anaerobicTE": a.get("anaerobicTrainingEffect"),
            "zones": [round((a.get(f"hrTimeInZone_{z}") or 0) / 60, 1) for z in range(1, 6)],
        })
    return out


# ---------- main ----------

def snapshot(data) -> str:
    return json.dumps({k: v for k, v in data.items() if k != "updated"}, sort_keys=True)


def main():
    data = load_encrypted(str(DATA_FILE), PASSWORD, None)
    first_run = data is None
    data = data or {"days": {}, "activities": [], "state": {}}
    before = snapshot(data)

    g = login()
    today = datetime.now(TZ).date()
    n_days = BACKFILL_DAYS if first_run else REFRESH_DAYS
    for i in range(n_days):
        d = (today - timedelta(days=i)).isoformat()
        print(f"Hämtar {d}")
        day = fetch_day(g, d)
        if day:
            data["days"][d] = day

    acts = {a["id"]: a for a in data["activities"]}
    new_acts = []
    # 100 senaste hämtas varje gång (ett enda anrop) så att nya fält fylls i även för äldre pass
    for a in fetch_activities(g, 300 if first_run else 100):
        if a["id"] not in acts:
            new_acts.append(a)
        acts[a["id"]] = a
    data["activities"] = sorted(acts.values(), key=lambda a: a["start"] or "", reverse=True)

    if first_run:  # spamma inte notiser för gammal historik
        data["state"]["notified"] = [a["id"] for a in data["activities"]]
    else:
        notify.run(data, new_acts, datetime.now(TZ))

    persist_tokens()

    # Token som låter sidans "Uppdatera nu"-knapp starta en körning. Ligger krypterad i data.enc.
    if os.environ.get("DISPATCH_TOKEN"):
        data["dispatch"] = {"token": os.environ["DISPATCH_TOKEN"], "repo": os.environ.get("GITHUB_REPOSITORY", "")}
    else:
        data.pop("dispatch", None)

    if os.environ.get("TEST_NOTIFY") == "true":
        notify.send("Testnotis 🔔", "Det fungerar! Här kommer dina hälsonotiser.", "bell")

    if first_run or snapshot(data) != before:
        data["updated"] = datetime.now(TZ).isoformat(timespec="minutes")
        save_encrypted(str(DATA_FILE), data, PASSWORD)
        print("Data sparad.")
    else:
        print("Ingen förändring.")


if __name__ == "__main__":
    main()
