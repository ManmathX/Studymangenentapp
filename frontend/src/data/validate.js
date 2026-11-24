import { isValidDateKey } from './core/dates';
import { invalidField } from './errors';

/** Input checks for planner operations. Each returns the clean value or throws a field error. */

export function text(value, field, { min = 1, max, required = 'Fill this in' }) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (clean.length < min) throw invalidField(field, required);
  if (clean.length > max) throw invalidField(field, `Use at most ${max} characters`);
  return clean;
}

export function optionalText(value, field, max) {
  if (value === undefined || value === null) return '';
  return text(value, field, { min: 0, max });
}

export function dateKey(value, field) {
  if (typeof value !== 'string' || !isValidDateKey(value)) throw invalidField(field, 'Pick a valid date');
  return value;
}

export function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw invalidField(field, 'Choose one of the options');
  return value;
}

export function intIn(value, min, max, field) {
  if (!Number.isInteger(value) || value < min || value > max) throw invalidField(field, `Use a whole number from ${min} to ${max}`);
  return value;
}

export function bool(value, field) {
  if (typeof value !== 'boolean') throw invalidField(field, 'Must be on or off');
  return value;
}

export function timeOfDay(value, field) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw invalidField(field, 'Use HH:MM');
  return value;
}

export function list(value, field, { min = 0, max, message = 'Pick at least one' }) {
  if (!Array.isArray(value) || value.length < min) throw invalidField(field, message);
  if (value.length > max) throw invalidField(field, `Pick at most ${max}`);
  return value;
}

export const unique = (values) => [...new Set(values)];
