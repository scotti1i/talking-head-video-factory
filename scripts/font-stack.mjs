const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "system-ui",
  "cursive",
  "fantasy",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "emoji",
  "math",
  "fangsong"
]);

export function deterministicFontStack(stack) {
  const banned = /^("?)(PingFang SC|Noto Sans SC|Songti SC|STSong)\1$/i;
  const families = String(stack || "sans-serif")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && !banned.test(item));
  const named = families.filter((item) => !GENERIC_FAMILIES.has(unquote(item).toLowerCase()));
  const generic = families.filter((item) => GENERIC_FAMILIES.has(unquote(item).toLowerCase()));
  return [...named, "FactoryCJK", ...generic].join(", ");
}

function unquote(value) {
  return value.replace(/^(["'])(.*)\1$/, "$2");
}
