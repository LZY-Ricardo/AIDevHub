import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

export type UiSelectOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

// Avoid native <select> popups in some WebView/Tauri environments where CJK text
// can render incorrectly; keep everything inside DOM/CSS for consistent fonts.
export function UiSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<UiSelectOption<T>>;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="ui-selectRoot">
      <button
        type="button"
        className="ui-select ui-selectBtn"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ui-ellipsis">{selected?.label ?? "—"}</span>
        <span className="ui-selectChevron" aria-hidden="true">
          <Icon name="chevronDown" />
        </span>
      </button>

      {open ? (
        <div className="ui-selectMenu" role="listbox" aria-label={ariaLabel}>
          {options.map((opt) => {
            const isSelected = opt.value === value;

            return (
              <button
                key={opt.value}
                type="button"
                className="ui-selectOption"
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span className="ui-ellipsis">{opt.label}</span>
                {isSelected ? (
                  <Icon name="check" />
                ) : (
                  <span className="ui-selectSpacer" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

