function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function label(value) {
  return value.replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeUrl(value) {
  if (typeof value !== 'string' || !/^(https?:\/\/|\/(?!\/))/i.test(value.trim())) return null;
  try {
    const url = new URL(value.trim(), window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function renderValue(value) {
  if (value === null) return element('span', 'dashboard-null', 'null');
  if (value === undefined) return element('span', 'dashboard-null', 'Not provided');
  if (value === '') return element('span', 'dashboard-null', 'Empty');
  if (typeof value === 'object') {
    const details = element('details', 'dashboard-details');
    const entries = Object.entries(value);
    details.append(element('summary', '', `${entries.length} ${Array.isArray(value) ? 'items' : 'fields'}`));
    const list = element('dl');
    entries.forEach(([key, item]) => {
      list.append(element('dt', '', key));
      const definition = element('dd');
      definition.append(renderValue(item));
      list.append(definition);
    });
    details.append(list);
    return details;
  }
  const url = safeUrl(value);
  if (url) {
    const link = element('a', 'dashboard-link', value);
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }
  return element('span', '', String(value));
}

function datasets(json) {
  if (Array.isArray(json)) return [{ name: 'Data', rows: json }];
  if (json !== null && typeof json === 'object') {
    if (Array.isArray(json.data)) return [{ name: 'Data', rows: json.data }];
    const sheets = Object.entries(json)
      .filter(([, value]) => value && Array.isArray(value.data))
      .map(([name, value]) => ({ name: label(name), rows: value.data }));
    if (sheets.length) return sheets;
    return [{ name: 'Data', rows: [json] }];
  }
  return [{ name: 'Data', rows: [json] }];
}

async function fetchJson(url) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`The JSON source returned HTTP ${response.status}.`);
  return response.json();
}

async function completeSheet(sheet, source, name) {
  if (!Array.isArray(sheet?.data)) return;
  const total = Number(sheet.total);
  let offset = Number(sheet.offset || 0) + sheet.data.length;
  if (!Number.isFinite(total) || offset >= total) return;
  const url = new URL(source, window.location.origin);
  if (name) url.searchParams.set('sheet', name);
  while (offset < total) {
    url.searchParams.set('offset', offset);
    // Each page's row count determines the next offset.
    // eslint-disable-next-line no-await-in-loop
    const page = await fetchJson(`${url.pathname}${url.search}`);
    if (!Array.isArray(page.data) || page.data.length === 0) {
      throw new Error('The JSON source stopped returning rows before all records were loaded.');
    }
    sheet.data.push(...page.data);
    offset += page.data.length;
  }
}

async function loadData(source) {
  const json = await fetchJson(source);
  if (Array.isArray(json?.data)) {
    await completeSheet(json, source);
  } else if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
    await Promise.all(
      Object.entries(json).map(([name, sheet]) => completeSheet(sheet, source, name)),
    );
  }
  return datasets(json);
}

function record(row) {
  return row !== null && typeof row === 'object' && !Array.isArray(row) ? row : { value: row };
}

function createTable(dataset) {
  const rows = dataset.rows.map(record);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const section = element('section', 'dashboard-dataset');
  const region = element('div', 'dashboard-table-region');
  region.tabIndex = 0;
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', `${dataset.name} records`);
  const table = element('table');
  table.append(element('caption', '', dataset.name));
  const head = element('thead');
  const header = element('tr');
  columns.forEach((key) => {
    const th = element('th', '', label(key));
    th.scope = 'col';
    header.append(th);
  });
  head.append(header);
  const body = element('tbody');
  const entries = rows.map((row) => {
    const tr = element('tr');
    columns.forEach((key) => {
      const td = element('td');
      td.dataset.label = label(key);
      td.append(renderValue(row[key]));
      tr.append(td);
    });
    body.append(tr);
    return { node: tr, text: JSON.stringify(row).toLowerCase() };
  });
  table.append(head, body);
  region.append(table);
  const empty = element('p', 'dashboard-empty', 'No records match your search.');
  empty.hidden = true;
  section.append(region, empty);
  return {
    section, entries, region, empty, columns,
  };
}

function openLink(url, text) {
  const link = element('a', 'dashboard-source dashboard-open');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', text);
  const icon = element('img');
  icon.src = `${window.hlx?.codeBasePath || ''}/icons/community-link.svg`;
  icon.alt = '';
  icon.width = 20;
  icon.height = 20;
  const tooltip = element('span', 'dashboard-tooltip', text);
  tooltip.setAttribute('aria-hidden', 'true');
  link.append(icon, tooltip);
  return link;
}

function publishingActions(sourceUrl, status, refresh) {
  const { hostname } = new URL(window.location.href);
  const match = hostname.match(/^([a-z0-9-]+)--tech-council--aemsites\.aem\.(page|live)$/);
  const ref = match ? match[1] : 'main';
  const site = `${ref}--tech-council--aemsites`;
  const controls = element('div', 'dashboard-publishing');
  const buttons = [];
  let busy = false;

  [['preview', 'Preview', 'page'], ['live', 'Publish', 'live']].forEach(([action, text, domain]) => {
    const group = element('div', 'dashboard-action-group');
    const button = element('button', 'dashboard-source dashboard-action', text);
    button.type = 'button';
    button.dataset.action = action;
    buttons.push(button);
    const openUrl = `https://${site}.aem.${domain}${sourceUrl.pathname}${sourceUrl.search}`;
    group.append(button, openLink(openUrl, `Open ${action === 'preview' ? 'preview' : 'published'} feed`));
    controls.append(group);

    button.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      buttons.forEach((control) => { control.disabled = true; });
      button.textContent = action === 'preview' ? 'Previewing...' : 'Publishing...';
      status.hidden = false;
      status.setAttribute('role', 'status');
      status.textContent = `${text} request in progress...`;
      try {
        const response = await fetch(
          `https://admin.hlx.page/${action}/aemsites/tech-council/${ref}${sourceUrl.pathname}`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(30000),
          },
        );
        if (response.status === 401 || response.status === 403) {
          throw new Error('Sign in to AEM Sidekick with preview/publish permissions, then try again.');
        }
        if (!response.ok) throw new Error(`${text} failed (HTTP ${response.status}). Try again.`);
        const result = await response.json();
        if (result?.[action]?.status !== 200) {
          throw new Error(`EDS did not confirm the ${text.toLowerCase()} operation. Check AEM Sidekick.`);
        }
        status.textContent = action === 'preview'
          ? 'Preview updated. Open the preview feed to review your changes.'
          : 'Feed published. Open the published feed to review it.';
        await refresh();
      } catch (error) {
        console.warn(`[Dashboard] ${text} failed:`, error);
        status.setAttribute('role', 'alert');
        status.textContent = `${text} unsuccessful: ${error.message} `
          + 'If the request was interrupted, check the feed before retrying.';
      } finally {
        busy = false;
        buttons.forEach((control) => { control.disabled = false; });
        button.textContent = text;
      }
    });
  });
  return controls;
}

