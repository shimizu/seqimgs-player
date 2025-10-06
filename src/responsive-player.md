# responsive-player.js の仕組みと使い方

## 🎯 目的

`responsive-player.js` は、**画面サイズに応じて異なる画像シーケンスを自動で切り替えるためのラッパー**です。内部で `SeqImgsPlayer` を生成・破棄しながら、`desktop` 用と `mobile` 用など複数のプレイヤーを状況に応じて入れ替えます。

---

## ⚙️ 仕組みの概要

* 画面幅や `matchMedia('(max-width: 900px)')` の結果に応じて、どの画像セットを再生するかを判断します。
* それぞれの画像セット（例：`desktop` 用と `mobile` 用）は、`publicPath` と `imageNames` の組み合わせで指定します。
* 切り替えのたびに、内部で `SeqImgsPlayer` を新しく生成し、前のプレイヤーは `destroy()` で破棄されます。
* 状況に応じて再生中・プリロード済みの状態を引き継ぎ、連続したユーザー体験を維持します。

つまり「ひとつのプレイヤーを動的に差し替える制御レイヤー」として機能します。

---

## 🧭 切り替えの流れ

1. 初期化時に `createResponsivePlayer()` が呼ばれると、現在の画面幅を調べて、最初の `SeqImgsPlayer` を生成します。
2. `window.resize` や `matchMedia('change')` イベントを監視し、デバウンス（遅延実行）で変化を検知します。
3. 判定結果が変わったら、古いプレイヤーを `destroy()` し、新しいプレイヤーを `new SeqImgsPlayer()` で生成します。
4. 切り替え時に `preserveState: true` を渡していれば、

   * 前のプレイヤーが再生中なら `play()` を再開
   * すでに画像を読み込んでいたなら `preload()` を再実行
5. `onVariantChange` に登録されたコールバックが呼ばれ、新しいプレイヤーを受け取れます。

プレイヤーの状態は「再生中」か「プリロード済か」だけを外部に保存しています。
```js:
//mountVariant()内
const previousPlayer = currentPlayer
const shouldPreserve = Boolean(preserveState)
const wasPlaying = shouldPreserve && previousPlayer?.isPlaying === true
const wasReady   = shouldPreserve && previousPlayer?.isReady === true
```

何コマ目まで再生したかなどの情報は保存できないため、プレイヤー切り替わり時は初めから再生されることになります。

---

## 🧠 キャッシュの扱い

* `destroy()` により、古いプレイヤーの内部画像（`Image` オブジェクト）は解放されます。
* ただしブラウザの HTTP キャッシュが有効なので、**同じURLの画像は再ダウンロードされません。**
* ただし、`desktop` 用と `mobile` 用で画像パスが異なる場合は別URL扱いになるため、再ロードが発生します。

> ⚙️ 高速化したい場合：
>
> * 2つの `SeqImgsPlayer` を同時に保持し、表示をCSSで切り替える（再ロード不要）
> * 次のプレイヤーの画像を `preload()` で事前に読み込む
> * Service Worker で `/imgs/` 以下をキャッシュ

---

## 🧰 提供される関数

| 関数                                | 説明                                            |
| --------------------------------- | --------------------------------------------- |
| `getPlayer()`                     | 現在動作中の `SeqImgsPlayer` を取得します。                |
| `getVariant()`                    | 現在使用中のプレイヤー種別（`desktop` / `mobile` など）を取得します。 |
| `onVariantChange(listener)`       | 切り替え発生時に新しいプレイヤーを受け取るコールバックを登録します。            |
| `setResponsiveSwitching(enabled)` | 自動切り替えの有効/無効を切り替えます。                          |
| `forceVariant(key, options)`      | 明示的にプレイヤーを指定（例: `forceVariant('mobile')`）。    |
| `cycleVariant()`                  | 定義済みのプレイヤーを順番に切り替えます。                         |

---

## 💡 使用例

```js
import { createResponsivePlayer } from './responsive-player.js'

const responsivePlayer = createResponsivePlayer({
  variants: {
    desktop: {
      publicPath: '/imgs/takasaki-desktop/',
      imageNames: ['takasaki_0001.webp', 'takasaki_0002.webp']
    },
    mobile: {
      publicPath: '/imgs/takasaki-mobile/',
      imageNames: ['takasaki_0001.webp', 'takasaki_0002.webp']
    }
  },
  playerOptions: {
    container: document.querySelector('#player'),
    responsiveSwitching: true,
    autoplay: true
  },
  breakpointQuery: '(max-width: 768px)',
  debounceMs: 200
})

// 現在のプレイヤーを参照
const player = responsivePlayer.getPlayer()

// 明示的にモバイル版を呼び出し
responsivePlayer.forceVariant('mobile', { preserveState: true })

// 切り替えが起きたときにログを出す
responsivePlayer.onVariantChange(({ variantKey }) => {
  console.log('Switched to', variantKey)
})
```

---

## 🪜 開発者向けのポイント

* `createResponsivePlayer()` は単一の `SeqImgsPlayer` を常に保持し、必要なときに作り直します。
* 同時に2つ動かすことはありません（パフォーマンス重視）。
* 切り替えが頻発するアプリでは、`preload()` を活用することで体感速度を大きく改善できます。
* SSR環境でも安全に呼び出せますが、実際のプレイヤー生成はブラウザ上でのみ行われます。
* 手動での切り替え制御も可能で、開発用デバッグUIなどに統合しやすい構造になっています。
