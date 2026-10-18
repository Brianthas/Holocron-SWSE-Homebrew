// Descriptions in the fork are pages copied from the SWSE wiki: a "Reference Book:" line and a
// "See also:" line of wiki links, links through the body, and on some packs the wiki's wrapper div.
// The wiki is not a source for Holocron, so the lines and links go; the link text stays, and the
// book name is kept for errata matching.

export interface CleanedDescription {
  html: string;
  /** The "Reference Book:" line's text, blank when there is none. */
  sourceBook: string;
  /** The text of every link in the body, in order: a technique names its power this way. */
  links: string[];
}

const WIKI_WRAPPER = /^\s*<div class="mw-parser-output">([\s\S]*)<\/div>\s*$/;
const LABELLED_LINE = /<p>\s*<i>\s*(Reference Book|See also):(?:&nbsp;|\s)*([\s\S]*?)<\/i>\s*<\/p>/g;
// The fork's own label on house content, "Homebrew Talent (tovec.wikidot.com/episode-vii)": house
// rules are the rules here, so nothing is labelled by origin.
const HOUSE_LABEL = /<p>\s*<i>\s*Homebrew [^<]*\(tovec\.wikidot\.com\/episode-vii\)\s*<\/i>\s*<\/p>/g;
const ANCHOR = /<a\b[^>]*>([\s\S]*?)<\/a>/g;
// The wiki's styling hooks on tables and headings; the tables and headings themselves are content.
const WIKI_CLASS = / class="(?:wikitable|mw-[a-z-]+)"/g;
const BARE_SPAN = /<span(?: id="[^"]*")?>([\s\S]*?)<\/span>/g;
const TAG = /<[^>]+>/g;

const plain = (html: string) => html.replace(TAG, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function cleanDescription(source: string): CleanedDescription {
  let html = source.replace(WIKI_WRAPPER, "$1");
  let sourceBook = "";
  html = html.replace(LABELLED_LINE, (_line, label: string, value: string) => {
    if (label === "Reference Book" && !sourceBook) sourceBook = plain(value);
    return "";
  });
  html = html.replace(HOUSE_LABEL, "");
  const links: string[] = [];
  html = html.replace(ANCHOR, (_anchor, text: string) => {
    links.push(plain(text));
    return text;
  });
  html = html.replace(WIKI_CLASS, "").replace(BARE_SPAN, "$1");
  return { html: html.trim(), sourceBook, links };
}
