import parseRecordingTime from './recording-time.js';
import { getRecordingTags } from './recording-fields.js';

let listeningForHash = false;

function openLinkedSection() {
  let id;
  try {
    id = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return;
  }
  const target = document.getElementById(id);
  if (!target?.closest('.talk-block, .talk-summary-group')) return;
  let ancestor = target.parentElement;
  while (ancestor) {
    if (ancestor.tagName === 'DETAILS') ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  target.scrollIntoView({ block: 'start' });
}

export function getTalkTiming(fields) {
  const start = parseRecordingTime(fields.start);
  const candidateEnd = parseRecordingTime(fields.end);
  const end = start !== null && candidateEnd > start ? candidateEnd : null;
  const confidence = String(fields['timing confidence'] || '').trim().toLowerCase();
  return {
    start,
    end,
    duration: end === null ? null : end - start,
    confidence: ['exact', 'segment'].includes(confidence) ? confidence : 'unverified',
  };
}

function readFields(block) {
  return new Map([...block.children].flatMap((row) => {
    if (row.children.length !== 2) return [];
    const [label, value] = row.children;
    return [[label.textContent.trim().toLowerCase(), value]];
  }));
}

function fieldText(fields, name) {
  return fields.get(name)?.textContent.trim() || '';
}

function appendContent(parent, fields, name, className = '', isList = false) {
  const field = fields.get(name);
  if (!field?.textContent.trim()) return;
  const content = document.createElement('div');
  if (className) content.className = className;
  if (isList && !field.querySelector('ul, ol')) {
    const list = document.createElement('ul');
    const paragraphs = [...field.children];
    const entries = paragraphs.length && paragraphs.every((node) => node.tagName === 'P')
      ? paragraphs : [field];
    entries.forEach((entry) => {
      if (!entry.textContent.trim()) return;
      const item = document.createElement('li');
      item.append(...entry.childNodes);
      list.append(item);
    });
    content.append(list);
  } else content.append(...field.childNodes);
  parent.append(content);
}

function appendHeading(parent, text, level = 2) {
  const heading = document.createElement(`h${level}`);
  heading.className = 'talk-block-heading';
  heading.textContent = text;
  parent.append(heading);
}

function appendMetadata(parent, block, fields) {
  const timing = getTalkTiming(Object.fromEntries(
    ['start', 'end', 'timing confidence'].map((name) => [name, fieldText(fields, name)]),
  ));
  const metadata = document.createElement('div');
  metadata.className = 'talk-block-meta';
  block.dataset.timingConfidence = timing.confidence;
  if (timing.start !== null) {
    block.dataset.start = String(timing.start);
    if (timing.end !== null) {
      block.dataset.end = String(timing.end);
      block.dataset.duration = String(timing.duration);
    }
  }

  const tags = getRecordingTags({ tags: fieldText(fields, 'tags') });
  if (tags.length) {
    block.dataset.tags = tags.join(', ');
    const list = document.createElement('ul');
    list.className = 'talk-block-tags';
    list.setAttribute('aria-label', 'Topics');
    tags.forEach((tag) => {
      const item = document.createElement('li');
      item.textContent = tag;
      list.append(item);
    });
    metadata.append(list);
  }
  if (metadata.children.length) parent.append(metadata);
}

export function decorateTalkGroups(main) {
  main.querySelectorAll('.section').forEach((section) => {
    let group;
    let groupType;
    [...section.children].forEach((wrapper) => {
      if (wrapper.hidden) return;
      const block = wrapper.querySelector(':scope > .talk-block');
      const type = block?.classList.contains('talk-block-topic') ? 'topics'
        : block?.classList.contains('talk-block-question') && 'questions';
      if (!type) {
        group = null;
        groupType = null;
        return;
      }
      if (!group || groupType !== type) {
        groupType = type;
        group = document.createElement('section');
        group.className = `talk-summary-group talk-summary-${type}`;
        const header = document.createElement('div');
        header.className = 'talk-group-header';
        const heading = document.createElement('h2');
        heading.className = 'talk-group-heading';
        heading.textContent = type === 'topics' ? 'Topics covered' : 'Questions & answers';
        const base = `talk-${type}`;
        let id = base;
        let suffix = 1;
        while (main.querySelector(`[id="${id}"]`)) {
          suffix += 1;
          id = `${base}-${suffix}`;
        }
        heading.id = id;
        group.setAttribute('aria-labelledby', id);
        header.append(heading);
        group.append(header);
        section.insertBefore(group, wrapper);
      }
      group.append(wrapper);
    });
  });
  main.querySelectorAll('.talk-summary-group').forEach((group) => {
    if (group.querySelector('.talk-group-count')) return;
    const count = document.createElement('span');
    count.className = 'talk-group-count';
    const total = group.querySelectorAll('.talk-block').length;
    const noun = group.classList.contains('talk-summary-topics') ? 'topic' : 'question';
    count.textContent = `${total} ${noun}${total === 1 ? '' : 's'}`;
    group.querySelector('.talk-group-header').append(count);
  });
}

export function decorateTalkOutline(main) {
  decorateTalkGroups(main);
  main.querySelectorAll('.section').forEach((section) => {
    if (section.closest('.recordings-summary-reader')
        || section.querySelector('.recordings-summary-reader, .talk-summary-layout')
        || !section.querySelector(':scope > div > .talk-block, :scope > .talk-summary-group')) return;
    const headings = [...section.querySelectorAll(
      '.talk-group-heading, .talk-block:not(.talk-block-question) .talk-block-heading',
    )];
    if (headings.length < 2) return;
    main.classList.add('talk-summary-page');
    const layout = document.createElement('div');
    layout.className = 'talk-summary-layout';
    const content = document.createElement('div');
    content.className = 'talk-summary-sections';
    const nav = document.createElement('nav');
    nav.className = 'talk-summary-outline';
    nav.setAttribute('aria-label', 'Summary sections');
    const caption = document.createElement('p');
    caption.textContent = 'In this summary';
    nav.append(caption);
    const picker = document.createElement('select');
    picker.className = 'talk-summary-picker';
    picker.setAttribute('aria-label', 'Jump to summary section');
    const jump = (heading) => {
      const disclosure = heading.closest('details');
      if (disclosure) disclosure.open = true;
      window.history.pushState(null, '', `#${encodeURIComponent(heading.id)}`);
      heading.scrollIntoView({ block: 'start' });
      heading.focus({ preventScroll: true });
    };
    const links = headings.map((heading, index) => {
      if (!heading.id) {
        const slug = heading.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const base = `talk-${slug || 'section'}-${index + 1}`;
        let id = base;
        let suffix = 1;
        while (main.querySelector(`[id="${id}"]`)) {
          suffix += 1;
          id = `${base}-${suffix}`;
        }
        heading.id = id;
      }
      heading.tabIndex = -1;
      const link = document.createElement('a');
      link.href = `#${encodeURIComponent(heading.id)}`;
      link.textContent = heading.textContent;
      if (heading.closest('.talk-block-topic')) link.classList.add('talk-outline-topic');
      if (heading.classList.contains('talk-group-heading')) link.classList.add('talk-outline-group');
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        jump(heading);
      });
      nav.append(link);
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = heading.textContent;
      picker.append(option);
      return link;
    });
    picker.addEventListener('change', () => jump(headings[Number(picker.value)]));
    const activate = (index) => {
      links.forEach((link, i) => {
        if (i === index) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      picker.value = String(index);
    };
    activate(0);
    content.append(...section.childNodes);
    layout.append(nav, picker, content);
    section.append(layout);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) activate(headings.indexOf(entry.target));
      });
    }, { rootMargin: '-80px 0px -55% 0px' });
    headings.forEach((heading) => observer.observe(heading));
  });
  openLinkedSection();
}
export function decorateTalkBlock(block, type) {
  const fields = readFields(block);
  if (type === 'question'
      && ['deferred', 'partially answered'].includes(fieldText(fields, 'status').toLowerCase())) {
    block.hidden = true;
    if (block.parentElement?.classList.contains('talk-question-wrapper')) {
      block.parentElement.hidden = true;
    }
    block.replaceChildren();
    return;
  }
  const content = document.createElement('details');
  content.className = 'talk-block-inner';
  content.open = true;
  block.classList.add('talk-block', `talk-block-${type}`);
  if (type === 'question') {
    const question = document.createElement('summary');
    appendHeading(question, fieldText(fields, 'question') || 'Audience question', 3);
    const status = fieldText(fields, 'status');
    if (status) {
      const badge = document.createElement('span');
      badge.className = 'talk-question-status';
      badge.textContent = status;
      question.append(badge);
    }
    content.append(question);
    appendMetadata(content, block, fields);
    appendContent(content, fields, 'answer', 'talk-question-answer');
    const answer = content.querySelector('.talk-question-answer');
    if (answer) {
      const label = document.createElement('strong');
      label.className = 'talk-answer-label';
      label.textContent = 'Answer';
      answer.prepend(label);
    }
  } else {
    const titles = {
      overview: 'Overview',
      takeaways: 'Key takeaways',
      topic: 'Topic',
      followups: 'Follow-ups & open points',
      source: 'About this summary',
    };
    const summary = document.createElement('summary');
    appendHeading(summary, fieldText(fields, 'title') || titles[type], type === 'topic' ? 3 : 2);
    content.append(summary);
    appendMetadata(content, block, fields);
    if (type === 'overview') {
      appendContent(content, fields, 'summary', 'talk-overview-summary');
      if (fieldText(fields, 'audience')) {
        const audience = document.createElement('div');
        audience.className = 'talk-overview-audience';
        const label = document.createElement('strong');
        label.textContent = 'Who this is for';
        audience.append(label);
        appendContent(audience, fields, 'audience');
        content.append(audience);
      }
    } else if (type === 'topic') {
      appendContent(content, fields, 'summary', 'talk-topic-summary');
      appendContent(content, fields, 'key points', 'talk-topic-points', true);
    } else if (type === 'takeaways') appendContent(content, fields, 'takeaways', '', true);
    else if (type === 'followups') appendContent(content, fields, 'items', '', true);
    else if (type === 'source') {
      appendContent(content, fields, 'source', 'talk-source-name');
      appendContent(content, fields, 'limitations');
    }
  }
  const heading = content.querySelector('.talk-block-heading');
  const slug = heading.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const base = `talk-${slug || 'section'}`;
  let id = base;
  let suffix = 1;
  while (block.getRootNode().querySelector(`[id="${id}"]`)) {
    suffix += 1;
    id = `${base}-${suffix}`;
  }
  heading.id = id;
  heading.tabIndex = -1;
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  };
  if (block.dataset.start !== undefined) {
    const time = document.createElement('span');
    time.className = 'talk-section-time';
    const start = formatTime(Number(block.dataset.start));
    const end = block.dataset.end === undefined ? '' : ` - ${formatTime(Number(block.dataset.end))}`;
    time.textContent = ` [${start}${end}]`;
    time.title = block.dataset.timingConfidence === 'segment'
      ? 'Enclosing transcript segment; topic boundaries are approximate.' : 'Recording time';
    content.querySelector('summary').append(time);
  }
  const link = document.createElement('a');
  link.className = 'talk-section-link';
  link.href = `#${encodeURIComponent(id)}`;
  link.textContent = 'Copy link';
  link.setAttribute('aria-label', `Copy link to ${heading.textContent}`);
  link.addEventListener('click', async (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    const url = new URL(window.location.href);
    url.hash = id;
    try {
      await navigator.clipboard.writeText(url.href);
      link.textContent = 'Copied';
      window.setTimeout(() => { link.textContent = 'Copy link'; }, 2000);
    } catch {
      window.location.hash = id;
    }
  });
  content.querySelector('summary').append(link);
  block.replaceChildren(content);
  block.addEventListener('focusin', (event) => {
    if (event.target.classList.contains('talk-block-heading')) content.open = true;
  });
  if (!listeningForHash) {
    window.addEventListener('hashchange', openLinkedSection);
    listeningForHash = true;
  }
  if (window.location.hash === `#${id}`) {
    content.open = true;
    const observer = new MutationObserver(() => {
      if (!block.isConnected) return;
      observer.disconnect();
      openLinkedSection();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}
