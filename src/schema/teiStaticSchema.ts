import type { ElementSpec, AttrSpec } from '../types/schema';

/**
 * Static TEI schema data for immediate autocompletion.
 * This covers the most commonly used TEI elements and attributes,
 * derived from the TEI Lite and TEI All guidelines.
 *
 * This serves as a fast fallback when full RNG parsing isn't available,
 * and as the base for the "TEI Lite" schema preset.
 */

const globalAttrs: AttrSpec[] = [
  { name: 'xml:id', documentation: 'Unique identifier' },
  { name: 'xml:lang', documentation: 'Language code (e.g. "en", "ko")' },
  { name: 'n', documentation: 'Number or label' },
  { name: 'type', documentation: 'Type classification' },
  { name: 'subtype', documentation: 'Sub-classification' },
  { name: 'rend', documentation: 'Rendition (e.g. "italic", "bold")' },
  { name: 'rendition', documentation: 'Points to a rendition element' },
  { name: 'style', documentation: 'CSS-like style string' },
  { name: 'resp', documentation: 'Responsible party' },
  { name: 'cert', documentation: 'Certainty level', values: ['high', 'medium', 'low', 'unknown'] },
  { name: 'source', documentation: 'Source of information' },
  { name: 'corresp', documentation: 'Corresponds to' },
  { name: 'ana', documentation: 'Analysis or interpretation' },
];

function el(
  name: string,
  doc: string,
  children: string[],
  extraAttrs: AttrSpec[] = [],
): ElementSpec {
  return {
    name,
    documentation: doc,
    children,
    attributes: [...globalAttrs, ...extraAttrs],
  };
}

// Header elements
const headerChildren = ['fileDesc', 'encodingDesc', 'profileDesc', 'revisionDesc', 'xenoData'];
const fileDescChildren = ['titleStmt', 'editionStmt', 'extent', 'publicationStmt', 'seriesStmt', 'notesStmt', 'sourceDesc'];
const titleStmtChildren = ['title', 'author', 'editor', 'funder', 'principal', 'sponsor', 'respStmt'];

// Text structure
const divLikeChildren = ['head', 'p', 'ab', 'div', 'lg', 'l', 'sp', 's', 'list', 'table', 'figure', 'note', 'quote', 'cit', 'bibl', 'milestone', 'pb', 'lb', 'cb', 'gap', 'space', 'fw', 'trailer', 'closer', 'opener', 'salute', 'signed', 'dateline', 'byline', 'argument', 'epigraph', 'floatingText', 'entry'];

const paraContent = ['hi', 'emph', 'title', 'name', 'persName', 'placeName', 'orgName', 'date', 'num', 'measure', 'rs', 'ref', 'ptr', 'note', 'q', 'quote', 'cit', 'bibl', 'foreign', 'term', 'gloss', 'soCalled', 'mentioned', 'abbr', 'expan', 'choice', 'orig', 'reg', 'sic', 'corr', 'add', 'del', 'subst', 'supplied', 'unclear', 'gap', 'pb', 'lb', 'cb', 'milestone', 'seg', 'anchor', 'fw', 'app', 'witDetail', 'figure', 'graphic', 'formula', 'list', 'table', 's', 'w', 'c', 'pc', 'cl', 'phr'];

