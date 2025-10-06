import { SeqImgsPlayer } from './seqimgs-player.js'

/**
 * 異なる画像バリアントをレスポンシブに切り替えるプレイヤーラッパー。
 * @param {Object} options
 * @param {Record<string, { imageNames: string[], publicPath: string }>} options.variants
 * @param {import('./seqimgs-player.js').SeqImgsPlayerOptions} options.playerOptions
 * @param {string} [options.breakpointQuery]
 * @param {number} [options.breakpointWidth]
 * @param {number} [options.debounceMs]
 */
export function createResponsivePlayer ({
  variants,
  playerOptions,
  breakpointQuery,
  breakpointWidth,
  debounceMs
}) {
  // NOTE: createResponsivePlayer は SeqImgsPlayer の生成と破棄を肩代わりし、レスポンシブ切り替え戦略を一箇所に閉じ込める役割を持つ。
  const variantEntries = variants ?? {}
  const variantKeys = Object.keys(variantEntries)
  const availableVariantKeys = variantKeys

  if (variantKeys.length === 0) {
    throw new Error('最小1種類の画像セットを指定してください。')
  }

  // 代表的な desktop/mobile が揃っていればそれらを優先。無い場合は先頭をフォールバックにする。
  const hasDesktopVariant = Object.prototype.hasOwnProperty.call(variantEntries, 'desktop')
  const hasMobileVariant = Object.prototype.hasOwnProperty.call(variantEntries, 'mobile')
  const fallbackVariantKey = hasDesktopVariant
    ? 'desktop'
    : variantKeys[0]

  const effectiveBreakpointQuery = breakpointQuery || '(max-width: 900px)'
  const effectiveBreakpointWidth = Number.isFinite(breakpointWidth)
    ? Number(breakpointWidth)
    : 900
  const effectiveDebounceMs = Number.isFinite(debounceMs)
    ? Number(debounceMs)
    : 150

  // NOTE: matchMedia を優先しつつ、SSR やテスト環境など window サイズ情報しか無いケースもカバーする。

  // 現在のプレイヤー状態と監視用フラグを保持。
  let currentPlayer = null
  let currentVariantKey = null
  let responsiveEnabled = Boolean(playerOptions?.responsiveSwitching)
  let mediaQueryList = null
  let resizeTimerId = null
  let listenersAttached = false
  let switchChain = Promise.resolve()
  const variantListeners = new Set()

  // バリアント変更時にフックへ通知。例外は握りつぶしておく。
  /**
   * バリアント変更時に登録済みリスナーへ通知する。
   * @param {{ player: import('./seqimgs-player.js').SeqImgsPlayer | null, variantKey: string | null }} payload
   */
  const notifyVariantChange = (payload) => {
    for (const listener of variantListeners) {
      try {
        listener(payload)
      } catch (error) {
        console.error('variant listener の呼び出しに失敗しました:', error)
      }
    }
  }

  const isBrowser = typeof window !== 'undefined'
  const supportsMatchMedia = isBrowser && typeof window.matchMedia === 'function'

  if (supportsMatchMedia) {
    mediaQueryList = window.matchMedia(effectiveBreakpointQuery)
  }

  // mediaQuery の結果とフォールバックを統一的に解決。
  /**
   * media query 判定結果をもとに適切なバリアントキーを決定する。
   * @param {boolean} isMobileMatch `(max-width)` がマッチしているかどうか。
   * @returns {string}
   */
  const resolveVariant = (isMobileMatch) => {
    if (isMobileMatch && hasMobileVariant) return 'mobile'
    if (!isMobileMatch && hasDesktopVariant) return 'desktop'
    return fallbackVariantKey
  }

  // ブラウザ判定。非ブラウザ環境ではフォールバックバリアントを返す。
  /**
   * 現在のビューポート幅や media query を評価し、利用すべきバリアントを返す。
   * @returns {string}
   */
  const detectVariant = () => {
    if (!isBrowser) return fallbackVariantKey
    if (mediaQueryList) {
      return resolveVariant(mediaQueryList.matches)
    }
    const viewportWidth = window.innerWidth || 0
    const isMobileWidth = viewportWidth <= effectiveBreakpointWidth
    return resolveVariant(isMobileWidth)
  }

  // 指定バリアントのプレイヤーを生成し、状態を必要に応じて継承する。
  /**
   * 指定されたバリアントでプレイヤーを構築し、必要に応じて状態を引き継ぐ。
   * @param {string} variantKey 切り替え先バリアントのキー。
   * @param {{ preserveState?: boolean }} [options]
   * @returns {Promise<{ player: import('./seqimgs-player.js').SeqImgsPlayer | null, variantKey: string | null }>}
   */
  const mountVariant = async (variantKey, { preserveState } = {}) => {
    if (!variantKey) {
      return { player: currentPlayer, variantKey: currentVariantKey }
    }
    if (variantKey === currentVariantKey && currentPlayer) {
      return { player: currentPlayer, variantKey: currentVariantKey }
    }

    const variantOptions = variantEntries[variantKey]
    if (!variantOptions) {
      console.warn(`未定義のvariant "${variantKey}" が指定されました。`)
      return { player: currentPlayer, variantKey: currentVariantKey }
    }

    const previousPlayer = currentPlayer
    const shouldPreserve = Boolean(preserveState)
    const wasPlaying = shouldPreserve && previousPlayer?.isPlaying === true
    const wasReady = shouldPreserve && previousPlayer?.isReady === true

    // NOTE: destroy() が例外を投げるとチェーン全体が止まるため、例外は握りつぶしてクリーンアップ継続。

    if (previousPlayer) {
      try {
        previousPlayer.destroy()
      } catch (error) {
        console.warn('既存プレイヤーの破棄に失敗しました:', error)
      }
    }

    const nextPlayer = new SeqImgsPlayer({
      ...playerOptions,
      ...variantOptions
    })

    currentPlayer = nextPlayer
    currentVariantKey = variantKey

    if (wasReady) {
      try {
        await nextPlayer.preload()
      } catch (error) {
        console.error('プリロードの再実行に失敗しました:', error)
      }
    }

    if (wasPlaying) {
      nextPlayer.play().catch((error) => {
        console.error('切り替え後の再生再開に失敗しました:', error)
      })
    }

    const payload = { player: nextPlayer, variantKey }
    notifyVariantChange(payload)
    return payload
  }

  // バリアント変更をキューに積み、連打時でも逐次処理されるよう Promise チェーンでつなぐ。
  /**
   * バリアント切り替え処理を直列化し、最後の要求のみが反映されるようキューイングする。
   * @param {string} variantKey 切り替えたいバリアントキー。
   * @param {{ preserveState?: boolean }} [options]
   * @returns {Promise<{ player: import('./seqimgs-player.js').SeqImgsPlayer | null, variantKey: string | null }>}
   */
  const queueVariantChange = (variantKey, options = {}) => {
    switchChain = switchChain
      .catch(() => {})
      .then(() => mountVariant(variantKey, options))

    switchChain = switchChain.catch((error) => {
      console.error('画像バリアントの切り替えに失敗しました:', error)
      return { player: currentPlayer, variantKey: currentVariantKey }
    })

    return switchChain
  }

  // resize/matchMedia のスパムを抑えるためデバウンス付きで切り替え判定。
  /**
   * デバウンス付きで次に選択すべきバリアントを判定し、必要なら切り替えを予約する。
   * @param {{ preserveState?: boolean }} [options]
   */
  const scheduleVariantUpdate = (options = {}) => {
    if (!isBrowser || !responsiveEnabled) return
    window.clearTimeout(resizeTimerId)
    resizeTimerId = window.setTimeout(() => {
      const nextVariant = detectVariant()
      if (nextVariant && nextVariant !== currentVariantKey) {
        queueVariantChange(nextVariant, options)
      }
    }, effectiveDebounceMs)
  }

  const handleMediaChange = () => scheduleVariantUpdate({ preserveState: true })
  const handleResize = () => scheduleVariantUpdate({ preserveState: true })

  // リスナーの二重登録を避けつつ、必要なときだけ `resize` / `matchMedia` を有効化。
  /**
   * `matchMedia` 変更イベントと `window.resize` を監視状態にする。
   */
  const enableListeners = () => {
    if (!isBrowser || listenersAttached) return
    listenersAttached = true
    if (mediaQueryList) {
      if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', handleMediaChange)
      } else if (typeof mediaQueryList.addListener === 'function') {
        mediaQueryList.addListener(handleMediaChange)
      }
    }
    window.addEventListener('resize', handleResize)
  }

  // 監視解除時はタイマーも併せてクリアしメモリリークを防ぐ。
  /**
   * 監視イベントを解除し、保留中のデバウンスタイマーも破棄する。
   */
  const disableListeners = () => {
    if (!isBrowser || !listenersAttached) return
    listenersAttached = false
    window.clearTimeout(resizeTimerId)
    if (mediaQueryList) {
      if (typeof mediaQueryList.removeEventListener === 'function') {
        mediaQueryList.removeEventListener('change', handleMediaChange)
      } else if (typeof mediaQueryList.removeListener === 'function') {
        mediaQueryList.removeListener(handleMediaChange)
      }
    }
    window.removeEventListener('resize', handleResize)
  }

  if (isBrowser) {
    switchChain = mountVariant(detectVariant(), { preserveState: false }).catch((error) => {
      console.error('初期バリアントの設定に失敗しました:', error)
      return { player: currentPlayer, variantKey: currentVariantKey }
    })
    if (responsiveEnabled) {
      // NOTE: 初期マウント時に responsiveSwitching が有効ならリスナーを同時に登録し、外部からの制御と整合性を取る。
      enableListeners()
    }
  }

  // 任意バリアントへ即時切り替え。存在しないキーは警告して無視。
  /**
   * 指定したバリアントへ強制的に切り替える。
   * @param {string} variantKey 切り替え対象のバリアントキー。
   * @param {{ preserveState?: boolean }} [options]
   * @returns {Promise<{ player: import('./seqimgs-player.js').SeqImgsPlayer | null, variantKey: string | null }>}
   */
  const forceVariant = (variantKey, options = {}) => {
    if (!variantEntries[variantKey]) {
      console.warn(`forceVariant: 未定義のvariant "${variantKey}" が指定されました。`)
      return Promise.resolve({ player: currentPlayer, variantKey: currentVariantKey })
    }
    return queueVariantChange(variantKey, options)
  }

  // 用意された順番で次のバリアントへローテーション。
  /**
   * バリアント配列の次要素へ巡回的に切り替える。
   * @returns {Promise<{ player: import('./seqimgs-player.js').SeqImgsPlayer | null, variantKey: string | null }>}
   */
  const cycleVariant = () => {
    if (!availableVariantKeys.length) {
      return Promise.resolve({ player: currentPlayer, variantKey: currentVariantKey })
    }
    const currentIndex = availableVariantKeys.indexOf(currentVariantKey)
    const nextIndex = currentIndex >= 0
      ? (currentIndex + 1) % availableVariantKeys.length
      : 0
    const nextVariantKey = availableVariantKeys[nextIndex]
    return forceVariant(nextVariantKey, { preserveState: true })
  }

  return {
    getPlayer: () => currentPlayer,
    getVariant: () => currentVariantKey,
    getVariants: () => [...availableVariantKeys],
    onVariantChange (listener) {
      if (typeof listener !== 'function') {
        return () => {}
      }
      variantListeners.add(listener)
      if (currentVariantKey) {
        listener({ player: currentPlayer, variantKey: currentVariantKey })
      }
      return () => {
        variantListeners.delete(listener)
      }
    },
    setResponsiveSwitching (enabled) {
      const nextEnabled = Boolean(enabled)
      if (nextEnabled === responsiveEnabled) return
      responsiveEnabled = nextEnabled
      if (responsiveEnabled) {
        // NOTE: リアルタイムで responsiveSwitching を切り替えるユースケース（例: 管理画面での手動操作）を想定し、再度レスポンシブ判定を走らせる。
        enableListeners()
        scheduleVariantUpdate({ preserveState: true })
      } else {
        disableListeners()
      }
    },
    forceVariant,
    cycleVariant
  }
}
