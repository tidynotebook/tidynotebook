/**
 * One member of the query of an address of the application.
 *
 * A screen of the application builds no URL object (the boundary check
 * keeps URL construction in generated output), so the routes that take a
 * value from the address bar, sign-in, the account portal and the Settings
 * modal, read and write their one member here. The text follows the form encoding that a
 * browser writes: `&` separates the members, `=` a name from its value, and
 * `+` is a space.
 */

/** One part of a query, decoded, or `null` when it is not valid encoding. */
function decodePart(part: string): string | null {
  try {
    return decodeURIComponent(part.replaceAll('+', ' '));
  } catch {
    return null;
  }
}

/**
 * The value of the first member `name` of a query, with or without its `?`.
 * A member with no `=` has the empty value. No member, or a value that is not
 * valid encoding, answers `null`.
 */
export function queryValue(search: string, name: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (query === '') return null;
  for (const member of query.split('&')) {
    const at = member.indexOf('=');
    const key = decodePart(at === -1 ? member : member.slice(0, at));
    if (key !== name) continue;
    return at === -1 ? '' : decodePart(member.slice(at + 1));
  }
  return null;
}

/** Every value of one member. Consent refuses duplicates and bad encoding. */
export function queryValues(
  search: string,
  name: string,
): readonly string[] | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (query === '') return [];
  const values: string[] = [];
  for (const member of query.split('&')) {
    const at = member.indexOf('=');
    const key = decodePart(at === -1 ? member : member.slice(0, at));
    if (key === null) return null;
    if (key !== name) continue;
    const value = at === -1 ? '' : decodePart(member.slice(at + 1));
    if (value === null) return null;
    values.push(value);
  }
  return values;
}

/** A path with one member in its query, its name and value encoded. */
export function queryAddress(
  path: string,
  name: string,
  value: string,
): string {
  return `${path}?${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
}

/**
 * A query with every member `name` replaced by one member of `value`, at the
 * end, or with none when `value` is `null`. The other members keep their
 * text. The answer has its `?`, or is empty when no member is left.
 */
export function queryWith(
  search: string,
  name: string,
  value: string | null,
): string {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const members = (query === '' ? [] : query.split('&')).filter((member) => {
    const at = member.indexOf('=');
    return decodePart(at === -1 ? member : member.slice(0, at)) !== name;
  });
  if (value !== null)
    members.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  return members.length === 0 ? '' : `?${members.join('&')}`;
}
