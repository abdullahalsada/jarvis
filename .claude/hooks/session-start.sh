#!/bin/bash
set -euo pipefail

# Only needed in Claude Code on the web — local machines manage their own install
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Idempotent: the container state is cached after the hook completes
if command -v caveman >/dev/null 2>&1 && [ -x "${HOME}/.caveman/bin/caveman-engine" ]; then
  echo "🦴 Caveman CLI already installed — skipping install"
else
  echo "🦴 Installing Caveman CLI…"
  npm install -g @caveman-ai/cli

  echo "🔧 Running caveman setup…"
  caveman setup --install
fi

# Wire proxy routing + recovery MCP into the user-scoped Claude Code config
# (idempotent — re-applies the same planned writes)
echo "🔌 Enabling Caveman for Claude Code…"
caveman enable claude

if [ -f "${HOME}/.claude/skills/caveman-learn/SKILL.md" ]; then
  echo "🧠 caveman-learn skill already installed — skipping"
else
  echo "🧠 Installing caveman-learn skill…"
  caveman tools skills install --user
fi

echo "✅ Caveman ready"
