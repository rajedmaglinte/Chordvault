import { Modal, Button, FileInput, Stack, Text, Badge, Group, NativeSelect, Paper, Box, ScrollArea, UnstyledButton } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useFocusReturn } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDemo } from '../context/DemoContext';
import { notifyError } from '../lib/errors';
import { useStackedModalProps } from '../hooks/useStackedModalProps';
import { useActiveRef } from '../hooks/useActiveRef';
import { readFile } from '../lib/files';
import { importSongs, ApiError, type ImportResult } from '../lib/api';
import { fileToSong, chunkSongs } from '../lib/import';
import { IMPORT_ACCEPT, IMPORT_CONFIRM_FILE_COUNT, DEMO_MAX_IMPORT } from '../lib/constants';
import { prepareFiles, isWordOrZip, withLanguage, type PreparedSong } from '../lib/docx/prepare';
import { renderChordPro } from '../lib/chords';

interface ImportModalProps {
  opened: boolean;
  onClose: () => void;
}

interface Summary {
  imported: number;
  skipped: { filename: string }[];
  errors: { filename: string; error: string }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ImportModal({ opened, onClose }: ImportModalProps) {
  useFocusReturn({ opened });
  const [busy, setBusy] = useState(false);
  const stacked = useStackedModalProps({ locked: busy });
  useEffect(() => { if (!opened) setBusy(false); }, [opened]);
  const close = () => { if (!busy) onClose(); };
  return (
    <Modal opened={opened} onClose={close} title="Import songs" size="lg" returnFocus={false} {...stacked} closeButtonProps={{ disabled: busy }}>
      {opened && <ImportContent busy={busy} setBusy={setBusy} onClose={close} />}
    </Modal>
  );
}

function ImportContent({ busy, setBusy, onClose }: Omit<ImportModalProps, 'opened'> & { busy: boolean; setBusy: (busy: boolean) => void }) {
  const active = useActiveRef();
  const { user } = useAuth();
  const { demoMode } = useDemo();
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  // Word documents (and zips of them) are converted in the browser and previewed before import.
  const [prepared, setPrepared] = useState<PreparedSong[] | null>(null);

  const handleFiles = (selected: File[]) => {
    let picked = selected;
    if (demoMode && picked.length > DEMO_MAX_IMPORT) picked = picked.slice(0, DEMO_MAX_IMPORT);
    setFiles(picked);
    setSummary(null);
    setPrepared(null);
  };

  async function postBatchWithRetry(songs: { content: string }[]): Promise<ImportResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await importSongs(songs, user?.token as string);
      } catch (e) {
        if (e instanceof ApiError && e.status === 429 && attempt < 3) {
          await sleep(1500);
          if (!active.current) throw e;
          continue;
        }
        throw e;
      }
    }
  }

  /** Uploads songs in batches; `names[i]` labels song i in the summary. */
  async function upload(songs: { content: string }[], names: string[]) {
    const batches = chunkSongs(songs);
    const agg: Summary = { imported: 0, skipped: [], errors: [] };
    let offset = 0;
    setTotal(songs.length);
    setProgress(0);
    for (const batch of batches) {
      const res = await postBatchWithRetry(batch);
      if (!active.current) return;
      agg.imported += res.imported;
      for (const s of res.skipped) agg.skipped.push({ filename: names[offset + s.index] });
      for (const er of res.errors) agg.errors.push({ filename: names[offset + er.index], error: er.error });
      offset += batch.length;
      setProgress(offset);
    }
    setSummary(agg);
  }

  const convertForPreview = async () => {
    setBusy(true);
    try {
      let songs = await prepareFiles(files);
      if (demoMode && songs.length > DEMO_MAX_IMPORT) songs = songs.slice(0, DEMO_MAX_IMPORT);
      if (active.current) setPrepared(songs);
    } catch (e) {
      if (active.current) notifyError(e);
    } finally {
      if (active.current) setBusy(false);
    }
  };

  const importPrepared = async () => {
    if (busy || !prepared) return;
    const ready = prepared.filter(s => !s.error && s.content);
    if (!ready.length) return;
    setBusy(true);
    try {
      await upload(ready.map(s => ({ content: withLanguage(s.content, s.language) })), ready.map(s => s.source));
    } catch (e) {
      if (active.current) notifyError(e);
    } finally {
      if (active.current) setBusy(false);
    }
  };

  const start = async (confirmed = false) => {
    if (busy || files.length === 0) return;
    if (files.some(f => isWordOrZip(f.name))) { await convertForPreview(); return; }
    if (!confirmed && !demoMode && files.length > IMPORT_CONFIRM_FILE_COUNT) {
      modals.openConfirmModal({ children: `You selected ${files.length} files. Import all of them?`, labels: { confirm: 'Import', cancel: 'Cancel' }, onConfirm: () => { void start(true); } });
      return;
    }

    setBusy(true);
    try {
      const texts = await Promise.all(files.map(file => readFile(file, 'text')));
      if (!active.current) return;
      const songs = texts.map((t, i) => fileToSong(files[i].name, t));
      await upload(songs, files.map(f => f.name));
    } catch (e) {
      if (active.current) notifyError(e);
    } finally {
      if (active.current) setBusy(false);
    }
  };

  return (
    <Stack gap={12}>
      {!summary && prepared && (
        <ImportPreview songs={prepared} busy={busy} progress={progress} total={total}
          onChange={setPrepared} onBack={() => setPrepared(null)} onImport={importPrepared} />
      )}
      {!summary && !prepared && (
        <>
          <FileInput
            label="Select ChordPro, text or Word files"
            description="Word documents (.docx) and zip downloads from Google Drive are converted here: only the lyrics and chords are uploaded."
            multiple
            value={files}
            onChange={handleFiles}
            accept={IMPORT_ACCEPT}
            disabled={busy}
            clearable
            clearButtonProps={{ 'aria-label': 'Clear selected files', disabled: busy }}
            fileInputProps={{ 'aria-label': 'ChordPro file upload' }}
          />
          {demoMode && <Text c="dimmed" fz={13}>Demo mode: only the first {DEMO_MAX_IMPORT} songs will be imported.</Text>}
          {files.length > 0 && <Text c="dimmed" fz={13}>{files.length} file(s) selected</Text>}
          {busy && <Text c="dimmed" fz={13} role="status">Importing {progress} / {total}…</Text>}
          <Button data-testid="import-start" onClick={() => start()} loading={busy} disabled={busy || files.length === 0}>
            {busy ? 'Importing…' : files.some(f => isWordOrZip(f.name)) ? 'Convert and preview' : 'Import'}
          </Button>
        </>
      )}
      {summary && (
        <Stack gap={12} data-testid="import-summary">
          <Text>
            <strong>{summary.imported}</strong> imported ·{' '}
            <strong>{summary.skipped.length}</strong> already in your library ·{' '}
            <strong>{summary.errors.length}</strong> errors
          </Text>
          {summary.errors.length > 0 && (
            <details>
              <summary>Skipped with errors ({summary.errors.length})</summary>
              <ul>{summary.errors.map((er, i) => <li key={i}>{er.filename}: {er.error}</li>)}</ul>
            </details>
          )}
          <Button onClick={onClose}>Done</Button>
        </Stack>
      )}
    </Stack>
  );
}

