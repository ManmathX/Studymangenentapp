/** Escapes text for use inside a RegExp, so user search input is matched literally. */
export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lowercase ASCII slug: "Odisha Board (BSE)" → "odisha-board-bse" (or "odishaboardbse"). */
export const slugify = (text: string, separator: '' | '-') =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, separator)
    .replace(/^-+|-+$/g, '');
