import { escapeHtml, fmtTime, seconds } from "./lib.mjs";

const HUD_KINDS = new Set(["hud-command", "hud-flow", "hud-zones", "hud-unlock"]);

export function isHudOverlay(overlay) {
  return HUD_KINDS.has(overlay?.visual?.kind);
}

export function renderHudOverlay(overlay, index) {
  const visual = overlay.visual || {};
  const kind = visual.kind || "hud-command";
  const tone = visual.tone || "green";
  const placement = visual.placement || "left";
  const start = seconds(overlay.start);
  const dur = seconds(overlay.duration || 5);

  return `<div id="overlay-${escapeHtml(overlay.id || index + 1)}" class="clip hud-guide motion-clip hud-${escapeHtml(kind)} hud-tone-${escapeHtml(tone)} hud-place-${escapeHtml(placement)}" data-start="${fmtTime(start)}" data-duration="${fmtTime(dur)}" data-track-index="${300 + index}">
          <div class="motion-body hud-body">
            ${renderHudSearch(overlay)}
            ${renderHudVisual(overlay)}
            <div class="hud-scan" data-layout-ignore></div>
          </div>
        </div>`;
}

export function renderHudCss() {
  return `
      .hud-guide {
        position: absolute;
        left: 58px;
        top: 96px;
        width: 690px;
        z-index: 7;
        color: #f7f9f0;
      }
      .hud-place-right {
        left: auto;
        right: 58px;
      }
      .hud-place-wide {
        left: 58px;
        right: 58px;
        width: auto;
      }
      .hud-place-lower {
        left: 58px;
        top: auto;
        bottom: 250px;
      }
      .hud-place-mid {
        left: 58px;
        top: 430px;
      }
      .hud-body {
        position: relative;
        overflow: hidden;
        border-radius: 8px;
        border: 1px solid rgba(245, 247, 239, 0.22);
        background:
          radial-gradient(circle at 18% 0%, rgba(46, 242, 162, 0.18), transparent 34%),
          linear-gradient(135deg, rgba(7, 17, 15, 0.82), rgba(7, 17, 15, 0.46));
        backdrop-filter: blur(6px);
        box-shadow: 0 24px 76px rgba(0, 0, 0, 0.34), 0 0 34px rgba(46, 242, 162, 0.12);
      }
      .hud-tone-blue .hud-body {
        background:
          radial-gradient(circle at 18% 0%, rgba(0, 177, 255, 0.22), transparent 34%),
          linear-gradient(135deg, rgba(7, 17, 15, 0.84), rgba(7, 17, 15, 0.48));
        box-shadow: 0 24px 76px rgba(0, 0, 0, 0.34), 0 0 34px rgba(0, 177, 255, 0.16);
      }
      .hud-tone-amber .hud-body {
        background:
          radial-gradient(circle at 18% 0%, rgba(255, 203, 92, 0.20), transparent 34%),
          linear-gradient(135deg, rgba(7, 17, 15, 0.84), rgba(7, 17, 15, 0.48));
        box-shadow: 0 24px 76px rgba(0, 0, 0, 0.34), 0 0 34px rgba(255, 203, 92, 0.14);
      }
      .hud-search {
        min-height: 58px;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 18px;
        border-bottom: 1px solid rgba(245, 247, 239, 0.16);
      }
      .hud-search-mark {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        border: 3px solid rgba(46, 242, 162, 0.9);
        box-shadow: 0 0 18px rgba(46, 242, 162, 0.38);
      }
      .hud-tone-blue .hud-search-mark {
        border-color: rgba(0, 177, 255, 0.9);
        box-shadow: 0 0 18px rgba(0, 177, 255, 0.38);
      }
      .hud-tone-amber .hud-search-mark {
        border-color: rgba(255, 203, 92, 0.9);
        box-shadow: 0 0 18px rgba(255, 203, 92, 0.32);
      }
      .hud-search-copy {
        min-width: 0;
      }
      .hud-search-label {
        color: #2ef2a2;
        font-size: 18px;
        line-height: 1;
        font-weight: 950;
      }
      .hud-tone-blue .hud-search-label {
        color: #00b1ff;
      }
      .hud-tone-amber .hud-search-label {
        color: #ffcb5c;
      }
      .hud-search-query {
        margin-top: 5px;
        color: #f7f9f0;
        font-size: 25px;
        line-height: 1.08;
        font-weight: 950;
        text-shadow: 0 4px 18px rgba(0, 0, 0, 0.58);
      }
      .hud-content {
        padding: 18px;
      }
      .hud-eyebrow {
        color: #b7c4b7;
        font-size: 18px;
        line-height: 1;
        font-weight: 900;
        margin-bottom: 8px;
      }
      .hud-title {
        color: #f7f9f0;
        font-size: 34px;
        line-height: 1.05;
        font-weight: 950;
        text-shadow: 0 4px 18px rgba(0, 0, 0, 0.58);
      }
      .hud-body-copy {
        margin-top: 8px;
        color: #e8eee4;
        font-size: 21px;
        line-height: 1.2;
        font-weight: 800;
      }
      .hud-card-grid {
        display: grid;
        gap: 12px;
        margin-top: 16px;
      }
      .hud-card-grid.is-zones {
        grid-template-columns: 1fr;
      }
      .hud-card,
      .hud-stage,
      .hud-output,
      .hud-rank {
        position: relative;
        min-height: 72px;
        padding: 13px 16px 13px 74px;
        border-radius: 8px;
        border: 1px solid rgba(46, 242, 162, 0.28);
        background: rgba(7, 17, 15, 0.50);
        box-shadow: inset 0 0 24px rgba(46, 242, 162, 0.07);
      }
      .hud-tone-blue .hud-card,
      .hud-tone-blue .hud-stage,
      .hud-tone-blue .hud-output,
      .hud-tone-blue .hud-rank {
        border-color: rgba(0, 177, 255, 0.32);
        box-shadow: inset 0 0 24px rgba(0, 177, 255, 0.08);
      }
      .hud-tone-amber .hud-card,
      .hud-tone-amber .hud-stage,
      .hud-tone-amber .hud-output,
      .hud-tone-amber .hud-rank {
        border-color: rgba(255, 203, 92, 0.32);
        box-shadow: inset 0 0 24px rgba(255, 203, 92, 0.08);
      }
      .hud-icon {
        position: absolute;
        left: 15px;
        top: 15px;
        width: 42px;
        height: 42px;
        border-radius: 8px;
        border: 2px solid currentColor;
        color: #2ef2a2;
        box-shadow: 0 0 18px rgba(46, 242, 162, 0.24);
      }
      .hud-tone-blue .hud-icon {
        color: #00b1ff;
        box-shadow: 0 0 18px rgba(0, 177, 255, 0.24);
      }
      .hud-tone-amber .hud-icon {
        color: #ffcb5c;
        box-shadow: 0 0 18px rgba(255, 203, 92, 0.22);
      }
      .hud-card-label,
      .hud-stage-label,
      .hud-rank-label {
        color: #2ef2a2;
        font-size: 17px;
        line-height: 1;
        font-weight: 950;
        margin-bottom: 6px;
      }
      .hud-tone-blue .hud-card-label,
      .hud-tone-blue .hud-stage-label,
      .hud-tone-blue .hud-rank-label {
        color: #00b1ff;
      }
      .hud-tone-amber .hud-card-label,
      .hud-tone-amber .hud-stage-label,
      .hud-tone-amber .hud-rank-label {
        color: #ffcb5c;
      }
      .hud-card-title,
      .hud-stage-title,
      .hud-rank-title {
        color: #f7f9f0;
        font-size: 25px;
        line-height: 1.05;
        font-weight: 950;
      }
      .hud-flow-chain {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      .hud-stage {
        min-height: 118px;
        padding: 14px;
      }
      .hud-stage .hud-icon {
        position: static;
        margin-bottom: 12px;
      }
      .hud-flow-outputs {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }
      .hud-output {
        min-height: 46px;
        padding: 10px 14px;
        color: #f7f9f0;
        font-size: 21px;
        line-height: 1;
        font-weight: 950;
      }
      .hud-ranks {
        display: grid;
        gap: 10px;
        margin-top: 16px;
      }
      .hud-rank {
        min-height: 62px;
        display: grid;
        grid-template-columns: 112px 1fr;
        align-items: center;
        gap: 14px;
        padding: 12px 16px;
      }
      .hud-rank-value {
        color: #2ef2a2;
        font-size: 38px;
        line-height: 1;
        font-weight: 950;
        font-variant-numeric: tabular-nums;
      }
      .hud-rank.is-dim .hud-rank-value {
        color: rgba(245, 247, 239, 0.48);
      }
      .hud-scan {
        position: absolute;
        left: 0;
        right: 0;
        top: -16px;
        height: 16px;
        pointer-events: none;
        background: linear-gradient(180deg, transparent, rgba(46, 242, 162, 0.32), transparent);
        opacity: 0;
      }
      .hud-tone-blue .hud-scan {
        background: linear-gradient(180deg, transparent, rgba(0, 177, 255, 0.32), transparent);
      }
      .hud-tone-amber .hud-scan {
        background: linear-gradient(180deg, transparent, rgba(255, 203, 92, 0.28), transparent);
      }
      #main.layout-horizontal .hud-guide {
        left: 790px;
        top: 150px;
        width: 720px;
      }
      #main.layout-horizontal .hud-place-wide {
        left: 790px;
        right: 110px;
        width: auto;
      }
      #main.layout-horizontal .hud-place-lower {
        left: 790px;
        top: auto;
        bottom: 150px;
      }
`;
}

