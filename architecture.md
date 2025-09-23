# seqimgs-player アーキテクチャ

## 実行時の概要
- `vite.config.js` は `src/` をアプリケーションルートとして扱い、静的アセットを `public/` から配信し、ビルド成果物を `dist/` へ出力します。`base: "./"` を指定しているため、GitHub Pages やサブディレクトリ配信でも相対パスが破綻しません。
- エントリーポイントの `src/index.html` は `#player` コンテナを用意し、ES Modules バンドル (`/index.js`) を読み込みます。開発・ビルド時ともに Vite が JS と SCSS を注入するため、追加の配線は不要です。
- リポジトリにはデモページが同梱されていますが、ライブラリ本体（`SeqImgsPlayer`）は外部プロジェクトから単独でインポートできるように設計されています。

## モジュール構成
- `src/seqimgs-player.js`: コアライブラリクラス。再生状態、オプション正規化、非同期プリロード、DOM 操作を一手に担います。
- `src/index.js`: デモの初期化コード。プレイヤー設定例、UI コントロールの紐付け、プリロードなど非同期処理の扱い方を示します。
- `src/index.scss`: デモ用スタイル。マウント要素のアスペクト比や中央寄せを定義していますが、プレイヤーのロジック自体はスタイルに依存しません。
- `public/imgs/`: 連番フレームを格納する標準ディレクトリ。辞書順と再生順を揃えるため、`prefix_0000.jpeg` のようにゼロ埋めしたファイル名にします。

## コアクラス `SeqImgsPlayer`
`SeqImgsPlayer` は小さな命令的 API を公開しつつ、可変状態を内部に閉じ込めています。ライフサイクルを押さえておくと、機能追加時の破壊的変更を防げます。

### コンストラクタの責務
1. `#mergeOptions` で受け取ったオプションに `DEFAULT_OPTIONS` をマージし、`publicPath` のスラッシュ付与と `interval` の正値化を行います。
2. `mountId`、`imageNames`、`extension` を早期バリデーションし、欠落時は同期的に例外を投げます。設定ミスを開発段階で即座に気付けます。
3. マウント要素を解決し、専用の `<img>` 要素を生成・追加します。`decoding = 'async'` を設定しており、ブラウザがメインスレッド外でデコードできるようにします。
4. `currentIndex`、`isPlaying`、`isReady`、`timerId`、`preloadPromise`、`preloadedImages` といった状態を初期化します。`autoPlay` が `true` の場合はコンストラクタ内で `preload()` → `play()` を連鎖的に呼び出します。

### 公開 API
- `preload(): Promise<void>` – 非同期の取得・デコード処理を開始します。開始済みの場合は同じ Promise を共有します。
- `play(): Promise<void>` – 準備完了を待ち、現在フレームを設定した上で `setInterval` によるフレーム更新を開始します。
- `pause()` / `stop()` – タイマーを停止します。`stop()` はフレームを 0 番に戻し、キャッシュが無い場合は `<img>` の `src` を外します。
- `setSpeed(intervalMs)` – 入力値を検証して `options.interval` を更新します。再生中なら停止→再開を行い、速度変更を即反映します。
- `setLoop(shouldLoop)` – `#advanceFrame()` が末尾でループするか停止するかを切り替えます。
- `dispose()` – DOM 参照とキャッシュ済み画像を解放し、マウント要素の再利用を可能にします。

内部では以下のプライベートメソッドが責務を整理しています。
- `#setFrame(index)`: 存在するフレームのみを描画し、`currentIndex` と `<img>.src` の更新を一括管理します。
- `#advanceFrame()`: インデックスの増分、ループ判定、停止条件をまとめています。
- `#ensureReady()`: 公開メソッドが冗長なプリロード確認を持たずに済むよう、`preload()` 呼び出しを内包します。

### 状態管理の契約
- `isReady` は全フレームの読み込みが成功したときだけ `true` になります。失敗した場合は `preloadPromise` を `null` に戻し、リトライ可能な状態を保ちます。
- `preloadedImages` には順序通りの `HTMLImageElement` が格納されます。`play()` は配列が空のとき実行されないため、`undefined` 参照を防ぎます。
- 再生が停止または一時停止中は `timerId` が常に `null` となります。この不変条件を守ることで、将来 `requestAnimationFrame` など別スケジューラへ移行する際の負担が軽くなります。

## 非同期画像読み込みパイプライン
1. `preload()` は `imageNames` を `#preloadImage(name)` にマップし、`Promise.all` で束ねます。生成した Promise は `preloadPromise` に保持し、複数呼び出しが同じ処理を待てるようにします。
2. `#preloadImage` は `publicPath + name + '.' + extension` から URL を構築し、切り離された `Image` インスタンスを生成して `decoding = 'async'` を設定、`img.src` 代入で取得を開始します。
3. `onload` 発火後、`img.decode()` が利用可能なら await します。事前デコードにより初回表示時のチラつきを低減します。`decode()` でエラーが発生してもログを残しつつ再生は継続します。
4. `onerror` では失敗した URL を含む `Error` で reject し、`Promise.all` 全体を失敗させます。`preload()` の catch で `preloadPromise` をリセットするため、アセット修正後に再試行できます。
5. プリロード成功後は `preloadedImages` を更新し、`#setFrame(0)` で 0 番フレームを先に描画しておきます。再生開始前でも静止画プレビューを表示できます。

