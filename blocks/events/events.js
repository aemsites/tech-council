import { createOptimizedPicture, decorateIcons } from '../../scripts/aem.js';
import { fetchPlaceholders } from '../../scripts/placeholders.js';

/**
 * Parse date from event date string
 * Supports formats like "Dec 16, 2025" or "December 16, 2025"
 */
function parseEventDate(dateText) {
  if (!dateText) return null;
  try {
    // Remove icon elements and extra whitespace
    const cleanText = dateText.replace(/<[^>]*>/g, '').trim();
    // Try to parse the date
    const date = new Date(cleanText);
    // Check if date is valid
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to parse date:', dateText, e);
  }
  
  return null;
}

/**
 * Filter events to show future events, backfilled with past events up to 10 total
 */
function filterEvents(events) {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Start of today
  const maxEvents = 10;
  
  // Separate and sort future and past events
  const futureEvents = events
    .filter(e => e.date && e.date >= now)
    .sort((a, b) => a.date - b.date); // Earliest future event first
  
  const pastEvents = events
    .filter(e => e.date && e.date < now)
    .sort((a, b) => b.date - a.date); // Most recent past event first
  
  // Start with future events (up to 10)
  const result = futureEvents.slice(0, maxEvents);
  
  // If we have fewer than 10 events, backfill with past events
  if (result.length < maxEvents) {
    const needed = maxEvents - result.length;
    const backfill = pastEvents.slice(0, needed);
    result.push(...backfill);
  }
  
  return result;
}

/**
 * Create carousel navigation
 */
function createCarouselControls(block, slideCount, placeholders) {
  // Navigation buttons
  const navButtons = document.createElement('div');
  navButtons.className = 'events-carousel-nav';
  navButtons.innerHTML = `
    <button type="button" class="events-nav-prev" aria-label="${placeholders.previousSlide || 'Previous Slide'}"></button>
    <button type="button" class="events-nav-next" aria-label="${placeholders.nextSlide || 'Next Slide'}"></button>
  `;
  
  return { navButtons };
}

/**
 * Update carousel slide position
 */
function updateCarousel(block, slideIndex) {
  const container = block.querySelector('.events-carousel-container');
  const slides = block.querySelectorAll('.events-carousel-slide');
  
  if (!container || slides.length === 0) return;
  
  // Normalize slide index - wrap around
  const maxIndex = slides.length - 1;
  let normalizedIndex = slideIndex;
  
  if (slideIndex < 0) {
    normalizedIndex = maxIndex;
  } else if (slideIndex > maxIndex) {
    normalizedIndex = 0;
  }
  
  // Update active slide
  container.scrollTo({
    left: slides[normalizedIndex].offsetLeft,
    behavior: 'smooth',
  });
  
  // Update edge classes for decorative gradients
  block.classList.toggle('at-start', normalizedIndex === 0);
  block.classList.toggle('at-end', normalizedIndex === maxIndex);
  
  // Store current index
  block.dataset.currentSlide = normalizedIndex;
}

/**
 * Bind carousel events
 */
function bindCarouselEvents(block) {
  const prevBtn = block.querySelector('.events-nav-prev');
  const nextBtn = block.querySelector('.events-nav-next');
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const current = parseInt(block.dataset.currentSlide || '0', 10);
      updateCarousel(block, current - 1);
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const current = parseInt(block.dataset.currentSlide || '0', 10);
      updateCarousel(block, current + 1);
    });
  }
  
  // Keyboard navigation
  block.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevBtn?.click();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextBtn?.click();
    }
  });
  
  // Update on scroll (for touch/swipe)
  const container = block.querySelector('.events-carousel-container');
  if (container) {
    let scrollTimeout;
    container.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const slides = block.querySelectorAll('.events-carousel-slide');
        const scrollLeft = container.scrollLeft;
        
        // Find closest slide
        let closestIndex = 0;
        let closestDistance = Infinity;
        
        slides.forEach((slide, idx) => {
          const distance = Math.abs(slide.offsetLeft - scrollLeft);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = idx;
          }
        });
        
        // Update edge classes
        block.classList.toggle('at-start', closestIndex === 0);
        block.classList.toggle('at-end', closestIndex === slides.length - 1);
        
        block.dataset.currentSlide = closestIndex;
      }, 100);
    });
  }
}

/**
 * Decorates the Events block as a carousel with smart filtering
 */
