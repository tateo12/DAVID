(() => {
  if (window.__sentinelPageHookInstalled) {
    return;
  }
  window.__sentinelPageHookInstalled = true;

  const MESSAGE_SOURCE = "sentinel_page_hook";
  const MAX_TEXT_LEN = 12000;
  const recentFingerprints = new Set();

  function hashText(value) {
    const text = value || "";
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return `${hash}`;
  }

  function markSeen(fingerprint) {
    if (!fingerprint) return false;
    if (recentFingerprints.has(fingerprint)) return true;
    recentFingerprints.add(fingerprint);
    if (recentFingerprints.size > 200) {
      const first = recentFingerprints.values().next().value;
      recentFingerprints.delete(first);
    }
    return false;
  }

  function safeToString(value) {
    if (typeof value === "string") return value;
    if (value == null) return "";
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }

  function parseMaybeJson(body) {
    if (typeof body === "string") {
      const trimmed = body.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          return JSON.parse(trimmed);
        } catch (_error) {
          return null;
        }
      }
      return null;
    }
    if (body && typeof body === "object") {
      return body;
    }
    return null;
  }

  function extractPromptFromJson(payload) {
    if (!payload || typeof payload !== "object") return null;

    const directCandidates = [
      payload.prompt,
      payload.input,
      payload.query,
      payload.message,
      payload.text,
      payload.content,
    ];
    for (const candidate of directCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }

    if (Array.isArray(payload.messages)) {
      const userMessages = payload.messages
        .filter((msg) => (msg?.role || "").toLowerCase() === "user")
        .flatMap((msg) => {
          if (typeof msg?.content === "string") return [msg.content];
          if (Array.isArray(msg?.content)) {
            return msg.content
              .map((part) => {
                if (!part) return "";
                if (typeof part === "string") return part;
                if (typeof part?.text === "string") return part.text;
                if (typeof part?.content === "string") return part.content;
                return "";
              })
              .filter(Boolean);
          }
          return [];
        })
        .filter(Boolean);
      if (userMessages.length) {
        return userMessages.join("\n\n").trim();
      }
    }

    if (Array.isArray(payload.contents)) {
      const textParts = payload.contents.flatMap((entry) => {
        const parts = Array.isArray(entry?.parts) ? entry.parts : [];
        return parts
          .map((part) => {
            if (typeof part === "string") return part;
            if (typeof part?.text === "string") return part.text;
            return "";
          })
          .filter(Boolean);
      });
      if (textParts.length) {
        return textParts.join("\n\n").trim();
      }
    }

    if (payload?.input_message && typeof payload.input_message?.content === "string") {
      return payload.input_message.content.trim();
    }

    return null;
  }

  function isLikelyAiRequest(url) {
    const value = (url || "").toLowerCase();
    return (
      value.includes("/conversation") ||
      value.includes("/chat/completions") ||
      value.includes("/messages") ||
      value.includes("/generatecontent") ||
      value.includes("/models/") ||
      value.includes("/api/")
    );
  }

  function postPrompt(rawPrompt, details) {
    const promptText = (rawPrompt || "").slice(0, MAX_TEXT_LEN).trim();
    if (!promptText) return;
    const fingerprint = hashText(`${details.method || "unknown"}:${details.url || ""}:${promptText}`);
    if (markSeen(fingerprint)) return;

    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: "sentinel_network_prompt",
        payload: {
          prompt_text: promptText,
          page_url: window.location.href,
          request_url: details.url || "",
          request_method: details.method || "unknown",
          capture_method: details.capture_method || "network_hook",
          captured_at: new Date().toISOString(),
        },
      },
      "*"
    );
  }

  function inspectBodyForPrompt(body, details) {
    if (body == null) return;

    if (typeof body === "string") {
      const parsed = parseMaybeJson(body);
      if (parsed) {
        const prompt = extractPromptFromJson(parsed);
        if (prompt) {
          postPrompt(prompt, details);
          return;
        }
      }

      // Some websocket frames and app payloads are plain text.
      const text = body.trim();
      if (text && text.length > 8 && text.length < MAX_TEXT_LEN) {
        postPrompt(text, details);
      }
      return;
    }

    const parsed = parseMaybeJson(body);
    if (parsed) {
      const prompt = extractPromptFromJson(parsed);
      if (prompt) {
        postPrompt(prompt, details);
      }
    }
  }

  function installFetchHook() {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== "function") return;

    window.fetch = async function hookedFetch(input, init) {
      const url = typeof input === "string" ? input : input?.url || "";
      const method = (init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();

      if (isLikelyAiRequest(url) && init?.body) {
        inspectBodyForPrompt(init.body, { url, method, capture_method: "fetch" });
      }

      return originalFetch.apply(this, arguments);
    };
  }

  function installXhrHook() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function hookedOpen(method, url) {
      this.__sentinel_url = safeToString(url);
      this.__sentinel_method = safeToString(method || "GET").toUpperCase();
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function hookedSend(body) {
      const url = this.__sentinel_url || "";
      if (isLikelyAiRequest(url) && body != null) {
        inspectBodyForPrompt(body, {
          url,
          method: this.__sentinel_method || "POST",
          capture_method: "xhr",
        });
      }
      return originalSend.apply(this, arguments);
    };
  }

  function installWebSocketHook() {
    const originalSend = WebSocket.prototype.send;
    if (typeof originalSend !== "function") return;

    WebSocket.prototype.send = function hookedWsSend(data) {
      try {
        const url = this?.url || "";
        if (isLikelyAiRequest(url)) {
          inspectBodyForPrompt(data, {
            url,
            method: "WS_SEND",
            capture_method: "websocket",
          });
        }
      } catch (_error) {
        // Ignore capture issues and preserve app behavior.
      }
      return originalSend.apply(this, arguments);
    };
  }

  installFetchHook();
  installXhrHook();
  installWebSocketHook();
})();
