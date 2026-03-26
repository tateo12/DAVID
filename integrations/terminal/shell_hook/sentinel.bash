#!/usr/bin/env bash
# ============================================================================
# Sentinel Shell Hook — Bash Plugin
# AI Security Supervisor: Terminal Monitoring
# ============================================================================
# Source this file in your .bashrc:
#   source ~/.sentinel/sentinel.bash
#
# For best results, install bash-preexec first:
#   https://github.com/rcaloras/bash-preexec
# Otherwise this plugin uses a DEBUG trap fallback.
# ============================================================================

# --- Configuration (env vars with defaults) ---------------------------------

: "${SENTINEL_ENABLED:=1}"
: "${SENTINEL_API_URL:=http://localhost:8000}"
: "${SENTINEL_MODE:=warn}"        # warn | block | log
: "${SENTINEL_LOG:=$HOME/.sentinel/terminal.log}"

# --- Internal state ---------------------------------------------------------

_SENTINEL_BLOCK_NEXT=0
_SENTINEL_LAST_COMMAND=""

# Ensure log directory exists
mkdir -p "$(dirname "$SENTINEL_LOG")" 2>/dev/null

# --- Color constants --------------------------------------------------------

_SEN_RED=$'\033[0;31m'
_SEN_YELLOW=$'\033[0;33m'
_SEN_BLUE=$'\033[0;34m'
_SEN_CYAN=$'\033[0;36m'
_SEN_BOLD=$'\033[1m'
_SEN_RESET=$'\033[0m'

# --- Known AI tools and domains ---------------------------------------------

_SENTINEL_AI_TOOLS="claude aider copilot sgpt llm chatgpt openai ollama cursor"

_SENTINEL_AI_DOMAINS="api.openai.com api.anthropic.com api.mistral.ai generativelanguage.googleapis.com api.cohere.ai"

# --- Utility: check if command involves AI tools ----------------------------

_sentinel_is_ai_command() {
  local cmd="$1"
  local cmd_lower
  cmd_lower=$(echo "$cmd" | tr '[:upper:]' '[:lower:]')

  # Check direct CLI tool invocation
  local tool
  for tool in $_SENTINEL_AI_TOOLS; do
    if echo "$cmd_lower" | grep -qE "(^|[|;&] *|sudo |env )${tool}( |$)"; then
      echo "$tool"
      return 0
    fi
  done

  # Check API calls via curl/wget/httpie
  if echo "$cmd_lower" | grep -qE "(^|[|;&] *)(curl|wget|http|https) "; then
    local domain
    for domain in $_SENTINEL_AI_DOMAINS; do
      if echo "$cmd" | grep -qF "$domain"; then
        echo "api:$domain"
        return 0
      fi
    done
  fi

  # Check pipes into AI tools
  if echo "$cmd" | grep -qF "|"; then
    local tool
    for tool in $_SENTINEL_AI_TOOLS; do
      if echo "$cmd_lower" | grep -qE "\| *${tool}( |$)"; then
        echo "pipe:$tool"
        return 0
      fi
    done
  fi

  return 1
}

# --- Utility: scan for sensitive data patterns ------------------------------

