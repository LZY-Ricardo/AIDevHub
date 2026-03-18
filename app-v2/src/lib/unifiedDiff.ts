export type DiffCellType = "context" | "add" | "del" | "empty" | "meta";

export interface DiffCell {
  lineNumber: number | null;
  text: string;
  type: DiffCellType;
}

export interface DiffRow {
  left: DiffCell;
  right: DiffCell;
}

export interface DiffHunk {
  header: string;
  rows: DiffRow[];
}

export interface ParsedUnifiedDiff {
  meta: string[];
  hunks: DiffHunk[];
}

type NumberedLine = { lineNumber: number; text: string };

const HUNK_HEADER_RE =
  /^@@ -(?<oldStart>\d+)(?:,(?<oldCount>\d+))? \+(?<newStart>\d+)(?:,(?<newCount>\d+))? @@/;

function isFileHeaderLine(line: string): boolean {
  return line.startsWith("--- ") || line.startsWith("+++ ");
}

function isHunkHeaderLine(line: string): boolean {
  return line.startsWith("@@ ");
}

/**
 * Parse a unified diff (as produced by similar::TextDiff::unified_diff()) into
 * a VSCode/GitHub-like split view model.
 *
 * Notes:
 * - This intentionally does not require full before/after file bodies.
 * - Output is hunk-based; unchanged sections outside context are not present.
 */
export function parseUnifiedDiff(diff: string): ParsedUnifiedDiff | null {
  const meta: string[] = [];
  const hunks: DiffHunk[] = [];
  const lines = diff.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isFileHeaderLine(line)) {
      meta.push(line);
      i += 1;
      continue;
    }

    if (!isHunkHeaderLine(line)) {
      i += 1;
      continue;
    }

    const header = line;
    const m = HUNK_HEADER_RE.exec(line);
    if (!m?.groups) {
      i += 1;
      continue;
    }

    let oldLine = Number.parseInt(m.groups.oldStart ?? "0", 10);
    let newLine = Number.parseInt(m.groups.newStart ?? "0", 10);

    const rows: DiffRow[] = [];
    let delRun: NumberedLine[] = [];
    let addRun: NumberedLine[] = [];

    const flushRuns = () => {
      const max = Math.max(delRun.length, addRun.length);
      for (let idx = 0; idx < max; idx += 1) {
        const d = delRun[idx];
        const a = addRun[idx];
        rows.push({
          left: d
            ? { lineNumber: d.lineNumber, text: d.text, type: "del" }
            : { lineNumber: null, text: "", type: "empty" },
          right: a
            ? { lineNumber: a.lineNumber, text: a.text, type: "add" }
            : { lineNumber: null, text: "", type: "empty" },
        });
      }
      delRun = [];
      addRun = [];
    };

    i += 1;
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (isHunkHeaderLine(l)) break;
      if (isFileHeaderLine(l)) {
        // Some generators may repeat file headers; keep them in meta but don't
        // render inside hunks.
        meta.push(l);
        i += 1;
        continue;
      }

      const prefix = l.slice(0, 1);
      const text = l.slice(1);

      if (prefix === "-") {
        delRun.push({ lineNumber: oldLine, text });
        oldLine += 1;
        i += 1;
        continue;
      }

      if (prefix === "+") {
        addRun.push({ lineNumber: newLine, text });
        newLine += 1;
        i += 1;
        continue;
      }

      if (prefix === " ") {
        flushRuns();
        rows.push({
          left: { lineNumber: oldLine, text, type: "context" },
          right: { lineNumber: newLine, text, type: "context" },
        });
        oldLine += 1;
        newLine += 1;
        i += 1;
        continue;
      }

      if (l.startsWith("\\")) {
        // e.g. "\ No newline at end of file" – keep as meta row.
        flushRuns();
        rows.push({
          left: { lineNumber: null, text: l, type: "meta" },
          right: { lineNumber: null, text: l, type: "meta" },
        });
        i += 1;
        continue;
      }

      // Empty trailing line from split or an unexpected prefix: skip.
      i += 1;
    }

    flushRuns();
    hunks.push({ header, rows });
  }

  if (hunks.length === 0) return null;
  return { meta, hunks };
}

