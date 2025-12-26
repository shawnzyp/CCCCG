export function createStore(arg1, arg2) {
  // Backward compatible:
  // - createStore(initialState, reducer)  (legacy)
  // - createStore(reducer, preloadedState) (redux-like)
  const isReduxLike = typeof arg1 === 'function';
  const reducer = isReduxLike ? arg1 : arg2;
  const preloadedState = isReduxLike ? arg2 : arg1;

  if (typeof reducer !== 'function') {
    throw new Error('createStore requires a reducer function');
  }

  let state = preloadedState;
  const listeners = new Set();

  function getState() {
    return state;
  }

  function dispatch(action) {
    const next = reducer(state, action);
    if (next === state) return action;
    state = next;
    for (const listener of listeners) {
      try {
        // Pass args for legacy subscribers; extra args are harmless.
        listener(state, action);
      } catch (_) {
        // Listener errors should not crash the app.
      }
    }
    return action;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  // Initialize.
  dispatch({ type: '@@INIT' });

  return { getState, dispatch, subscribe };
}
