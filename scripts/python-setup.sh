#!/usr/bin/env bash
# Idempotent bootstrap for python/.venv used by docx-bridge integration tests
# and packaged export preview runtime.
# Creates the venv (Python 3.11+) and installs python/requirements.txt when
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

# --- helpers ----------------------------------------------------------------
# True when the given python binary is 3.11 or newer (works for 3.14, 3.15 …)
_py_min_311() {
  "$1" -c 'import sys; exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null
}

# Given a venv interpreter, resolve and return its base interpreter when it is
# 3.11+ and executable.  Prints path on success, nothing on failure.
_resolve_base_interpreter() {
  local base_prefix
  base_prefix="$("$1" -c 'import sys; print(sys.base_prefix)' 2>/dev/null)" || return
  local base_bin="$base_prefix/bin/python3"
  if [[ -x "$base_bin" ]] && _py_min_311 "$base_bin"; then
    echo "$base_bin"
  fi
}

# --- locate Python 3.11+ (base interpreter only, never a venv python) -----
find_python3() {
  # Allow explicit override for environments where no base python is on PATH
  # (e.g. CI/QA machines that only expose a virtualenv interpreter).
  if [[ -n "${BIDWISE_PYTHON_BIN:-}" ]]; then
    if [[ ! -x "$BIDWISE_PYTHON_BIN" ]]; then
      echo "ERROR: BIDWISE_PYTHON_BIN=$BIDWISE_PYTHON_BIN is not executable" >&2
      echo ""
      return
    fi
    if _py_min_311 "$BIDWISE_PYTHON_BIN"; then
      echo "$BIDWISE_PYTHON_BIN"
      return
    fi
    local ver
    ver="$("$BIDWISE_PYTHON_BIN" --version 2>&1)"
    echo "ERROR: BIDWISE_PYTHON_BIN=$BIDWISE_PYTHON_BIN is not Python 3.11+ (got: $ver)" >&2
    echo ""
    return
  fi

  for candidate in python3.12 python3.11 python3.13 python3.14 python3; do
    if command -v "$candidate" &>/dev/null; then
      local resolved
      resolved="$(command -v "$candidate")"

      # Fast path: interpreters living under a .venv / venv directory —
      # resolve the base interpreter behind the venv instead of skipping.
      if [[ "$resolved" == */.venv/* || "$resolved" == */venv/* ]]; then
        local base
        base="$(_resolve_base_interpreter "$candidate")"
        if [[ -n "$base" ]]; then
          echo "$base"
          return
        fi
        continue
      fi

      if ! _py_min_311 "$candidate"; then
        continue
      fi

      # Authoritative check: accept base interpreters directly
      if "$candidate" -c 'import sys; exit(0 if sys.prefix == sys.base_prefix else 1)' 2>/dev/null; then
        echo "$candidate"
        return
      fi

      # Venv interpreter not caught by path check — resolve its base
      local base
      base="$(_resolve_base_interpreter "$candidate")"
      if [[ -n "$base" ]]; then
        echo "$base"
        return
      fi
    fi
  done
  echo ""
}

PYTHON_BIN="$(find_python3)"
if [[ -z "$PYTHON_BIN" ]]; then
  echo "ERROR: No base (non-virtualenv) Python 3.11+ found on PATH." >&2
  echo "  Interpreters inside a virtualenv are rejected because they break venv creation." >&2
  echo "  Deactivate any active virtualenv, install a system Python (brew install python@3.12)," >&2
  echo "  or set BIDWISE_PYTHON_BIN=/path/to/base/python3 to override." >&2
  exit 1
fi

PYTHON_MINOR="$("$PYTHON_BIN" -c 'import sys;print(f"python{sys.version_info.major}.{sys.version_info.minor}")')"
VENV_PYTHON_VERSIONED_BIN="$VENV_DIR/bin/$PYTHON_MINOR"

# --- recreate symlinked venvs that break packaged macOS builds -------------
# Only upgrade to --copies when the interpreter actually supports it (some
# shared-library builds like uv's managed CPython crash when copied).
if [[ -f "$VENV_DIR/pyvenv.cfg" ]] && [[ -L "$VENV_PYTHON_BIN" || -L "$VENV_PYTHON_VERSIONED_BIN" ]]; then
  _tmpvenv="$(mktemp -d)/copies-test"
  if "$PYTHON_BIN" -m venv --copies "$_tmpvenv" 2>/dev/null && \
     "$_tmpvenv/bin/python3" -c 'import sys' &>/dev/null; then
    echo "Recreating python venv with copied interpreter binaries ..."
    rm -rf "$VENV_DIR"
  fi
  rm -rf "$(dirname "$_tmpvenv")"
fi

# --- recreate venv whose interpreter is broken (e.g. missing dylib) --------
if [[ -f "$VENV_DIR/pyvenv.cfg" ]] && ! "$VENV_PYTHON_BIN" -c 'import sys' &>/dev/null; then
  echo "Existing venv interpreter is broken — recreating ..."
  rm -rf "$VENV_DIR"
fi

# --- create venv if missing ------------------------------------------------
if [[ ! -f "$VENV_DIR/pyvenv.cfg" ]]; then
  echo "Creating python venv at $VENV_DIR ..."
  # Prefer --copies (needed for macOS codesigning in packaged builds).
  # Fall back to symlinks when the interpreter's shared library prevents copies.
  if ! "$PYTHON_BIN" -m venv --copies "$VENV_DIR" 2>/dev/null || \
     ! "$VENV_DIR/bin/python3" -c 'import sys' &>/dev/null; then
    rm -rf "$VENV_DIR"
    "$PYTHON_BIN" -m venv "$VENV_DIR"
  fi
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
