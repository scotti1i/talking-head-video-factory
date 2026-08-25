// ============================================================
// 口播工厂控制台前端:向导式五工位流,永远知道"在哪一步、下一步、跑到哪"
// ============================================================
const $ = (sel) => document.querySelector(sel);
const state = {
  jobs: [],
  themes: { themes: [] },
  componentTypes: [],
  slug: null,
  detail: null,
  run: null,
  es: null
};
const TARGETS = [
  { id: "douyin", label: "抖音竖屏", desc: "1080x1920 · beats 动态卡 · 全字幕" },
  { id: "youtube-horizontal", label: "YouTube 横屏", desc: "1920x1080 · 横屏重排版" },
  { id: "shorts", label: "切 Shorts", desc: "从竖屏成片 stream copy 切片" }
];

// ---------- API ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status}`);
  return data;
}

async function loadState() {
  const data = await api("/api/state");
  state.jobs = data.jobs;
  state.themes = data.themes;
  renderSidebar();
  const running = data.runs.find((run) => run.status === "running");
  if (running && !state.es) attachRun(running);
}

async function loadJob(slug) {
  state.slug = slug;
  state.detail = await api(`/api/job/${encodeURIComponent(slug)}`);
  renderSidebar();
  renderJob();
}

// ---------- 侧栏 ----------
function renderSidebar() {
  const list = $("#job-list");
  list.innerHTML = "";
  const ordered = [...state.jobs.filter((j) => j.kind === "normal"), ...state.jobs.filter((j) => j.kind !== "normal")];
  let dividerDone = false;
  for (const job of ordered) {
    if (!dividerDone && job.kind !== "normal") {
      const divider = document.createElement("li");
      divider.style.cssText = "padding:2px 4px;border:none;background:none;cursor:default;font-size:11px;color:var(--dim)";
      divider.textContent = "样例与基准";
      list.appendChild(divider);
      dividerDone = true;
    }
    const li = document.createElement("li");
    li.className = job.slug === state.slug ? "active" : "";
    li.tabIndex = 0;
    const done = job.stage === "完成";
    const themeId = job.theme || state.themes.default;
    const tokens = state.themes.themes.find((t) => t.id === themeId)?.tokens || {};
    li.innerHTML = `<div class="jl-title">${esc(job.title)}</div>
      <div class="jl-meta"><span class="stage-badge ${done ? "done" : ""}">${job.stage}</span>
      <span class="theme-dot" style="background:${esc(tokens.accentFillBg || "#444")}" title="${esc(themeId)}"></span>
      <span>${esc(themeId)}</span></div>`;
    li.onclick = () => openProject(job.slug);
    li.onkeydown = (event) => { if (event.key === "Enter") openProject(job.slug); };
    list.appendChild(li);
  }
}

// ---------- job 视图 ----------
const STAGES = ["素材", "剪辑", "字幕", "包装", "出片"];

function stageStates() {
  const s = state.detail.steps;
  return {
    素材: s.source,
    剪辑: s.aroll && s.edl,
    字幕: s.captions,
    包装: s.beats,
    出片: s.rendered && s.qaPassed && s.delivered
  };
}

function renderJob() {
  const d = state.detail;
  $("#empty-hint").classList.add("hidden");
  $("#job-view").classList.remove("hidden");
  $("#job-title").textContent = d.title;
  $("#job-meta").innerHTML = `<span class="dim">jobs/${esc(d.slug)} · 主题 ${esc(d.theme || state.themes.default)} · 当前阶段:${esc(d.stage)}</span>
    <button class="ghost small" onclick="reveal('jobs/${esc(d.slug)}')">在 Finder 打开</button>`;
  const done = stageStates();
  $("#stage-rail").innerHTML = STAGES.map((name, index) => {
    const cls = done[name] ? "done" : name === d.stage || (d.stage === "QA" || d.stage === "交付") && name === "出片" ? "current" : "";
    return `${index ? '<span class="rail-line"></span>' : ""}
      <span class="rail-node ${cls}"><span class="rail-dot">${done[name] ? "✓" : index + 1}</span>
      <span class="rail-label">${name}</span></span>`;
  }).join("");
  renderStations();
}

