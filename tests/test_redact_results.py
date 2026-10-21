"""Tests for the E2E results redactor (spec 002 R10d, amended by 002.1 item 3).

Uses fake secret values only. Never reads tests/e2e/.env.
"""
from __future__ import annotations

import base64
import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest import mock
from urllib.parse import quote

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "e2e", "redact_results.py")

# Keep the in-process load from writing __pycache__ into tests/e2e/.
sys.dont_write_bytecode = True

_spec = importlib.util.spec_from_file_location("redact_results", SCRIPT)
redact = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(redact)

FAKE_TOKEN = "fake-token-abc123XYZ"
FAKE_PASSWORD = 'fake "pass"/word&1'
SECRETS = (FAKE_TOKEN, FAKE_PASSWORD)


def _zip(members: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in members.items():
            archive.writestr(name, data)
    return out.getvalue()


def _read_zip(data: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        return {info.filename: archive.read(info) for info in archive.infolist()}


def _secret_env(token: str | None = FAKE_TOKEN, password: str | None = FAKE_PASSWORD) -> dict[str, str]:
    env = {"PATH": os.environ.get("PATH", "")}
    if token is not None:
        env["HA_TOKEN"] = token
    if password is not None:
        env["HA_PASSWORD"] = password
    return env


class RedactResultsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.folder = self._tmp.name

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _write(self, rel: str, data: bytes) -> str:
        path = os.path.join(self.folder, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(data)
        return path

    def _read(self, path: str) -> bytes:
        with open(path, "rb") as handle:
            return handle.read()

    def _run(self, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "-I", SCRIPT, self.folder],
            env=env, capture_output=True, text=True, timeout=60,
        )

    def _assert_no_secret(self, data: bytes) -> None:
        for secret in SECRETS:
            self.assertNotIn(secret.encode("utf-8"), data)

    def test_plain_text_redacted(self) -> None:
        path = self._write(
            "log.txt",
            f"token={FAKE_TOKEN}\npassword={FAKE_PASSWORD}\n".encode("utf-8"),
        )
        result = self._run(_secret_env())
        self.assertEqual(result.returncode, 0, result.stderr)
        data = self._read(path)
        self.assertEqual(data, b"token=[redacted]\npassword=[redacted]\n")
        self.assertEqual(result.stdout, "")

    def test_json_and_url_forms_redacted(self) -> None:
        json_form = json.dumps(FAKE_PASSWORD)[1:-1]
        url_form = quote(FAKE_PASSWORD, safe="")
        path = self._write(
            "trace.json",
            ('{"a": "' + json_form + '", "u": "' + url_form + '"}').encode("utf-8"),
        )
        result = self._run(_secret_env())
        self.assertEqual(result.returncode, 0, result.stderr)
        data = self._read(path)
        self.assertEqual(data, b'{"a": "[redacted]", "u": "[redacted]"}')

    def test_zip_member_redacted(self) -> None:
        path = self._write(
            "trace.zip",
            _zip({"trace.trace": f"auth {FAKE_TOKEN} {FAKE_PASSWORD}".encode("utf-8")}),
        )
        result = self._run(_secret_env())
        self.assertEqual(result.returncode, 0, result.stderr)
        members = _read_zip(self._read(path))
        self.assertEqual(members["trace.trace"], b"auth [redacted] [redacted]")

    def test_nested_zip_redacted(self) -> None:
        inner = _zip({"inner.txt": FAKE_PASSWORD.encode("utf-8")})
        path = self._write("sub/outer.zip", _zip({"inner.zip": inner, "top.txt": FAKE_TOKEN.encode("utf-8")}))
        result = self._run(_secret_env())
        self.assertEqual(result.returncode, 0, result.stderr)
        outer = _read_zip(self._read(path))
        self.assertEqual(outer["top.txt"], b"[redacted]")
        self.assertEqual(_read_zip(outer["inner.zip"])["inner.txt"], b"[redacted]")

    def test_html_embedded_zip_redacted(self) -> None:
        payload = base64.b64encode(_zip({"report.json": f'{{"t": "{FAKE_TOKEN}"}}'.encode("utf-8")}))
        html = b'<html><script>window.data = "data:application/zip;base64,' + payload + b'";</script></html>'
        path = self._write("report/index.html", html)
        result = self._run(_secret_env())
        self.assertEqual(result.returncode, 0, result.stderr)
        data = self._read(path)
        match = redact.EMBEDDED_ZIP.search(data)
        self.assertIsNotNone(match)
        members = _read_zip(base64.b64decode(match.group(2)))
        self.assertEqual(members["report.json"], b'{"t": "[redacted]"}')
        self._assert_no_secret(data)

    def test_clean_run_exits_zero_and_leaves_files(self) -> None:
        path = self._write("clean.txt", b"nothing secret here")
        result = self._run(_secret_env())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertEqual(self._read(path), b"nothing secret here")

    def test_missing_or_empty_variable_exits_two(self) -> None:
        cases = {
            "password missing": _secret_env(password=None),
            "password empty": _secret_env(password=""),
            "token missing": _secret_env(token=None),
            "token empty": _secret_env(token=""),
        }
        for label, env in cases.items():
            with self.subTest(case=label):
                path = self._write("log.txt", FAKE_TOKEN.encode("utf-8"))
                result = self._run(env)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(self._read(path), FAKE_TOKEN.encode("utf-8"))
                for secret in SECRETS:
                    self.assertNotIn(secret, result.stdout + result.stderr)

    def test_miss_is_deleted_printed_and_exits_one(self) -> None:
        missed = self._write("missed.txt", f"token={FAKE_TOKEN}".encode("utf-8"))
        kept = self._write("clean.txt", b"nothing secret here")
        stdout = io.StringIO()
        env = _secret_env()
        # Fault injection limited to this test: redaction does nothing, so the
        # second scan must catch the file.
        with mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(redact, "redact_bytes", lambda data, forms: data), \
                contextlib.redirect_stdout(stdout):
            code = redact.main(["redact_results.py", self.folder])
        self.assertEqual(code, 1)
        self.assertFalse(os.path.exists(missed))
        self.assertTrue(os.path.exists(kept))
        self.assertEqual(stdout.getvalue().splitlines(), [missed])
        self.assertNotIn(FAKE_TOKEN, stdout.getvalue())

    def test_unreadable_zip_is_deleted_and_exits_one(self) -> None:
        # Starts like a zip but cannot be opened, so it cannot be proven clean.
        broken = self._write("broken.zip", b"PK\x03\x04 not really a zip")
        result = self._run(_secret_env())
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertFalse(os.path.exists(broken))
        self.assertEqual(result.stdout.splitlines(), [broken])


if __name__ == "__main__":
    unittest.main()
