# Safe HTML Title Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HTML タイトルを一行の安全な Markdown リンク名へ変換し、デスクトップ版と Android 版の Obsidian で同じ結果を生成する。

**Architecture:** HTML 由来の文字列正規化は `getTitleFromHtml` に閉じ込め、HTML エンティティのデコード、制御文字除去、空白圧縮、NFC 正規化を行う。Markdown 構文の保護は `replaceUrlWithTitle` でリンクを組み立てる直前に行い、HTML 以外から渡されたタイトルにも適用する。

**Tech Stack:** TypeScript、Vitest、pnpm、`entities`、GitButler CLI

## Global Constraints

- デスクトップ版と Android 版の Obsidian で同じ文字列を生成する。
- HTML エンティティのデコードに DOM API と Node.js API を使用しない。
- デコード後の en dash（U+2013）、ampersand（U+0026）、日本語文字は変更しない。
- URL 自体の Markdown エスケープ方法と `<title>` の抽出方式は変更しない。
- バージョン管理の書き込みには `but` を使用する。
- コミットは英語の Conventional Commits とし、Why と What を記載する。

---

## File Structure

- `package.json`：実行時に利用する `entities` 依存関係を宣言する。
- `pnpm-lock.yaml`：`entities` の解決済みバージョンを固定する。
- `src/replace-url-with-title/utils/get-title-from-html.ts`：抽出した HTML タイトルをデコードして正規化する。
- `src/replace-url-with-title/utils/__tests__/get-title-from-html.test.ts`：HTML タイトルのデコードと正規化を検証する。
- `src/replace-url-with-title/index.ts`：Markdown リンク名の構文文字をエスケープする。
- `src/replace-url-with-title/__tests__/replace-url-with-title.test.ts`：特殊文字を含むタイトルから有効な Markdown リンクを生成できることを検証する。

### Task 1: HTML タイトルのデコードと正規化

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/replace-url-with-title/utils/get-title-from-html.ts`
- Test: `src/replace-url-with-title/utils/__tests__/get-title-from-html.test.ts`

**Interfaces:**

- Consumes: HTML 全文を受け取る既存の `getTitleFromHtml(html: string): string`。
- Produces: HTML エンティティをデコードし、制御文字を除去し、空白を圧縮し、NFC 正規化した一行のタイトルを返す同じシグネチャ。

- [ ] **Step 1: 実ページを再現する失敗テストを書く**

`src/replace-url-with-title/utils/__tests__/get-title-from-html.test.ts` に次のテストを追加する。

```typescript
it("should decode and normalize a multiline HTML title", () => {
    const html = `<html><head><title>
        モンステラ L Clear Pot（Simple Green L）｜土を使わない観葉植物
        &ndash; &amp;Green
    </title></head></html>`

    expect(getTitleFromHtml(html)).toBe(
        "モンステラ L Clear Pot（Simple Green L）｜土を使わない観葉植物 – &Green",
    )
})
```

- [ ] **Step 2: テストが期待した理由で失敗することを確認する**

Run:

```bash
pnpm test src/replace-url-with-title/utils/__tests__/get-title-from-html.test.ts
```

Expected: FAIL。実際の値には改行、連続空白、`&ndash;`、`&amp;` が残る。

- [ ] **Step 3: 数値文字参照、制御文字、NFC の失敗テストを追加する**

同じテストファイルへ次を追加する。

```typescript
it("should decode numeric entities and normalize unsafe characters", () => {
    const html = "<title>\u0000Cafe\u0301\t&#x2013;\n&#8212;\u007F</title>"

    expect(getTitleFromHtml(html)).toBe("Café – —")
})
```

- [ ] **Step 4: 追加テストも期待した理由で失敗することを確認する**

Run:

```bash
pnpm test src/replace-url-with-title/utils/__tests__/get-title-from-html.test.ts
```

Expected: FAIL。実際の値には数値文字参照、制御文字、分解された結合文字、空白文字が残る。

- [ ] **Step 5: `entities` を実行時依存へ追加する**

Run:

```bash
pnpm add entities
```

Expected: `package.json` の `dependencies` と `pnpm-lock.yaml` が更新される。

- [ ] **Step 6: 最小の正規化処理を実装する**

`src/replace-url-with-title/utils/get-title-from-html.ts` を次の形へ変更する。

```typescript
import { decodeHTML } from "entities"

