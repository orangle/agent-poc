import { spawn } from "node:child_process";

console.log("Starting mock approval test...");
console.log("This will send a test permission request to the approval server.\n");

const child = spawn("node", ["./mcp-approval-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    APPROVAL_WEB_BASE: process.env.APPROVAL_WEB_BASE || "http://localhost:3131"
  }
});

child.stdout.on("data", (buf) => {
  console.log("[approval-server response]", buf.toString().trim());
});

child.stderr.on("data", (buf) => {
  console.error("[approval-server error]", buf.toString().trim());
});

child.on("error", (err) => {
  console.error("Failed to spawn approval server:", err.message);
});

// 等待服务器启动
setTimeout(() => {
  const testRequest = {
    type: "permission_request",
    tool_name: "Bash",
    reason: "User wants to list files in /tmp directory",
    payload: {
      command: "ls -la /tmp",
      working_directory: "/tmp"
    }
  };

  console.log("\nSending test request:");
  console.log(JSON.stringify(testRequest, null, 2));
  console.log("\nPlease open http://localhost:3131 to approve or deny this request.\n");

  child.stdin.write(JSON.stringify(testRequest) + "\n");

  // 30秒后自动退出
  setTimeout(() => {
    console.log("\nTest timeout. Exiting...");
    child.kill();
    process.exit(0);
  }, 30000);
}, 1000);

child.on("exit", (code) => {
  console.log(`\nApproval server exited with code ${code}`);
  process.exit(code || 0);
});
