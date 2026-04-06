# プラン: Gemma 4 による「あいまいさ解消（Disambiguation）」機能の実装 (2-Pass 方式)

このプランは、Obsidian Automatic Linker において、Gemma 4 (Local LLM / LM Studio) を用いて文脈に最適なリンク先を選択、および既存の誤ったリンクを修正する機能を導入するものです。

## 1. 現状の分析と課題
- **データ構造の制限**: `src/trie.ts` の `CandidateData` インターフェースが単一の `canonical` パスしか保持できない。
- **重複登録の挙動**: `buildCandidateTrie` 関数において、同じ名前の単語やエイリアスが見つかった場合、最初に見つかったものが優先されるか、後から来たもので上書きされている。
- **既存リンクの誤り**: 機械的な処理や手動で作成された不適切な `[[Note]]` リンクの存在。
- **パフォーマンス**: AI 処理は低速なため、コマンドによる明示的な実行と、進捗バー付きの UI フィードバックが必要。

## 2. 実装フェーズ

### フェーズ 1: データ構造の拡張 (Data Structure)
- [x] `CandidateData` インターフェースの修正 (`src/trie.ts`)
  - `canonical`, `scoped`, `namespace` を持つオブジェクトの配列を保持できるように変更。
- [x] `buildCandidateTrie` の修正
  - 重複する名前やエイリアスがある場合、既存の候補リストに `push` するように変更。
- [x] **完了条件**:
  - `src/trie.ts` の既存テストおよび新規追加テスト（複数候補の保持）がパスすること。
  - `pnpm lint` および `pnpm tsc` (タイプチェック) でエラーがないこと。

### フェーズ 2: AI 連携クライアントと「解決ロジック」の実装 (AI Integration)
- [x] `src/utils/ai-client.ts` の新規作成
  - OpenAI 互換 API へのリクエスト処理とプロンプト設計。
- [x] 非同期スキャン関数 `resolveAmbiguities` の実装
  - 1. 新規リンク候補（複数候補あり）の特定。
  - 2. 既存リンクの再検証（別のより良い候補がないか）の特定。
- [x] **完了条件**:
  - モックを使用した `resolveAmbiguities` のテストがパスすること。
  - `pnpm lint` および `pnpm tsc` でエラーがないこと。

### フェーズ 3: リンク置換エンジンの拡張 (Sync Logic Enhancement)
- [x] `src/replace-links/replace-links.ts` の `replaceLinks` 引数の拡張
  - `resolvedAmbiguities?: Map<string, string>` を受け取り、優先的に適用する。
- [x] 既存リンクの「張り替え」ロジックの追加。
- [x] **完了条件**:
  - `replace-links.test.ts` に AI 解決マップを使用したテストケースを追加し、パスすること。
  - `pnpm lint` および `pnpm tsc` でエラーがないこと。

### フェーズ 4: UI 実装とコマンドの追加 (UI & Integration)
- [x] `Automatic Linker: Run AI Link Enhancer` コマンドの実装。
- [x] 進捗バー付き `Notice` による UI フィードバックの実装。
- [x] `src/settings/settings.ts` への AI 設定追加。
- [x] **完了条件**:
  - Obsidian 上での実機動作確認（Notice の表示、リンクの修正・生成）。
  - 全体のビルド (`pnpm build`) が成功すること。

## 3. 共通の品質基準 (Definition of Done)
- 各フェーズの最後には必ず以下のコマンドを実行し、エラーがないことを確認する。
  1. `pnpm test` (または `vitest`)
  2. `pnpm lint`
  3. `pnpm tsc`

## 4. リスクと対策
- **エディタの不整合**: AI 処理開始時のテキストのスナップショットを保持し、置換時に大幅な変更があれば警告を出す。
- **トークン制限**: 段落単位での分割処理により、長いノートにも対応。
