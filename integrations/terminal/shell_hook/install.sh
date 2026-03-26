#!/bin/sh
# ============================================================================
# Sentinel Shell Hook — Installer
# AI Security Supervisor: Terminal Monitoring
# ============================================================================
# Usage: bash install.sh
# Safe to run multiple times (idempotent).
# ============================================================================

set -e

# --- Constants --------------------------------------------------------------

SENTINEL_DIR="$HOME/.sentinel"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

CYAN='\033[0;36m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

# --- Helper functions -------------------------------------------------------

info()  { printf "${BLUE}[sentinel]${RESET} %s\n" "$1"; }
ok()    { printf "${GREEN}[sentinel]${RESET} %s\n" "$1"; }
warn()  { printf "${YELLOW}[sentinel]${RESET} %s\n" "$1"; }
error() { printf "${RED}[sentinel]${RESET} %s\n" "$1" >&2; }

# --- Step 1: Create sentinel directory --------------------------------------

info "Creating ${SENTINEL_DIR}/ directory..."
mkdir -p "$SENTINEL_DIR"
ok "Directory ready: ${SENTINEL_DIR}"

# --- Step 2: Write default config -------------------------------------------

CONFIG_FILE="$SENTINEL_DIR/config"
if [ ! -f "$CONFIG_FILE" ]; then
  info "Writing default config to ${CONFIG_FILE}..."
  cat > "$CONFIG_FILE" << 'CONFIGEOF'
# Sentinel Shell Hook Configuration
# Edit these values or override with environment variables.

# Enable/disable monitoring (1 = enabled, 0 = disabled)
# SENTINEL_ENABLED=1

# Operating mode: warn | block | log
#   warn  - show warning and ask user to proceed (default)
#   block - prevent execution of high-risk commands
#   log   - silently log without interrupting
# SENTINEL_MODE=warn

# Backend API URL for reporting events
# SENTINEL_API_URL=http://localhost:8000

# Log file location
# SENTINEL_LOG=~/.sentinel/terminal.log
CONFIGEOF
  ok "Default config written."
else
  warn "Config file already exists, skipping: ${CONFIG_FILE}"
fi

# --- Step 3: Detect shell ---------------------------------------------------

DETECTED_SHELL=""
PLUGIN_FILE=""
RC_FILE=""

case "$SHELL" in
  */zsh)
    DETECTED_SHELL="zsh"
    PLUGIN_FILE="sentinel.zsh"
    RC_FILE="$HOME/.zshrc"
    ;;
  */bash)
    DETECTED_SHELL="bash"
    PLUGIN_FILE="sentinel.bash"
    RC_FILE="$HOME/.bashrc"
    ;;
  *)
    warn "Unrecognized shell: $SHELL"
    warn "Attempting to detect from running process..."
    if [ -n "$ZSH_VERSION" ]; then
      DETECTED_SHELL="zsh"
      PLUGIN_FILE="sentinel.zsh"
      RC_FILE="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
      DETECTED_SHELL="bash"
      PLUGIN_FILE="sentinel.bash"
      RC_FILE="$HOME/.bashrc"
    else
      error "Could not detect shell. Please install manually."
      error "See README.md for manual installation instructions."
      exit 1
    fi
    ;;
esac

info "Detected shell: ${DETECTED_SHELL}"

# --- Step 4: Copy plugin file -----------------------------------------------

SOURCE_FILE="${SCRIPT_DIR}/${PLUGIN_FILE}"
DEST_FILE="${SENTINEL_DIR}/${PLUGIN_FILE}"

if [ ! -f "$SOURCE_FILE" ]; then
  error "Plugin file not found: ${SOURCE_FILE}"
  error "Make sure you're running install.sh from the shell_hook directory."
  exit 1
fi

info "Copying ${PLUGIN_FILE} to ${SENTINEL_DIR}/..."
cp "$SOURCE_FILE" "$DEST_FILE"
chmod +x "$DEST_FILE"
ok "Plugin installed: ${DEST_FILE}"

# Also copy the other shell variant if it exists (for users who switch shells)
if [ "$DETECTED_SHELL" = "zsh" ] && [ -f "${SCRIPT_DIR}/sentinel.bash" ]; then
  cp "${SCRIPT_DIR}/sentinel.bash" "${SENTINEL_DIR}/sentinel.bash"
  chmod +x "${SENTINEL_DIR}/sentinel.bash"
  info "Also copied bash variant for convenience."
elif [ "$DETECTED_SHELL" = "bash" ] && [ -f "${SCRIPT_DIR}/sentinel.zsh" ]; then
  cp "${SCRIPT_DIR}/sentinel.zsh" "${SENTINEL_DIR}/sentinel.zsh"
  chmod +x "${SENTINEL_DIR}/sentinel.zsh"
  info "Also copied zsh variant for convenience."
fi

# --- Step 5: Add source line to shell RC file --------------------------------

SOURCE_LINE="source \"${SENTINEL_DIR}/${PLUGIN_FILE}\""
MARKER="# Sentinel AI Security Monitor"

if [ -f "$RC_FILE" ]; then
  if grep -qF "sentinel.zsh" "$RC_FILE" 2>/dev/null || grep -qF "sentinel.bash" "$RC_FILE" 2>/dev/null; then
    warn "Sentinel is already sourced in ${RC_FILE}, skipping."
  else
    info "Adding source line to ${RC_FILE}..."
    printf '\n%s\n%s\n' "$MARKER" "$SOURCE_LINE" >> "$RC_FILE"
    ok "Added to ${RC_FILE}"
  fi
else
  info "Creating ${RC_FILE} with sentinel source line..."
  printf '%s\n%s\n' "$MARKER" "$SOURCE_LINE" > "$RC_FILE"
  ok "Created ${RC_FILE}"
fi

# --- Summary ----------------------------------------------------------------

echo ""
echo "${CYAN}${BOLD}============================================${RESET}"
echo "${CYAN}${BOLD}  Sentinel Shell Hook — Installation Complete${RESET}"
echo "${CYAN}${BOLD}============================================${RESET}"
echo ""
echo "  Shell:    ${BOLD}${DETECTED_SHELL}${RESET}"
echo "  Plugin:   ${DEST_FILE}"
echo "  Config:   ${CONFIG_FILE}"
echo "  RC file:  ${RC_FILE}"
echo "  Log:      ${SENTINEL_DIR}/terminal.log"
echo ""
echo "  ${BOLD}To activate now, run:${RESET}"
echo "    source ${RC_FILE}"
echo ""
echo "  ${BOLD}Or start a new terminal session.${RESET}"
echo ""
echo "  ${BOLD}Commands:${RESET}"
echo "    sentinel-status   — Show current configuration"
echo "    sentinel-enable   — Enable monitoring"
echo "    sentinel-disable  — Disable monitoring"
echo "    sentinel-log      — Tail the event log"
echo ""
echo "  ${BOLD}Configuration:${RESET}"
echo "    Edit ${CONFIG_FILE}"
echo "    Or set environment variables (SENTINEL_MODE, etc.)"
echo ""
