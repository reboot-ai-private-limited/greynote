import { createContext, useCallback, useRef, useState, type RefObject } from 'react';
import type { ScrollView, View } from 'react-native';

/** The scroll area of the enclosing ScreenShell and how far it is scrolled, so a failed form can scroll to its first bad field. */
export type ScrollArea = { ref: RefObject<ScrollView | null>; /** A plain View around the scroll area, to find where it sits on screen. */ frame: RefObject<View | null>; offset: RefObject<number> };
export const ScrollAreaContext = createContext<ScrollArea | null>(null);

export type FormErrors = {
  /** Field name → message. A name with no entry is fine. */
  errors: Record<string, string>;
  /** Show these messages (replacing the old ones) and scroll to the first, in `order`. */
  fail: (next: Record<string, string>) => void;
  /** The person changed this field: its message goes away. */
  clear: (name: string) => void;
  clearAll: () => void;
  /** Used by `FormField`: hands over its view and the scroll area, so the form can find the field on screen. */
  register: (name: string, node: View | null) => void;
  setScroll: (area: ScrollArea | null) => void;
};

/**
 * Field-level errors for a form. `order` lists the field names top to bottom; after `fail` the screen scrolls to
 * the first of them that has a message. Pair with `FormField` around each input.
 */
export function useFormErrors(order: string[]): FormErrors {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nodes = useRef(new Map<string, View>());
  const scrollRef = useRef<ScrollArea | null>(null);

  const register = useCallback((name: string, node: View | null) => {
    if (node) nodes.current.set(name, node);
    else nodes.current.delete(name);
  }, []);

  const fail = useCallback((next: Record<string, string>) => {
    setErrors(next);
    const first = order.find((n) => next[n]);
    const node = first ? nodes.current.get(first) : undefined;
    const area = scrollRef.current;
    const scroll = area?.ref.current;
    const frame = area?.frame.current;
    if (!node || !area || !scroll || !frame) return;
    // Wait a beat: the messages being drawn can move the fields (a banner appears above them).
    setTimeout(() => {
      frame.measureInWindow((_sx, scrollTop) => {
        node.measureInWindow((_x, fieldTop) => {
          scroll.scrollTo({ y: Math.max(0, (area.offset.current ?? 0) + fieldTop - scrollTop - 16), animated: true });
        });
      });
    }, 100);
  }, [order]);

  const clear = useCallback((name: string) => {
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const { [name]: _gone, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearAll = useCallback(() => setErrors({}), []);
  const setScroll = useCallback((area: ScrollArea | null) => {
    scrollRef.current = area;
  }, []);

  return { errors, fail, clear, clearAll, register, setScroll };
}
