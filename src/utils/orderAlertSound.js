// AudioContext compartido. iOS/Safari exigen una gestura del usuario para
// arrancarlo, por eso lo creamos lazy y nos enganchamos a pointerdown global
// para reanudarlo cuando esté suspendido.
let sharedCtx = null
let resumeBound = false

const getAudioCtx = () => {
  if (sharedCtx) return sharedCtx
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  sharedCtx = new Ctx()

  if (!resumeBound) {
    const resume = () => {
      if (sharedCtx?.state === 'suspended') sharedCtx.resume().catch(() => {})
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('touchstart', resume)
    resumeBound = true
  }
  return sharedCtx
}

/**
 * Beep de alerta para pedidos nuevos.
 * @param {'strong'|'normal'} intensity - 'strong' = 3 pulsos, 'normal' = 2.
 */
export const playOrderAlertBeep = (intensity = 'normal') => {
  const ctx = getAudioCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})

  const pulses = intensity === 'strong' ? 3 : 2
  const now = ctx.currentTime

  for (let i = 0; i < pulses; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)

    const start = now + i * 0.26
    const end = start + 0.2
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.45, start + 0.02)
    gain.gain.setValueAtTime(0.45, end - 0.04)
    gain.gain.linearRampToValueAtTime(0, end)

    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(end + 0.02)
  }
}

export const vibrateOrderAlert = (pattern = [300, 100, 300, 100, 300]) => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(pattern) } catch { /* no-op */ }
  }
}
