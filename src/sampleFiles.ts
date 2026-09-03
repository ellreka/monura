export interface SampleFile {
  name: string;
  content: string;
}

const WORK_MD = `## 2026-08-13

- [ ] Parser addition spent:1h10m
  - [ ] Non-line-end spent: spent:45m
  - [ ] Invalid time notation
Insert and handle it if a review comes back first thing in the morning.

- [ ] Recalculate decorations
- [ ] Throttle notify events
- [x] Verify CodeMirror version spent:20m
- [x] Initial pnpm workspace setup spent:10m

## Later
- [ ] Line wrapping when opened in Vim

Don't break the grep-able state.
`;

const MONURA_MD = `## Design notes

- [ ] Make the timer icon dock-resident
  - [ ] Tray icon click event
  - [ ] Notification permission request timing
- [ ] Session log JSONL rotation design

Write down ideas here. They don't have to be tasks yet.
`;

const INBOX_MD = `A place to write down anything that comes to mind.

- [ ] Review Tauri fs permission settings
- [ ] Consider a bulk-hide animation for completed tasks
`;

export const SAMPLE_FILES: SampleFile[] = [
  { name: "work.md", content: WORK_MD },
  { name: "monura.md", content: MONURA_MD },
  { name: "inbox.md", content: INBOX_MD },
];
