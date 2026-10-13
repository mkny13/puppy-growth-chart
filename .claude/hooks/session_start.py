#!/usr/bin/env python3
"""
SessionStart hook for Mahler coordination.
Shows Mahler status, active runs, other sessions, claim/ship reminders.
"""

import json
import os
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
        repo_root = Path(__file__).resolve().parents[2]
        project = "puppy-growth-chart"

        # Show Mahler status
        print(f"🐕 Mahler: {project}")

        # Check for active runs
        out, _, _ = run_cmd(["mahler", "list", project], cwd=repo_root)
        if out:
            print(f"Active runs:\n{out}")

        # Check for other sessions
        out, _, _ = run_cmd(["mahler", "sessions", project], cwd=repo_root)
        if out:
            print(f"Other sessions:\n{out}")

        # Remind about claim/ship
        print("Reminder: 'mahler claim puppy-growth-chart#N' before work, 'mahler ship puppy-growth-chart#N' when done")

    except Exception:
        pass  # Exit-safe: never fail

    sys.exit(0)


if __name__ == "__main__":
    main()