# AGENTS.md

## Project
このリポジトリは「深夜アニメ放送枠観測所」を実装する。
目的は作品DBではなく、放送枠・放送時間・放送局・地域差を分析できるWebアプリを作ること。

## Product priorities
1. 検索・絞り込み
2. 放送枠詳細ページ
3. 統計可視化
4. データモデルの拡張性
5. 取得バッチ

## Core constraints
- 日本語UIを基本とする
- 実日時刻と「月曜25:30」のようなアニメ文脈時刻を両方保持する
- 放送枠は独立エンティティにする
- まずはダミーデータでUIと集計を完成させる
- 外部データ取得はMVP後半または別タスクで行う
- しょぼいカレンダーはHTMLスクレイピングしない。公式の非HTML出力前提で設計する
- ジャンル、制作会社、スタッフ、続編情報はnullableで設計し、後から補完可能にする

## Tech preferences
- Next.js
- TypeScript strict
- PostgreSQL
- Prisma
- 単一リポジトリ構成
- バッチも可能ならTypeScriptで統一

## UI expectations
- PC優先、レスポンシブ対応
- URLで検索条件を共有可能
- グラフだけでなく表も出す
- 検索一覧、作品詳細、放送枠詳細、統計ダッシュボードをMVPに含める

## Important docs
- 要件定義: docs/requirements.md
- 画面一覧: docs/screens.md
- データモデル案: docs/data-model.md
- サンプルデータ: docs/sample-data.json

## Validation
変更後は必ず以下を実行すること。
- install
- lint
- typecheck
- test
- build

## Done when
- 検索一覧ページが動く
- 作品詳細ページが表示できる
- 放送枠詳細ページが表示できる
- 統計ダッシュボードに最低1つのヒートマップと1つの集計表がある
- ダミーデータで一連の画面遷移が確認できる
- READMEに起動方法と実装状況が追記されている