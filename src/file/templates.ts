import type { TemplateInfo } from '../types/file';

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Bare-bones TEI document with just the required elements',
    path: 'minimal',
  },
  {
    id: 'letter',
    name: 'Letter',
    description: 'Correspondence template with opener, body, and closer',
    path: 'letter',
  },
  {
    id: 'drama',
    name: 'Drama',
    description: 'Play or dramatic text with cast list, acts, and scenes',
    path: 'drama',
  },
  {
    id: 'prose',
    name: 'Prose',
    description: 'Prose text with chapters and paragraphs',
    path: 'prose',
  },
];

const TEMPLATE_CONTENT: Record<string, string> = {
  minimal: `<?xml version="1.0" encoding="UTF-8"?>
<?xml-model href="http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_lite.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Title</title>
      </titleStmt>
      <publicationStmt>
        <p>Unpublished</p>
      </publicationStmt>
      <sourceDesc>
        <p>Born digital</p>
      </sourceDesc>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <div>
        <p></p>
      </div>
    </body>
  </text>
</TEI>`,

  letter: `<?xml version="1.0" encoding="UTF-8"?>
<?xml-model href="http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_lite.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Letter from [Sender] to [Recipient]</title>
        <author>[Sender Name]</author>
      </titleStmt>
      <publicationStmt>
        <p>Unpublished</p>
      </publicationStmt>
      <sourceDesc>
        <p>Transcription from manuscript</p>
      </sourceDesc>
    </fileDesc>
    <profileDesc>
      <correspDesc>
        <correspAction type="sent">
          <persName>[Sender]</persName>
          <placeName>[Place]</placeName>
          <date when="YYYY-MM-DD">[Date]</date>
        </correspAction>
        <correspAction type="received">
          <persName>[Recipient]</persName>
        </correspAction>
      </correspDesc>
    </profileDesc>
  </teiHeader>
  <text>
    <body>
      <div type="letter">
        <opener>
          <dateline><placeName>[Place]</placeName>, <date when="YYYY-MM-DD">[Date]</date></dateline>
          <salute>Dear [Name],</salute>
        </opener>
        <p>[Letter body...]</p>
        <closer>
          <salute>Your faithful servant,</salute>
          <signed>[Signature]</signed>
        </closer>
      </div>
    </body>
  </text>
</TEI>`,

  drama: `<?xml version="1.0" encoding="UTF-8"?>
<?xml-model href="http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_lite.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>[Play Title]</title>
        <author>[Playwright]</author>
      </titleStmt>
      <publicationStmt>
        <p>Unpublished</p>
      </publicationStmt>
      <sourceDesc>
        <p>Transcription from printed edition</p>
      </sourceDesc>
    </fileDesc>
  </teiHeader>
  <text>
    <front>
      <castList>
        <head>Dramatis Personae</head>
        <castItem>
          <role xml:id="character1">[Character 1]</role>
          <roleDesc>[Description]</roleDesc>
        </castItem>
        <castItem>
          <role xml:id="character2">[Character 2]</role>
          <roleDesc>[Description]</roleDesc>
        </castItem>
      </castList>
    </front>
    <body>
      <div type="act" n="1">
        <head>Act I</head>
        <div type="scene" n="1">
          <head>Scene 1</head>
          <stage type="setting">[Setting description]</stage>
          <sp who="#character1">
            <speaker>[Character 1]</speaker>
            <p>[Dialogue...]</p>
          </sp>
          <sp who="#character2">
            <speaker>[Character 2]</speaker>
            <p>[Dialogue...]</p>
          </sp>
        </div>
      </div>
    </body>
  </text>
</TEI>`,

  prose: `<?xml version="1.0" encoding="UTF-8"?>
<?xml-model href="http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_lite.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>[Work Title]</title>
        <author>[Author Name]</author>
      </titleStmt>
      <publicationStmt>
        <publisher>[Publisher]</publisher>
        <date when="YYYY">[Year]</date>
      </publicationStmt>
      <sourceDesc>
        <bibl>[Source description]</bibl>
      </sourceDesc>
    </fileDesc>
  </teiHeader>
  <text>
    <front>
      <titlePage>
        <docTitle>
          <titlePart type="main">[Main Title]</titlePart>
        </docTitle>
        <byline>By <docAuthor>[Author]</docAuthor></byline>
      </titlePage>
    </front>
    <body>
      <div type="chapter" n="1">
        <head>Chapter 1</head>
        <p>[First paragraph...]</p>
        <p>[Second paragraph...]</p>
      </div>
      <div type="chapter" n="2">
        <head>Chapter 2</head>
        <p>[Content...]</p>
      </div>
    </body>
    <back>
      <div type="notes">
        <head>Notes</head>
        <note n="1"><p>[Note content]</p></note>
      </div>
    </back>
  </text>
</TEI>`,
};

export function getTemplateContent(id: string): string {
  return TEMPLATE_CONTENT[id] ?? TEMPLATE_CONTENT['minimal'];
}
