// Adapted from Jakub Antalik's thinking-orbs (MIT), working / 64 preset.
// See LICENSE and README.md. Geometry and grayscale depth match upstream.
export interface OrbDot { x: number; y: number; z: number; r: number; white: number; a?: number }
export const ORB_SIZE = 64
const SPEED = 1.885

function hash(a: number, b: number) {
  const value = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return value - Math.floor(value)
}

export function workingDots(seconds: number): OrbDot[] {
  const size = ORB_SIZE, t = seconds * SPEED
  const radius = size / 2 * .82, scale = (size / 300) ** .6
  const yaw = t * .12, tilt = .3
  const project = (x: number, y: number, z: number) => {
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw)
    const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw)
    return [size / 2 + x1, size / 2 - (y * Math.cos(tilt) - z1 * Math.sin(tilt)), y * Math.sin(tilt) + z1 * Math.cos(tilt)]
  }
  const dots: OrbDot[] = []
  for (let orbit = 0; orbit < 12; orbit++) {
    const h1 = hash(orbit, 1.7), h2 = hash(orbit, 5.2), h3 = hash(orbit, 8.9)
    const ro = radius * (.45 + .52 * h1), theta = h1 * 2 * Math.PI, phi = Math.acos(2 * h2 - 1)
    const nx = Math.sin(phi) * Math.cos(theta), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(theta)
    const length = Math.max(1e-6, Math.sqrt(ny * ny + nx * nx))
    const ux = -ny / length, uy = nx / length
    const vx = -nz * uy, vy = nz * ux, vz = nx * uy - ny * ux
    const position = (angle: number) => project(
      (ux * Math.cos(angle) + vx * Math.sin(angle)) * ro,
      (uy * Math.cos(angle) + vy * Math.sin(angle)) * ro,
      vz * Math.sin(angle) * ro
    )
    for (let k = 0; k < 40; k++) {
      const [x, y, z] = position(k / 40 * Math.PI * 2)
      const depth = (z / ro + 1) / 2
      dots.push({ x, y, z, r: Math.max(.3, .9 * scale), white: .72, a: .5 * (.4 + .6 * depth) })
    }
    const speed = (.25 + .55 * h3) * (h3 > .5 ? 1 : -1)
    for (let k = 0; k < 3; k++) {
      const [x, y, z] = position(t * speed + k / 3 * Math.PI * 2 + h2 * 6)
      const depth = (z / ro + 1) / 2
      dots.push({ x, y, z, r: Math.max(.3, (1.2 + 1.6 * depth) * scale), white: .3 - .22 * depth })
    }
  }
  return dots.sort((a, b) => a.z - b.z)
}

export function paintWorkingOrb(ctx: CanvasRenderingContext2D, seconds: number, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, ORB_SIZE, ORB_SIZE)
  for (const dot of workingDots(seconds)) {
    const gray = Math.round(Math.min(1, Math.max(0, dot.white)) * 255)
    ctx.fillStyle = `rgba(${gray},${gray},${gray},${dot.a ?? 1})`
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Both canvas implementations own their scheduler. Never use React state per frame.
export function startOrbAnimation(draw: (seconds: number) => void, request: (callback: (time: number) => void) => number, cancel: (id: number) => void, reduced = false) {
  let active = true, frameId = 0, previous = -Infinity
  draw(.6)
  const tick = (time: number) => {
    if (!active) return
    if (time - previous >= 1000 / 30) { draw(time / 1000); previous = time }
    frameId = request(tick)
  }
  if (!reduced) frameId = request(tick)
  return () => { active = false; cancel(frameId) }
}
