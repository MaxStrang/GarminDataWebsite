"""AES-GCM-kryptering med lösenord (PBKDF2). Samma format läses av docs/app.js i webbläsaren."""
import base64
import json
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITERATIONS = 250_000


def _key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS)
    return kdf.derive(password.encode("utf-8"))


def encrypt_json(obj, password: str) -> dict:
    salt = os.urandom(16)
    iv = os.urandom(12)
    plain = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ct = AESGCM(_key(password, salt)).encrypt(iv, plain, None)  # ct + 16 byte tag
    b64 = lambda b: base64.b64encode(b).decode()
    return {"v": 1, "iter": ITERATIONS, "salt": b64(salt), "iv": b64(iv), "ct": b64(ct)}


def decrypt_json(blob: dict, password: str):
    d = lambda s: base64.b64decode(s)
    key = _key(password, d(blob["salt"]))
    plain = AESGCM(key).decrypt(d(blob["iv"]), d(blob["ct"]), None)
    return json.loads(plain)


def load_encrypted(path: str, password: str, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return decrypt_json(json.load(f), password)


def save_encrypted(path: str, obj, password: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(encrypt_json(obj, password), f)
