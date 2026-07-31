<script setup lang="ts">
import { onMounted, ref } from 'vue'

/**
 * Three-position control rather than a switch: "auto" has to be reachable,
 * because a design that respects prefers-color-scheme should let you get back
 * to respecting it after you have overridden it.
 */
type Mode = 'auto' | 'light' | 'dark'

const MODES: readonly Mode[] = ['auto', 'light', 'dark']
const STORAGE_KEY = 'poker-ai:theme'

const mode = ref<Mode>('auto')

function apply(next: Mode) {
  mode.value = next
  const root = document.documentElement
  if (next === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', next)
  try {
    if (next === 'auto') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Private browsing. The theme still applies for this page view.
  }
}

// Read on mount only: the server has no idea what the user prefers, and
// guessing would flash the wrong theme.
onMounted(() => {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    stored = null
  }
  if (stored === 'light' || stored === 'dark') apply(stored)
})
</script>

<template>
  <div class="theme" role="group" aria-label="Colour theme">
    <button
      v-for="m in MODES"
      :key="m"
      type="button"
      class="theme__opt u-eyebrow"
      :class="{ 'is-on': mode === m }"
      :aria-pressed="mode === m"
      @click="apply(m)"
    >
      {{ m }}
    </button>
  </div>
</template>

<style scoped>
.theme {
  display: flex;
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  overflow: hidden;
  background: var(--surface);
  flex: none;
}

.theme__opt {
  appearance: none;
  background: transparent;
  border: 0;
  border-left: 1px solid var(--line);
  color: var(--fg-3);
  padding: 0.4rem 0.55rem;
  cursor: pointer;
  min-height: 2.25rem;
}

.theme__opt:first-child {
  border-left: 0;
}

.theme__opt:hover {
  color: var(--fg-2);
}

.theme__opt.is-on {
  background: var(--surface-3);
  color: var(--fg);
  /* Underline as well as fill, so the selected state is not colour-only. */
  box-shadow: inset 0 -2px 0 var(--ob);
}
</style>
