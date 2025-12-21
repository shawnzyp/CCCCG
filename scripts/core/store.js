export function createStore(initialState, reducer) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,
    dispatch: (action) => {
      const next = reducer(state, action);
      if (next === state) return;
      state = next;
      listeners.forEach((fn) => fn(state, action));
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
