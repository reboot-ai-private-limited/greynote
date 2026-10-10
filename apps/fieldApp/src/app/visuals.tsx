import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, NetworkError } from '@/lib/api';
import { addDoctorVisuals, listDoctorVisuals, listVisuals, removeDoctorVisual, type Visual } from '@/lib/marketing';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { formatWhen } from '@/offline/day';
import type { FieldMasterDataSnapshot } from '@/types/sync';

const CATEGORY: Record<Visual['category'], string> = {
  E_DETAILING: 'E-detailing',
  CAMPAIGN_CREATIVE: 'Campaign',
  BRANDING: 'Branding',
  OTHER: 'Other',
};

const kindOf = (v: Visual) => (v.mimeType.startsWith('image/') ? 'image' : v.mimeType.startsWith('video/') ? 'video' : 'file');
const kindLabel = (v: Visual) => (kindOf(v) === 'video' ? 'VIDEO' : v.mimeType === 'application/pdf' ? 'PDF' : 'FILE');
const messageOf = (err: unknown) => (err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.');

/**
 * Visuals (PRD §6.2): the e-detailing material Admin uploaded, to show a doctor. Without a doctor chosen it is the
 * plain library. With one chosen, the MR ticks which visuals to show that doctor and submits; what was submitted before
 * is ticked and locked (an MR can only add — a manager or Admin removes). "Show" then walks through the doctor's list.
 * Pictures open in the app; videos and PDFs open in the phone's own viewer. The lists show offline from their last
 * copy, but a file itself, and submitting, need a connection.
 */
export default function VisualsScreen() {
  const theme = useTheme();
  const list = useCachedFetch('visuals', () => listVisuals());
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<{ items: Visual[]; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const doctorList = useCachedFetch(`doctorVisuals:${doctorId ?? 'none'}`, () => (doctorId ? listDoctorVisuals(doctorId) : Promise.resolve(null)));

  const doctors = master.data?.doctors ?? [];
  const productName = (id: string | null) => (id ? (master.data?.products.find((p) => p.id === id)?.name ?? 'Product') : 'General');
  const all = (list.data ?? []).filter((v) => v.status === 'active');
  const productIds = [...new Set(all.map((v) => v.productId).filter((x): x is string => !!x))];
  const shown = productId === 'all' ? all : productId === 'general' ? all.filter((v) => !v.productId) : all.filter((v) => v.productId === productId);
  const already = useMemo(() => new Set((doctorList.data?.items ?? []).map((i) => i.visual.id)), [doctorList.data]);
  const forDoctor = (doctorList.data?.items ?? []).map((i) => i.visual).filter((v) => v.status === 'active');
  const doctor = doctors.find((d) => d.id === doctorId);

  const chooseDoctor = (id: string | null) => {
    setDoctorId(id);
    setPicked(new Set());
    setSaved(null);
    setError(null);
  };

  const open = async (v: Visual, items: Visual[] = [v]) => {
    setError(null);
    // A picture, or a walk through several visuals (even one that starts on a PDF or video), opens the viewer.
    if (kindOf(v) === 'image' || items.length > 1) {
      setViewing({ items, index: items.indexOf(v) });
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(v.fileUrl);
    } catch {
      setError('Could not open this file. Check your connection and try again.');
    }
  };

  const toggle = (v: Visual) => {
    if (already.has(v.id)) return;
    setSaved(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(v.id)) next.add(v.id);
      return next;
    });
  };

  const submit = async () => {
    if (!doctorId || picked.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      await addDoctorVisuals(doctorId, [...picked]);
      setSaved(`${picked.size === 1 ? '1 visual' : `${picked.size} visuals`} added for ${doctor?.name ?? 'this doctor'}.`);
      setPicked(new Set());
      doctorList.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  // Only a manager above the doctor's MR, or Admin, can take a pick off (the server says so with `canRemove`); the MR cannot.
  const canRemove = doctorList.data?.canRemove === true;
  const confirmRemove = (v: Visual) =>
    Alert.alert('Remove this visual?', `"${v.title}" will be taken off ${doctor?.name ?? 'this doctor'}'s list.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (!doctorId) return;
          try {
            await removeDoctorVisual(doctorId, v.id);
            setSaved(`Removed "${v.title}".`);
            doctorList.reload();
          } catch (err) {
            setError(messageOf(err));
          }
        },
      },
    ]);

  if (viewing) {
    const current = viewing.items[viewing.index]!;
    const last = viewing.items.length - 1;
    return (
      <ScreenShell title={current.title}>
        {kindOf(current) === 'image' ? (
          <Image source={{ uri: current.fileUrl }} style={styles.full} contentFit="contain" accessibilityLabel={current.title} />
        ) : (
          <ThemedView type="backgroundElement" style={[styles.full, styles.fileThumb]}>
            <ThemedText type="subtitle" themeColor="textSecondary">
              {kindLabel(current)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {'Opens in your phone’s viewer.'}
            </ThemedText>
          </ThemedView>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {`${CATEGORY[current.category]} · ${productName(current.productId)}${last > 0 ? ` · ${viewing.index + 1} of ${last + 1}` : ''}`}
        </ThemedText>
        {last > 0 ? (
          <View style={styles.pager}>
            <PrimaryButton label="Previous" variant="text" disabled={viewing.index === 0} onPress={() => setViewing({ ...viewing, index: viewing.index - 1 })} />
            <PrimaryButton label="Next" variant="text" disabled={viewing.index === last} onPress={() => setViewing({ ...viewing, index: viewing.index + 1 })} />
          </View>
        ) : null}
        {kindOf(current) !== 'image' ? <PrimaryButton label="Open file" onPress={() => open(current)} /> : null}
        <PrimaryButton label="Close" variant="text" onPress={() => setViewing(null)} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Visuals">
      {list.error ? <Notice tone="danger">{list.error}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {saved ? <Notice tone="info">{saved}</Notice> : null}
      {list.stale && list.fetchedAt ? <Notice tone="info">{`Showing the list from ${formatWhen(list.fetchedAt)}. Files and submitting need a connection.`}</Notice> : null}

      <OutletPicker
        label="Show to doctor"
        options={doctors.map((d) => ({ id: d.id, name: d.name, subtitle: `${d.specialty} · ${d.address}` }))}
        value={doctorId}
        onChange={chooseDoctor}
        emptyText="No doctors yet. Connect to the internet once so your list can load."
      />
      {doctorId ? (
        <>
          <PrimaryButton label="Browse all without a doctor" variant="text" onPress={() => chooseDoctor(null)} />
          {doctorList.error ? <Notice tone="danger">{doctorList.error}</Notice> : null}
          <ThemedText type="small" themeColor="textSecondary">
            {already.size > 0 ? `${already.size} already chosen for ${doctor?.name ?? 'this doctor'} (locked). Tick more to add.` : 'Tick the visuals you want to show this doctor, then submit.'}
          </ThemedText>
          {forDoctor.length > 0 ? <PrimaryButton label={`Show ${doctor?.name ?? 'doctor'}'s visuals`} onPress={() => open(forDoctor[0]!, forDoctor)} /> : null}
        </>
      ) : null}

      {all.length > 0 ? (
        <ChoiceChips
          options={[
            { value: 'all', label: 'All' },
            { value: 'general', label: 'General' },
            ...productIds.map((id) => ({ value: id, label: productName(id) })),
          ]}
          value={productId}
          onChange={setProductId}
        />
      ) : null}

      {list.loading && !list.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : shown.length === 0 ? (
        <Notice tone="info">{list.data ? 'No visuals here yet.' : 'Connect once to load the visuals.'}</Notice>
      ) : (
        shown.map((v) => {
          const locked = already.has(v.id);
          const ticked = locked || picked.has(v.id);
          return (
            <Pressable
              key={v.id}
              accessibilityRole={doctorId ? 'checkbox' : 'button'}
              accessibilityState={doctorId ? { checked: ticked, disabled: locked } : undefined}
              accessibilityLabel={doctorId ? `${v.title}${locked ? ', already chosen' : ''}` : `Open ${v.title}`}
              onPress={() => (doctorId ? toggle(v) : open(v))}>
              <ThemedView type="backgroundElement" style={[styles.card, locked && styles.locked]}>
                {doctorId ? (
                  <View style={[styles.box, { borderColor: ticked ? theme.primary : theme.border }, ticked && { backgroundColor: theme.primary }]}>
                    {ticked ? (
                      <ThemedText type="smallBold" themeColor="onPrimary">
                        ✓
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}
                {kindOf(v) === 'image' ? (
                  <Image source={{ uri: v.fileUrl }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.fileThumb]}>
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {kindLabel(v)}
                    </ThemedText>
                  </View>
                )}
                <View style={styles.body}>
                  <ThemedText type="smallBold">{v.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {`${CATEGORY[v.category]} · ${productName(v.productId)}`}
                  </ThemedText>
                </View>
                {doctorId ? (
                  <View>
                    <PrimaryButton label="View" variant="text" accessibilityLabel={`View ${v.title}`} onPress={() => open(v)} />
                    {locked && canRemove ? <PrimaryButton label="Remove" variant="text" accessibilityLabel={`Remove ${v.title}`} onPress={() => confirmRemove(v)} /> : null}
                  </View>
                ) : null}
              </ThemedView>
            </Pressable>
          );
        })
      )}

      {doctorId && picked.size > 0 ? <PrimaryButton label={`Submit ${picked.size} visual${picked.size === 1 ? '' : 's'}`} loading={saving} onPress={submit} /> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: Spacing.three, borderRadius: Spacing.three, padding: Spacing.two, alignItems: 'center' },
  locked: { opacity: 0.7 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 72, height: 72, borderRadius: Spacing.two },
  fileThumb: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: Spacing.half },
  full: { width: '100%', height: 420 },
  pager: { flexDirection: 'row', justifyContent: 'space-between' },
});
