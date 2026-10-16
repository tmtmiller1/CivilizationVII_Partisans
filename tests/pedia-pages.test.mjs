// pedia-pages.test.mjs - Civilopedia page-resolution gate: every page the mod adds must have text to draw.
//
// The pedia resolves a chaptered page's body without any database row: for each chapter of the page's layout it
// looks for that chapter's paragraphs by key convention and stops at the first gap (base-standard
// ui/civilopedia/model-civilopedia.js, getChapterBody → findChapterTextKey):
//
//     <prefix>_CHAPTER_<chapter>_BODY            one paragraph, or
//     <prefix>_CHAPTER_<chapter>_PARA_1, _PARA_2, …   until a number is missing
//
// where <prefix> is tried as LOC_PEDIA_<section>_PAGE_<page>, then LOC_PEDIA_<section>_PAGE, then
// LOC_PEDIA_PAGE_<page>, then LOC_PEDIA_PAGE. A chapter with no text is skipped silently, and a page whose chapters
// are all empty renders as a title with nothing under it: no error, no log line, nothing to notice short of opening
// the page in game. The same goes for a mistyped page Name. So this gate walks the shipped data the way the engine
// does and fails on a page that would come up blank, a paragraph sequence with a hole in it (PARA_1 and PARA_3
// silently drops PARA_3), a layout or page group that's referenced but never defined, and any referenced LOC key
// with no en_us row. It also checks the search terms and that each page and group title fits the sidebar, which
// cuts long names off with an ellipsis.
//
// It covers the mod's side of the contract; only opening the Civilopedia in game shows the engine drawing it.
// Ported from Cultural Diffusion's tests/pedia-pages.mjs, as node:test blocks so `npm test` names each check.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SECTION_PREFIX = "LOC_PEDIA_";
// Base-game sections and page groups the mod adds a page to without defining them. Partisans defines its own.
const BASE_SECTIONS = [];
const BASE_GROUPS = [];
// Base-game layouts the mod could reuse rather than define. "Concept" is a single CONTENT chapter
// (base-standard/data/civilopedia.xml), so a page on it needs an explicit paragraph row.
const BASE_LAYOUTS = { Concept: ["CONTENT"] };
// Longest sidebar name that draws without an ellipsis (Cultural Diffusion saw "Notifications & the City R..." cut
// at 26).
const MAX_TAB_CHARS = 24;

const read = (p) => fs.readFileSync(p, "utf8");
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
/** The attributes of one tag, as an object. */
function attrsOf(tag) {
  const o = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) o[m[1]] = m[2];
  return o;
}
/** Every `<Row …>` inside every `<table>…</table>` block of `xml`. */
function rowsIn(xml, table) {
  const out = [];
  for (const block of xml.matchAll(new RegExp(`<${table}(?:\\s[^>]*)?>([\\s\\S]*?)</${table}>`, "g"))) {
    for (const m of block[1].matchAll(/<Row(\s[^>]*?)\/?>/g)) out.push(attrsOf(m[1]));
  }
  return out;
}

// What the mod ships.
const dataFiles = walk(path.join(root, "data")).filter((f) => f.endsWith(".xml") && /Civilopedia/.test(read(f)));
const dataXml = dataFiles.map(read).join("\n");
const enFiles = walk(path.join(root, "text/en_us")).filter((p) => p.endsWith(".xml"));
const englishText = new Map();
for (const f of enFiles) {
  for (const m of read(f).matchAll(/<(?:Row|Replace)\s+Tag="([A-Z0-9_]+)"\s*>\s*<Text>([\s\S]*?)<\/Text>/g)) {
    englishText.set(m[1], m[2].replace(/&amp;/g, "&"));
  }
}
const defined = new Set(englishText.keys());

const sections = rowsIn(dataXml, "CivilopediaSections");
const groups = rowsIn(dataXml, "CivilopediaPageGroups");
const layouts = rowsIn(dataXml, "CivilopediaPageLayouts");
const layoutChapters = rowsIn(dataXml, "CivilopediaPageLayoutChapters");
const pages = rowsIn(dataXml, "CivilopediaPages");
const paragraphRows = rowsIn(dataXml, "CivilopediaPageChapterParagraphs");
const searchTerms = rowsIn(dataXml, "CivilopediaPageSearchTerms");

const sectionIds = new Set([...sections.map((r) => r.SectionID), ...BASE_SECTIONS]);
const groupIds = new Set([...groups.map((r) => `${r.SectionID}|${r.PageGroupID}`), ...BASE_GROUPS]);
const layoutIds = new Set([...layouts.map((r) => r.PageLayoutID), ...Object.keys(BASE_LAYOUTS)]);

