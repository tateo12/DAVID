#!/usr/bin/env zsh
# ============================================================================
# Sentinel Shell Hook — ZSH Plugin
# AI Security Supervisor: Terminal Monitoring
# ============================================================================
# Source this file in your .zshrc:
#   source ~/.sentinel/sentinel.zsh
# ============================================================================

# --- Configuration (env vars with defaults) ---------------------------------

: "${SENTINEL_ENABLED:=1}"
: "${SENTINEL_API_URL:=http://localhost:8000}"
: "${SENTINEL_MODE:=warn}"        # warn | block | log
: "${SENTINEL_LOG:=$HOME/.sentinel/terminal.log}"

# --- Internal state ---------------------------------------------------------

typeset -g _SENTINEL_BLOCK_NEXT=0

# Ensure log directory exists
[[ -d "${SENTINEL_LOG:h}" ]] || mkdir -p "${SENTINEL_LOG:h}"

# --- Color constants --------------------------------------------------------

typeset -g _SEN_RED=$'\033[0;31m'
typeset -g _SEN_YELLOW=$'\033[0;33m'
typeset -g _SEN_BLUE=$'\033[0;34m'
typeset -g _SEN_CYAN=$'\033[0;36m'
typeset -g _SEN_BOLD=$'\033[1m'
typeset -g _SEN_RESET=$'\033[0m'

# --- Known AI tools and domains ---------------------------------------------

typeset -ga _SENTINEL_AI_TOOLS=(
  claude aider copilot sgpt llm chatgpt openai ollama cursor
)

typeset -ga _SENTINEL_AI_DOMAINS=(
  api.openai.com
  api.anthropic.com
  api.mistral.ai
  generativelanguage.googleapis.com
  api.cohere.ai
)

# --- Utility: check if command involves AI tools ----------------------------

