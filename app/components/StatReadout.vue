<script setup lang="ts">
/** A labelled figure. The atom the whole panel grid is built from. */
withDefaults(
  defineProps<{
    label: string
    value: string | number
    unit?: string
    /** One clause of context under the figure. Reserved even when absent. */
    hint?: string
    tone?: 'default' | 'expected' | 'observed' | 'alert' | 'quiet'
    size?: 'sm' | 'md' | 'lg'
    /** Keeps the hint line's height even with no hint, so panels never jump. */
    reserveHint?: boolean
  }>(),
  { tone: 'default', size: 'md', reserveHint: false, unit: '', hint: '' },
)
</script>

<template>
  <div class="stat" :class="[`stat--${tone}`, `stat--${size}`]">
    <span class="u-eyebrow stat__label">{{ label }}</span>
    <span class="stat__value u-num">
      {{ value }}<span v-if="unit" class="stat__unit">{{ unit }}</span>
    </span>
    <span v-if="hint || reserveHint" class="stat__hint">{{ hint || ' ' }}</span>
  </div>
</template>

<style scoped>
.stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.stat__label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat__value {
  font-weight: 600;
  line-height: 1.1;
  color: var(--fg);
  white-space: nowrap;
}

.stat__unit {
  font-size: 0.65em;
  font-weight: 400;
  color: var(--fg-3);
  margin-left: 0.15em;
}

.stat__hint {
  font-size: var(--fs-micro);
  color: var(--fg-3);
  line-height: 1.3;
  min-height: 1.3em;
}

.stat--sm .stat__value {
  font-size: var(--fs-md);
}
.stat--md .stat__value {
  font-size: var(--fs-xl);
}
.stat--lg .stat__value {
  font-size: var(--fs-3xl);
  letter-spacing: -0.03em;
}

.stat--expected .stat__value {
  color: var(--ex);
}
.stat--observed .stat__value {
  color: var(--ob);
}
.stat--alert .stat__value {
  color: var(--alert);
}
.stat--quiet .stat__value {
  color: var(--fg-2);
}
</style>
