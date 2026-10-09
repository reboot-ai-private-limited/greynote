import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import { addLeaveProof, MAX_PROOF_FILES, removeLeaveProof, type LeaveAttachment } from '@/lib/leave';
import { formatSize, pickProofFile } from '@/lib/proof-picker';

import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Proof for a leave of a type that takes it (a prescription, a medical certificate) — optional and never
 * blocks a request. PDF, JPG or PNG, up to 5 MB, at most 3 files. Needs the internet. The phone checks the
 * type, size and count first so a doomed upload isn't sent; the server checks again from the file's own bytes.
 */
export function LeaveProof({
  leaveId,
  files,
  online,
  onChanged,
}: {
  leaveId: string;
  files: LeaveAttachment[];
  online: boolean;
  /** Called after an upload or a removal, so the list can reload. */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pick = async () => {
    setMsg(null);
    if (!online) return setMsg('You’re offline. Connect to the internet to attach a file.');
    const picked = await pickProofFile(files.length);
    if (!picked) return;
    if (picked.error || !picked.file) return setMsg(picked.error ?? 'Could not use that file.');
    setBusy(true);
    try {
      await addLeaveProof(leaveId, picked.file);
      onChanged();
    } catch (err) {
      setMsg(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f: LeaveAttachment) => {
    setMsg(null);
    if (!online) return setMsg('You’re offline. Connect to the internet to remove a file.');
    setBusy(true);
    try {
      await removeLeaveProof(leaveId, f.id);
      onChanged();
    } catch (err) {
      setMsg(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold">Proof (optional)</ThemedText>
      {files.map((f) => (
        <View key={f.id} style={styles.row}>
          <ThemedText type="small" style={styles.name} numberOfLines={1}>
            {`${f.fileName} · ${formatSize(f.sizeBytes)}`}
          </ThemedText>
          <PrimaryButton label="Remove" variant="text" disabled={busy} onPress={() => remove(f)} />
        </View>
      ))}
      {msg ? <Notice tone="danger">{msg}</Notice> : null}
      <PrimaryButton
        label={files.length === 0 ? 'Attach a file' : 'Attach another file'}
        variant="text"
        loading={busy}
        disabled={files.length >= MAX_PROOF_FILES}
        onPress={pick}
      />
      <ThemedText type="small" themeColor="textSecondary">
        PDF, JPG or PNG, up to 5 MB, at most 3 files.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flex: 1 },
});