function station(id, title, sub, isDone, isCurrent, bodyHtml) {
  return `<section class="station ${isDone ? "done" : ""} ${isCurrent ? "current open" : ""}" id="st-${id}">
    <div class="station-head" onclick="toggleStation('${id}')" role="button" tabindex="0"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleStation('${id}')}">
      <span class="st-status">${isDone ? "✓" : isCurrent ? "▶" : "○"}</span>
      <h3>${title}</h3><span class="st-sub">${sub}</span>
      <span class="st-caret">▶</span>
    </div>
    <div class="station-fold"><div><div class="station-body">${bodyHtml}</div></div></div>
  </section>`;
}

window.toggleStation = (id) => $(`#st-${id}`).classList.toggle("open");

function renderStations() {
  const d = state.detail;
  const s = d.steps;
  const done = stageStates();
  const current = d.stage;
  $("#stations").innerHTML = [
    station("source", "① 素材", `${d.originals.length} 个原片`, done["素材"], current === "素材", sourceBody(d)),
    station("cut", "② 剪辑", d.edl ? `EDL ${d.edl.segments} 段 · ${fmtDur(d.edl.duration)}` : "未生成 EDL",
      done["剪辑"], current === "剪辑", cutBody(d)),
    station("captions", "③ 字幕", s.captions ? `${d.data["captions.json"].length} 条` : "未生成",
      done["字幕"], current === "字幕", captionsBody(d)),
    station("pack", "④ 包装", s.beats ? `${d.data["beats.json"].length} 拍 · 主题 ${d.theme || state.themes.default}` : "未排拍",
      done["包装"], current === "包装", packBody(d)),
    station("ship", "⑤ 出片", shipSub(d), done["出片"], ["出片", "QA", "交付", "完成"].includes(current), shipBody(d))
  ].join("");
  bindStationEvents();
}

function shipSub(d) {
  const parts = [];
  if (d.renders.length) parts.push(`${d.renders.length} 个成片`);
  if (d.qa.failures) parts.push(d.qa.failures.length === 0 ? "QA 通过" : `QA ${d.qa.failures.length} 项失败`);
  if (d.delivered) parts.push("已交付");
  return parts.join(" · ") || "未渲染";
}

// ---------- ① 素材 ----------
function sourceBody(d) {
  const chips = d.originals.map((f) => `<span class="file-chip">${esc(f.name)} · ${fmtSize(f.size)}</span>`).join("") ||
    '<div class="hint">还没有原片。把拍摄文件的绝对路径粘到下面导入(硬链接,不复制大文件;SD 卡文件先拷到本地)。</div>';
  return `${chips}
    <div class="kv">母版 A-roll:<b>${esc(d.arollPath)}</b> ${d.arollExists ? '<span class="qa-pass">已就绪</span>' : '<span class="dim">(待剪辑工位生成)</span>'}</div>
    <div class="actions">
      <input id="import-path" placeholder="/Volumes/DJI/.../原片.MP4 或本地路径" style="flex:1;min-width:280px" />
      <button onclick="importSource()">导入原片</button>
    </div>`;
}

window.importSource = async () => {
  const path = $("#import-path").value.trim();
  if (!path) return toast("先粘路径");
  try {
    await api(`/api/job/${state.slug}/import`, { method: "POST", body: { path } });
    toast("已导入");
    await loadJob(state.slug);
  } catch (error) { toast(error.message); }
};

// ---------- ② 剪辑 ----------
function cutBody(d) {
  return `<p class="kv">新视频请直接唤醒 talkinghead-edit 做语义精剪；下面静音 EDL 只用于旧项目兼容。</p>
    <div class="actions">
      <button onclick="showPrompt('cuts', 'talkinghead-edit 精剪任务卡')">语义精剪任务卡</button>
      <button class="ghost" onclick="runAction('roughcut')">旧项目：静音 EDL</button>
      <button onclick="runAction('render-aroll')">从已确认 EDL 渲染母版</button>
    </div>
    ${d.edl ? `<div class="kv">EDL:<b>${d.edl.segments}</b> 段,成片预计 <b>${fmtDur(d.edl.duration)}</b></div>` : ""}`;
}

