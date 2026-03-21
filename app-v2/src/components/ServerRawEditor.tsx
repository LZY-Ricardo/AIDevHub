import { useEffect, useRef, useState } from "react";

function payloadSignature(payload: Record<string, unknown>) {
  return JSON.stringify(payload);
}

export function ServerRawEditor({
  payload,
  onChange,
  onValidityChange,
}: {
  payload: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  onValidityChange: (error: string | null) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(payload, null, 2));
  const [error, setError] = useState<string | null>(null);
  const lastAppliedPayloadRef = useRef(payloadSignature(payload));

  useEffect(() => {
    const nextSignature = payloadSignature(payload);
    if (nextSignature === lastAppliedPayloadRef.current) {
      return;
    }
    lastAppliedPayloadRef.current = nextSignature;
    setText(JSON.stringify(payload, null, 2));
    setError(null);
    onValidityChange(null);
  }, [payload, onValidityChange]);

  function handleChange(nextText: string) {
    setText(nextText);
    try {
      const parsed = JSON.parse(nextText) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        const nextError = "高级编辑只支持 JSON 对象片段。";
        setError(nextError);
        onValidityChange(nextError);
        return;
      }
      lastAppliedPayloadRef.current = payloadSignature(parsed as Record<string, unknown>);
      setError(null);
      onValidityChange(null);
      onChange(parsed as Record<string, unknown>);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "JSON 解析失败";
      setError(nextError);
      onValidityChange(nextError);
    }
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div className="ui-label">高级编辑</div>
      <textarea
        className="ui-textarea ui-code"
        rows={18}
        value={text}
        onChange={(e) => handleChange(e.currentTarget.value)}
      />
      {error ? <div className="ui-error">{error}</div> : null}
      {!error ? <div className="ui-help">此处仅编辑当前 MCP 的 JSON 配置片段。</div> : null}
    </div>
  );
}
