import { docxFilesInZip, docxToLines } from './readDocx';
import { linesToChordPro } from './toChordPro';
import { fileToSong } from '../import';
import { readFile, readFileBytes } from '../files';

/** One song ready to import, shown in the preview before anything is uploaded. */
export interface PreparedSong {
  /** File the song came from (inside a zip: the .docx name). */
  source: string;
  title: string;
  content: string;
  language: string;
  warnings: string[];
  /** Set when the file could not be read; such entries are listed but not imported. */
  error?: string;
}

export const isWordOrZip = (name: string) => /\.(docx|zip)$/i.test(name);

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '');

/** Applies a language choice to converted ChordPro. */
export function withLanguage(content: string, language: string): string {
  const line = language ? `{x_language: ${language}}` : '';
  if (/^\{x_language:[^}]*\}$/m.test(content)) return content.replace(/^\{x_language:[^}]*\}\n?/m, line ? `${line}\n` : '');
  return line ? content.replace(/^(\{title:[^}]*\}\n)/m, `$1${line}\n`) : content;
}

async function fromDocx(name: string, bytes: Uint8Array): Promise<PreparedSong> {
  try {
    const song = linesToChordPro(await docxToLines(bytes), stripExt(name));
    return { source: name, title: song.title, content: song.content, language: song.language, warnings: song.warnings };
  } catch (e) {
    return { source: name, title: stripExt(name), content: '', language: '', warnings: [], error: e instanceof Error ? e.message : 'Could not read this file' };
  }
}

/** Reads the selected files: Word documents and zips of them are converted, text/ChordPro files pass through. */
export async function prepareFiles(files: File[]): Promise<PreparedSong[]> {
  const out: PreparedSong[] = [];
  for (const file of files) {
    if (/\.docx$/i.test(file.name)) {
      out.push(await fromDocx(file.name, await readFileBytes(file)));
    } else if (/\.zip$/i.test(file.name)) {
      try {
        const inner = await docxFilesInZip(await readFileBytes(file));
        if (!inner.length) out.push({ source: file.name, title: stripExt(file.name), content: '', language: '', warnings: [], error: 'No Word (.docx) files in this zip' });
        for (const d of inner) out.push(await fromDocx(d.name, d.bytes));
      } catch (e) {
        out.push({ source: file.name, title: stripExt(file.name), content: '', language: '', warnings: [], error: e instanceof Error ? e.message : 'Could not read this zip' });
      }
    } else {
      const { content } = fileToSong(file.name, await readFile(file, 'text'));
      const title = content.match(/\{title:\s*([^}]*)\}/i)?.[1]?.trim() || stripExt(file.name);
      const language = content.match(/\{x_language:\s*([^}]*)\}/i)?.[1]?.trim() || '';
      out.push({ source: file.name, title, content, language, warnings: [] });
    }
  }
  return out;
}