/** The chapters of a layout, the mod's or the base game's. */
const chaptersOf = (layoutId) => BASE_LAYOUTS[layoutId]
  ?? layoutChapters.filter((r) => r.PageLayoutID === layoutId).map((r) => r.ChapterID);

/** The explicit paragraph row for a page's chapter, if it has one. */
const paragraphFor = (page, chapter) =>
  paragraphRows.find((r) => r.SectionID === page.SectionID && r.PageID === page.PageID && r.ChapterID === chapter);

/**
 * The paragraph keys the engine would find for one chapter, by the convention above, tried against each key prefix
 * in the engine's order, and any paragraphs stranded past a hole. An empty `found` means the chapter draws nothing.
 */
function conventionParagraphs(page, chapter) {
  const prefixes = [
    `${SECTION_PREFIX}${page.SectionID}_PAGE_${page.PageID}`,
    `${SECTION_PREFIX}${page.SectionID}_PAGE`,
    `${SECTION_PREFIX}PAGE_${page.PageID}`,
    `${SECTION_PREFIX}PAGE`
  ];
  const holes = [];
  for (const prefix of prefixes) {
    const stem = `${prefix}_CHAPTER_${chapter}`;
    if (defined.has(`${stem}_BODY`)) return { found: [`${stem}_BODY`], holes };
    const found = [];
    for (let i = 1; defined.has(`${stem}_PARA_${i}`); i++) found.push(`${stem}_PARA_${i}`);
    // A hole is silent data loss: the engine stops at the gap. This runs even when nothing was found, because the
    // commonest way to make one is to lose PARA_1 itself, which strands the whole chapter.
    const stranded = [];
    for (let i = found.length + 2; i <= found.length + 20; i++) if (defined.has(`${stem}_PARA_${i}`)) stranded.push(i);
    if (stranded.length) {
      holes.push(`${page.PageID}/${chapter}: ${stem}_PARA_${found.length + 1} is missing, so the engine stops there and never draws ${stranded.map((i) => "PARA_" + i).join(", ")}`);
    }
    if (found.length) return { found, holes };
  }
  return { found: [], holes };
}

test("the mod ships Civilopedia data and English text for it", () => {
  assert.ok(dataFiles.length, "no Civilopedia data file under data/");
  assert.ok(pages.length, "no CivilopediaPages rows");
  assert.ok(enFiles.length, "no text/en_us files");
});

test("a file declares its own layouts before the tables that point at them", () => {
  // CivilopediaPages.PageLayoutID and CivilopediaPageLayoutChapters.PageLayoutID are foreign keys onto
  // CivilopediaPageLayouts, and the loader inserts in document order: a file that uses one of its own layouts before
  // declaring it inserts against a row that isn't there yet, which rolls the mod back when a game starts.
  const problems = [];
  for (const f of dataFiles) {
    const xml = read(f);
    const declared = new Set(rowsIn(xml, "CivilopediaPageLayouts").map((r) => r.PageLayoutID));
    const layoutsAt = xml.indexOf("<CivilopediaPageLayouts>");
    for (const table of ["CivilopediaPages", "CivilopediaPageLayoutChapters"]) {
      const usesOwn = rowsIn(xml, table).some((r) => declared.has(r.PageLayoutID));
      const at = xml.indexOf(`<${table}>`);
      if (usesOwn && at !== -1 && (layoutsAt === -1 || layoutsAt > at)) problems.push(`${path.basename(f)}: <${table}> comes before <CivilopediaPageLayouts>`);
    }
  }
  assert.deepEqual(problems, []);
});

test("sections, groups and layouts are defined where they're used, and their names have English text", () => {
  const problems = [];
  for (const r of sections) if (!defined.has(r.Name)) problems.push(`section ${r.SectionID}: Name ${r.Name} has no en_us row`);
  for (const r of groups) {
    if (!sectionIds.has(r.SectionID)) problems.push(`page group ${r.PageGroupID}: unknown SectionID ${r.SectionID}`);
    if (!defined.has(r.Name)) problems.push(`page group ${r.PageGroupID}: Name ${r.Name} has no en_us row`);
  }
  for (const r of layoutChapters) {
    if (!layouts.some((l) => l.PageLayoutID === r.PageLayoutID)) problems.push(`layout chapter ${r.PageLayoutID}/${r.ChapterID}: layout not defined`);
  }
  assert.deepEqual(problems, []);
});

