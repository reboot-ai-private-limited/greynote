import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { listVisuals, type Visual } from '@/lib/marketing';
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

/**
 * Visuals (PRD §6.2): the e-detailing material Admin uploaded, to show a doctor. Pictures open in the
 * app; videos and PDFs open in the phone's own viewer. The list shows offline from its last copy, but
 * a file itself needs a connection.
 */
export default function VisualsScreen() {
  const list = useCachedFetch('visuals', () => listVisuals());
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const [productId, setProductId] = useState<string>('all');
  const [open, setOpen] = useState<Visual | null>(null);
  const [error, setError] = useState<string | null>(null);

  const productName = (id: string | null) => (id ? (master.data?.products.find((p) => p.id === id)?.name ?? 'Product') : 'General');
  const all = (list.data ?? []).filter((v) => v.status === 'active');
  const productIds = [...new Set(all.map((v) => v.productId).filter((x): x is string => !!x))];
  const shown = productId === 'all' ? all : productId === 'general' ? all.filter((v) => !v.productId) : all.filter((v) => v.productId === productId);

  const show = async (v: Visual) => {
    setError(null);
    if (kindOf(v) === 'image') {
      setOpen(v);
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(v.fileUrl);
    } catch {
      setError('Could not open this file. Check your connection and try again.');
    }
  };

  if (open) {
    return (
      <ScreenShell title={open.title}>
        <Image source={{ uri: open.fileUrl }} style={styles.full} contentFit="contain" accessibilityLabel={open.title} />
        <ThemedText type="small" themeColor="textSecondary">
          {`${CATEGORY[open.category]} · ${productName(open.productId)}`}
        </ThemedText>
        <PrimaryButton label="Close" variant="text" onPress={() => setOpen(null)} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Visuals">
      {list.error ? <Notice tone="danger">{list.error}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {list.stale && list.fetchedAt ? <Notice tone="info">{`Showing the list from ${formatWhen(list.fetchedAt)}. Files need a connection.`}</Notice> : null}

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
        shown.map((v) => (
          <Pressable key={v.id} accessibilityRole="button" accessibilityLabel={`Open ${v.title}`} onPress={() => show(v)}>
            <ThemedView type="backgroundElement" style={styles.card}>
              {kindOf(v) === 'image' ? (
                <Image source={{ uri: v.fileUrl }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.fileThumb]}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {kindOf(v) === 'video' ? 'VIDEO' : v.mimeType === 'application/pdf' ? 'PDF' : 'FILE'}
                  </ThemedText>
                </View>
              )}
              <View style={styles.body}>
                <ThemedText type="smallBold">{v.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {`${CATEGORY[v.category]} · ${productName(v.productId)}`}
                </ThemedText>
              </View>
            </ThemedView>
          </Pressable>
        ))
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: Spacing.three, borderRadius: Spacing.three, padding: Spacing.two, alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: Spacing.two },
  fileThumb: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: Spacing.half },
  full: { width: '100%', height: 420 },
});
