import { parseArgs } from "node:util";
import { parseLine } from "./parser";
import { tailLines } from "./tailer";
import { ErrorTracker } from "./tracker";
import { createServer, broadcastError } from "./server";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    file: { type: "string", short: "f" },
    port: { type: "string", short: "p", default: "7890" },
  },
  strict: true,
});

const port = parseInt(values.port ?? "7890", 10);
const filePath = values.file;
const tracker = new ErrorTracker();
const server = createServer(tracker, port);

console.log(`\n  vigil is running\n`);
console.log(`  Dashboard: http://localhost:${port}`);

if (filePath) {
  console.log(`  Watching:   ${filePath}`);
} else {
  console.log(`  Input:      stdin (pipe your logs)`);
}

console.log(`\n  Waiting for log data...\n`);

for await (const line of tailLines({ filePath })) {
  const entry = parseLine(line);
  if (!entry) continue;

  const isError = tracker.ingest(entry);
  if (isError) {
    broadcastError(server, {
      timestamp: entry.timestamp.toISOString(),
      status: entry.status,
      method: entry.method,
      path: entry.path,
      ip: entry.ip,
      userAgent: entry.userAgent,
    });
  }
}
