import { escapeHtml } from "./lib.mjs";

export const STATIC_CAPTION_MODE = "static";

export function resolveCaptionPreset(registry, requestedMode) {
  const mode = String(requestedMode || STATIC_CAPTION_MODE).trim() || STATIC_CAPTION_MODE;
  const presets = registry?.captionPresets;
  if (!presets || typeof presets !== "object" || Array.isArray(presets)) {
    throw new Error("themes/registry.json 缺少 captionPresets 注册表");
  }
  const preset = presets[mode];
  if (!preset) {
    throw new Error(`caption.mode 不支持 ${mode}，可用 ${Object.keys(presets).join("/")}`);
  }
  return { mode, ...preset };
}

export function normalizeCaptionWords(item) {
  if (item.words == null) return [];
  if (!Array.isArray(item.words)) throw new Error("caption.words 必须是数组");
  if (!item.words.length) return [];

  const cueStart = captionStart(item);
  const cueEnd = captionEnd(item);
  const words = item.words.map((word, index) => {
    const text = String(word?.t ?? word?.text ?? "");
    const start = Number(word?.s ?? word?.start);
    const end = Number(word?.e ?? word?.end);
    if (!text) throw new Error(`caption.words[${index}] 缺少文字`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) {
      throw new Error(`caption.words[${index}] 需要有限数字且 e > s`);
    }
    if (start < cueStart - 0.02 || end > cueEnd + 0.02) {
      throw new Error(`caption.words[${index}] 超出所属 cue ${cueStart}–${cueEnd}`);
    }
    return {
      t: text,
      s: Math.max(cueStart, start),
      e: Math.min(cueEnd, end)
    };
  });

  words.forEach((word, index) => {
    const previous = words[index - 1];
    if (previous && word.s < previous.s) {
      throw new Error(`caption.words[${index}] 时间顺序倒退`);
    }
  });

  const cueText = String(item.t ?? item.text ?? "");
  const wordsText = words.map((word) => word.t).join("");
  if (normalizeComparableText(wordsText) !== normalizeComparableText(cueText)) {
    throw new Error(`caption.words 与 cue 文字不一致: ${JSON.stringify(wordsText)} != ${JSON.stringify(cueText)}`);
  }
  return words;
}

export function renderPhraseCaptionWords(item) {
  const words = normalizeCaptionWords(item);
  if (!words.length) return "";
  const emoji = renderEmoji(item.emoji);
  const markup = words.map((word, index) => {
    const attrs = wordAttrs(word, index);
    return `<span class="caption-word" ${attrs}>${escapeHtml(word.t)}</span>`;
  }).join("");
  return `${emoji}<span class="caption-words">${markup}</span>`;
}

export function createSingleWordClips(item) {
  const words = normalizeCaptionWords(item);
  const cueEnd = captionEnd(item);
  const emphasis = String(item.emphasis || "").trim().toLocaleLowerCase();
  return words.map((word, index) => {
    const next = words[index + 1];
    const end = next ? Math.max(word.e, next.s) : Math.max(word.e, cueEnd);
    const highlighted = Boolean(emphasis)
      && normalizeComparableText(word.t).toLocaleLowerCase().includes(emphasis);
    return { ...word, e: end, highlighted };
  });
}

export function createTimedCaptionWords(rawWords, displayText) {
  const source = Array.isArray(rawWords) ? rawWords : [];
  const text = String(displayText || "");
  if (!source.length || !text) return [];
  const tokens = semanticCaptionTokens(text);
  const displayLength = Array.from(text).length;
  const boundaryTimes = rawCharacterBoundaryTimes(source);
  const rawLength = boundaryTimes.length - 1;
  if (!tokens.length || displayLength <= 0 || rawLength <= 0) return [];

  let cursor = 0;
  return tokens.map((token, index) => {
    const tokenLength = Array.from(token).length;
    const start = mapBoundary(cursor);
    cursor += tokenLength;
    const end = index === tokens.length - 1 ? boundaryTimes.at(-1) : mapBoundary(cursor);
    return {
      t: token,
      s: round(start),
      e: round(Math.max(end, start + 0.001))
    };
  });

  function mapBoundary(displayIndex) {
    const rawPosition = Math.min(rawLength, Math.max(0, displayIndex / displayLength * rawLength));
    const lower = Math.floor(rawPosition);
    const upper = Math.min(rawLength, Math.ceil(rawPosition));
    if (lower === upper) return boundaryTimes[lower];
    const progress = rawPosition - lower;
    return boundaryTimes[lower] + (boundaryTimes[upper] - boundaryTimes[lower]) * progress;
  }
}

export function captionStart(item) {
  return Number(item.s ?? item.start);
}

export function captionEnd(item) {
  return Number(item.e ?? item.end ?? captionStart(item) + Number(item.duration || 0));
}

function wordAttrs(word, index) {
  return `data-word-index="${index}" data-word-start="${word.s.toFixed(3)}" data-word-end="${word.e.toFixed(3)}"`;
}

function renderEmoji(value) {
  if (value == null || value === "") return "";
  const emoji = String(value).trim();
  if (!emoji || Array.from(emoji).length > 4) {
    throw new Error("caption.emoji 必须是一个简短 emoji");
  }
  return `<span class="caption-emoji" aria-hidden="true">${escapeHtml(emoji)}</span>`;
}

function normalizeComparableText(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function semanticCaptionTokens(text) {
  const segmented = [...new Intl.Segmenter("zh-CN", { granularity: "word" }).segment(text)];
  const lexical = [];
  let pending = "";
  for (const part of segmented) {
    if (/^\s+$/u.test(part.segment)) {
      pending += part.segment;
      continue;
    }
    if (part.isWordLike) {
      lexical.push(`${pending}${part.segment}`);
      pending = "";
      continue;
    }
    if (lexical.length) lexical[lexical.length - 1] += `${pending}${part.segment}`;
    else pending += part.segment;
    pending = "";
  }
  if (pending) {
    if (lexical.length) lexical[lexical.length - 1] += pending;
    else lexical.push(pending);
  }
  return coalesceSingleCjk(lexical);
}

function coalesceSingleCjk(tokens) {
  const result = [];
  let run = "";
  const suffixes = new Set(["的", "地", "得", "了", "着", "过", "呢", "啊", "呀", "吗", "吧"]);
  const flush = () => {
    if (run) result.push(run);
    run = "";
  };
  for (const token of tokens) {
    const clean = token.trim();
    if (!/^\p{Script=Han}$/u.test(clean)) {
      flush();
      result.push(token);
      continue;
    }
    if (suffixes.has(clean) && run) {
      run += token;
      continue;
    }
    if (suffixes.has(clean) && !run && result.length && isShortCjk(result.at(-1), 3)) {
      result[result.length - 1] += token;
      continue;
    }
    if (Array.from(run.trim()).length >= 3) flush();
    run += token;
  }
  flush();
  return result;
}

function isShortCjk(value, maxLength) {
  const clean = String(value || "").trim();
  return /^\p{Script=Han}+$/u.test(clean) && Array.from(clean).length <= maxLength;
}

function rawCharacterBoundaryTimes(words) {
  const boundaries = [];
  for (const word of words) {
    const text = String(word?.text ?? word?.t ?? "").trim();
    const start = Number(word?.start ?? word?.s);
    const end = Number(word?.end ?? word?.e);
    const count = Math.max(1, Array.from(text).length);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) continue;
    if (!boundaries.length) boundaries.push(start);
    for (let index = 1; index <= count; index += 1) {
      boundaries.push(start + (end - start) * index / count);
    }
  }
  return boundaries;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
