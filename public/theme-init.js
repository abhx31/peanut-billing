// Runs before React hydrates to apply the saved theme without a flash.
// Served as a static asset so React 19 doesn't warn about scripts inside
// the component tree. Keep in sync with src/components/theme-provider.tsx.
(function () {
  try {
    var k = 'theme';
    var t = localStorage.getItem(k);
    if (!t || t === 'system') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.documentElement.style.colorScheme = t;
  } catch {}
})();
