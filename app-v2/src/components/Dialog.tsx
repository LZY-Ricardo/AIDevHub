import { Icon } from "./Icon";
import type { MouseEvent, ReactNode } from "react";

export function Dialog({
  title,
  open,
  onClose,
  children,
  footer,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="ui-dialogOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
        // click outside to close
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div className="ui-dialog" onMouseDown={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
        <div className="ui-dialogHeader">
          <div className="ui-dialogTitleWrap">
            <div className="ui-dialogEyebrow">Preview Workspace</div>
            <div className="ui-dialogTitle">{title}</div>
          </div>
          <button type="button" className="ui-btn" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="ui-dialogBody">{children}</div>
        {footer ? <div className="ui-dialogFooter">{footer}</div> : null}
      </div>
    </div>
  );
}
