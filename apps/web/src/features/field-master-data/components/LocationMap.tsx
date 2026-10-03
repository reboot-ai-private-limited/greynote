'use client';

import type { GeoPoint } from '@greynote/contracts';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CENTER, hasMapsKey, loadMapsLibrary } from '@/lib/googleMaps';
import { semantic } from '@/styles/tokens';
import { roundCoordinate } from '../lib/location';

/**
 * One draggable pin. Click the map or drag the pin to set the point; `captured` is a second, grey pin
 * (where the MR's phone was when it added the record) shown for comparison and never moved.
 * Legacy `google.maps.Marker`, as in the route preview: the advanced marker needs a Map ID.
 */
export function LocationMap({
  point,
  captured,
  disabled = false,
  onPick,
}: {
  point: GeoPoint | null;
  captured?: GeoPoint | null | undefined;
  disabled?: boolean;
  onPick: (point: GeoPoint) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const pin = useRef<google.maps.Marker | null>(null);
  const capturedPin = useRef<google.maps.Marker | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(hasMapsKey ? 'loading' : 'unavailable');
  // The listeners are attached once, so they read the latest callback through a ref.
  const pick = useRef(onPick);
  pick.current = onPick;
  const locked = useRef(disabled);
  locked.current = disabled;

  useEffect(() => {
    if (!hasMapsKey || container.current === null || map.current !== null) return;
    let cancelled = false;
    void loadMapsLibrary()
      .then((maps) => {
        if (cancelled || container.current === null) return;
        const instance = new maps.Map(container.current, {
          center: DEFAULT_CENTER,
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        instance.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (locked.current || !event.latLng) return;
          pick.current({ latitude: roundCoordinate(event.latLng.lat()), longitude: roundCoordinate(event.latLng.lng()) });
        });
        map.current = instance;
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('unavailable'));
    return () => {
      cancelled = true;
    };
  }, []);

  // The pin follows the point, however it was set: a click, a drag, a search result or typed numbers.
  useEffect(() => {
    const instance = map.current;
    if (status !== 'ready' || instance === null) return;
    if (point === null) {
      pin.current?.setMap(null);
      pin.current = null;
      return;
    }
    const position = { lat: point.latitude, lng: point.longitude };
    if (pin.current === null) {
      const marker = new google.maps.Marker({
        position,
        map: instance,
        draggable: !locked.current,
        title: 'Registered location',
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: semantic.accent, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 },
      });
      marker.addListener('dragend', () => {
        const p = marker.getPosition();
        if (p) pick.current({ latitude: roundCoordinate(p.lat()), longitude: roundCoordinate(p.lng()) });
      });
      pin.current = marker;
    } else {
      pin.current.setPosition(position);
    }
    pin.current.setDraggable(!disabled);
    instance.panTo(position);
    if ((instance.getZoom() ?? 0) < 14) instance.setZoom(15);
  }, [point, disabled, status]);

  useEffect(() => {
    const instance = map.current;
    if (status !== 'ready' || instance === null) return;
    capturedPin.current?.setMap(null);
    capturedPin.current = null;
    if (!captured) return;
    capturedPin.current = new google.maps.Marker({
      position: { lat: captured.latitude, lng: captured.longitude },
      map: instance,
      title: 'Where the phone was when it was added',
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: semantic.textSubtle, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
    });
    if (point === null) {
      instance.panTo({ lat: captured.latitude, lng: captured.longitude });
      instance.setZoom(15);
    }
    // `point` is intentionally not a dependency: moving the pin must not redraw the captured one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captured, status]);

  return (
    <div className="relative h-72 overflow-hidden rounded-lg border border-border bg-surface-subtle">
      <div ref={container} className="size-full" />
      {status !== 'ready' ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-text-muted">
          {status === 'loading' ? 'Loading map…' : 'Map unavailable (no Google Maps key configured). Type the coordinates instead.'}
        </div>
      ) : null}
    </div>
  );
}
