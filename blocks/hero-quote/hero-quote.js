export default function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;
  const main = block.closest('main');
  const authoredHeading = block.querySelector('h2');
  const isHomeHero = window.location.pathname === '/'
    && main?.querySelector('.block') === block
    && !main.querySelector('h1')
    && Boolean(authoredHeading);
  const isPageHero = Boolean(block.querySelector('h1')) || isHomeHero;
  if (isHomeHero) {
    const heading = document.createElement('h1');
    [...authoredHeading.attributes].forEach(({ name, value }) => heading.setAttribute(name, value));
    if (heading.hasAttribute('aria-level')) heading.setAttribute('aria-level', '1');
    heading.append(...authoredHeading.childNodes);
    authoredHeading.replaceWith(heading);
  }

  const carousel = document.createElement('div');
  carousel.className = 'hero-quote-carousel';
  let motionTarget = block;

  const slidesWrapper = document.createElement('ul');
  slidesWrapper.className = 'hero-quote-slides';
  carousel.append(slidesWrapper);

  rows.forEach((row, idx) => {
    const cells = [...row.children];
    const quoteCell = cells[0];
    const attributionCell = cells[1];

    const slide = document.createElement('li');
    slide.className = 'hero-quote-slide';
    if (idx === 0) slide.classList.add('active');
    slide.hidden = idx !== 0;
    slide.inert = idx !== 0;
    slide.setAttribute('aria-hidden', String(idx !== 0));

    const blockquote = document.createElement('blockquote');

    if (quoteCell && quoteCell.textContent.trim()) {
      const q = document.createElement('div');
      if (quoteCell.children.length) {
        q.append(...quoteCell.childNodes);
      } else {
        q.textContent = quoteCell.textContent;
      }
      q.className = 'hero-quote-quotation';
      blockquote.append(q);
    }

    if (attributionCell && attributionCell.textContent.trim()) {
      const a = document.createElement('div');
      if (attributionCell.children.length) {
        a.append(...attributionCell.childNodes);
      } else {
        a.textContent = attributionCell.textContent;
      }
      a.className = 'hero-quote-attribution';
      blockquote.append(a);
    }

    slide.append(blockquote);
    slidesWrapper.append(slide);
  });

  if (isPageHero) {
    block.classList.add('council-page-hero');
    const sculpture = document.createElement('div');
    sculpture.className = 'council-sculpture';
    sculpture.setAttribute('aria-hidden', 'true');
    motionTarget = sculpture;
    const gimbal = document.createElement('div');
    gimbal.className = 'council-sculpture-gimbal';
    [1, 2, 3].forEach((index) => {
      const ring = document.createElement('span');
      ring.className = `council-sculpture-ring council-sculpture-ring-${index}`;
      gimbal.append(ring);
    });
    const core = document.createElement('span');
    core.className = 'council-sculpture-core';
    gimbal.append(core);
    sculpture.append(gimbal);
    carousel.append(sculpture);
  }

  block.innerHTML = '';
  block.append(carousel);

  const slides = [...slidesWrapper.children];
  const canCycle = slides.length > 1;
  if (!canCycle && !isPageHero) return;
  let current = 0;
  const showSlide = (index) => {
    slides[current].classList.remove('active');
    slides[current].hidden = true;
    slides[current].inert = true;
    slides[current].setAttribute('aria-hidden', 'true');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('active');
    slides[current].hidden = false;
    slides[current].inert = false;
    slides[current].setAttribute('aria-hidden', 'false');
  };

  const controls = document.createElement('div');
  controls.className = 'hero-quote-controls';
  const createButton = (label, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    controls.append(button);
    return button;
  };
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let playbackRequested = !motionPreference.matches;
  let inView = false;
  let hovered = false;
  let focused = false;
  let intervalId;
  if (canCycle) createButton('Previous quote', () => showSlide(current - 1));
  const playbackControl = canCycle ? createButton('Pause quotes', () => {
    playbackRequested = !playbackRequested;
    // eslint-disable-next-line no-use-before-define -- invoked after initialization
    syncPlayback();
  }) : null;
  if (canCycle) createButton('Next quote', () => showSlide(current + 1));
  if (canCycle) carousel.append(controls);

  const syncPlayback = () => {
    clearInterval(intervalId);
    intervalId = null;
    if (playbackControl) {
      playbackControl.textContent = playbackRequested ? 'Pause quotes' : 'Play quotes';
      playbackControl.setAttribute('aria-pressed', String(playbackRequested));
    }
    slidesWrapper.setAttribute('aria-live', playbackRequested ? 'off' : 'polite');
    const interactionAllowsPlay = !canCycle || (!hovered && !focused);
    const shouldPlay = playbackRequested && inView && !document.hidden && interactionAllowsPlay;
    block.classList.toggle(
      'hero-quote-motion-active',
      isPageHero && shouldPlay && !motionPreference.matches,
    );
    if (canCycle && shouldPlay) {
      intervalId = setInterval(() => showSlide(current + 1), 6000);
    }
  };
  motionPreference.addEventListener('change', () => {
    playbackRequested = !canCycle && !motionPreference.matches;
    syncPlayback();
  });
  document.addEventListener('visibilitychange', syncPlayback);
  block.addEventListener('mouseenter', () => { hovered = true; syncPlayback(); });
  block.addEventListener('mouseleave', () => { hovered = false; syncPlayback(); });
  block.addEventListener('focusin', () => { focused = true; syncPlayback(); });
  block.addEventListener('focusout', (event) => {
    focused = block.contains(event.relatedTarget);
    syncPlayback();
  });
  syncPlayback();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      inView = entry.isIntersecting;
      syncPlayback();
    });
  }, { threshold: 0.1 });

  observer.observe(canCycle ? block : motionTarget);
}
