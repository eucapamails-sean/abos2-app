// opencode-api.js — OpenCode REST API Client (browser-side, proxied via CGI backend)
// All requests go through /cgi-bin/api.py/opencode-proxy to avoid CORS issues.
// Credentials are stored server-side in the settings table — never sent from the browser.

const OpenCodeAPI = {

  // ── Proxy helper ──────────────────────────────────────────────────────────
  // Every call goes through the CGI backend which forwards to OpenCode server-side.

  async _proxy(method, path, body) {
    const payload = { method, path };
    if (body !== undefined) payload.body = body;

    // Use AbortController for a 5-minute timeout (OpenCode can be slow building multiple files)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min

    let response;
    try {
      response = await fetch(CGI_BIN + '/api.py/opencode-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out — OpenCode may still be working. Try again in a moment.');
      }
      throw new Error('Network error — check your connection and try again.');
    }
    clearTimeout(timeoutId);

    const result = await response.json();

    if (!result.ok) {
      const msg = result.error || `HTTP ${result.status}`;
      throw new Error(`OpenCode API error ${result.status}: ${msg}`);
    }

    return result.data;
  },

  // ── Configuration check ────────────────────────────────────────────────────
  // Credentials live on the server. We just check if they've been saved.

  isConfigured() {
    return !!(aiConfig.opencodeUrl && aiConfig.opencodeUsername && aiConfig.opencodePassword);
  },

  // ── Health ────────────────────────────────────────────────────────────────

  /**
   * GET /global/health
   * Returns { healthy: true, version: string }
   */
  async health() {
    return this._proxy('GET', '/global/health');
  },

  // ── Sessions ──────────────────────────────────────────────────────────────

  /**
   * GET /session
   * Returns Session[]
   */
  async listSessions() {
    return this._proxy('GET', '/session');
  },

  /**
   * POST /session { title }
   * Returns Session
   */
  async createSession(title) {
    return this._proxy('POST', '/session', { title: title || 'New Session' });
  },

  /**
   * POST /session/:id/message
   * { parts: [{ type: 'text', text: prompt }], model: { providerID, modelID } }
   * Returns { info: Message, parts: Part[] }
   */
  async sendPrompt(sessionId, prompt, providerID, modelID) {
    const body = {
      parts: [{ type: 'text', text: prompt }],
    };
    if (providerID && modelID) {
      body.model = { providerID, modelID };
    }
    return this._proxy('POST', `/session/${encodeURIComponent(sessionId)}/message`, body);
  },

  /**
   * POST /session/:id/prompt_async
   * Fire-and-forget: { parts: [{ type: 'text', text: prompt }] }
   */
  async sendPromptAsync(sessionId, prompt) {
    return this._proxy('POST', `/session/${encodeURIComponent(sessionId)}/prompt_async`, {
      parts: [{ type: 'text', text: prompt }],
    });
  },

  /**
   * POST /session/:id/shell
   * { agent: 'build', command }
   */
  async runShell(sessionId, command) {
    return this._proxy('POST', `/session/${encodeURIComponent(sessionId)}/shell`, {
      agent: 'build',
      command,
    });
  },

  /**
   * GET /session/:id/message
   * Returns messages[]
   */
  async getMessages(sessionId) {
    return this._proxy('GET', `/session/${encodeURIComponent(sessionId)}/message`);
  },

  /**
   * GET /session/status
   * Returns session status map
   */
  async getSessionStatus() {
    return this._proxy('GET', '/session/status');
  },

  /**
   * POST /session/:id/abort
   * Abort a running session
   */
  async abortSession(sessionId) {
    return this._proxy('POST', `/session/${encodeURIComponent(sessionId)}/abort`);
  },

  /**
   * DELETE /session/:id
   * Delete a session
   */
  async deleteSession(sessionId) {
    return this._proxy('DELETE', `/session/${encodeURIComponent(sessionId)}`);
  },

  // ── Files ─────────────────────────────────────────────────────────────────

  /**
   * GET /file/content?path=<path>
   * Returns file content (string)
   */
  async readFile(path) {
    const encoded = encodeURIComponent(path);
    return this._proxy('GET', `/file/content?path=${encoded}`);
  },

  /**
   * GET /file?path=<path>
   * Returns file listing
   */
  async listFiles(path) {
    const encoded = encodeURIComponent(path || '/');
    return this._proxy('GET', `/file?path=${encoded}`);
  },

  // ── Connection test ───────────────────────────────────────────────────────

  /**
   * Test the connection by calling health() through the proxy.
   * Returns { ok: boolean, version: string|null, error: string|null }
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return { ok: false, version: null, error: 'Not configured — please fill in URL, username, and password in settings.' };
    }
    try {
      const data = await this.health();
      const version = (data && (data.version || data.Version)) || 'unknown';
      return { ok: true, version, error: null };
    } catch (err) {
      return { ok: false, version: null, error: err.message || 'Unknown error' };
    }
  },
};
