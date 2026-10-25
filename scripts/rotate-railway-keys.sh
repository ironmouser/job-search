#!/usr/bin/env bash
# ==============================================================================
# Railway Credential Rotation Script
# Project: humble-fulfillment
# Web Service: job-search
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# 1. Target Services Configuration
# ------------------------------------------------------------------------------
WEB_SERVICE="${WEB_SERVICE:-job-search}"
WORKER_SERVICE="${WORKER_SERVICE:-worker-bee}"

echo "========================================================"
echo " Starting Railway Credential Rotation"
echo " Web Service:    $WEB_SERVICE"
echo " Worker Service: $WORKER_SERVICE"
echo "========================================================"

# ------------------------------------------------------------------------------
# 2. Automatically Generated Cryptographic Secrets
# ------------------------------------------------------------------------------
echo "Generating fresh cryptographic secrets..."
NEW_NEXTAUTH_SECRET=$(openssl rand -hex 32)
NEW_WORKER_KEY=$(openssl rand -hex 32)
NEW_ENCRYPTION_KEY=$(openssl rand -hex 32)
NEW_SESSION_VAULT_SECRET=$(openssl rand -hex 32)

# ------------------------------------------------------------------------------
# 3. Third-Party Provider Keys
# Paste your new keys below, or export them in your shell before running this script.
# Any variable left blank will NOT overwrite or erase existing values on Railway.
# ------------------------------------------------------------------------------

# AI Reasoning & LLM Providers
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
GLM_API_KEY="${GLM_API_KEY:-}"

# Payments & Billing
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"

# Authentication & Transactional Mail
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
EMAIL_SERVER_PASSWORD="${EMAIL_SERVER_PASSWORD:-}"
IMAP_PASS="${IMAP_PASS:-}"

# Scraping & Search Services
SERPAPI_API_KEY="${SERPAPI_API_KEY:-}"
SCRAPERAPI_KEY="${SCRAPERAPI_KEY:-}"
SCRAPEDO_API_KEY="${SCRAPEDO_API_KEY:-}"
USAJOBS_API_KEY="${USAJOBS_API_KEY:-}"

# AWS S3 Storage (Leave empty if already updated in Railway Dashboard)
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"

# ------------------------------------------------------------------------------
# 4. Build Variables Payload for Web Service ($WEB_SERVICE)
# ------------------------------------------------------------------------------
declare -a WEB_ARGS=()

# Always include freshly rotated cryptographic tokens
WEB_ARGS+=(--set "NEXTAUTH_SECRET=${NEW_NEXTAUTH_SECRET}")
WEB_ARGS+=(--set "WORKER_API_KEY=${NEW_WORKER_KEY}")
WEB_ARGS+=(--set "ENCRYPTION_KEY=${NEW_ENCRYPTION_KEY}")
WEB_ARGS+=(--set "SESSION_VAULT_SECRET=${NEW_SESSION_VAULT_SECRET}")

# Append external API keys if provided
[[ -n "$OPENAI_API_KEY" ]]          && WEB_ARGS+=(--set "OPENAI_API_KEY=${OPENAI_API_KEY}")
[[ -n "$GEMINI_API_KEY" ]]          && WEB_ARGS+=(--set "GEMINI_API_KEY=${GEMINI_API_KEY}")
[[ -n "$DEEPSEEK_API_KEY" ]]        && WEB_ARGS+=(--set "DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}")
[[ -n "$ANTHROPIC_API_KEY" ]]       && WEB_ARGS+=(--set "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}")
[[ -n "$GLM_API_KEY" ]]             && WEB_ARGS+=(--set "GLM_API_KEY=${GLM_API_KEY}")
[[ -n "$STRIPE_SECRET_KEY" ]]       && WEB_ARGS+=(--set "STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}")
[[ -n "$STRIPE_WEBHOOK_SECRET" ]]   && WEB_ARGS+=(--set "STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}")
[[ -n "$GOOGLE_CLIENT_SECRET" ]]    && WEB_ARGS+=(--set "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}")
[[ -n "$EMAIL_SERVER_PASSWORD" ]]   && WEB_ARGS+=(--set "EMAIL_SERVER_PASSWORD=${EMAIL_SERVER_PASSWORD}")
[[ -n "$IMAP_PASS" ]]               && WEB_ARGS+=(--set "IMAP_PASS=${IMAP_PASS}")
[[ -n "$SERPAPI_API_KEY" ]]         && WEB_ARGS+=(--set "SERPAPI_API_KEY=${SERPAPI_API_KEY}")
[[ -n "$SCRAPERAPI_KEY" ]]          && WEB_ARGS+=(--set "SCRAPERAPI_KEY=${SCRAPERAPI_KEY}")
[[ -n "$SCRAPEDO_API_KEY" ]]        && WEB_ARGS+=(--set "SCRAPEDO_API_KEY=${SCRAPEDO_API_KEY}")
[[ -n "$USAJOBS_API_KEY" ]]         && WEB_ARGS+=(--set "USAJOBS_API_KEY=${USAJOBS_API_KEY}")
[[ -n "$AWS_ACCESS_KEY_ID" ]]       && WEB_ARGS+=(--set "AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}")
[[ -n "$AWS_SECRET_ACCESS_KEY" ]]   && WEB_ARGS+=(--set "AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}")

echo ""
echo "Updating variables on service: $WEB_SERVICE..."
railway variables --service "$WEB_SERVICE" "${WEB_ARGS[@]}"
echo "Variables successfully updated for $WEB_SERVICE."

# ------------------------------------------------------------------------------
# 5. Build Variables Payload for Worker Service ($WORKER_SERVICE)
# ------------------------------------------------------------------------------
if [[ -n "$WORKER_SERVICE" ]]; then
  echo ""
  echo "Checking worker service: $WORKER_SERVICE..."

  declare -a WORKER_ARGS=()
  # Worker MUST receive the identical WORKER_API_KEY
  WORKER_ARGS+=(--set "WORKER_API_KEY=${NEW_WORKER_KEY}")

  [[ -n "$DEEPSEEK_API_KEY" ]]      && WORKER_ARGS+=(--set "DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}")
  [[ -n "$GEMINI_API_KEY" ]]        && WORKER_ARGS+=(--set "GEMINI_API_KEY=${GEMINI_API_KEY}")
  [[ -n "$SCRAPERAPI_KEY" ]]        && WORKER_ARGS+=(--set "SCRAPERAPI_KEY=${SCRAPERAPI_KEY}")
  [[ -n "$AWS_ACCESS_KEY_ID" ]]     && WORKER_ARGS+=(--set "AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}")
  [[ -n "$AWS_SECRET_ACCESS_KEY" ]] && WORKER_ARGS+=(--set "AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}")

  # Attempt worker update; if service name does not exist, notify user without failing
  if railway variables --service "$WORKER_SERVICE" "${WORKER_ARGS[@]}" 2>/dev/null; then
    echo "Variables successfully updated for $WORKER_SERVICE."
  else
    echo "Note: Could not update '$WORKER_SERVICE'. If your worker has a different service name,"
    echo "you can rerun with: WORKER_SERVICE=<name> ./scripts/rotate-railway-keys.sh"
  fi
fi

echo ""
echo "========================================================"
echo " Rotation complete! Railway has triggered a redeploy."
echo " Generated NEXTAUTH_SECRET: ${NEW_NEXTAUTH_SECRET:0:8}..."
echo " Synchronized WORKER_API_KEY: ${NEW_WORKER_KEY:0:8}..."
echo "========================================================"