const TITLE_REGEX = /<title[^>]*>([^<]+)<\/title>/i
const UNSAFE_CONTROL_CHARACTERS_REGEX = /[\u0000-\u0008\u000E-\u001F\u007F]/g

export const getTitleFromHtml = (html: string): string => {
    const match = html.match(TITLE_REGEX)

    if (match && match[1]) {
        return decodeHTML(match[1])
            .replace(UNSAFE_CONTROL_CHARACTERS_REGEX, "")
            .replace(/\s+/gu, " ")
            .trim()
            .normalize("NFC")
    }

    return ""
}
```

- [ ] **Step 7: 対象テストを通す**

Run:

```bash
pnpm test src/replace-url-with-title/utils/__tests__/get-title-from-html.test.ts
```

Expected: 既存テストを含めて PASS。

- [ ] **Step 8: Task 1 をコミットする**

Run:

```bash
but commit -b fix/safe-html-title-links \
  -m "fix: normalize decoded HTML titles" \
  -m "Why:
HTML titles can contain entities, embedded whitespace, control characters, and decomposed Unicode that produce inconsistent Markdown link labels.

What:
Decode HTML entities with a platform-independent library and normalize extracted titles into safe single-line NFC text."
```

Expected: テスト、実装、依存関係の変更を含むコミットが `fix/safe-html-title-links` の先頭へ作成される。

### Task 2: Markdown リンク名のエスケープ

**Files:**

- Modify: `src/replace-url-with-title/index.ts`
- Test: `src/replace-url-with-title/__tests__/replace-url-with-title.test.ts`

**Interfaces:**

- Consumes: 既存の `ReplaceUrlWithTitleOptions` に含まれる `Map<string, string>` のタイトル。
- Produces: バックスラッシュ、`[`、`]` をエスケープしたリンク名を含む `replaceUrlWithTitle(options): string` の返り値。

- [ ] **Step 1: Markdown 構文文字を再現する失敗テストを書く**

`src/replace-url-with-title/__tests__/replace-url-with-title.test.ts` に次を追加する。

```typescript
it("should escape Markdown syntax characters in titles", () => {
    const result = replaceUrlWithTitle({
        body: "https://example.com",
        urlTitleMap: new Map([
            ["https://example.com", String.raw`Docs [Android] \ Guide`],
        ]),
    })

    expect(result).toBe(
        String.raw`[Docs \[Android\] \\ Guide](https://example.com)`,
    )
})
```

- [ ] **Step 2: テストが期待した理由で失敗することを確認する**

Run:

```bash
pnpm test src/replace-url-with-title/__tests__/replace-url-with-title.test.ts
```

Expected: FAIL。実際のリンク名では `[`、`]`、バックスラッシュが未エスケープになる。

- [ ] **Step 3: 最小の Markdown エスケープ処理を実装する**

`src/replace-url-with-title/index.ts` の型定義付近へ次の関数を追加する。

```typescript
const escapeMarkdownLinkTitle = (title: string): string =>
    title.replace(/[\\[\]]/g, "\\$&")
```

リンク生成を次の形へ変更する。

```typescript
const markdownLink = `[${escapeMarkdownLinkTitle(title)}](${url})`
```

- [ ] **Step 4: 対象テストを通す**

Run:

```bash
pnpm test src/replace-url-with-title/__tests__/replace-url-with-title.test.ts
```

Expected: 既存テストを含めて PASS。

- [ ] **Step 5: 全体検証を実行する**

Run:

```bash
pnpm test
pnpm tsc
pnpm lint
pnpm build
```

Expected: すべて終了コード 0。テスト失敗、型エラー、lint エラー、build エラーがない。

- [ ] **Step 6: Task 2 をコミットする**

Run:

```bash
but commit -b fix/safe-html-title-links \
  -m "fix: escape generated Markdown link titles" \
  -m "Why:
Decoded page titles can contain brackets and backslashes that terminate or alter Markdown link labels.

What:
Escape Markdown link-label syntax characters before composing generated links and cover the behavior with a regression test."
```

Expected: Markdown エスケープと回帰テストを含むコミットが `fix/safe-html-title-links` の先頭へ作成される。
