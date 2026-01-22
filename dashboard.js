const logBody = document.getElementById("logBody");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const searchInput = document.getElementById("searchInput");
const totalCount = document.getElementById("totalCount");
const latestCapture = document.getElementById("latestCapture");

const MAX_DISPLAY_CHARS = 8000;
let currentLogs = [];

function safeStringify(value) {
  try {
    const json = JSON.stringify(value, null, 2);
    if (json.length > MAX_DISPLAY_CHARS) {
      return `${json.slice(0, MAX_DISPLAY_CHARS)}\n…truncated…`;
    }
    return json;
  } catch {
    return "";
  }
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function createBadge(text) {
  const badge = document.createElement("div");
  badge.className = "badge";
  badge.textContent = text || "none";
  return badge;
}

function createKvList(items) {
  const list = document.createElement("div");
  list.className = "kv-list";
  for (const { key, value } of items) {
    const row = document.createElement("div");
    row.className = "kv-item";
    const keyEl = document.createElement("div");
    keyEl.className = "kv-key";
    keyEl.textContent = key;
    const valueEl = document.createElement("div");
    valueEl.className = "kv-value";
    valueEl.textContent = value;
    row.appendChild(keyEl);
    row.appendChild(valueEl);
    list.appendChild(row);
  }
  return list;
}

function formatHeaders(headers) {
  try {
    if (!Array.isArray(headers) || headers.length === 0) {
      const empty = document.createElement("div");
      empty.className = "kv-list";
      empty.textContent = "—";
      return empty;
    }
    const items = headers.map((h) => ({
      key: h.name || "header",
      value: h.value || ""
    }));
    return createKvList(items);
  } catch {
    const empty = document.createElement("div");
    empty.className = "kv-list";
    empty.textContent = "—";
    return empty;
  }
}

function formatBody(body) {
  try {
    if (!body) {
      const empty = document.createElement("div");
      empty.className = "kv-list";
      empty.textContent = "—";
      return empty;
    }

    const container = document.createElement("div");
    container.appendChild(createBadge(body.type || "none"));

    if (body.type === "json" && body.data && typeof body.data === "object") {
      const items = Object.entries(body.data).map(([key, value]) => ({
        key,
        value: typeof value === "string" ? value : safeStringify(value)
      }));
      container.appendChild(createKvList(items));
      return container;
    }

    if ((body.type === "urlencoded" || body.type === "formData") && body.data) {
      const items = Object.entries(body.data).map(([key, value]) => ({
        key,
        value: Array.isArray(value) ? value.join(", ") : String(value)
      }));
      container.appendChild(createKvList(items));
      return container;
    }

    const pre = document.createElement("pre");
    pre.textContent = safeStringify(body);
    container.appendChild(pre);
    return container;
  } catch {
    const empty = document.createElement("div");
    empty.className = "kv-list";
    empty.textContent = "—";
    return empty;
  }
}

function getHeaderValue(headers, name) {
  if (!Array.isArray(headers)) return "";
  const match = headers.find((h) => h && h.name && h.name.toLowerCase() === name.toLowerCase());
  return match && typeof match.value === "string" ? match.value : "";
}

function buildWarnings(entry) {
  const warnings = [];
  const headerCount = Array.isArray(entry.headers) ? entry.headers.length : 0;
  const body = entry.body;
  const contentType = getHeaderValue(entry.headers, "content-type");

  if (body && body.truncated) {
    warnings.push({ label: "TRUNCATED", level: "warn" });
  }
  if (!body) {
    warnings.push({ label: "NO BODY", level: "neutral" });
  }
  if (headerCount > 30) {
    warnings.push({ label: "MANY HEADERS", level: "neutral" });
  }
  if (contentType && /octet-stream|multipart\\//i.test(contentType)) {
    warnings.push({ label: "BINARY/FORM", level: "warn" });
  }
  if (getHeaderValue(entry.headers, "authorization")) {
    warnings.push({ label: "AUTH HEADER", level: "danger" });
  }
  if (getHeaderValue(entry.headers, "cookie") || getHeaderValue(entry.headers, "set-cookie")) {
    warnings.push({ label: "COOKIE", level: "danger" });
  }

  return warnings;
}

function renderWarnings(entry) {
  try {
    const list = document.createElement("div");
    list.className = "warn-list";
    const warnings = buildWarnings(entry);
    if (warnings.length === 0) {
      const badge = document.createElement("div");
      badge.className = "badge neutral";
      badge.textContent = "NONE";
      list.appendChild(badge);
      return list;
    }
    for (const warning of warnings.slice(0, 3)) {
      const badge = document.createElement("div");
      badge.className = `badge ${warning.level}`;
      badge.textContent = warning.label;
      list.appendChild(badge);
    }
    return list;
  } catch {
    const list = document.createElement("div");
    list.className = "warn-list";
    const badge = document.createElement("div");
    badge.className = "badge neutral";
    badge.textContent = "NONE";
    list.appendChild(badge);
    return list;
  }
}

async function copyEntry(entry, button) {
  const payload = JSON.stringify(entry, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = payload;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  if (button) {
    const original = button.textContent;
    button.textContent = "Copied";
    button.classList.add("copied");
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove("copied");
    }, 1200);
  }
}

