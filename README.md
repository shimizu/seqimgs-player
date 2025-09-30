# seqimgs-player

連番画像を動画のように再生するシンプルなプレイヤーライブラリです。`requestAnimationFrame` と `<canvas>` 描画に対応し、点滅やチラつきを抑えたスムーズな再生が可能です。Vite などのモジュールバンドラから利用でき、ゼロパディングされた画像群を指定の要素内でループ表示します。

## 準備

```bash
git clone git@github.com:shimizu/seqimgs-player.git
cd seqimgs-player
npm install
```

開発サーバーでデモを確認する場合は次を実行します。

```bash
npm run dev
```

ブラウザが自動で開かない場合は `http://localhost:5173/` にアクセスしてください。

## 使い方

1. 再生したい画像を `public/imgs/` に配置します（例: `takasaki_0000.webp`〜）。
2. `SeqImgsPlayer` をインポートし、ターゲット要素 ID と画像名配列を指定してインスタンス化します。

```js
import { SeqImgsPlayer } from './seqimgs-player.js'

const imageNames = Array.from({ length: 101 }, (_, i) => `takasaki_${String(i).padStart(4, '0')}`)

const player = new SeqImgsPlayer({
  mountId: 'player',
  imageNames,
  extension: 'webp',
  fps: 24,
  loop: true,
  publicPath: '/imgs/',
  autoPlay: false
})

await player.preload()
await player.play()
```

HTML 側には描画用の要素を用意しておきます。

```html
<div id="player"></div>
```

## オプション

| プロパティ          | 型                | 既定値        | 説明                                     |
| -------------- | ---------------- | ---------- | -------------------------------------- |
| `mountId`      | string           | なし         | 再生結果を表示する要素の ID。必須。                    |
| `imageNames`   | string[]         | なし         | 拡張子抜きのファイル名配列。読み込み順に並べる。               |
| `extension`    | string           | `webp`     | 画像拡張子。`avif`, `jpeg`, `png` などに変更可。    |
| `interval`     | number           | `100`      | フレーム間隔（ms）。`fps` が指定されていない場合のみ有効。      |
| `fps`          | number           | undefined  | フレームレート指定。`interval` より優先。             |
| `loop`         | boolean          | `true`     | 最終フレーム後に先頭へ戻るかどうか。                     |
| `publicPath`   | string           | `/imgs/`   | 静的ファイルのベースパス。Vite の `public` 配下を想定。    |
| `autoPlay`     | boolean          | `true`     | コンストラクタ後に自動で `preload()`→`play()` を実行。 |
| `renderTarget` | `'canvas'｜'img'` | `'canvas'` | 描画ターゲット。既定は Canvas。                    |
| `responsiveSwitching` | boolean | `false` | リサイズ監視を行うラッパーから利用。`true` でバリアント切替時に状態を保存。 |

## 公開メソッド

* `preload(): Promise<void>` – 全フレームを事前に読み込み decode 完了後に解決。
* `play(): Promise<void>` – `requestAnimationFrame` で再生を開始。
* `pause()` – 再生を一時停止。
* `stop()` – 停止し先頭フレームに戻す。
* `setSpeed(intervalMs)` – フレーム間隔を変更。再生中は即反映。
* `setFps(fps)` – FPS を直接指定。`interval` より優先。
* `setLoop(bool)` – ループ再生の切替。
* `dispose()` – DOM とキャッシュを解放。`ImageBitmap.close()` による GPU リソース解放も実施。

## リサイズ対応（レスポンシブ画像セット）

デモ実装 (`src/index.js`) には、画面幅や手動操作で画像セットを切り替える `createResponsivePlayer()` ラッパーを用意しています。`variants` に解像度別の連番画像セットを登録し、`responsiveSwitching: true` を指定すると `matchMedia('(max-width: 900px)')` と `window.resize` を監視して自動で最適なセットへ切り替えます。切り替え時は再生継続中でも `preload()` と `play()` を再実行して状態を復元します。

```js
const variantSets = {
  desktop: { imageNames, publicPath: './imgs/desktop/' },
  mobile: { imageNames, publicPath: './imgs/mobile/' }
}

const responsiveController = createResponsivePlayer({
  variants: variantSets,
  playerOptions: {
    mountId: 'player',
    extension: 'webp',
    responsiveSwitching: true,
    autoPlay: false
  },
  breakpointQuery: '(max-width: 900px)',
  debounceMs: 150
})

responsiveController.onVariantChange(({ variantKey }) => {
  console.log(`現在のバリアント: ${variantKey}`)
})
```

ラッパーは `cycleVariant()` で手動切り替え、`forceVariant('desktop')` で任意バリアント固定、`setResponsiveSwitching(false)` で監視停止といった制御も提供しています。UI 側では返却される `player` インスタンスにアクセスして既存の再生ボタン操作を再利用できます。

## 開発コマンド

| コマンド              | 説明                                     |
| ----------------- | -------------------------------------- |
| `npm run dev`     | 開発サーバーを起動しホットリロードを有効化。                 |
| `npm run build`   | 本番ビルド。出力は `dist/`。                     |
| `npm run preview` | ビルド済みアセットをローカル配信。                      |
| `npm run deploy`  | `gh-pages -d dist` で GitHub Pages に公開。 |

## 注意点

* 画像はゼロパディング（例: `0001`）で並べると順序が安定します。
* 大量フレームではメモリ消費が増えるため、ルート遷移時に `dispose()` を呼び出す運用を推奨。
* `renderTarget: 'img'` でも動作しますが、フリッカーを避けるには `canvas` 利用を推奨します。
* フォーマットは軽量な `webp` / `avif` が望ましく、再生開始のレスポンス改善に寄与します。
