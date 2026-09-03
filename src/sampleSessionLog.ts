import { createSessionRecord, type SessionRecord } from "./lib/log/session";

/** Epoch ms timestamp `minutes` ago, relative to now. */
function minutesAgo(minutes: number): number {
  return Date.now() - minutes * 60_000;
}

const DAY = 24 * 60;

/**
 * Sample session history shown in the browser demo (no Tauri) so the Log view isn't empty on
 * first load. Timestamps are relative to "now" so the demo always looks current rather than
 * stuck on a fixed past date. Mirrors the task lines in `sampleFiles.ts` — the elapsed totals
 * here match the `spent:` values already baked into those files' completed tasks.
 */
export const SAMPLE_SESSION_RECORDS: SessionRecord[] = [
  createSessionRecord({
    file: "work.md",
    startedAt: minutesAgo(35),
    presetMinutes: 30,
    elapsedSeconds: 30 * 60,
    lineText: "- [ ] Parser addition spent:1h10m",
  }),
  createSessionRecord({
    file: "work.md",
    startedAt: minutesAgo(75),
    presetMinutes: 60,
    elapsedSeconds: 40 * 60,
    lineText: "- [ ] Parser addition spent:40m",
  }),
  createSessionRecord({
    file: "work.md",
    startedAt: minutesAgo(DAY + 15),
    presetMinutes: 10,
    elapsedSeconds: 10 * 60,
    lineText: "- [ ] Throttle notify events",
  }),
  createSessionRecord({
    file: "work.md",
    startedAt: minutesAgo(DAY + 40),
    presetMinutes: 30,
    elapsedSeconds: 20 * 60,
    lineText: "- [x] Verify CodeMirror version spent:20m",
  }),
  createSessionRecord({
    file: "work.md",
    startedAt: minutesAgo(DAY + 70),
    presetMinutes: 10,
    elapsedSeconds: 10 * 60,
    lineText: "- [x] Initial pnpm workspace setup spent:10m",
  }),
  createSessionRecord({
    file: "monura.md",
    startedAt: minutesAgo(2 * DAY + 20),
    presetMinutes: 30,
    elapsedSeconds: 25 * 60,
    lineText: "- [ ] Session log JSONL rotation design",
  }),
  createSessionRecord({
    file: "inbox.md",
    startedAt: minutesAgo(3 * DAY + 50),
    presetMinutes: 10,
    elapsedSeconds: 8 * 60,
    lineText: "- [ ] Review Tauri fs permission settings",
  }),
];
