(() => {
  const canvas = document.getElementById('blackHole')
  if (!(canvas instanceof HTMLCanvasElement)) return
  const context = canvas.getContext('2d')
  if (!context) return

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const particles = Array.from({ length: 480 }, () => {
    const angle = Math.random() * Math.PI * 2
    const distance = 260 + Math.random() * 480
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      radius: .4 + Math.random() * 1.4,
      alpha: .12 + Math.random() * .65,
      speed: .00014 + Math.random() * .00028,
    }
  })

  let width = 0
  let height = 0
  let frame = 0
  let time = 0
  const resize = () => {
    const ratio = Math.min(devicePixelRatio || 1, 2)
    width = innerWidth
    height = innerHeight
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  const draw = () => {
    time += 1
    context.clearRect(0, 0, width, height)
    const centerX = width / 2
    const centerY = height / 2

    for (let ring = 4; ring >= 1; ring -= 1) {
      const glow = context.createRadialGradient(centerX, centerY, 80 * ring, centerX, centerY, 220 * ring)
      glow.addColorStop(0, `rgba(255,255,255,${.025 / ring})`)
      glow.addColorStop(.5, `rgba(200,200,200,${.015 / ring})`)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      context.beginPath()
      context.arc(centerX, centerY, 220 * ring, 0, Math.PI * 2)
      context.fillStyle = glow
      context.fill()
    }

    const disk = context.createRadialGradient(centerX, centerY, 80, centerX, centerY, 320)
    disk.addColorStop(0, 'rgba(0,0,0,0)')
    disk.addColorStop(.25, 'rgba(255,255,255,.07)')
    disk.addColorStop(.55, 'rgba(180,180,180,.04)')
    disk.addColorStop(1, 'rgba(0,0,0,0)')
    context.beginPath()
    context.ellipse(centerX, centerY, 320, 90, .3, 0, Math.PI * 2)
    context.fillStyle = disk
    context.fill()

    particles.forEach(particle => {
      const distance = Math.hypot(particle.x, particle.y)
      if (!reduceMotion) {
        const angle = Math.atan2(particle.y, particle.x) + particle.speed * (260 / (distance + 1) * 8 + 1)
        const nextDistance = distance - .014
        if (nextDistance < 80) {
          const resetAngle = Math.random() * Math.PI * 2
          const resetDistance = 300 + Math.random() * 420
          particle.x = Math.cos(resetAngle) * resetDistance
          particle.y = Math.sin(resetAngle) * resetDistance
        } else {
          particle.x = Math.cos(angle) * nextDistance
          particle.y = Math.sin(angle) * nextDistance
        }
      }
      const proximity = Math.max(0, 1 - distance / 700)
      const brightness = Math.floor(160 + proximity * 95)
      context.beginPath()
      context.arc(centerX + particle.x, centerY + particle.y, particle.radius, 0, Math.PI * 2)
      context.fillStyle = `rgba(${brightness},${brightness},${brightness},${particle.alpha})`
      context.fill()
    })

    const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, 100)
    core.addColorStop(0, 'rgba(0,0,0,1)')
    core.addColorStop(.75, 'rgba(0,0,0,.98)')
    core.addColorStop(.9, 'rgba(8,8,8,.6)')
    core.addColorStop(1, 'rgba(0,0,0,0)')
    context.beginPath()
    context.arc(centerX, centerY, 100, 0, Math.PI * 2)
    context.fillStyle = core
    context.fill()

    const pulse = .18 + .06 * Math.sin(time * .035)
    const horizon = context.createRadialGradient(centerX, centerY, 76, centerX, centerY, 108)
    horizon.addColorStop(0, 'rgba(0,0,0,0)')
    horizon.addColorStop(.35, `rgba(255,255,255,${pulse})`)
    horizon.addColorStop(.7, `rgba(200,200,200,${pulse * .55})`)
    horizon.addColorStop(1, 'rgba(0,0,0,0)')
    context.beginPath()
    context.arc(centerX, centerY, 108, 0, Math.PI * 2)
    context.fillStyle = horizon
    context.fill()

    if (!reduceMotion) frame = requestAnimationFrame(draw)
  }

  resize()
  draw()
  addEventListener('resize', resize, { passive: true })
  addEventListener('pagehide', () => cancelAnimationFrame(frame), { once: true })
})()
