function setupBackToTop() {
  try {
    if (document.querySelector('.back-to-top')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.textContent = '↑';
    document.body.append(btn);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });

    const threshold = 600;
    const toggle = () => {
      if (window.scrollY > threshold) btn.classList.add('visible');
      else btn.classList.remove('visible');
    };
    window.addEventListener('scroll', toggle, { passive: true });
    toggle();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Back-to-top setup failed:', e);
  }
}

setupBackToTop();
