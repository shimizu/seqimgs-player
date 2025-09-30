# リサイズ連動画像切り替え仕様案

## 目的
- PC 向け高解像度フレームとスマホ向け軽量フレームを別管理し、表示幅に応じて自動選択する。
- リサイズや向き変更時に適切なセットへ切り替え、再生をシームレスに継続する。

## 対象モジュール
- 主要エントリ: `src/index.js`
- プレイヤー本体: `src/seqimgs-player.js`
- 画像アセット: `public/imgs/**`

## 画像アセット構成
- ディレクトリを `public/imgs/desktop` と `public/imgs/mobile` に分割。
- ベース名と拡張子を共通化し、ゼロパディングを維持。
  - 例: `public/imgs/desktop/takasaki_0042.jpeg`, `public/imgs/mobile/takasaki_0042.jpeg`
- モバイル版はリサイズ済み (幅 720px 目安)、デスクトップ版は元解像度 (幅 1280px 以上) を想定。
- 新たなセットを追加する場合は `variant` 名でサブディレクトリを増やすだけで済むよう命名を統一。

## ブレークポイントと判定ロジック
- 既定の判定幅: `matchMedia('(max-width: 900px)')` を採用。
  - 900px 以下 → `mobile`
  - 901px 以上 → `desktop`
- `SeqImgsPlayer` 拡張案: `variantSets` オプションを追加し、各 `variant` ごとに `publicPath` と `imageNames` を指定可能にする。
- 初期化時に `getCurrentVariant()` で現在のビューポートに適したセットを決定し、そのセットでプレイヤーを構築。

## リサイズ対応の有効/無効切り替え
- `SeqImgsPlayer` に `responsiveSwitching: boolean` (既定 `false`) を追加。
- `false` の場合は初期判定のみを行い、リサイズ／向き変更による再構築は実施しない。
- 外部 API として `player.setResponsiveSwitching(enabled)` を公開し、実行時に切り替えられるようにする案も検討。
- 設定値は `createResponsivePlayer` で受け取り、監視イベントの登録・解除を統一的に制御。

## 初期化フロー
1. `src/index.js` で `const variants = { desktop: {...}, mobile: {...} }` を宣言。
2. `createPlayerFor(variantKey)` ヘルパーを用意し、`SeqImgsPlayer` に対応セットを渡す。
3. 初回ロード時に `detectVariant()` を実行し、`currentVariant` を決定してプレイヤー生成。
4. `SeqImgsPlayer` 側で `variant` をプロパティとして保持し、プリロード済みフレームをキャッシュ。

## リサイズ・向き変更時の挙動
- `window.matchMedia('(max-width: 900px)')` の `change` イベントと `resize` イベントを監視。
- 変化を検知したら:
  1. 現在のプレイヤーを `pause()` → `destroy()` (新規メソッド追加) で破棄。
  2. キャッシュ済みフレームがあれば再利用し、なければ該当バリアントを `preload()`。
  3. `autoPlay` 設定を尊重しつつ再生制御を復元 (再生中だった場合のみ再生再開)。
- 短時間での連続リサイズに備え、`requestAnimationFrame` 内で判定 → `setTimeout` (150ms 程度) のデバウンスを入れる。

## パフォーマンスとフォールバック
- 可能なら `createImageBitmap` でデコード済みキャッシュをバリアントごとに保持し、再切り替え時の再ダウンロードを回避。
- ネットワーク節約のため、未使用バリアントは必要になるまでプリロードしない (遅延ロード)。
- `matchMedia` が未対応なブラウザではウィンドウ幅を直接参照するフォールバック関数を用意。
- 切り替え時に通信エラーが発生した場合は、既存セットにロールバックし、コンソール警告を出力。

## 実装タスクの目安
- [ ] `SeqImgsPlayer` に `destroy()` と `setFrames(imageNames, publicPath)` のような API を追加し、フレーム差し替えを行えるようにする。
- [ ] `variantSets` を受け取る初期化ラッパー (`createResponsivePlayer`) を `src/index.js` に実装。
- [ ] `public/imgs` 内のディレクトリ構成とアセット命名を更新し README/AGENTS に反映。
- [ ] リサイズデバウンスとイベントリスナーを追加し、メモリリークがないことを手動検証。
- [ ] `npm run build` / `npm run preview` でデスクトップ/モバイル両方の読み込みを確認し、コンソールログを記録。
