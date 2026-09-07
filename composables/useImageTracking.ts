import { ref, onUnmounted, type Ref } from 'vue'

interface TrackingState {
  isDetected: Ref<boolean>
  modelViewTransform: Ref<number[][] | null>
  projectionMatrix: Ref<number[] | null>
  targetRatio: Ref<number>
  start: (video: HTMLVideoElement, mindFileUrl: string) => Promise<void>
  stop: () => void
}

export function useImageTracking(): TrackingState {
  const isDetected = ref(false)
  const modelViewTransform = ref<number[][] | null>(null)
  const projectionMatrix = ref<number[] | null>(null)
  const targetRatio = ref(1)

  let controller: any = null
  let animationId: number | null = null
  let running = false

  async function start(video: HTMLVideoElement, mindFileUrl: string) {
    // Import dynamique pour eviter le SSR
    await import('mind-ar/dist/mindar-image.prod.js')
    const MindAR = (window as any).MINDAR.IMAGE

    const videoWidth = video.videoWidth || 640
    const videoHeight = video.videoHeight || 480

    controller = new MindAR.Controller({
      inputWidth: videoWidth,
      inputHeight: videoHeight,
      maxTrack: 1,
      filterMinCF: 0.001,
      filterBeta: 10,
      missTolerance: 5,
      warmupTolerance: 5,
    })

    // Charger le fichier .mind
    const { dimensions } = await controller.addImageTargets(mindFileUrl)
    targetRatio.value = dimensions[0][0] / dimensions[0][1]

    // Recuperer la matrice de projection
    projectionMatrix.value = controller.getProjectionMatrix()

    // Warmup
    await controller.dummyRun(video)

    controller.processVideo(video)
    running = true

    // Boucle de lecture des resultats
    function trackLoop() {
      if (!running || !controller) return

      const targets = controller.interestedTargetIndex !== -1
        ? [controller.interestedTargetIndex]
        : []

      // MindAR met a jour trackingStates en interne via processVideo
      if (controller.trackingStates && controller.trackingStates.length > 0) {
        const state = controller.trackingStates[0]
        if (state && state.isTracking) {
          isDetected.value = true
          if (state.modelViewTransform) {
            modelViewTransform.value = state.modelViewTransform
          }
        } else {
          isDetected.value = false
          modelViewTransform.value = null
        }
      }

      animationId = requestAnimationFrame(trackLoop)
    }

    animationId = requestAnimationFrame(trackLoop)
  }

  function stop() {
    running = false
    if (animationId) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
    if (controller) {
      controller.stopProcessVideo()
      controller = null
    }
    isDetected.value = false
    modelViewTransform.value = null
  }

  onUnmounted(() => stop())

  return {
    isDetected,
    modelViewTransform,
    projectionMatrix,
    targetRatio,
    start,
    stop,
  }
}
