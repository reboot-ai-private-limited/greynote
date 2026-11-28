import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, NetworkError } from '@/lib/api';
import { formatSize, pickProofFiles, takeProofPhoto, type PickedProof } from '@/lib/proof-picker';
import { addSecondaryFile, removeSecondaryFile, type SecondaryAttachment } from '@/lib/sales';

import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';
import { InfoCard } from './ui-cards';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/** One file: a thumbnail for a picture, a "PDF" tile for a document. Tapping opens it. */
function Thumb({ file }: { file: SecondaryAttachment }) {
  const theme = useTheme();
  const [broken, setBroken] = useState(false);
  const isImage = file.mimeType.startsWith('image/') && !broken;
  return (
    <Pressable accessibilityLabel={`Open ${file.fileName}`} onPress={() => void Linking.openURL(file.url)}>
      {isImage ? (
        <Image source={{ uri: file.url }} style={styles.thumb} onError={() => setBroken(true)} />
      ) : (
        <View style={[styles.thumb, styles.doc, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">{file.mimeType === 'application/pdf' ? 'PDF' : 'FILE'}</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Proof for the month's secondary (docs/mobile/secondary-and-targets.md section 1b): photos or PDFs, any number, optional — sending
 * the month for approval never needs one. PDF, JPG or PNG up to 5 MB each; the phone checks first, the server checks the file's own
 * bytes. Several files are chosen at once and sent one after another, and a file that fails is named without stopping the rest.
 * `canEdit` is false while the month is pending, approved or closed (the server answers `SECONDARY_LOCKED` / `MONTH_CLOSED`).
 */
export function SecondaryFiles({
  month,
  files,
  canEdit,
  online,
  onChanged,
  forUserId,
}: {
  month: string;
  files: SecondaryAttachment[];
  canEdit: boolean;
  online: boolean;
  /** A manager working on someone else's month: the files belong to that person. */
  forUserId?: string;
  /** Called after an upload or a removal, so the month can be read again. */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  /** Sends the chosen files one after another; a file that fails is named, the rest still go. */
  const upload = async (files: PickedProof[], errors: string[]) => {
    const failed = [...errors];
    let sent = 0;
    setBusy(true);
    for (const f of files) {
      try {
        await addSecondaryFile(month, f, forUserId);
        sent += 1;
      } catch (err) {
        failed.push(`${f.name}: ${errorText(err)}`);
      }
    }
    setBusy(false);
    setProblems(failed);
    if (sent > 0) setDone(sent === 1 ? '1 file attached.' : `${sent} files attached.`);
    onChanged();
  };

  const add = async () => {
    setProblems([]);
    setDone(null);
    if (!online) return setProblems(['You’re offline. Connect to the internet to attach files.']);
    const picked = await pickProofFiles();
    if (picked) await upload(picked.files, picked.errors);
  };

  const photo = async () => {
    setProblems([]);
    setDone(null);
    if (!online) return setProblems(['You’re offline. Connect to the internet to attach files.']);
    const taken = await takeProofPhoto();
    if (taken) await upload(taken.file ? [taken.file] : [], taken.error ? [taken.error] : []);
  };

  const remove = async (f: SecondaryAttachment) => {
    setProblems([]);
    setDone(null);
    if (!online) return setProblems(['You’re offline. Connect to the internet to remove a file.']);
    setBusy(true);
    try {
      await removeSecondaryFile(f.id);
      onChanged();
    } catch (err) {
      setProblems([`${f.fileName}: ${errorText(err)}`]);
    } finally {
      setBusy(false);
    }
  };

  // A grid of thumbnails, each with its size and a ✕ (2026-11-28); two ways to add: several files at once, or a photo.
  return (
    <InfoCard>
      <ThemedText type="smallBold">{`Proof files${files.length > 0 ? ` (${files.length})` : ''}`}</ThemedText>
      {files.length === 0 && canEdit ? (
        <ThemedText type="small" themeColor="danger">
          At least one file is needed to submit.
        </ThemedText>
      ) : null}
      {files.length === 0 && !canEdit ? <ThemedText type="small" themeColor="textSecondary">No files.</ThemedText> : null}
      {files.length > 0 ? (
        <View style={styles.grid}>
          {files.map((f) => (
            <View key={f.id} style={styles.tile}>
              <Thumb file={f} />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {f.fileName}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{formatSize(f.sizeBytes)}</ThemedText>
              {canEdit ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${f.fileName}`} disabled={busy} hitSlop={6} onPress={() => void remove(f)} style={styles.remove}>
                  <ThemedText type="smallBold" themeColor="danger">✕</ThemedText>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {done ? <Notice tone="success">{done}</Notice> : null}
      {problems.map((p) => (
        <Notice key={p} tone="danger">{p}</Notice>
      ))}
      {canEdit ? (
        <View style={styles.buttons}>
          <View style={styles.grow}>
            <PrimaryButton label="Add files" loading={busy} disabled={!online} onPress={add} />
          </View>
          <View style={styles.grow}>
            <PrimaryButton label="Take photo" variant="text" disabled={!online || busy} onPress={photo} />
          </View>
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">Files can’t be changed while the month is waiting, approved or closed.</ThemedText>
      )}
      {canEdit ? <ThemedText type="small" themeColor="textSecondary">PDF, JPG or PNG, up to 5 MB each. Choose several at once.</ThemedText> : null}
    </InfoCard>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: 96, gap: 2 },
  remove: { position: 'absolute', top: 2, right: 2, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.9)' },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1 },
  thumb: { width: 96, height: 96, borderRadius: Spacing.two },
  doc: { alignItems: 'center', justifyContent: 'center' },
});
