/**
 * @typedef {Object} SeqImgsPlayerOptions
 * @property {string} mountId 再生領域となる要素のID。
 * @property {string[]} imageNames 拡張子を除いた連番画像ファイル名の配列。
 * @property {string} [extension] 画像拡張子 (例: `webp`/`avif`/`jpeg`)。
 * @property {number} [interval] フレーム間隔（ミリ秒）。
 * @property {boolean} [loop] 最後まで再生後に先頭へ戻るかどうか。
 * @property {string} [publicPath] 画像ディレクトリのパス。
 * @property {boolean} [autoPlay] プリロード完了後に自動再生するかどうか。
 * @property {'canvas'|'img'} [renderTarget] 描画先。既定は 'canvas'（フリッカー低減）。
 * @property {number} [fps] interval の代わりに FPS 指定も可能（優先度: fps > interval）。
 * @property {boolean} [responsiveSwitching] リサイズ連動切替を想定したラッパー向けフラグ。
 */

/**
 * seqimgs-player 用の既定オプション。
 * 重要: 1) 事前デコード（decode or createImageBitmap）
 *       2) Canvas描画 + rAF でフリッカー/ティア軽減
 *       3) fetch(cache:'force-cache') でHTTPキャッシュも活用
 */
const DEFAULT_OPTIONS = {
  extension: 'webp',
  interval: 100,
  loop: true,
  publicPath: '/imgs/',
  autoPlay: true,
  renderTarget: 'canvas',
  fps: undefined,
  responsiveSwitching: false
}

/**
 * 連番画像を指定要素内で再生するプレイヤークラス。
 * 点滅防止のため:
 *  - 再生開始前に全フレームを decode 済みにする
 *  - 可能なら createImageBitmap でビットマップ化
 *  - 描画は <img> の src 切替ではなく <canvas> へ描画
 */
export class SeqImgsPlayer {
  /**
   * @param {SeqImgsPlayerOptions} options プレイヤー設定オブジェクト。
   */
  constructor (options) {
    this.options = this.#mergeOptions(options)
    this.#validateOptions(this.options)

    /** @type {HTMLElement} */
    this.mountEl = document.getElementById(this.options.mountId)
    if (!this.mountEl) {
      throw new Error(`mountId="${this.options.mountId}" の要素が見つかりません。`)
    }

    // --- 描画ターゲット準備（既定: canvas） ---
    /** @type {HTMLCanvasElement | null} */
    this.canvasEl = null
    /** @type {CanvasRenderingContext2D | null} */
    this.ctx = null
    /** @type {HTMLImageElement | null} */
    this.imageEl = null

    this.mountEl.innerHTML = ''

    if (this.options.renderTarget === 'canvas') {
      this.canvasEl = document.createElement('canvas')
      // 合成レイヤー化でティア抑制
      this.canvasEl.style.willChange = 'transform, opacity'
      this.canvasEl.style.display = 'block'
      this.canvasEl.style.width = '100%'
      this.canvasEl.style.height = 'auto'
      this.mountEl.appendChild(this.canvasEl)
      this.ctx = this.canvasEl.getContext('2d', { alpha: false })
    } else {
      this.imageEl = document.createElement('img')
      this.imageEl.decoding = 'async'
      this.imageEl.loading = 'eager'
      this.imageEl.style.display = 'block'
      this.imageEl.style.willChange = 'opacity'
      this.mountEl.appendChild(this.imageEl)
    }

    /** @type {number} */
    this.currentIndex = 0
    /** @type {boolean} */
    this.isPlaying = false
    /** @type {boolean} */
    this.isReady = false
    /** @type {number | null} */
    this.timerId = null // 互換性のため残すが rAF を使用
    /** @type {Promise<(ImageBitmap|HTMLImageElement)[]> | null} */
    this.preloadPromise = null
    /** @type {(ImageBitmap|HTMLImageElement)[]} */
    this.preloadedFrames = []
    /** @type {number} */
    this._frameInterval = 1000 / (this.options.fps || (1000 / this.options.interval))
    /** @type {number} */
    this._accumulator = 0
    /** @type {number} */
    this._lastTs = 0
    /** @type {number | null} */
    this._rafId = null

    if (this.options.autoPlay) {
      this.preload()
        .then(() => this.play())
        .catch((error) => {
          console.error('自動再生に失敗しました:', error)
        })
    }
  }

