MyVocabulary (React PWA)

概要
- エビングハウスの忘却曲線近似（stability=λ）で次回出題日を決定する単語帳PWA。
- オフライン学習可（データは IndexedDB に保存）。インポート時のみネット必須。
- SQLite は WebAssembly(sql.js) を使用、DBはIndexedDBに永続化。

セットアップ
1) 依存関係のインストール
   npm install

2) sql.js の wasm を配置（必須）
   cp node_modules/sql.js/dist/sql-wasm.wasm public/sql-wasm.wasm

3) 開発サーバ起動
   npm run dev

4) 初期設定（アプリ起動後）
   - Google OAuth Client ID を設定（例: xxxxxxxx.apps.googleusercontent.com）
   - Google Document ID を設定（DocsのURLのID）

Google Docs インポート仕様
- OAuth スコープ: https://www.googleapis.com/auth/documents.readonly
- ドキュメントの「最初の表」を読み取ります。列は固定: Phrase | Meaning | Example | Source | Date
- 重複判定は phrase を trim()・小文字化して比較。必須列(Phrase/Meaning)欠損はスキップ。
- Date があれば createdAt に反映、なければ現在時刻。初期 srs_state:
  - stability = 2.0, intervalDays = 1, nextDueDate = 今日。
- 結果トースト: 追加 X / スキップ Y / 失敗 Z。

当日の出題ロジック
- 「今日の復習を開始」押下で nextDueDate <= 今日 を FIFOで「残り」キューに積む（due日・作成日時で安定並び）。
- 出題順: 残り →（空なら）今日もう一度。両方空で終了。
- 評価:
  - 簡単: stability *= 1.25、I=round(-λ ln 0.9) 最小1日、nextDue=today+I。
  - 普通: stability *= 1.10、同上。
  - 難しい: stability *= 0.85、intervalDays=0、nextDue=today、lapses+1。「今日もう一度」に追加し、かつ残りの現在位置+3へ差し込み。
- すべて reps+1、updatedAt 更新、review_log へ記録。全更新はトランザクションで実行。

PWA
- `public/manifest.webmanifest` と `public/sw.js` を用意。基本的なオフラインフォールバックを実装。
- 端末に追加して全画面表示が可能。

ファイル構成（抜粋）
- index.html … PWA登録とルーティングエントリ
- public/sw.js … 簡易Service Worker
- public/db/schema.sql … DBスキーマ
- src/db/sqlite.ts … sql.js 初期化、スキーマ適用、永続化、クエリ・更新
- src/lib/google.ts … OAuth + Docs API 読み取り、表パース
- src/state/store.ts … 出題キューと評価処理
- src/pages/Home.tsx … 設定/インポート/開始
- src/pages/Review.tsx … 出題UI

テスト観点（手動確認の要点）
- 抽出境界: 端末日付変更直後に nextDueDate <= 今日 の抽出が正しい。
- 難しい選択後: 今日もう一度 のカウントが増え、残りへ+3差し込み後に実際に再出題される。
- インポート: 重複混在で新規のみ追加、1行目がヘッダーであれば除外、必須列空はスキップ、Date無しは createdAt=now。
- トランザクション: インポートやレビュー中の途中失敗でDB不整合が起きない（手動で例外発生させ検証）。

補足
- 本番ビルドでは Service Worker にビルド成果物のプリキャッシュを追加すると完全オフラインに近づきます（現状は最小実装）。
- Google側設定: OAuth クライアントID(ウェブ)を作成し、承認済みJavaScript生成元にアプリのオリジンを指定してください。