// ---------- ③ 字幕 ----------
function captionsBody(d) {
  const captions = d.data["captions.json"] || [];
  const rows = captions.map((c, i) => `<tr>
      <td class="t-num"><input data-cap="${i}" data-field="s" value="${num(c.s ?? c.start)}" /></td>
      <td class="t-num"><input data-cap="${i}" data-field="e" value="${num(c.e ?? c.end)}" /></td>
      <td><input data-cap="${i}" data-field="t" value="${esc(c.t ?? c.text ?? "")}" /></td>
      <td class="t-del"><button onclick="delRow('captions', ${i})">✕</button></td>
    </tr>`).join("");
  return `<p class="kv">流程:本地 whisper 一键出初稿 → Claude 任务卡做通篇术语校准(核心词不许被 ASR 覆盖)。</p>
    <div class="actions">
      <button onclick="runAction('transcribe')">本地转录出初稿(whisper)</button>
      <button onclick="showPrompt('captions', 'Claude 字幕任务卡')">Claude 校准任务卡</button>
      ${captions.length ? `<button class="accent" onclick="saveCaptions()">保存字幕(${captions.length} 条)</button>
      <button onclick="addCaption()">＋ 加一条</button>` : ""}
    </div>
    ${captions.length ? `<div class="scroll-box"><table class="editor-table">
      <tr><th>开始</th><th>结束</th><th>文本</th><th></th></tr>${rows}</table></div>` : '<div class="hint">还没有字幕。点「本地转录出初稿」一键生成,再用任务卡让 Claude 校准术语。</div>'}`;
}

window.addCaption = () => {
  const captions = state.detail.data["captions.json"];
  const last = captions[captions.length - 1];
  captions.push({ s: last ? Number(last.e ?? last.end) : 0, e: last ? Number(last.e ?? last.end) + 2 : 2, t: "" });
  renderStations();
};

window.saveCaptions = async () => {
  const captions = collectCaptions();
  if (!captions) return;
  try {
    await api(`/api/job/${state.slug}/data/captions.json`, { method: "PUT", body: captions });
    toast(`字幕已保存(${captions.length} 条,旧版进 data/.history)`);
    await loadJob(state.slug);
  } catch (error) { toast(error.message); }
};

function collectCaptions() {
  const captions = structuredClone(state.detail.data["captions.json"]);
  for (const input of document.querySelectorAll("input[data-cap]")) {
    const item = captions[Number(input.dataset.cap)];
    const field = input.dataset.field;
    if (field === "t") item.t = input.value;
    else {
      const value = Number(input.value);
      if (!Number.isFinite(value)) { toast(`时间不合法: ${input.value}`); return null; }
      item[field] = value;
      delete item[field === "s" ? "start" : "end"];
    }
  }
  return captions;
}

// ---------- ④ 包装 ----------
function packBody(d) {
  const selected = d.theme || state.themes.default;
  const themeCards = state.themes.themes.map((t) => {
    const visual = t.preview
      ? `<div class="theme-preview" style="background-image:url('${t.preview}')"></div>`
      : `<div class="theme-swatches">${["pageBg", "cardBg", "accentFillBg", "kicker", "accent"]
          .map((k) => `<span style="background:${esc(t.tokens[k] || "#333")}"></span>`).join("")}</div>`;
    return `<div class="theme-card ${t.id === selected ? "selected" : ""}" onclick="pickTheme('${t.id}')">
      ${visual}<div class="theme-info"><b>${esc(t.label)} ${t.id === selected ? '<span class="theme-selected-tag">✓ 使用中</span>' : ""}</b>
      <small>${esc(t.description)}</small></div></div>`;
  }).join("");
  const beats = d.data["beats.json"] || [];
  const beatTypes = [...new Set([...state.componentTypes, ...beats.map((beat) => beat.type).filter(Boolean)])];
  const rows = beats.map((b, i) => {
    const { type, start, end, kicker, title, ...rest } = b;
    return `<tr>
      <td class="t-type"><select data-beat="${i}" data-field="type">${beatTypes.map((t) => `<option ${t === type ? "selected" : ""}>${t}</option>`).join("")}</select></td>
      <td class="t-num"><input data-beat="${i}" data-field="start" value="${num(start)}" /></td>
      <td class="t-num"><input data-beat="${i}" data-field="end" value="${num(end)}" /></td>
      <td style="width:130px"><input data-beat="${i}" data-field="kicker" value="${esc(kicker || "")}" /></td>
      <td><input data-beat="${i}" data-field="title" value="${esc(title || "")}" /></td>
      <td class="t-del"><button onclick="delRow('beats', ${i})">✕</button></td>
    </tr>
    <tr><td colspan="6"><textarea class="beat-details" data-beatjson="${i}" spellcheck="false">${esc(JSON.stringify(rest))}</textarea></td></tr>`;
  }).join("");
  return `<p class="kv"><b>主题模板</b>(风格只从这里选,新增风格走截图复刻流程 → docs/theme-replication.md)</p>
    <div id="theme-grid">${themeCards}</div>
    <p class="kv"><b>拍子(beats)</b> — 每拍 = 一张辅助理解的动态卡;详情行是该模板的专有字段 JSON。</p>
    <div class="actions">
      <button onclick="window.FactoryLibrary?.showLibrary()">打开视觉库</button>
      <button onclick="showPrompt('beats', 'Claude 排拍任务卡')">Claude 排拍任务卡</button>
      ${beats.length ? `<button class="accent" onclick="saveBeats()">保存拍子(${beats.length})</button>
      <button onclick="addBeat()">＋ 加一拍</button>` : ""}
    </div>
    ${beats.length ? `<div class="scroll-box"><table class="editor-table">
      <tr><th>模板</th><th>开始</th><th>结束</th><th>kicker</th><th>标题</th><th></th></tr>${rows}</table></div>` : '<div class="hint">还没有拍子。复制「Claude 排拍任务卡」到 Claude Code,它会通读字幕、挑高密度位置排拍并写入 data/beats.json。</div>'}`;
}

