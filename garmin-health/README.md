# Hälsa – min Garmin-dashboard

Hemsida med grafer över träning, sömn och hälsa från Garmin Connect, plus push-notiser till mobilen.

```
GitHub Actions (varje timme 06–23)
  └─ scripts/fetch.py ── hämtar från Garmin Connect
        ├─ krypterar allt → grenen "data" (store/data.enc)
        ├─ scripts/notify.py → push via ntfy.sh
        └─ publicerar docs/ + data.enc → GitHub Pages
Webbläsaren: docs/index.html laddar data.enc och dekrypterar med ditt lösenord
```

Datan är **AES-256-krypterad** innan den hamnar på GitHub, så repot och sidan kan vara publika utan att någon kan läsa din hälsodata. Lösenordet finns bara i GitHub Secrets och i ditt huvud.

## Kom igång (ca 15 min)

### 1. Skapa repot
1. Skapa ett nytt repo på GitHub, t.ex. `garmin-health` (publikt – gratis Pages).
2. Pusha den här mappen:
   ```bash
   git init -b main && git add . && git commit -m "Första versionen"
   git remote add origin https://github.com/<ditt-namn>/garmin-health.git
   git push -u origin main
   ```

### 2. Logga in mot Garmin (en gång, på din dator)
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt                      # kräver Python 3.12+
python scripts/login_local.py
```
Kopiera JSON-texten som skrivs ut.

### 3. Lägg in secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Namn | Värde |
|---|---|
| `SITE_PASSWORD` | Ett **starkt** lösenord (används för krypteringen och för att låsa upp sidan) |
| `GARMIN_TOKENS` | JSON-texten från steg 2 |
| `NTFY_TOPIC` | Ett långt, svårgissat namn, t.ex. `slyfe-halsa-8f3k2x9qz` |
| `GARMIN_EMAIL` / `GARMIN_PASSWORD` | *Valfritt* – reserv om tokens slutar gälla (fungerar inte om du har tvåstegsverifiering) |

### 4. Slå på GitHub Pages
Repo → **Settings → Pages → Source: GitHub Actions**.

### 5. Första körningen
**Actions → Uppdatera Garmin-data → Run workflow**. Första gången hämtas 90 dagar bakåt (ändra i fältet, max ~365). Sidan hamnar på `https://<ditt-namn>.github.io/garmin-health/`.

### 6. Push-notiser
Installera appen **ntfy** (iOS/Android), tryck **+** och prenumerera på samma namn som `NTFY_TOPIC`.

Du får:
- 💪 **Efter varje pass** – tid, distans, puls och veckans km
- ☀️ **Morgonrapport** (07–12) – sömn, sömnpoäng och om dagen passar för hårt pass
- 🚶 **Kvällspush** (efter 19) – steg kvar till målet, eller påminnelse om det gått 3+ dagar sedan senaste passet

Reglerna finns i `scripts/notify.py` – ändra fritt.

**Tips:** Öppna sidan i mobilen → Dela → *Lägg till på hemskärmen* så blir den som en app.

## Testa lokalt med demodata
```bash
python scripts/make_demo.py
cp store/data.enc docs/ && python -m http.server -d docs 8000
```
Öppna http://localhost:8000, lösenord `demo`.

## Felsökning
- **Inloggning misslyckas i Actions:** kör `scripts/login_local.py` igen och uppdatera `GARMIN_TOKENS`. Scriptet provar automatiskt secret:en om de sparade tokens slutat fungera.
- **429 / blockerad:** Garmin kan strypa GitHubs delade IP-adresser. Sänk frekvensen i `.github/workflows/update.yml` (t.ex. var 3:e timme) eller kör `fetch.py` på en egen dator/Raspberry Pi.
- **Nytt lösenord:** ändra `SITE_PASSWORD` och radera grenen `data` (då hämtas allt på nytt).
- Biblioteket `garminconnect` är inofficiellt. Om Garmin ändrar något: `pip install -U garminconnect`.
