import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { VisualViewer } from '@/components/visual-viewer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { LARGE_TABLET_MIN_WIDTH, TABLET_MIN_WIDTH, useResponsive } from '@/hooks/use-responsive';
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
  const { width } = useResponsive();
  // One card per row on a phone; two on a tablet, three on a large one.
  const columns = width >= LARGE_TABLET_MIN_WIDTH ? 3 : width >= TABLET_MIN_WIDTH ? 2 : 1;
  const list = useCachedFetch('visuals', () => listVisuals());
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<{ items: Visual[]; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Each picture's width over height once it has loaded (kept between 0.6 and 2.2 so a very long picture cannot take over the screen).
  const [ratios, setRatios] = useState<Record<string, number>>({});
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
      // Same task as the app (the default is a new one), so Back from the file returns to this list instead of leaving the app.
      await WebBrowser.openBrowserAsync(v.fileUrl, { createTask: false });
    } catch {
      setError('Could not open this file. Check your connection and try again.');
    }
  };

  /** Full screen, with the shown list so swiping goes to the next and previous visual. */
  const view = (v: Visual) => {
    setError(null);
    setViewing({ items: shown, index: Math.max(0, shown.indexOf(v)) });
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

  return (
    <ScreenShell title="Visuals" wide>
      {list.error ? <Notice tone="danger">{list.error}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {saved ? <Notice tone="info">{saved}</Notice> : null}
      {list.stale && list.fetchedAt ? <Notice tone="info">{`Showing the list from ${formatWhen(list.fetchedAt)}. Files and submitting need a connection.`}</Notice> : null}

      <OutletPicker
        label="Show to doctor"
        options={[...doctors].sort((a, b) => a.name.localeCompare(b.name)).map((d) => ({ id: d.id, name: d.name, subtitle: `${d.specialty} · ${d.address}` }))}
        value={doctorId}
        onChange={chooseDoctor}
        emptyText="No doctors yet. Connect to the internet once so your list can load."
        searchable
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
        // One card per row on a phone, two or three on a tablet.
        <View style={styles.grid}>
          {shown.map((v) => {
            const locked = already.has(v.id);
            const ticked = locked || picked.has(v.id);
            return (
              <View key={v.id} style={[styles.cell, { width: `${100 / columns}%` }]}>
                <Pressable
                  accessibilityRole={doctorId ? 'checkbox' : 'button'}
                  accessibilityState={doctorId ? { checked: ticked, disabled: locked } : undefined}
                  accessibilityLabel={doctorId ? `${v.title}${locked ? ', already chosen' : ''}` : `Open ${v.title}`}
                  onPress={() => (doctorId ? toggle(v) : view(v))}>
                  <ThemedView type="backgroundElement" style={[styles.card, locked && styles.locked]}>
                    <View style={[styles.media, kindOf(v) === 'image' && { aspectRatio: ratios[v.id] ?? 16 / 9 }]}>
                      {kindOf(v) === 'image' ? (
                        // The card takes the picture's own proportions once it has loaded, so it is shown whole, not cropped.
                        <Image
                          source={{ uri: v.fileUrl }}
                          style={styles.thumb}
                          contentFit="contain"
                          onLoad={(e) => {
                            const { width: w, height: h } = e.source;
                            if (w > 0 && h > 0) setRatios((r) => (r[v.id] ? r : { ...r, [v.id]: Math.max(0.6, Math.min(2.2, w / h)) }));
                          }}
                        />
                      ) : (
                        <View style={[styles.thumb, styles.fileThumb]}>
                          <ThemedText type="subtitle" themeColor="textSecondary">
                            {kindLabel(v)}
                          </ThemedText>
                        </View>
                      )}
                      {doctorId ? (
                        <View style={[styles.box, { borderColor: ticked ? theme.primary : '#fff' }, ticked ? { backgroundColor: theme.primary } : styles.boxOff]}>
                          {ticked ? (
                            <ThemedText type="smallBold" themeColor="onPrimary">
                              ✓
                            </ThemedText>
                          ) : null}
                        </View>
                      ) : null}
                      {doctorId ? (
                        <Pressable accessibilityRole="button" accessibilityLabel={`View ${v.title} full screen`} hitSlop={8} onPress={() => view(v)} style={styles.viewChip}>
                          <ThemedText type="smallBold" style={styles.viewChipText}>
                            View
                          </ThemedText>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.body}>
                      <ThemedText type="smallBold" numberOfLines={2}>
                        {v.title}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {`${CATEGORY[v.category]} · ${productName(v.productId)}${locked ? ' · chosen' : ''}`}
                      </ThemedText>
                      {locked && canRemove ? <PrimaryButton label="Remove" variant="text" accessibilityLabel={`Remove ${v.title}`} onPress={() => confirmRemove(v)} /> : null}
                    </View>
                  </ThemedView>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {doctorId && picked.size > 0 ? <PrimaryButton label={`Submit ${picked.size} visual${picked.size === 1 ? '' : 's'}`} loading={saving} onPress={submit} /> : null}

      {viewing ? (
        <VisualViewer
          items={viewing.items}
          startIndex={viewing.index}
          onClose={() => setViewing(null)}
          onOpenFile={(v) => void open(v)}
        />
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  // The cells carry the gap as padding (and the grid pulls back by the same), so any number of columns lines up.
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.one },
  cell: { padding: Spacing.one },
  card: { borderRadius: Spacing.three, overflow: 'hidden' },
  locked: { opacity: 0.7 },
  media: { width: '100%', aspectRatio: 16 / 9 },
  thumb: { width: '100%', height: '100%' },
  fileThumb: { alignItems: 'center', justifyContent: 'center' },
  box: { position: 'absolute', top: Spacing.two, left: Spacing.two, width: 26, height: 26, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  boxOff: { backgroundColor: 'rgba(0,0,0,0.25)' },
  viewChip: { position: 'absolute', right: Spacing.two, bottom: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' },
  viewChipText: { color: '#fff' },
  body: { padding: Spacing.three, gap: Spacing.half },
});
