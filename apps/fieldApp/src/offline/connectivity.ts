import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';

/**
 * Whether the phone can reach the internet right now. `isInternetReachable` is null while the OS
 * is still probing — treated as online so the first request decides, rather than blocking it.
 * Buttons that need a live connection at tap time (Plan Submit, Final Submission) read this.
 */
let online = true;
const listeners = new Set<() => void>();

const apply = (state: NetInfoState) => {
  const next = state.isConnected !== false && state.isInternetReachable !== false;
  if (next === online) return;
  online = next;
  listeners.forEach((l) => l());
};

let started = false;
export function startConnectivityWatch(): () => void {
  if (started) return () => {};
  started = true;
  const unsubscribe = NetInfo.addEventListener(apply);
  return () => {
    unsubscribe();
    started = false;
  };
}

export const isOnline = () => online;

/** Calls `fn` each time the phone goes from offline to online. */
export function onReconnect(fn: () => void): () => void {
  let was = online;
  const listener = () => {
    if (online && !was) fn();
    was = online;
  };
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => online,
  );
}
