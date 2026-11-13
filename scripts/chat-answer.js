import { lexer } from './vendor/marked.js';
import { sitePath } from './knowledge-api.js';

function node(tag, text) {
  const result = document.createElement(tag);
  if (text) result.textContent = text;
  return result;
}

function decodeText(text) {
  const entities = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] || match;
    const value = entity[1].toLowerCase() === 'x'
      ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
      ? String.fromCodePoint(value) : '\ufffd';
  });
}

export default function renderAnswer(container, text, sources) {
  const allowed = new Map(
    sources.slice(0, 10).map((source) => [sitePath(source?.url), source?.title]),
  );
  allowed.delete(null);

  // Only lexer tokens become whitelisted DOM nodes; model-provided HTML is never parsed.
  const append = (parent, tokens, depth = 0) => {
    tokens.forEach((token) => {
      if (depth > 32) {
        parent.append(document.createTextNode(token.raw || ''));
        return;
      }
      let child;
      switch (token.type) {
        case 'space':
        case 'def':
          return;
        case 'heading':
          child = node('h3');
          break;
        case 'paragraph':
          child = node('p');
          break;
        case 'strong':
          child = node('strong');
          break;
        case 'em':
          child = node('em');
          break;
        case 'del':
          child = node('del');
          break;
        case 'blockquote':
          child = node('blockquote');
          break;
        case 'list':
          child = node(token.ordered ? 'ol' : 'ul');
          if (token.ordered && Number.isInteger(token.start)) child.start = token.start;
          token.items.forEach((item) => {
            const entry = node('li');
            if (item.task) entry.append(node('span', item.checked ? '[x] ' : '[ ] '));
            append(entry, item.tokens, depth + 1);
            child.append(entry);
          });
          parent.append(child);
          return;
        case 'link': {
          const path = sitePath(decodeText(token.href));
          child = node(allowed.has(path) ? 'a' : 'span');
          if (allowed.has(path)) {
            child.href = path;
            child.className = 'ai-chat-inline-link';
            child.title = `Tech Council: ${path}`;
            if (token.text === token.href && allowed.get(path)) {
              child.textContent = allowed.get(path);
              parent.append(child);
              return;
            }
          }
          break;
        }
        case 'code':
          child = node('pre');
          child.tabIndex = 0;
          child.setAttribute('role', 'region');
          child.setAttribute('aria-label', 'Code block');
          child.append(node('code', token.text));
          parent.append(child);
          return;
        case 'codespan':
          parent.append(node('code', token.text));
          return;
        case 'table': {
          const wrapper = node('div');
          wrapper.className = 'ai-chat-table';
          wrapper.tabIndex = 0;
          wrapper.setAttribute('role', 'region');
          wrapper.setAttribute('aria-label', 'Answer table');
          const table = node('table');
          const head = node('thead');
          const body = node('tbody');
          [token.header, ...token.rows].forEach((row, index) => {
            const tr = node('tr');
            row.forEach((cell) => {
              const td = node(index ? 'td' : 'th');
              if (!index) td.scope = 'col';
              append(td, cell.tokens, depth + 1);
              tr.append(td);
            });
            (index ? body : head).append(tr);
          });
          table.append(head, body);
          wrapper.append(table);
          parent.append(wrapper);
          return;
        }
        case 'br':
        case 'hr':
          parent.append(node(token.type));
          return;
        case 'html':
          parent.append(document.createTextNode(token.raw));
          return;
        case 'image':
          parent.append(document.createTextNode(decodeText(token.text || '')));
          return;
        default:
          if (token.tokens) append(parent, token.tokens, depth + 1);
          else parent.append(document.createTextNode(decodeText(token.text || token.raw || '')));
          return;
      }
      append(child, token.tokens || [], depth + 1);
      parent.append(child);
    });
  };

  const content = document.createDocumentFragment();
  append(content, lexer(text, { gfm: true, breaks: false }));
  container.replaceChildren(content);
}
