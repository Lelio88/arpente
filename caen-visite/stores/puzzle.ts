import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePuzzleStore = defineStore('puzzle', () => {
  const completedIds = ref<string[]>(loadFromStorage())

  const completedCount = computed(() => completedIds.value.length)

  function isCompleted(puzzleId: string): boolean {
    return completedIds.value.includes(puzzleId)
  }

  function markCompleted(puzzleId: string) {
    if (!completedIds.value.includes(puzzleId)) {
      completedIds.value.push(puzzleId)
      saveToStorage()
    }
  }

  function reset() {
    completedIds.value = []
    saveToStorage()
  }

  function loadFromStorage(): string[] {
    if (typeof localStorage === 'undefined') return []
    const data = localStorage.getItem('caen-puzzles')
    return data ? JSON.parse(data) : []
  }

  function saveToStorage() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem('caen-puzzles', JSON.stringify(completedIds.value))
  }

  return {
    completedIds,
    completedCount,
    isCompleted,
    markCompleted,
    reset,
  }
})
