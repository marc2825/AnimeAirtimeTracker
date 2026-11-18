# 深夜アニメ放送枠観測所

> **状態 (2026-11-18): プロトタイプ / Private** — 現在の画面は架空のサンプルデータを表示し、データ収集はモックのみです。実放送データの定期取得・本番DB表示・認証付き管理画面は未実装です。ここに示したサンプルを実在の放送履歴として扱わないでください。
>
> **新しい開発方針**: [2026年の製品戦略](docs/strategy-2026.md) · [収集・データモデル](docs/data-and-ingestion-2026.md) · [公開ロードマップ](docs/release-plan-2026.md) · [運用指針](docs/operations.md)  
> 既存の [要件定義](docs/requirements.md) と [実装方針](docs/implementation-plan.md) は2026年3月時点の検討資料です。新規実装の優先順位は上記2026年文書を参照してください。


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
  - クール別本数推移
  - 局 × 時刻帯ヒートマップ
  - 被り分析
  - 尺区分分布
  - 地域差比較
- 管理画面 初版
  - 取得ジョブ一覧
  - エラー一覧
  - 放送枠マスタ編集のUI土台
  - 地域マスタ編集のUI土台
  - 手動補正一覧
- Prisma 初版スキーマ
  - `Title`, `Airing`, `Channel`, `Region`, `Slot`, `Company`, `Person`, `TitleStaff`, `TitleCompany`, `SequelRelation`, `SourceRecord`
- ダミーデータ
  - リポジトリ内 TypeScript データで UI を即時起動可能
  - `prisma/seed.ts` で PostgreSQL へ投入できる形も用意
- 取得レイヤー土台
  - `scripts/collector` に raw 保存、正規化、差分判定、ログ保存の流れを実装
  - 公式の非HTML出力を前提にした provider インターフェースを用意
  - mock fixture を使った冪等性テストを追加

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
scripts/
  collector/          取得レイヤーの入口・provider・正規化・差分処理
data/
  collector/          raw / normalized / state / logs の保存先
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
- `/admin`
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

## 取得レイヤー

- HTML スクレイピングは行わず、公式の非HTML出力を前提にした設計です
- 現段階では `mock-official-feed` provider でダミーレスポンスを読み込みます
- raw / normalized / state / logs を分離し、差分更新は `state/` のハッシュ比較で判定します
- 同じ入力を再実行した場合は同じ raw/normalized パスを再利用し、ログだけを追加保存します

実行例:

```bash
npm run collector:mock -- --year 2024 --quarter SPRING
```

主な保存先:

- `data/collector/raw/`: 生レスポンス
- `data/collector/normalized/`: 正規化済み JSON
- `data/collector/state/`: 差分更新用の最新ハッシュ状態
- `data/collector/logs/`: 実行ごとの監査ログ

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