window.pickTheme = async (id) => {
  try {
    await api(`/api/job/${state.slug}/project`, { method: "PUT", body: { theme: id } });
    toast(`主题已切到 ${id},重新构建后生效`);
    await loadJob(state.slug);
  } catch (error) { toast(error.message); }
};

window.addBeat = () => {
  const beats = state.detail.data["beats.json"];
  const last = beats[beats.length - 1];
  const start = last ? Number(last.end) : 0;
  const type = state.componentTypes[0] || last?.type;
  if (!type) return toast("组件目录尚未就绪，请先刷新视觉库", "err");
  beats.push({ type, start, end: start + 10, kicker: "新拍", title: "", items: [], body: "" });
  renderStations();
};

window.saveBeats = async () => {
  const beats = collectBeats();
  if (!beats) return;
  try {
    await api(`/api/job/${state.slug}/data/beats.json`, { method: "PUT", body: beats });
    toast(`拍子已保存(${beats.length},旧版进 data/.history)`);
    await loadJob(state.slug);
  } catch (error) { toast(error.message); }
};

function collectBeats() {
  const beats = state.detail.data["beats.json"].map(() => ({}));
  for (const input of document.querySelectorAll("[data-beat]")) {
    const item = beats[Number(input.dataset.beat)];
    const field = input.dataset.field;
    if (field === "start" || field === "end") {
      const value = Number(input.value);
      if (!Number.isFinite(value)) { toast(`时间不合法: ${input.value}`); return null; }
      item[field] = value;
    } else item[field] = input.value;
  }
  for (const area of document.querySelectorAll("[data-beatjson]")) {
    const index = Number(area.dataset.beatjson);
    try {
      Object.assign(beats[index], JSON.parse(area.value || "{}"));
    } catch {
      toast(`第 ${index + 1} 拍详情 JSON 不合法`);
      return null;
    }
  }
  return beats;
}

window.delRow = (kind, index) => {
  const file = kind === "captions" ? "captions.json" : "beats.json";
  state.detail.data[file].splice(index, 1);
  renderStations();
};

