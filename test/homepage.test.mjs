import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';

function setup(html, path = '/') {
  const { window, document } = parseHTML(`<html><head></head><body><main>${html}</main></body></html>`);
  window.location = new URL(path, 'https://techcouncil.corp.adobe.com');
  window.hlx = { codeBasePath: '' };
  window.placeholders = { default: {} };
  globalThis.window = window;
  globalThis.document = document;
  return document.querySelector('main');
}

setup('');
const { default: decorateHero } = await import('../blocks/hero-quote/hero-quote.js');
const { default: decorateCommunities } = await import('../blocks/communities-card-list/communities-card-list.js');
const { default: decorateChannels } = await import('../blocks/icon-cards/icon-cards.js');
const { default: decorateCTA } = await import('../blocks/carousel-cta/carousel-cta.js');

const hero = `<div class="section"><div><div class="hero-quote">
  <div><div><p>Engineering the Future Together</p></div>
  <div><p>Our authored mission with a <a href="/resources">resource link</a>.</p></div></div>
</div></div></div>`;

test('homepage restores the illustrated hero and visible mission without moving search', async () => {
  const main = setup(`${hero}<div class="section"><div class="fjsearch-wrapper">
    <div class="fjsearch" data-block-status="loaded"><input></div>
  </div></div>`);
  const search = main.querySelector('.fjsearch');
  const searchWrapper = search.parentElement;
  const searchSection = searchWrapper.parentElement;
  const input = search.querySelector('input');
  input.value = 'MCP';
  let submissions = 0;
  input.addEventListener('change', () => { submissions += 1; });

  await decorateHero(main.querySelector('.hero-quote'));

  assert.equal(main.querySelectorAll('.fjsearch').length, 1);
  assert.equal(main.querySelector('.hero-home-layout .fjsearch'), null);
  assert.equal(searchWrapper.parentElement, searchSection);
  assert.equal(input.value, 'MCP');
  input.dispatchEvent(new window.Event('change'));
  assert.equal(submissions, 1);
  assert.equal(main.querySelector('h1').textContent, 'Engineering the Future Together');
  const attribution = main.querySelector('.hero-quote-attribution');
  assert.equal(attribution.parentElement.tagName, 'BLOCKQUOTE');
  assert.equal(attribution.querySelector('a').getAttribute('href'), '/resources');
  assert.ok(attribution.textContent.includes('Our authored mission'));
  assert.equal(main.querySelector('details'), null);
  assert.equal(main.querySelectorAll('.hero-community-art img').length, 4);
  assert.equal(main.querySelector('.hero-home-actions a').getAttribute('href'), '/communities/');
});

test('non-homepage hero keeps its authored copy visible and leaves search in place', async () => {
  const main = setup(`${hero}<div class="fjsearch-wrapper"><div class="fjsearch"></div></div>`, '/events');
  const wrapper = main.querySelector('.fjsearch-wrapper');
  await decorateHero(main.querySelector('.hero-quote'));
  assert.equal(main.querySelector('.hero-home-layout'), null);
  assert.equal(main.querySelector('.hero-home-about'), null);
  assert.equal(wrapper.parentElement, main);
  assert.ok(main.querySelector('blockquote').textContent.includes('Our authored mission'));
});

const community = `<div class="communities-card-list"><div>
  <div><p>MCP Community</p></div>
  <div><ul><li>Community Lead</li></ul><p>Authored community description.</p>
  <p><a href="https://adobe.slack.com/archives/mcp">tech-community-mcp</a></p></div>
</div></div>`;

test('homepage keeps community descriptions and leads visible with the original Slack destination', async () => {
  const main = setup(community);
  await decorateCommunities(main.querySelector('.communities-card-list'));
  assert.equal(main.querySelector('details'), null);
  assert.ok(main.querySelector('.communities-card-list-leads').textContent.includes('Community Lead'));
  assert.ok(main.querySelector('.communities-card-list-description').textContent.includes('Authored community description.'));
  const slack = main.querySelector('.communities-card-list-link');
  assert.equal(slack.textContent, '#tech-community-mcp');
  assert.equal(slack.href, 'https://adobe.slack.com/archives/mcp');
  assert.equal(slack.closest('details'), null);
  assert.equal(main.querySelector('.community-filter'), null);
  assert.ok(main.querySelector('.communities-card-list-add-btn'));
});

test('full communities page retains visible descriptions and its community filter', async () => {
  const main = setup(community.replace('</div></div>', '</div><div><div>Another Community</div><div><ul><li>Other Lead</li></ul></div></div></div>'), '/communities/');
  await decorateCommunities(main.querySelector('.communities-card-list'));
  assert.equal(main.querySelector('details'), null);
  assert.ok(main.querySelector('.communities-card-list-description').textContent.includes('Authored'));
  assert.ok(main.querySelector('.community-filter'));
  assert.ok(main.querySelector('.communities-card-list-link').textContent.includes('#tech-community-mcp'));
});

test('homepage shows collaboration channels directly rather than hiding them in a disclosure', async () => {
  const main = setup(`<div class="icon-cards"><div><div></div><div>
    <p>Engineering channel</p><p><a href="https://adobe.slack.com/archives/engineering">View Channel</a></p>
  </div></div></div>`);
  await decorateChannels(main.querySelector('.icon-cards'));
  assert.equal(main.querySelector('details'), null);
  assert.equal(main.querySelector('.icon-cards-card a').href, 'https://adobe.slack.com/archives/engineering');
  assert.equal(main.querySelector('.icon-cards-card a').getAttribute('rel'), 'noopener');
});

test('homepage contribution banners discard only empty wrappers left by extracting their CTA', async () => {
  const main = setup(`<div class="carousel-cta"><div><div>
    <p><strong>Be The Next Speaker</strong></p><p>Share your engineering experience.</p>
    <p><strong><a href="/speaker">Fill the Form</a></strong></p>
  </div></div></div>`);
  await decorateCTA(main.querySelector('.carousel-cta'));
  const card = main.querySelector('.carousel-cta-card');
  assert.equal(card.querySelectorAll(':scope > p').length, 0);
  assert.ok(card.querySelector('.carousel-cta-title').textContent.includes('Be The Next Speaker'));
  assert.equal(card.querySelector('.carousel-cta-description').textContent, 'Share your engineering experience.');
  assert.equal(card.querySelector('.carousel-cta-button').getAttribute('href'), '/speaker');
});
