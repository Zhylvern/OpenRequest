const logBody = document.getElementById("logBody");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const dashboardBtn = document.getElementById("dashboardBtn");
const countLabel = document.getElementById("countLabel");

function setCount(count) {
  countLabel.textContent = `${count} entr${count === 1 ? "y" : "ies"}`;
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function toSummary(entry) {
  try {
    const url = new URL(entry.url || "");
    const host = url.hostname || "";
    const path = `${url.pathname || ""}${url.search || ""}` || "";
    const bodyType = entry.body && entry.body.type ? entry.body.type : "none";
    const headerCount = Array.isArray(entry.headers) ? entry.headers.length : 0;
    return { host, path, bodyType, headerCount };
  } catch {
    return { host: "", path: entry.url || "", bodyType: "", headerCount: 0 };
  }
}

function renderLogs(logs) {
  logBody.innerHTML = "";

  if (!Array.isArray(logs) || logs.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 1;
    cell.className = "empty";
    cell.textContent = "No logs captured yet.";
    row.appendChild(cell);
    logBody.appendChild(row);
    setCount(0);
    return;
  }

  for (const entry of logs.slice().reverse()) {
    const row = document.createElement("tr");
    const summary = toSummary(entry);

    const cell = document.createElement("td");

    const wrap = document.createElement("div");
    wrap.className = "row-wrap";

    const top = document.createElement("div");
    top.className = "row-top";

    const methodBadge = document.createElement("span");
    methodBadge.className = "badge";
    methodBadge.textContent = entry.method || "POST";

    const typeBadge = document.createElement("span");
    typeBadge.className = "badge muted";
    typeBadge.textContent = summary.bodyType || "body";

    const ts = document.createElement("span");
    ts.className = "meta";
    ts.textContent = formatTimestamp(entry.timestamp);

    top.appendChild(methodBadge);
    top.appendChild(typeBadge);
    top.appendChild(ts);

    const host = document.createElement("div");
    host.className = "mono";
    host.textContent = summary.host || "—";

    const path = document.createElement("div");
    path.className = "mono path";
    path.textContent = summary.path || "—";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${summary.headerCount} headers`;

    wrap.appendChild(top);
    wrap.appendChild(host);
    wrap.appendChild(path);
    wrap.appendChild(meta);

    cell.appendChild(wrap);
    row.appendChild(cell);
    logBody.appendChild(row);
  }

  setCount(logs.length);
}

async function loadLogs() {
  const stored = await chrome.storage.local.get({ logs: [] });
  renderLogs(stored.logs);
}

exportBtn.addEventListener("click", async () => {
  // GDPR portability: export provides user-controlled data transfer.
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

dashboardBtn.addEventListener("click", () => {
  const url = chrome.runtime.getURL("dashboard.html");
  chrome.tabs.create({ url });
});

clearBtn.addEventListener("click", async () => {
  // GDPR erasure + HIPAA awareness: immediate local deletion on user action.
  await chrome.storage.local.set({ logs: [] });
  renderLogs([]);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.logs) {
    renderLogs(changes.logs.newValue || []);
  }
});

loadLogs();
