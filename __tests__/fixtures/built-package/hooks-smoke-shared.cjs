// Shared by `hooks-smoke.mjs` and `hooks-smoke.cjs`: creates a store, dispatches an action, and
// renders every hook that reads the store to a string. Expected output (see `build.esm.test.ts`):
// `<p>2:2:false:false:none:true</p>`.
function renderWithHooks(React, renderToString, kiss) {
  const { createStore, StoreProvider, KissAction } = kiss;
  const { useSelect, useObject, useIsWaiting, useIsFailed, useExceptionFor, useIsStoreReady } = kiss;

  class Increment extends KissAction {
    reduce() {
      return { count: this.state.count + 1 };
    }
  }

  const store = createStore({ initialState: { count: 1 }, logger: () => {} });
  store.dispatch(new Increment());

  function View() {
    const count = useSelect((state) => state.count);
    const selected = useObject((state) => ({ count: state.count }));
    const isWaiting = useIsWaiting(Increment);
    const isFailed = useIsFailed(Increment);
    const error = useExceptionFor(Increment);
    const isReady = useIsStoreReady();
    const text = [count, selected.count, isWaiting, isFailed, error === null ? 'none' : 'some', isReady].join(':');
    return React.createElement('p', null, text);
  }

  const element = React.createElement(StoreProvider, { store, serverState: store.state }, React.createElement(View));
  return renderToString(element);
}

module.exports = { renderWithHooks };
