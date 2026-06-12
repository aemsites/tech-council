import { decorateIcons } from '../../scripts/aem.js';
import { fetchPlaceholders } from '../../scripts/placeholders.js';

const EVENTS_SHEET_PATH = '/forms/events-form/events-data.json';
const EVENTS_SHEET_ORIGIN = 'https://main--tech-council--aemsites.aem.page';

function getEventsSheetUrl() {
  const { origin } = window.location;
  if (origin === EVENTS_SHEET_ORIGIN) {
    return `${origin}${EVENTS_SHEET_PATH}`;
  }
  return EVENTS_SHEET_PATH;
}

async function fetchEventsData() {
  const url = getEventsSheetUrl();
  try {
    const resp = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      if (resp.status === 403) {
        console.warn(
          '[Events] 403 Forbidden — the sheet URL is not allowed for this request.',
          url,
        );
      } else {
        console.warn('[Events] Sheet fetch failed:', resp.status, resp.statusText, url);
      }
      return [];
    }
    const json = await resp.json();
    const data = Array.isArray(json.data) ? json.data : [];
    if (data.length === 0 && (!json.data || !Array.isArray(json.data))) {
      console.warn('[Events] No data array in response:', url, Object.keys(json));
    }
    return data;
  } catch (e) {
    console.warn('[Events] Sheet fetch error:', e?.message || e, url);
    return [];
  }
}

function parseEventDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  if (t === '') return false;
  try {
    const u = new URL(t, window.location.origin);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatEventDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatEventTime(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function filterAndSortEvents(data) {
  const now = new Date();
  const maxEvents = 10;

  const parsed = data.map((row) => ({
    ...row,
    parsedDate: parseEventDate(row.dateTime),
  }));

  const upcoming = parsed
    .filter((e) => e.parsedDate && e.parsedDate >= now)
    .sort((a, b) => a.parsedDate - b.parsedDate);

  const past = parsed
    .filter((e) => e.parsedDate && e.parsedDate < now)
    .sort((a, b) => b.parsedDate - a.parsedDate);

  const noDates = parsed.filter((e) => !e.parsedDate);

  const result = upcoming.slice(0, maxEvents);
  if (result.length < maxEvents) {
    result.push(...past.slice(0, maxEvents - result.length));
  }
  if (result.length < maxEvents) {
    result.push(...noDates.slice(0, maxEvents - result.length));
  }
  return result;
}

function buildEventCard(row) {
  const li = document.createElement('li');
  li.className = 'events-card';

  const isUpcoming = row.parsedDate && row.parsedDate >= new Date();
  li.classList.add(isUpcoming ? 'is-upcoming' : 'is-past');

  const badge = document.createElement('span');
  badge.className = 'events-card-badge';
  badge.textContent = isUpcoming ? 'Upcoming' : 'Past';
  badge.setAttribute('aria-hidden', 'true');
  li.prepend(badge);

  const body = document.createElement('div');
  body.className = 'events-card-body';

  const title = document.createElement('h3');
  title.className = 'events-card-title';
  title.textContent = (row.title || '').trim();
  body.append(title);

  if ((row.speaker || '').trim()) {
    const speaker = document.createElement('p');
    speaker.className = 'events-card-speaker';
    speaker.textContent = `By ${row.speaker.trim()}`;
    body.append(speaker);
  }

  const dateStr = formatEventDate(row.parsedDate);
  const timeStr = formatEventTime(row.parsedDate);
  if (dateStr) {
    const dateEl = document.createElement('p');
    dateEl.className = 'events-card-date';
    const calIcon = document.createElement('span');
    calIcon.className = 'icon icon-calendar';
    calIcon.setAttribute('aria-hidden', 'true');
    dateEl.append(calIcon);
    dateEl.append(document.createTextNode(timeStr ? `${dateStr}, ${timeStr}` : dateStr));
    body.append(dateEl);
  }

  const room = (row.meetingRoom || '').trim();
  if (room) {
    const locationEl = document.createElement('p');
    locationEl.className = 'events-card-location';
    const locIcon = document.createElement('span');
    locIcon.className = 'icon icon-location';
    locIcon.setAttribute('aria-hidden', 'true');
    locationEl.append(locIcon);
    locationEl.append(document.createTextNode(room));
    body.append(locationEl);
  }

  const tagRaw = (row.tag || '').trim();
  if (tagRaw) {
    const tagEl = document.createElement('p');
    tagEl.className = 'events-card-tag';
    tagEl.textContent = tagRaw;
    body.append(tagEl);
  }

  const meetingLink = (row.meetingLink || '').trim();
  if (isUpcoming && meetingLink && isSafeUrl(meetingLink)) {
    const joinBtn = document.createElement('a');
    joinBtn.href = meetingLink;
    joinBtn.className = 'events-card-join';
    joinBtn.textContent = 'Join Meeting';
    joinBtn.setAttribute('target', '_blank');
    joinBtn.setAttribute('rel', 'noopener');
    body.append(joinBtn);
  }

  li.append(body);
  decorateIcons(li);
  return li;
}

function createCarouselControls(placeholders) {
  const navButtons = document.createElement('div');
  navButtons.className = 'events-carousel-nav';
  navButtons.innerHTML = `
    <button type="button" class="events-nav-prev" aria-label="${placeholders.previousSlide || 'Previous Slide'}"></button>
    <button type="button" class="events-nav-next" aria-label="${placeholders.nextSlide || 'Next Slide'}"></button>
  `;
  return navButtons;
}

function updateCarousel(block, slideIndex) {
  const container = block.querySelector('.events-carousel-container');
  const slides = block.querySelectorAll('.events-carousel-slide');
  if (!container || slides.length === 0) return;

  const maxIndex = slides.length - 1;
  let idx = slideIndex;
  if (idx < 0) idx = maxIndex;
  else if (idx > maxIndex) idx = 0;

  container.scrollTo({ left: slides[idx].offsetLeft, behavior: 'smooth' });
  block.classList.toggle('at-start', idx === 0);
  block.classList.toggle('at-end', idx === maxIndex);
  block.dataset.currentSlide = idx;
}

function bindCarouselEvents(block) {
  const prevBtn = block.querySelector('.events-nav-prev');
  const nextBtn = block.querySelector('.events-nav-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      updateCarousel(block, parseInt(block.dataset.currentSlide || '0', 10) - 1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      updateCarousel(block, parseInt(block.dataset.currentSlide || '0', 10) + 1);
    });
  }

  block.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prevBtn?.click(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nextBtn?.click(); }
  });

  const container = block.querySelector('.events-carousel-container');
  if (container) {
    let scrollTimeout;
    container.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const slides = block.querySelectorAll('.events-carousel-slide');
        const { scrollLeft } = container;
        let closestIndex = 0;
        let closestDistance = Infinity;
        slides.forEach((slide, i) => {
          const distance = Math.abs(slide.offsetLeft - scrollLeft);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = i;
          }
        });
        block.classList.toggle('at-start', closestIndex === 0);
        block.classList.toggle('at-end', closestIndex === slides.length - 1);
        block.dataset.currentSlide = closestIndex;
      }, 100);
    });
  }
}

