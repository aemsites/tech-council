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

    const blockquote = document.createElement('blockquote');

    if (quoteCell && quoteCell.textContent.trim()) {
      const q = quoteCell.firstElementChild || document.createElement('p');
      if (!quoteCell.firstElementChild) {
        q.textContent = quoteCell.textContent;
      }
      q.className = 'hero-quote-quotation';
      blockquote.append(q);
    }

    if (attributionCell && attributionCell.textContent.trim()) {
      const a = attributionCell.firstElementChild || document.createElement('p');
      if (!attributionCell.firstElementChild) {
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

  // autoplay logic
  const slides = [...slidesWrapper.children];
  let current = 0;
  const showSlide = (index) => {
    slides[current].classList.remove('active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('active');
  };

  let intervalId = setInterval(() => showSlide(current + 1), 6000);

  // pause when block is off-screen
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        if (!intervalId) {
          intervalId = setInterval(() => showSlide(current + 1), 6000);
        }
      } else if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    });
  }, { threshold: 0.1 });

  observer.observe(block);
} 