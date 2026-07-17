# 設定項目グルーピング設計

## 背景

設定画面には見出しがあるものの、`Formatting` に12項目が集中し、URL関連の設定はサービスごとの小さな見出しに分かれている。

README の Configuration には別の分類があり、`Ignore headings`、`Ignore Markdown tables`、`Match sentence case` の3項目が掲載されていない。
この状態では、利用者が同じ設定を画面と README で異なる場所から探すことになる。

## 目的

設定を利用目的に基づく6グループへ再編し、設定画面と README で見出し、所属項目、表示順を一致させる。

## 対象範囲

- `SETTINGS_CATALOG` のグループ名と項目順を変更する。
- README の Configuration を同じグループ構成へ変更する。
- README に未掲載の3項目を追加する。
- グループ構成と連続性をテストで固定する。

## 対象外

- 各設定項目のキー、表示名、説明文、既定値は変更しない。
- 設定値の保存形式や読み込み処理は変更しない。
- 設定の実行時動作は変更しない。
- 折りたたみ、タブ、入れ子の見出し、独自 CSS は追加しない。
- 設定間の依存関係に応じた表示切り替えは追加しない。

## グループ構成

設定画面と README は、次の順序と所属を共有する。

| グループ | 設定項目 |
|---|---|
| **Formatting Workflow** | Format on save、Format delay (ms)、Run Prettier after formatting、Run Obsidian Linter after formatting |
| **Link Behavior** | Respect 'Folder to create new notes in' setting、Proximity-based linking、Include aliases、Remove aliases in directories、Ignore case、Match sentence case |
| **Exclusions** | Prevent self-linking、Ignore date formats、Ignore headings、Ignore Markdown tables、Exclude directories from automatic linking |
| **URL Formatting** | Format GitHub URLs on save、GitHub Enterprise URLs、Format JIRA URLs on save、JIRA URLs、Format Linear URLs on save、Replace URL with title、Ignore domains |
| **AI Link Enhancement (Beta)** | Enable AI Link Enhancement、AI API Endpoint、AI Model、Max Context Length |
| **Diagnostics** | Show load notice、Debug mode |

`Formatting Workflow` は、整形の起動から後続プラグインの実行までを一つの流れとして扱う。
`Format delay (ms)` は保存時の整形開始と Prettier、Obsidian Linter の実行前に使われるため、このグループに置く。

`Link Behavior` は、候補の照合、名前空間の解決、生成する Wiki リンクの表現を扱う。
`Remove aliases in directories` はリンク対象を除外せず、生成結果の表現を変えるため、このグループに置く。

`Exclusions` は、リンクを生成しない対象を集める。
`Prevent self-linking` も現在のファイルを候補から除く規則なので、このグループに置く。

`URL Formatting` は、サービス固有の URL 整形と汎用的なタイトル置換をまとめる。
サービス固有の設定を先に置き、汎用的な `Replace URL with title` と `Ignore domains` をその後に置く。

## 設定画面

設定画面は既存の `Setting.setHeading()` による見出し描画を維持する。
`SETTINGS_CATALOG` では同じグループの項目を一つの連続したブロックに並べ、グループが再登場する構造を許さない。

グループを変えても各項目が参照する設定キーは変わらない。
入力値は従来どおり保存され、インデックス更新や URL タイトルマップ更新の条件も維持される。

## README

README の Configuration は設定画面と同じ6見出し、同じ順序へ変更する。
各見出しでは設定画面と同じ順序で項目を説明し、現在未掲載の次の3項目を `Link Behavior` または `Exclusions` に追加する。

- `Match sentence case` は `Link Behavior` に追加する。
- `Ignore headings` は `Exclusions` に追加する。
- `Ignore Markdown tables` は `Exclusions` に追加する。

`Frontmatter URL Title Opt-out` は保存設定ではなく、README 後半の Frontmatter Options にも記載されている。
Configuration から重複する説明を除き、Frontmatter Options の説明は維持する。

## データの流れ

1. `SETTINGS_CATALOG` が各設定のグループと表示順を定義する。
2. 設定タブがカタログを先頭から読み、グループの境界で見出しを描画する。
3. 各設定コントロールは従来と同じキーを通じて値を保存する。
4. README が同じ分類を利用者向けの説明として記録する。

## エラー処理

設定カタログの静的な表示メタデータと README だけを変更するため、新しい実行時エラーは発生しない。
既存の入力値検証、保存失敗時の挙動、インデックス更新処理は変更しない。

## テスト方針

既存の「すべての既定設定がカタログに一度ずつ存在する」テストを維持する。
そのうえで、次の内容を設定カタログのテストに追加する。

- 6グループが設計どおりの順序で現れる。
- 各設定が設計どおりのグループに所属する。
- 各グループの項目が設計どおりの順序で並ぶ。
- 同じグループが離れた位置に再登場しない。

README は実行時データではないため、テストから解析しない。
実装レビューでは、設定カタログと README の見出し、所属項目、順序を差分上で照合する。

## 互換性

保存済み設定はキーと値をそのまま利用できる。
設定移行処理やバージョン判定は不要である。

## 完了条件

- 設定画面に6グループが設計どおりの順序で表示される。
- 28項目が欠落や重複なく設計どおりのグループに表示される。
- README の Configuration が同じグループ構成と項目順を持つ。
- README の Configuration が28個の保存設定だけを列挙する。
- README に未掲載だった3項目が追加される。
- 設定値と実行時動作が変更されない。
- 設定カタログのテスト、全テスト、型検査、lint が通る。
