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

# caveman browse: point it at the container's Playwright Chromium.
# Chrome refuses to run as root without --no-sandbox, so wrap it.
if [ -x /opt/pw-browsers/chromium ]; then
  CHROME_WRAPPER="${HOME}/.local/bin/chrome-nosandbox"
  mkdir -p "${HOME}/.local/bin"
  cat > "${CHROME_WRAPPER}" << 'WRAP'
#!/bin/bash
exec /opt/pw-browsers/chromium --no-sandbox "$@"
WRAP
  chmod +x "${CHROME_WRAPPER}"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export CAVEMAN_BROWSE_CHROME=\"${CHROME_WRAPPER}\"" >> "${CLAUDE_ENV_FILE}"
  fi
  echo "🌐 caveman browse wired to Playwright Chromium"

  # Chromium keeps its own NSS trust store and doesn't read the CA-bundle env
  # vars, so the egress proxy's interception CAs must be imported explicitly
  # or every page load fails with ERR_CERT_AUTHORITY_INVALID.
  CA_BUNDLE="${SSL_CERT_FILE:-}"
  if [ -n "${CA_BUNDLE}" ] && [ -f "${CA_BUNDLE}" ]; then
    if ! command -v certutil >/dev/null 2>&1; then
      apt-get update -qq >/dev/null 2>&1 || true
      apt-get install -y -qq libnss3-tools >/dev/null 2>&1 || true
    fi
    if command -v certutil >/dev/null 2>&1; then
      NSSDB="sql:${HOME}/.pki/nssdb"
      mkdir -p "${HOME}/.pki/nssdb"
      certutil -d "${NSSDB}" -L >/dev/null 2>&1 || certutil -d "${NSSDB}" -N --empty-password < /dev/null
      CERT_TMP="$(mktemp -d)"
      trap 'rm -rf "${CERT_TMP}"' EXIT
      awk -v dir="${CERT_TMP}" '/BEGIN CERTIFICATE/{n++} n{print > (dir "/cert-" n ".pem")}' "${CA_BUNDLE}"
      imported=0
      for pem in "${CERT_TMP}"/cert-*.pem; do
        case "$(openssl x509 -in "${pem}" -noout -subject 2>/dev/null)" in
          *CCR*)
            nick="ccr-proxy-ca-$(openssl x509 -in "${pem}" -noout -fingerprint -sha256 | tr -d ':' | cut -d= -f2 | cut -c1-12)"
            certutil -d "${NSSDB}" -L -n "${nick}" >/dev/null 2>&1 || \
              certutil -d "${NSSDB}" -A -n "${nick}" -t "C,," -i "${pem}" < /dev/null
            imported=$((imported + 1))
            ;;
        esac
      done
      echo "🔐 ${imported} proxy CA(s) trusted in browser NSS store"
    else
      echo "⚠️ certutil unavailable — caveman browse will fail TLS on proxied hosts"
    fi
  fi
fi

echo "✅ Caveman ready"
