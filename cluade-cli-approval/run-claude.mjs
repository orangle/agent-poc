import { spawn } from "node:child_process";

const prompt = `
Please inspect the /tmp directory and summarize what you see.
If you need to use tools or commands, request permission first.
`.trim();

const args = [
  "-p",
  "--mcp-config",
  "./mcp-config.json",
  "--permission-prompt-tool",
  "mcp__approval-server__permission_prompt",
  prompt
];

console.log("Spawning Claude CLI...");
console.log(`Command: claude ${args.join(" ")}`);
console.log("\nWaiting for Claude to start...\n");

const child = spawn("claude", args, {
  cwd: process.cwd(),
  shell: false,  // 改为 false，避免参数解析问题
  env: {
    ...process.env,
    APPROVAL_WEB_BASE: process.env.APPROVAL_WEB_BASE || "http://localhost:3131"
  },
  stdio: ['inherit', 'pipe', 'pipe']  // 明确指定 stdio
});

child.stdout.on("data", (buf) => {
  process.stdout.write(`[claude stdout] ${buf}`);
});

child.stderr.on("data", (buf) => {
  process.stderr.write(`[claude stderr] ${buf}`);
});

child.on("error", (err) => {
  console.error("Failed to spawn Claude CLI:", err.message);
  console.error("Make sure `claude` is installed and authenticated.");
});

child.on("exit", (code, signal) => {
  console.log(`Claude process exited. code=${code} signal=${signal}`);
});
