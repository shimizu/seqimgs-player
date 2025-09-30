import './index.scss'
import { SeqImgsPlayer } from './seqimgs-player.js'

const imageNames = Array.from({ length: 101 }, (_, index) => `takasaki_${String(index).padStart(4, '0')}`)

const VARIANT_BREAKPOINT_QUERY = '(max-width: 900px)'
const VARIANT_BREAKPOINT_WIDTH = 900
const RESIZE_DEBOUNCE_MS = 150

const variantSets = {
  desktop: {
    imageNames,
    publicPath: './imgs/desktop/'
  },
  mobile: {
    imageNames,
    publicPath: './imgs/mobile/'
  }
}

const basePlayerOptions = {
  mountId: 'player',
  extension: 'jpeg',
  interval: 80,
  loop: true,
  autoPlay: false,
  responsiveSwitching: true
}

const responsiveController = createResponsivePlayer({
  variants: variantSets,
  playerOptions: basePlayerOptions,
  breakpointQuery: VARIANT_BREAKPOINT_QUERY,
  breakpointWidth: VARIANT_BREAKPOINT_WIDTH,
  debounceMs: RESIZE_DEBOUNCE_MS
})

const viewportElement = document.getElementById(basePlayerOptions.mountId)?.closest('.demo__viewport')
const resizeButton = document.getElementById('resize-button')

responsiveController.onVariantChange(({ variantKey }) => {
  if (viewportElement) {
    viewportElement.setAttribute('data-variant', variantKey || '')
  }
  if (resizeButton) {
    resizeButton.dataset.variant = variantKey || ''
    resizeButton.textContent = variantKey ? `サイズ変更 (${variantKey})` : 'サイズ変更'
  }
})

/**
 * 指定IDのボタンを初期化するユーティリティ。
 * @param {string} id ボタン要素のID。
 * @param {(button: HTMLButtonElement) => void} initializeButton 初期化処理。
 */
function setupButton (id, initializeButton) {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLButtonElement)) {
    console.warn(`${id} ボタンが見つかりませんでした。`)
    return
  }
  initializeButton(element)
}

setupButton('preload-button', (button) => {
  button.addEventListener('click', async () => {
    const player = responsiveController.getPlayer()
    if (!player) {
      console.warn('プレイヤーが初期化されていません。')
      return
    }
    button.disabled = true
    const originalLabel = button.textContent ?? 'プリロード'
    button.textContent = 'プリロード中...'

    try {
      await player.preload()
      button.textContent = 'プリロード完了'
    } catch (error) {
      console.error('プリロードに失敗しました:', error)
      button.textContent = 'プリロード失敗'
    } finally {
      setTimeout(() => {
        button.textContent = originalLabel
        button.disabled = false
      }, 600)
    }
  })
})

setupButton('play-button', (button) => {
  button.addEventListener('click', async () => {
    const player = responsiveController.getPlayer()
    if (!player) {
      console.warn('プレイヤーが初期化されていません。')
      return
    }
    button.disabled = true
    const originalLabel = button.textContent ?? '再生'
    button.textContent = '再生準備中...'

    try {
      await player.play()
      button.textContent = '再生中'
    } catch (error) {
      console.error('再生に失敗しました:', error)
      button.textContent = '再生失敗'
    } finally {
      setTimeout(() => {
        button.textContent = originalLabel
        button.disabled = false
      }, 400)
    }
  })
})

setupButton('pause-button', (button) => {
  button.addEventListener('click', () => {
    const player = responsiveController.getPlayer()
    if (!player) {
      console.warn('プレイヤーが初期化されていません。')
      return
    }
    player.pause()
  })
})

setupButton('stop-button', (button) => {
  button.addEventListener('click', () => {
    const player = responsiveController.getPlayer()
    if (!player) {
      console.warn('プレイヤーが初期化されていません。')
      return
    }
    player.stop()
  })
})

setupButton('resize-button', (button) => {
  button.addEventListener('click', async () => {
    try {
      await responsiveController.cycleVariant()
    } catch (error) {
      console.error('サイズ変更に失敗しました:', error)
    }
  })
})

function createResponsivePlayer ({
  variants,
  playerOptions,
  breakpointQuery,
  breakpointWidth,
  debounceMs
}) {
  const variantEntries = variants ?? {}
  const variantKeys = Object.keys(variantEntries)
  const availableVariantKeys = variantKeys

  if (variantKeys.length === 0) {
    throw new Error('最小1種類の画像セットを指定してください。')
  }

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

  let currentPlayer = null
  let currentVariantKey = null
  let responsiveEnabled = Boolean(playerOptions?.responsiveSwitching)
  let mediaQueryList = null
  let resizeTimerId = null
  let listenersAttached = false
  let switchChain = Promise.resolve()
  const variantListeners = new Set()

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

  const resolveVariant = (isMobileMatch) => {
    if (isMobileMatch && hasMobileVariant) return 'mobile'
    if (!isMobileMatch && hasDesktopVariant) return 'desktop'
    return fallbackVariantKey
  }

  const detectVariant = () => {
    if (!isBrowser) return fallbackVariantKey
    if (mediaQueryList) {
      return resolveVariant(mediaQueryList.matches)
    }
    const viewportWidth = window.innerWidth || 0
    const isMobileWidth = viewportWidth <= effectiveBreakpointWidth
    return resolveVariant(isMobileWidth)
  }

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
      enableListeners()
    }
  }

  const forceVariant = (variantKey, options = {}) => {
    if (!variantEntries[variantKey]) {
      console.warn(`forceVariant: 未定義のvariant "${variantKey}" が指定されました。`)
      return Promise.resolve({ player: currentPlayer, variantKey: currentVariantKey })
    }
    return queueVariantChange(variantKey, options)
  }

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
