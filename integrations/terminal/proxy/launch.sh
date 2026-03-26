#!/bin/bash
# =============================================================================
# Sentinel AI Security Proxy — Launcher
# =============================================================================
# Starts the mitmproxy-based HTTPS proxy that monitors AI API traffic
# for sensitive data leakage.
#
# Usage:
#   ./launch.sh                          # default: mitmdump on port 8080
#   ./launch.sh --port 9090              # custom port
#   ./launch.sh --mode mitmproxy         # interactive TUI
#   ./launch.sh --mode mitmweb           # web-based UI
#   ./launch.sh --port 8080 --mode mitmweb
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADDON="${SCRIPT_DIR}/sentinel_proxy.py"

# Defaults
PORT=8080
MODE="mitmdump"   # mitmdump (headless) | mitmproxy (TUI) | mitmweb (web UI)
SENTINEL_DIR="${HOME}/.sentinel"
CERT_DIR="${SCRIPT_DIR}/certs"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)
            PORT="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--port PORT] [--mode MODE]"
            echo ""
            echo "Options:"
            echo "  --port PORT   Proxy listen port (default: 8080)"
            echo "  --mode MODE   mitmdump (headless, default) | mitmproxy (TUI) | mitmweb (web UI)"
            echo ""
            echo "Examples:"
            echo "  $0                           # headless on port 8080"
            echo "  $0 --mode mitmproxy          # interactive terminal UI"
            echo "  $0 --port 9090 --mode mitmweb  # web UI on port 9090"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate mode
case "$MODE" in
    mitmdump|mitmproxy|mitmweb) ;;
    *)
        echo "Error: Invalid mode '$MODE'. Use: mitmdump | mitmproxy | mitmweb"
        exit 1
        ;;
esac

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if ! command -v "$MODE" &>/dev/null; then
    echo "Error: '$MODE' not found. Install with: pip install mitmproxy"
    exit 1
fi

if ! python3 -c "import yaml" &>/dev/null; then
    echo "Error: PyYAML not found. Install with: pip install pyyaml"
    exit 1
fi

# Create directories
mkdir -p "${SENTINEL_DIR}"
mkdir -p "${CERT_DIR}"

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo ""
echo "  ============================================"
echo "    SENTINEL AI SECURITY PROXY"
echo "  ============================================"
echo "  Mode     : ${MODE}"
echo "  Port     : ${PORT}"
echo "  Addon    : ${ADDON}"
echo "  Logs     : ${SENTINEL_DIR}/proxy.log"
echo "  Certs    : ${CERT_DIR}"
echo "  ============================================"
echo ""
echo "  SETUP INSTRUCTIONS:"
echo ""
echo "  1. Configure your shell to use the proxy:"
echo "     export HTTPS_PROXY=http://localhost:${PORT}"
echo "     export HTTP_PROXY=http://localhost:${PORT}"
echo ""
echo "  2. Trust the mitmproxy CA certificate:"
echo ""
echo "     macOS:"
echo "       sudo security add-trusted-cert -d -r trustRoot \\"
echo "         -k /Library/Keychains/System.keychain \\"
echo "         ${CERT_DIR}/mitmproxy-ca-cert.pem"
echo ""
echo "     Linux:"
echo "       sudo cp ${CERT_DIR}/mitmproxy-ca-cert.pem \\"
echo "         /usr/local/share/ca-certificates/mitmproxy.crt"
echo "       sudo update-ca-certificates"
echo ""
echo "     Python (requests library):"
echo "       export REQUESTS_CA_BUNDLE=${CERT_DIR}/mitmproxy-ca-cert.pem"
echo ""
echo "     Node.js:"
echo "       export NODE_EXTRA_CA_CERTS=${CERT_DIR}/mitmproxy-ca-cert.pem"
echo ""
echo "  3. The proxy will auto-generate certs on first run."
echo "     After trusting the CA, HTTPS traffic will be transparent."
echo ""
echo "  Press Ctrl+C to stop the proxy and view session summary."
echo "  ============================================"
echo ""

# ---------------------------------------------------------------------------
# Launch
# ---------------------------------------------------------------------------

# Trap SIGINT for clean shutdown message
cleanup() {
    echo ""
    echo "  [Sentinel] Shutting down proxy..."
    echo "  [Sentinel] Check ${SENTINEL_DIR}/proxy.log for full audit trail."
    echo ""
    exit 0
}
trap cleanup SIGINT SIGTERM

# Launch mitmproxy with the Sentinel addon
exec "$MODE" \
    -s "${ADDON}" \
    --listen-port "${PORT}" \
    --set "confdir=${CERT_DIR}" \
    --set "connection_strategy=lazy"
