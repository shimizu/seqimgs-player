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

player.preload();

const playButton = document.getElementById('play-button')

if (playButton) {
  playButton.addEventListener('click', async () => {
    playButton.disabled = true
    try {
      await player.preload()
      await player.play()
    } catch (error) {
      console.error('再生に失敗しました:', error)
    } finally {
      playButton.disabled = false
    }
  })
}
