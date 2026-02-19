/**
 * Lottie animation block (v7) — Panels / EDS/DA.
 * Pattern from https://www.getswivel.io/ (e-lottie__animation, viewBox 610×352).
 * Authors set animation path/URL in block table: animation | URL or path.
 *
 * EDS: Uses lottie-web SVG renderer only (no <lottie-player> — Shadow DOM/WASM fails on EDS CSP).
 * AE expressions (e.g. loopOut('cycle')) are expanded to keyframes so the expression evaluator is not used.
 * Debug: ?lottie=immediate for immediate load; window.lottie.getRegisteredAnimations() to confirm load.
 */
import { readBlockConfig } from '../../scripts/aem.js';

const LOTTIE_WEB_SCRIPT = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie_light.min.js';
const DEBUG = true; // set false in production; helps trace "Lottie:" in console

function log(...args) {
  if (DEBUG && typeof console !== 'undefined' && console.info) {
    console.info('[Lottie]', ...args);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      log('script already on page');
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => { log('script loaded'); resolve(); };
    script.onerror = () => reject(new Error(`Script failed: ${src}`));
    document.body.appendChild(script);
  });
}

function waitForLottie(maxMs = 5000) {
  if (window.lottie && typeof window.lottie.loadAnimation === 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function check() {
      if (window.lottie && typeof window.lottie.loadAnimation === 'function') {
        log('lottie-web ready');
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('lottie-web not available'));
        return;
      }
      setTimeout(check, 50);
    }
    check();
  });
}

function toAbsoluteJsonUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = (typeof window !== 'undefined' && window.hlx?.codeBasePath) ? window.hlx.codeBasePath.replace(/\/$/, '') : '';
  const path = trimmed.startsWith('/')
    ? trimmed
    : (`${base ? `/${base}` : ''}/${trimmed.replace(/^\//, '')}`).replace(/\/+/g, '/');
  try {
    return new URL(path, typeof window !== 'undefined' ? window.location.origin : '').href;
  } catch {
    return trimmed;
  }
}

function expandTmCycles(data) {
  const walk = (layers) => {
    if (!Array.isArray(layers)) return;
    layers.forEach((layer) => {
      const { tm } = layer;
      if (!tm || !tm.x || !tm.x.includes('loopOut')) return;
      const kfs = tm.k;
      if (!Array.isArray(kfs) || kfs.length < 2) return;

      const cycleDur = kfs[kfs.length - 1].t - kfs[0].t;
      if (cycleDur <= 0) return;

      const dur = (layer.op || 900) - (layer.ip || 0);
      const cycles = Math.ceil(dur / cycleDur) + 1;
      const expanded = [];

      for (let c = 0; c < cycles; c += 1) {
        const off = c * cycleDur;
        kfs.forEach((kf) => {
          const copy = JSON.parse(JSON.stringify(kf));
          copy.t = kf.t + off;
          expanded.push(copy);
        });
      }

      tm.k = expanded;
      delete tm.x;
    });
  };
  walk(data.layers);
  if (Array.isArray(data.assets)) {
    data.assets.forEach((a) => walk(a.layers));
  }
}

function stripRemainingExpressions(obj, seen = new Set()) {
  if (!obj || typeof obj !== 'object') return;
  if (seen.has(obj)) {
    if (!Array.isArray(obj) && 'x' in obj && typeof obj.x === 'string') delete obj.x;
    return;
  }
  seen.add(obj);
  if (Array.isArray(obj)) {
    obj.forEach((item) => stripRemainingExpressions(item, seen));
    return;
  }
  if ('x' in obj && typeof obj.x === 'string') delete obj.x;
  Object.values(obj).forEach((v) => stripRemainingExpressions(v, seen));
}

