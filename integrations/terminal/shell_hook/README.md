# Sentinel Shell Hook

Terminal monitoring plugin for the Sentinel AI Security Supervisor. Intercepts commands before execution to detect sensitive data being sent to AI CLI tools.

## What It Does

- Monitors commands that invoke AI tools (Claude, Aider, Copilot, Ollama, etc.)
- Scans for sensitive data: SSNs, credit cards, API keys, passwords, connection strings
- Warns, blocks, or silently logs depending on configuration
- Reports events to the Sentinel backend API

## Quick Install

```bash
bash install.sh
```

Then restart your terminal or run `source ~/.zshrc` (or `~/.bashrc`).

## Manual Install

1. Copy the plugin file to `~/.sentinel/`:

```bash
mkdir -p ~/.sentinel
cp sentinel.zsh ~/.sentinel/   # for zsh
cp sentinel.bash ~/.sentinel/  # for bash
```

2. Add to your shell RC file:

```bash
# For zsh (~/.zshrc):
source ~/.sentinel/sentinel.zsh

# For bash (~/.bashrc):
source ~/.sentinel/sentinel.bash
```

3. Restart your terminal.

For bash users: install [bash-preexec](https://github.com/rcaloras/bash-preexec) for the best experience. Without it, Sentinel falls back to a DEBUG trap.

## Configuration

Set environment variables before sourcing the plugin, or edit `~/.sentinel/config`:

| Variable | Default | Description |
|---|---|---|
| `SENTINEL_ENABLED` | `1` | Enable (`1`) or disable (`0`) monitoring |
| `SENTINEL_MODE` | `warn` | `warn` = prompt user, `block` = prevent high-risk, `log` = silent |
| `SENTINEL_API_URL` | `http://localhost:8000` | Backend API for event reporting |
| `SENTINEL_LOG` | `~/.sentinel/terminal.log` | Log file path |

Example override in your RC file:

```bash
export SENTINEL_MODE=block
source ~/.sentinel/sentinel.zsh
```

## Commands

| Command | Description |
|---|---|
| `sentinel-status` | Print current config and monitoring status |
| `sentinel-enable` | Turn on monitoring |
| `sentinel-disable` | Turn off monitoring |
| `sentinel-log` | Tail the event log file |

## How It Works

1. A `preexec` hook fires before every command you type
2. Fast check: is this an AI-related command? If not, skip entirely (no overhead)
3. If AI tool detected, scan the full command for sensitive data patterns
4. Based on mode (`warn`/`block`/`log`), either prompt, block, or silently log
5. Events are reported to the Sentinel backend asynchronously

## Detected Patterns

- **PII**: SSN numbers, credit card numbers, bulk email addresses
- **Secrets**: API keys (OpenAI, AWS, GitHub, Slack), passwords, connection strings
- **AI tools**: claude, aider, copilot, sgpt, llm, chatgpt, openai, ollama, cursor
- **AI APIs**: curl/wget calls to OpenAI, Anthropic, Mistral, Google AI, Cohere

## Uninstall

1. Remove the source line from your shell RC file (`~/.zshrc` or `~/.bashrc`):

```bash
# Delete these lines:
# Sentinel AI Security Monitor
source "~/.sentinel/sentinel.zsh"
```

2. Remove the sentinel directory:

```bash
rm -rf ~/.sentinel
```

3. Restart your terminal.
