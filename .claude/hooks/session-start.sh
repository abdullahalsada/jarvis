#!/bin/bash
set -euo pipefail

# Only needed in Claude Code on the web — local machines manage their own install
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Idempotent: the container state is cached after the hook completes
if command -v caveman >/dev/null 2>&1 && [ -x "${HOME}/.caveman/bin/caveman-engine" ]; then
  echo "🦴 Caveman CLI already installed — skipping"
  exit 0
fi

echo "🦴 Installing Caveman CLI…"
npm install -g @caveman-ai/cli

echo "🔧 Running caveman setup…"
caveman setup --install

echo "✅ Caveman CLI ready"
