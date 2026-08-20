# Monura

**Markdown + TODO + Timer**

Monuraは、Markdownでタスクを管理するシンプルなデスクトップアプリです。各タスクにかかった時間を計測し、1日の過ごし方を振り返れます。

自由で気負わないタスク管理を保ちながら、無理なく続けられる時間計測を目指しています。

![Markdownタスクとプリセットタイマーを表示するMonuraのブラウザデモ](./docs/image_01.png)

## 対応環境

現在のリリースワークフローが生成するバイナリは次の2種類です。

| OS      | アーキテクチャ             | 配布形式       |
| ------- | -------------------------- | -------------- |
| macOS   | Apple Silicon（`aarch64`） | DMG            |
| Windows | 64-bit（`x86_64`）         | NSIS installer |

Intel Mac、Windows on ARM、Linux向けの配布バイナリは現在生成していません。

## インストール

1. [GitHub Releases](https://github.com/ellreka/monura/releases)を開きます。
2. 使用するOSに合うファイルをダウンロードします。
   - macOS: `Monura_*_aarch64.dmg`
   - Windows: `Monura_*_x64-setup.exe`
3. macOSではDMGを開いてMonuraをApplicationsへ移動します。Windowsではinstallerを実行します。

### 初回起動時のOS警告

現在の配布物には、Apple Developer IDおよびWindows AuthenticodeによるOSコード署名を付けていません。そのため、初回起動時にOSの警告が表示されます。

#### macOS

1. ApplicationsのMonuraを一度起動し、警告を閉じます。
2. `システム設定` → `プライバシーとセキュリティ`を開きます。
3. Monuraの項目に表示される`このまま開く`を選びます。
4. 確認後、もう一度Monuraを起動します。

#### Windows

Microsoft Defender SmartScreenが表示された場合は、配布元とファイル名を確認したうえで`詳細情報` → `実行`を選びます。

## 基本的な使い方

1. 起動後、Markdownファイルを保存するフォルダを選びます。
2. 既存の`.md`ファイルを選択するか、新しいファイルを作成します。
3. Markdownのチェックリストとして作業項目を書きます。
4. 計測する行へカーソルを置き、時間プリセットを選んでタイマーを開始します。
5. タイマーを停止すると、その行へ実績時間が`spent:`として追記されます。

```markdown
- [ ] 親タスク +monura spent:20m
  - [ ] 子タスクA spent:15m
  - [x] 子タスクB spent:10m
```

- タスクとして認識するのは`- [ ]`または`- [x]`形式の行だけです。
- `+project`はセッションログのプロジェクト別集計に使います。
- 子タスクを含む集計時間は画面上だけで計算し、親行へは自動書き込みしません。
- プリセット時間、ショートカット、Vimモード、テーマ等はSettingsから変更できます。

## データの保存

| データ         | 保存先                          | 扱い                                |
| -------------- | ------------------------------- | ----------------------------------- |
| Markdown       | ユーザーが選択したフォルダ      | 現在の作業状態のマスターデータ      |
| セッションログ | Tauriのアプリデータディレクトリ | 月単位のJSONLへ追記                 |
| アプリ設定     | Tauriのアプリデータディレクトリ | 選択フォルダ、テーマ、Vimモードなど |

## 開発

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

## リリース

`v*.*.*`形式のGit tagをpushすると、`.github/workflows/release.yml`が起動します。

### 1. バージョンを更新する

次の3ファイルを同じSemantic Versionへ更新します。

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

### 2. tagをpushする

例として`0.0.2`をリリースする場合:

```bash
git tag v0.0.2
git push origin v0.0.2
```