test("every page resolves to a title and draws text in every chapter, with no hole in a paragraph run", () => {
  const problems = [];
  for (const page of pages) {
    const id = `${page.SectionID}/${page.PageID}`;
    if (!sectionIds.has(page.SectionID)) problems.push(`${id}: unknown SectionID`);
    if (!groupIds.has(`${page.SectionID}|${page.PageGroupID}`)) problems.push(`${id}: PageGroupID ${page.PageGroupID} is not defined`);
    if (!layoutIds.has(page.PageLayoutID)) problems.push(`${id}: PageLayoutID ${page.PageLayoutID} is not defined`);
    if (!defined.has(page.Name)) problems.push(`${id}: Name ${page.Name} has no en_us row`);
    const chapters = chaptersOf(page.PageLayoutID);
    if (!chapters.length) problems.push(`${id}: layout ${page.PageLayoutID} declares no chapters`);
    for (const chapter of chapters) {
      const explicit = paragraphFor(page, chapter);
      if (explicit) {
        if (!defined.has(explicit.Paragraph)) problems.push(`${id}/${chapter}: Paragraph ${explicit.Paragraph} has no en_us row`);
        continue;
      }
      const { found, holes } = conventionParagraphs(page, chapter);
      problems.push(...holes);
      // Every chapter this mod declares is meant to draw: an empty one is a lost paragraph, not a design choice.
      if (!found.length) problems.push(`${id}/${chapter}: the chapter has no text, so the engine skips it`);
    }
  }
  assert.deepEqual(problems, []);
});

test("sidebar names fit without an ellipsis, and page ids are unique", () => {
  // The pedia's search (the box, and engine.trigger("open-civilopedia", id)) matches a bare page id across every
  // section, so two pages sharing an id make one of them unreachable by id.
  const problems = [];
  for (const r of [...pages, ...groups]) {
    const t = englishText.get(r.Name);
    if (t && t.length > MAX_TAB_CHARS) problems.push(`${r.PageID ?? r.PageGroupID}: "${t}" is ${t.length} characters`);
  }
  const seen = new Set();
  for (const p of pages) {
    if (seen.has(p.PageID)) problems.push(`page id ${p.PageID} is used twice`);
    seen.add(p.PageID);
  }
  assert.deepEqual(problems, []);
});

test("search terms name real pages and have text", () => {
  const problems = [];
  for (const r of searchTerms) {
    if (!pages.some((p) => p.SectionID === r.SectionID && p.PageID === r.PageID)) problems.push(`search term ${r.Term}: no page ${r.SectionID}/${r.PageID}`);
    if (!defined.has(r.Term)) problems.push(`search term ${r.Term} has no en_us row`);
  }
  assert.deepEqual(problems, []);
});

test("no paragraph row or chapter title points at a page or chapter that doesn't exist", () => {
  const problems = [];
  for (const r of paragraphRows) {
    const page = pages.find((p) => p.SectionID === r.SectionID && p.PageID === r.PageID);
    if (!page) problems.push(`paragraph row ${r.SectionID}/${r.PageID}/${r.ChapterID}: no such page`);
    else if (!chaptersOf(page.PageLayoutID).includes(r.ChapterID)) problems.push(`paragraph row ${r.SectionID}/${r.PageID}/${r.ChapterID}: layout ${page.PageLayoutID} has no such chapter`);
  }
  // A renamed chapter leaves its title behind, and nothing shows it.
  const chapterIds = new Set([...layoutChapters.map((r) => r.ChapterID), ...Object.values(BASE_LAYOUTS).flat()]);
  for (const key of defined) {
    const m = key.match(/^LOC_PEDIA_[A-Z0-9]+_PAGE(?:_[A-Z0-9_]+?)?_CHAPTER_([A-Z0-9]+)_TITLE$/);
    if (m && !chapterIds.has(m[1])) problems.push(`${key}: no layout declares a chapter named ${m[1]}`);
  }
  // Every paragraph key in the text belongs to a chapter some page draws, so none of the text is dead.
  const drawn = new Set();
  for (const page of pages) {
    for (const chapter of chaptersOf(page.PageLayoutID)) for (const k of conventionParagraphs(page, chapter).found) drawn.add(k);
  }
  for (const key of defined) {
    if (/_CHAPTER_[A-Z0-9]+_(?:PARA_\d+|BODY)$/.test(key) && key.startsWith(SECTION_PREFIX) && !drawn.has(key)) problems.push(`${key}: no page draws it`);
  }
  assert.deepEqual(problems, []);
});
