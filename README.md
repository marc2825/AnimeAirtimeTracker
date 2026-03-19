# 深夜アニメ放送枠観測所

深夜アニメの「作品」ではなく、「いつ・どこで・どの放送枠に置かれたか」を中心に観測するための Web アプリです。
MVP ではまずダミーデータで UI と集計の土台を完成させ、後から PostgreSQL / Prisma の実データ接続へ広げられる構成にしています。

## 技術スタック

- Next.js App Router
- TypeScript strict
- Prisma
- PostgreSQL 向けスキーマ
- Vitest

## 現在の実装範囲

- 検索一覧ページ
  - URL クエリで条件保持
  - 年、クール、曜日、時刻帯、地域、局、放送枠、ジャンル、制作会社で絞り込み
- 作品詳細ページ
  - 基本情報
  - 放送履歴
  - 続編関係
  - 類似枠作品
- 放送枠詳細ページ
  - 枠情報
  - 所属作品一覧
  - 年次推移表
  - 時間変動履歴
  - 他枠との被り傾向
- 統計ダッシュボード
  - 曜日 × 時刻ヒートマップ
  - 放送枠集計表
  - 地域別サマリー表
- Prisma 初版スキーマ
  - `Title`, `Airing`, `Channel`, `Region`, `Slot`, `Company`, `Person`, `TitleStaff`, `TitleCompany`, `SequelRelation`, `SourceRecord`
- ダミーデータ
  - リポジトリ内 TypeScript データで UI を即時起動可能
  - `prisma/seed.ts` で PostgreSQL へ投入できる形も用意

## ディレクトリ構成

```text
app/                  画面ルート
src/
  components/         再利用 UI
  data/               ダミーデータ
  lib/                集計・整形ロジック
prisma/
  schema.prisma       PostgreSQL 向け初版スキーマ
  seed.ts             ダミーデータ投入スクリプト
docs/
  requirements.md     要件定義
  screens.md          画面一覧
  data-model.md       データモデル案
```

## 起動方法

1. 依存関係をインストール

```bash
npm install
```

2. 開発サーバーを起動

```bash
npm run dev
```

3. ブラウザで以下を確認

- `/`
- `/search`
- `/stats`
- `/titles/moonlight-signal`
- `/slots/urban-monday`

## Prisma / DB メモ

- `prisma/schema.prisma` は PostgreSQL 前提です
- `.env` にはローカル PostgreSQL 向けのサンプル `DATABASE_URL` を置いています
- 現在の UI はダミーデータ直読みなので、PostgreSQL が未起動でも `npm run dev` と `npm run build` は可能です
- DB に投入したい場合は PostgreSQL を起動したうえで以下を実行します

```bash
npm run prisma:seed
```

## 検証コマンド

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

## 次の拡張候補

- 実 DB 読み込みへの切り替え
- 検索対象の拡張
- 放送局 / 地域詳細ページ
- 取得バッチ
