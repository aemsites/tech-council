/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { createOptimizedPicture, decorateIcons, readBlockConfig } from '../../scripts/aem.js';
import { fetchPlaceholders } from '../../scripts/placeholders.js';

/**
 * Returns true only for http/https (or relative) URLs.
 * @param {string} url
 * @returns {boolean}
 */
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

/**
 * Returns true for absolute http/https URLs that leave this site.
 * @param {string} url
 * @returns {boolean}
 */
function isExternalUrl(url) {
  if (!isSafeUrl(url)) return false;
  try {
    const u = new URL(url, window.location.origin);
    if (u.hostname === 'communities') return false;
    return u.origin !== window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Converts same-origin absolute URLs to relative path and preserves relative links.
 * @param {string} url
 * @returns {string|null}
 */
function normalizeLink(url) {
  if (!isSafeUrl(url)) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const u = new URL(trimmed, window.location.origin);
    if (u.origin === window.location.origin) return `${u.pathname}${u.search}${u.hash}`;
    if (u.hostname === 'communities') {
      const path = u.pathname.startsWith('/communities') ? u.pathname : `/communities${u.pathname}`;
      return `${path}${u.search}${u.hash}`;
    }
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Checks if a row is a config row.
 * @param {HTMLDivElement} row
 * @returns {boolean}
 */
function isConfigRow(row) {
  const cols = [...row.children];
  if (cols.length !== 2) return false;
  const key = (cols[0]?.textContent || '').trim().toLowerCase().replace(/\s+/g, '');
  return key === 'addcommunitylink' || key === 'addcommunity';
}

/**
 * Extracts add community link from config row.
 * @param {HTMLDivElement} row
 * @returns {string|null}
 */
function getAddCommunityLinkFromRow(row) {
  const cols = [...row.children];
  const linkEl = cols[1]?.querySelector('a[href]');
  const href = linkEl?.getAttribute('href');
  if (href && isSafeUrl(href)) return normalizeLink(href);
  const text = (cols[1]?.textContent || '').trim();
  if (text && isSafeUrl(text)) return normalizeLink(text);
  return null;
}

/**
 * Parses column 2 into leads, slack URL/text, and events URL.
 * @param {HTMLElement} col
 * @returns {{ leads: string[], slackUrl: string|null, slackText: string|null, eventsUrl: string|null }}
 */
function parseDetailsColumn(col) {
  const result = { leads: [], slackUrl: null, slackText: null, eventsUrl: null };
  if (!col) return result;

  const links = [...col.querySelectorAll('a[href]')];
  const listItems = col.querySelectorAll('ul li, ol li');
  const leadItems = [...listItems].filter((li) => !li.querySelector('a[href]'));
  if (leadItems.length > 0) {
    result.leads = leadItems.map((li) => (li.textContent || '').trim()).filter(Boolean);
  } else {
    const clone = col.cloneNode(true);
    clone.querySelectorAll('a').forEach((a) => a.remove());
    const parts = (clone.textContent || '').split(/\n|•|[-–—]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) result.leads = parts;
  }

  if (links.length >= 2) {
    const slackHref = links[0].getAttribute('href');
    const eventsHref = links[1].getAttribute('href');
    result.slackUrl = slackHref && isSafeUrl(slackHref) ? normalizeLink(slackHref) : null;
    result.slackText = (links[0].textContent || '').trim() || null;
    result.eventsUrl = eventsHref && isSafeUrl(eventsHref) ? normalizeLink(eventsHref) : null;
  } else if (links.length === 1) {
    const href = links[0].getAttribute('href');
    const linkText = (links[0].textContent || '').trim().toLowerCase();
    result.slackUrl = linkText.includes('slack') && href && isSafeUrl(href) ? normalizeLink(href) : null;
    result.slackText = result.slackUrl ? (links[0].textContent || '').trim() || null : null;
    result.eventsUrl = !result.slackUrl && href && isSafeUrl(href) ? normalizeLink(href) : null;
  }
  return result;
}

/**
 * Formats Slack link text as hashtag (e.g. #tech-community-mcp).
 * @param {string|null} text
 * @returns {string}
 */
function formatSlackChannelText(text) {
  if (!text || !text.trim()) return 'Slack';
  const t = text.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) return 'Slack';
  return t.startsWith('#') ? t : `#${t}`;
}

/**
 * Decorates the Communities Card List block.
 * Same authoring as communities block: 2 columns, Photo+Name | Leads list + Slack + Events links.
 * Renders as 3x3 card grid.
 * @param {HTMLElement} block
 */
export default async function decorate(block) {
  try {
    const placeholders = await fetchPlaceholders();
    const rows = [...block.children];

    let addCommunityLink = null;
    let contentStartIndex = 0;

    if (rows.length > 0 && isConfigRow(rows[0])) {
      addCommunityLink = getAddCommunityLinkFromRow(rows[0]);
      contentStartIndex = 1;
    }
    if (!addCommunityLink) {
      const config = readBlockConfig(block);
      if (config.addCommunityLink && isSafeUrl(config.addCommunityLink)) {
        addCommunityLink = normalizeLink(config.addCommunityLink);
      }
    }

    const grid = document.createElement('div');
    grid.className = 'communities-card-list-grid';
    const fragment = document.createDocumentFragment();

    for (let i = contentStartIndex; i < rows.length; i += 1) {
      const row = rows[i];
      const cols = [...row.children];
      if (cols.length < 2) continue;

      const col1 = cols[0];
      const col2 = cols[1];

      const card = document.createElement('article');
      card.className = 'communities-card-list-card';

      const photoDiv = document.createElement('div');
      photoDiv.className = 'communities-card-list-photo';
      const img = col1?.querySelector('img') || col1?.querySelector('picture img');
      const picture = col1?.querySelector('picture');
      if (picture) {
        photoDiv.appendChild(createOptimizedPicture(img?.src || '', img?.alt || '', false, [{ width: '400' }]));
      } else if (img) {
        photoDiv.appendChild(createOptimizedPicture(img.src, img.alt || '', false, [{ width: '400' }]));
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'communities-card-list-photo-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        photoDiv.appendChild(placeholder);
      }
      card.appendChild(photoDiv);

      const body = document.createElement('div');
      body.className = 'communities-card-list-body';

      let nameText = '';
      if (col1) {
        const clone = col1.cloneNode(true);
        clone.querySelectorAll('picture, img').forEach((el) => el.remove());
        nameText = (clone.textContent || '').trim();
      }

      const { leads, slackUrl, slackText, eventsUrl } = parseDetailsColumn(col2);

      const nameEl = document.createElement(eventsUrl && isSafeUrl(eventsUrl) ? 'a' : 'h3');
      nameEl.className = 'communities-card-list-name';
      nameEl.textContent = nameText || 'Community';
      if (eventsUrl && isSafeUrl(eventsUrl)) {
        nameEl.href = eventsUrl;
        if (isExternalUrl(eventsUrl)) {
          nameEl.setAttribute('target', '_blank');
          nameEl.setAttribute('rel', 'noopener');
        }
      }
      body.appendChild(nameEl);

      if (leads.length > 0) {
        const leadsList = document.createElement('ul');
        leadsList.className = 'communities-card-list-leads';
        leads.forEach((lead) => {
          const li = document.createElement('li');
          li.textContent = lead;
          leadsList.appendChild(li);
        });
        body.appendChild(leadsList);
      }

      if (slackUrl) {
        const links = document.createElement('div');
        links.className = 'communities-card-list-links';
        const a = document.createElement('a');
        a.href = slackUrl;
        a.className = 'communities-card-list-link';
        if (isExternalUrl(slackUrl)) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
        }
        const icon = document.createElement('span');
        icon.className = 'icon icon-slack';
        icon.setAttribute('aria-hidden', 'true');
        a.appendChild(icon);
        a.appendChild(document.createTextNode(formatSlackChannelText(slackText) || 'Slack'));
        links.appendChild(a);
        body.appendChild(links);
      }

      card.appendChild(body);
      fragment.appendChild(card);
    }

    const addCard = document.createElement('article');
    addCard.className = 'communities-card-list-card communities-card-list-add';
    const addBody = document.createElement('div');
    addBody.className = 'communities-card-list-add-body';
    const addText = document.createElement('p');
    addText.className = 'communities-card-list-add-text';
    addText.textContent = placeholders.doYouWantToStartCommunity || 'Do you want to start a community?';
    const addBtn = document.createElement('a');
    addBtn.href = '/communities/new-community';
    addBtn.className = 'communities-card-list-add-btn button primary';
    addBtn.textContent = placeholders.submitProposal || 'Submit Proposal';
    addBody.appendChild(addText);
    addBody.appendChild(addBtn);
    addCard.appendChild(addBody);
    fragment.appendChild(addCard);

    grid.appendChild(fragment);
    decorateIcons(grid);
    block.textContent = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'communities-card-list-wrapper';
    wrapper.appendChild(grid);
    block.appendChild(wrapper);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to decorate communities-card-list block:', error);
    block.innerHTML = '<p class="communities-card-list-error">Unable to load communities.</p>';
  }
}
