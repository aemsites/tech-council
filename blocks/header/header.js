import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');
const DEFAULT_BRAND_LOGO = '/icons/tc-logo.png';

function closeOnEscape(e) {
  if (e.code === 'Escape') {
    const nav = document.getElementById('nav');
    const navSections = nav.querySelector('.nav-sections');
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections);
      navSectionExpanded.focus();
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections);
      nav.querySelector('button').focus();
    }
  }
}

function closeOnFocusLost(e) {
  const nav = e.currentTarget;
  if (!nav.contains(e.relatedTarget)) {
    const navSections = nav.querySelector('.nav-sections');
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections, false);
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections, false);
    }
  }
}

function openOnKeydown(e) {
  const focused = document.activeElement;
  const isNavDrop = focused.className === 'nav-drop';
  if (isNavDrop && (e.code === 'Enter' || e.code === 'Space')) {
    const dropExpanded = focused.getAttribute('aria-expanded') === 'true';
    // eslint-disable-next-line no-use-before-define
    toggleAllNavSections(focused.closest('.nav-sections'));
    focused.setAttribute('aria-expanded', dropExpanded ? 'false' : 'true');
  }
}

function focusNavSection() {
  document.activeElement.addEventListener('keydown', openOnKeydown);
}

/**
 * Toggles all nav sections
 * @param {Element} sections The container element
 * @param {Boolean} expanded Whether the element should be expanded or collapsed
 */
function toggleAllNavSections(sections, expanded = false) {
  sections.querySelectorAll('.nav-sections .default-content-wrapper > ul > li').forEach((section) => {
    section.setAttribute('aria-expanded', expanded);
  });
}

/**
 * Toggles the entire nav
 * @param {Element} nav The container element
 * @param {Element} navSections The nav sections within the container element
 * @param {*} forceExpanded Optional param to force nav expand behavior when not null
 */
function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null ? !forceExpanded : nav.getAttribute('aria-expanded') === 'true';
  const button = nav.querySelector('.nav-hamburger button');
  document.body.style.overflowY = (expanded || isDesktop.matches) ? '' : 'hidden';
  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  toggleAllNavSections(navSections, expanded || isDesktop.matches ? 'false' : 'true');
  button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  // enable nav dropdown keyboard accessibility
  const navDrops = navSections.querySelectorAll('.nav-drop');
  if (isDesktop.matches) {
    navDrops.forEach((drop) => {
      if (!drop.hasAttribute('tabindex')) {
        drop.setAttribute('tabindex', 0);
        drop.addEventListener('focus', focusNavSection);
      }
    });
  } else {
    navDrops.forEach((drop) => {
      drop.removeAttribute('tabindex');
      drop.removeEventListener('focus', focusNavSection);
    });
  }

  // enable menu collapse on escape keypress
  if (!expanded || isDesktop.matches) {
    // collapse menu on escape press
    window.addEventListener('keydown', closeOnEscape);
    // collapse menu on focus lost
    nav.addEventListener('focusout', closeOnFocusLost);
  } else {
    window.removeEventListener('keydown', closeOnEscape);
    nav.removeEventListener('focusout', closeOnFocusLost);
  }
}

/**
 * Highlights the active navigation item based on current page
 * @param {Element} nav The nav element
 */
function normalizePath(pathname) {
  if (!pathname) return '/';
  return pathname === '/' ? '/' : pathname.replace(/\/$/, '');
}

function highlightActiveNav(nav) {
  const currentPath = normalizePath(window.location.pathname);
  const navLinks = nav.querySelectorAll('.nav-sections a');
  let bestMatch = null;

  navLinks.forEach((link) => {
    const linkPath = new URL(link.href).pathname;
    const normalizedLink = normalizePath(linkPath);
    const isExact = currentPath === normalizedLink;
    const isSectionMatch = normalizedLink !== '/' && currentPath.startsWith(`${normalizedLink}/`);
    if (!isExact && !isSectionMatch) return;
    if (!bestMatch || normalizedLink.length > bestMatch.path.length) {
      bestMatch = { link, path: normalizedLink };
    }
  });

  if (bestMatch?.link) {
    bestMatch.link.classList.add('active');
    bestMatch.link.setAttribute('aria-current', 'page');
  }
}

