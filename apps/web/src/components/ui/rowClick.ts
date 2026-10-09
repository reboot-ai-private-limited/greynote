/** What a click on a table row should leave alone: links, buttons and form controls inside it do their own thing. */
const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="menuitem"], [role="button"], [data-no-row-click]';

/** True when the click landed on (or inside) something interactive, so the row must not also navigate. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null;
  return typeof el?.closest === 'function' && el.closest(INTERACTIVE) !== null;
}