export default async function decorate(block) {
  try {
    const placeholders = await fetchPlaceholders();
    
    // Parse all events first
    const rows = [...block.children];
    const allEvents = [];
    
    rows.forEach((row) => {
      const li = document.createElement('li');
      li.className = 'events-card';
      
      // Move all children of the current row into the list item
      while (row.firstElementChild) {
        li.append(row.firstElementChild);
      }
      
      // Identify image and body containers
      [...li.children].forEach((div) => {
        if (div.children.length === 1 && div.querySelector('picture')) {
          div.className = 'events-card-image';
        } else {
          div.className = 'events-card-body';
        }
      });
      
      // Assign semantic classes to body children (title, date, location)
      const body = li.querySelector('.events-card-body');
      if (body) {
        // If content not already separated into multiple elements, split by <br>
        if (body.children.length === 1) {
          const container = body.children[0];
          if (container.innerHTML.includes('<br')) {
            const parts = container.innerHTML.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean);
            body.textContent = '';
            parts.forEach((html) => {
              const p = document.createElement('p');
              p.innerHTML = html;
              body.append(p);
            });
          }
        }
        
        // Apply classes based on ordering
        [...body.children].forEach((child, idx) => {
          child.classList.remove('events-card-title', 'events-card-date', 'events-card-location');
          if (idx === 0) child.classList.add('events-card-title');
          else if (idx === 1) child.classList.add('events-card-date');
          else if (idx === 2) child.classList.add('events-card-location');
        });
        
        // Inject icons for date and location
        const dateEl = body.querySelector('.events-card-date');
        if (dateEl && !dateEl.querySelector('span.icon')) {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'icon icon-calendar';
          iconSpan.setAttribute('aria-hidden', 'true');
          dateEl.prepend(iconSpan);
        }
        
        const locationEl = body.querySelector('.events-card-location');
        if (locationEl && !locationEl.querySelector('span.icon')) {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'icon icon-location';
          iconSpan.setAttribute('aria-hidden', 'true');
          locationEl.prepend(iconSpan);
        }
        
        // Convert icon spans to images
        decorateIcons(body);
        
        // Parse event date and add badge (Upcoming/Past)
        if (dateEl) {
          const dateText = dateEl.textContent;
          const eventDate = parseEventDate(dateText);
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const isUpcoming = eventDate && eventDate >= now;
          li.classList.add(isUpcoming ? 'is-upcoming' : 'is-past');
          const badge = document.createElement('span');
          badge.className = 'events-card-badge';
          badge.textContent = isUpcoming ? 'Upcoming' : 'Past';
          badge.setAttribute('aria-hidden', 'true');
          li.prepend(badge);
          allEvents.push({ element: li, date: eventDate });
        } else {
          allEvents.push({ element: li, date: null });
        }
      } else {
        allEvents.push({ element: li, date: null });
      }
      
      // Optimize pictures
      li.querySelectorAll('picture > img').forEach((img) => {
        const picture = img.closest('picture');
        if (picture) {
          picture.replaceWith(
            createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]),
          );
        }
      });
      
      // Ensure links open in new tab
      li.querySelectorAll('a').forEach((a) => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      });
    });
    
    // Filter events based on criteria
    const filteredEvents = filterEvents(allEvents);

    // Create "See more" card
    const seeMoreCard = document.createElement('li');
    seeMoreCard.className = 'events-card events-card-see-more';
    const seeMoreLink = document.createElement('a');
    seeMoreLink.href = '/events';
    seeMoreLink.className = 'events-see-more-button';
    seeMoreLink.textContent = placeholders.seeMore || 'See more';
    seeMoreCard.appendChild(seeMoreLink);
    filteredEvents.push({ element: seeMoreCard, date: null, isSeeMore: true });

    if (filteredEvents.length === 0) {
      block.innerHTML = '<p class="events-empty">No events available at this time.</p>';
      return;
    }

    // Group events into slides (4 per slide on desktop, responsive)
    const cardsPerSlide = 4;
    const slides = [];
    
    for (let i = 0; i < filteredEvents.length; i += cardsPerSlide) {
      slides.push(filteredEvents.slice(i, i + cardsPerSlide));
    }
    
    // Create carousel structure
    const carouselWrapper = document.createElement('div');
    carouselWrapper.className = 'events-carousel-wrapper';
    
    const slidesContainer = document.createElement('div');
    slidesContainer.className = 'events-carousel-slides-container';
    
    const carouselContainer = document.createElement('div');
    carouselContainer.className = 'events-carousel-container';
    
    // Create slides
    slides.forEach((slideEvents, slideIdx) => {
      const slide = document.createElement('div');
      slide.className = 'events-carousel-slide';
      slide.dataset.slideIndex = slideIdx;
      
      const slideContent = document.createElement('div');
      slideContent.className = 'events-carousel-slide-content';
      
      slideEvents.forEach((eventObj) => {
        slideContent.appendChild(eventObj.element);
      });
      
      slide.appendChild(slideContent);
      carouselContainer.appendChild(slide);
    });
    
    slidesContainer.appendChild(carouselContainer);
    
    // Add navigation if more than one slide
    if (slides.length > 1) {
      const { navButtons } = createCarouselControls(block, slides.length, placeholders);
      slidesContainer.appendChild(navButtons);
    }
    
    carouselWrapper.appendChild(slidesContainer);
    
    // Replace block content
    block.textContent = '';
    block.appendChild(carouselWrapper);
    block.dataset.currentSlide = '0';
    
    // Set initial edge class
    block.classList.add('at-start');
    
    // Bind events if carousel has multiple slides
    if (slides.length > 1) {
      bindCarouselEvents(block);
      updateCarousel(block, 0);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to decorate events block:', error);
  }
} 