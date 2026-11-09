/**
 * Outbound Easebuzz HTTP — never use global fetch in the main process.
 *
 * Live symptom: POST /payments/easebuzz/initiate returns nginx HTML 502 and
 * /api/health dies with it. That means Node exits mid-request (not an Express
 * JSON 502). Outbound TLS via undici/fetch has been crashing the process on
 * this host; isolate the call in a child so the API stays up.
 */
const { spawn } = require("child_process");
const https = require("https");
const http = require("http");
const { URL } = require("url");

function postFormInProcess(url, body, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      done({
        ok: false,
        httpStatus: 0,
        error: err instanceof Error ? err.message : "Invalid Easebuzz URL",
      });
      return;
    }

    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    const payload = String(body || "");
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "Content-Length": Buffer.byteLength(payload),
      Connection: "close",
    };

    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search || ""}`,
        method: "POST",
        headers,
        agent: false,
        timeout: timeoutMs,
        servername: parsed.hostname,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const rawText = Buffer.concat(chunks).toString("utf8");
          let data = {};
          try {
            data = rawText ? JSON.parse(rawText) : {};
          } catch (_e) {
            done({
              ok: false,
              httpStatus: res.statusCode || 0,
              error: "Easebuzz returned an invalid (non-JSON) response",
              rawText: String(rawText).slice(0, 300),
            });
            return;
          }
          done({ ok: true, httpStatus: res.statusCode || 0, data, rawText });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("Easebuzz request timed out"));
    });
    req.on("error", (err) => {
      done({
        ok: false,
        httpStatus: 0,
        error: err instanceof Error ? err.message : "Easebuzz network error",
      });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Run POST in a short-lived Node child. If OpenSSL/undici would have killed
 * the parent, the child dies instead and we return a soft error.
 */
function postFormIsolated(url, body, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const script = `
      const https = require('https');
      const http = require('http');
      const { URL } = require('url');
      const url = process.env.EB_URL;
      const body = process.env.EB_BODY || '';
      const timeoutMs = Number(process.env.EB_TIMEOUT || 20000);
      let settled = false;
      const done = (obj) => {
        if (settled) return;
        settled = true;
        process.stdout.write(JSON.stringify(obj));
        process.exit(0);
      };
      try {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : http;
        const headers = {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Connection: 'close',
        };
        const req = lib.request({
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + (parsed.search || ''),
          method: 'POST',
          headers,
          agent: false,
          timeout: timeoutMs,
          servername: parsed.hostname,
        }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const rawText = Buffer.concat(chunks).toString('utf8');
            let data = {};
            try { data = rawText ? JSON.parse(rawText) : {}; }
            catch (_e) {
              return done({
                ok: false,
                httpStatus: res.statusCode || 0,
                error: 'Easebuzz returned an invalid (non-JSON) response',
                rawText: String(rawText).slice(0, 300),
              });
            }
            done({ ok: true, httpStatus: res.statusCode || 0, data });
          });
        });
        req.on('timeout', () => req.destroy(new Error('Easebuzz request timed out')));
        req.on('error', (err) => done({
          ok: false,
          httpStatus: 0,
          error: err && err.message ? err.message : 'Easebuzz network error',
        }));
        req.write(body);
        req.end();
      } catch (err) {
        done({
          ok: false,
          httpStatus: 0,
          error: err && err.message ? err.message : 'Easebuzz child error',
        });
      }
      setTimeout(() => done({ ok: false, httpStatus: 0, error: 'Easebuzz child timed out' }), timeoutMs + 2000);
    `;

    const child = spawn(process.execPath, ["-e", script], {
      env: {
        ...process.env,
        EB_URL: String(url),
        EB_BODY: String(body || ""),
        EB_TIMEOUT: String(timeoutMs),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result, { kill = false } = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (kill) {
        try {
          child.kill("SIGKILL");
        } catch (_e) {
          /* ignore */
        }
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, httpStatus: 0, error: "Easebuzz isolated request timed out" }, { kill: true });
    }, timeoutMs + 5000);

    child.stdout.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", (err) => {
      finish({
        ok: false,
        httpStatus: 0,
        error: err instanceof Error ? err.message : "Failed to start Easebuzz child",
      });
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      const trimmed = stdout.trim();
      if (trimmed) {
        try {
          finish(JSON.parse(trimmed));
          return;
        } catch (_e) {
          finish({
            ok: false,
            httpStatus: 0,
            error: "Easebuzz child returned invalid JSON",
            rawText: trimmed.slice(0, 300),
          });
          return;
        }
      }
      finish({
        ok: false,
        httpStatus: 0,
        error:
          code || signal
            ? `Easebuzz child exited (code=${code}, signal=${signal || ""})`.trim()
            : "Easebuzz child returned empty response",
        rawText: String(stderr || "").slice(0, 300),
      });
    });
  });
}

async function postFormUrlEncoded(url, body, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 20000;
  // Default OFF: spawning a second Node for every pay call OOMs small VPS
  // (nginx HTML 502 + /api/health 502). In-process https with Connection:close
  // avoids the undici/fetch crash without doubling memory.
  // Set EASEBUZZ_HTTP_ISOLATED=true only if you need child-process isolation.
  const envIsolated = String(process.env.EASEBUZZ_HTTP_ISOLATED || "false").toLowerCase();
  const isolated =
    options.isolated != null ? Boolean(options.isolated) : envIsolated === "true";

  if (isolated) {
    return postFormIsolated(url, body, timeoutMs);
  }

  return postFormInProcess(url, body, timeoutMs);
}

module.exports = {
  postFormUrlEncoded,
  postFormInProcess,
  postFormIsolated,
};
