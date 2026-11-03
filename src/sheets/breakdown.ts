import type { Breakdown, Modifier } from "../rules/modifiers.ts";

export const signed = (n: number): string => (n < 0 ? `${n}` : `+${n}`);
const escape = (s: string) => foundry.utils.escapeHTML(s);

/**
 * A breakdown as tooltip HTML: each counted term, then any typed bonus that did not stack, then the
 * conditional bonuses, which are not in the total.
 */
export function breakdownHtml(title: string, b: Breakdown): string {
  const typed = (m: Modifier) => (m.type ? ` (${escape(m.type)})` : "");
  const rows = b.applied.map((m) => `<tr><td>${escape(m.label)}${typed(m)}</td><td>${signed(m.value)}</td></tr>`).join("");
  const unused = b.suppressed.map((m) => `<tr class="suppressed"><td>${escape(m.label)}${typed(m)}: does not stack</td><td>${signed(m.value)}</td></tr>`).join("");
  const when = b.situational.map((m) => `<tr class="situational"><td>${escape(m.label)}: ${escape(m.condition ?? "")}</td><td>${signed(m.value)}</td></tr>`).join("");
  return `<div class="holocron-breakdown"><strong>${escape(title)} ${b.total}</strong><table>${rows}${unused}${when}</table></div>`;
}
