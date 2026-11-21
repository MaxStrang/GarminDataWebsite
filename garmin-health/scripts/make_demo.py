"""Skapar påhittad demodata i store/data.enc (lösenord: demo) för att testa sidan lokalt.

    python scripts/make_demo.py
    cp store/data.enc docs/ && python -m http.server -d docs 8000   # öppna http://localhost:8000
"""
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from crypto_util import save_encrypted  # noqa: E402

random.seed(1)
today = date.today()
days, acts = {}, []
for i in range(120):
    d = today - timedelta(days=i)
    sleep = random.randint(6 * 3600, 8 * 3600 + 1800)
    deep = int(sleep * random.uniform(.14, .22)); rem = int(sleep * random.uniform(.18, .25))
    days[d.isoformat()] = dict(
        steps=random.randint(4000, 15000), stepGoal=10000, restingHR=random.randint(48, 56),
        stress=random.randint(20, 45), bbHigh=random.randint(65, 100), bbLow=random.randint(5, 35),
        intensityMin=random.choice([0, 10, 25, 45, 70]), sleepSec=sleep, deepSec=deep, remSec=rem,
        lightSec=sleep - deep - rem, awakeSec=random.randint(300, 2400), sleepScore=random.randint(60, 92),
        hrv=random.randint(45, 75), hrvStatus="BALANCED", readiness=random.randint(30, 95),
    )
    if random.random() < .5:
        typ = random.choice(["running", "running", "cycling", "strength_training", "walking", "golf"])
        dur = random.randint(25, 90)
        acts.append(dict(id=10_000 + i, name=f"Stockholm {typ}", type=typ,
                         start=f"{d.isoformat()} 07:{random.randint(10, 59)}:00",
                         distanceKm=0 if typ == "strength_training" else round(dur / random.uniform(4.5, 6.5), 2),
                         durationMin=dur, avgHR=random.randint(110, 160), calories=dur * 9))

save_encrypted(str(Path(__file__).resolve().parent.parent / "store" / "data.enc"),
               {"days": days, "activities": acts, "state": {},
                "updated": datetime.now().isoformat(timespec="minutes")}, "demo")
print("Skapade store/data.enc (lösenord: demo)")
