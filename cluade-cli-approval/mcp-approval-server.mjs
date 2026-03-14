import readline from "node:readline";

const WEB_BASE = process.env.APPROVAL_WEB_BASE || "http://localhost:3131";

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

function writeJson(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createApprovalRequest(data) {
  const res = await fetch(`${WEB_BASE}/api/requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    throw new Error(`create request failed: ${res.status}`);
  }

  const json = await res.json();
  return json.id;
}

async function waitDecision(id, timeoutMs = 10 * 60 * 1000) {
  const started = Date.now();

  while (true) {
    if (Date.now() - started > timeoutMs) {
      return "deny";
    }

    const res = await fetch(`${WEB_BASE}/api/requests/${id}/wait`);
    if (!res.ok) {
      throw new Error(`wait decision failed: ${res.status}`);
    }

    const json = await res.json();
    if (json.done) {
      return json.decision;
    }

    await sleep(1500);
  }
}

/**
 * 这里做两件事：
 * 1. 支持 mock 脚本直接发来的简化 JSON
 * 2. 尽量兼容 Claude 可能发来的 JSON-RPC 结构
 */
async function handleMessage(msg) {
  // 简化 mock 输入
  if (msg.type === "permission_request") {
    const id = await createApprovalRequest({
      source: "mock-or-cli",
      tool_name: msg.tool_name || "unknown",
      reason: msg.reason || "",
      payload: msg.payload || {}
    });

    const decision = await waitDecision(id);

    return {
      type: "permission_result",
      decision,
      behavior: decision === "allow" ? "allow" : "deny"
    };
  }

  // JSON-RPC initialize
  if (msg.jsonrpc === "2.0" && msg.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "local-approval-server",
          version: "0.1.0"
        }
      }
    };
  }

  // 常见的 tools/list
  if (msg.jsonrpc === "2.0" && msg.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        tools: [
          {
            name: "permission_prompt",
            description: "Handle a permission request by sending it to local approval web page",
            inputSchema: {
              type: "object",
              properties: {
                tool_name: { type: "string" },
                reason: { type: "string" },
                payload: { type: "object" }
              },
              required: []
            }
          }
        ]
      }
    };
  }

  // 常见的 tools/call
  if (msg.jsonrpc === "2.0" && msg.method === "tools/call") {
    const args = msg.params?.arguments || {};
    const id = await createApprovalRequest({
      source: "claude-permission-tool",
      tool_name: args.tool_name || msg.params?.name || "permission_prompt",
      reason: args.reason || "Claude requested permission",
      payload: args.payload || args
    });

    const decision = await waitDecision(id);

    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              decision,
              behavior: decision === "allow" ? "allow" : "deny"
            })
          }
        ]
      }
    };
  }

  // fallback：把未知输入也转成一个审批请求，便于调试
  const id = await createApprovalRequest({
    source: "unknown-stdio",
    tool_name: "unknown_input",
    reason: "Received unknown input format; routed to approval page for inspection",
    payload: msg
  });

  const decision = await waitDecision(id);

  return {
    ok: true,
    decision,
    behavior: decision === "allow" ? "allow" : "deny"
  };
}

rl.on("line", async (line) => {
  if (!line.trim()) return;

  try {
    const msg = JSON.parse(line);
    const resp = await handleMessage(msg);
    if (resp !== undefined) {
      writeJson(resp);
    }
  } catch (err) {
    writeJson({
      error: true,
      message: err?.message || String(err)
    });
  }
});
