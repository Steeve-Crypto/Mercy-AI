from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CORE_FILES = [
    "main.py",
    "legal_task_router.py",
    "agent_network.py",
    "response_envelope.py",
    "mercy_context.py",
    "mercy_storage.py",
    "dc_knowledge_rag.py",
    "ragas_eval.py",
    "observability.py",
    "client_intake_flow.py",
    "dc_guardrails.py",
    "auth_context.py",
]


@dataclass
class CheckResult:
    component: str
    status: str
    seconds: float


def _project_python() -> Path:
    override = os.getenv("MERCY_PYTHON")
    if override:
        return Path(override)
    candidate = ROOT / "legal_discovery_ai" / ".venv" / "Scripts" / "python.exe"
    if candidate.exists():
        return candidate
    return Path(sys.executable)


def _run(component: str, command: list[str] | str, *, cwd: Path = ROOT, env: dict[str, str] | None = None) -> CheckResult:
    print(f"\n==> {component}")
    printable = command if isinstance(command, str) else " ".join(command)
    print(f"    {printable}")
    started = time.perf_counter()
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    completed = subprocess.run(command, cwd=str(cwd), env=merged_env, shell=isinstance(command, str))
    elapsed = time.perf_counter() - started
    status = "PASS" if completed.returncode == 0 else "FAIL"
    print(f"<== {component}: {status} ({elapsed:.1f}s)")
    return CheckResult(component, status, elapsed)


def _require(command_name: str) -> None:
    if shutil.which(command_name) is None:
        raise SystemExit(f"Required command not found on PATH: {command_name}")


def _summary(results: list[CheckResult]) -> int:
    print("\nComponent | Status | Time")
    print("--- | --- | ---")
    for result in results:
        print(f"{result.component} | {result.status} | {result.seconds:.1f}s")
    failed = [result for result in results if result.status != "PASS"]
    if failed:
        print(f"\nVerification failed: {', '.join(result.component for result in failed)}")
        return 1
    print("\nVerification passed: Mercy core, web, add-in, smoke checks, and RAGAS subset are healthy.")
    return 0


def main() -> int:
    python = _project_python()
    npm_command = "npm"
    _require(npm_command)

    print(f"Mercy verification root: {ROOT}")
    print(f"Python executable: {python}")

    results: list[CheckResult] = []
    results.append(_run("Backend unittest discovery", [str(python), "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"]))
    results.append(
        _run(
            "Backend py_compile",
            [
                str(python),
                "-m",
                "py_compile",
                *CORE_FILES,
                "scripts/verify.py",
                "scripts/core_smoke.py",
                "scripts/ragas_quick_check.py",
                "scripts/microsoft_identity_db.py",
                "scripts/provision_microsoft_identity.py",
            ],
        )
    )
    results.append(_run("Backend pyright", [str(python), "-m", "pyright"]))
    results.append(
        _run(
            "Backend ruff lint",
            [str(python), "-m", "ruff", "check", *CORE_FILES, "tests", "scripts", "--select", "E9,F63,F7,F82"],
        )
    )
    results.append(_run("Core smoke endpoints", [str(python), "scripts/core_smoke.py"]))
    results.append(
        _run(
            "Quick RAGAS eval",
            [str(python), "scripts/ragas_quick_check.py"],
        )
    )
    results.append(_run("Web typecheck", f"{npm_command} run typecheck", cwd=ROOT / "mercy-legal-web"))
    results.append(_run("Web lint", f"{npm_command} run lint", cwd=ROOT / "mercy-legal-web"))
    results.append(_run("Web build", f"{npm_command} run build", cwd=ROOT / "mercy-legal-web"))
    results.append(_run("Office add-in lint", f"{npm_command} run lint", cwd=ROOT / "mercy-legal-plugin"))
    results.append(_run("Office add-in build", f"{npm_command} run build", cwd=ROOT / "mercy-legal-plugin"))
    results.append(_run("Office manifest validation", f"{npm_command} run validate:manifest", cwd=ROOT / "mercy-legal-plugin"))
    results.append(_run("Office static smoke", f"{npm_command} run smoke:office", cwd=ROOT / "mercy-legal-plugin"))
    return _summary(results)


if __name__ == "__main__":
    raise SystemExit(main())
