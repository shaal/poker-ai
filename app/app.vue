<script setup lang="ts">
// Shell only. Everything with an opinion lives in a page or a component.
</script>

<template>
  <div class="shell">
    <header class="masthead">
      <div class="masthead__id">
        <span class="masthead__mark u-mono">poker-ai</span>
        <span class="masthead__thesis">Heads-up hold'em against an opponent that shows its working</span>
      </div>
      <ThemeToggle class="masthead__theme" />
    </header>

    <main class="shell__main">
      <NuxtPage />
    </main>

    <footer class="shell__foot">
      <nav class="shell__nav u-eyebrow">
        <NuxtLink to="/">Table</NuxtLink>
        <NuxtLink to="/style">Components</NuxtLink>
      </nav>
      <p class="shell__note u-eyebrow">Static build &middot; no network calls &middot; nothing leaves this browser</p>
    </footer>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  /* viewport-fit=cover is set in nuxt.config, so respect the notch. */
  padding: 0 max(var(--sp-3), env(safe-area-inset-left)) env(safe-area-inset-bottom)
    max(var(--sp-3), env(safe-area-inset-right));
  max-width: 90rem;
  margin: 0 auto;
}

/* Wordmark and toggle share the top line; the thesis gets the full width
   underneath so it does not set itself in a 12-character column on a phone. */
.masthead {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'mark toggle'
    'thesis thesis';
  align-items: center;
  gap: 0.2rem var(--sp-3);
  padding: var(--sp-4) 0 var(--sp-3);
  border-bottom: 1px solid var(--line);
  margin-bottom: var(--sp-4);
}

.masthead__id {
  display: contents;
}

.masthead__mark {
  grid-area: mark;
  font-size: var(--fs-lg);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--fg);
}

.masthead__thesis {
  grid-area: thesis;
  font-size: var(--fs-xs);
  color: var(--fg-2);
  line-height: 1.35;
  max-width: 52ch;
}

.masthead__theme {
  grid-area: toggle;
}

.shell__main {
  flex: 1;
}

.shell__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2) var(--sp-4);
  margin-top: var(--sp-6);
  padding: var(--sp-3) 0 var(--sp-5);
  border-top: 1px solid var(--line);
}

.shell__nav {
  display: flex;
  gap: var(--sp-4);
}

.shell__nav a {
  color: var(--fg-2);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  padding-bottom: 2px;
}

.shell__nav a:hover,
.shell__nav a.router-link-active {
  color: var(--fg);
  border-bottom-color: var(--ob);
}

.shell__note {
  color: var(--fg-3);
}
</style>
