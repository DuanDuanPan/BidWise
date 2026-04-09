#!/usr/bin/env bash
# Idempotent bootstrap for python/.venv used by docx-bridge integration tests
# and packaged export preview runtime.
# Creates the venv (Python 3.12) and installs python/requirements.txt when
# the venv is missing or stale (requirements changed since last install).
#
# We intentionally create the venv with copied interpreter binaries instead of
# symlinks. electron-builder preserves venv symlinks inside the macOS app
# bundle, and codesign rejects absolute targets such as Homebrew's
# /opt/homebrew/opt/python@3.12/bin/python3.12.
#
# Preferred tool chain for dependency installation: uv > pip. Falls back
# gracefully.
# Exit 0 on success so callers can chain: pnpm python:setup && vitest run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON_DIR="$PROJECT_ROOT/python"
VENV_DIR="$PYTHON_DIR/.venv"
REQ_FILE="$PYTHON_DIR/requirements.txt"
STAMP_FILE="$VENV_DIR/.requirements-stamp"
VENV_PYTHON_BIN="$VENV_DIR/bin/python3"
VENV_PYTHON_VERSIONED_BIN="$VENV_DIR/bin/python3.12"

# --- locate Python 3.12 ---------------------------------------------------
find_python312() {
  for candidate in python3.12 python3; do
    if command -v "$candidate" &>/dev/null; then
      local ver
      ver="$("$candidate" --version 2>&1)"
      if [[ "$ver" == *"3.12"* ]]; then
        echo "$candidate"
        return
      fi
    fi
  done
  echo ""
}

PYTHON_BIN="$(find_python312)"
if [[ -z "$PYTHON_BIN" ]]; then
  echo "ERROR: Python 3.12 not found on PATH. Install it (brew install python@3.12) and retry." >&2
  exit 1
fi

# --- recreate symlinked venvs that break packaged macOS builds -------------
if [[ -f "$VENV_DIR/pyvenv.cfg" ]] && [[ -L "$VENV_PYTHON_BIN" || -L "$VENV_PYTHON_VERSIONED_BIN" ]]; then
  echo "Recreating python venv with copied interpreter binaries ..."
  rm -rf "$VENV_DIR"
fi

# --- create venv if missing ------------------------------------------------
if [[ ! -f "$VENV_DIR/pyvenv.cfg" ]]; then
  echo "Creating python venv at $VENV_DIR ..."
  "$PYTHON_BIN" -m venv --copies "$VENV_DIR"
fi

# --- install / refresh deps when requirements.txt is newer than stamp ------
needs_install=false
if [[ ! -f "$STAMP_FILE" ]]; then
  needs_install=true
elif [[ "$REQ_FILE" -nt "$STAMP_FILE" ]]; then
  needs_install=true
fi

if $needs_install; then
  echo "Installing python dependencies from $REQ_FILE ..."
  if command -v uv &>/dev/null; then
    uv pip install --python "$VENV_DIR/bin/python3" -r "$REQ_FILE"
  else
    "$VENV_DIR/bin/pip" install -r "$REQ_FILE"
  fi
  # Stamp with the hash of requirements.txt so we re-install on content change
  cp "$REQ_FILE" "$STAMP_FILE"
  echo "Python venv ready."
else
  echo "Python venv up to date."
fi
