/** Lower case `a-z` and `0-9` joined by single hyphens; accents fold to the plain letter, anything else is dropped (`Zoë D'Souza` → `zoe-d-souza`). */
export const slug = (s: string | null | undefined) =>
  (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
