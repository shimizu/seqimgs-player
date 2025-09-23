/**
 * @typedef {Object} SeqImgsPlayerOptions
 * @property {string} mountId 再生領域となる要素のID。
 * @property {string[]} imageNames 拡張子を除いた連番画像ファイル名の配列。
 * @property {string} [extension] 画像拡張子 (例: `jpeg`)。
 * @property {number} [interval] フレーム間隔（ミリ秒）。
 * @property {boolean} [loop] 最後まで再生後に先頭へ戻るかどうか。
 * @property {string} [publicPath] 画像ディレクトリのパス。
 * @property {boolean} [autoPlay] プリロード完了後に自動再生するかどうか。
 */

/**
 * seqimgs-player 用の既定オプション。
 * @type {{extension: string, interval: number, loop: boolean, publicPath: string, autoPlay: boolean}}
 */
const DEFAULT_OPTIONS = {
  extension: 'jpeg',
  interval: 100,
  loop: true,
  publicPath: '/imgs/',
  autoPlay: true
}

/**
 * 連番画像を指定要素内で再生するプレイヤークラス。
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

    /** @type {HTMLImageElement} */
    this.imageEl = document.createElement('img')
    this.imageEl.decoding = 'async'
    this.imageEl.loading = 'eager'

    this.mountEl.innerHTML = ''
    this.mountEl.appendChild(this.imageEl)

    /** @type {number} */
    this.currentIndex = 0
    /** @type {boolean} */
    this.isPlaying = false
    /** @type {boolean} */
    this.isReady = false
    /** @type {number | null} */
    this.timerId = null
    /** @type {Promise<HTMLImageElement[]> | null} */
    this.preloadPromise = null
    /** @type {HTMLImageElement[]} */
    this.preloadedImages = []

    if (this.options.autoPlay) {
      this.preload()
        .then(() => this.play())
        .catch((error) => {
          console.error('自動再生に失敗しました:', error)
        })
    }
  }

  /**
   * 画像を事前に読み込み、準備が整ったらフラグを立てる。
   * @returns {Promise<void>} プリロード完了を表す Promise。
   */
  async preload () {
    if (this.isReady) {
      return
    }

    if (!this.preloadPromise) {
      this.preloadPromise = Promise.all(
        this.options.imageNames.map((name) => this.#preloadImage(name))
      )
    }

    try {
      this.preloadedImages = await this.preloadPromise
      this.isReady = true
      if (this.preloadedImages.length) {
        this.#setFrame(0)
      }
    } catch (error) {
      this.preloadPromise = null
      throw error
    }
  }

  /**
   * 全画像が読み込まれるまで待機してから再生を開始する。
   * @returns {Promise<void>} 再生開始時に解決する Promise。
   */
  async play () {
    if (this.isPlaying) {
      return
    }

    await this.#ensureReady()
    if (this.preloadPromise) {
      await this.preloadPromise
    }

    if (!this.preloadedImages.length) {
      console.warn('再生可能な画像が見つかりません。')
      return
    }

    this.isPlaying = true
    this.#setFrame(this.currentIndex)

    this.timerId = window.setInterval(() => {
      this.#advanceFrame()
    }, this.options.interval)
  }

  /**
   * 再生を一時停止する。
   */
  pause () {
    if (!this.isPlaying) {
      return
    }

    if (this.timerId !== null) {
      clearInterval(this.timerId)
      this.timerId = null
    }

    this.isPlaying = false
  }

  /**
   * 再生を停止し、最初のフレームに戻す。
   */
  stop () {
    this.pause()
    this.currentIndex = 0
    if (this.isReady && this.preloadedImages.length) {
      this.#setFrame(0)
    } else {
      this.imageEl.removeAttribute('src')
    }
  }

  /**
   * 再生速度を更新する。再生中は即時反映する。
   * @param {number} intervalMs フレーム間隔（ミリ秒）。
   */
  setSpeed (intervalMs) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      console.warn('setSpeed: 正の数値を指定してください。')
      return
    }

    this.options.interval = intervalMs
    if (this.isPlaying) {
      this.pause()
      this.play().catch((error) => {
        console.error('再生速度変更後の再生に失敗しました:', error)
      })
    }
  }

  /**
   * ループ設定を切り替える。
   * @param {boolean} shouldLoop ループ再生するかどうか。
   */
  setLoop (shouldLoop) {
    this.options.loop = Boolean(shouldLoop)
  }

  /**
   * プレイヤーが使用した DOM を解放する。
   */
  dispose () {
    this.stop()
    this.mountEl.innerHTML = ''
    this.preloadedImages = []
    this.preloadPromise = null
    this.isReady = false
  }

  /**
   * プリロード完了を保証する。
   * @returns {Promise<void>} プリロード完了を待つ Promise。
   */
  async #ensureReady () {
    if (!this.isReady) {
      await this.preload()
    }
  }

  /**
   * フレームを1つ進め、必要に応じてループする。
   */
  #advanceFrame () {
    if (!this.preloadedImages.length) {
      return
    }

    let nextIndex = this.currentIndex + 1
    if (nextIndex >= this.preloadedImages.length) {
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
   * 指定インデックスのフレームを表示する。
   * @param {number} index 表示するインデックス。
   */
  #setFrame (index) {
    if (!this.preloadedImages[index]) {
      return
    }
    this.currentIndex = index
    this.imageEl.src = this.preloadedImages[index].src
  }

  /**
   * 単一画像を非同期にプリロードする。
   * @param {string} name 拡張子を除いたファイル名。
   * @returns {Promise<HTMLImageElement>} 読み込まれた Image インスタンス。
   */
  #preloadImage (name) {
    const url = this.#buildUrl(name)
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
   * ファイル名から完全な URL を生成する。
   * @param {string} name 拡張子を除いたファイル名。
   * @returns {string} 生成された URL。
   */
  #buildUrl (name) {
    return `${this.options.publicPath}${name}.${this.options.extension}`
  }

  /**
   * オプションを既定値とマージし、整形する。
   * @param {SeqImgsPlayerOptions} options ユーザー指定のオプション。
   * @returns {SeqImgsPlayerOptions} マージ済みオプション。
   */
  #mergeOptions (options) {
    const merged = {
      ...DEFAULT_OPTIONS,
      ...(options || {})
    }

    merged.publicPath = this.#normalizePublicPath(merged.publicPath)
    merged.interval = this.#normalizeInterval(merged.interval)

    return merged
  }

  /**
   * オプションの妥当性を確認する。
   * @param {SeqImgsPlayerOptions} options 検証対象のオプション。
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
   * @param {string} path 正規化前のパス。
   * @returns {string} 正規化済みパス。
   */
  #normalizePublicPath (path) {
    if (typeof path !== 'string' || path.length === 0) {
      return DEFAULT_OPTIONS.publicPath
    }
    return path.endsWith('/') ? path : `${path}/`
  }

  /**
   * インターバル値を正の整数へ正規化する。
   * @param {number} intervalMs 入力されたインターバル。
   * @returns {number} 正規化済みインターバル。
   */
  #normalizeInterval (intervalMs) {
    const parsed = Number(intervalMs)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_OPTIONS.interval
    }
    return parsed
  }
}
