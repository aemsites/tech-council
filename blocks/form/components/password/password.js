export default function passwordLayout(fieldDiv) {
  const inputField = fieldDiv.querySelector('input[type="text"]');
  inputField.type = 'password';

  const togglePasswordIcon = document.createElement('button');
  togglePasswordIcon.type = 'button';
  togglePasswordIcon.classList.add('password-toggle');
  togglePasswordIcon.classList.add('bi-eye-slash');
  togglePasswordIcon.setAttribute('aria-label', 'Show password');
  togglePasswordIcon.setAttribute('aria-pressed', 'false');
  if (inputField.id) togglePasswordIcon.setAttribute('aria-controls', inputField.id);
  const control = document.createElement('div');
  control.className = 'password-control';
  inputField.replaceWith(control);
  control.append(inputField, togglePasswordIcon);

  togglePasswordIcon.addEventListener('click', () => {
    const type = inputField.getAttribute('type') === 'password' ? 'text' : 'password';
    inputField.setAttribute('type', type);
    togglePasswordIcon.classList.toggle('bi-eye', type !== 'password');
    togglePasswordIcon.classList.toggle('bi-eye-slash', type === 'password');
    togglePasswordIcon.setAttribute('aria-label', type === 'password' ? 'Show password' : 'Hide password');
    togglePasswordIcon.setAttribute('aria-pressed', String(type === 'text'));
  });
  return fieldDiv;
}