export default async function decorate(block) {
  const cell = block.querySelector(':scope > div > div');
  const rawSource = cell?.querySelector('a[href]')?.getAttribute('href') || cell?.textContent.trim();
  const sourceUrl = safeUrl(rawSource);
  const excelCell = block.querySelector(':scope > div:nth-child(2) > div');
  const rawExcel = excelCell?.querySelector('a[href]')?.getAttribute('href')
    || excelCell?.textContent.trim();
  const excelUrl = safeUrl(rawExcel);
  // EDS feeds use the current origin, including when authored with the corporate site URL.
  const source = sourceUrl ? `${sourceUrl.pathname}${sourceUrl.search}` : null;
  const variants = [...block.classList].filter((name) => !['dashboard', 'block'].includes(name));
  const title = label(variants.join(' ')) || 'Dashboard';
  block.replaceChildren();
  const header = element('div', 'dashboard-header');
  const intro = element('div');
  intro.append(element('p', 'dashboard-eyebrow', 'Content dashboard'));
  intro.append(element(document.querySelector('main h1') ? 'h2' : 'h1', '', title));
  intro.append(element('p', 'dashboard-description', 'Browse and search every field in your data source.'));
  header.append(intro);
  const actions = element('div', 'dashboard-actions');
  const actionStatus = element('p', 'dashboard-action-status');
  actionStatus.hidden = true;
  actionStatus.setAttribute('role', 'status');
  if (source) {
    const link = element('a', 'dashboard-source', 'View JSON');
    link.href = source;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    actions.append(link);
  }
  if (excelUrl) {
    const edit = element('a', 'dashboard-source dashboard-edit', 'Edit Excel');
    edit.href = excelUrl.href;
    edit.target = '_blank';
    edit.rel = 'noopener noreferrer';
    actions.append(edit);
  } else if (rawExcel) {
    console.warn('[Dashboard] Invalid Excel link:', rawExcel);
    const warning = element('p', 'dashboard-edit-error', 'The Excel link is invalid. Update the second block row with an HTTP(S) workbook link.');
    warning.setAttribute('role', 'alert');
    intro.append(warning);
  }
  if (actions.childElementCount) header.append(actions);
  const content = element('div', 'dashboard-content');
  block.append(header, actionStatus, content);

  async function load() {
    block.setAttribute('aria-busy', 'true');
    const loading = element('p', 'dashboard-loading', 'Loading dashboard data...');
    loading.setAttribute('role', 'status');
    content.replaceChildren(loading);
    try {
      if (!source) throw new Error('Add an HTTP(S) JSON source link or path to the first block cell.');
      const data = await loadData(source);
      const tables = data.map(createTable);
      const total = data.reduce((sum, item) => sum + item.rows.length, 0);
      const fields = new Set(tables.flatMap((table) => table.columns)).size;
      const metrics = element('dl', 'dashboard-metrics');
      [[total, 'Records'], [fields, 'Fields'], [data.length, 'Datasets']].forEach(([value, name]) => {
        const metric = element('div');
        metric.append(element('dt', '', name), element('dd', '', value.toLocaleString()));
        metrics.append(metric);
      });
      content.replaceChildren(metrics);
      if (!total) {
        content.append(element('p', 'dashboard-empty', 'This JSON source has no records yet.'));
        return;
      }
      const search = element('search', 'dashboard-search');
      const searchLabel = element('label', '', 'Search all fields');
      const input = element('input');
      input.type = 'search';
      input.placeholder = 'Search titles, people, tags, or any value';
      searchLabel.append(input);
      const count = element('p', 'dashboard-count', `${total.toLocaleString()} of ${total.toLocaleString()} records`);
      count.setAttribute('role', 'status');
      search.append(searchLabel, count);
      content.append(search, ...tables.map((table) => table.section));
      input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        let matches = 0;
        tables.forEach((table) => {
          let visible = 0;
          table.entries.forEach((entry) => {
            entry.node.hidden = !entry.text.includes(query);
            if (!entry.node.hidden) visible += 1;
          });
          table.region.hidden = visible === 0;
          table.empty.hidden = visible > 0;
          matches += visible;
        });
        count.textContent = `${matches.toLocaleString()} of ${total.toLocaleString()} records`;
      });
    } catch (error) {
      console.warn('[Dashboard] Failed to load JSON:', error);
      const message = element('div', 'dashboard-error');
      message.setAttribute('role', 'alert');
      message.append(element('h2', '', 'Unable to load dashboard'), element('p', '', error.message));
      const retry = element('button', '', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', load);
      message.append(retry);
      content.replaceChildren(message);
    } finally {
      block.setAttribute('aria-busy', 'false');
    }
  }
  if (source) actions.append(publishingActions(sourceUrl, actionStatus, load));
  await load();
}
