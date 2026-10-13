#!/usr/bin/env python3
"""
PreToolUse hook for Mahler coordination.
Checks for yield file, blocks `gh pr create|merge` without lease, nudges to claim.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path


def run_cmd(cmd, cwd=None):
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, timeout=5)
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except subprocess.TimeoutExpired:
        return "", "timeout", 1
    except Exception as e:
        return "", str(e), 1


def main():
    # Exit-safe: never wedge the session
    try:
        # Read hook input from stdin
        input_data = json.load(sys.stdin)
        tool_name = input_data.get("tool", {}).get("name", "")
        tool_input = input_data.get("tool", {}).get("input", {})

        repo_root = Path(__file__).resolve().parents[2]
        project = "puppy-growth-chart"

        # Check for yield file
        yield_file = repo_root / ".mahler" / "yield"
        if yield_file.exists():
            print(f"⚠️  Yield file present at {yield_file} — session should yield")

        # Block gh pr create|merge without lease
        if tool_name == "Bash":
            cmd = tool_input.get("command", "")
            if re.search(r"\bgh\s+pr\s+(create|merge)\b", cmd):
                # Check if we have a lease (active mahler run)
                out, _, code = run_cmd(["mahler", "status", project], cwd=repo_root)
                if code != 0 or "no active run" in out.lower():
                    print("❌ Blocked: gh pr create/merge requires an active Mahler lease")
                    print("   Run: mahler claim puppy-growth-chart#N")
                    sys.exit(2)  # Exit code 2 blocks the tool

        # Nudge to claim if editing source files without active run
        if tool_name in ("Edit", "Write", "MultiEdit"):
            file_path = tool_input.get("file_path", "")
            if file_path and ("src/" in file_path or "worker/" in file_path or "test/" in file_path):
                out, _, code = run_cmd(["mahler", "status", project], cwd=repo_root)
                if code != 0 or "no active run" in out.lower():
                    print("💡 No active Mahler run. Consider: mahler claim puppy-growth-chart#N")

    except Exception:
        pass  # Exit-safe: never fail

    sys.exit(0)


if __name__ == "__main__":
    main()