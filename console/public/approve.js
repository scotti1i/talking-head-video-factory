// ============================================================
// 审片页逻辑：无框架。
//   /approve            → GET /api/approve         → 待审列表
//   /approve?job=<slug> → GET /api/approve?job=    → 详情（终审视频 / 切点图）
// 「通过」亮起条件：姓名 + 勾「我完整看完了」+（终审）视频 ended 至少一次
//   +（切点有气口警告时）勾「听过了」。服务端同样校验，这里只是不让人误点。
// ============================================================
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const main = $("#main");
  const toastEl = $("#toast");
  const params = new URLSearchParams(location.search);
  const job = params.get("job");
  const NAME_KEY = "approve.name";

  const api = async (url, options) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };
  const post = (url, body) => api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  let toastTimer = null;
  function toast(message, kind = "") {
    toastEl.textContent = message;
    toastEl.className = `toast ${kind}`;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, kind === "bad" ? 6000 : 3000);
  }

  const kindLabel = (item) => (item.kind === "cuts" ? "切点" : `终审 ${item.revision}`);

  function renderList(pending) {
    main.replaceChildren();
    if (!pending.length) {
      const p = document.createElement("p");
      p.className = "dim";
      p.textContent = "没有待审批的片子。";
      main.append(p);
      return;
    }
    for (const item of pending) {
      const node = $("#tpl-item").content.firstElementChild.cloneNode(true);
      node.href = `/approve?job=${encodeURIComponent(item.slug)}`;
      $(".badge", node).textContent = kindLabel(item);
      $(".item-title", node).textContent = item.title;
      $(".item-slug", node).textContent = item.slug;
      main.append(node);
    }
  }

  // 姓名 + 勾选 +（可选）额外条件 → 决定按钮可用；姓名记在本机
  function wireForm(form, extraReady) {
    const name = form.elements.name;
    const box = form.elements.fullPlayback;
    const button = $("button[type=submit]", form);
    name.value = localStorage.getItem(NAME_KEY) || "";
    const refresh = () => { button.disabled = !(name.value.trim() && box.checked && extraReady()); };
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
    refresh();
    return { refresh, button, name, box };
  }

  function renderFinal(detail) {
    const final = detail.final;
    const node = $("#tpl-final").content.firstElementChild.cloneNode(true);
    $(".rev", node).textContent = final.revision;
    const video = $("video", node);
    video.src = final.videoUrl;
    const watch = $(".watch", node);
    let ended = false;
    video.addEventListener("ended", () => {
      ended = true;
      watch.textContent = "已看到结尾，可以做决定了。";
      watch.classList.add("watched");
      controls.refresh();
    });
    if (final.blocker) { const b = $(".blocker", node); b.hidden = false; b.textContent = `现在还不能通过：${final.blocker}`; }
    if (!final.pending) $(".done", node).hidden = false;

    const form = $(".approve-form", node);
    const controls = wireForm(form, () => ended && !final.blocker && final.pending);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      controls.button.disabled = true;
      try {
        localStorage.setItem(NAME_KEY, controls.name.value.trim());
        const result = await post("/approve", { job: detail.slug, kind: "final", name: controls.name.value.trim(), fullPlayback: true, watchedToEnd: ended, revision: final.revision });
        toast(`已通过 ${final.revision}，写入 ${result.file}`, "ok");
        setTimeout(() => location.replace("/approve"), 1200);
      } catch (error) {
        toast(error.message, "bad");
        controls.refresh();
      }
    });

    const rejectForm = $(".reject-form", node);
    rejectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = rejectForm.elements.note.value.trim();
      if (!note) return toast("写一句哪里有问题", "bad");
      try {
        const result = await post("/approve/feedback", { job: detail.slug, revision: final.revision, name: controls.name.value.trim(), note });
        toast(`已退回，记在 ${result.revision}/feedback-inbox.md`, "ok");
        rejectForm.elements.note.value = "";
      } catch (error) {
        toast(error.message, "bad");
      }
    });
    return node;
  }

  function renderCuts(detail) {
    const cuts = detail.cuts;
    const node = $("#tpl-cuts").content.firstElementChild.cloneNode(true);
    $(".count", node).textContent = `${cuts.cutCount} 个`;
    const strips = $(".strips", node);
    const video = $(".cut-video", node);
    if (cuts.video) { video.src = cuts.video; video.hidden = false; }
    for (const image of cuts.images) {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = image.url;
      img.loading = "lazy";
      img.alt = `切点 ${image.index}`;
      const caption = document.createElement("figcaption");
      caption.textContent = `#${image.index} · ${Number(image.time).toFixed(2)}s`;
      figure.append(img, caption);
      if (cuts.video) {
        figure.style.cursor = "pointer";
        figure.title = "点击跳到这个切点前 1.5 秒播放";
        figure.addEventListener("click", () => {
          video.currentTime = Math.max(0, Number(image.time) - 1.5);
          video.play().catch(() => {});
          video.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
      strips.append(figure);
    }
    if (cuts.blocker) { const b = $(".blocker", node); b.hidden = false; b.textContent = `现在还不能通过：${cuts.blocker}`; }
    if (!cuts.pending) $(".done", node).hidden = false;

    const form = $(".approve-form", node);
    const warnCheck = $(".warn-check", node);
    const needHeard = cuts.boundaryWarnings > 0;
    if (needHeard) {
      warnCheck.hidden = false;
      $("span", warnCheck).textContent = `有 ${cuts.boundaryWarnings} 个切点没有可靠气口，这些切点我在视频里听过了`;
    }
    const controls = wireForm(form, () => !cuts.blocker && cuts.pending && (!needHeard || form.elements.acousticReviewed.checked));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      controls.button.disabled = true;
      try {
        localStorage.setItem(NAME_KEY, controls.name.value.trim());
        const result = await post("/approve", { job: detail.slug, kind: "cuts", name: controls.name.value.trim(), fullPlayback: true, acousticReviewed: needHeard ? form.elements.acousticReviewed.checked : false });
        toast(`切点已通过，写入 ${result.file}`, "ok");
        setTimeout(() => location.replace("/approve"), 1200);
      } catch (error) {
        toast(error.message, "bad");
        controls.refresh();
      }
    });
    return node;
  }

  function renderDetail(detail) {
    $("#back").hidden = false;
    $("#title").textContent = detail.title;
    $("#subtitle").textContent = detail.slug;
    main.replaceChildren();
    // 先切点后终审：切点没过，终审本来就起不来
    if (detail.cuts) main.append(renderCuts(detail));
    if (detail.final) main.append(renderFinal(detail));
    if (!detail.cuts && !detail.final) {
      const p = document.createElement("p");
      p.className = "dim";
      p.textContent = "这条片还没有可审的东西（没有切点报告，也没有审片视频）。";
      main.append(p);
    }
  }

  (async () => {
    try {
      if (job) renderDetail(await api(`/api/approve?job=${encodeURIComponent(job)}`));
      else renderList((await api("/api/approve")).pending);
    } catch (error) {
      main.replaceChildren();
      const p = document.createElement("p");
      p.className = "notice bad";
      p.textContent = error.message;
      main.append(p);
    }
  })();
})();
