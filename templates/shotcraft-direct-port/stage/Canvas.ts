// ============================================================
// 画布尺寸（由 prepareInkPressWorkspace 按 plan.canvas 改写；默认横屏 1920×1080，竖屏 1080×1920）
// 所有模板用 CANVAS / PORTRAIT，不再写死 1920 / 1080（2026-09-07 studio-portrait）
// ============================================================
export const CANVAS = {w: 1920, h: 1080};
export const PORTRAIT = CANVAS.h > CANVAS.w;
// 竖屏取景参数（prepare 按 plan.canvas.focusScale / focusShift / splitShift 改写；不同片的人脸高度不同）
export const FOCUS = {scale: 1.1, shift: 270};
export const SPLIT_SHIFT = 300;
