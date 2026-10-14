import express from 'express';
import { createStore, StoreProvider } from 'kiss-for-react';
import path from 'node:path';
import { renderToPipeableStream } from 'react-dom/server';
import { LoadItems } from './actions';
import { App, lazyLateItems } from './App';
import { emptyState, type State } from './state';

const port = Number(process.env.PORT) || 3103;
const app = express();

// The client bundle, `dist/public/client.js` (see `build.mjs`). This file runs as `dist/server.cjs`.
app.use(express.static(path.join(__dirname, 'public')));

app.get(['/', '/about'], async (req, res) => {
  // One store per request. A module-level store would be shared by all the requests the Node
  // process serves, mixing the users' data. The store is disposed when the render is done, so
  // that it leaves no timers behind in the process (this app has none, but a polling or
  // debounced action would). The server never has the persistor: `createStore` here, not
  // `createAppStore`, and the hooks render `serverState`, so `useIsStoreReady` renders `true`.
  const store = createStore<State>({ initialState: emptyState });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    void store.dispose();
  };

  // The data is loaded with an action, awaited before rendering: the HTML must show the items,
  // and the status hooks render "nothing in progress" on the server anyway.
  await store.dispatchAndWait(new LoadItems());

  // The state the HTML is rendered from. The same object goes to `App`, which puts it in the
  // page as JSON, for the client to create its store with.
  const serverState = store.state;

  // The lazy component of this request, like the store: a module-level one would only stream
  // on the first request of the process (see `lazyLateItems`).
  const LateItems = lazyLateItems();

  const { pipe, abort } = renderToPipeableStream(
    <StoreProvider store={store} serverState={serverState}>
      <App url={req.path} serverState={serverState} LateItems={LateItems} />
    </StoreProvider>,
    {
      // The browser bundle, added as `<script async src="/client.js">` at the end of the HTML.
      bootstrapScripts: ['/client.js'],

      // The shell is everything outside the Suspense boundaries. It's sent as soon as it's
      // ready, so the browser shows the page while the lazy content is still rendering. The
      // content of each boundary follows, in the same response, with an inline script that puts
      // it in place of the fallback. So this is streaming for real: piping in `onAllReady`
      // instead would wait for everything, and send it at once.
      onShellReady() {
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
        pipe(res);
      },

      // Everything has been rendered: the store won't be read again.
      onAllReady: dispose,

      onShellError(error) {
        dispose();
        console.error(error);
        res.status(500).setHeader('Content-Type', 'text/plain').end('Server error');
      },

      // An error inside a Suspense boundary, after the shell: React sends the fallback, and the
      // boundary renders on the client. Just log it.
      onError(error) {
        console.error(error);
      },
    },
  );

  // The browser went away before the end: stop rendering, and release the store.
  res.on('close', () => {
    abort();
    dispose();
  });
});

app.listen(port, () => {
  console.log(`Kiss + Express example at http://localhost:${port}`);
});
