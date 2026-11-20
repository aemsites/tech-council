import { fetchPlaceholders } from '../../scripts/placeholders.js';

function updateActiveSlide(slide) {
  const block = slide.closest('.carousel');
  const slideIndex = parseInt(slide.dataset.slideIndex, 10);
  block.dataset.activeSlide = slideIndex;

  const slides = block.querySelectorAll('.carousel-slide');

  slides.forEach((aSlide, idx) => {
    aSlide.setAttribute('aria-hidden', idx !== slideIndex);
    aSlide.inert = idx !== slideIndex;
  });

  const indicators = block.querySelectorAll('.carousel-slide-indicator');
  indicators.forEach((indicator, idx) => {
    if (idx !== slideIndex) {
      indicator.querySelector('button').removeAttribute('aria-current');
    } else {
      indicator.querySelector('button').setAttribute('aria-current', 'true');
    }
  });

  // Update edge classes for decorative fades and button states
  block.classList.toggle('at-start', slideIndex === 0);
  block.classList.toggle('at-end', slideIndex === slides.length - 1);
}

function showSlide(block, slideIndex = 0) {
  const slides = block.querySelectorAll('.carousel-slide');
  let realSlideIndex = slideIndex < 0 ? slides.length - 1 : slideIndex;
  if (slideIndex >= slides.length) realSlideIndex = 0;
  const activeSlide = slides[realSlideIndex];

  block.querySelector('.carousel-slides').scrollTo({
    top: 0,
    left: activeSlide.offsetLeft,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
}

function bindEvents(block) {
  const slideIndicators = block.querySelector('.carousel-slide-indicators');
  if (!slideIndicators) return;

  slideIndicators.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', (e) => {
      const slideIndicator = e.currentTarget.parentElement;
      showSlide(block, parseInt(slideIndicator.dataset.targetSlide, 10));
    });
  });

  block.querySelector('.slide-prev').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) - 1);
  });
  block.querySelector('.slide-next').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) + 1);
  });

  const slideObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) updateActiveSlide(entry.target);
    });
  }, { threshold: 0.5 });
  block.querySelectorAll('.carousel-slide').forEach((slide) => {
    slideObserver.observe(slide);
  });

  // Keyboard navigation
  block.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      showSlide(block, parseInt(block.dataset.activeSlide, 10) - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      showSlide(block, parseInt(block.dataset.activeSlide, 10) + 1);
    }
  });

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let playbackRequested = !motionPreference.matches;
  let hovered = false;
  let focused = block.contains(document.activeElement);
  let pointerActive = false;
  let inView = false;
  let intervalId;
  const playbackControl = block.querySelector('.carousel-playback');
  const syncPlayback = () => {
    window.clearInterval(intervalId);
    intervalId = null;
    playbackControl.textContent = playbackRequested ? 'Pause slides' : 'Play slides';
    playbackControl.setAttribute('aria-pressed', String(playbackRequested));
    if (playbackRequested && inView && !document.hidden && !hovered && !focused && !pointerActive) {
      intervalId = window.setInterval(() => {
        showSlide(block, parseInt(block.dataset.activeSlide, 10) + 1);
      }, 6000);
    }
  };
  playbackControl.addEventListener('click', () => {
    playbackRequested = !playbackRequested;
    syncPlayback();
  });
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
  block.addEventListener('pointerdown', () => { pointerActive = true; syncPlayback(); });
  const endPointer = () => { pointerActive = false; syncPlayback(); };
  document.addEventListener('pointerup', endPointer);
  document.addEventListener('pointercancel', endPointer);
  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      inView = entry.isIntersecting;
      syncPlayback();
    });
  }, { threshold: 0.1 });
  visibilityObserver.observe(block);
  syncPlayback();
}

function createSlide(row, slideIndex, carouselId) {
  const slide = document.createElement('li');
  slide.dataset.slideIndex = slideIndex;
  slide.setAttribute('id', `carousel-${carouselId}-slide-${slideIndex}`);
  slide.classList.add('carousel-slide');

  row.querySelectorAll(':scope > div').forEach((column, colIdx) => {
    column.classList.add(`carousel-slide-${colIdx === 0 ? 'image' : 'content'}`);
    slide.append(column);
  });

  const labeledBy = slide.querySelector('h1, h2, h3, h4, h5, h6');
  if (labeledBy) {
    if (!labeledBy.id) labeledBy.id = `carousel-${carouselId}-heading-${slideIndex}`;
    slide.setAttribute('aria-labelledby', labeledBy.getAttribute('id'));
  }

  return slide;
}

let carouselId = 0;
export default async function decorate(block) {
  carouselId += 1;
  block.setAttribute('id', `carousel-${carouselId}`);
  const rows = block.querySelectorAll(':scope > div');
  if (!rows.length) return;
  const isSingleSlide = rows.length < 2;

  const placeholders = await fetchPlaceholders();

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', placeholders.carousel || 'Carousel');

  const container = document.createElement('div');
  container.classList.add('carousel-slides-container');

  const slidesWrapper = document.createElement('ul');
  slidesWrapper.classList.add('carousel-slides');
  block.prepend(slidesWrapper);

  let slideIndicators;
  if (!isSingleSlide) {
    const slideIndicatorsNav = document.createElement('nav');
    slideIndicatorsNav.setAttribute('aria-label', placeholders.carouselSlideControls || 'Carousel Slide Controls');
    slideIndicators = document.createElement('ol');
    slideIndicators.classList.add('carousel-slide-indicators');
    slideIndicatorsNav.append(slideIndicators);
    const playbackControl = document.createElement('button');
    playbackControl.type = 'button';
    playbackControl.className = 'carousel-playback';
    slideIndicatorsNav.append(playbackControl);
    block.append(slideIndicatorsNav);

    const slideNavButtons = document.createElement('div');
    slideNavButtons.classList.add('carousel-navigation-buttons');
    slideNavButtons.innerHTML = `
      <button type="button" class= "slide-prev" aria-label="${placeholders.previousSlide || 'Previous Slide'}"></button>
      <button type="button" class="slide-next" aria-label="${placeholders.nextSlide || 'Next Slide'}"></button>
    `;

    container.append(slideNavButtons);
  }

  rows.forEach((row, idx) => {
    const slide = createSlide(row, idx, carouselId);
    slidesWrapper.append(slide);

    if (slideIndicators) {
      const indicator = document.createElement('li');
      indicator.classList.add('carousel-slide-indicator');
      indicator.dataset.targetSlide = idx;
      indicator.innerHTML = `<button type="button" aria-label="${placeholders.showSlide || 'Show Slide'} ${idx + 1} ${placeholders.of || 'of'} ${rows.length}"></button>`;
      slideIndicators.append(indicator);
    }
    row.remove();
  });

  container.append(slidesWrapper);
  block.prepend(container);

  updateActiveSlide(slidesWrapper.firstElementChild);
  if (!isSingleSlide) {
    bindEvents(block);
  }
}
