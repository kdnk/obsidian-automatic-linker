# HTML タイトルから安全な Markdown リンクを生成する設計

## 背景

Web ページの `<title>` には、改行、連続空白、HTML エンティティが含まれる場合がある。
現在の `getTitleFromHtml` はタイトルの両端だけを `trim()` するため、内部の改行が Markdown リンク名へ残り、生成結果が複数行になる。

対象ページでは、次の内容が `<title>` に含まれていた。

```html
\n
      モンステラ L Clear Pot（Simple Green L）｜土を使わない観葉植物\n
 &ndash; &amp;Green
```

## 期待する結果

同じページから次の一行の Markdown リンクを生成する。

```markdown
[モンステラ L Clear Pot（Simple Green L）｜土を使わない観葉植物 – &Green](https://andgreen.direct.suntory.co.jp/products/spl00001-clr)
```

デスクトップ版と Android 版の Obsidian で同じ文字列を生成する。

## 変換処理

タイトルの抽出後、次の順序で文字列を正規化する。

1. `entities` パッケージの `decodeHTML` で名前付き文字参照と数値文字参照をデコードする。
2. 空白として扱われない C0 制御文字と DEL を除去する。
3. 改行とタブを含む連続空白を、半角スペース一つへ置換する。
4. 文字列の両端に残る空白を除去する。
5. Unicode を NFC へ正規化する。

`entities` は DOM API や Node.js API に依存しない JavaScript 実装としてバンドルする。
このため、Android の WebView を含む Obsidian の対応環境で同じデコード処理を実行できる。

## Markdown リンク名の保護

HTML タイトルの正規化と Markdown 構文の保護は別の処理とする。
`replaceUrlWithTitle` はリンクを組み立てる直前に、リンク名に含まれるバックスラッシュ、`[`、`]` をバックスラッシュでエスケープする。

この保護は HTML から取得したタイトルだけに依存しない。
呼び出し元が `urlTitleMap` へ直接渡したタイトルにも適用する。

デコード後の en dash（U+2013）、ampersand（U+0026）、日本語文字は Markdown リンク名で有効な文字なので変更しない。

## エラー処理

`<title>` が存在しない場合と、正規化後のタイトルが空文字列になる場合は、従来どおり空文字列を返す。
デコードできない文字参照は `entities` の既定動作に従い、入力中のテキストとして保持する。

## テスト

次の回帰テストを追加する。

- 実例と同じ改行、空白、`&ndash;`、`&amp;` を含む HTML から一行のタイトルを返す。
- 名前付き文字参照と数値文字参照をデコードする。
- 改行、タブ、連続空白、制御文字を正規化する。
- 結合文字を NFC へ正規化する。
- `\`、`[`、`]` を含むタイトルから壊れない Markdown リンクを生成する。
- 既存の URL 置換とタイトル抽出のテストがすべて通る。

## 対象外

URL 自体の Markdown エスケープ方法は変更しない。
HTML の `<title>` 抽出方式も今回の不具合に必要な範囲を超えるため変更しない。
