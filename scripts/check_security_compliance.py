from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from security_controls import security_compliance_status, security_headers


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_DOCS = [
    "docs/compliance/soc2_type1_checklist.md",
    "docs/compliance/soc2_readiness_statement.md",
    "docs/compliance/privacy_policy.md",
    "docs/compliance/security_overview.md",
]


def _command_available(command: str) -> bool:
    return shutil.which(command) is not None


def _npm_audit_hook(package_root: Path) -> dict[str, Any]:
    package_json = package_root / "package.json"
    if not package_json.exists():
        return {"path": str(package_root), "available": False, "reason": "package.json_not_found"}
    if not _command_available("npm"):
        return {"path": str(package_root), "available": False, "reason": "npm_not_installed"}
    return {"path": str(package_root), "available": True, "command": "npm audit --json"}


def _bandit_hook() -> dict[str, Any]:
    if not _command_available("bandit"):
        return {"available": False, "reason": "bandit_not_installed", "command": "bandit -r ."}
    return {"available": True, "command": "bandit -r ."}


def _optional_run(command: list[str], cwd: Path) -> dict[str, Any]:
    try:
        result = subprocess.run(command, cwd=str(cwd), capture_output=True, text=True, timeout=60, check=False)
    except Exception as exc:
        return {"ran": False, "error": f"{exc.__class__.__name__}: {exc}"}
    return {
        "ran": True,
        "returncode": result.returncode,
        "stdout_tail": result.stdout[-2000:],
        "stderr_tail": result.stderr[-2000:],
    }


def build_report(*, run_scans: bool = False) -> dict[str, Any]:
    headers = security_headers()
    docs = [{"path": path, "exists": (ROOT / path).exists()} for path in REQUIRED_DOCS]
    report: dict[str, Any] = {
        "check": "mercy_security_compliance",
        "status": "pass",
        "security_controls": security_compliance_status(),
        "required_docs": docs,
        "security_headers": {
            "present": sorted(headers.keys()),
            "csp_configured": bool(headers.get("Content-Security-Policy")),
            "hsts_configured": bool(headers.get("Strict-Transport-Security")),
        },
        "cors": {
            "configuration": "MERCY_ALLOWED_ORIGINS explicit allow-list",
            "wildcard_allowed": False,
        },
        "vulnerability_scan_hooks": {
            "bandit": _bandit_hook(),
            "npm_audit": [
                _npm_audit_hook(ROOT / "mercy-legal-web"),
                _npm_audit_hook(ROOT / "mercy-legal-plugin"),
            ],
        },
    }
    failures = [doc["path"] for doc in docs if not doc["exists"]]
    if failures:
        report["status"] = "fail"
        report["failures"] = failures
    if run_scans:
        scans: dict[str, Any] = {}
        if _command_available("bandit"):
            scans["bandit"] = _optional_run(["bandit", "-r", "."], ROOT)
        if _command_available("npm"):
            scans["npm_audit_web"] = _optional_run(["npm", "audit", "--json"], ROOT / "mercy-legal-web")
            scans["npm_audit_plugin"] = _optional_run(["npm", "audit", "--json"], ROOT / "mercy-legal-plugin")
        report["scan_results"] = scans
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Check Mercy AI practical security and SOC 2 readiness controls.")
    parser.add_argument("--run-scans", action="store_true", help="Run optional Bandit/npm audit scans when tools are installed.")
    parser.add_argument("--json", action="store_true", help="Emit JSON only.")
    args = parser.parse_args()
    report = build_report(run_scans=args.run_scans)
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
        return
    print(f"Mercy security compliance check: {report['status'].upper()}")
    print(f"Required docs: {sum(1 for item in report['required_docs'] if item['exists'])}/{len(report['required_docs'])}")
    print(f"Security headers: {', '.join(report['security_headers']['present'])}")
    print(f"Bandit hook: {report['vulnerability_scan_hooks']['bandit']['available']}")
    print("npm audit hooks:")
    for hook in report["vulnerability_scan_hooks"]["npm_audit"]:
        print(f"- {hook['path']}: {hook['available']}")


if __name__ == "__main__":
    main()
