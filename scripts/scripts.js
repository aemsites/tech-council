import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
} from './aem.js';

/**
 * Highlights occurrences of the `highlight` query parameter in the given root element.
 * Safely walks text nodes (no innerHTML replacement), handles spaces/special characters,
 * and scrolls to the first highlight if there is no location hash.
 * @param {Element} root The container element within which to highlight
 */
function highlightFromQuery(root) {
  try {
    const params = new URLSearchParams(window.location.search);
    let term = params.get('highlight');
    if (!term) return;

    // URLSearchParams decodes %XX, but not '+', so treat '+' as space defensively
    term = term.replace(/\+/g, ' ').trim();
    if (!term) return;

    // Escape regex special characters to match literal input
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');

    const highlights = [];
    const isSkippableContainer = (el) => {
      if (!el) return true;
      const tag = el.tagName;
      return ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'SVG'].includes(tag) ||
        el.closest('.hlx-highlight');
    };

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || isSkippableContainer(parent)) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue) return NodeFilter.FILTER_SKIP;
          // Using test will advance lastIndex when global; reset immediately after
          const hasMatch = regex.test(node.nodeValue);
          regex.lastIndex = 0;
          return hasMatch ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      },
    );

    const replacementSpans = [];
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const textContent = textNode.nodeValue;
      if (!textContent) continue;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(textContent))) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;
        if (matchStart > lastIndex) {
          fragment.appendChild(document.createTextNode(textContent.slice(lastIndex, matchStart)));
        }
        const span = document.createElement('span');
        span.className = 'hlx-highlight';
        span.style.backgroundColor = 'yellow';
        span.textContent = match[0];
        fragment.appendChild(span);
        highlights.push(span);
        replacementSpans.push(span);
        lastIndex = matchEnd;
      }
      if (lastIndex < textContent.length) {
        fragment.appendChild(document.createTextNode(textContent.slice(lastIndex)));
      }
      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    }

    if (highlights.length > 0 && !window.location.hash) {
      highlights[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Highlighting failed:', e);
  }
}

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadSections(main);

  // Highlight and optionally scroll to matches from ?highlight= query param
  if (main) highlightFromQuery(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
