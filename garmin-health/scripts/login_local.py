"""Kör EN gång på din egen dator. Loggar in (med MFA-kod om du har det) och skriver ut
innehållet du ska klistra in som GitHub-secret GARMIN_TOKENS.

    pip install -r requirements.txt
    python scripts/login_local.py
"""
from getpass import getpass
from pathlib import Path

from garminconnect import Garmin

TOKEN_DIR = Path.home() / ".garminconnect"

email = input("Garmin e-post: ")
password = getpass("Garmin lösenord: ")

g = Garmin(email, password, prompt_mfa=lambda: input("MFA-kod: "))
g.login(str(TOKEN_DIR))
print(f"\nInloggad som {g.get_full_name()}\n")

token_file = TOKEN_DIR / "garmin_tokens.json"
print("Kopiera ALLT mellan strecken till GitHub-secret GARMIN_TOKENS:")
print("-" * 60)
print(token_file.read_text())
print("-" * 60)
