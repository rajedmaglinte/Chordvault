import { Alert, Button, Box, Text } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useOffline } from '../context/OfflineContext';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useSwipe } from '../hooks/useSwipe';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useLocalStorage } from '@mantine/hooks';
import { useWakeLock } from '../hooks/useWakeLock';
import { useSetlistPlayer } from '../hooks/useSetlistPlayer';
import { useFontScale } from '../hooks/useFontScale';
import { useTwoCol } from '../hooks/useTwoCol';
import { ChordSheet } from '../components/ChordSheet';
import type { ToolbarProps } from '../components/Toolbar';
import { usePlaybackLayout } from '../hooks/usePlaybackLayout';
import { PlaybackTopBar } from '../components/PlaybackTopBar';
import { PlaybackDock, type PlaybackNav } from '../components/PlaybackDock';
import { PlaybackMoreMenu } from '../components/PlaybackMoreMenu';
import { SectionBar } from '../components/SectionBar';
import { useSongSections } from '../hooks/useSongSections';
import { useLiveSession } from '../hooks/useLiveSession';
import { LiveBar } from '../components/LiveBar';
import { SettingsPanel } from '../components/SettingsPanel';
import { EmptyState } from '../components/EmptyState';
import { SetlistEntryEditor } from '../components/SetlistEntryEditor';
import { Loading } from '../components/Loading';
import { clampFontSize, autoFit } from '../lib/chords';
import { useRenderedChords } from '../hooks/useRenderedChords';
import { useSetlistPreferences } from '../hooks/useSetlistPreferences';
import { stepKey } from '../lib/keys';
import { entryContent, entryStartKey } from '../lib/setlistKeys';
import { songEditFromSetlist } from '../lib/songEditRoute';
import { usePdfExport } from '../hooks/usePdfExport';
import type { Navigate } from '../lib/routes';

interface SetlistPlayViewProps {
  setlistId: number | string;
  isLocal?: boolean;
  initialIndex?: number;
  navigate: Navigate;
}

