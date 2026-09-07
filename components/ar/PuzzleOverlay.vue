<script setup lang="ts">
import type { Puzzle, PuzzlePoint, PuzzleState } from '~/types'

const props = defineProps<{
  puzzle: Puzzle
  state: PuzzleState
  userTrace: PuzzlePoint[]
  projectedPath: PuzzlePoint[] | null
  projectedStart: PuzzlePoint | null
  isDetected: boolean
}>()

const emit = defineEmits<{
  touchStart: [point: PuzzlePoint]
  touchMove: [point: PuzzlePoint]
  touchEnd: []
}>()

const canvasRef = ref<HTMLCanvasElement>()
let animationId: number | null = null

function getScreenPoint(touch: Touch): PuzzlePoint {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  return {
    x: (touch.clientX - rect.left) * dpr,
    y: (touch.clientY - rect.top) * dpr,
  }
}

function onTouchStart(e: TouchEvent) {
  e.preventDefault()
  if (!e.touches[0]) return
  emit('touchStart', getScreenPoint(e.touches[0]))
}

function onTouchMove(e: TouchEvent) {
  e.preventDefault()
  if (!e.touches[0]) return
  emit('touchMove', getScreenPoint(e.touches[0]))
}

function onTouchEnd(e: TouchEvent) {
  e.preventDefault()
  emit('touchEnd')
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const pathStyle = props.puzzle.path.style
  const pathPoints = props.projectedPath
  const startPt = props.projectedStart
  const dpr = window.devicePixelRatio || 1

  // Ne rien dessiner si pas detecte et pas en mode actif
  if (!props.isDetected && props.state !== 'tracking' && props.state !== 'success' && props.state !== 'fail') {
    animationId = requestAnimationFrame(draw)
    return
  }

  // Dessiner le chemin de reference (semi-transparent)
  if (pathPoints && pathPoints.length > 1) {
    ctx.beginPath()
    ctx.moveTo(pathPoints[0]!.x, pathPoints[0]!.y)
    for (let i = 1; i < pathPoints.length; i++) {
      ctx.lineTo(pathPoints[i]!.x, pathPoints[i]!.y)
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = (pathStyle.width + 4) * dpr
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  // Dessiner le point de depart (cercle pulsant)
  if (startPt && (props.state === 'scanning' || props.state === 'idle' || props.userTrace.length === 0)) {
    const pulseSize = (14 + Math.sin(Date.now() / 300) * 4) * dpr
    ctx.beginPath()
    ctx.arc(startPt.x, startPt.y, pulseSize, 0, Math.PI * 2)
    ctx.fillStyle = pathStyle.color
    ctx.fill()

    // Cercle exterieur glow
    const outerSize = (22 + Math.sin(Date.now() / 300) * 6) * dpr
    ctx.beginPath()
    ctx.arc(startPt.x, startPt.y, outerSize, 0, Math.PI * 2)
    ctx.strokeStyle = pathStyle.glowColor
    ctx.lineWidth = 2 * dpr
    ctx.stroke()
  }

  // Dessiner le trace utilisateur
  if (props.userTrace.length > 1) {
    // Glow
    ctx.beginPath()
    ctx.moveTo(props.userTrace[0]!.x, props.userTrace[0]!.y)
    for (let i = 1; i < props.userTrace.length; i++) {
      ctx.lineTo(props.userTrace[i]!.x, props.userTrace[i]!.y)
    }
    ctx.strokeStyle = pathStyle.glowColor
    ctx.lineWidth = pathStyle.glowWidth * dpr
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowBlur = pathStyle.glowWidth * dpr
    ctx.shadowColor = pathStyle.glowColor
    ctx.stroke()

    // Ligne principale
    ctx.shadowBlur = 0
    ctx.beginPath()
    ctx.moveTo(props.userTrace[0]!.x, props.userTrace[0]!.y)
    for (let i = 1; i < props.userTrace.length; i++) {
      ctx.lineTo(props.userTrace[i]!.x, props.userTrace[i]!.y)
    }
    ctx.strokeStyle = pathStyle.color
    ctx.lineWidth = pathStyle.width * dpr
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  // Animation de succes
  if (props.state === 'success') {
    ctx.fillStyle = `rgba(0, 255, 170, ${0.1 + Math.sin(Date.now() / 200) * 0.05})`
    ctx.fillRect(0, 0, w, h)
  }

  // Animation d'echec
  if (props.state === 'fail') {
    ctx.fillStyle = 'rgba(233, 69, 96, 0.2)'
    ctx.fillRect(0, 0, w, h)
  }

  animationId = requestAnimationFrame(draw)
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = canvas.clientWidth * dpr
  canvas.height = canvas.clientHeight * dpr
}

onMounted(() => {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  animationId = requestAnimationFrame(draw)
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="puzzle-canvas"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  />
</template>

<style lang="scss" scoped>
.puzzle-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 41;
  touch-action: none;
}
</style>
