export interface SampleFile {
  name: string;
  content: string;
}

const WORK_MD = `## 2026-08-13

- [ ] パーサーの加算 +monura spent:1h10m
  - [ ] 行末以外の  spent: spent:45m
  - [ ] 不正な時間表記
朝イチでレビューが返ってきたら
差し込みで対応する。

- [ ] decoration の再計算 +monura
- [ ] notify のイベント間引き +monura
- [x] CodeMirrorのバージョン確認 +monura spent:20m
- [x] pnpmワークスペースの初期設定 spent:10m

## あとで
- [ ] Vim で開いた時の折返し

grep できる状態を壊さない。
`;

const MONURA_MD = `## 設計メモ

- [ ] タイマーのアイコンをドック常駐に対応させる +monura
  - [ ] トレイアイコンのクリックイベント
  - [ ] 通知権限のリクエストタイミング
- [ ] セッションログのJSONLローテーション設計 +monura

思いついたことはここに書く。まだタスクじゃなくていい。
`;

const INBOX_MD = `思いついたことを何でも書く場所。

- [ ] Tauriのfs権限設定を見直す
- [ ] 完了タスクの一括非表示アニメーションを検討
`;

export const SAMPLE_FILES: SampleFile[] = [
  { name: "work.md", content: WORK_MD },
  { name: "monura.md", content: MONURA_MD },
  { name: "inbox.md", content: INBOX_MD },
];