### サンプル: 基本的な統合パターン
```js
import { SeqImgsPlayer } from './seqimgs-player.js'

const imageNames = Array.from({ length: 120 }, (_, i) => `scene_${String(i).padStart(4, '0')}`)

const player = new SeqImgsPlayer({
  mountId: 'player',
  imageNames,
  interval: 80,
  loop: true,
  autoPlay: false,
  publicPath: '/imgs/'
})

await player.preload()
await player.play()
```
デモとほぼ同じですが、プリロードを明示的に呼び出している点が異なります。大規模 UI に組み込む際は、読み込み状態を UI に反映しやすくなります。

### サンプル: 進捗コールバックの追加（ライブラリ拡張）
プリロード進捗を公開するには、`preload()` にオプションのコールバックを受け付けるのが一案です。下記は振る舞いを変えずに拡張する例です。

```js
// src/seqimgs-player.js 内の例
async preload (onProgress) {
  if (this.isReady) return
  if (!this.preloadPromise) {
    let completed = 0
    const total = this.options.imageNames.length

    const tasks = this.options.imageNames.map((name) =>
      this.#preloadImage(name).then((img) => {
        completed += 1
        if (typeof onProgress === 'function') {
          onProgress({ completed, total })
        }
        return img
      })
    )

    this.preloadPromise = Promise.all(tasks)
  }

  try {
    this.preloadedImages = await this.preloadPromise
    this.isReady = true
    if (this.preloadedImages.length) this.#setFrame(0)
  } catch (error) {
    this.preloadPromise = null
    throw error
  }
}
```
利用側は `player.preload(({ completed, total }) => updateProgress(completed / total))` のように呼び出せます。既存利用者は追加引数を省略できるため後方互換性を維持できます。

## DOM 連携とコントロール
- マウント先にはプレイヤーが生成した `<img>` 要素が 1 つ入ります。デモでは `src/index.js` の `setupButton` ヘルパーが型チェックを行い、想定外の要素を握らないようにした上でイベントを登録しています。
- レイアウトは利用側の責務です。`index.scss` はアスペクト比維持・中央寄せ・暗背景といった例を提供しますが、`<img>` が適切にサイズされれば任意のスタイルで構いません。
- デモは `aria-live="polite"` を設定し、支援技術にフレーム更新を穏やかに通知します。キーボード操作など UI 拡張時もこの配慮を保つとよいでしょう。

## 拡張ガイドライン
- **複数インスタンス**: 状態はインスタンスごとに分離されているため、1 ページに複数プレイヤーを配置できます。各インスタンスに固有の `mountId` とフレームセットを渡してください。
- **アセット配置の変更**: CDN や別ディレクトリから配信する場合は `publicPath` を上書きします。`#normalizePublicPath` が末尾スラッシュを保証するので、単にベース URL を指定すれば URL 結合が成立します。
- **スケジューラの変更**: 再生を滑らかにしたい場合は `setInterval` の代わりに `requestAnimationFrame` を導入する案があります。ハンドルを `timerId`（または新フィールド）に格納し、`pause()` / `stop()` で必ず解除してアイドル時の不変条件を守ります。
- **メモリ管理**: デコード済み画像はメモリ上に残るため、巨大なシーケンスではチャンク読み込みやフレーム破棄を検討する価値があります。将来的に `setFrame(index)` を公開してオンデマンド取得する拡張も考えられます。
- **エラー表示**: `preload()` は失敗 URL を含む `Error` を投げます。UI 層で捕捉してトースト表示や再試行ボタンを提供すると保守性が向上します。

### サンプル: 再生速度スライダー
```js
const speedSlider = document.querySelector('#speed')
speedSlider.addEventListener('input', (event) => {
  const fps = Number(event.target.value)
  if (Number.isFinite(fps) && fps > 0) {
    player.setSpeed(1000 / fps)
  }
})
```
`setSpeed` が内部で再生の再開を行うため、UI から滑らかに速度変更できます。

## ビルドとデプロイ
- `npm run dev` は Vite の開発サーバーを起動し、`src/` 配下の JS/SCSS をホットリロードします。
- `npm run build` は `dist/` に本番バンドルを出力し、`base` 設定を反映します。`npm run preview` でビルド結果を本番同等パスで確認できます。
- `npm run deploy` は `gh-pages -d dist` で `dist/` を GitHub Pages に公開します。実行前に Git ツリーをクリーンにし、GitHub 認証を済ませてください。

## テストとトラブルシュート
- 自動テストは未整備のため、手動でプリロード・再生・一時停止・停止・ループ切替を確認し、ブラウザコンソールに `Image.decode` やアセット欠落の警告が出ていないか監視してください。
- プリロード済み画像はメモリに保持されます。シーケンスが大きい場合はメモリ使用量を監視し、ルート遷移時に `dispose()` を呼ぶなどの運用ルールを検討しましょう。
- Lint、フォーマッタ、テストなどのツールを導入する際は `README.md` に記載し、`package.json` の npm スクリプトへ追加してコントリビューターが発見しやすい状態にしてください。
