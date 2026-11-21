# アニメ放送枠観測所 — Anime Airtime Tracker

[![CI](https://github.com/marc2825/AnimeAirtimeTracker/actions/workflows/ci.yml/badge.svg)](https://github.com/marc2825/AnimeAirtimeTracker/actions/workflows/ci.yml)

日本のアニメ放送編成を、**今週の番組表**から**放送枠の年表**、**編成統計**まで横断して調べられるWebサイトです。番組データは[しょぼいカレンダー](https://cal.syoboi.jp/)の公式の非HTMLインターフェースから取得し、放送枠と統計は本サイトが算出します。

**公開サイト: <https://anime-airtime-tracker.vercel.app>** — 2024年冬クール以降のデータを掲載し、6時間ごとに更新しています（[データ更新状況](https://anime-airtime-tracker.vercel.app/status)）。

## できること

- **週間番組表** — 局×時刻の番組表（アニメ時刻 25:30 表記、24時の日付変更線、現在時刻線）と週間リスト。関東・関西・BS・CS、再放送の有無、実時刻表示をURLで共有可能
- **放送枠の年表** — 「ノイタミナ」などの枠で、クールごとにどの作品が放送され、時刻がいつ動いたか。出典記載枠と推定枠を区別し、判定根拠を表示
- **編成統計** — 曜日×時間帯ヒートマップ、同時放送数、局別本数、クール別推移、関東と関西の放送時差。集計単位と対象範囲を必ず明示
- **検索・作品ページ** — 作品・放送・枠の検索、局別の放送履歴と観測した変更

## 技術スタック

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript 6 · PostgreSQL 18 · Prisma 7 · Vitest 5 · Playwright · Node.js 24

本番環境: Vercel（Web）· Neon（PostgreSQL）· GitHub Actions（定期データ取得・マイグレーション）。構成と運用手順は [docs/operations.md](docs/operations.md)。

## 開発環境のセットアップ

```bash
nvm use                 # Node 24
npm ci
cp .env.example .env
npm run db:local        # 別ターミナル: 組み込みPostgreSQL (Docker不要, :54320)
npm run db:deploy       # マイグレーション
npm run db:fixtures     # オフラインのサンプル（記録済みの実データ1日分）を投入
npm run dev             # http://localhost:3000
```

実データを取得する場合は `.env` の `SYOBOI_USER_AGENT` を設定してから `npm run ingest -- season`（今期、約20リクエスト）。取得元のルールと手順は [docs/data-pipeline.md](docs/data-pipeline.md)。

## テスト・ビルド

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run test:db         # DB統合テスト（TEST_DATABASE_URL、DB名に "test" を含むこと）
npm run build && npm run test:e2e
npm run screenshots     # 画面確認（PC/タブレット/スマホ × ライト/ダーク）
```

## ドキュメント

[docs/README.md](docs/README.md) — プロダクト、アーキテクチャ、データモデル、データ取得、デザインシステム、運用、ロードマップ。コーディングエージェント向けの規則は [AGENTS.md](AGENTS.md)。

## データとクレジット

- 番組データ: しょぼいカレンダー（有志による手入力の番組表）。同サイトの[利用について](https://docs.cal.syoboi.jp/about/)と[botについて](https://docs.cal.syoboi.jp/rule/bot/)に従って取得しています。HTMLのスクレイピングは行いません。
- 放送枠の判定・再放送の推定・統計は本サイトの算出であり、出典や放送局の見解ではありません。
- 作品画像は使用していません。

## 訂正・問い合わせ

- 本サイトの判定・表示の誤りや不具合: [GitHub Issues](https://github.com/marc2825/AnimeAirtimeTracker/issues/new/choose)
- 放送データ自体の誤り: しょぼいカレンダーで修正されると、次回の取得で反映されます。
- セキュリティ上の問題: 公開Issueにせず [SECURITY.md](SECURITY.md) の方法で連絡してください。

## ライセンス

未設定です（リポジトリ所有者が決定予定）。ライセンスが決まるまでは、ソースコードの利用・改変・再配布は許諾されていません。ソースコードのライセンスは番組データには及びません。
