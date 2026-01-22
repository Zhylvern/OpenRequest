const MAX_LOG_ENTRIES = 200;
const MAX_BODY_BYTES = 64 * 1024; // Defensive cap to minimize data capture and memory use.
const REQUEST_TTL_MS = 2 * 60 * 1000;

const requestCache = new Map();
let writeQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function cleanupCache() {
  const cutoff = Date.now() - REQUEST_TTL_MS;
  for (const [requestId, entry] of requestCache.entries()) {
    if (!entry || entry.createdAt < cutoff) {
      requestCache.delete(requestId);
    }
  }
}

function normalizeHeaders(headers) {
  if (!Array.isArray(headers)) return [];
  return headers
    .filter((h) => h && typeof h.name === "string")
    .map((h) => ({
      name: h.name,
      value: typeof h.value === "string" ? h.value : ""
    }));
}

function getHeaderValue(headers, headerName) {
  const target = headerName.toLowerCase();
  for (const h of headers || []) {
    if (h && typeof h.name === "string" && h.name.toLowerCase() === target) {
      return typeof h.value === "string" ? h.value : "";
    }
  }
  return "";
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

function decodeArrayBuffers(buffers, limitBytes) {
  let total = 0;
  const chunks = [];
  for (const buf of buffers) {
    if (!(buf instanceof ArrayBuffer)) continue;
    const remaining = limitBytes - total;
    if (remaining <= 0) break;
    const slice = buf.byteLength > remaining ? buf.slice(0, remaining) : buf;
    chunks.push(new Uint8Array(slice));
    total += slice.byteLength;
  }
  if (chunks.length === 0) return { text: "", truncated: false, bytes: 0 };
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
  const truncated = total >= limitBytes;
  return { text, truncated, bytes: total };
}

function parseRequestBody(details, headers) {
  const requestBody = details.requestBody;
  if (!requestBody) return null;

  if (requestBody.formData) {
    return {
      type: "formData",
      data: requestBody.formData,
      truncated: false
    };
  }

  const rawEntries = Array.isArray(requestBody.raw) ? requestBody.raw : [];
  const buffers = rawEntries.map((e) => e && e.bytes).filter(Boolean);
  const decoded = decodeArrayBuffers(buffers, MAX_BODY_BYTES);
  const contentType = getHeaderValue(headers, "content-type");

  if (!decoded.text) {
    return {
      type: "raw",
      data: "",
      truncated: decoded.truncated
    };
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(decoded.text);
    const form = {};
    for (const [key, value] of params.entries()) {
      if (!form[key]) form[key] = [];
      form[key].push(value);
    }
    return {
      type: "urlencoded",
      data: form,
      truncated: decoded.truncated
    };
  }

  const parsed = safeJsonParse(decoded.text);
  if (parsed.ok) {
    return {
      type: "json",
      data: parsed.value,
      truncated: decoded.truncated
    };
  }

  return {
    type: "text",
    data: decoded.text,
    truncated: decoded.truncated
  };
}

async function appendLog(entry) {
  // SOC 2: Auditability by appending immutable timestamped entries.
  // GDPR: Data minimization via bounded retention and size-limited body capture.
  // HIPAA awareness: Avoid unnecessary PHI persistence by limiting entry count and body size.
  writeQueue = writeQueue.then(async () => {
    const stored = await chrome.storage.local.get({ logs: [] });
    const logs = Array.isArray(stored.logs) ? stored.logs : [];
    logs.push(entry);
    const trimmed = logs.length > MAX_LOG_ENTRIES ? logs.slice(-MAX_LOG_ENTRIES) : logs;
    await chrome.storage.local.set({ logs: trimmed });
  });
  await writeQueue;
}

function trackRequest(details) {
  cleanupCache();
  if (details.method !== "POST") return;
  requestCache.set(details.requestId, {
    url: details.url || "",
    method: details.method,
    body: null,
    headers: [],
    createdAt: Date.now()
  });
}

function captureBody(details) {
  if (details.method !== "POST") return;
  const entry = requestCache.get(details.requestId) || {
    url: details.url || "",
    method: details.method,
    body: null,
    headers: [],
    createdAt: Date.now()
  };
  entry.body = parseRequestBody(details, entry.headers);
  requestCache.set(details.requestId, entry);
}

function captureHeaders(details) {
  if (details.method !== "POST") return;
  const entry = requestCache.get(details.requestId) || {
    url: details.url || "",
    method: details.method,
    body: null,
    headers: [],
    createdAt: Date.now()
  };
  entry.headers = normalizeHeaders(details.requestHeaders);
  entry.body = entry.body || parseRequestBody(details, entry.headers);
  requestCache.set(details.requestId, entry);
}

async function finalizeRequest(details) {
  if (details.method !== "POST") return;
  const cached = requestCache.get(details.requestId);
  requestCache.delete(details.requestId);
  if (!cached) return;

  const entry = {
    id: details.requestId,
    timestamp: nowIso(),
    url: cached.url,
    method: cached.method,
    headers: cached.headers,
    body: cached.body
  };

  await appendLog(entry);
}

function discardRequest(details) {
  requestCache.delete(details.requestId);
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    trackRequest(details);
    captureBody(details);
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    captureHeaders(details);
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    finalizeRequest(details);
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    discardRequest(details);
  },
  { urls: ["<all_urls>"] }
);

self.addEventListener("activate", () => {
  cleanupCache();
});
