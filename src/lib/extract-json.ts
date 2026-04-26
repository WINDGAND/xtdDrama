/**
 * extract-json.ts — 从模型输出中容错提取第一个 JSON 对象字符串
 *
 * 兼容场景：
 *   - 模型直接返回 `{...}` 纯 JSON（理想情况）
 *   - 模型在 JSON 前后附加说明文字
 *   - 模型用 ```json ... ``` 代码块包裹
 */
export function extractJSON(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;

  // ```json ... ``` 或 ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch?.[1]) return codeBlockMatch[1].trim();

  // 兜底：截取第一个 { 到最后一个 }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}
