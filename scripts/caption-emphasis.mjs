import { escapeHtml } from "./lib.mjs";

const WORD_CHAR = /[\p{L}\p{N}]/u;

export function renderCaptionMarkup(item = {}) {
  const text = String(item.t ?? item.text ?? "").trim();
  if (!text) return "";
  if (item.emphasis == null) return escapeHtml(text);
  if (typeof item.emphasis !== "string" || !item.emphasis.trim()) {
    throw new Error("caption.emphasis 必须是非空字符串");
  }

  const emphasis = item.emphasis.trim();
  const match = findWholeTerm(text, emphasis);
  if (!match) {
    throw new Error(`caption.emphasis 未在字幕中找到完整词组: ${emphasis}`);
  }
  const before = escapeHtml(text.slice(0, match.start));
  const highlighted = escapeHtml(text.slice(match.start, match.end));
  const after = escapeHtml(text.slice(match.end));
  return `${before}<span class="caption-emphasis">${highlighted}</span>${after}`;
}

function findWholeTerm(text, term) {
  const haystack = text.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  if (/\p{Script=Han}/u.test(term)) {
    const start = haystack.indexOf(needle);
    return start < 0 ? null : { start, end: start + needle.length };
  }
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const start = haystack.indexOf(needle, cursor);
    if (start < 0) return null;
    const end = start + needle.length;
    const startsWithWord = WORD_CHAR.test(term[0]);
    const endsWithWord = WORD_CHAR.test(term.at(-1));
    const leftIsWord = start > 0 && WORD_CHAR.test(text[start - 1]);
    const rightIsWord = end < text.length && WORD_CHAR.test(text[end]);
    if ((!startsWithWord || !leftIsWord) && (!endsWithWord || !rightIsWord)) {
      return { start, end };
    }
    cursor = start + 1;
  }
  return null;
}
