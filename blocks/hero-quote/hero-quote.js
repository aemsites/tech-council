export default function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  const carousel = document.createElement('div');
  carousel.className = 'hero-quote-carousel';

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

  block.innerHTML = '';
  block.append(carousel);

  const slides = [...slidesWrapper.children];
  if (slides.length < 2) return;
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
  createButton('Previous quote', () => showSlide(current - 1));
  const playbackControl = createButton('Pause quotes', () => {
    playbackRequested = !playbackRequested;
    // eslint-disable-next-line no-use-before-define -- invoked after initialization
    syncPlayback();
  });
  createButton('Next quote', () => showSlide(current + 1));
  carousel.append(controls);

  const syncPlayback = () => {
    clearInterval(intervalId);
    intervalId = null;
    playbackControl.textContent = playbackRequested ? 'Pause quotes' : 'Play quotes';
    playbackControl.setAttribute('aria-pressed', String(playbackRequested));
    slidesWrapper.setAttribute('aria-live', playbackRequested ? 'off' : 'polite');
    if (playbackRequested && inView && !document.hidden && !hovered && !focused) {
      intervalId = setInterval(() => showSlide(current + 1), 6000);
    }
  };
  motionPreference.addEventListener('change', () => {
    playbackRequested = false;
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

  observer.observe(block);
}