_sentinel_scan_sensitive() {
  local cmd="$1"
  local detections=""
  local found=1

  # SSN pattern
  if echo "$cmd" | grep -qE '[0-9]{3}-[0-9]{2}-[0-9]{4}'; then
    detections="PII (SSN pattern)"
    found=0
  fi

  # Credit card pattern
  if echo "$cmd" | grep -qE '[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}'; then
    if [[ -n "$detections" ]]; then
      detections="${detections}|PII (credit card pattern)"
    else
      detections="PII (credit card pattern)"
    fi
    found=0
  fi

  # API keys
  if echo "$cmd" | grep -qE '(sk-|sk_live_|sk_test_|AKIA|ghp_|xoxb-|xapp-)[A-Za-z0-9_-]{10,}'; then
    if [[ -n "$detections" ]]; then
      detections="${detections}|Secret (API key)"
    else
      detections="Secret (API key)"
    fi
    found=0
  fi

  # Passwords
  if echo "$cmd" | grep -qE '(password|passwd|pwd|secret)[[:space:]]*[=:][[:space:]]*[^[:space:]]+'; then
    if [[ -n "$detections" ]]; then
      detections="${detections}|Secret (password/credential)"
    else
      detections="Secret (password/credential)"
    fi
    found=0
  fi

  # Connection strings
  if echo "$cmd" | grep -qE '(postgres|mysql|redis|mongodb)://[^[:space:]]+'; then
    if [[ -n "$detections" ]]; then
      detections="${detections}|Secret (connection string)"
    else
      detections="Secret (connection string)"
    fi
    found=0
  fi

  # Email dump (3+ emails)
  local email_count
  email_count=$(echo "$cmd" | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$email_count" -ge 3 ]]; then
    if [[ -n "$detections" ]]; then
      detections="${detections}|PII (email dump: ${email_count} addresses)"
    else
      detections="PII (email dump: ${email_count} addresses)"
    fi
    found=0
  fi

  if [[ $found -eq 0 ]]; then
    echo "$detections"
    return 0
  fi

  return 1
}

# --- Utility: calculate risk level ------------------------------------------

_sentinel_risk_level() {
  local detections="$1"
  if echo "$detections" | grep -qE 'Secret|SSN|credit card'; then
    echo "HIGH"
    return
  fi
  if echo "$detections" | grep -qF 'PII'; then
    echo "MEDIUM"
    return
  fi
  echo "LOW"
}

# --- Utility: risk color ----------------------------------------------------

_sentinel_risk_color() {
  case "$1" in
    HIGH|CRITICAL) echo "$_SEN_RED" ;;
    MEDIUM)        echo "$_SEN_YELLOW" ;;
    *)             echo "$_SEN_CYAN" ;;
  esac
}

# --- Utility: display warning box -------------------------------------------

