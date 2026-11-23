import { describe, it, expect } from 'vitest';
import { docxToLines, docxFilesInZip, documentXmlToLines } from '../readDocx';
import { makeDocx, makeZip } from './makeDocx';

describe('reading Word documents in the browser', () => {
  it('reads paragraphs as lines, keeping the spaces that line chords up', async () => {
    const lines = await docxToLines(makeDocx(['TITLE', '      G      C', 'Words here']));
    expect(lines).toEqual(['TITLE', '      G      C', 'Words here']);
  });

  it('reads stored (uncompressed) entries too', async () => {
    expect(await docxToLines(makeDocx(['A', 'B'], false))).toEqual(['A', 'B']);
  });

  it('turns line breaks inside a paragraph into separate lines and keeps tabs', () => {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const xml = `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>G</w:t><w:tab/><w:t>C</w:t><w:br/><w:t>Words</w:t></w:r></w:p></w:body></w:document>`;
    expect(documentXmlToLines(xml)).toEqual(['G\tC', 'Words']);
  });

  it('finds every .docx in a Google Drive zip, skipping lock files and macOS extras', async () => {
    const zip = makeZip({
      'Songs/A.docx': makeDocx(['A']), 'Songs/sub/B.docx': makeDocx(['B']),
      'Songs/~$A.docx': 'lock', '__MACOSX/Songs/._A.docx': 'junk', 'Songs/notes.txt': 'x',
    });
    expect((await docxFilesInZip(zip)).map(f => f.name)).toEqual(['A.docx', 'B.docx']);
  });

  it('rejects files that are not Word documents', async () => {
    await expect(docxToLines(new TextEncoder().encode('hello'))).rejects.toThrow('Not a zip or .docx file');
    await expect(docxToLines(makeZip({ 'other.xml': '<x/>' }))).rejects.toThrow('Not a Word document');
  });
});
