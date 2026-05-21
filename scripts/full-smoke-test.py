#!/usr/bin/env python3
"""Run Mercy Legal AI smoke verification for web and Office add-in flows."""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_URL = os.environ.get("MERCY_CORE_API_URL", "http://127.0.0.1:8000")
HEALTH_URL = f"{BACKEND_URL.rstrip('/')}/health"
HTTP_TIMEOUT_SECONDS = float(os.environ.get("MERCY_FULL_SMOKE_HTTP_TIMEOUT_SECONDS", "5"))
COMMAND_TIMEOUT_SECONDS = int(os.environ.get("MERCY_FULL_SMOKE_COMMAND_TIMEOUT_SECONDS", "300"))
START_BACKEND_COMMAND = f'"{sys.executable}" -m uvicorn main:app --host 127.0.0.1 --port 8000'


def resolve_command(command_name: str) -> str:
    if os.name == "nt":
        resolved_cmd = shutil.which(f"{command_name}.cmd")
        if resolved_cmd:
            return resolved_cmd
    resolved = shutil.which(command_name)
    if resolved:
        return resolved
    return command_name


def print_header(title: str) -> None:
    print(f"\n{title}")
    print("-" * len(title))


def backend_is_running() -> bool:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return 200 <= response.status < 400
    except (urllib.error.URLError, TimeoutError, socket.timeout):
        return False


def start_backend(env: dict[str, str]) -> subprocess.Popen[str] | None:
    if backend_is_running():
        print(f"PASS Backend already running at {BACKEND_URL}")
        return None

    print(f"Starting backend at {BACKEND_URL} with uvicorn main:app")
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    output_lines: list[str] = []

    def drain_output() -> None:
        if process.stdout is None:
            return
        for line in process.stdout:
            output_lines.append(line)
            if len(output_lines) > 200:
                del output_lines[:100]

    threading.Thread(target=drain_output, name="mercy-full-smoke-backend-output", daemon=True).start()
    deadline = time.time() + 60
    while time.time() < deadline:
        if backend_is_running():
            print("PASS Backend health check is ready")
            return process
        if process.poll() is not None:
            output = "".join(output_lines)
            raise RuntimeError(f"Backend exited early.\n{output}")
        time.sleep(1)

    process.terminate()
    raise RuntimeError("Backend did not become healthy within 60 seconds")


def run_command(name: str, command: list[str], cwd: Path, env: dict[str, str]) -> bool:
    print_header(name)
    print(" ".join(command))
    started = time.perf_counter()
    try:
        completed = subprocess.run(command, cwd=cwd, env=env, timeout=COMMAND_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        elapsed = time.perf_counter() - started
        print(f"FAIL {name} timed out after {elapsed:.1f}s (limit {COMMAND_TIMEOUT_SECONDS}s)")
        return False
    elapsed = time.perf_counter() - started
    status = "PASS" if completed.returncode == 0 else "FAIL"
    print(f"{status} {name} finished in {elapsed:.1f}s")
    return completed.returncode == 0


def print_office_checklist() -> None:
    print_header("Office Add-in Manual Checklist")
    print("Word:")
    print("1. npm run dev in mercy-legal-plugin, then sideload manifest.xml.")
    print("2. Confirm task pane loads with Mercy branding, matter selector, Microsoft SSO primary auth, Supabase PKCE fallback, and composer.")
    print("3. Run Analyze, Draft, Cite, and Ethics; confirm Reliability Panel fields on every response.")
    print("Outlook:")
    print("1. npm run dev in mercy-legal-plugin, then sideload manifest.outlook.xml.")
    print("2. Select email text and run Analyze; confirm selected text is used or body fallback works.")
    print("3. Test matter selector, Microsoft SSO primary auth, Supabase PKCE fallback, Draft, Cite, Ethics, and Reliability Panel visibility.")


def build_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("MERCY_ENV", "local")
    env.setdefault("MERCY_AUTH_MODE", "dev")
    env.setdefault("MERCY_API_TOKEN", "playwright-local-token")
    env.setdefault("MERCY_CORE_API_TOKEN", env["MERCY_API_TOKEN"])
    env.setdefault("MERCY_TENANT_ID", "playwright-tenant")
    env.setdefault("MERCY_USER_ID", "playwright-user")
    env.setdefault("MERCY_ROLES", "attorney")
    env.setdefault("MERCY_CORE_API_URL", BACKEND_URL)
    env.setdefault("NEXT_PUBLIC_MERCY_CORE_API_URL", BACKEND_URL)
    env.setdefault("NEXT_PUBLIC_MERCY_API_TOKEN", env["MERCY_API_TOKEN"])
    env.setdefault("NEXT_PUBLIC_MERCY_TENANT_ID", env["MERCY_TENANT_ID"])
    env.setdefault("NEXT_PUBLIC_MERCY_USER_ID", env["MERCY_USER_ID"])
    env.setdefault("PLAYWRIGHT_WORKERS", "4")
    return env


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Mercy Legal AI full smoke tests.")
    parser.add_argument("--skip-backend-start", action="store_true", help="Require an existing backend instead of starting uvicorn.")
    parser.add_argument("--skip-office-static", action="store_true", help="Skip Office add-in static smoke validation.")
    args = parser.parse_args()

    started = time.perf_counter()
    env = build_env()
    backend_process: subprocess.Popen[str] | None = None
    results: list[tuple[str, bool]] = []

    try:
        print_header("Backend")
        if args.skip_backend_start:
            ok = backend_is_running()
            print(f"{'PASS' if ok else 'FAIL'} Backend health at {HEALTH_URL}")
            results.append(("backend", ok))
            if not ok:
                print(f"Backend was not reachable within {HTTP_TIMEOUT_SECONDS:.1f}s.")
                print(f"Start it first with: {START_BACKEND_COMMAND}")
                return _summary(results, time.perf_counter() - started)
        else:
            backend_process = start_backend(env)
            results.append(("backend", True))

        web_ok = run_command(
            "Web Playwright E2E",
            [resolve_command("npm"), "run", "test:e2e", "--", "--workers=1"],
            ROOT / "mercy-legal-web",
            env,
        )
        results.append(("web_playwright", web_ok))

        if not args.skip_office_static:
            office_ok = run_command(
                "Office Add-in Static Smoke",
                [resolve_command("npm"), "run", "smoke:office"],
                ROOT / "mercy-legal-plugin",
                env,
            )
            results.append(("office_static", office_ok))

        print_office_checklist()
    finally:
        if backend_process is not None and backend_process.poll() is None:
            backend_process.terminate()
            try:
                backend_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                backend_process.kill()

    elapsed = time.perf_counter() - started
    return _summary(results, elapsed)


def _summary(results: list[tuple[str, bool]], elapsed: float) -> int:
    print_header("Summary")
    for name, ok in results:
        print(f"{'PASS' if ok else 'FAIL'} {name}")
    all_ok = all(ok for _, ok in results)
    print(f"\nOverall: {'PASS' if all_ok else 'FAIL'} in {elapsed:.1f}s")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
