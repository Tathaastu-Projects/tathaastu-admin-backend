/**
 * Outbound Easebuzz HTTP — never use global fetch in the main process.
 *
 * Live symptom: initiate closes the socket / nginx 502 / health dies.
 * On the Mac mini host, Node TLS + serving HTTP in the same process has been
 * unstable; prefer system `curl` (light subprocess) then fall back to
 * https.request with Connection: close.
 */
const { spawn, execFile } = require("child_process");
const https = require("https");
const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const os = require("os");
const path = require("path");

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

function postFormViaCurl(url, body, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const tmp = path.join(
      os.tmpdir(),
      `easebuzz-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
    );
    try {
      fs.writeFileSync(tmp, String(body || ""), "utf8");
    } catch (err) {
      resolve({
        ok: false,
        httpStatus: 0,
        error: err instanceof Error ? err.message : "Failed to write curl body temp file",
      });
      return;
    }

    const secs = Math.max(5, Math.ceil(timeoutMs / 1000));
    execFile(
      "curl",
      [
        "-sS",
        "-X",
        "POST",
        String(url),
        "-H",
        "Content-Type: application/x-www-form-urlencoded",
        "-H",
        "Accept: application/json",
        "--data-binary",
        `@${tmp}`,
        "--max-time",
        String(secs),
        "--connect-timeout",
        "10",
        "-w",
        "\n__HTTP_STATUS__:%{http_code}",
      ],
      { timeout: timeoutMs + 5000, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => {
        try {
          fs.unlinkSync(tmp);
        } catch (_e) {
          /* ignore */
        }

        const rawOut = String(stdout || "");
        const statusMatch = rawOut.match(/\n__HTTP_STATUS__:(\d+)\s*$/);
        const httpStatus = statusMatch ? Number(statusMatch[1]) : 0;
        const rawText = statusMatch ? rawOut.slice(0, statusMatch.index) : rawOut;

        if (err && !rawText) {
          resolve({
            ok: false,
            httpStatus: 0,
            error: err.message || String(stderr || "curl failed"),
            rawText: String(stderr || "").slice(0, 300),
          });
          return;
        }

        let data = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch (_e) {
          resolve({
            ok: false,
            httpStatus,
            error: "Easebuzz returned an invalid (non-JSON) response",
            rawText: rawText.slice(0, 300),
          });
          return;
        }
        resolve({ ok: true, httpStatus, data, via: "curl" });
      },
    );
  });
}

async function postFormUrlEncoded(url, body, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 20000;
  // EASEBUZZ_HTTP_TRANSPORT=curl|https|node-child
  // Default curl on non-Windows (Mac mini live host) — avoids Node TLS crash mid-initiate.
  const transport = String(
    options.transport || process.env.EASEBUZZ_HTTP_TRANSPORT || (process.platform === "win32" ? "https" : "curl"),
  )
    .trim()
    .toLowerCase();

  if (transport === "node-child" || transport === "isolated") {
    return postFormIsolated(url, body, timeoutMs);
  }

  if (transport === "curl") {
    const viaCurl = await postFormViaCurl(url, body, timeoutMs);
    // If curl binary missing, fall back to https
    if (!viaCurl.ok && /not found|ENOENT|curl failed/i.test(String(viaCurl.error || ""))) {
      return postFormInProcess(url, body, timeoutMs);
    }
    return viaCurl;
  }

  return postFormInProcess(url, body, timeoutMs);
}

module.exports = {
  postFormUrlEncoded,
  postFormInProcess,
  postFormIsolated,
  postFormViaCurl,
};