export const TEI_LITE_ELEMENTS: ElementSpec[] = [
  // Root
  el('TEI', 'Root element of a TEI document', ['teiHeader', 'text', 'facsimile', 'standOff']),

  // Header
  el('teiHeader', 'TEI header containing metadata', headerChildren),
  el('fileDesc', 'File description', fileDescChildren),
  el('titleStmt', 'Title statement', titleStmtChildren),
  el('title', 'Title of the work', paraContent, [
    { name: 'level', values: ['a', 'm', 's', 'j', 'u'], documentation: 'Bibliographic level' },
  ]),
  el('author', 'Author of the work', paraContent),
  el('editor', 'Editor of the work', paraContent, [
    { name: 'role', documentation: 'Role of the editor' },
  ]),
  el('respStmt', 'Responsibility statement', ['resp', 'name', 'persName', 'orgName']),
  el('resp', 'Nature of responsibility', paraContent),
  el('publicationStmt', 'Publication statement', ['publisher', 'distributor', 'authority', 'pubPlace', 'address', 'date', 'idno', 'availability', 'p']),
  el('publisher', 'Publisher name', paraContent),
  el('pubPlace', 'Publication place', paraContent),
  el('availability', 'Availability statement', ['p', 'licence'], [
    { name: 'status', values: ['free', 'unknown', 'restricted'], documentation: 'Availability status' },
  ]),
  el('licence', 'Licence information', ['p'], [
    { name: 'target', documentation: 'URL of the licence' },
  ]),
  el('sourceDesc', 'Source description', ['p', 'bibl', 'biblStruct', 'biblFull', 'listBibl', 'msDesc', 'listWit']),
  el('encodingDesc', 'Encoding description', ['projectDesc', 'editorialDecl', 'tagsDecl', 'classDecl', 'appInfo', 'p']),
  el('profileDesc', 'Profile description', ['creation', 'langUsage', 'textClass', 'correspDesc', 'settingDesc', 'particDesc', 'abstract']),
  el('revisionDesc', 'Revision description', ['change', 'listChange']),
  el('change', 'A change record', paraContent, [
    { name: 'when', documentation: 'Date of change' },
    { name: 'who', documentation: 'Person responsible' },
  ]),
  el('idno', 'Identifier', paraContent, [
    { name: 'type', documentation: 'Type of identifier (e.g. ISBN, DOI, URL)' },
  ]),

  // Text structure
  el('text', 'Text body container', ['front', 'body', 'back', 'group']),
  el('front', 'Front matter', ['titlePage', ...divLikeChildren]),
  el('body', 'Document body', divLikeChildren),
  el('back', 'Back matter', divLikeChildren),
  el('group', 'Group of texts', ['text', 'group']),
  el('div', 'Text division', divLikeChildren, [
    { name: 'type', documentation: 'Type (e.g. chapter, section, act, scene)' },
  ]),
  el('head', 'Heading', paraContent),
  el('p', 'Paragraph', paraContent),
  el('ab', 'Anonymous block', paraContent),
  el('trailer', 'Closing formula at end of division', paraContent),
  el('closer', 'Closing group (e.g. at end of letter)', ['salute', 'signed', 'dateline', 'p', ...paraContent]),
  el('opener', 'Opening group (e.g. at start of letter)', ['salute', 'signed', 'dateline', 'p', ...paraContent]),
  el('salute', 'Salutation', paraContent),
  el('signed', 'Signature', paraContent),
  el('dateline', 'Dateline', paraContent),

  // Poetry
  el('lg', 'Line group (stanza)', ['l', 'lg', 'head', 'trailer', 'pb', 'lb'], [
    { name: 'type', documentation: 'Type (e.g. stanza, couplet, tercet)' },
    { name: 'rhyme', documentation: 'Rhyme scheme' },
    { name: 'met', documentation: 'Metre' },
  ]),
  el('l', 'Verse line', paraContent, [
    { name: 'met', documentation: 'Metre' },
    { name: 'rhyme', documentation: 'Rhyme label' },
    { name: 'part', values: ['I', 'M', 'F', 'N', 'Y'], documentation: 'Part of metrical line' },
  ]),

  // Drama
  el('sp', 'Speech', ['speaker', 'p', 'lg', 'l', 'ab', 'stage', 'note'], [
    { name: 'who', documentation: 'Speaker identifier' },
  ]),
  el('speaker', 'Speaker name', paraContent),
  el('stage', 'Stage direction', paraContent, [
    { name: 'type', documentation: 'Type (e.g. entrance, exit, setting, delivery, business)' },
  ]),
  el('castList', 'Cast list', ['castItem', 'castGroup', 'head']),
  el('castItem', 'Cast list item', ['role', 'roleDesc', 'actor']),
  el('role', 'Role name', paraContent),
  el('roleDesc', 'Role description', paraContent),

  // Highlighting & emphasis
  el('hi', 'Highlighted text', paraContent, [
    { name: 'rend', documentation: 'Rendition (e.g. italic, bold, sup, sub)' },
  ]),
  el('emph', 'Emphasized text', paraContent),

  // Names & entities
  el('name', 'Name', paraContent, [
    { name: 'type', documentation: 'Type (e.g. person, place, org)' },
    { name: 'ref', documentation: 'Reference to authority record' },
  ]),
  el('persName', 'Personal name', [...paraContent, 'forename', 'surname', 'genName', 'roleName', 'addName', 'nameLink'], [
    { name: 'ref', documentation: 'Reference to person record' },
  ]),
  el('forename', 'Forename', paraContent),
  el('surname', 'Surname', paraContent),
  el('placeName', 'Place name', [...paraContent, 'settlement', 'region', 'country', 'bloc', 'geogName'], [
    { name: 'ref', documentation: 'Reference to place record' },
  ]),
  el('settlement', 'Settlement name', paraContent),
  el('region', 'Region name', paraContent),
  el('country', 'Country name', paraContent),
  el('orgName', 'Organization name', paraContent, [
    { name: 'ref', documentation: 'Reference to org record' },
  ]),
  el('rs', 'Referring string', paraContent, [
    { name: 'type', documentation: 'Type of referent' },
    { name: 'ref', documentation: 'Reference' },
    { name: 'key', documentation: 'Key for referent' },
  ]),

  // Dates & numbers
  el('date', 'Date', paraContent, [
    { name: 'when', documentation: 'Normalized date (ISO 8601)' },
    { name: 'notBefore', documentation: 'Earliest possible date' },
    { name: 'notAfter', documentation: 'Latest possible date' },
    { name: 'from', documentation: 'Start of date range' },
    { name: 'to', documentation: 'End of date range' },
    { name: 'calendar', documentation: 'Calendar system' },
  ]),
  el('num', 'Number', paraContent, [
    { name: 'value', documentation: 'Numeric value' },
    { name: 'type', documentation: 'Type (cardinal, ordinal, fraction, percentage)' },
  ]),
  el('measure', 'Measurement', paraContent, [
    { name: 'quantity', documentation: 'Numeric quantity' },
    { name: 'unit', documentation: 'Unit of measurement' },
    { name: 'commodity', documentation: 'Commodity being measured' },
  ]),

  // Quotation & citation
  el('q', 'Quoted text', paraContent, [
    { name: 'who', documentation: 'Speaker' },
    { name: 'type', documentation: 'Type (spoken, written, thought)' },
  ]),
  el('quote', 'Block quotation', [...paraContent, 'p', 'lg', 'l']),
  el('cit', 'Citation (quote + reference)', ['quote', 'bibl', 'ref', 'q']),
  el('bibl', 'Bibliographic reference', [...paraContent, 'author', 'editor', 'title', 'date', 'publisher', 'pubPlace', 'idno']),

  // Terms & glosses
  el('foreign', 'Foreign word', paraContent, [
    { name: 'xml:lang', documentation: 'Language of the foreign text' },
  ]),
  el('term', 'Technical term', paraContent, [
    { name: 'ref', documentation: 'Reference to definition' },
  ]),
  el('gloss', 'Gloss or explanation', paraContent),
  el('soCalled', 'So-called', paraContent),
  el('mentioned', 'Mentioned word', paraContent),

  // Editorial
  el('abbr', 'Abbreviation', paraContent),
  el('expan', 'Expansion of abbreviation', paraContent),
  el('choice', 'Editorial choice', ['abbr', 'expan', 'orig', 'reg', 'sic', 'corr', 'seg']),
  el('orig', 'Original form', paraContent),
  el('reg', 'Regularized form', paraContent),
  el('sic', 'Apparent error in source', paraContent),
  el('corr', 'Correction', paraContent),
  el('add', 'Addition', paraContent, [
    { name: 'place', documentation: 'Place of addition (above, below, inline, margin)' },
  ]),
  el('del', 'Deletion', paraContent, [
    { name: 'rend', documentation: 'How rendered (strikethrough, overwritten, erased)' },
  ]),
  el('subst', 'Substitution', ['add', 'del']),
  el('supplied', 'Supplied text', paraContent, [
    { name: 'reason', documentation: 'Reason for supplying (damage, omitted, illegible)' },
  ]),
  el('unclear', 'Unclear text', paraContent, [
    { name: 'reason', documentation: 'Reason text is unclear' },
    { name: 'cert', values: ['high', 'medium', 'low'], documentation: 'Certainty' },
  ]),
  el('gap', 'Omission or gap', [], [
    { name: 'reason', documentation: 'Reason for gap (damage, illegible, sampling)' },
    { name: 'extent', documentation: 'Size of gap' },
    { name: 'unit', documentation: 'Unit (chars, words, lines, pages)' },
    { name: 'quantity', documentation: 'Number of units' },
  ]),

  // References & links
  el('ref', 'Reference or link', paraContent, [
    { name: 'target', documentation: 'Target URL or pointer' },
    { name: 'type', documentation: 'Type of reference' },
  ]),
  el('ptr', 'Pointer', [], [
    { name: 'target', documentation: 'Target URL or pointer' },
    { name: 'type', documentation: 'Type of pointer' },
  ]),
  el('note', 'Note or annotation', [...paraContent, 'p'], [
    { name: 'place', documentation: 'Where the note appears (foot, end, margin, inline)' },
    { name: 'type', documentation: 'Type of note' },
    { name: 'target', documentation: 'What the note is about' },
    { name: 'anchored', values: ['true', 'false'], documentation: 'Whether anchored' },
  ]),
  el('anchor', 'Anchor point', []),

  // Lists
  el('list', 'List', ['item', 'head', 'label', 'pb', 'lb'], [
    { name: 'type', documentation: 'Type (ordered, bulleted, gloss, simple)' },
  ]),
  el('item', 'List item', [...paraContent, 'p', 'list']),
  el('label', 'Label', paraContent),

  // Tables
  el('table', 'Table', ['row', 'head'], [
    { name: 'rows', documentation: 'Number of rows' },
    { name: 'cols', documentation: 'Number of columns' },
  ]),
  el('row', 'Table row', ['cell'], [
    { name: 'role', values: ['label', 'data'], documentation: 'Role of row' },
  ]),
  el('cell', 'Table cell', paraContent, [
    { name: 'role', values: ['label', 'data'], documentation: 'Role of cell' },
    { name: 'rows', documentation: 'Row span' },
    { name: 'cols', documentation: 'Column span' },
  ]),

  // Figures & graphics
  el('figure', 'Figure', ['graphic', 'head', 'figDesc', 'p'], [
    { name: 'type', documentation: 'Type of figure' },
  ]),
  el('graphic', 'Graphic', [], [
    { name: 'url', documentation: 'URL of the image' },
    { name: 'width', documentation: 'Width' },
    { name: 'height', documentation: 'Height' },
    { name: 'mimeType', documentation: 'MIME type' },
  ]),
  el('figDesc', 'Figure description', paraContent),

  // Milestones
  el('pb', 'Page break', [], [
    { name: 'n', documentation: 'Page number' },
    { name: 'facs', documentation: 'Facsimile reference' },
  ]),
  el('lb', 'Line break', [], [
    { name: 'n', documentation: 'Line number' },
  ]),
  el('cb', 'Column break', [], [
    { name: 'n', documentation: 'Column number' },
  ]),
  el('milestone', 'Milestone', [], [
    { name: 'unit', documentation: 'Type of section' },
    { name: 'n', documentation: 'Number' },
  ]),

  // Segments
  el('seg', 'Arbitrary segment', paraContent, [
    { name: 'type', documentation: 'Type of segment' },
    { name: 'function', documentation: 'Function' },
  ]),
  el('fw', 'Forme work (header/footer)', paraContent, [
    { name: 'type', documentation: 'Type (header, footer, pageNum, sig, catch)' },
    { name: 'place', documentation: 'Where it appears' },
  ]),

  // Critical apparatus
  el('app', 'Apparatus entry', ['lem', 'rdg', 'rdgGrp', 'note', 'witDetail']),
  el('lem', 'Lemma (base text reading)', paraContent, [
    { name: 'wit', documentation: 'Witness(es)' },
  ]),
  el('rdg', 'Reading (variant)', paraContent, [
    { name: 'wit', documentation: 'Witness(es)' },
    { name: 'type', documentation: 'Type of variant' },
  ]),
  el('witDetail', 'Witness detail', paraContent, [
    { name: 'wit', documentation: 'Witness' },
    { name: 'target', documentation: 'Target reading' },
  ]),

  // Manuscript description (simplified)
  el('msDesc', 'Manuscript description', ['msIdentifier', 'head', 'p', 'msContents', 'physDesc', 'history', 'additional']),
  el('msIdentifier', 'Manuscript identifier', ['settlement', 'institution', 'repository', 'collection', 'idno', 'altIdentifier', 'msName']),
];