_sentinel_display_warning() {
  local tool="$1"
  local detections="$2"
  local risk="$3"
  local risk_color
  risk_color=$(_sentinel_risk_color "$risk")

  local border="${_SEN_BLUE}${_SEN_BOLD}"

  echo ""
  echo "${border}+-----------------------------------------------------+${_SEN_RESET}"
  echo "${border}|  ${_SEN_CYAN}sentinel -- Terminal Security Monitor${border}        |${_SEN_RESET}"
  echo "${border}+-----------------------------------------------------+${_SEN_RESET}"

  # Print each detection
  IFS='|' read -ra parts <<< "$detections"
  for det in "${parts[@]}"; do
    # Trim whitespace
    det=$(echo "$det" | sed 's/^ *//;s/ *$//')
    local pad=$((34 - ${#det}))
    [[ $pad -lt 0 ]] && pad=0
    echo "${border}|  ${risk_color}!! Detected: ${det}${_SEN_RESET}${border}$(printf '%*s' $pad '')|${_SEN_RESET}"
  done

  local tool_pad=$((45 - ${#tool}))
  [[ $tool_pad -lt 0 ]] && tool_pad=0
  echo "${border}|  Tool: ${tool}$(printf '%*s' $tool_pad '')|${_SEN_RESET}"

  local risk_pad=$((47 - ${#risk}))
  [[ $risk_pad -lt 0 ]] && risk_pad=0
  echo "${border}|  ${risk_color}Risk: ${risk}${_SEN_RESET}${border}$(printf '%*s' $risk_pad '')|${_SEN_RESET}"
  echo "${border}|                                                     |${_SEN_RESET}"

  if [[ "$SENTINEL_MODE" == "warn" ]]; then
    echo "${border}|  Proceed with this command? [y/N]                   |${_SEN_RESET}"
  elif [[ "$SENTINEL_MODE" == "block" ]] && [[ "$risk" == "HIGH" || "$risk" == "CRITICAL" ]]; then
    echo "${border}|  ${_SEN_RED}BLOCKED -- high risk command prevented${_SEN_RESET}${border}                |${_SEN_RESET}"
  fi

  echo "${border}+-----------------------------------------------------+${_SEN_RESET}"
  echo ""
}

# --- Utility: log event -----------------------------------------------------

_sentinel_log_event() {
  local tool="$1"
  local cmd="$2"
  local detections="$3"
  local risk="$4"
  local action="$5"

  local ts
  ts=$(date '+%Y-%m-%dT%H:%M:%S%z')
  local truncated_cmd="${cmd:0:200}"

  # Escape quotes for log
  truncated_cmd="${truncated_cmd//\"/\\\"}"

  echo "${ts} | user=${USER} | tool=${tool} | risk=${risk} | action=${action} | detections=${detections} | cmd=${truncated_cmd}" >> "$SENTINEL_LOG" 2>/dev/null
}

# --- Utility: report to backend (non-blocking) -----------------------------

_sentinel_report() {
  local tool="$1"
  local cmd="$2"
  local detections="$3"
  local risk="$4"

  [[ -z "$SENTINEL_API_URL" ]] && return

  # Only report if curl is available
  command -v curl &>/dev/null || return

  local truncated_cmd="${cmd:0:200}"
  # Escape for JSON
  truncated_cmd="${truncated_cmd//\\/\\\\}"
  truncated_cmd="${truncated_cmd//\"/\\\"}"
  detections="${detections//\\/\\\\}"
  detections="${detections//\"/\\\"}"

  curl -s -X POST "${SENTINEL_API_URL}/api/terminal-events" \
    -H "Content-Type: application/json" \
    -d "{\"user\":\"${USER}\",\"tool\":\"${tool}\",\"command\":\"${truncated_cmd}\",\"detections\":\"${detections}\",\"risk\":\"${risk}\",\"timestamp\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\"}" &>/dev/null &
}

# --- Preexec function -------------------------------------------------------
# This function is called before each command executes.
# If bash-preexec is loaded, it will be picked up automatically.
# Otherwise, we install a DEBUG trap below.

preexec() {
  # Reset block flag
  _SENTINEL_BLOCK_NEXT=0

  # Skip if disabled
  [[ "$SENTINEL_ENABLED" != "1" ]] && return

  local cmd="$1"

  # Fast path: skip if not an AI-related command
  local detected_tool
  detected_tool=$(_sentinel_is_ai_command "$cmd")
  if [[ $? -ne 0 ]]; then
    return
  fi

  # AI tool detected — scan for sensitive data
  local detections
  detections=$(_sentinel_scan_sensitive "$cmd")
  local has_sensitive=$?

  # If AI tool detected but no sensitive data, just log
  if [[ $has_sensitive -ne 0 ]]; then
    _sentinel_log_event "$detected_tool" "$cmd" "ai_tool_usage" "LOW" "allowed"
    _sentinel_report "$detected_tool" "$cmd" "ai_tool_usage" "LOW"
    return
  fi

  # Sensitive data found
  local risk
  risk=$(_sentinel_risk_level "$detections")

  case "$SENTINEL_MODE" in
    log)
      _sentinel_log_event "$detected_tool" "$cmd" "$detections" "$risk" "logged"
      _sentinel_report "$detected_tool" "$cmd" "$detections" "$risk"
      ;;

    block)
      if [[ "$risk" == "HIGH" || "$risk" == "CRITICAL" ]]; then
        _sentinel_display_warning "$detected_tool" "$detections" "$risk"
        _sentinel_log_event "$detected_tool" "$cmd" "$detections" "$risk" "blocked"
        _sentinel_report "$detected_tool" "$cmd" "$detections" "$risk"
        _SENTINEL_BLOCK_NEXT=1
      else
        _sentinel_display_warning "$detected_tool" "$detections" "$risk"
        _sentinel_log_event "$detected_tool" "$cmd" "$detections" "$risk" "warned"
        _sentinel_report "$detected_tool" "$cmd" "$detections" "$risk"
      fi
      ;;

    warn|*)
      _sentinel_display_warning "$detected_tool" "$detections" "$risk"
      local answer
      read -r -p "  ${_SEN_YELLOW}>${_SEN_RESET} " answer
      if [[ "$answer" != [yY] && "$answer" != [yY][eE][sS] ]]; then
        _sentinel_log_event "$detected_tool" "$cmd" "$detections" "$risk" "blocked_by_user"
        _sentinel_report "$detected_tool" "$cmd" "$detections" "$risk"
        _SENTINEL_BLOCK_NEXT=1
      else
        _sentinel_log_event "$detected_tool" "$cmd" "$detections" "$risk" "allowed_by_user"
        _sentinel_report "$detected_tool" "$cmd" "$detections" "$risk"
      fi
      ;;
  esac
}

# --- DEBUG trap fallback (if bash-preexec is not loaded) --------------------
# bash-preexec provides a clean preexec/precmd interface. If it's not
# installed, we fall back to a DEBUG trap that calls preexec() manually.

if ! declare -F __bp_preexec_invoke_exec &>/dev/null; then
  _sentinel_debug_trap() {
    # Only run for the top-level command (not subshells, completions)
    [[ "$BASH_COMMAND" == "$PROMPT_COMMAND" ]] && return
    [[ "$BASH_COMMAND" == _sentinel_* ]] && return
    [[ "$BASH_COMMAND" == sentinel-* ]] && return

    # Avoid recursion
    if [[ "$_SENTINEL_LAST_COMMAND" == "$BASH_COMMAND" ]]; then
      return
    fi
    _SENTINEL_LAST_COMMAND="$BASH_COMMAND"

    preexec "$BASH_COMMAND"

    if [[ "$_SENTINEL_BLOCK_NEXT" -eq 1 ]]; then
      _SENTINEL_BLOCK_NEXT=0
      # Return non-zero to signal failure; in practice the DEBUG trap
      # cannot fully cancel execution, but combined with extdebug it can.
      return 1
    fi
  }

  # extdebug allows the DEBUG trap to prevent command execution when
  # the trap handler returns non-zero.
  shopt -s extdebug 2>/dev/null
  trap '_sentinel_debug_trap' DEBUG
fi

# --- Convenience functions --------------------------------------------------

sentinel-status() {
  echo ""
  echo "${_SEN_CYAN}${_SEN_BOLD}Sentinel Terminal Monitor${_SEN_RESET}"
  echo "${_SEN_BLUE}-------------------------------------${_SEN_RESET}"
  echo "  Enabled:   $([ "$SENTINEL_ENABLED" = "1" ] && echo "${_SEN_CYAN}YES${_SEN_RESET}" || echo "${_SEN_RED}NO${_SEN_RESET}")"
  echo "  Mode:      ${_SEN_BOLD}${SENTINEL_MODE}${_SEN_RESET}"
  echo "  API URL:   ${SENTINEL_API_URL}"
  echo "  Log file:  ${SENTINEL_LOG}"
  echo "  Shell:     bash ${BASH_VERSION}"
  if declare -F __bp_preexec_invoke_exec &>/dev/null; then
    echo "  Hook:      bash-preexec"
  else
    echo "  Hook:      DEBUG trap (install bash-preexec for better support)"
  fi
  echo ""
  if [[ -f "$SENTINEL_LOG" ]]; then
    local count
    count=$(wc -l < "$SENTINEL_LOG" | tr -d ' ')
    echo "  Log entries: ${count}"
    echo "  Last event:  $(tail -1 "$SENTINEL_LOG" 2>/dev/null | cut -d'|' -f1)"
  else
    echo "  Log entries: 0 (no log file yet)"
  fi
  echo "${_SEN_BLUE}-------------------------------------${_SEN_RESET}"
  echo ""
}

sentinel-enable() {
  export SENTINEL_ENABLED=1
  echo "${_SEN_CYAN}Sentinel monitoring enabled.${_SEN_RESET}"
}

sentinel-disable() {
  export SENTINEL_ENABLED=0
  echo "${_SEN_YELLOW}Sentinel monitoring disabled.${_SEN_RESET}"
}

sentinel-log() {
  if [[ -f "$SENTINEL_LOG" ]]; then
    tail -f "$SENTINEL_LOG"
  else
    echo "No log file found at ${SENTINEL_LOG}"
  fi
}

# --- Initialization ---------------------------------------------------------

# Source user config if it exists
[[ -f "$HOME/.sentinel/config" ]] && source "$HOME/.sentinel/config"

# Print startup banner (only in interactive shells)
if [[ $- == *i* ]] && [[ "$SENTINEL_ENABLED" == "1" ]]; then
  echo "${_SEN_BLUE}Sentinel${_SEN_RESET} terminal monitor active (mode: ${_SEN_BOLD}${SENTINEL_MODE}${_SEN_RESET})"
fi
