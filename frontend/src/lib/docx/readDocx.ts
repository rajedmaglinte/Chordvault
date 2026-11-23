/*
 * Reads the text of .docx files (and .zip downloads of them, as Google Drive produces)
 * entirely in the browser: the Word file is never uploaded, only the converted text.
 */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export interface ZipEntry { name: string; data: () => Promise<Uint8Array> }

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes as BodyInit).body!.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Lists the files in a zip archive (stored or deflated entries). */
export function readZip(buf: Uint8Array): ZipEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (view.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip or .docx file');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  const utf8 = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== SIG_CENTRAL) throw new Error('Damaged zip file');
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = utf8.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    entries.push({
      name,
      data: async () => {
        if (view.getUint32(local, true) !== SIG_LOCAL) throw new Error('Damaged zip file');
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const raw = buf.subarray(start, start + compressed);
        if (method === 0) return raw;
        if (method === 8) return inflateRaw(raw);
        throw new Error(`Unsupported compression in ${name}`);
      },
    });
  }
  return entries;
}

/** The document's paragraphs as lines; line breaks inside a paragraph become new lines, tabs stay tabs. */
export function documentXmlToLines(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  if (!body) throw new Error('No document body found');
  const lines: string[] = [];
  const paragraphs = body.getElementsByTagNameNS(W_NS, 'p');
  for (let i = 0; i < paragraphs.length; i++) {
    let line = '';
    const walk = (node: Element) => {
      for (const child of Array.from(node.children)) {
        if (child.namespaceURI !== W_NS) { walk(child); continue; }
        switch (child.localName) {
          case 't': line += child.textContent ?? ''; break;
          case 'tab': line += '\t'; break;
          case 'br': case 'cr': lines.push(line); line = ''; break;
          case 'p': break; // nested paragraphs (text boxes) are visited by the outer loop
          default: walk(child);
        }
      }
    };
    walk(paragraphs[i]);
    lines.push(line);
  }
  return lines;
}

export async function docxToLines(bytes: Uint8Array): Promise<string[]> {
  const entry = readZip(bytes).find(e => e.name === 'word/document.xml');
  if (!entry) throw new Error('Not a Word document (.docx)');
  return documentXmlToLines(new TextDecoder().decode(await entry.data()));
}

/** Every .docx inside a .zip (folders included), skipping Office lock files and macOS extras. */
export async function docxFilesInZip(bytes: Uint8Array): Promise<{ name: string; bytes: Uint8Array }[]> {
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const e of readZip(bytes)) {
    const base = e.name.split('/').pop() || '';
    if (!/\.docx$/i.test(base) || base.startsWith('~$') || e.name.startsWith('__MACOSX/')) continue;
    out.push({ name: base, bytes: await e.data() });
  }
  return out;
}
