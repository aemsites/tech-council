export function handleAccordionNavigation(panel, tab, forceOpen = false) {
  const accordionTabs = panel?.querySelectorAll(':scope > fieldset') || [];
  accordionTabs.forEach((otherTab) => {
    if (otherTab !== tab) {
      otherTab.classList.add('accordion-collapse');
    }
  });
  if (forceOpen) {
    tab.classList.remove('accordion-collapse');
  } else {
    tab.classList.toggle('accordion-collapse');
  }
  accordionTabs.forEach((item) => {
    item.querySelector(':scope > legend > .accordion-toggle')
      ?.setAttribute('aria-expanded', String(!item.classList.contains('accordion-collapse')));
  });
}

export default function decorate(panel) {
  panel.classList.add('accordion');
  const accordionTabs = panel?.querySelectorAll(':scope > fieldset');
  accordionTabs?.forEach((tab, index) => {
    tab.dataset.index = index;
    const legend = tab.querySelector(':scope > legend');
    legend?.classList.add('accordion-legend');
    if (index !== 0) tab.classList.toggle('accordion-collapse'); // collapse all but the first tab on load
    if (legend) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'accordion-toggle';
      toggle.append(...legend.childNodes);
      toggle.setAttribute('aria-expanded', String(index === 0));
      if (tab.id) toggle.setAttribute('aria-controls', tab.id);
      legend.append(toggle);
      toggle.addEventListener('click', () => handleAccordionNavigation(panel, tab));
    }
  });
  return panel;
}
