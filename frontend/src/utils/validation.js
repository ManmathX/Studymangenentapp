/** Form rules that mirror the API's validation, so most mistakes are caught before a request. */
export const rules = {
  name: { required: 'Enter your name', maxLength: { value: 60, message: 'Use at most 60 characters' }, validate: (value) => value.trim().length > 0 || 'Enter your name' },
  email: {
    required: 'Enter your email',
    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
  },
  loginPassword: { required: 'Enter your password' },
  newPassword: {
    required: 'Choose a password',
    minLength: { value: 8, message: 'Use at least 8 characters' },
    maxLength: { value: 128, message: 'Use at most 128 characters' },
    validate: {
      letter: (value) => /[A-Za-z]/.test(value) || 'Include at least one letter',
      number: (value) => /\d/.test(value) || 'Include at least one number',
    },
  },
  title: (message) => ({ required: message, validate: (value) => value.trim().length > 0 || message, maxLength: { value: 140, message: 'Keep it under 140 characters' } }),
};

/** Copies server-side field errors into a React Hook Form. Returns true if any were applied. */
export function applyServerErrors(error, setError, fields) {
  const fieldErrors = error?.fieldErrors?.() ?? {};
  let applied = false;
  for (const field of fields) {
    if (fieldErrors[field]) {
      setError(field, { type: 'server', message: fieldErrors[field] });
      applied = true;
    }
  }
  return applied;
}