/** Full TEI All has additional elements beyond Lite */
export const TEI_ALL_EXTRA_ELEMENTS: ElementSpec[] = [
  // Transcription
  el('facsimile', 'Facsimile', ['surface', 'surfaceGrp']),
  el('surface', 'Surface', ['graphic', 'zone'], [
    { name: 'ulx', documentation: 'Upper left x' },
    { name: 'uly', documentation: 'Upper left y' },
    { name: 'lrx', documentation: 'Lower right x' },
    { name: 'lry', documentation: 'Lower right y' },
  ]),
  el('zone', 'Zone on a surface', ['graphic', 'zone']),
  el('sourceDoc', 'Source document', ['surface', 'surfaceGrp']),

  // Corpus
  el('teiCorpus', 'TEI corpus', ['teiHeader', 'TEI']),
  el('particDesc', 'Participant description', ['person', 'personGrp', 'listPerson', 'p']),
  el('settingDesc', 'Setting description', ['setting', 'listPlace', 'p']),
  el('person', 'Person', ['persName', 'birth', 'death', 'age', 'sex', 'occupation', 'residence', 'note'], [
    { name: 'sex', documentation: 'Sex' },
    { name: 'age', documentation: 'Age' },
    { name: 'role', documentation: 'Role' },
  ]),
  el('listPerson', 'List of persons', ['person', 'personGrp', 'listPerson', 'head']),

  // Linking
  el('standOff', 'Stand-off markup', ['listAnnotation', 'listEvent', 'listPerson', 'listPlace', 'listOrg', 'listBibl']),
  el('listAnnotation', 'List of annotations', ['annotation']),
  el('annotation', 'Annotation', ['p', 'note'], [
    { name: 'target', documentation: 'Target of annotation' },
    { name: 'type', documentation: 'Type of annotation' },
  ]),

  // Correspondence
  el('correspDesc', 'Correspondence description', ['correspAction', 'correspContext', 'note']),
  el('correspAction', 'Correspondence action', ['persName', 'orgName', 'placeName', 'date', 'note'], [
    { name: 'type', values: ['sent', 'received', 'forwarded', 'redirected'], documentation: 'Type of action' },
  ]),

  // Named entities
  el('listPlace', 'List of places', ['place', 'listPlace', 'head']),
  el('place', 'Place', ['placeName', 'location', 'desc', 'note'], [
    { name: 'type', documentation: 'Type of place' },
  ]),
  el('listOrg', 'List of organizations', ['org', 'listOrg', 'head']),
  el('org', 'Organization', ['orgName', 'desc', 'note'], [
    { name: 'type', documentation: 'Type of organization' },
  ]),
  el('listEvent', 'List of events', ['event', 'listEvent', 'head']),
  el('event', 'Event', ['label', 'desc', 'note'], [
    { name: 'when', documentation: 'Date of event' },
    { name: 'from', documentation: 'Start date' },
    { name: 'to', documentation: 'End date' },
  ]),

  // Linguistic / analysis
  el('s', 'Sentence', paraContent, [
    { name: 'type', documentation: 'Type of sentence' },
  ]),
  el('w', 'Word', paraContent, [
    { name: 'lemma', documentation: 'Lemma form' },
    { name: 'pos', documentation: 'Part of speech' },
    { name: 'type', documentation: 'Type of word' },
  ]),
  el('c', 'Character', [], [
    { name: 'type', documentation: 'Type of character' },
  ]),
  el('pc', 'Punctuation character', [], [
    { name: 'force', values: ['strong', 'weak', 'inter'], documentation: 'Boundary strength' },
    { name: 'unit', documentation: 'Unit delimited' },
    { name: 'pre', values: ['true', 'false'], documentation: 'Precedes its unit' },
  ]),
  el('cl', 'Clause', paraContent, [
    { name: 'type', documentation: 'Type of clause' },
  ]),
  el('phr', 'Phrase', paraContent, [
    { name: 'type', documentation: 'Type of phrase' },
    { name: 'function', documentation: 'Grammatical function' },
  ]),
  el('span', 'Span of text with annotation', paraContent, [
    { name: 'from', documentation: 'Start point' },
    { name: 'to', documentation: 'End point' },
    { name: 'type', documentation: 'Type of annotation' },
  ]),
  el('interp', 'Interpretive annotation', ['p', 'desc'], [
    { name: 'type', documentation: 'Type of interpretation' },
    { name: 'inst', documentation: 'Instance pointer' },
  ]),
  el('interpGrp', 'Group of interpretations', ['interp', 'interpGrp'], [
    { name: 'type', documentation: 'Type of interpretation group' },
  ]),

  // Transcription (additional)
  el('handShift', 'Hand shift', [], [
    { name: 'new', documentation: 'New hand' },
    { name: 'medium', documentation: 'Writing medium' },
  ]),
  el('damage', 'Damaged text', paraContent, [
    { name: 'type', documentation: 'Type of damage' },
    { name: 'degree', documentation: 'Degree of damage' },
    { name: 'agent', documentation: 'Cause of damage' },
  ]),
  el('surplus', 'Surplus text', paraContent, [
    { name: 'reason', documentation: 'Reason text is surplus' },
  ]),

  // Dictionaries
  el('entry', 'Dictionary entry', ['form', 'gramGrp', 'sense', 'etym', 'note', 're']),
  el('form', 'Form of a word', ['orth', 'pron', 'hyph', 'syll', 'stress'], [
    { name: 'type', values: ['lemma', 'variant', 'compound', 'derivative', 'inflected'], documentation: 'Form type' },
  ]),
  el('orth', 'Orthographic form', paraContent),
  el('sense', 'Sense of a word', ['def', 'cit', 'note', 'sense', 'usg', 'xr']),
  el('def', 'Definition', paraContent),

  // Title page (for prose template)
  el('titlePage', 'Title page', ['docTitle', 'byline', 'docAuthor', 'docEdition', 'docImprint', 'docDate', 'epigraph', 'figure']),
  el('docTitle', 'Document title on title page', ['titlePart']),
  el('titlePart', 'Part of a title', paraContent, [
    { name: 'type', values: ['main', 'sub', 'alt', 'short', 'desc'], documentation: 'Type of title part' },
  ]),
  el('docAuthor', 'Author on title page', paraContent),
  el('docDate', 'Date on title page', paraContent, [
    { name: 'when', documentation: 'Normalized date' },
  ]),
];