export function renderMotionScript() {
  return `<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      function createStaticTimeline() {
        return {
          seek() { return this; },
          pause() { return this; },
          play() { return this; },
          progress() { return 0; },
          duration() { return 0; },
          totalDuration() { return 0; },
          time() { return 0; },
          totalTime() { return this; },
          kill() {}
        };
      }
      if (!window.gsap) {
        window.__timelines["main"] = createStaticTimeline();
      } else {
      const tl = gsap.timeline({ paused: true });
      document.querySelectorAll(".clip").forEach((clip) => {
        const start = Number(clip.dataset.start || 0);
        const dur = Number(clip.dataset.duration || 0);
        if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return;
        if (clip.classList.contains("aroll-bg")) return;
        tl.set(clip, { autoAlpha: 0 }, 0);
        tl.set(clip, { autoAlpha: 1 }, start);
        tl.set(clip, { autoAlpha: 0 }, start + dur);
      });
      document.querySelectorAll(".motion-clip").forEach((clip) => {
        const start = Number(clip.dataset.start || 0);
        const dur = Number(clip.dataset.duration || 0);
        const body = clip.querySelector(".motion-body");
        const cards = clip.querySelectorAll(".hud-card, .hud-stage, .hud-output, .hud-rank");
        const scan = clip.querySelector(".hud-scan");
        if (!body || !dur) return;
        tl.from(body, { x: -38, scale: 0.985, opacity: 0, duration: 0.46, ease: "expo.out" }, start + 0.16);
        if (cards.length) {
          tl.from(cards, { x: -24, scale: 0.96, opacity: 0, duration: 0.34, stagger: { each: 0.08, from: "start" }, ease: "back.out(1.45)" }, start + 0.34);
        }
        if (scan) {
          const repeat = Math.max(0, Math.ceil(Math.max(0, dur - 0.8) / 0.9) - 1);
          tl.fromTo(scan, { y: -18, opacity: 0.08 }, { y: 520, opacity: 0.48, duration: 0.78, repeat, yoyo: true, ease: "sine.inOut" }, start + 0.28);
        }
        tl.to(body, { x: 26, scale: 0.99, opacity: 0, duration: 0.26, ease: "power3.in" }, start + Math.max(0.2, dur - 0.32));
      });
      document.querySelectorAll(".demo-panel.is-video-demo").forEach((panel) => {
        const start = Number(panel.dataset.start || 0);
        const dur = Number(panel.dataset.duration || 0);
        const demoId = panel.dataset.demoId;
        const mask = document.querySelector('.demo-mask[data-demo-id="' + demoId + '"]');
        const video = document.querySelector('.demo-media-video[data-demo-id="' + demoId + '"]');
        if (!dur || !demoId) return;
        if (mask) {
          tl.from(mask, { opacity: 0, duration: 0.34, ease: "sine.out" }, start + 0.04);
        }
        tl.from(panel, { y: 34, scale: 0.985, opacity: 0, duration: 0.48, ease: "expo.out" }, start + 0.12);
        if (video) {
          tl.from(video, { y: 34, scale: 0.985, opacity: 0, duration: 0.52, ease: "power3.out" }, start + 0.16);
          tl.to(video, { y: -20, opacity: 0, duration: 0.24, ease: "power3.in" }, start + Math.max(0.4, dur - 0.28));
        }
        tl.to(panel, { y: -18, opacity: 0, duration: 0.24, ease: "power3.in" }, start + Math.max(0.4, dur - 0.26));
        if (mask) {
          tl.to(mask, { opacity: 0, duration: 0.28, ease: "sine.in" }, start + Math.max(0.4, dur - 0.24));
        }
      });
      window.__timelines["main"] = tl;
      }
    </script>`;
}

