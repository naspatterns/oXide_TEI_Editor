/**
 * Transform TEI XML into HTML for preview rendering.
 * Handles 60+ TEI elements with semantic HTML mappings.
 *
 * Design decisions:
 * - Every TEI element gets a `tei-{elementName}` class for CSS targeting
 * - @rend attribute values are mapped to CSS classes where possible
 * - The teiHeader is rendered in a collapsed/subtle style by default
 * - Named entities (persName, placeName, etc.) get distinctive colors
 */

/** Map TEI element local names → { html tag, optional class } */
const ELEMENT_MAP: Record<string, { tag: string; className?: string; block?: boolean }> = {
  // Root & structure
  TEI: { tag: 'article', className: 'tei-TEI' },
  teiHeader: { tag: 'header', className: 'tei-header', block: true },
  text: { tag: 'div', className: 'tei-text', block: true },
  body: { tag: 'div', className: 'tei-body', block: true },
  front: { tag: 'div', className: 'tei-front', block: true },
  back: { tag: 'div', className: 'tei-back', block: true },
  group: { tag: 'div', className: 'tei-group', block: true },
  div: { tag: 'section', className: 'tei-div', block: true },
  div1: { tag: 'section', className: 'tei-div', block: true },
  div2: { tag: 'section', className: 'tei-div', block: true },
  div3: { tag: 'section', className: 'tei-div', block: true },

  // Block elements
  p: { tag: 'p', className: 'tei-p', block: true },
  ab: { tag: 'p', className: 'tei-ab', block: true },
  head: { tag: 'h2', className: 'tei-head', block: true },
  trailer: { tag: 'p', className: 'tei-trailer', block: true },
  closer: { tag: 'div', className: 'tei-closer', block: true },
  opener: { tag: 'div', className: 'tei-opener', block: true },
  salute: { tag: 'p', className: 'tei-salute', block: true },
  signed: { tag: 'p', className: 'tei-signed', block: true },
  dateline: { tag: 'p', className: 'tei-dateline', block: true },
  byline: { tag: 'p', className: 'tei-byline', block: true },
  argument: { tag: 'div', className: 'tei-argument', block: true },
  epigraph: { tag: 'blockquote', className: 'tei-epigraph', block: true },

  // Poetry
  lg: { tag: 'div', className: 'tei-lg', block: true },
  l: { tag: 'div', className: 'tei-l', block: true },
  caesura: { tag: 'span', className: 'tei-caesura' },

  // Drama
  sp: { tag: 'div', className: 'tei-sp', block: true },
  speaker: { tag: 'strong', className: 'tei-speaker', block: true },
  stage: { tag: 'em', className: 'tei-stage', block: true },
  castList: { tag: 'div', className: 'tei-castList', block: true },
  castItem: { tag: 'div', className: 'tei-castItem', block: true },
  role: { tag: 'span', className: 'tei-role' },
  roleDesc: { tag: 'span', className: 'tei-roleDesc' },

  // Highlighting & emphasis
  hi: { tag: 'span', className: 'tei-hi' },
  emph: { tag: 'em', className: 'tei-emph' },
  foreign: { tag: 'em', className: 'tei-foreign' },
  distinct: { tag: 'span', className: 'tei-distinct' },
  mentioned: { tag: 'span', className: 'tei-mentioned' },
  soCalled: { tag: 'q', className: 'tei-soCalled' },
  term: { tag: 'dfn', className: 'tei-term' },
  gloss: { tag: 'span', className: 'tei-gloss' },

  // Titles & references
  title: { tag: 'cite', className: 'tei-title' },
  ref: { tag: 'a', className: 'tei-ref' },
  ptr: { tag: 'a', className: 'tei-ptr' },

  // Names & entities
  name: { tag: 'span', className: 'tei-name' },
  persName: { tag: 'span', className: 'tei-persName' },
  forename: { tag: 'span', className: 'tei-forename' },
  surname: { tag: 'span', className: 'tei-surname' },
  placeName: { tag: 'span', className: 'tei-placeName' },
  settlement: { tag: 'span', className: 'tei-settlement' },
  region: { tag: 'span', className: 'tei-region' },
  country: { tag: 'span', className: 'tei-country' },
  orgName: { tag: 'span', className: 'tei-orgName' },
  rs: { tag: 'span', className: 'tei-rs' },

  // Dates & measures
  date: { tag: 'time', className: 'tei-date' },
  num: { tag: 'span', className: 'tei-num' },
  measure: { tag: 'span', className: 'tei-measure' },

  // Quotation & citation
  q: { tag: 'q', className: 'tei-q' },
  quote: { tag: 'blockquote', className: 'tei-quote', block: true },
  cit: { tag: 'figure', className: 'tei-cit', block: true },
  bibl: { tag: 'cite', className: 'tei-bibl' },
  biblStruct: { tag: 'div', className: 'tei-biblStruct', block: true },

  // Notes
  note: { tag: 'aside', className: 'tei-note' },

  // Editorial interventions
  abbr: { tag: 'abbr', className: 'tei-abbr' },
  expan: { tag: 'span', className: 'tei-expan' },
  choice: { tag: 'span', className: 'tei-choice' },
  orig: { tag: 'span', className: 'tei-orig' },
  reg: { tag: 'span', className: 'tei-reg' },
  sic: { tag: 'span', className: 'tei-sic' },
  corr: { tag: 'span', className: 'tei-corr' },
  add: { tag: 'ins', className: 'tei-add' },
  del: { tag: 'del', className: 'tei-del' },
  subst: { tag: 'span', className: 'tei-subst' },
  supplied: { tag: 'span', className: 'tei-supplied' },
  unclear: { tag: 'span', className: 'tei-unclear' },
  gap: { tag: 'span', className: 'tei-gap' },
  space: { tag: 'span', className: 'tei-space' },

  // Lists
  list: { tag: 'ul', className: 'tei-list', block: true },
  item: { tag: 'li', className: 'tei-item', block: true },
  label: { tag: 'span', className: 'tei-label' },

  // Tables
  table: { tag: 'table', className: 'tei-table', block: true },
  row: { tag: 'tr', className: 'tei-row' },
  cell: { tag: 'td', className: 'tei-cell' },

  // Figures
  figure: { tag: 'figure', className: 'tei-figure', block: true },
  graphic: { tag: 'img', className: 'tei-graphic' },
  figDesc: { tag: 'figcaption', className: 'tei-figDesc', block: true },

  // Milestones
  pb: { tag: 'hr', className: 'tei-pb' },
  lb: { tag: 'br', className: 'tei-lb' },
  cb: { tag: 'span', className: 'tei-cb' },
  milestone: { tag: 'span', className: 'tei-milestone' },

  // Segments
  seg: { tag: 'span', className: 'tei-seg' },
  fw: { tag: 'span', className: 'tei-fw' },
  anchor: { tag: 'a', className: 'tei-anchor' },

  // Critical apparatus
  app: { tag: 'span', className: 'tei-app' },
  lem: { tag: 'span', className: 'tei-lem' },
  rdg: { tag: 'span', className: 'tei-rdg' },

  // Header children
  fileDesc: { tag: 'div', className: 'tei-fileDesc', block: true },
  titleStmt: { tag: 'div', className: 'tei-titleStmt', block: true },
  publicationStmt: { tag: 'div', className: 'tei-publicationStmt', block: true },
  sourceDesc: { tag: 'div', className: 'tei-sourceDesc', block: true },
  encodingDesc: { tag: 'div', className: 'tei-encodingDesc', block: true },
  profileDesc: { tag: 'div', className: 'tei-profileDesc', block: true },
  revisionDesc: { tag: 'div', className: 'tei-revisionDesc', block: true },
  respStmt: { tag: 'div', className: 'tei-respStmt', block: true },
  resp: { tag: 'span', className: 'tei-resp' },
  publisher: { tag: 'span', className: 'tei-publisher' },
  pubPlace: { tag: 'span', className: 'tei-pubPlace' },
  availability: { tag: 'div', className: 'tei-availability', block: true },
  licence: { tag: 'div', className: 'tei-licence', block: true },
  author: { tag: 'span', className: 'tei-author' },
  editor: { tag: 'span', className: 'tei-editor' },
  idno: { tag: 'span', className: 'tei-idno' },
  change: { tag: 'div', className: 'tei-change', block: true },
};

