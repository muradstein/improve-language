/**
 * One shared <audio> element. iOS only lets a page play sound after a tap; once this
 * element has played from a tap, later plays (e.g. auto-playing the next card) are allowed.
 */
const player = typeof Audio !== 'undefined' ? new Audio() : null
let unlocked = false

// 0.1 s of silence, used to unlock playback on the first tap.
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='

export function unlockAudio() {
  if (!player || unlocked) return
  unlocked = true
  player.src = SILENCE
  player.play().catch(() => {
    unlocked = false
  })
}

export function play(src: string | undefined) {
  if (!player || !src) return
  player.pause()
  player.src = src
  player.currentTime = 0
  player.play().catch(() => {
    /* blocked until the user taps once; the 🔊 buttons always work */
  })
}