function renderHudSearch(overlay) {
  const visual = overlay.visual || {};
  return `<div class="hud-search">
              <div class="hud-search-mark"></div>
              <div class="hud-search-copy">
                <div class="hud-search-label">${escapeHtml(visual.searchLabel || overlay.kicker || "搜索")}</div>
                <div class="hud-search-query">${escapeHtml(visual.search || overlay.title || "")}</div>
              </div>
            </div>`;
}

function renderHudVisual(overlay) {
  const visual = overlay.visual || {};
  const kind = visual.kind || "hud-command";
  if (kind === "hud-flow") return renderHudFlow(overlay);
  if (kind === "hud-zones") return renderHudZones(overlay);
  if (kind === "hud-unlock") return renderHudUnlock(overlay);
  return renderHudCommand(overlay);
}

function renderHudCommand(overlay) {
  const visual = overlay.visual || {};
  return `<div class="hud-content">
            <div class="hud-eyebrow">${escapeHtml(overlay.kicker || "任务")}</div>
            <div class="hud-title">${escapeHtml(overlay.title || "")}</div>
            ${overlay.body ? `<div class="hud-body-copy">${escapeHtml(overlay.body)}</div>` : ""}
            <div class="hud-card-grid">${(visual.cards || [])
              .map((card) => renderHudCard(card))
              .join("")}</div>
          </div>`;
}

