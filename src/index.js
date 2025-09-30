import './index.scss'
import { createResponsivePlayer } from './responsive-player.js'

// デモ用フレーム名を 0 埋めで生成。デスクトップ/モバイル双方で同じ連番を利用する。
const imageNames = Array.from({ length: 101 }, (_, index) => `takasaki_${String(index).padStart(4, '0')}`)

const VARIANT_BREAKPOINT_QUERY = '(max-width: 900px)'
const VARIANT_BREAKPOINT_WIDTH = 900
const RESIZE_DEBOUNCE_MS = 150

// ブレークポイントごとに読み込む画像ディレクトリを切り替える設定。
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

// プレイヤーに共通で渡すオプション。レスポンシブ切替はラッパーが制御する。
const basePlayerOptions = {
  mountId: 'player',
  extension: 'webp',
  interval: 80,
  loop: true,
  autoPlay: false,
  responsiveSwitching: true
}

// レスポンシブ制御付きプレイヤーを生成し、以降はコントローラー経由で操作する。
const responsiveController = createResponsivePlayer({
  variants: variantSets,
  playerOptions: basePlayerOptions,
  breakpointQuery: VARIANT_BREAKPOINT_QUERY,
  breakpointWidth: VARIANT_BREAKPOINT_WIDTH,
  debounceMs: RESIZE_DEBOUNCE_MS
})

// ビューポートとリサイズボタンの表示を現在のバリアントに合わせて更新。
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
