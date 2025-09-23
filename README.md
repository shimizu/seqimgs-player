# seqimgs-player

連番画像を動画のように再生するシンプルなプレイヤーライブラリです。Vite などのモジュールバンドラから利用でき、ゼロパディングされた画像群を指定の要素内でループ表示します。

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

1. 再生したい画像を `public/imgs/` に配置します（例: `takasaki_0000.jpeg`〜）。
2. `SeqImgsPlayer` をインポートし、ターゲット要素IDと画像名配列を指定してインスタンス化します。

```js
import { SeqImgsPlayer } from './seqimgs-player.js'

const imageNames = Array.from({ length: 101 }, (_, i) => `takasaki_${String(i).padStart(4, '0')}`)

const player = new SeqImgsPlayer({
  mountId: 'player',
  imageNames,
  extension: 'jpeg',
  interval: 80,
  loop: true,
  publicPath: '/imgs/',
  autoPlay: false
})

await player.preload()
player.play()
```

HTML 側には描画用の要素を用意しておきます。

```html
<div id="player"></div>
```

## オプション

| プロパティ | 型 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `mountId` | string | なし | 再生結果を表示する要素の ID。必須。 |
| `imageNames` | string[] | なし | 拡張子抜きのファイル名配列。読み込み順に並べる。 |
| `extension` | string | `jpeg` | 画像拡張子。`png` などに変更可。 |
| `interval` | number | `100` | フレーム間隔（ミリ秒）。小さいほど高速。 |
| `loop` | boolean | `true` | 最終フレーム後に先頭へ戻るかどうか。 |
| `publicPath` | string | `/imgs/` | 静的ファイルのベースパス。Vite の `public` 配下を想定。 |
| `autoPlay` | boolean | `true` | コンストラクタ後に自動で `preload()`→`play()` を実行。 |

主なメソッドは `preload()`, `play()`, `pause()`, `stop()`, `setSpeed(ms)`, `setLoop(bool)`, `dispose()` です。`play()` はプリロード完了まで待機するため、手動制御時も安全に呼び出せます。

## 開発コマンド

| コマンド | 説明 |
| --- | --- |
| `npm run dev` | 開発サーバーを起動しホットリロードを有効化。 |
| `npm run build` | 本番ビルド。出力は `dist/`。 |
| `npm run preview` | ビルド済みアセットをローカル配信。 |
| `npm run deploy` | `gh-pages -d dist` で GitHub Pages に公開。 |

## 注意点

- 画像はゼロパディング（例: `0001`）で並べるとフレーム順序が安定します。
- 複数インスタンスを同ページに配置する場合は、それぞれ別の `mountId` と画像配列を渡してください。
- 大量の画像を扱う際は、プリロードに時間がかかるため `preload()` 呼び出しを UI から制御するのがおすすめです。