function renderHudZones(overlay) {
  const visual = overlay.visual || {};
  return `<div class="hud-content">
            <div class="hud-eyebrow">${escapeHtml(overlay.kicker || "界面拆解")}</div>
            <div class="hud-title">${escapeHtml(overlay.title || "")}</div>
            <div class="hud-card-grid is-zones">${(visual.zones || [])
              .map((card) => renderHudCard(card))
              .join("")}</div>
          </div>`;
}

function renderHudFlow(overlay) {
  const visual = overlay.visual || {};
  return `<div class="hud-content">
            <div class="hud-eyebrow">${escapeHtml(overlay.kicker || "流程")}</div>
            <div class="hud-title">${escapeHtml(overlay.title || "")}</div>
            ${overlay.body ? `<div class="hud-body-copy">${escapeHtml(overlay.body)}</div>` : ""}
            <div class="hud-flow-chain">${(visual.stages || [])
              .map((stage) => `<div class="hud-stage">
                  <div class="hud-icon"></div>
                  <div class="hud-stage-label">${escapeHtml(stage.label || "")}</div>
                  <div class="hud-stage-title">${escapeHtml(stage.title || "")}</div>
                </div>`)
              .join("")}</div>
            <div class="hud-flow-outputs">${(visual.outputs || [])
              .map((item) => `<div class="hud-output">${escapeHtml(item)}</div>`)
              .join("")}</div>
          </div>`;
}

function renderHudUnlock(overlay) {
  const visual = overlay.visual || {};
  return `<div class="hud-content">
            <div class="hud-eyebrow">${escapeHtml(overlay.kicker || "段位")}</div>
            <div class="hud-title">${escapeHtml(overlay.title || "")}</div>
            <div class="hud-ranks">${(visual.ranks || [])
              .map((rank) => `<div class="hud-rank${rank.dim ? " is-dim" : ""}">
                  <div class="hud-rank-value">${escapeHtml(rank.value || "")}</div>
                  <div>
                    <div class="hud-rank-label">${escapeHtml(rank.label || "")}</div>
                    <div class="hud-rank-title">${escapeHtml(rank.title || "")}</div>
                  </div>
                </div>`)
              .join("")}</div>
          </div>`;
}

function renderHudCard(card = {}) {
  return `<div class="hud-card">
            <div class="hud-icon"></div>
            <div class="hud-card-label">${escapeHtml(card.label || "")}</div>
            <div class="hud-card-title">${escapeHtml(card.title || "")}</div>
          </div>`;
}
