import { ref, onUnmounted } from 'vue'

export function useCamera() {
  const stream = ref<MediaStream | null>(null)
  const error = ref<string | null>(null)
  const isActive = ref(false)

  async function start(videoElement: HTMLVideoElement) {
    try {
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      videoElement.srcObject = stream.value
      await videoElement.play()
      isActive.value = true
      error.value = null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Erreur camera'
      isActive.value = false
    }
  }

  function stop() {
    if (stream.value) {
      stream.value.getTracks().forEach((track) => track.stop())
      stream.value = null
    }
    isActive.value = false
  }

  onUnmounted(() => stop())

  return {
    stream,
    error,
    isActive,
    start,
    stop,
  }
}