export default async function decorate(block) {
  const [placeholders, data] = await Promise.all([
    fetchPlaceholders(),
    fetchEventsData(),
  ]);

  if (data.length === 0) {
    block.textContent = '';
    const empty = document.createElement('p');
    empty.className = 'events-empty';
    empty.textContent = 'No events available at this time.';
    block.append(empty);
    return;
  }

  const events = filterAndSortEvents(data);

  const cards = events.map((row) => buildEventCard(row));

  const cardsPerSlide = 3;
  const slides = [];
  for (let i = 0; i < cards.length; i += cardsPerSlide) {
    slides.push(cards.slice(i, i + cardsPerSlide));
  }

  const carouselWrapper = document.createElement('div');
  carouselWrapper.className = 'events-carousel-wrapper';

  const slidesContainer = document.createElement('div');
  slidesContainer.className = 'events-carousel-slides-container';

  const carouselContainer = document.createElement('div');
  carouselContainer.className = 'events-carousel-container';

  slides.forEach((slideCards, slideIdx) => {
    const slide = document.createElement('div');
    slide.className = 'events-carousel-slide';
    slide.dataset.slideIndex = slideIdx;
    const slideContent = document.createElement('div');
    slideContent.className = 'events-carousel-slide-content';
    slideCards.forEach((card) => slideContent.appendChild(card));
    slide.appendChild(slideContent);
    carouselContainer.appendChild(slide);
  });

  slidesContainer.appendChild(carouselContainer);

  if (slides.length > 1) {
    slidesContainer.appendChild(createCarouselControls(placeholders));
  }

  carouselWrapper.appendChild(slidesContainer);

  block.textContent = '';
  block.appendChild(carouselWrapper);
  block.dataset.currentSlide = '0';
  block.classList.add('at-start');

  if (slides.length > 1) {
    bindCarouselEvents(block);
    updateCarousel(block, 0);
  }
}
