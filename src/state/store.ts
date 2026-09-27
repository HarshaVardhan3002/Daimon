import { useSyncExternalStore } from 'react';

type Listener = () => void;
export type Patch<T> = Partial<T> | ((state: T) => Partial<T>);
export type Store<T> = {
  get: () => T;
  set: (patch: Patch<T>) => void;
  subscribe: (listener: Listener) => () => void;
};

/**
 * A minimal external store. Components subscribe through `useStore` with a selector and re-render only when the
 * selected value changes, so a keystroke in the composer no longer re-renders the whole chat.
 */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set: patch => {
      const next = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const key in next) {
        if (!Object.is(next[key], state[key])) { changed = true; break; }
      }
      if (!changed) return;
      state = { ...state, ...next };
      listeners.forEach(listener => listener());
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** Select a primitive or an existing reference; a selector that builds a new object each call would loop. */
export function useStore<T, S>(store: Store<T>, selector: (state: T) => S): S {
  const read = () => selector(store.get());
  return useSyncExternalStore(store.subscribe, read, read);
}