function loadLottieIntoContainer(container) {
  const jsonUrl = container.getAttribute('data-jsonsrc');
  if (!jsonUrl) {
    log('no data-jsonsrc');
    return;
  }
  if (container.dataset.lottieLoaded === 'true') {
    log('already loaded');
    return;
  }
  container.dataset.lottieLoaded = 'true';
  container.dataset.lottieStatus = 'loading';

  const showError = (msg, err) => {
    container.dataset.lottieStatus = 'error';
    container.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'lottie-error';
    p.textContent = msg;
    p.style.cssText = 'padding:1rem;color:#c00;font-size:0.875rem;';
    container.appendChild(p);
    if (err && console && console.error) {
      console.error('[Lottie]', msg, err);
    }
  };

  const absoluteUrl = toAbsoluteJsonUrl(jsonUrl);
  log('loading from', absoluteUrl);

  const inner = document.createElement('div');
  inner.className = 'lottie-inner';
  inner.setAttribute('aria-hidden', 'true');
  const isSwivelStyle = container.classList.contains('e-lottie__animation');
  inner.style.minHeight = isSwivelStyle ? '352px' : '250px';
  inner.style.width = '100%';
  container.appendChild(inner);

  const lottieReady = window.lottie
    && typeof window.lottie.loadAnimation === 'function';
  const scriptPromise = lottieReady
    ? Promise.resolve()
    : loadScript(LOTTIE_WEB_SCRIPT).then(() => waitForLottie());

  scriptPromise
    .then(() => fetch(absoluteUrl))
    .then((res) => {
      if (!res.ok) throw new Error(`JSON ${res.status}: ${absoluteUrl}`);
      return res.json();
    })
    .then((animationData) => {
      log('JSON loaded, frames/layers:', animationData?.op != null ? 'yes' : 'no');
      expandTmCycles(animationData);
      stripRemainingExpressions(animationData);
      const { lottie } = window;
      if (!lottie || typeof lottie.loadAnimation !== 'function') {
        throw new Error('lottie-web not available');
      }
      const runInit = () => {
        const useCanvas = container.dataset.lottieRenderer === 'canvas';
        const startFrame = 0;
        const endFrame = animationData.op != null ? Math.ceil(animationData.op) : 857;
        const anim = lottie.loadAnimation({
          container: inner,
          renderer: useCanvas ? 'canvas' : 'svg',
          loop: true,
          autoplay: true,
          animationData,
          initialSegment: [startFrame, endFrame],
          rendererSettings: useCanvas
            ? { preserveAspectRatio: 'xMidYMid meet' }
            : { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: false },
        });
        container.dataset.lottieStatus = 'loaded';
        if (anim && typeof anim.play === 'function') {
          anim.play();
        }
        log(
          'animation started',
          useCanvas ? '(canvas)' : '(svg)',
          'segment',
          startFrame,
          '-',
          endFrame,
        );
        if (DEBUG && window.lottie
          && window.lottie.getRegisteredAnimations) {
          setTimeout(() => {
            const count = window.lottie
              .getRegisteredAnimations().length;
            const rect = inner.getBoundingClientRect();
            log(
              'getRegisteredAnimations:',
              count,
              '| container size:',
              rect.width,
              'x',
              rect.height,
            );
          }, 500);
        }
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(runInit);
      });
    })
    .catch((err) => {
      showError('Animation could not be loaded.', err);
    });
}

function initLottieWhenVisible(container) {
  const jsonUrl = container.getAttribute('data-jsonsrc');
  if (!jsonUrl) return;

  let loaded = false;
  const run = () => {
    if (loaded) return;
    loaded = true;
    loadLottieIntoContainer(container);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) run();
    });
  }, { rootMargin: '100px', threshold: 0 });

  observer.observe(container);

  setTimeout(() => {
    if (container.dataset.lottieLoaded !== 'true') run();
  }, 500);
}

function getDefaultJsonUrl() {
  const base = (typeof window !== 'undefined' && window.hlx?.codeBasePath) ? window.hlx.codeBasePath.replace(/\/$/, '') : '';
  const path = `${base}/blocks/lottie-animation-v7/panels.json`;
  try {
    return new URL(path, typeof window !== 'undefined' ? window.location.origin : '').href;
  } catch {
    return '/blocks/lottie-animation-v7/panels.json';
  }
}

let lottieV7BlockCount = 0;

export default function decorate(block) {
  const config = readBlockConfig(block);
  const raw = (config.animation && config.animation.trim())
    ? config.animation.trim() : getDefaultJsonUrl();
  const jsonUrl = toAbsoluteJsonUrl(raw);

  log('block decorate (v7 Panels)', jsonUrl);

  const container = document.createElement('div');
  container.id = `lottie-v7-${lottieV7BlockCount += 1}`;
  container.className = 'e-lottie__animation lottie-lazy lottie-container';
  container.setAttribute('data-jsonsrc', jsonUrl);
  container.setAttribute('data-lottie-renderer', 'svg');
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label', 'Animation');

  block.innerHTML = '';
  block.appendChild(container);

  const immediate = config.immediate === true || config.immediate === 'true'
    || (typeof window !== 'undefined' && window.location?.search?.includes('lottie=immediate'));
  if (immediate) {
    log('immediate load (no lazy)');
    loadLottieIntoContainer(container);
  } else {
    initLottieWhenVisible(container);
  }
}