/** Map @rend values to CSS class suffixes */
const REND_MAP: Record<string, string> = {
  italic: 'rend-italic',
  italics: 'rend-italic',
  bold: 'rend-bold',
  underline: 'rend-underline',
  'line-through': 'rend-strikethrough',
  strikethrough: 'rend-strikethrough',
  sup: 'rend-sup',
  superscript: 'rend-sup',
  sub: 'rend-sub',
  subscript: 'rend-sub',
  smallcaps: 'rend-smallcaps',
  'small-caps': 'rend-smallcaps',
  center: 'rend-center',
  right: 'rend-right',
  indent: 'rend-indent',
};

function transformNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? '');
  }
  if (node.nodeType === Node.COMMENT_NODE) return '';
  if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) return '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as Element;
  const localName = el.localName;
  const mapping = ELEMENT_MAP[localName];

  // Handle void/self-closing elements
  if (localName === 'pb') {
    const n = el.getAttribute('n');
    return `<hr class="tei-pb" ${n ? `data-n="${escapeAttr(n)}"` : ''} />`;
  }
  if (localName === 'lb') return '<br class="tei-lb" />';
  if (localName === 'cb') return '<span class="tei-cb"> | </span>';
  if (localName === 'gap') {
    const reason = el.getAttribute('reason') ?? 'gap';
    return `<span class="tei-gap" title="${escapeAttr(reason)}">[...]</span>`;
  }
  if (localName === 'space') return '<span class="tei-space">&nbsp;&nbsp;</span>';
  if (localName === 'graphic') {
    const url = el.getAttribute('url') ?? '';
    return `<img class="tei-graphic" src="${escapeAttr(url)}" alt="[graphic]" />`;
  }

  // Handle <choice>: show first child, tooltip with second
  if (localName === 'choice') {
    return transformChoice(el);
  }

  const childHtml = Array.from(el.childNodes).map(transformNode).join('');

  // Build class list
  const classes: string[] = [];
  if (mapping?.className) classes.push(mapping.className);
  else classes.push(`tei-${localName}`);

  // Map @rend attribute to CSS classes
  const rend = el.getAttribute('rend');
  if (rend) {
    for (const r of rend.split(/\s+/)) {
      const cls = REND_MAP[r.toLowerCase()];
      if (cls) classes.push(cls);
    }
  }

  // Map @type to a data attribute for CSS targeting
  const type = el.getAttribute('type');
  const typeAttr = type ? ` data-type="${escapeAttr(type)}"` : '';

  // Special handling for ref/ptr → make them links
  if (localName === 'ref' || localName === 'ptr') {
    const target = el.getAttribute('target') ?? '';
    const linkText = childHtml || target || '[link]';
    return `<a class="${classes.join(' ')}" href="${escapeAttr(target)}" target="_blank"${typeAttr}>${linkText}</a>`;
  }

  // Special handling for <note> with @place
  if (localName === 'note') {
    const place = el.getAttribute('place') ?? '';
    if (place === 'foot' || place === 'end') {
      return `<sup class="tei-note-marker">[note]</sup><aside class="${classes.join(' ')}"${typeAttr}>${childHtml}</aside>`;
    }
  }

  if (mapping) {
    return `<${mapping.tag} class="${classes.join(' ')}"${typeAttr}>${childHtml}</${mapping.tag}>`;
  }

  // Default: inline span
  return `<span class="${classes.join(' ')}"${typeAttr}>${childHtml}</span>`;
}

/** Handle <choice> by showing preferred reading with tooltip */
function transformChoice(el: Element): string {
  const children = Array.from(el.children);
  // Preference order: reg > corr > expan (normalized forms)
  const preferred = children.find(c => c.localName === 'reg')
    ?? children.find(c => c.localName === 'corr')
    ?? children.find(c => c.localName === 'expan')
    ?? children[0];

  const original = children.find(c => c.localName === 'orig')
    ?? children.find(c => c.localName === 'sic')
    ?? children.find(c => c.localName === 'abbr')
    ?? children[children.length - 1];

  if (!preferred) return '';

  const preferredHtml = transformNode(preferred);
  const originalText = original?.textContent ?? '';

  return `<span class="tei-choice" title="Original: ${escapeAttr(originalText)}">${preferredHtml}</span>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function teiToHtml(xmlStr: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'application/xml');
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) {
      return `<div class="preview-error">XML Parse Error: ${escapeHtml(errorNode.textContent ?? '')}</div>`;
    }
    return transformNode(doc.documentElement);
  } catch {
    return '<div class="preview-error">Unable to parse XML</div>';
  }
}
