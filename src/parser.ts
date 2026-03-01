import type { LogEntry } from "./types";

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

// Apache Combined Log Format:
// 127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /path HTTP/1.1" 200 2326 "http://ref" "Mozilla/5.0"
// Apache Common Log Format (no referer/user-agent):
// 127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /path HTTP/1.1" 200 2326
const COMBINED_RE =
  /^(\S+) (\S+) (\S+) \[([^\]]+)\] "(\S+) (\S+) (\S+)" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"$/;
const COMMON_RE =
  /^(\S+) (\S+) (\S+) \[([^\]]+)\] "(\S+) (\S+) (\S+)" (\d{3}) (\d+|-)$/;

function parseApacheDate(dateStr: string): Date {
  // Format: 10/Oct/2000:13:55:36 -0700
  const [datePart, tz] = dateStr.split(" ");
  const [day, month, rest] = datePart.split("/");
  const [year, hours, minutes, seconds] = rest.split(":");

  const date = new Date(
    Date.UTC(
      parseInt(year),
      MONTHS[month],
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      parseInt(seconds)
    )
  );

  // Apply timezone offset
  if (tz) {
    const sign = tz[0] === "+" ? -1 : 1;
    const tzHours = parseInt(tz.slice(1, 3));
    const tzMinutes = parseInt(tz.slice(3, 5));
    date.setUTCMinutes(date.getUTCMinutes() + sign * (tzHours * 60 + tzMinutes));
  }

  return date;
}

export function parseLine(line: string): LogEntry | null {
  let match = COMBINED_RE.exec(line);
  let isCombined = true;

  if (!match) {
    match = COMMON_RE.exec(line);
    isCombined = false;
  }

  if (!match) return null;

  return {
    ip: match[1],
    identity: match[2],
    user: match[3],
    timestamp: parseApacheDate(match[4]),
    method: match[5],
    path: match[6],
    protocol: match[7],
    status: parseInt(match[8]),
    size: match[9] === "-" ? 0 : parseInt(match[9]),
    referer: isCombined ? match[10] : "-",
    userAgent: isCombined ? match[11] : "-",
    raw: line,
  };
}
