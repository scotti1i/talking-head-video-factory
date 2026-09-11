import { escapeHtml } from "./lib.mjs";

const WORD_CHAR = /[\p{L}\p{N}]/u;

export function renderCaptionMarkup(item = {}) {
  const text = String(item.t ?? item.text ?? "").trim();
  if (!text) return "";
  if (item.emphasis == null) return escapeHtml(text);
  const terms = Array.isArray(item.emphasis) ? item.emphasis : [item.emphasis];
  if (!terms.length || terms.some((term) => typeof term !== "string" || !term.trim())) {
    throw new Error("caption.emphasis 必须是非空字符串或非空字符串数组");
  }

  const matches = terms.map((term) => {
    const emphasis = term.trim();
    const match = findWholeTerm(text, emphasis);
    if (!match) throw new Error(`caption.emphasis 未在字幕中找到完整词组: ${emphasis}`);
    return { ...match, emphasis };
  }).sort((left, right) => left.start - right.start);

  for (let index = 1; index < matches.length; index += 1) {
    if (matches[index].start < matches[index - 1].end) {
      throw new Error(`caption.emphasis 词组重叠: ${matches[index - 1].emphasis} / ${matches[index].emphasis}`);
    }
  }

  let cursor = 0;
  let markup = "";
  for (const match of matches) {
    markup += escapeHtml(text.slice(cursor, match.start));
    markup += `<span class="caption-emphasis">${escapeHtml(text.slice(match.start, match.end))}</span>`;
    cursor = match.end;
  }
  return `${markup}${escapeHtml(text.slice(cursor))}`;
}

function findWholeTerm(text, term) {
  const haystack = text.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
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
