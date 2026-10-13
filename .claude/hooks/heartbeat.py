#!/usr/bin/env python3
"""
Heartbeat hook for Mahler coordination.
Renews this session's Mahler lease in background.
"""

import json
import os
import subprocess
import sys
from pathlib import Path


def run_cmd(cmd, cwd=None):
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, timeout=10)
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

        # Renew lease in background (non-blocking)
        # mahler heartbeat updates the lease timestamp for this session
        run_cmd(["mahler", "heartbeat", project], cwd=repo_root)

    except Exception:
        pass  # Exit-safe: never fail

    sys.exit(0)


if __name__ == "__main__":
    main()