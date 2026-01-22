const logBody = document.getElementById("logBody");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const countLabel = document.getElementById("countLabel");

const MAX_DISPLAY_CHARS = 4000;

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

function setCount(count) {
  countLabel.textContent = `${count} entr${count === 1 ? "y" : "ies"}`;
}

function renderLogs(logs) {
  logBody.innerHTML = "";

  if (!Array.isArray(logs) || logs.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "empty";
    cell.textContent = "No logs captured yet.";
    row.appendChild(cell);
    logBody.appendChild(row);
    setCount(0);
    return;
  }

  for (const entry of logs.slice().reverse()) {
    const row = document.createElement("tr");

    const ts = document.createElement("td");
    ts.textContent = entry.timestamp || "";

    const method = document.createElement("td");
    method.textContent = entry.method || "";

    const url = document.createElement("td");
    url.textContent = entry.url || "";

    const headers = document.createElement("td");
    const headersPre = document.createElement("pre");
    headersPre.textContent = safeStringify(entry.headers || []);
    headers.appendChild(headersPre);

    const body = document.createElement("td");
    const bodyPre = document.createElement("pre");
    bodyPre.textContent = safeStringify(entry.body || null);
    body.appendChild(bodyPre);

    row.appendChild(ts);
    row.appendChild(method);
    row.appendChild(url);
    row.appendChild(headers);
    row.appendChild(body);
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
  link.download = `post-request-logs-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
