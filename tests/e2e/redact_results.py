"""Redact the HA token and password from an E2E run folder (R10d).

Usage: python3 tests/e2e/redact_results.py RUN_FOLDER

Reads HA_TOKEN and HA_PASSWORD from the environment. Replaces each secret,
its JSON-escaped form and its URL-encoded form with [redacted] in every file,
in every zip archive member (recursively) and in the HTML report's embedded
base64 zip. Then re-scans everything; a file still holding a form, or whose
zip or embedded data cannot be opened or read, is deleted and its path printed. Exit codes: 0 clean, 1 file deleted, 2 usage or missing
variable. Secrets are never printed.
"""
from __future__ import annotations

import base64
import binascii
import io
import json
import os
import re
import sys
import zipfile
from urllib.parse import quote

REPLACEMENT = b"[redacted]"
SECRET_VARS = ("HA_TOKEN", "HA_PASSWORD")
ZIP_MAGIC = (b"PK\x03\x04", b"PK\x05\x06")
EMBEDDED_ZIP = re.compile(rb"(data:application/zip;base64,)([A-Za-z0-9+/=]+)")


def secret_forms(secrets: list[str]) -> list[bytes]:
    """Return each secret raw, JSON-escaped and URL-encoded, longest first."""
    forms: set[bytes] = set()
    for secret in secrets:
        forms.add(secret.encode("utf-8"))
        forms.add(json.dumps(secret)[1:-1].encode("utf-8"))
        forms.add(quote(secret, safe="").encode("utf-8"))
    return sorted(forms, key=len, reverse=True)


def _is_zip(data: bytes) -> bool:
    return data.startswith(ZIP_MAGIC)


def _redact_zip(data: bytes, forms: list[bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(out, "w") as dst:
        for info in src.infolist():
            dst.writestr(info, redact_bytes(src.read(info), forms))
    return out.getvalue()


def _redact_embedded(match: re.Match[bytes], forms: list[bytes]) -> bytes:
    try:
        payload = base64.b64decode(match.group(2), validate=True)
    except binascii.Error:
        return match.group(0)
    return match.group(1) + base64.b64encode(redact_bytes(payload, forms))


def redact_bytes(data: bytes, forms: list[bytes]) -> bytes:
    if _is_zip(data):
        try:
            return _redact_zip(data, forms)
        except (zipfile.BadZipFile, EOFError, ValueError):
            pass
    data = EMBEDDED_ZIP.sub(lambda m: _redact_embedded(m, forms), data)
    for form in forms:
        data = data.replace(form, REPLACEMENT)
    return data


def _zip_holds_secret(data: bytes, forms: list[bytes]) -> bool:
    """Scan every member; any error opening or reading the archive propagates."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for info in archive.infolist():
            if holds_secret(archive.read(info), forms):
                return True
    return False


def holds_secret(data: bytes, forms: list[bytes]) -> bool:
    """True if any form remains. Raises if a zip or embedded payload cannot be checked."""
    if any(form in data for form in forms):
        return True
    if _is_zip(data) and _zip_holds_secret(data, forms):
        return True
    for match in EMBEDDED_ZIP.finditer(data):
        payload = base64.b64decode(match.group(2), validate=True)
        if _zip_holds_secret(payload, forms):
            return True
    return False


def _report_miss(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass
    print(path)


def _files(folder: str) -> list[str]:
    paths: list[str] = []
    for root, _dirs, names in os.walk(folder):
        for name in names:
            path = os.path.join(root, name)
            if os.path.isfile(path) and not os.path.islink(path):
                paths.append(path)
    return sorted(paths)


def main(argv: list[str]) -> int:
    if len(argv) != 2 or not os.path.isdir(argv[1]):
        print("Usage: python3 tests/e2e/redact_results.py RUN_FOLDER", file=sys.stderr)
        return 2

    secrets: list[str] = []
    for name in SECRET_VARS:
        value = os.environ.get(name, "")
        if not value:
            print(name, file=sys.stderr)
            return 2
        secrets.append(value)

    forms = secret_forms(secrets)
    folder = argv[1]

    missed: set[str] = set()
    for path in _files(folder):
        try:
            with open(path, "rb") as handle:
                data = handle.read()
            redacted = redact_bytes(data, forms)
            if redacted != data:
                with open(path, "wb") as handle:
                    handle.write(redacted)
        except Exception:  # noqa: BLE001 - an unprocessed file is not proven clean
            _report_miss(path)
            missed.add(path)

    for path in _files(folder):
        if path in missed:
            continue
        try:
            with open(path, "rb") as handle:
                data = handle.read()
            miss = holds_secret(data, forms)
        except Exception:  # noqa: BLE001 - content that cannot be checked is a miss
            miss = True
        if miss:
            _report_miss(path)
            missed.add(path)

    return 1 if missed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
