export default function decorate(fieldDiv, fieldJson) {
  const input = fieldDiv.querySelector('input[type="number"]');
  const maximum = Number(input.max);
  const max = Number.isFinite(maximum) && maximum >= 1 ? Math.floor(maximum) : 5;
  if (fieldJson?.enabled === false) input.disabled = true;
  if (fieldJson?.readOnly === true) input.readOnly = true;

  const rating = document.createElement('div');
  rating.className = 'rating';
  rating.setAttribute('role', 'group');
  const buttons = [];

  const sync = () => {
    const label = fieldDiv.querySelector('label');
    rating.setAttribute('aria-label', label?.textContent.trim() || 'Rating');
    const disabled = input.disabled || input.readOnly;
    rating.classList.toggle('disabled', disabled);
    buttons.forEach((button, index) => {
      button.disabled = disabled;
      button.classList.toggle('selected', index < Number(input.value));
      button.setAttribute('aria-pressed', String(index + 1 === Number(input.value)));
    });
  };

  for (let value = 1; value <= max; value += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'star';
    button.setAttribute('aria-label', `${value} out of ${max}`);
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z"/></svg>';
    button.addEventListener('click', () => {
      if (input.disabled || input.readOnly) return;
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    });
    button.addEventListener('pointerenter', () => {
      if (input.disabled || input.readOnly) return;
      buttons.forEach((star, index) => star.classList.toggle('hover', index < value));
    });
    buttons.push(button);
    rating.append(button);
  }
  rating.addEventListener('pointerleave', () => {
    buttons.forEach((button) => button.classList.remove('hover'));
  });
  input.addEventListener('change', sync);
  input.addEventListener('input', sync);
  input.addEventListener('rating-update', sync);
  new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['disabled', 'readonly', 'value'] });
  input.style.display = 'none';
  fieldDiv.append(rating);
  const helpText = fieldDiv.querySelector('.field-description');
  if (helpText) fieldDiv.append(helpText);
  sync();
  return fieldDiv;
}
