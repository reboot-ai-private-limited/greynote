'use client';

import type { PlaceCandidateDto, PlaceDto } from '@greynote/contracts';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CENTER, hasMapsKey, loadMapsLibrary } from '@/lib/googleMaps';
import { semantic } from '@/styles/tokens';

/**
 * A preview of places on a map: lettered pins in order (A = where it starts, B = where it ends), search
 * candidates as grey pins, fit to bounds. An HQ's base place is one pin; a route is two.
 *
 * THE DASHED LINE IS STRAIGHT, NOT THE DRIVING ROUTE. The API stores no route geometry and the
 * browser key is scoped to the Maps JavaScript API only, so a road-shaped line would imply a path
 * nobody verified. The caption says so.
 *
 * Legacy `google.maps.Marker`: the advanced marker needs a Map ID configured in the Google Cloud
 * console, which a plain marker does not.
 */
const pinText = (index: number) => String.fromCharCode(65 + index);

export function RouteMap({
  stops,
  candidates = [],
  className,
  heightClass = 'h-72',
}: {
  /** In travel order: the HQ's base place, then the destination. */
  stops: readonly PlaceDto[];
  candidates?: readonly PlaceCandidateDto[];
  className?: string;
  /** The map box's height; shorter where space is tight, such as in a dialog. */
  heightClass?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlays = useRef<{ setMap: (m: google.maps.Map | null) => void }[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(hasMapsKey ? 'loading' : 'unavailable');

  // Build the map once.
  useEffect(() => {
    if (!hasMapsKey || container.current === null || map.current !== null) return;
    let cancelled = false;
    void loadMapsLibrary()
      .then((maps) => {
        // StrictMode mounts, unmounts and remounts: a load that settles after teardown must not build into a detached node.
        if (cancelled || container.current === null) return;
        map.current = new maps.Map(container.current, {
          center: DEFAULT_CENTER,
          zoom: 11,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('unavailable'));
    return () => {
      cancelled = true;
    };
  }, []);

  // Redraw the pins and line whenever the stops or candidates change.
  useEffect(() => {
    const instance = map.current;
    if (status !== 'ready' || instance === null) return;
    for (const o of overlays.current) o.setMap(null);
    overlays.current = [];

    const bounds = new google.maps.LatLngBounds();
    const pin = (position: google.maps.LatLngLiteral, fill: string, text: string, title: string) =>
      new google.maps.Marker({
        position,
        map: instance,
        title,
        label: { text, color: '#ffffff', fontSize: '11px', fontWeight: '600' },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: fill, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
      });

    for (const c of candidates) {
      const position = { lat: c.latitude, lng: c.longitude };
      overlays.current.push(pin(position, semantic.textSubtle, '', c.label));
      bounds.extend(position);
    }
    const path = stops.map((s) => ({ lat: s.latitude, lng: s.longitude }));
    stops.forEach((s, i) => {
      overlays.current.push(pin(path[i]!, semantic.accent, pinText(i), s.label));
      bounds.extend(path[i]!);
    });
    if (path.length > 1) {
      overlays.current.push(
        new google.maps.Polyline({
          path,
          map: instance,
          strokeOpacity: 0,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: semantic.accent, scale: 3 }, offset: '0', repeat: '14px' }],
        }),
      );
    }

    if (path.length + candidates.length > 0) instance.fitBounds(bounds, 48);
    // A single point would zoom to the maximum; keep it at a street-level view.
    if (path.length + candidates.length === 1) instance.setZoom(14);
  }, [stops, candidates, status]);

  return (
    <div className={className}>
      <div className={`relative overflow-hidden rounded-lg border border-border bg-surface-subtle ${heightClass}`}>
        <div ref={container} className="size-full" />
        {status !== 'ready' ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-text-muted">
            {status === 'loading' ? 'Loading map…' : 'Map preview unavailable (no Google Maps key configured). The places are listed alongside.'}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-text-subtle">Straight-line preview between the places — not the driving route.</p>
    </div>
  );
}
