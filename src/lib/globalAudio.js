// AudioContext global - se desbloquea con el primer click/touch en cualquier parte de la app
// Esto permite que el sonido funcione sin clicks adicionales después del login

let audioContext = null
let unlocked = false

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioContext
}

const unlockAudio = () => {
  if (unlocked) return
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        unlocked = true
      })
    } else {
      unlocked = true
    }
  } catch (e) { /* silencioso */ }
}

// Escuchar clicks/touches globalmente desde que carga la app
document.addEventListener('click', unlockAudio)
document.addEventListener('touchstart', unlockAudio)
document.addEventListener('keydown', unlockAudio)

export { getAudioContext }
