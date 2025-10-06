# responsive-player.js の仕組みと使い方

## 役割の概要
- `createResponsivePlayer` は画像シーケンス再生を担当する `SeqImgsPlayer` を内部で生成し、画面幅や `matchMedia` の結果に応じて最適なバリアント（画像セット）を選択する薄いラッパー関数です。
- 指定された各バリアントは `publicPath` と `imageNames` の組み合わせで構成され、プレイヤー生成時に `SeqImgsPlayer` へ渡されます。
- レスポンシブ切り替えの分岐・監視・状態引き継ぎをひとつのインスタンスで完結させることで、外部からは「いまどのバリアントがアタッチされているか」だけを意識すればよくなります。

## バリアントの選択アルゴリズム
- 初期化時に `variants` オブジェクトからキーを読み込みます。`desktop` / `mobile` が揃っていればそれらを優先し、不足していれば最初の要素をフォールバックとして用います。
- ブラウザ環境で `matchMedia` が使える場合は `breakpointQuery`（既定値は `(max-width: 900px)`）を監視し、マッチ状態にもとづきバリアントを決定します。
- `matchMedia` が無い場合は `window.innerWidth` を `breakpointWidth`（既定値 900px）と比較し、しきい値より小さければモバイル、大きければデスクトップ、どちらも無ければフォールバックを返します。
- ブラウザ以外（SSR、テストなど）では常にフォールバックキーを利用し、非ブラウザ環境における例外を防ぎます。

## 画像切り替えの流れ
1. 現在の `SeqImgsPlayer` インスタンスとバリアントキーを保持します。
2. 新しいキーが選ばれると `mountVariant` が呼ばれ、既存プレイヤーを `destroy()` で破棄しつつ、新しい `SeqImgsPlayer` を生成します。
3. `preserveState` オプションが真の場合、旧プレイヤーが再生中・プリロード済みだったかを確認し、必要に応じて `preload()` や `play()` を再実行します。
4. `onVariantChange` で登録されたリスナーに対し、新しいプレイヤーとキーを通知します（例外は握りつぶして続行）。
5. 複数の切り替え要求が短時間に発生しても `queueVariantChange` が内部で Promise チェーンを直列化するため、最後の要求が順番に処理されます。

## リサイズ・メディアクエリ検知の扱い
- `responsiveSwitching`（初期値は `playerOptions.responsiveSwitching` の真偽）をもとに、リサイズ／`matchMedia` 監視をオンオフします。
- 監視が有効になると `window.resize` と `matchMedia('change')` を購読し、イベント発火時に `scheduleVariantUpdate` がデバウンストリガー（既定 150ms）をセットします。
- デバウンス期間終了後に再度バリアントを検出し、キーが変わっていれば `queueVariantChange` が走ります。何も変わらなければ何もしません。
- 監視解除時にはリスナー登録を解き、保留中の `setTimeout` もクリアしてメモリリークや重複ハンドラを避けます。

## 提供される API
- `getPlayer()` / `getVariant()` / `getVariants()` で現在の状態を参照できます。
- `onVariantChange(listener)` はバリアント更新時に通知を受け取るフックを登録し、渡されたリスナーを即時実行して現在値を教えてくれます。解除用の関数を返します。
- `setResponsiveSwitching(enabled)` で監視の有効・無効を切り替えられ、再度有効化した際は最新ビューポートに合わせて切り替えを試みます。
- `forceVariant(key, options)` は明示的にバリアントを指定、`cycleVariant()` はバリアントリストの次要素へ巡回します。

## 使い方の例
```js
import { createResponsivePlayer } from './responsive-player.js'

const responsivePlayer = createResponsivePlayer({
  variants: {
    desktop: {
      publicPath: '/imgs/takasaki-desktop/',
      imageNames: ['takasaki_0001.webp', 'takasaki_0002.webp', /* ... */]
    },
    mobile: {
      publicPath: '/imgs/takasaki-mobile/',
      imageNames: ['takasaki_0001.webp', 'takasaki_0002.webp', /* ... */]
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

// 任意のタイミングで現在のプレイヤーを参照
const player = responsivePlayer.getPlayer()

// UI ボタンから明示的にバリアントを切り替えたい場合
document.querySelector('#force-mobile').addEventListener('click', () => {
  responsivePlayer.forceVariant('mobile', { preserveState: true })
})

// バリアントが変わるたびにステータス表示を更新
responsivePlayer.onVariantChange(({ variantKey }) => {
  document.querySelector('#status').textContent = `current: ${variantKey}`
})
```

### 呼び出し手順のポイント
- `variants` は最低 1 つ必要です。`desktop` / `mobile` の両方を用意すると、既定のレスポンシブ判定がより自然に機能します。
- `playerOptions` には `SeqImgsPlayer` に渡したい全オプション（`container`、`autoplay`、`loop` など）を設定できます。
- SSR やプリレンダリングでも安全に呼び出せますが、実際にバリアントがマウントされるのはブラウザ環境で `window` が利用可能になったタイミングです。
- 自前でレスポンシブ切り替えを制御したい場合は `setResponsiveSwitching(false)` で監視を止め、必要に応じて `forceVariant` や `cycleVariant` を呼び出します。