function decorateBrand(nav) {
  const navBrand = nav.querySelector('.nav-brand');
  if (!navBrand) return;

  const brandLink = navBrand.querySelector('a:any-link');
  if (!brandLink) return;

  brandLink.classList.remove('button', 'primary', 'secondary');
  const buttonContainer = brandLink.closest('.button-container');
  if (buttonContainer) buttonContainer.classList.remove('button-container');

  const logoSrc = getMetadata('nav-logo') || DEFAULT_BRAND_LOGO;
  let logo = brandLink.querySelector('img');
  if (!logo) {
    logo = document.createElement('img');
    logo.src = logoSrc;
    logo.alt = 'Tech Council';
    logo.loading = 'lazy';
    logo.width = 28;
    logo.height = 28;
    logo.className = 'nav-brand-logo';
    brandLink.prepend(logo);
  } else {
    logo.classList.add('nav-brand-logo');
  }

  const textNodes = [...brandLink.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  const text = textNodes.length
    ? textNodes.map((node) => node.textContent.trim()).join(' ')
    : brandLink.textContent.trim() || 'Tech Council';
  textNodes.forEach((node) => node.remove());
  if (!brandLink.querySelector('.nav-brand-text')) {
    brandLink.textContent = '';
    brandLink.append(createBrandTextSpan(text));
  }
}

function createBrandTextSpan(text) {
  const wrapper = document.createElement('span');
  wrapper.className = 'nav-brand-text';
  const normalized = text.trim();
  if (normalized.toLowerCase() === 'tech council') {
    const tech = document.createElement('span');
    tech.className = 'nav-brand-text-tech';
    tech.textContent = 'Tech';
    const council = document.createElement('span');
    council.className = 'nav-brand-text-council';
    council.textContent = ' Council';
    wrapper.append(tech, council);
  } else {
    wrapper.textContent = text;
  }
  return wrapper;
}

/**
 * Adds scroll behavior to header
 * @param {Element} navWrapper The nav wrapper element
 */
function handleScrollBehavior(navWrapper) {
  let lastScroll = 0;
  const scrollThreshold = 100;

  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    // Add shadow when scrolled
    if (currentScroll > 10) {
      navWrapper.classList.add('scrolled');
    } else {
      navWrapper.classList.remove('scrolled');
    }

    // Hide/show header on scroll (optional - can be enabled if desired)
    // Uncomment below for auto-hide behavior
    /*
    if (currentScroll > scrollThreshold) {
      if (currentScroll > lastScroll && !navWrapper.classList.contains('scroll-down')) {
        navWrapper.classList.add('scroll-down');
        navWrapper.classList.remove('scroll-up');
      } else if (currentScroll < lastScroll && navWrapper.classList.contains('scroll-down')) {
        navWrapper.classList.remove('scroll-down');
        navWrapper.classList.add('scroll-up');
      }
    }
    */
    
    lastScroll = currentScroll;
  });
}

/**
 * Adds skip to main content link for accessibility
 * @param {Element} block The header block element
 */
function addSkipLink(block) {
  const skipLink = document.createElement('a');
  skipLink.href = '#main';
  skipLink.className = 'skip-link';
  skipLink.textContent = 'Skip to main content';
  block.prepend(skipLink);
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  // Add skip link for accessibility
  addSkipLink(block);

  // load nav as fragment
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);

  // decorate nav DOM
  block.textContent = '';
  const nav = document.createElement('nav');
  nav.id = 'nav';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Main navigation');
  while (fragment.firstElementChild) nav.append(fragment.firstElementChild);

  const classes = ['brand', 'sections', 'tools'];
  classes.forEach((c, i) => {
    const section = nav.children[i];
    if (section) section.classList.add(`nav-${c}`);
  });

  decorateBrand(nav);

  const navSections = nav.querySelector('.nav-sections');
  if (navSections) {
    navSections.querySelectorAll(':scope .default-content-wrapper > ul > li').forEach((navSection) => {
      if (navSection.querySelector('ul')) navSection.classList.add('nav-drop');
      navSection.addEventListener('click', () => {
        if (isDesktop.matches) {
          const expanded = navSection.getAttribute('aria-expanded') === 'true';
          toggleAllNavSections(navSections);
          navSection.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        }
      });
    });
  }

  // hamburger for mobile
  const hamburger = document.createElement('div');
  hamburger.classList.add('nav-hamburger');
  hamburger.innerHTML = `<button type="button" aria-controls="nav" aria-label="Open navigation">
      <span class="nav-hamburger-icon"></span>
    </button>`;
  hamburger.addEventListener('click', () => toggleMenu(nav, navSections));
  nav.prepend(hamburger);
  nav.setAttribute('aria-expanded', 'false');
  // prevent mobile nav behavior on window resize
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);

  // Highlight active navigation item
  highlightActiveNav(nav);

  // Add scroll behavior
  handleScrollBehavior(navWrapper);
}