const LANGUAGES = [{ value: 'en', label: 'English' }, { value: 'tl', label: 'Tagalog' }, { value: '', label: 'Not set' }];

/** The converted songs, checked by a person before they are saved. */
function ImportPreview({ songs, busy, progress, total, onChange, onBack, onImport }: {
  songs: PreparedSong[]; busy: boolean; progress: number; total: number;
  onChange: (songs: PreparedSong[]) => void; onBack: () => void; onImport: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const ready = songs.filter(s => !s.error && s.content).length;
  const failed = songs.length - ready;
  const setLanguage = (i: number, language: string) => onChange(songs.map((s, j) => (j === i ? { ...s, language } : s)));
  const setAll = (language: string) => onChange(songs.map(s => ({ ...s, language })));
  return (
    <Stack gap={12} data-testid="import-preview">
      <Text fz={14}>
        <strong>{ready}</strong> song{ready === 1 ? '' : 's'} ready{failed ? <>, <strong>{failed}</strong> could not be read</> : null}.
        {' '}Tap a song to check its chords before importing.
      </Text>
      <Group gap={8}>
        <Text fz={13} c="dimmed">Set all languages:</Text>
        {LANGUAGES.slice(0, 2).map(l => <Button key={l.value} size="compact-xs" variant="default" disabled={busy} onClick={() => setAll(l.value)}>{l.label}</Button>)}
      </Group>
      <ScrollArea.Autosize mah="55vh" type="auto" offsetScrollbars>
        <Stack gap={6}>
          {songs.map((s, i) => (
            <Paper key={`${s.source}-${i}`} withBorder radius="var(--radius)" p={10}>
              <Group gap={8} wrap="nowrap" align="flex-start">
                <UnstyledButton flex={1} miw={0} disabled={!!s.error} onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
                  aria-label={`${s.title}: ${open === i ? 'hide' : 'show'} preview`}>
                  <Text fw={600} fz={15} truncate>{s.title}</Text>
                  <Text fz={12} c="dimmed" truncate>{s.source}</Text>
                </UnstyledButton>
                {s.error
                  ? <Badge color="red" variant="light">{s.error}</Badge>
                  : (
                    <Group gap={6} wrap="nowrap">
                      {s.warnings.map(w => <Badge key={w} color="yellow" variant="light" title={w}>check</Badge>)}
                      <NativeSelect size="xs" aria-label={`Language of ${s.title}`} value={s.language} disabled={busy}
                        data={LANGUAGES} onChange={e => setLanguage(i, e.currentTarget.value)} />
                    </Group>
                  )}
              </Group>
              {!s.error && s.warnings.length > 0 && <Text fz={12} c="yellow.8" mt={4}>{s.warnings.join(' · ')}</Text>}
              {open === i && !s.error && (
                <Box mt={8} p={10} bg="var(--raise)" style={{ borderRadius: 8, overflowX: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: renderChordPro(s.content, 0, false) }} />
              )}
            </Paper>
          ))}
        </Stack>
      </ScrollArea.Autosize>
      {busy && <Text c="dimmed" fz={13} role="status">Importing {progress} / {total}…</Text>}
      <Group justify="space-between">
        <Button variant="default" onClick={onBack} disabled={busy}>Back</Button>
        <Button data-testid="import-confirm" onClick={onImport} loading={busy} disabled={busy || ready === 0}>
          Import {ready} song{ready === 1 ? '' : 's'}
        </Button>
      </Group>
    </Stack>
  );
}
