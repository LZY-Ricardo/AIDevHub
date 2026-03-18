import { Fragment, useMemo } from "react";
import { parseUnifiedDiff, type DiffCellType } from "../lib/unifiedDiff";

export type DiffViewMode = "split" | "unified";

function cellTypeClass(t: DiffCellType): string {
  switch (t) {
    case "add":
      return "ui-diffAdd";
    case "del":
      return "ui-diffDel";
    case "meta":
      return "ui-diffMeta";
    case "empty":
      return "ui-diffEmpty";
    case "context":
    default:
      return "ui-diffCtx";
  }
}

export function DiffViewer({
  diff,
  mode,
  wrap,
}: {
  diff: string;
  mode: DiffViewMode;
  wrap: boolean;
}) {
  const parsed = useMemo(() => (mode === "split" ? parseUnifiedDiff(diff) : null), [diff, mode]);

  if (mode === "unified" || !parsed) {
    return <pre className="ui-pre">{diff}</pre>;
  }

  return (
    <div className={wrap ? "ui-diff ui-diffWrap" : "ui-diff"}>
      <div className="ui-diffScroll">
        <table className="ui-diffTable">
          <thead>
            <tr>
              <th className="ui-diffColTitle" colSpan={2}>
                旧
              </th>
              <th className="ui-diffColTitle ui-diffColTitleRight" colSpan={2}>
                新
              </th>
            </tr>
          </thead>
          <tbody>
            {parsed.hunks.map((hunk, hIdx) => (
              <Fragment key={`${hIdx}-${hunk.header}`}>
                <tr className="ui-diffHunkRow">
                  <td className="ui-diffHunk" colSpan={4}>
                    <span className="ui-code">{hunk.header}</span>
                  </td>
                </tr>
                {hunk.rows.map((r, rIdx) => (
                  <tr key={`${hIdx}-${rIdx}`} className="ui-diffRow">
                    <td className={`ui-diffGutter ${cellTypeClass(r.left.type)}`}>
                      {r.left.lineNumber ?? ""}
                    </td>
                    <td className={`ui-diffCell ${cellTypeClass(r.left.type)}`}>
                      <span className="ui-diffText">{r.left.text}</span>
                    </td>
                    <td
                      className={`ui-diffGutter ui-diffGutterRight ${cellTypeClass(r.right.type)}`}
                    >
                      {r.right.lineNumber ?? ""}
                    </td>
                    <td
                      className={`ui-diffCell ui-diffCellRight ${cellTypeClass(r.right.type)}`}
                    >
                      <span className="ui-diffText">{r.right.text}</span>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

