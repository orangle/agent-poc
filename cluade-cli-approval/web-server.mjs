import express from "express";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = 3131;

app.use(express.json());

/**
 * 内存态请求存储
 * 真实生产里可替换为 Redis / DB
 */
const requests = new Map();

/**
 * 新建审批请求
 * body:
 * {
 *   source: "claude-permission-tool",
 *   tool_name: "...",
 *   reason: "...",
 *   payload: {...}
 * }
 */
app.post("/api/requests", (req, res) => {
  const id = uuidv4();
  const now = new Date().toISOString();

  const item = {
    id,
    status: "pending",
    created_at: now,
    updated_at: now,
    source: req.body?.source || "unknown",
    tool_name: req.body?.tool_name || "unknown",
    reason: req.body?.reason || "",
    payload: req.body?.payload || {},
    decision: null
  };

  requests.set(id, item);
  res.json({ ok: true, id });
});

/**
 * 查询所有请求
 */
app.get("/api/requests", (_req, res) => {
  const items = Array.from(requests.values()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  res.json({ ok: true, items });
});

/**
 * 查询单个请求
 */
app.get("/api/requests/:id", (req, res) => {
  const item = requests.get(req.params.id);
  if (!item) {
    return res.status(404).json({ ok: false, error: "not found" });
  }
  res.json({ ok: true, item });
});

/**
 * 审批动作
 * body: { action: "allow" | "deny" }
 */
app.post("/api/requests/:id/decision", (req, res) => {
  const item = requests.get(req.params.id);
  if (!item) {
    return res.status(404).json({ ok: false, error: "not found" });
  }
  if (item.status !== "pending") {
    return res.status(400).json({ ok: false, error: "already decided" });
  }

  const action = req.body?.action;
  if (!["allow", "deny"].includes(action)) {
    return res.status(400).json({ ok: false, error: "invalid action" });
  }

  item.status = action === "allow" ? "approved" : "denied";
  item.decision = action;
  item.updated_at = new Date().toISOString();

  requests.set(item.id, item);
  res.json({ ok: true, item });
});

/**
 * 给权限工具轮询查询结果
 */
app.get("/api/requests/:id/wait", (req, res) => {
  const item = requests.get(req.params.id);
  if (!item) {
    return res.status(404).json({ ok: false, error: "not found" });
  }

  if (item.status === "pending") {
    return res.json({ ok: true, done: false });
  }

  return res.json({
    ok: true,
    done: true,
    decision: item.decision,
    item
  });
});

app.get("/", (_req, res) => {
  res.type("html").send(renderHtml());
});

app.listen(PORT, () => {
  console.log(`Approval web server running at http://localhost:${PORT}`);
});

function renderHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Claude Approval Inbox</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --bg: #0b1020;
      --panel: #141b34;
      --panel-2: #1b2547;
      --text: #e8ecff;
      --muted: #9aa6d1;
      --ok: #20c997;
      --bad: #ff6b6b;
      --pending: #ffd166;
      --line: #2a3768;
      --btn: #2f66ff;
      --btn2: #3a3f5b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #0b1020 0%, #0e1430 100%);
      color: var(--text);
      min-height: 100vh;
    }
    .wrap {
      max-width: 1000px;
      margin: 0 auto;
      padding: 24px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
    }
    .subtitle {
      color: var(--muted);
      margin-top: 6px;
      font-size: 14px;
    }
    .badge {
      background: #172040;
      border: 1px solid var(--line);
      padding: 8px 12px;
      border-radius: 999px;
      color: var(--muted);
      font-size: 12px;
    }
    .list {
      display: grid;
      gap: 16px;
    }
    .card {
      background: rgba(20, 27, 52, 0.95);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.24);
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .card h3 {
      margin: 0;
      font-size: 18px;
    }
    .meta {
      color: var(--muted);
      font-size: 13px;
      margin-top: 10px;
      line-height: 1.6;
    }
    pre {
      background: #0d1328;
      border: 1px solid #202d59;
      border-radius: 12px;
      padding: 12px;
      overflow: auto;
      color: #d8e1ff;
      font-size: 12px;
      line-height: 1.5;
      margin: 12px 0 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .status {
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .status.pending { background: rgba(255, 209, 102, 0.15); color: var(--pending); }
    .status.approved { background: rgba(32, 201, 151, 0.15); color: var(--ok); }
    .status.denied { background: rgba(255, 107, 107, 0.15); color: var(--bad); }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 14px;
    }
    button {
      border: 0;
      border-radius: 12px;
      padding: 10px 14px;
      color: white;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
    }
    .allow { background: var(--ok); }
    .deny { background: var(--bad); }
    .empty {
      border: 1px dashed var(--line);
      border-radius: 18px;
      padding: 28px;
      text-align: center;
      color: var(--muted);
      background: rgba(20, 27, 52, 0.6);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div>
        <div class="title">Claude Approval Inbox</div>
        <div class="subtitle">本地 IM 风格审批页。用于演示 Claude Code CLI 的权限请求外接闭环。</div>
      </div>
      <div class="badge">Auto refresh: 2s</div>
    </div>

    <div id="list" class="list"></div>
  </div>

  <script>
    async function load() {
      const res = await fetch('/api/requests');
      const data = await res.json();
      const list = document.getElementById('list');
      const items = data.items || [];

      if (!items.length) {
        list.innerHTML = '<div class="empty">暂无请求。运行 <code>npm run run:mock</code> 或 <code>npm run run:claude</code> 触发一个审批请求。</div>';
        return;
      }

      list.innerHTML = items.map(item => {
        const payload = JSON.stringify(item.payload, null, 2);
        return \`
          <div class="card">
            <div class="row">
              <h3>\${escapeHtml(item.tool_name || 'unknown')}</h3>
              <span class="status \${item.status}">\${item.status}</span>
            </div>

            <div class="meta">
              <div><strong>Request ID:</strong> \${escapeHtml(item.id)}</div>
              <div><strong>Source:</strong> \${escapeHtml(item.source || '')}</div>
              <div><strong>Created At:</strong> \${escapeHtml(item.created_at || '')}</div>
              <div><strong>Reason:</strong> \${escapeHtml(item.reason || '')}</div>
            </div>

            <pre>\${escapeHtml(payload)}</pre>

            \${item.status === 'pending' ? \`
              <div class="actions">
                <button class="allow" onclick="decide('\${item.id}', 'allow')">Allow</button>
                <button class="deny" onclick="decide('\${item.id}', 'deny')">Deny</button>
              </div>
            \` : ''}
          </div>
        \`;
      }).join('');
    }

    async function decide(id, action) {
      await fetch('/api/requests/' + id + '/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action })
      });
      await load();
    }

    function escapeHtml(str) {
      return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    load();
    setInterval(load, 2000);
  </script>
</body>
</html>`;
}