export function SetlistPlayView({ setlistId, isLocal: _isLocal, initialIndex, navigate }: SetlistPlayViewProps) {
  const { t } = useI18n();

  const { readOnly, online } = useOffline();
  const [editing, setEditing] = useState(false);

  // Global setlist settings
  const [slNashville, setSlNashville] = useState(false);
  const [slHideYt, setSlHideYt] = useState(false);
  const fontScale = useFontScale();
  const twoColState = useTwoCol();
  const layout = usePlaybackLayout();

  const { loadError, setlist, entry, index, total, goTo, prev, next, exit, updateEntry, isModified, saveOnline, saveLocal } = useSetlistPlayer({
    setlistId,
    isLocal: _isLocal,
    initialIndex,
    navigate,
    onNavigate: () => {
      setEditing(false);
    },
  });

  const content = entry ? entryContent(entry) : '';

  const { user, isAdmin } = useAuth();
  const isOwner = setlist?.user_id && user && setlist.user_id === user.id;

  // Live session: the leader's taps move everyone's screen. Public, server-backed setlists only.
  const liveEnabled = !!setlist && !setlist.isLocal && setlist.visibility !== 'private' && online;
  const live = useLiveSession({ setlistId, enabled: liveEnabled, token: user?.token });
  const canLead = !!user && liveEnabled && (!!isOwner || isAdmin);
  const syncing = !!live.remote?.active && live.following && !live.leading;
  const [keepScreenOn, setKeepScreenOn] = useLocalStorage({ key: 'cv_keep_screen_on', defaultValue: true, getInitialValueInEffect: false });
  const wakeLock = useWakeLock(keepScreenOn && !!setlist);

  // Effective values for current entry
  const globalPrefs = useMemo(() => ({
    nashville: slNashville,
    twoCol: twoColState.twoCol,
    fontSize: fontScale.fontSize,
    hideYt: slHideYt,
  }), [slNashville, twoColState.twoCol, fontScale.fontSize, slHideYt]);

  const effectivePrefs = useSetlistPreferences(entry, globalPrefs);
  const effNum = effectivePrefs.nashville;
  const effTwoCol = effectivePrefs.twoCol;
  const effFont = effectivePrefs.fontSize;
  const hideYt = effectivePrefs.hideYt;
  const { renderedHtml, currentKey: keyDisplay, hasKey } = useRenderedChords(content, entry?.target_key, !!effNum);
  const songSections = useSongSections(editing || entry?.is_private_placeholder ? '' : renderedHtml);
  const showSections = (layout !== 'desktop' || live.leading) && !editing && songSections.sections.length > 1;

  // Follower: go where the leader is. The section jump waits until the new song's sections are on screen.
  const [target, setTarget] = useState<{ index: number; section: number } | null>(null);
  const remoteSeq = live.remote?.seq;
  useEffect(() => {
    const r = live.remote;
    if (!r?.active || !live.following || live.leading) return;
    setTarget({ index: r.index, section: r.section });
    if (r.index !== index) goTo(r.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each new leader move, not to every render
  }, [remoteSeq, live.following, live.leading]);
  useEffect(() => {
    if (!target || target.index !== index || songSections.forHtml !== renderedHtml) return;
    const { section } = target;
    const { jumpTo, sections } = songSections;
    // Not cancelled on re-render: clearing the target re-renders straight away.
    window.setTimeout(() => {
      if (section >= 0 && section < sections.length) jumpTo(section);
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 80);
    setTarget(null);
  }, [target, index, songSections, renderedHtml]);

  // Leader: changing song tells everyone (top of the song).
  const { leading, publish } = live;
  useEffect(() => { if (leading) publish(index, -1); }, [index, leading, publish]);

  // A follower who moves on their own stops following until they tap Re-sync.
  const pauseIfSyncing = useCallback(() => { if (syncing) live.setFollowing(false); }, [syncing, live]);
  const jumpToSection = useCallback((i: number) => {
    songSections.jumpTo(i);
    if (live.leading) live.publish(index, i);
    else pauseIfSyncing();
  }, [songSections, live, index, pauseIfSyncing]);
  const userPrev = useCallback(() => { pauseIfSyncing(); prev(); }, [pauseIfSyncing, prev]);
  const userNext = useCallback(() => { pauseIfSyncing(); next(); }, [pauseIfSyncing, next]);
  const stepSection = useCallback((dir: 1 | -1) => {
    const n = songSections.sections.length;
    if (!n) return;
    jumpToSection(Math.min(n - 1, Math.max(0, songSections.active + dir)));
  }, [songSections, jumpToSection]);

  // Key stepping
  const stepEntryKey = useCallback((direction: 1 | -1) => {
    if (!entry) return;
    const current = entryStartKey(entry);
    if (!current) return;
    updateEntry({ target_key: stepKey(current, direction) });
  }, [entry, updateEntry]);

  // Per-song overrides
  const toggleEntryNum = useCallback((checked: boolean) => {
    if (!entry) return;
    const globalVal = slNashville;
    updateEntry({
      _num: (checked === !!globalVal) ? null : (checked ? 1 : 0),
    });
  }, [entry, slNashville, updateEntry]);

  const toggleEntryTwoCol = useCallback(() => {
    if (!entry) return;
    const nextVal = !effTwoCol;
    updateEntry({ _twoCol: nextVal === (!!twoColState.twoCol) ? null : nextVal });
  }, [entry, effTwoCol, twoColState.twoCol, updateEntry]);

  const changeEntryFont = useCallback((delta: number) => {
    if (!entry) return;
    const nextVal = clampFontSize(effFont + delta);
    updateEntry({ _font: nextVal === fontScale.fontSize ? null : nextVal });
  }, [entry, effFont, fontScale.fontSize, updateEntry]);

  // Key picker
  const pickKey = useCallback((targetKey: string) => {
    if (!entry) return;
    updateEntry({ target_key: targetKey });
  }, [entry, updateEntry]);

  // Inline editor
  const openEditor = useCallback(() => {
    if (readOnly || !entry || setlist?.isLocal) return;
    setEditing(true);
  }, [entry, setlist, readOnly]);

  // Swipe
  const swipeRef = useSwipe({ onNext: userNext, onPrev: userPrev, enabled: !editing && !!setlist });

  // Keyboard shortcuts
  const shortcuts = useMemo(() => ({
    'ArrowLeft': (e: KeyboardEvent) => { e.preventDefault(); userPrev(); },
    'ArrowRight': (e: KeyboardEvent) => { e.preventDefault(); userNext(); },
    // Page turner pedals usually send PageDown / PageUp: step through sections.
    'PageDown': (e: KeyboardEvent) => { e.preventDefault(); stepSection(1); },
    'PageUp': (e: KeyboardEvent) => { e.preventDefault(); stepSection(-1); },
    'ArrowUp': (e: KeyboardEvent) => { e.preventDefault(); stepEntryKey(1); },
    'ArrowDown': (e: KeyboardEvent) => { e.preventDefault(); stepEntryKey(-1); },
    'n': () => { if (entry) toggleEntryNum(!effNum); },
    'N': () => { if (entry) toggleEntryNum(!effNum); },
    'e': (e: KeyboardEvent) => { e.preventDefault(); openEditor(); },
    'E': (e: KeyboardEvent) => { e.preventDefault(); openEditor(); },
    'Escape': () => { if (editing) setEditing(false); else exit(); },
  }), [userPrev, userNext, stepSection, stepEntryKey, entry, effNum, toggleEntryNum, openEditor, editing, exit]);

  useKeyboardShortcuts(shortcuts, !!setlist);

  const resetFont = () => {
    fontScale.resetFontSize();
    if (entry) updateEntry({ _font: null });
  };

  const exportPdf = usePdfExport();
  const handleExportAllPdf = () => {
    if (!setlist) return;
    void exportPdf('Setlist PDF exported', async () => (await import('../lib/pdf-export')).exportSetlistPdf(setlist, {
      nashville: slNashville, fontSize: fontScale.fontSize,
    }));
  };

  const doFit = () => {
    const result = autoFit();
    updateEntry({
      _font: result.fontSize === fontScale.fontSize ? null : result.fontSize,
      _twoCol: result.twoCol === !!twoColState.twoCol ? null : result.twoCol
    });
    window.scrollTo(0, 0);
  };

  if (loadError) return <Alert title="Setlist unavailable" color="red">{loadError}<Button mt="sm" display="block" onClick={() => navigate('setlists')}>Back to setlists</Button></Alert>;
  if (!setlist) return <Loading />;
  if (!entry) return <EmptyState text={t('setlist.noSongsYet')} />;

  const resetEntryLayout = () => { if (entry) updateEntry({ _font: null, _twoCol: null }); };
  const canReset = entry._font != null || entry._twoCol != null;
  const toolbar: ToolbarProps = {
    currentKey: keyDisplay,
    nashville: !!effNum,
    nashvilleDisabled: !hasKey,
    onNashvilleChange: toggleEntryNum,
    twoCol: !!effTwoCol,
    onTwoColToggle: toggleEntryTwoCol,
    fontSize: effFont || 0,
    onFontChange: changeEntryFont,
    onReset: resetEntryLayout,
    onPickKey: pickKey,
    onAutoFit: doFit,
    onSaveOnline: !readOnly && isOwner ? saveOnline : undefined,
    onSaveLocal: readOnly ? undefined : saveLocal,
    onExportPdf: handleExportAllPdf,
    settingsPanel: (
      <SettingsPanel
        nashville={slNashville}
        onNashvilleChange={setSlNashville}
        hideYt={slHideYt}
        onHideYtChange={setSlHideYt}
        twoCol={twoColState.twoCol}
        onTwoColChange={twoColState.setTwoColTo}
        fontSize={fontScale.fontSize}
        onFontChange={fontScale.changeFontSize}
        onFontReset={resetFont}
        keepScreenOn={wakeLock.supported ? keepScreenOn : undefined}
        onKeepScreenOnChange={wakeLock.supported ? setKeepScreenOn : undefined}
      />
    ),
    isModified,
    renderKey: index,
    overrides: { num: entry._num != null, twoCol: entry._twoCol != null, font: entry._font != null },
    canReset,
  };
  const editSong = user && !readOnly && !entry.is_private_placeholder
    ? () => navigate('song-edit', songEditFromSetlist(entry.song_id, 'setlist-play', setlistId, index))
    : undefined;
  const nav: PlaybackNav = { onPrev: userPrev, onNext: userNext, hasPrev: index > 0, hasNext: index < total - 1 };
  // Say why live sync is not offered, instead of silently showing nothing.
  const liveNotice = (() => {
    if (live.leading || live.remote?.active || (canLead && live.status === 'connected')) return null;
    if (setlist.isLocal) return 'Saved on this device only: live sync needs a setlist saved online as Public.';
    if (setlist.visibility === 'private') return isOwner || isAdmin ? 'This setlist is Private: make it Public to use live sync.' : null;
    if (!online) return 'Offline: live sync needs the network.';
    if (live.status === 'unavailable') return "Live sync isn't available on this server (it may need updating).";
    if (live.status === 'connecting') return 'Connecting to live sync\u2026';
    if (live.status === 'connected') return user ? 'Live: waiting for the leader. Your screen will follow when they start.' : 'Live: waiting for the leader. Sign in as the setlist owner or an admin to lead.';
    return null;
  })();
  const liveBar = (
    <LiveBar remote={live.remote} status={live.status} leading={live.leading} following={live.following} canLead={canLead} error={live.error} notice={liveNotice}
      onStartLeading={() => void live.startLeading(index, songSections.sections.length ? songSections.active : -1)}
      onStopLeading={() => void live.stopLeading()}
      onPause={() => live.setFollowing(false)} onResync={() => live.setFollowing(true)} />
  );
  const sectionBar = showSections
    ? <SectionBar sections={songSections.sections} active={songSections.active} onJump={jumpToSection} />
    : null;
  const hasLive = live.leading || !!live.remote?.active || (canLead && live.status === 'connected') || !!liveNotice;
  const more = (
    <PlaybackMoreMenu nashville={!!effNum} nashvilleDisabled={toolbar.nashvilleDisabled} onNashvilleChange={toggleEntryNum}
      onExportPdf={handleExportAllPdf} onReset={resetEntryLayout} canReset={canReset}
      bpm={entry.bpm} youtubeUrl={hideYt ? null : entry.youtube_url} onEdit={editSong} />
  );

  return (
    <div ref={swipeRef} className={`setlist-play-container${layout === 'desktop' ? '' : ' has-dock'}${showSections ? ' has-sections' : ''}${hasLive ? ' has-live' : ''}`}>
      <PlaybackTopBar layout={layout} title={entry.title} position={`${index + 1} of ${total}, ${setlist.name}`}
        nav={nav} onExit={exit} toolbar={toolbar} more={more}
        bpm={entry.bpm} youtubeUrl={hideYt ? null : entry.youtube_url} onEdit={editSong} />
      {layout === 'desktop' && hasLive && <div className="live-desktop" data-no-swipe>{liveBar}{sectionBar}</div>}


      {editing ? (
        <SetlistEntryEditor setlistId={setlist.id} entry={entry}
          onSaved={(saved) => { updateEntry({ content_override: saved }); setEditing(false); }}
          onCancel={() => setEditing(false)} />
      ) : (
        <>
          {entry?.is_private_placeholder ? (
            <Box mt={40}>
              <EmptyState icon={<IconLock size={56} aria-hidden />} text={entry.is_deactivated ? <>This song was deactivated<Text span display="block" size="sm" mt="xs">An admin can reactivate it from the Admin page.</Text></> : entry.not_downloaded ? "This song is not downloaded. Connect and refresh your library." : <>This song is private<Text span display="block" size="sm" mt="xs">The song owner has marked it as private.</Text></>} />
            </Box>
          ) : (
            <ChordSheet
              html={renderedHtml}
              twoCol={!!effTwoCol}
              fontSize={effFont || 0}
            />
          )}
        </>
      )}
      {layout !== 'desktop' && <PlaybackDock layout={layout} nav={nav} toolbar={toolbar}
        top={<>{liveBar}{sectionBar}</>} />}
    </div>
  );
}
