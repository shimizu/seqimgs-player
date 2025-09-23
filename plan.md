# seqimgs-player 実装計画

## 1. ゴールと要件整理
- `seqimgs-player.js` にプレイヤークラス（仮名: `SeqImgsPlayer`）を実装し、指定したDOM要素内で連番画像を再生できるようにする。
- オプションで以下を制御: 画像拡張子、再生速度(ms)、ファイル名配列、ループ可否、プリロード完了待機。
- 複数インスタンスが干渉せず動作する設計にする。

## 2. ファイル構成・エクスポート方針
- `src/seqimgs-player.js` を新規作成。ES Module として `export class SeqImgsPlayer` を提供。
- 使用側 (`index.js`) からインスタンス化できるようにし、既存コードとの統合ポイントを明確化。

### 想定インポート例
```js
import { SeqImgsPlayer } from './seqimgs-player.js';

const player = new SeqImgsPlayer({
  mountId: 'player',
  imageNames: ['takasaki_0000', 'takasaki_0001'],
  extension: 'jpeg',
  interval: 120,
  loop: true
});
await player.preload();
player.play();
```

## 3. オプション設計
- `mountId: string` (必須) — 再生対象の DOM 要素 ID。
- `imageNames: string[]` (必須) — 拡張子を除いたファイル名配列。
- `extension: string` (任意, 既定値: `jpeg`) — 拡張子。
- `interval: number` (任意, 既定値: `100`ms) — 各フレーム間隔。
- `loop: boolean` (任意, 既定値: `true`) — ループ再生。
- `publicPath: string` (任意, 既定値: `/imgs/`) — 画像ルート。
- `autoPlay: boolean` (任意, 既定値: `true`) — コンストラクタ内で `preload()` 完了後に自動で `play()` を実行。手動制御したい場合は `false`。

> **TODO**: オプション検証とデフォルトマージ用のヘルパ関数を実装する。

## 4. プリロード戦略
- 画像ごとに `new Image()` を作成し、`image.src = buildUrl(name)` で読み込み。
- `Promise` を返す `preloadImage(name)` を用意。`load`/`error` イベントで解決。
- `player.preload()` メソッドを公開し、全画像の `Promise` を `Promise.all` で待機してから `this.preloadedImages` に格納。戻り値は `Promise<void>`。
- `play()` 実行時にも `this.isReady` を確認し、未準備なら `await this.preload()` を内部呼び出しして再生を開始。

### 疑似コード
```js
async preload() {
  if (!this.preloadPromise) {
    this.preloadPromise = Promise.all(
      this.options.imageNames.map(name => this.preloadImage(name))
    );
  }
  this.preloadedImages = await this.preloadPromise;
  this.isReady = true;
}
```

## 5. 再生ロジック
- `play()` で `this.timerId = setInterval(() => this.showNextFrame(), interval)`。
- `pause()` / `stop()` を用意して制御しやすくする。
- `showNextFrame()` は `this.currentIndex` を更新し、`<img>` 要素の `src` を差し替え。
- DOM 生成: mount 要素内に `<img>` を1枚だけ作成し、全てのフレームをそこに表示。

### インデックス制御
```js
showNextFrame() {
  const { imageNames, loop } = this.options;
  this.currentIndex = (this.currentIndex + 1);
  if (this.currentIndex >= imageNames.length) {
    if (loop) {
      this.currentIndex = 0;
    } else {
      this.pause();
      return;
    }
  }
  this.imageEl.src = this.preloadedImages[this.currentIndex].src;
}
```

## 6. 複数インスタンス対応
- インスタンスごとに `options`, `preloadPromise`, `timerId`, `imageEl` などの状態を保持し、`static` 共有を避ける。
- イベントリスナーや `setInterval` は `clearInterval` で適切にクリーンアップ。

## 7. エラーハンドリング
- 拡張子やファイル名配列が不正な場合は `throw new Error` で即座に通知。
- プリロード中のエラーは `Promise.all` が reject するため、`play()` で `try/catch` を置き、コンソールへエラー表示＆再生停止。

## 8. 追加インターフェース検討
- 公開APIとして `play()`, `pause()`, `stop()`, `preload()` を提供し、利用者が任意タイミングで制御できるようにする。
- `setSpeed(ms)` や `setLoop(bool)` を追加し、再生中に変更可能にする。
- 仕様が固まってから後続対応するため今回は TODO コメントで明示。

## 9. 動作確認プラン
1. 既存の `#player` 要素でプレイヤーを起動し、開発サーバー (`npm run dev`) 上で連番再生を確認。
2. `loop: false` に設定し、最後の画像で停止することを確認。
3. プリロードが完了するまで `play()` を呼ばず待機すること、およびネットワーク遅延を想定して `setTimeout` などで擬似的に確認。
4. 異なる `mountId` で 2 インスタンスを生成し、同時再生しても干渉しないことを確認。

## 10. 今後の拡張メモ
- 再生コントローラ（再生/停止ボタン）を UI として提供する。
- FPS 指定や可変速再生への対応。
- 画像プリロード進捗をイベントで通知し、ローディング表示に利用。
