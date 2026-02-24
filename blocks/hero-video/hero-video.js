/*
 * Hero Video block — full-width hero with video background.
 * Video path: configurable via block table (video | URL) or defaults to /assets/@tech-council/assets/file.webm
 */
import { readBlockConfig } from '../../scripts/aem.js';

const DEFAULT_VIDEO_PATH = '/tech-council/assets/file.webm';

function toAbsoluteVideoUrl(path) {
  if (!path || typeof path !== 'string') return DEFAULT_VIDEO_PATH;
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = (typeof window !== 'undefined' && window.hlx?.codeBasePath)
    ? window.hlx.codeBasePath.replace(/\/$/, '')
    : '';
  const resolved = trimmed.startsWith('/')
    ? trimmed
    : `${base ? `/${base}` : ''}/${trimmed.replace(/^\//, '')}`.replace(/\/+/g, '/');
  try {
    return new URL(resolved, typeof window !== 'undefined' ? window.location.origin : '').href;
  } catch {
    return trimmed;
  }
}

function extractContent(block) {
  const config = readBlockConfig(block);
  const rows = [...block.querySelectorAll(':scope > div')];
  let title = '';
  let description = '';

  for (const row of rows) {
    const cols = [...row.children];
    const firstCell = cols[0];
    const secondCell = cols[1];
    const key = (firstCell?.textContent?.trim() || '').toLowerCase();
    if (key === 'video' || key === 'hero-video') continue;

    const h2 = firstCell?.querySelector('h2');
    if (h2) {
      title = h2.textContent.trim();
      description = secondCell ? secondCell.innerHTML.trim() : '';
      break;
    }
    if (key === 'title' || key === 'heading') {
      title = secondCell?.textContent?.trim() || secondCell?.innerHTML?.trim() || '';
      continue;
    }
    if (key === 'description') {
      description = secondCell?.innerHTML?.trim() || secondCell?.textContent?.trim() || '';
      continue;
    }
    if (firstCell && secondCell && !key.match(/^(video|cta|button)$/)) {
      title = firstCell.textContent.trim();
      description = secondCell.innerHTML.trim();
      if (title || description) break;
    }
  }

  return {
    title: title || config.heading || config.title,
    description: description || config.description,
    cta: config.cta || config.button,
    video: config.video,
  };
}

export default function decorate(block) {
  const { title, description, cta, video: configVideo } = extractContent(block);
  const rawPath = (configVideo && configVideo.trim()) ? configVideo.trim() : DEFAULT_VIDEO_PATH;
  const videoUrl = toAbsoluteVideoUrl(rawPath);

  block.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'hero-video-wrapper';

  const videoCol = document.createElement('div');
  videoCol.className = 'hero-video-media-col';

  const videoContainer = document.createElement('div');
  videoContainer.className = 'hero-video-media';

  const video = document.createElement('video');
  video.className = 'hero-video-element';
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.muted = true;
  video.setAttribute('autoplay', '');
  video.setAttribute('loop', '');
  video.setAttribute('preload', 'auto');
  video.setAttribute('aria-label', 'Hero background video');

  const source = document.createElement('source');
  source.src = videoUrl;
  source.type = 'video/webm';
  video.appendChild(source);

  const playVideo = () => {
    video.play().catch(() => {});
  };

  video.addEventListener('loadeddata', playVideo);
  video.addEventListener('canplay', playVideo);
  video.addEventListener('error', () => {
    videoContainer.classList.add('hero-video-error');
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        playVideo();
        observer.disconnect();
      }
    });
  }, { threshold: 0.1 });
  observer.observe(video);

  if (video.readyState >= 2) playVideo();

  videoContainer.appendChild(video);
  videoCol.appendChild(videoContainer);
  wrapper.appendChild(videoCol);

  const contentCol = document.createElement('div');
  contentCol.className = 'hero-video-content-col';

  if (title || description || cta) {
    if (title) {
      const h2 = document.createElement('h2');
      h2.textContent = String(title).trim();
      contentCol.appendChild(h2);
    }
    if (description) {
      const desc = document.createElement('div');
      desc.className = 'hero-video-description';
      desc.innerHTML = description;
      contentCol.appendChild(desc);
    }
    if (cta) {
      const href = typeof cta === 'string' ? cta : (cta?.href || cta);
      const a = document.createElement('a');
      a.href = href;
      a.className = 'button';
      a.textContent = (typeof cta === 'object' && cta?.text) ? cta.text : 'Learn more';
      contentCol.appendChild(a);
    }
    wrapper.appendChild(contentCol);
  }

  block.appendChild(wrapper);
}
