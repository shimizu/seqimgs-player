import './index.scss'
import { SeqImgsPlayer } from './seqimgs-player.js'

const imageNames = Array.from({ length: 101 }, (_, index) => `takasaki_${String(index).padStart(4, '0')}`)

const player = new SeqImgsPlayer({
  mountId: 'player',
  imageNames,
  extension: 'jpeg',
  interval: 80,
  loop: true,
  publicPath: '/imgs/',
  autoPlay: false
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
    player.pause()
  })
})

setupButton('stop-button', (button) => {
  button.addEventListener('click', () => {
    player.stop()
  })
})
