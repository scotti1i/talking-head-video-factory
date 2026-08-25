// ============================================================
// 视觉库：扫描结果的展示层。组件创作留给 Codex / Claude / CLI。
// ============================================================
(() => {
  const $ = (selector) => document.querySelector(selector);
  const consoleApp = window.FactoryConsole;
  const ui = {
    data: null,
    familyId: null,
    aspect: localStorage.getItem("factory.visual.aspect") || "portrait",
    theme: localStorage.getItem("factory.visual.theme") || "",
    search: "",
    lifecycle: "",
    compatibility: "",
    health: "",
    compare: [],
    detail: null,
    fixture: null,
    detailDual: false,
    jobId: null,
    applying: false,
    cards: new Map(),
    liveFrames: new Map(),
    loading: null
  };

  const LABELS = {
    published: "已发布",
    archived: "历史",
    draft: "草稿",
    supported: "可应用",
    "preview-only": "仅预览",
    unsupported: "不支持",
    ok: "正常",
    warning: "注意",
    error: "错误",
    ready: "就绪",
    missing: "缺预览",
    stale: "待刷新",
    rendering: "生成中",
    failed: "失败"
  };

  const formatId = () => ui.aspect === "landscape" ? "horizontal" : "vertical";
  const aspectLabel = () => ui.aspect === "landscape" ? "YouTube 横屏 16:9" : "抖音竖屏 9:16";

  async function refresh(options = {}) {
    if (ui.loading) return ui.loading;
    setLoading(true);
    ui.loading = consoleApp.api("/api/visual-library")
      .then((data) => acceptLibrary(data, options))
      .catch(showLoadError)
      .finally(() => {
        ui.loading = null;
        setLoading(false);
      });
    return ui.loading;
  }

  function acceptLibrary(data, options) {
    ui.data = normalizeLibrary(data);
    consoleApp.setComponentCatalog(ui.data.components);
    populateFilters();
    populateJobs();
    const remembered = localStorage.getItem("factory.visual.family");
    const requested = options.familyId || ui.familyId || remembered;
    const fallback = ui.data.families.find((family) => family.lifecycle === "published") || ui.data.families[0];
    ui.familyId = ui.data.families.some((family) => family.id === requested) ? requested : fallback?.id || null;
    if (!ui.data.themes.some((theme) => theme.id === ui.theme)) {
      ui.theme = ui.data.themes.find((theme) => theme.default)?.id || ui.data.themes[0]?.id || "";
    }
    $("#library-theme").value = ui.theme;
    renderAll();
    if (ui.data.errors.length) showAlert(`扫描完成，但有 ${ui.data.errors.length} 项可诊断问题；错误资产仍保留在目录中。`);
    else hideAlert();
    return ui.data;
  }

  function normalizeLibrary(data) {
    const families = Array.isArray(data?.families) ? data.families : [];
    const assets = Array.isArray(data?.assets) ? data.assets : [];
    const components = Array.isArray(data?.components) ? data.components : assets.filter((item) => item.kind === "component");
    const themes = Array.isArray(data?.themes) ? data.themes : assets.filter((item) => item.kind === "theme");
    return {
      ...data,
      families,
      assets,
      components,
      themes,
      errors: Array.isArray(data?.errors) ? data.errors : []
    };
  }

  function setLoading(loading) {
    $("#library-grid").setAttribute("aria-busy", String(loading));
    $("#library-refresh").disabled = loading;
    $("#library-refresh").textContent = loading ? "…" : "↻";
  }

  function showLoadError(error) {
    showAlert(`视觉库读取失败：${error.message}`);
    $("#library-grid").innerHTML = "";
    $("#library-empty").classList.remove("hidden");
    $("#library-empty strong").textContent = "视觉库没有加载成功";
    $("#library-empty p").textContent = "原有视频项目仍可使用；请修复扫描错误后重试。";
  }

  function populateFilters() {
    fillSelect("#library-theme", ui.data.themes.map((theme) => [theme.id, theme.label]), "主题：自动");
    fillSelect("#library-filter-lifecycle", entries(ui.data.filters?.lifecycles), "全部生命周期", LABELS);
    fillSelect("#library-filter-compatibility", entries(ui.data.filters?.compatibility), "全部兼容性", LABELS);
    fillSelect("#library-filter-health", entries(ui.data.filters?.health), "全部状态", LABELS);
  }

  function fillSelect(selector, options, emptyLabel, labels = {}) {
    const select = $(selector);
    const current = select.value;
    select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>${options.map(([value, label]) =>
      `<option value="${escapeHtml(value)}">${escapeHtml(labels[value] || label || value)}</option>`).join("")}`;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  function entries(value) {
    if (Array.isArray(value)) return value.map((item) => [item.id || item.value || item, item.label || item.id || item]);
    return Object.keys(value || {}).map((key) => [key, key]);
  }

  function populateJobs(preferCurrent = false) {
    const select = $("#library-job");
    const jobs = consoleApp.getState().jobs.filter((job) => job.kind === "normal");
    const active = consoleApp.getState().slug;
    const current = preferCurrent && jobs.some((job) => job.slug === active)
      ? active
      : ui.jobId || select.value || active || jobs[0]?.slug || "";
    select.innerHTML = jobs.length
      ? jobs.map((job) => `<option value="${escapeHtml(job.slug)}">${escapeHtml(job.title)}</option>`).join("")
      : '<option value="">暂无视频项目</option>';
    if (jobs.some((job) => job.slug === current)) select.value = current;
    ui.jobId = select.value;
  }

  function renderAll() {
    renderFamilies();
    renderHeading();
    renderCards();
    renderCompareButton();
    updateAspectButtons();
  }

  function renderFamilies() {
    const families = ui.data.families;
    const active = families.filter((family) => family.lifecycle !== "archived");
    const historical = families.filter((family) => family.lifecycle === "archived");
    $("#library-family-count").textContent = `${families.length} 套 · ${ui.data.counts?.entries || ui.data.assets.length} 个结构`;
    $("#library-family-list").innerHTML = [
      familySection("当前可用", active),
      familySection("历史视觉套装", historical)
    ].join("");
    for (const button of document.querySelectorAll(".family-button")) {
      button.addEventListener("click", () => selectFamily(button.dataset.family));
    }
  }

  function familySection(label, families) {
    if (!families.length) return "";
    return `<div class="family-section-label"><span>${label}</span><span>${families.length}</span></div>${families.map((family) => {
      const health = healthState(family);
      return `<button class="family-button ${family.id === ui.familyId ? "active" : ""}" data-family="${escapeHtml(family.id)}"
        aria-current="${family.id === ui.familyId ? "page" : "false"}">
        <span class="family-name-row"><span class="family-health ${health}"></span><span class="family-name">${escapeHtml(family.label)}</span></span>
        <span class="family-count">${familyCardCount(family)}</span>
      </button>`;
    }).join("")}`;
  }

  function familyCardCount(family) {
    const components = ui.data.components.filter((item) => item.familyId === family.id);
    const typed = ui.data.assets.filter((item) => item.familyId === family.id && item.id !== family.id && item.kind !== "theme");
    return new Set([...components, ...typed].map((item) => item.id).concat((family.items || []).map((item) => item.id))).size || 1;
  }

  function renderHeading() {
    const family = currentFamily();
    if (!family) return;
    $("#library-title").textContent = family.label;
    $("#library-description").textContent = family.description || "该套装没有说明。";
    const lifecycle = $("#library-lifecycle");
    lifecycle.textContent = LABELS[family.lifecycle] || family.lifecycle;
    lifecycle.className = `status-chip ${family.lifecycle}`;
    const formats = (family.formats || []).map((format) => format.label || format.aspect || format.id).join(" · ");
    $("#library-family-meta").innerHTML = [
      `${familyCardCount(family)} 个信息结构`,
      formats || "未声明画幅",
      family.origin === "family" ? `来源 ${escapeHtml(family.manifestPath || "manifest")}` : "",
      family.usage?.count ? `${family.usage.count} 个 Job 使用过` : "尚无当前 Job 使用记录"
    ].filter(Boolean).map((item) => `<span>${item}</span>`).join("");
  }

  function selectFamily(id, updateRoute = true) {
    if (!ui.data.families.some((family) => family.id === id)) return;
    const changed = ui.familyId !== id;
    ui.familyId = id;
    localStorage.setItem("factory.visual.family", id);
    if (changed) ui.compare = [];
    renderAll();
    if (updateRoute) setHash(`/library/${encodeURIComponent(id)}`);
  }

  function currentFamily() {
    return ui.data?.families.find((family) => family.id === ui.familyId) || null;
  }

  function cardsForFamily() {
    const family = currentFamily();
    if (!family) return [];
    const components = ui.data.components.filter((asset) => asset.familyId === family.id);
    const typed = ui.data.assets.filter((asset) => asset.familyId === family.id && asset.id !== family.id && asset.kind !== "theme");
    const cards = [...components];
    const seen = new Set(cards.map((asset) => asset.id));
    for (const asset of typed) if (!seen.has(asset.id)) cards.push(asset), seen.add(asset.id);
    for (const item of family.items || []) {
      if (!seen.has(item.id)) cards.push(virtualItem(family, item)), seen.add(item.id);
    }
    return cards.length ? cards : [family];
  }

  function virtualItem(family, item) {
    const state = item.preview?.state || item.status || "missing";
    const severity = state === "failed" ? "error" : state === "ready" ? "ok" : "warning";
    const issues = severity === "ok" ? [] : [{ code: state, message: item.preview?.error || state, severity }];
    const preview = item.preview || {
      ...family.preview,
      state: family.preview?.state === "ready" ? "missing" : family.preview?.state || "missing",
      posterUrl: null,
      loopUrl: null
    };
    return {
      ...family,
      id: `${family.id}::${item.id}`,
      catalogId: family.id,
      familyId: family.id,
      label: item.label,
      description: item.description || family.description,
      kind: item.kind || "component",
      compatibility: item.compatibility || "preview-only",
      formats: item.formats?.length ? item.formats : family.formats,
      virtual: true,
      preview,
      previews: item.preview ? [item.preview] : [],
      apply: { enabled: false, mode: "none", reason: item.kind === "layout" ? "布局会随目标画幅自动使用，无需单独应用" : "历史结构尚未迁移到统一生产链" },
      version: item.version || family.version || null,
      provenance: item.provenance || family.manifestPath || null,
      health: { state: severity, summary: severity === "ok" ? "真实证据可读" : item.preview?.error || "历史结构待迁移", issues }
    };
  }

  function filteredCards() {
    const query = ui.search.trim().toLowerCase();
    return cardsForFamily().filter((asset) => {
      const haystack = [asset.id, asset.label, asset.description, asset.category, ...(asset.tags || [])].join(" ").toLowerCase();
      return (!query || haystack.includes(query))
        && (!ui.lifecycle || asset.lifecycle === ui.lifecycle)
        && (!ui.compatibility || asset.compatibility === ui.compatibility)
        && (!ui.health || healthState(asset) === ui.health);
    });
  }

  function renderCards() {
    const cards = filteredCards();
    ui.cards = new Map(cards.map((asset) => [asset.id, asset]));
    releaseAllFrames();
    $("#library-grid").dataset.aspect = ui.aspect;
    $("#library-result-count").textContent = `${cards.length} 项 · ${aspectLabel()}`;
    $("#library-grid").innerHTML = cards.map(cardHtml).join("");
    $("#library-empty").classList.toggle("hidden", cards.length > 0);
    bindCards();
  }

  function cardHtml(asset) {
    const preview = previewFor(asset);
    const poster = preview.posterUrl
      ? `<img src="${escapeHtml(preview.posterUrl)}" alt="${escapeHtml(asset.label)} 的真实预览" loading="lazy" />`
      : placeholderHtml(preview, asset);
    const selected = ui.compare.some((item) => item.id === asset.id);
    return `<article class="visual-card ${selected ? "selected" : ""}" data-id="${escapeHtml(asset.id)}" data-aspect="${ui.aspect}">
      <button class="visual-card-frame" aria-label="查看 ${escapeHtml(asset.label)} 详情">
        <span class="visual-card-media">${poster}</span>
        <span class="visual-card-overlay"><span class="preview-state ${preview.state}">${previewIcon(preview.state)} ${LABELS[preview.state] || preview.state}</span></span>
      </button>
      <button class="card-compare-toggle ${selected ? "active" : ""}" aria-pressed="${selected}" title="加入对比">${selected ? "✓" : "◫"}</button>
      <div class="visual-card-caption">
        <div><strong>${escapeHtml(asset.label)}</strong><code>${escapeHtml(displayId(asset))}</code></div>
        <span class="format-badges">${formatBadges(asset)}</span>
      </div>
    </article>`;
  }

  function placeholderHtml(preview, asset) {
    const reason = preview.error || asset.apply?.reason || previewReason(preview.state);
    return `<span class="visual-card-placeholder"><span class="placeholder-mark">${previewIcon(preview.state)}</span>
      <strong>${escapeHtml(LABELS[preview.state] || "无预览")}</strong><span>${escapeHtml(reason)}</span></span>`;
  }

  function previewReason(state) {
    return {
      missing: "真实预览尚未生成",
      stale: "源文件已变化，仍保留上次结果",
      rendering: "后台正在生成真实预览",
      failed: "生成失败，打开详情查看原因",
      unsupported: `${aspectLabel()} 暂不支持`
    }[state] || "预览不可用";
  }

  function previewIcon(state) {
    return { ready: "●", missing: "○", stale: "↻", rendering: "…", failed: "!", unsupported: "×" }[state] || "○";
  }

  function formatBadges(asset) {
    const vertical = supportsFormat(asset, "vertical");
    const horizontal = supportsFormat(asset, "horizontal");
    return `<span class="format-badge ${vertical ? "supported" : ""}" title="${vertical ? "支持" : "不支持"} 9:16">▯</span>
      <span class="format-badge ${horizontal ? "supported" : ""}" title="${horizontal ? "支持" : "不支持"} 16:9">▭</span>`;
  }

  function bindCards() {
    for (const card of document.querySelectorAll(".visual-card")) {
      const asset = ui.cards.get(card.dataset.id);
      const frame = card.querySelector(".visual-card-frame");
      frame.addEventListener("click", () => openDetail(asset));
      frame.addEventListener("pointerenter", () => activatePreview(card, asset));
      frame.addEventListener("pointerleave", () => releasePreviewSoon(card));
      frame.addEventListener("focus", () => activatePreview(card, asset));
      frame.addEventListener("blur", () => releasePreviewSoon(card));
      card.querySelector(".card-compare-toggle").addEventListener("click", () => toggleCompare(asset));
    }
  }

  function activatePreview(card, asset) {
    const preview = previewFor(asset);
    if (preview.state !== "ready" || !preview.loopUrl || ui.liveFrames.has(card)) return;
    const media = liveMediaElement(preview.loopUrl, `${asset.label} 动态预览`);
    media.setAttribute("aria-hidden", "true");
    card.querySelector(".visual-card-media").appendChild(media);
    ui.liveFrames.set(card, media);
    while (ui.liveFrames.size > 4) releasePreview(ui.liveFrames.keys().next().value);
  }

  function liveMediaElement(url, title) {
    if (/\.(mp4|mov)(?:\?|$)/i.test(url)) {
      const video = document.createElement("video");
      Object.assign(video, { src: url, title, muted: true, autoplay: true, loop: true, playsInline: true });
      video.preload = "metadata";
      return video;
    }
    const iframe = document.createElement("iframe");
    Object.assign(iframe, { src: url, title, loading: "eager" });
    iframe.setAttribute("sandbox", "allow-scripts");
    return iframe;
  }

  function releasePreviewSoon(card) {
    window.setTimeout(() => {
      if (!card.matches(":hover") && !card.contains(document.activeElement)) releasePreview(card);
    }, 180);
  }

  function releasePreview(card) {
    ui.liveFrames.get(card)?.remove();
    ui.liveFrames.delete(card);
  }

  function releaseAllFrames() {
    for (const card of [...ui.liveFrames.keys()]) releasePreview(card);
  }

  function previewFor(asset, options = {}) {
    const aspect = options.aspect || ui.aspect;
    const format = aspect === "landscape" ? "horizontal" : "vertical";
    const theme = options.theme === undefined ? ui.theme : options.theme;
    const fixture = options.fixture || asset.defaultFixture || null;
    if (!supportsFormat(asset, format)) return { state: "unsupported", posterUrl: null, loopUrl: null };
    const candidates = (asset.previews || []).filter((preview) =>
      (!preview.format || preview.format === format)
      && (!fixture || preview.fixture === fixture || (!preview.fixture && asset.origin !== "component"))
      && (!theme || preview.theme === theme || (!preview.theme && asset.origin !== "component")));
    const ranked = candidates.sort((a, b) => previewScore(b, theme, format, fixture) - previewScore(a, theme, format, fixture));
    if (ranked[0]) return ranked[0];
    if (asset.origin === "component") return { state: "missing", posterUrl: null, loopUrl: null };
    const fallback = asset.preview || {};
    if (fallback.format && fallback.format !== format) return { state: "missing", posterUrl: null, loopUrl: null };
    return { state: fallback.state || "missing", posterUrl: fallback.posterUrl || null, loopUrl: fallback.loopUrl || null, error: fallback.error || null };
  }

  function previewScore(preview, theme, format, fixture) {
    const state = { ready: 8, stale: 6, rendering: 4, failed: 2, missing: 1 }[preview.state] || 0;
    return state + (preview.theme === theme ? 4 : 0) + (preview.format === format ? 3 : 0) + (preview.fixture === fixture ? 2 : 0);
  }

  function supportsFormat(asset, id) {
    return (asset.formats || []).some((format) => {
      const value = typeof format === "string" ? format : format.id;
      return normalizeFormat(value) === id && (typeof format === "string" || format.supported !== false);
    });
  }

  function normalizeFormat(value) {
    if (["portrait", "vertical", "9:16", "douyin"].includes(value)) return "vertical";
    if (["landscape", "horizontal", "16:9", "youtube"].includes(value)) return "horizontal";
    return value;
  }

  function toggleCompare(asset) {
    const index = ui.compare.findIndex((item) => item.id === asset.id);
    if (index >= 0) ui.compare.splice(index, 1);
    else {
      if (ui.compare.length >= 4) return consoleApp.toast("最多同时比较 4 项", "err");
      if (ui.compare.length && ui.compare[0].kind !== asset.kind) return consoleApp.toast("对比项必须属于同一种资产", "err");
      ui.compare.push(asset);
    }
    renderCards();
    renderCompareButton();
  }

  function renderCompareButton() {
    $("#compare-count").textContent = ui.compare.length;
    $("#library-open-compare").disabled = ui.compare.length < 2;
  }

  function openDetail(asset, updateRoute = true) {
    const changed = ui.detail?.id !== asset.id;
    ui.detail = asset;
    if (changed || !asset.fixtures?.some((item) => item.id === ui.fixture)) ui.fixture = asset.fixtures?.[0]?.id || null;
    $("#detail-kind").textContent = `${asset.kind} · ${aspectLabel()}`;
    $("#detail-title").textContent = asset.label;
    $("#detail-body").innerHTML = detailHtml(asset);
    $("#library-detail-backdrop").classList.remove("hidden");
    bindDetail(asset);
    if (updateRoute) setHash(`/library/${encodeURIComponent(ui.familyId)}/${encodeURIComponent(asset.id)}`, false, { visualDetail: true });
    $("#detail-close").focus();
  }

  function detailHtml(asset) {
    const preview = previewFor(asset, { fixture: ui.fixture });
    const canApply = Boolean(asset.apply?.enabled && $("#library-job").value && supportsFormat(asset, formatId()) && !ui.applying);
    const sources = (asset.sources || []).map((source) => `<li><code>${escapeHtml(source.path)}</code> · ${escapeHtml(source.role)} · ${source.exists ? "存在" : "缺失"}</li>`).join("");
    const issues = (asset.health?.issues || []).map((issue) => `<li>${escapeHtml(issue.message)}${issue.path ? ` · ${escapeHtml(issue.path)}` : ""}</li>`).join("");
    return `${detailControls(asset)}
      <div class="detail-preview-grid ${ui.detailDual ? "dual" : ""}">${ui.detailDual
        ? detailPreview(asset, "portrait") + detailPreview(asset, "landscape")
        : detailPreview(asset, ui.aspect)}</div>
      <p class="detail-summary">${escapeHtml(asset.description || "暂无说明")}</p>
      <div class="detail-actions">
        <button id="detail-apply" class="accent" ${canApply ? "" : "disabled"}>应用到${aspectLabel()}</button>
        <button id="detail-compare">${ui.compare.some((item) => item.id === asset.id) ? "移出对比" : "加入对比"}</button>
        <button id="detail-refresh-preview" ${asset.kind === "component" && !asset.virtual ? "" : "disabled"}>刷新真实预览</button>
        <button id="detail-copy-prompt" class="ghost">复制 Codex 指令</button>
        <button id="detail-reveal" class="ghost" ${asset.sources?.length ? "" : "disabled"}>打开源文件</button>
      </div>
      ${!canApply ? `<div class="library-alert">${escapeHtml(asset.apply?.reason || "先选择一个视频项目后才能应用")}</div>` : ""}
      <dl class="detail-grid">
        <dt>ID</dt><dd><code>${escapeHtml(displayId(asset))}</code></dd>
        <dt>状态</dt><dd>${escapeHtml(LABELS[asset.lifecycle] || asset.lifecycle)} · ${escapeHtml(LABELS[asset.compatibility] || asset.compatibility)} · ${escapeHtml(asset.health?.summary || LABELS[healthState(asset)])}</dd>
        <dt>画幅</dt><dd>${escapeHtml((asset.formats || []).map((item) => item.label || item.aspect || item.id).join(" · ") || "未声明")}</dd>
        <dt>预览</dt><dd>${escapeHtml(LABELS[preview.state] || preview.state)}${preview.updatedAt ? ` · ${escapeHtml(new Date(preview.updatedAt).toLocaleString("zh-CN"))}` : ""}</dd>
        <dt>版本 / 来源</dt><dd>${escapeHtml(asset.version || "未声明")} · ${escapeHtml(asset.provenance || asset.manifestPath || "未声明")}</dd>
        <dt>测试场景</dt><dd>${escapeHtml(asset.fixtures?.find((item) => item.id === ui.fixture)?.label || ui.fixture || "默认")}</dd>
        <dt>字段</dt><dd>${escapeHtml([...(asset.requiredFields || []), ...(asset.optionalFields || [])].join(" · ") || "由历史实现定义")}</dd>
        <dt>使用记录</dt><dd>${asset.usage?.count || 0} 个 Job · ${asset.usage?.beatCount || 0} 拍</dd>
      </dl>
      ${issues ? `<h3>问题</h3><ul class="issue-list">${issues}</ul>` : ""}
      ${sources ? `<h3>来源</h3><ul class="source-list">${sources}</ul>` : ""}`;
  }

  function detailControls(asset) {
    const themes = ui.data.themes.map((theme) => `<option value="${escapeHtml(theme.id)}" ${theme.id === ui.theme ? "selected" : ""}>${escapeHtml(theme.label)}</option>`).join("");
    const fixtures = (asset.fixtures || []).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === ui.fixture ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
    return `<div class="detail-controls">
      <label>模板<select id="detail-theme">${themes}</select></label>
      ${fixtures ? `<label>测试场景<select id="detail-fixture">${fixtures}</select></label>` : ""}
      <div class="detail-aspects" role="group" aria-label="详情画幅">
        <button data-detail-aspect="portrait" aria-pressed="${ui.aspect === "portrait"}">9:16</button>
        <button data-detail-aspect="landscape" aria-pressed="${ui.aspect === "landscape"}">16:9</button>
        <button id="detail-dual" aria-pressed="${ui.detailDual}">竖横并列</button>
      </div></div>`;
  }

  function detailPreview(asset, aspect) {
    const preview = previewFor(asset, { aspect, fixture: ui.fixture });
    const label = aspect === "landscape" ? "YouTube 横屏 16:9" : "抖音竖屏 9:16";
    return `<section class="detail-preview ${aspect}"><span class="detail-format-label">${label}</span>${mediaHtml(preview, asset, `${asset.label} · ${label}`)}</section>`;
  }

  function mediaHtml(preview, asset, title) {
    if (preview.loopUrl && preview.state === "ready") {
      if (/\.(mp4|mov)(?:\?|$)/i.test(preview.loopUrl)) {
        return `<video src="${escapeHtml(preview.loopUrl)}" title="${escapeHtml(title)}" muted autoplay loop playsinline preload="metadata"></video>`;
      }
      return `<iframe src="${escapeHtml(preview.loopUrl)}" title="${escapeHtml(title)}" sandbox="allow-scripts"></iframe>`;
    }
    if (preview.posterUrl) return `<img src="${escapeHtml(preview.posterUrl)}" alt="${escapeHtml(title)}" />`;
    return placeholderHtml(preview, asset);
  }

  function bindDetail(asset) {
    $("#detail-apply").addEventListener("click", () => applyAsset(asset));
    $("#detail-compare").addEventListener("click", () => { toggleCompare(asset); openDetail(asset); });
    $("#detail-refresh-preview").addEventListener("click", () => refreshPreview(asset));
    $("#detail-copy-prompt").addEventListener("click", () => copyAssetPrompt(asset));
    $("#detail-reveal").addEventListener("click", () => revealSource(asset));
    $("#detail-theme").addEventListener("change", (event) => setTheme(event.target.value));
    $("#detail-fixture")?.addEventListener("change", (event) => { ui.fixture = event.target.value; openDetail(asset, false); });
    for (const button of document.querySelectorAll("[data-detail-aspect]")) {
      button.addEventListener("click", () => setAspect(button.dataset.detailAspect));
    }
    $("#detail-dual").addEventListener("click", () => { ui.detailDual = !ui.detailDual; openDetail(asset, false); });
  }

  async function applyAsset(asset) {
    if (ui.applying) return;
    const job = $("#library-job").value;
    if (!job) return consoleApp.toast("先选择视频项目", "err");
    ui.applying = true;
    $("#detail-apply").disabled = true;
    try {
      const id = asset.catalogId || asset.id;
      const result = await consoleApp.api(`/api/visual-library/assets/${encodeURIComponent(id)}/apply`, {
        method: "POST",
        body: { job, format: formatId(), theme: ui.theme || undefined, fixture: ui.fixture || undefined }
      });
      consoleApp.toast(`已应用到 ${job} · ${result.saved || result.count || "完成"}`, "ok");
      await consoleApp.loadState();
      await refresh({ familyId: ui.familyId });
    } catch (error) {
      consoleApp.toast(error.message, "err");
    } finally {
      ui.applying = false;
      const current = cardsForFamily().find((item) => item.id === asset.id);
      if (current && ui.detail?.id === asset.id) openDetail(current, false);
    }
  }

  async function refreshPreview(asset) {
    try {
      const result = await consoleApp.api("/api/visual-library/previews", {
        method: "POST",
        body: { assetId: asset.catalogId || asset.id, component: asset.virtual ? null : asset.id, theme: ui.theme, format: formatId(), fixture: ui.fixture || undefined }
      });
      consoleApp.toast(result.status === "running" ? "预览已在后台开始生成" : "预览任务已启动", "ok");
      pollPreview(asset, { theme: ui.theme, format: formatId(), fixture: ui.fixture || "", startedAt: result.startedAt }, 0);
    } catch (error) {
      consoleApp.toast(error.message, "err");
    }
  }

  async function pollPreview(asset, selection, attempt) {
    if (attempt >= 120) return consoleApp.toast("预览仍在后台生成，可稍后刷新目录", "err");
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    try {
      const query = new URLSearchParams(selection);
      query.delete("startedAt");
      const data = await consoleApp.api(`/api/visual-library/assets/${encodeURIComponent(asset.id)}?${query}`);
      const updated = Date.parse(data.preview?.updatedAt || 0) >= Date.parse(selection.startedAt || 0);
      if (updated && ["ready", "failed", "unsupported"].includes(data.preview?.state)) {
        await refresh({ familyId: ui.familyId });
        const current = cardsForFamily().find((item) => item.id === asset.id);
        if (current && ui.detail?.id === asset.id) openDetail(current, false);
        return consoleApp.toast(data.preview.state === "ready" ? "真实预览已更新" : `预览结束：${LABELS[data.preview.state] || data.preview.state}`, data.preview.state === "ready" ? "ok" : "err");
      }
    } catch (error) {
      if (attempt > 3) return consoleApp.toast(error.message, "err");
    }
    pollPreview(asset, selection, attempt + 1);
  }

  async function copyAssetPrompt(asset) {
    const sources = (asset.sources || []).map((source) => source.path).join("、");
    const text = `在 talking-head-video-factory 中处理视觉资产 ${displayId(asset)}（${asset.label}）。\n目标画幅：${aspectLabel()}。\n来源：${sources || "请从 manifest 定位"}。\n保持真人为主画面，修改后更新组件 manifest，并跑 beats-regression 的竖屏与 YouTube 横屏检查。`;
    await navigator.clipboard.writeText(text);
    consoleApp.toast("Codex 指令已复制", "ok");
  }

  function revealSource(asset) {
    const source = (asset.sources || []).find((item) => item.exists) || asset.sources?.[0];
    if (source) window.reveal(source.path);
  }

  function closeDetail(updateRoute = true) {
    const shouldGoBack = Boolean(history.state?.visualDetail);
    ui.detail = null;
    $("#library-detail-backdrop").classList.add("hidden");
    if (!updateRoute) return;
    if (shouldGoBack) history.back();
    else setHash(`/library/${encodeURIComponent(ui.familyId)}`, true);
  }

  function openCompare() {
    if (ui.compare.length < 2) return;
    $("#compare-body").style.setProperty("--compare-columns", Math.min(ui.compare.length, 4));
    $("#compare-body").innerHTML = `<div class="compare-syncbar"><button id="compare-replay">同步重播</button><span>${escapeHtml(ui.theme || "自动主题")} · ${aspectLabel()}</span></div>${ui.compare.map(compareCellHtml).join("")}`;
    $("#compare-backdrop").classList.remove("hidden");
    $("#compare-replay").addEventListener("click", replayCompare);
    $("#compare-close").focus();
  }

  function compareCellHtml(asset) {
    const preview = previewFor(asset);
    const media = mediaHtml(preview, asset, `${asset.label} 动态对比`);
    return `<article class="compare-cell"><div class="compare-cell-head"><strong>${escapeHtml(asset.label)}</strong><code>${escapeHtml(displayId(asset))}</code></div>
      <div class="compare-frame">${media}</div></article>`;
  }

  function replayCompare() {
    for (const iframe of document.querySelectorAll("#compare-body iframe")) {
      iframe.contentWindow?.postMessage({ type: "visual-preview:restart" }, "*");
    }
    for (const video of document.querySelectorAll("#compare-body video")) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  }

  function closeCompare() {
    $("#compare-backdrop").classList.add("hidden");
    $("#compare-body").innerHTML = "";
  }

  function updateAspectButtons() {
    for (const button of document.querySelectorAll(".aspect-switch [data-aspect]")) {
      const active = button.dataset.aspect === ui.aspect;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function setAspect(aspect) {
    ui.aspect = aspect;
    localStorage.setItem("factory.visual.aspect", aspect);
    closeCompare();
    renderCards();
    renderCompareButton();
    updateAspectButtons();
    if (ui.detail) openDetail(ui.detail, false);
  }

  function setTheme(theme) {
    ui.theme = theme;
    localStorage.setItem("factory.visual.theme", theme);
    $("#library-theme").value = theme;
    renderCards();
    if (ui.detail) openDetail(ui.detail, false);
  }

  function resetFilters() {
    ui.search = ui.lifecycle = ui.compatibility = ui.health = "";
    $("#library-search").value = "";
    $("#library-filter-lifecycle").value = "";
    $("#library-filter-compatibility").value = "";
    $("#library-filter-health").value = "";
    renderCards();
  }

  function healthState(asset) {
    return typeof asset.health === "string" ? asset.health : asset.health?.state || "warning";
  }

  function displayId(asset) {
    return asset.virtual ? asset.id.split("::").at(-1) : asset.id;
  }

  function showAlert(message) {
    $("#library-alert").textContent = message;
    $("#library-alert").classList.remove("hidden");
  }

  function hideAlert() {
    $("#library-alert").classList.add("hidden");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function setHash(path, replace = false, state = null) {
    const next = `#${path}`;
    if (location.hash !== next) history[replace ? "replaceState" : "pushState"](state, "", next);
  }

  async function showLibrary(familyId, assetId, replaceRoute = false) {
    document.body.dataset.view = "library";
    $("#library-layout").classList.remove("hidden");
    $("#layout").classList.add("hidden");
    $("#nav-library").classList.add("active");
    $("#nav-library").setAttribute("aria-current", "page");
    $("#nav-projects").classList.remove("active");
    $("#nav-projects").removeAttribute("aria-current");
    if (!ui.data) await refresh({ familyId });
    populateJobs(true);
    if (familyId) selectFamily(familyId, false);
    if (assetId) {
      const asset = cardsForFamily().find((item) => item.id === assetId);
      if (asset) openDetail(asset, false);
      else closeDetail(false);
    } else closeDetail(false);
    const route = `/library/${encodeURIComponent(ui.familyId || "")}${assetId ? `/${encodeURIComponent(assetId)}` : ""}`;
    setHash(route, replaceRoute || !location.hash);
  }

  async function showProjects(slug) {
    document.body.dataset.view = "projects";
    closeDetail(false);
    closeCompare();
    $("#library-layout").classList.add("hidden");
    $("#layout").classList.remove("hidden");
    $("#nav-projects").classList.add("active");
    $("#nav-projects").setAttribute("aria-current", "page");
    $("#nav-library").classList.remove("active");
    $("#nav-library").removeAttribute("aria-current");
    const target = slug || consoleApp.getState().slug || consoleApp.getState().jobs[0]?.slug;
    if (target) {
      await consoleApp.loadJob(target);
      setHash(`/jobs/${encodeURIComponent(target)}`);
    }
  }

  async function handleRoute() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] === "jobs") return showProjects(parts[1]);
    return showLibrary(parts[1], parts.slice(2).join("/") || null, true);
  }

  function bindControls() {
    $("#nav-library").addEventListener("click", () => showLibrary(ui.familyId));
    $("#nav-projects").addEventListener("click", () => showProjects());
    $("#library-refresh").addEventListener("click", () => refresh());
    $("#library-search").addEventListener("input", (event) => { ui.search = event.target.value; renderCards(); });
    $("#library-theme").addEventListener("change", (event) => setTheme(event.target.value));
    $("#library-filter-lifecycle").addEventListener("change", (event) => { ui.lifecycle = event.target.value; renderCards(); });
    $("#library-filter-compatibility").addEventListener("change", (event) => { ui.compatibility = event.target.value; renderCards(); });
    $("#library-filter-health").addEventListener("change", (event) => { ui.health = event.target.value; renderCards(); });
    for (const button of document.querySelectorAll(".aspect-switch [data-aspect]")) button.addEventListener("click", () => setAspect(button.dataset.aspect));
    $("#library-job").addEventListener("change", (event) => { ui.jobId = event.target.value; if (ui.detail) openDetail(ui.detail, false); });
    $("#library-reset-filters").addEventListener("click", resetFilters);
    $("#library-open-compare").addEventListener("click", openCompare);
    $("#detail-close").addEventListener("click", () => closeDetail());
    $("#compare-close").addEventListener("click", closeCompare);
    $("#library-detail-backdrop").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeDetail(); });
    $("#compare-backdrop").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeCompare(); });
    $("#library-copy-create").addEventListener("click", copyCreatePrompt);
  }

  async function copyCreatePrompt() {
    const text = "在 talking-head-video-factory 新增一个可复用口播视觉组件。先读取 docs/component-authoring.md 与 docs/visual-library-design-spec.md；新增 component.json、fixtures.json、render.mjs、style.css 四件套，不修改 App 名单；同时适配 9:16 与 YouTube 16:9，并跑组件目录测试和 beats-regression。";
    await navigator.clipboard.writeText(text);
    consoleApp.toast("新增组件指令已复制", "ok");
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("#compare-backdrop").classList.contains("hidden")) closeCompare();
    else if (!$("#library-detail-backdrop").classList.contains("hidden")) closeDetail();
  });

  window.addEventListener("popstate", handleRoute);
  window.FactoryLibrary = { refresh, showLibrary, showProjects };
  bindControls();
  consoleApp.loadState().then(handleRoute).catch((error) => showLoadError(error));
})();