_sentinel_is_ai_command() {
  local cmd="$1"
  local cmd_lower="${cmd:l}"

  # Check direct CLI tool invocation (first word or after pipe/sudo/env)
  local tool
  for tool in "${_SENTINEL_AI_TOOLS[@]}"; do
    # Matches: tool at start, after pipe, after sudo/env, or as subcommand
    if [[ "$cmd_lower" =~ "(^|[|;&] *|sudo |env )(${tool})( |$)" ]]; then
      echo "$tool"
      return 0
    fi
  done

  # Check API calls via curl/wget/httpie
  if [[ "$cmd_lower" =~ "(^|[|;&] *)(curl|wget|http|https) " ]]; then
    local domain
    for domain in "${_SENTINEL_AI_DOMAINS[@]}"; do
      if [[ "$cmd" == *"$domain"* ]]; then
        echo "api:$domain"
        return 0
      fi
    done
  fi

  # Check pipes into AI tools
  if [[ "$cmd" == *"|"* ]]; then
    local tool
    for tool in "${_SENTINEL_AI_TOOLS[@]}"; do
      if [[ "$cmd_lower" =~ "\\| *${tool}( |$)" ]]; then
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
  local detections=()

  # SSN pattern
  if [[ "$cmd" =~ '[0-9]{3}-[0-9]{2}-[0-9]{4}' ]]; then
    detections+=("PII (SSN pattern)")
  fi

  # Credit card pattern
  if [[ "$cmd" =~ '[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}' ]]; then
    detections+=("PII (credit card pattern)")
  fi

  # API keys
  if [[ "$cmd" =~ '(sk-|sk_live_|sk_test_|AKIA|ghp_|xoxb-|xapp-)[A-Za-z0-9_-]{10,}' ]]; then
    detections+=("Secret (API key)")
  fi

  # Passwords
  if [[ "$cmd" =~ '(password|passwd|pwd|secret)[[:space:]]*[=:][[:space:]]*[^[:space:]]+' ]]; then
    detections+=("Secret (password/credential)")
  fi

  # Connection strings
  if [[ "$cmd" =~ '(postgres|mysql|redis|mongodb)://[^[:space:]]+' ]]; then
    detections+=("Secret (connection string)")
  fi

  # Email dump (3+ emails in one command)
  local email_count
  email_count=$(echo "$cmd" | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$email_count" -ge 3 ]]; then
    detections+=("PII (email dump: ${email_count} addresses)")
  fi

  if [[ ${#detections[@]} -gt 0 ]]; then
    # Return detections joined by |
    local IFS='|'
    echo "${detections[*]}"
    return 0
  fi

  return 1
}

# --- Utility: calculate risk level ------------------------------------------

_sentinel_risk_level() {
  local detections="$1"
  # High risk: secrets, SSN, credit cards
  if [[ "$detections" == *"Secret"* ]] || [[ "$detections" == *"SSN"* ]] || [[ "$detections" == *"credit card"* ]]; then
    echo "HIGH"
    return
  fi
  # Medium risk: PII
  if [[ "$detections" == *"PII"* ]]; then
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
  local IFS='|'
  local parts=( ${(s:|:)detections} )
  for det in "${parts[@]}"; do
    det="${det## }"
    det="${det%% }"
    echo "${border}|  ${risk_color}!! Detected: ${det}${_SEN_RESET}${border}$(printf '%*s' $((34 - ${#det})) '')|${_SEN_RESET}"
  done

  echo "${border}|  Tool: ${tool}$(printf '%*s' $((45 - ${#tool})) '')|${_SEN_RESET}"
  echo "${border}|  ${risk_color}Risk: ${risk}${_SEN_RESET}${border}$(printf '%*s' $((47 - ${#risk})) '')|${_SEN_RESET}"
  echo "${border}|                                                     |${_SEN_RESET}"

  if [[ "$SENTINEL_MODE" == "warn" ]]; then
    echo "${border}|  Proceed with this command? [y/N]                   |${_SEN_RESET}"
  elif [[ "$SENTINEL_MODE" == "block" ]] && [[ "$risk" == "HIGH" || "$risk" == "CRITICAL" ]]; then
    echo "${border}|  ${_SEN_RED}BLOCKED — high risk command prevented${_SEN_RESET}${border}                |${_SEN_RESET}"
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
  (( $+commands[curl] )) || return

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

# --- Preexec hook: runs before every command --------------------------------

_sentinel_preexec() {
  # Reset block flag
  _SENTINEL_BLOCK_NEXT=0

  # Skip if disabled
  [[ "$SENTINEL_ENABLED" != "1" ]] && return

  local cmd="$1"

  # Fast path: skip trivially safe commands (no AI tool, no pipe)
  # Check if the command even starts with or contains an AI-related word
  local detected_tool
  detected_tool=$(_sentinel_is_ai_command "$cmd")
  if [[ $? -ne 0 ]]; then
    return
  fi

  # AI tool detected — now scan for sensitive data
  local detections
  detections=$(_sentinel_scan_sensitive "$cmd")
  local has_sensitive=$?

  # If AI tool is detected but no sensitive data, log and allow
  if [[ $has_sensitive -ne 0 ]]; then
    _sentinel_log_event "$detected_tool" "$cmd" "ai_tool_usage" "LOW" "allowed"
    _sentinel_report "$detected_tool" "$cmd" "ai_tool_usage" "LOW"
    return
  fi

  # Sensitive data found in AI command
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
      echo -n "${_SEN_YELLOW}  > ${_SEN_RESET}"
      read -r "answer?  "
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

# --- Precmd hook: enforce blocking via command replacement ------------------
# In zsh, preexec cannot cancel execution. We use a two-phase approach:
# preexec sets _SENTINEL_BLOCK_NEXT=1, and we hook into the execution
# via the zsh `exec` mechanism. However, the cleanest way is to use
# `zle` or the `TRAPDEBUG` approach. For simplicity and reliability, we
# use the `preexec` + `keyboard interrupt` simulation via `kill`.

# Alternative blocking mechanism using zsh's `exec` replacement:
# We wrap the actual execution by redefining the buffer if blocked.

_sentinel_maybe_block() {
  if [[ "$_SENTINEL_BLOCK_NEXT" -eq 1 ]]; then
    _SENTINEL_BLOCK_NEXT=0
    # Replace the command line buffer with a no-op
    # This is called from the zle accept-line widget
    BUFFER=":"
  fi
}

# Override accept-line widget to allow blocking
_sentinel_accept_line() {
  # Run preexec logic before accepting
  _sentinel_preexec "$BUFFER"

  if [[ "$_SENTINEL_BLOCK_NEXT" -eq 1 ]]; then
    _SENTINEL_BLOCK_NEXT=0
    BUFFER=":"
    zle reset-prompt
  fi

  zle .accept-line
}

# Register the widget and keybinding
zle -N accept-line _sentinel_accept_line

# --- Convenience functions --------------------------------------------------

sentinel-status() {
  echo ""
  echo "${_SEN_CYAN}${_SEN_BOLD}Sentinel Terminal Monitor${_SEN_RESET}"
  echo "${_SEN_BLUE}─────────────────────────────────────${_SEN_RESET}"
  echo "  Enabled:   $([ "$SENTINEL_ENABLED" = "1" ] && echo "${_SEN_CYAN}YES${_SEN_RESET}" || echo "${_SEN_RED}NO${_SEN_RESET}")"
  echo "  Mode:      ${_SEN_BOLD}${SENTINEL_MODE}${_SEN_RESET}"
  echo "  API URL:   ${SENTINEL_API_URL}"
  echo "  Log file:  ${SENTINEL_LOG}"
  echo "  Shell:     zsh ${ZSH_VERSION}"
  echo ""
  if [[ -f "$SENTINEL_LOG" ]]; then
    local count
    count=$(wc -l < "$SENTINEL_LOG" | tr -d ' ')
    echo "  Log entries: ${count}"
    echo "  Last event:  $(tail -1 "$SENTINEL_LOG" 2>/dev/null | cut -d'|' -f1)"
  else
    echo "  Log entries: 0 (no log file yet)"
  fi
  echo "${_SEN_BLUE}─────────────────────────────────────${_SEN_RESET}"
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
if [[ -o interactive ]] && [[ "$SENTINEL_ENABLED" == "1" ]]; then
  echo "${_SEN_BLUE}Sentinel${_SEN_RESET} terminal monitor active (mode: ${_SEN_BOLD}${SENTINEL_MODE}${_SEN_RESET})"
fi