// ---------- ⑤ 出片 ----------
function shipBody(d) {
  const targets = d.targets;
  const tiles = TARGETS.map((t) => `<label class="target-tile ${targets.includes(t.id) ? "checked" : ""}">
      <input type="checkbox" data-target="${t.id}" ${targets.includes(t.id) ? "checked" : ""} onchange="saveTargets()" />
      <span><b>${t.label}</b><small>${t.desc}</small></span>
    </label>`).join("");
  const renderRow = (src, label, f) => `<div class="render-item">
      <video src="${src}" controls preload="metadata" muted></video>
      <div class="r-info"><div><b>${label}</b></div><div class="dim">${fmtSize(f.size)}${f.mtime ? ` · ${new Date(f.mtime).toLocaleString("zh-CN")}` : ""}</div></div>
      <button class="ghost small" onclick="reveal('${esc(f.rel)}')">Finder</button>
    </div>`;
  const renders = d.renders.map((f) =>
    renderRow(`/files/jobs/${d.slug}/renders/${encodeURIComponent(f.name)}`, esc(f.name), f)).join("");
  const variantRenders = d.variants.flatMap((v) => v.renders.map((f) =>
    renderRow(`/files/jobs/${d.slug}/variants/${v.id}/renders/${encodeURIComponent(f.name)}`, `[${esc(v.label)}] ${esc(f.name)}`, f))).join("");
  const shortsOut = d.shortsOut.map((f) => `<span class="file-chip">${esc(f.name)} · ${fmtSize(f.size)}</span>`).join("");
  const qa = d.qa.failures === null ? '<span class="dim">未跑 QA</span>'
    : d.qa.failures.length === 0 ? '<span class="qa-pass">QA 全部通过 ✓</span>'
    : `<span class="qa-fail">QA 失败 ${d.qa.failures.length} 项:${esc(d.qa.failures.join(";"))}</span>`;
  const sheets = [...d.qa.sheets, ...d.qa.frames.slice(0, 12)].map((src) => `<img src="${src}" loading="lazy" alt="QA 抽帧" onclick="showImage('${src}')" />`).join("");
  return `<p class="kv"><b>这次要出什么</b>(勾选后"一键处理"按顺序跑完所选目的的 构建→检查→渲染→QA→交付)</p>
    <div class="target-row">${tiles}</div>
    <div class="actions">
      <button class="accent" onclick="runChain()">🚀 一键处理所选目的</button>
      <button onclick="runAction('build')">构建</button>
      <button onclick="runAction('check')">检查</button>
      <button onclick="runAction('render')">渲染</button>
      <button onclick="runAction('qa')">QA</button>
      <button onclick="runAction('deliver')">交付</button>
      <button onclick="showPrompt('shorts', 'Claude Shorts 切片任务卡')">Shorts 选题任务卡</button>
      <button onclick="runAction('shorts')">切 Shorts</button>
    </div>
    <div class="kv">QA:${qa}</div>
    ${sheets ? `<div class="qa-frames">${sheets}</div>` : ""}
    ${renders || variantRenders ? `<p class="kv"><b>成片</b></p>${renders}${variantRenders}` : ""}
    ${shortsOut ? `<p class="kv"><b>Shorts</b></p>${shortsOut}` : ""}
    ${d.delivered ? `<div class="kv">已交付:<b>${esc(d.delivered)}</b>
      <button class="ghost small" onclick="reveal('${esc(d.delivered)}')">打开交付文件夹</button></div>` : ""}`;
}

window.saveTargets = async () => {
  const targets = [...document.querySelectorAll("input[data-target]:checked")].map((el) => el.dataset.target);
  try {
    await api(`/api/job/${state.slug}/project`, { method: "PUT", body: { console: { targets } } });
    state.detail.targets = targets;
    renderStations();
  } catch (error) { toast(error.message); }
};

window.runChain = () => runAction("chain", { targets: state.detail.targets });

// ---------- 运行 ----------
window.runAction = async (action, params = {}) => {
  try {
    const run = await api(`/api/job/${state.slug}/run`, { method: "POST", body: { action, params } });
    attachRun(run);
  } catch (error) { toast(error.message); }
};

function attachRun(run) {
  state.run = run;
  if (state.es) state.es.close();
  $("#run-drawer").classList.remove("hidden");
  $("#run-pill").classList.add("hidden");
  $("#run-title").textContent = `${run.job} · ${run.action}`;
  $("#run-log").textContent = "";
  setRunStatus("running", "启动中…");
  const es = new EventSource(`/api/run/${run.id}/stream`);
  state.es = es;
  es.addEventListener("log", (event) => {
    const { text } = JSON.parse(event.data);
    const log = $("#run-log");
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.textContent += text;
    if (stick) log.scrollTop = log.scrollHeight;
  });
  es.addEventListener("step", (event) => {
    const { index, total, name } = JSON.parse(event.data);
    setRunStatus("running", `第 ${index + 1}/${total} 步:${name}`);
  });
  es.addEventListener("end", async (event) => {
    const { status } = JSON.parse(event.data);
    const text = status === "done" ? "全部完成 ✓" : status === "failed" ? "失败(看日志)" : "已取消";
    setRunStatus(status, text);
    toast(text, status === "done" ? "ok" : status === "failed" ? "err" : "");
    es.close();
    state.es = null;
    if (state.slug) await loadJob(state.slug);
    await loadState();
  });
  es.onerror = () => {};
}

function setRunStatus(status, text) {
  $("#run-status-dot").className = status;
  if (text) $("#run-step").textContent = text;
  $("#run-cancel").disabled = status !== "running";
  $("#run-pill").className = `${status === "running" ? "" : status}${$("#run-drawer").classList.contains("hidden") ? "" : " hidden"}`;
  $("#run-pill-text").textContent = text || "运行中";
}

