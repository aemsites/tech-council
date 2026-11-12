function createCommunityArtwork() {
  const figure = document.createElement('figure');
  figure.className = 'hero-community-art';
  const communities = [
    ['mcp-community', 'MCP'],
    ['evals-community', 'Evals'],
    ['playwright-community', 'Playwright'],
    ['program-management-community', 'Program Management'],
  ];
  communities.forEach(([icon, name]) => {
    const tile = document.createElement('div');
    const image = document.createElement('img');
    image.src = `${window.hlx.codeBasePath}/icons/${icon}.svg`;
    image.alt = '';
    image.width = 76;
    image.height = 76;
    const label = document.createElement('span');
    label.textContent = name;
    tile.append(image, label);
    figure.append(tile);
  });
  const caption = document.createElement('figcaption');
  caption.textContent = 'Connect through our engineering communities.';
  figure.append(caption);
  return figure;
}

function decorateHomepage(block) {
  const content = block.querySelector('blockquote');
  if (!content) return;
  const layout = document.createElement('div');
  layout.className = 'hero-home-layout';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'hero-home-eyebrow';
  eyebrow.textContent = 'Adobe Tech Council';
  content.prepend(eyebrow);
  const actions = document.createElement('div');
  actions.className = 'hero-home-actions';
  const communities = document.createElement('a');
  communities.className = 'button';
  communities.href = '/communities/';
  communities.textContent = 'Explore communities';
  const events = document.createElement('a');
  events.className = 'hero-events-link';
  events.href = '/events';
  events.textContent = 'Browse events';
  actions.append(communities, events);
  content.append(actions);
  content.before(layout);
  layout.append(content, createCommunityArtwork());
}

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
      let heading = q;
      if (idx === 0 && !document.querySelector('main h1') && !block.querySelector('h1')) {
        heading = document.createElement('h1');
        heading.id = q.id;
        heading.append(...q.childNodes);
      }
      heading.className = 'hero-quote-quotation';
      blockquote.append(heading);
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

  const slides = [...slidesWrapper.children];
  if (window.location.pathname === '/' && slides.length === 1) decorateHomepage(block);
  if (slides.length < 2) return;

  const controls = document.createElement('div');
  controls.className = 'hero-quote-controls';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.textContent = 'Previous';
  previous.setAttribute('aria-label', 'Previous introduction');
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'Next';
  next.setAttribute('aria-label', 'Next introduction');
  controls.append(previous, next);
  carousel.append(controls);
  let current = 0;
  const showSlide = (index) => {
    slides[current].classList.remove('active');
    slides[current].inert = true;
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('active');
    slides[current].inert = false;
  };
  slides.forEach((slide, index) => { slide.inert = index !== 0; });
  previous.addEventListener('click', () => showSlide(current - 1));
  next.addEventListener('click', () => showSlide(current + 1));
}
