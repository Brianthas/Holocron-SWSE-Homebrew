// Descriptions in the fork are pages copied from the SWSE wiki: a "Reference Book:" line and a
// "See also:" line of wiki links, links through the body, and on some packs the wiki's wrapper div.
// The wiki is not a source for Holocron, so the lines and links go; the link text stays, and the
// book name is kept for errata matching. Fan material the wiki appends to an official page (a
// "Homebrew ..." section carrying one of the wiki's fan-content notices) is left out (rulings.md, Content), and
// so is the notice pointing at a fan page of the same name.

export interface CleanedDescription {
  html: string;
  /** The "Reference Book:" line's text, blank when there is none. */
  sourceBook: string;
  /** The text of every link in the body, in order: a technique names its power this way. */
  links: string[];
  /** Headings of the fan sections removed, for the report. */
  removedSections: string[];
  /** Headings starting "Homebrew" that carry no fan-content notice, left in place for the report. */
  unclearSections: string[];
}

const WIKI_WRAPPER = /^\s*<div class="mw-parser-output">([\s\S]*)<\/div>\s*$/;
const LABELLED_LINE = /<p>\s*(?:<i>\s*)?(Reference Book|See also):(?:&nbsp;|\s)*([\s\S]*?)(?:<\/i>\s*)?<\/p>/g;
// The fork's own label on house content, "Homebrew Talent (tovec.wikidot.com/episode-vii)", as a
// paragraph or inline before the house text: house rules are the rules here, so nothing is
// labelled by origin.
const HOUSE_LABEL_PARAGRAPH = /<p>\s*<i>\s*Homebrew [^<]*\(tovec\.wikidot\.com\/episode-vii\)\s*<\/i>\s*<\/p>/g;
// Captures the letter after the label, which led into the house text in lower case.
const HOUSE_LABEL_INLINE = /<i>\s*Homebrew[^<]*\(tovec\.wikidot\.com\/episode-vii\):?\s*<\/i>\s*([a-z])?/g;
// Bryan's own form on merged house text: "<b>Homebrew:</b> Murderous Arts I and II have been ...".
const HOUSE_LABEL_BOLD = /<b>\s*Homebrew:\s*<\/b>\s*([a-z])?/g;
const FAN_PAGE_NOTICE = /<table\b[^>]*>(?:(?!<\/table>)[\s\S])*?You may be looking for(?:(?!<\/table>)[\s\S])*<\/table>\s*/g;
// The wiki's two notices on fan material, matched on plain text because "Untested" is a link.
const FAN_NOTICES = [/has not been reviewed in a meaningful manner/, /has been Tested per the Untested guidelines/];
const HEADING = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g;
const ANCHOR = /<a\b[^>]*>([\s\S]*?)<\/a>/g;
// The wiki's styling hooks on tables, headings and links; the tables and headings are content.
const WIKI_CLASS = / class="(?:wikitable|mw-[^"]*)"/g;
const BARE_SPAN = /<span(?: id="[^"]*")?>([\s\S]*?)<\/span>/g;
const EMPTY_PARAGRAPH = /<p>\s*<\/p>/g;
const TAG = /<[^>]+>/g;
// Built from code points so this file carries neither character (tools/lint-text.ts).
const EM_DASH = new RegExp(`\\s*${String.fromCharCode(0x2014)}\\s*`, "g");
const EN_DASH = new RegExp(String.fromCharCode(0x2013), "g");

const plain = (html: string) => html.replace(TAG, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** Removes each "Homebrew ..." heading's section, up to the next heading of its level or higher. */
function removeFanSections(html: string, removed: string[], unclear: string[]): string {
  for (;;) {
    const heading = [...html.matchAll(HEADING)].find((m) => /^Homebrew\b/.test(plain(m[2] ?? "")) && !unclear.includes(plain(m[2] ?? "")));
    if (!heading || heading.index === undefined) return html;
    const level = Number(heading[1]);
    const bodyStart = heading.index + heading[0].length;
    const next = html.slice(bodyStart).search(new RegExp(`<h[1-${level}][^>]*>`));
    const end = next < 0 ? html.length : bodyStart + next;
    const title = plain(heading[2] ?? "");
    const body = plain(html.slice(bodyStart, end));
    if (!FAN_NOTICES.some((notice) => notice.test(body))) {
      unclear.push(title);
      continue;
    }
    removed.push(title);
    html = html.slice(0, heading.index) + html.slice(end);
  }
}

const words = (html: string) => html.replace(TAG, " ").replace(/&nbsp;/g, " ").toLowerCase().match(/[a-z0-9]+/g) ?? [];

/**
 * Runs of six or more words in `copy` that `original` does not contain. A word counts as present
 * when some four-word window through it appears in `original`, so reflowed tables and spacing do
 * not count as differences. The fork's shortDescription is usually a flattened copy of the
 * description; this finds where it is not.
 */
export function textNotIn(copy: string, original: string): string[] {
  const ow = words(original);
  const grams = new Set(ow.map((_, i) => ow.slice(i, i + 4).join(" ")));
  const cw = words(copy);
  const covered = cw.map(() => false);
  for (let i = 0; i + 4 <= cw.length; i++) if (grams.has(cw.slice(i, i + 4).join(" "))) for (let k = i; k < i + 4; k++) covered[k] = true;
  const runs: string[] = [];
  for (let i = 0; i < cw.length;) {
    if (covered[i]) { i++; continue; }
    let j = i;
    while (j < cw.length && !covered[j]) j++;
    if (j - i >= 6) runs.push(cw.slice(i, j).join(" "));
    i = j;
  }
  return runs;
}

/** Replaces each paragraph that starts with a given prefix; returns the prefixes it could not find. */
export function rewriteParagraphs(html: string, replace: [string, string][]): { html: string; missing: string[] } {
  const missing: string[] = [];
  for (const [prefix, replacement] of replace) {
    const start = html.indexOf(prefix);
    const end = start < 0 ? -1 : html.indexOf("</p>", start);
    if (end < 0) {
      missing.push(prefix);
      continue;
    }
    html = html.slice(0, start) + replacement + html.slice(end + "</p>".length);
  }
  return { html, missing };
}

export function cleanDescription(source: string): CleanedDescription {
  const removedSections: string[] = [];
  const unclearSections: string[] = [];
  let html = source.replace(WIKI_WRAPPER, "$1");
  html = removeFanSections(html, removedSections, unclearSections).replace(FAN_PAGE_NOTICE, "");
  let sourceBook = "";
  html = html.replace(LABELLED_LINE, (_line, label: string, value: string) => {
    if (label === "Reference Book" && !sourceBook) sourceBook = plain(value);
    return "";
  });
  const capitalise = (_label: string, letter?: string) => letter?.toUpperCase() ?? "";
  html = html.replace(HOUSE_LABEL_PARAGRAPH, "").replace(HOUSE_LABEL_INLINE, capitalise).replace(HOUSE_LABEL_BOLD, capitalise);
  const links: string[] = [];
  html = html.replace(ANCHOR, (_anchor, text: string) => {
    links.push(plain(text));
    return text;
  });
  html = html.replace(WIKI_CLASS, "").replace(BARE_SPAN, "$1").replace(EMPTY_PARAGRAPH, "");
  // The repo carries no en or em dashes (tools/lint-text.ts): a range becomes a hyphen, an aside " - ".
  html = html.replace(EM_DASH, " - ").replace(EN_DASH, "-");
  return { html: html.trim(), sourceBook, links, removedSections, unclearSections };
}