$("#run-cancel").onclick = async () => {
  if (state.run) await api(`/api/run/${state.run.id}/cancel`, { method: "POST", body: {} }).catch((e) => toast(e.message, "err"));
};
$("#run-close").onclick = () => {
  $("#run-drawer").classList.add("hidden");
  if (state.run) {
    $("#run-pill").classList.remove("hidden");
    $("#run-pill-text").textContent = $("#run-step").textContent || "运行中";
  }
};
$("#run-pill").onclick = () => {
  $("#run-drawer").classList.remove("hidden");
  $("#run-pill").classList.add("hidden");
};
window.reveal = async (path) => {
  try {
    await api("/api/reveal", { method: "POST", body: { path } });
  } catch (error) { toast(error.message, "err"); }
};

// ---------- 任务卡 / 弹窗 ----------
window.showPrompt = async (kind, title) => {
  try {
    const { prompt } = await api(`/api/job/${state.slug}/prompt/${kind}`);
    openModal(title, `<p class="dim" style="margin-top:0">复制到 Claude Code 里执行;跑完回控制台点"刷新"。</p>
      <textarea class="prompt-box" readonly>${esc(prompt)}</textarea>
      <div class="row-gap"><button class="accent" onclick="copyPrompt(this)">复制任务卡</button></div>`);
  } catch (error) { toast(error.message); }
};

window.copyPrompt = async (btn) => {
  await navigator.clipboard.writeText($("#modal-body textarea").value);
  btn.textContent = "已复制 ✓";
};

window.showImage = (src) => openModal("QA 抽帧", `<img src="${src}" />`);

function openModal(title, html) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = html;
  $("#modal-backdrop").classList.remove("hidden");
}
$("#modal-close").onclick = () => $("#modal-backdrop").classList.add("hidden");
$("#modal-backdrop").onclick = (event) => {
  if (event.target === $("#modal-backdrop")) $("#modal-backdrop").classList.add("hidden");
};

// ---------- 新建 job / 顶栏 ----------
$("#btn-new-job").onclick = () => $("#new-job-form").classList.toggle("hidden");
$("#nj-cancel").onclick = () => $("#new-job-form").classList.add("hidden");
$("#nj-create").onclick = async () => {
  const slug = $("#nj-slug").value.trim();
  if (!slug) return toast("slug 必填");
  try {
    await api("/api/jobs", {
      method: "POST",
      body: { slug, title: $("#nj-title").value.trim() || slug, source: $("#nj-source").value.trim() || undefined }
    });
    $("#new-job-form").classList.add("hidden");
    await loadState();
    await openProject(slug);
    toast("Job 已创建");
  } catch (error) { toast(error.message); }
};
$("#btn-doctor").onclick = async () => {
  if (!state.jobs.length) return toast("先建一个 job");
  try {
    const run = await api(`/api/job/${state.jobs[0].slug}/run`, { method: "POST", body: { action: "doctor" } });
    attachRun(run);
  } catch (error) { toast(error.message); }
};
$("#btn-refresh").onclick = async () => {
  await loadState();
  if (document.body.dataset.view === "library") await window.FactoryLibrary?.refresh();
  else if (state.slug) await loadJob(state.slug);
  toast("已刷新");
};

function bindStationEvents() {
  for (const tile of document.querySelectorAll(".target-tile input")) {
    tile.parentElement.classList.toggle("checked", tile.checked);
  }
}

// ---------- 小工具 ----------
function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function num(value) { return Number.isFinite(Number(value)) ? Number(value) : ""; }
function fmtDur(seconds) {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}
function fmtSize(bytes) {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}
let toastTimer;
function toast(text, kind = "") {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = text;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2800);
}

async function openProject(slug) {
  if (window.FactoryLibrary) return window.FactoryLibrary.showProjects(slug);
  return loadJob(slug);
}

function setComponentCatalog(components = []) {
  state.componentTypes = [...new Set(components
    .filter((component) => component.lifecycle !== "archived" && component.compatibility === "supported")
    .map((component) => component.apply?.type || component.apply?.payload?.type || component.id)
    .filter(Boolean))];
  if (state.detail) renderStations();
}

window.FactoryConsole = {
  api,
  getState: () => state,
  loadState,
  loadJob,
  openProject,
  setComponentCatalog,
  toast
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") $("#modal-backdrop").classList.add("hidden");
});

// ---------- 启动 ----------
(async function init() {
  await loadState();
  setInterval(loadState, 8000);
})();
