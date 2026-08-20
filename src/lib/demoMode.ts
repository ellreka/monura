/**
 * True only for the standalone browser build embedded on the marketing site
 * (`build:demo`, Vite mode "demo") — not for ordinary `pnpm dev` / `vite build`
 * without Tauri. Scoped separately from `isTauri()` so normal browser-based
 * development still exercises every feature; only the public-facing demo
 * disables interactions that are confusing or disruptive for anonymous
 * visitors (e.g. global keyboard-shortcut capture stealing the next keypress).
 */
export const isDemoMode = import.meta.env.MODE === "demo";
