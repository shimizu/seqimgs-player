# seqimgs-player アーキテクチャ（Canvas 出力対応版）

## 実行時の概要

* `vite.config.js` は `src/` をアプリケーションルートとし、静的アセットは `public/` から配信、ビルド成果物は `dist/` に出力します。`base: "./"` により GitHub Pages など相対パス配信でも破綻しません。
* エントリーポイント `src/index.html` は `#player` コンテナを用意し、バンドルされた JS (`/index.js`) を読み込みます。
* コアライブラリ `SeqImgsPlayer` は外部プロジェクトから単独利用可能です。デモページはその利用例を示す位置づけです。

## モジュール構成

* `src/seqimgs-player.js`: コアクラス。再生状態管理、プリロード処理、Canvas への描画を担当します。
* `src/index.js`: デモ初期化コード。UI コントロールとの紐付けやプリロード進捗表示の例を含みます。
* `src/index.scss`: デモ用スタイル。ロジックとは独立しています。
* `public/imgs/`: フレーム格納ディレクトリ。`scene_0000.webp` のようにゼロ埋めを推奨。

## コアクラス `SeqImgsPlayer`

### コンストラクタの責務

1. `#mergeOptions` でユーザー指定オプションと `DEFAULT_OPTIONS` を統合。`publicPath` 正規化、`interval` または `fps` を設定。
2. `mountId`・`imageNames`・`extension` を検証。欠落時は例外を投げます。
3. マウント要素に `<canvas>` （既定）または `<img>` を生成・配置。Canvas は DPR（`devicePixelRatio`）を考慮し、内部解像度を確保します。
4. 内部状態（`currentIndex`、`isPlaying`、`isReady` 等）を初期化。`autoPlay` が有効なら `preload()` → `play()` を呼び出します。

### 公開 API

* `preload(): Promise<void>` – 全フレームを取得・decode・（可能なら `createImageBitmap`）まで完了させます。Promise を共有し多重呼び出しを防止します。
* `play(): Promise<void>` – `requestAnimationFrame` を用いてフレーム更新を開始。DPR 対応 Canvas へ描画します。
* `pause()` / `stop()` – 再生ループを停止。`stop()` は 0 フレームへ戻し、Canvas をクリアします。
* `setSpeed(intervalMs)` – フレーム間隔を更新。再生中は即時反映。
* `setFps(fps)` – FPS を直接指定可能。`interval` より優先されます。
* `setLoop(shouldLoop)` – ループ再生の有無を切り替え。
* `dispose()` – DOM・メモリ解放。`ImageBitmap.close()` による GPU リソース解放も実施。

### 内部メソッド

* `#setFrame(index)` – 指定フレームを Canvas に描画（`drawImage`）。
* `#advanceFrame()` – フレームを進め、末尾ではループ判定または停止。
* `#preloadFrame(name, useBitmap)` – `fetch → blob → createImageBitmap` または `Image.decode()` によるデコード済みフレーム取得。
* `#frameSize(frame)` – 初期 Canvas サイズ確定用にフレーム寸法を取得。

## 状態管理の契約

* `isReady` はすべてのフレームが decode 済みのときのみ `true`。
* `preloadedFrames` は順序通りの `ImageBitmap` または `HTMLImageElement` を保持。
* 再生停止中は `requestAnimationFrame` のハンドルを `null` にし、重複ループを防ぎます。

## 非同期画像読み込みパイプライン

1. `preload()` が `#preloadFrame` を呼び出し、全フレームを Promise.all で束ねます。
2. `fetch(cache:'force-cache')` により HTTP キャッシュを活用。成功時は blob から decode。
3. `createImageBitmap` が利用可能ならビットマップ化、そうでなければ `Image.decode()` を使用。
4. プリロード成功後は `#setFrame(0)` を呼び、Canvas にプレビュー表示。

## サンプル: 基本利用

```js
import { SeqImgsPlayer } from './seqimgs-player.js'

const imageNames = Array.from({ length: 120 }, (_, i) => `scene_${String(i).padStart(4, '0')}`)

const player = new SeqImgsPlayer({
  mountId: 'player',
  imageNames,
  fps: 24,
  loop: true,
  autoPlay: false,
  publicPath: '/imgs/'
})

await player.preload()
await player.play()
```

## 拡張ガイドライン

* **進捗表示**: `preload()` に進捗コールバックを追加拡張することで UI に進行度を反映可能。
* **複数インスタンス**: 各プレイヤーが独立状態を持つため、ページに複数配置可能。
* **大規模シーケンス**: フレーム数が膨大な場合はチャンク単位のロードやメモリ管理戦略を検討。
* **エラー処理**: 読み込み失敗時は例外を投げるので UI 層で捕捉し再試行や警告を提示すると堅牢。

## ビルドとデプロイ

* `npm run dev`: Vite 開発サーバーを起動しホットリロード。
* `npm run build`: `dist/` に本番ビルドを出力。
* `npm run preview`: ビルド済み成果物を確認。
* `npm run deploy`: GitHub Pages に `dist/` を公開。

## テストとトラブルシュート

* 手動で `preload`・`play`・`pause`・`stop`・`loop` 切替を確認。
* 大規模フレームではメモリ消費に注意。ルート遷移時には `dispose()` を呼ぶ運用を推奨。
* ブラウザコンソールに `decode()` エラーやアセット欠落警告が出ていないか確認すること。