function updateSummary(logs) {
  totalCount.textContent = `${logs.length}`;
  if (logs.length === 0) {
    latestCapture.textContent = "—";
    return;
  }
  const latest = logs[logs.length - 1];
  latestCapture.textContent = formatTimestamp(latest.timestamp) || "—";
}

function matchesFilter(entry, term) {
  if (!term) return true;
  let domain = "";
  try {
    domain = new URL(entry.url || "").hostname || "";
  } catch {
    domain = "";
  }
  const bodyType = entry.body && entry.body.type ? entry.body.type : "";
  const haystack = `${entry.url || ""} ${domain} ${entry.method || ""} ${entry.timestamp || ""} ${bodyType}`
    .toLowerCase();
  return haystack.includes(term.toLowerCase());
}

function renderLogs(logs) {
  logBody.innerHTML = "";

  if (!Array.isArray(logs) || logs.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.className = "empty";
    cell.textContent = "No logs captured yet.";
    row.appendChild(cell);
    logBody.appendChild(row);
    updateSummary([]);
    return;
  }

  for (const entry of logs.slice().reverse()) {
    const row = document.createElement("tr");

    const ts = document.createElement("td");
    ts.textContent = formatTimestamp(entry.timestamp);

    const method = document.createElement("td");
    method.textContent = entry.method || "";

    let domain = "";
    let urlValue = entry.url || "";
    try {
      const parsed = new URL(entry.url || "");
      domain = parsed.hostname || "";
      urlValue = parsed.href || urlValue;
    } catch {
      domain = "";
    }

    const domainCell = document.createElement("td");
    domainCell.textContent = domain;

    const url = document.createElement("td");
    url.textContent = urlValue;

    const headers = document.createElement("td");
    headers.appendChild(formatHeaders(entry.headers));

    const body = document.createElement("td");
    body.appendChild(formatBody(entry.body));

    const actions = document.createElement("td");
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => copyEntry(entry, copyBtn));
    actions.appendChild(copyBtn);

    const warnings = document.createElement("td");
    warnings.appendChild(renderWarnings(entry));

    row.appendChild(ts);
    row.appendChild(method);
    row.appendChild(domainCell);
    row.appendChild(url);
    row.appendChild(warnings);
    row.appendChild(headers);
    row.appendChild(body);
    row.appendChild(actions);
    logBody.appendChild(row);
  }

  updateSummary(logs);
}

async function loadLogs() {
  const stored = await chrome.storage.local.get({ logs: [] });
  currentLogs = Array.isArray(stored.logs) ? stored.logs : [];
  applyFilter();
}

function applyFilter() {
  const term = searchInput.value.trim();
  const filtered = currentLogs.filter((entry) => matchesFilter(entry, term));
  renderLogs(filtered);
}

exportBtn.addEventListener("click", async () => {
  const stored = await chrome.storage.local.get({ logs: [] });
  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      logs: stored.logs || []
    },
    null,
    2
  );
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `openrequest-logs-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ logs: [] });
  currentLogs = [];
  applyFilter();
});

searchInput.addEventListener("input", () => {
  applyFilter();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.logs) {
    currentLogs = Array.isArray(changes.logs.newValue) ? changes.logs.newValue : [];
    applyFilter();
  }
});

loadLogs();
