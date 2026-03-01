const POLL_INTERVAL = 250;
const BACKFILL_BYTES = 64 * 1024; // 64KB

async function* readStdin(): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let remainder = "";

  for await (const chunk of Bun.stdin.stream()) {
    const text = remainder + decoder.decode(chunk as Uint8Array, { stream: true });
    const lines = text.split("\n");
    remainder = lines.pop() ?? "";

    for (const line of lines) {
      if (line.length > 0) yield line;
    }
  }

  if (remainder.length > 0) yield remainder;
}

async function* readFile(filePath: string): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let remainder = "";

  // Start from the last 64KB for initial backfill
  const file = Bun.file(filePath);
  const initialSize = file.size;
  let offset = Math.max(0, initialSize - BACKFILL_BYTES);

  // If we seeked into the middle, skip the first partial line
  if (offset > 0) {
    const slice = file.slice(offset, initialSize);
    const bytes = await slice.arrayBuffer();
    const text = decoder.decode(new Uint8Array(bytes), { stream: true });
    const firstNewline = text.indexOf("\n");

    if (firstNewline !== -1) {
      const lines = text.slice(firstNewline + 1).split("\n");
      remainder = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length > 0) yield line;
      }
    }

    offset = initialSize;
  }

  // Poll for new data
  while (true) {
    const currentFile = Bun.file(filePath);
    const currentSize = currentFile.size;

    if (currentSize > offset) {
      const slice = currentFile.slice(offset, currentSize);
      const bytes = await slice.arrayBuffer();
      offset = currentSize;

      const text = remainder + decoder.decode(new Uint8Array(bytes), { stream: true });
      const lines = text.split("\n");
      remainder = lines.pop() ?? "";

      for (const line of lines) {
        if (line.length > 0) yield line;
      }
    } else if (currentSize < offset) {
      // Log rotation detected — file got smaller
      offset = 0;
      remainder = "";
    }

    await Bun.sleep(POLL_INTERVAL);
  }
}

export async function* tailLines(options: { filePath?: string }): AsyncGenerator<string> {
  if (options.filePath) {
    yield* readFile(options.filePath);
  } else {
    yield* readStdin();
  }
}
