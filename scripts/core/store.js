export function createStore(reducer, preloadedState) {
  let state = preloadedState;
  const listeners = new Set();

  function getState() {
    return state;
  }

  function dispatch(action) {
    state = reducer(state, action);
    for (const listener of listeners) {
      try {
        listener();
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