  /**
   * 画像を事前に読み込み、decode/bitmap化まで完了してから準備完了フラグを立てる。
   * @returns {Promise<void>}
   */
  async preload () {
    if (this.isReady) return

    if (!this.preloadPromise) {
      // createImageBitmap が使えるならビットマップで保持（描画高速・フリッカー抑制）
      const useBitmap = typeof createImageBitmap === 'function'
      this.preloadPromise = Promise.all(
        this.options.imageNames.map((name) => this.#preloadFrame(name, useBitmap))
      )
    }

    try {
      this.preloadedFrames = await this.preloadPromise
      this.isReady = true

      // 最初のフレームでキャンバスサイズを確定しておく（レイアウトシェイク防止）
      const first = this.preloadedFrames[0]
      if (first) {
        const { width, height } = await this.#frameSize(first)
        if (this.canvasEl) {
          // デバイスピクセル比に合わせて内部解像度を確保（にじみ/ちらつき低減）
          const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
          this.canvasEl.width = Math.round(width * dpr)
          this.canvasEl.height = Math.round(height * dpr)
          this.canvasEl.style.aspectRatio = `${width} / ${height}`
          if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
        // 1枚目を即座に描画/表示
        this.#setFrame(0)
      }
    } catch (error) {
      this.preloadPromise = null
      throw error
    }
  }

  /**
   * 全画像がデコードされるまで待機してから再生を開始する。
   * @returns {Promise<void>}
   */
  async play () {
    if (this.isPlaying) return

    await this.#ensureReady()
    if (this.preloadPromise) await this.preloadPromise
    if (!this.preloadedFrames.length) {
      console.warn('再生可能なフレームが見つかりません。')
      return
    }

    this.isPlaying = true
    this._lastTs = performance.now()
    const animate = (ts) => {
      if (!this.isPlaying) return
      const dt = ts - this._lastTs
      this._lastTs = ts
      this._accumulator += dt

      while (this._accumulator >= this._frameInterval) {
        this._accumulator -= this._frameInterval
        this.#advanceFrame()
      }
      this._rafId = requestAnimationFrame(animate)
    }
    // 再生開始時に現在フレームを描画
    this.#setFrame(this.currentIndex)
    this._rafId = requestAnimationFrame(animate)
  }

  /**
   * 一時停止。
   */
  pause () {
    if (!this.isPlaying) return
    this.isPlaying = false
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
    if (this.timerId !== null) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  }

  /**
   * 停止して先頭フレームへ。
   */
  stop () {
    this.pause()
    this.currentIndex = 0
    if (this.isReady && this.preloadedFrames.length) {
      this.#setFrame(0)
    } else {
      if (this.imageEl) this.imageEl.removeAttribute('src')
      if (this.ctx && this.canvasEl) {
        this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height)
      }
    }
  }

  /**
   * 再生速度（FPS/interval）を更新。再生中は無停止で反映。
   * @param {number} intervalMs フレーム間隔（ミリ秒）。
   */
  setSpeed (intervalMs) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      console.warn('setSpeed: 正の数値を指定してください。')
      return
    }
    this.options.interval = intervalMs
    this.options.fps = undefined
    this._frameInterval = intervalMs
  }

  /**
   * FPS指定のインターフェースも提供。
   * @param {number} fps
   */
  setFps (fps) {
    if (!Number.isFinite(fps) || fps <= 0) {
      console.warn('setFps: 正の数値を指定してください。')
      return
    }
    this.options.fps = fps
    this._frameInterval = 1000 / fps
  }

  /**
   * ループ切替。
   * @param {boolean} shouldLoop
   */
  setLoop (shouldLoop) {
    this.options.loop = Boolean(shouldLoop)
  }

  /**
   * DOMとメモリを解放。
   */
  dispose () {
    this.stop()
    this.mountEl.innerHTML = ''
    // ImageBitmap は close() してGPUメモリを解放
    for (const f of this.preloadedFrames) {
      if ('close' in f && typeof f.close === 'function') {
        try { f.close() } catch {}
      }
    }
    this.preloadedFrames = []
    this.preloadPromise = null
    this.isReady = false
    this.canvasEl = null
    this.ctx = null
    this.imageEl = null
  }

  /**
   * dispose のエイリアス。既存APIとの互換用に提供。
   */
  destroy () {
    this.dispose()
  }

  /**
   * プリロード完了を保証。
   * @returns {Promise<void>}
   */
  async #ensureReady () {
    if (!this.isReady) {
      await this.preload()
    }
  }

  /**
   * フレームを1つ進め、必要ならループ。
   */
  #advanceFrame () {
    if (!this.preloadedFrames.length) return
    let nextIndex = this.currentIndex + 1
    if (nextIndex >= this.preloadedFrames.length) {
      if (this.options.loop) {
        nextIndex = 0
      } else {
        this.pause()
        return
      }
    }
    this.currentIndex = nextIndex
    this.#setFrame(this.currentIndex)
  }

  /**
   * 指定インデックスのフレームを表示/描画する。
   * @param {number} index
   */
  #setFrame (index) {
    const frame = this.preloadedFrames[index]
    if (!frame) return
    this.currentIndex = index

    if (this.ctx && this.canvasEl) {
      // キャンバス描画（ちらつき最小）
      const { width, height } = this.canvasEl
      // 内部ピクセルはdpr適用済みのため draw サイズは CSSピクセルでOK
      // ただし setTransform で拡縮済。ここでは 0,0,width/dpr,height/dpr 風に描画される。
      this.ctx.clearRect(0, 0, width, height)
      if (frame instanceof ImageBitmap) {
        this.ctx.drawImage(frame, 0, 0, width, height)
      } else {
        this.ctx.drawImage(frame, 0, 0, width, height)
      }
    } else if (this.imageEl) {
      // 従来の <img> 切替（decode 済みなのでフリッカーを最小化）
      // src を直接差し替える代わりに、同一オブジェクトURL/同一srcでの再解決を避ける
      if (frame instanceof ImageBitmap) {
        // ImageBitmap は <img>.src に直接入れられないため、描画は canvas 推奨
        console.warn('renderTarget: "img" では ImageBitmap を直接表示できません。canvas を使用してください。')
      } else {
        this.imageEl.src = frame.src
      }
    }
  }

  /**
   * 単一フレームをプリロード（fetch→blob→createImageBitmap or Image.decode）。
   * @param {string} name 拡張子を除いたファイル名。
   * @param {boolean} useBitmap createImageBitmap を使うか。
   * @returns {Promise<ImageBitmap|HTMLImageElement>}
   */
  async #preloadFrame (name, useBitmap) {
    const url = this.#buildUrl(name)

    // HTTPキャッシュを積極活用。リソース名はハッシュ付き前提だと長期キャッシュ可。
    // fetch失敗時は <img> 経由にフォールバック。
    try {
      const res = await fetch(url, { cache: 'force-cache', credentials: 'same-origin' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()

      if (useBitmap) {
        // 高速描画用にビットマップ化（既にデコード済みのため、表示時の点滅リスク低）
        return await createImageBitmap(blob)
      } else {
        // 互換経路: HTMLImageElement で decode 完了まで待機
        const objectUrl = URL.createObjectURL(blob)
        const img = new Image()
        img.decoding = 'async'
        const onCleanup = () => { try { URL.revokeObjectURL(objectUrl) } catch {} }
        try {
          await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = () => reject(new Error(`画像の読み込みに失敗: ${url}`))
            img.src = objectUrl
          })
          if (typeof img.decode === 'function') {
            // decode() は load 後でも非同期にピクセルデコードを保証
            await img.decode()
          }
          return img
        } finally {
          // src に実URLを設定し直しておく（オブジェクトURLは後で破棄）
          img.src = url
          onCleanup()
        }
      }
    } catch (e) {
      // fetch が使えない状況等では <img> 経由にフォールバック
      return await this.#preloadViaImage(url)
    }
  }

  /**
   * <img> 経由でプリロード（decode 完了まで待機）。
   * @param {string} url
   * @returns {Promise<HTMLImageElement>}
   */
  #preloadViaImage (url) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = async () => {
        try {
          if (typeof img.decode === 'function') {
            await img.decode()
          }
        } catch (error) {
          console.warn('decode に失敗しましたが処理を継続します:', error)
        }
        resolve(img)
      }
      img.onerror = () => reject(new Error(`画像の読み込みに失敗しました: ${url}`))
      img.src = url
    })
  }

  /**
   * フレームの自然サイズを取得。
   * @param {ImageBitmap|HTMLImageElement} frame
   */
  async #frameSize (frame) {
    if (frame instanceof ImageBitmap) {
      return { width: frame.width, height: frame.height }
    } else {
      // 既に load/decode 済み前提
      return { width: frame.naturalWidth, height: frame.naturalHeight }
    }
  }

  /**
   * ファイル名から完全な URL を生成する。
   * @param {string} name 拡張子を除いたファイル名。
   * @returns {string}
   */
  #buildUrl (name) {
    return `${this.options.publicPath}${name}.${this.options.extension}`
  }

  /**
   * オプションを既定値とマージし、整形する。
   * @param {SeqImgsPlayerOptions} options
   * @returns {SeqImgsPlayerOptions}
   */
  #mergeOptions (options) {
    const merged = {
      ...DEFAULT_OPTIONS,
      ...(options || {})
    }

    merged.publicPath = this.#normalizePublicPath(merged.publicPath)
    // fps があれば優先、なければ interval を正規化
    if (merged.fps != null && Number.isFinite(Number(merged.fps)) && Number(merged.fps) > 0) {
      merged.fps = Number(merged.fps)
      merged.interval = 1000 / merged.fps
    } else {
      merged.interval = this.#normalizeInterval(merged.interval)
    }

    if (merged.renderTarget !== 'canvas' && merged.renderTarget !== 'img') {
      merged.renderTarget = DEFAULT_OPTIONS.renderTarget
    }

    return merged
  }

  /**
   * オプションの妥当性を確認する。
   * @param {SeqImgsPlayerOptions} options
   */
  #validateOptions (options) {
    if (!options.mountId) {
      throw new Error('mountId を指定してください。')
    }
    if (!Array.isArray(options.imageNames) || options.imageNames.length === 0) {
      throw new Error('imageNames には1件以上のファイル名を指定してください。')
    }
    if (!options.extension) {
      throw new Error('extension を指定してください。')
    }
  }

  /**
   * publicPath を末尾スラッシュ付きで正規化する。
   * @param {string} path
   * @returns {string}
   */
  #normalizePublicPath (path) {
    if (typeof path !== 'string' || path.length === 0) {
      return DEFAULT_OPTIONS.publicPath
    }
    return path.endsWith('/') ? path : `${path}/`
  }

  /**
   * インターバル値を正の数へ正規化する。
   * @param {number} intervalMs
   * @returns {number}
   */
  #normalizeInterval (intervalMs) {
    const parsed = Number(intervalMs)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_OPTIONS.interval
    }
    return parsed
  }
}
