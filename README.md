# Monura

Monuraは、Markdownをそのまま作業空間として使うローカルファーストのタスク管理デスクトップアプリです。チェックリスト行にタイマーで計測した実績時間を追記し、作業履歴をセッションログで振り返れます。

```markdown
- [ ] APIのエラーハンドリングを直す +backend spent:25m
```

## 特徴

- `.md` ファイルを直接編集し、独自のタスクDBや不可視IDを持たない
- インデントされたチェックリストを親子タスクとして表示・集計する
- プリセットタイマー、Vimキーバインド、キーボードショートカットに対応する
- 外部エディタによる変更をファイルウォッチで反映する
- 月別・日別・プロジェクト別にセッションログを振り返る
- Tauriのシステムトレイとネイティブ通知でバックグラウンド計測を支える
- 起動時に署名済みアップデートを確認し、Settingsからインストールできる

## データの保存先

- Markdownファイル: ユーザーが選択したフォルダ。現在の作業状態の唯一のマスターデータ
- セッションログ: Tauriのアプリデータディレクトリに月次JSONLとして追記
- アプリ設定: Tauriのアプリデータディレクトリに保存

MarkdownファイルはMonura以外のエディタでも自由に編集できます。セッションログや設定がなくても、Markdownファイル自体の意味は失われません。

詳細な設計方針は [CLAUDE.md](./CLAUDE.md) を参照してください。

## 配布状況

初回公開リリースの準備中です。現時点ではソースから起動・ビルドしてください。

### 自動更新用の署名

Releaseワークフローは、macOSとWindowsの両方が成功した後に署名済みUpdater成果物と`latest.json`を同じDraft GitHub Releaseへ添付します。

Updater署名用のGitHub Actions Secrets:

- `TAURI_UPDATER_PUBLIC_KEY`: Tauri signerが生成した公開鍵
- `TAURI_SIGNING_PRIVATE_KEY`: 対応する秘密鍵の内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: 秘密鍵のパスワード

鍵は `pnpm tauri signer generate -- -w ~/.tauri/monura.key` で生成できます。秘密鍵を失うと、既存ユーザーへ同じ更新経路で新しいバージョンを配布できません。リポジトリには保存せず、安全な保管先にもバックアップしてください。

プラットフォーム署名・公証用のGitHub Actions Secrets:

- macOS: `APPLE_CERTIFICATE`（Developer ID Application証明書のBase64 P12）、`APPLE_CERTIFICATE_PASSWORD`、`KEYCHAIN_PASSWORD`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`
- Windows: `WINDOWS_CERTIFICATE`（コード署名証明書のBase64 PFX）、`WINDOWS_CERTIFICATE_PASSWORD`

WindowsのRFC 3161タイムスタンプURLはRepository Variable `WINDOWS_TIMESTAMP_URL`にHTTPS URLとして設定します。

リリース時は`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`のバージョンを一致させ、そのバージョンの`v`付きタグをpushします。両OSのビルド後に作成されるDraft ReleaseでDMG、NSIS、Updater成果物、署名、`latest.json`を確認してから手動公開します。公開するまで自動更新には配信されません。

## 開発

```bash
pnpm install
pnpm tauri dev       # デスクトップアプリを開発起動
pnpm tauri build     # デスクトップアプリをビルド
pnpm test            # Vitest
pnpm lint            # ESLint
pnpm --dir site build # 紹介サイトとブラウザデモをビルド
```

推奨環境: [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
