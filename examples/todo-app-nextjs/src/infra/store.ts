import { createStore, Store } from 'kiss-for-react';
import { State } from '../business/State';
import { TodoList, type TodoJson } from '../business/TodoList';
import { persistor, userExceptionDialog } from './StoreParameters';

/**
 * Creates the store of the app. On the client, this runs once (see `KissProvider.tsx`). On
 * the server, it runs once per request, when the client components are server-rendered: the
 * store is used for that render only, and discarded.
 */
export function createAppStore(initialState: State): Store<State> {
  return createStore<State>({
    initialState,

    // How a slice of server state (the `state` prop of a `StoreSlice`, a plain object, since
    // it comes from a server component) is merged into the class-based state: the default
    // merge is a shallow merge of plain objects, which doesn't fit a `State` class. This is
    // also where the slice is deserialized: `TodoList.fromJson` rebuilds the class instances,
    // so that their methods exist on the client. The rest of the state (the filter) is kept.
    mergeServerState: (state: State, slice: { todos?: TodoJson[] }) =>
      slice.todos ? state.withTodos(TodoList.fromJson(slice.todos)) : state,

    // The ClassPersistor reads and writes localStorage, which only exists in the browser. On
    // the server, the store renders once and is discarded, and must not read or save anything.
    //
    // It saves the whole state, todos included, but the todos it restores are stale: the
    // page's slice is merged on top of the restored state (see `KissProvider.tsx`), so the
    // todos always come from the server. What the persistor adds is the client-only part of
    // the state: the filter the user chose survives a reload.
    persistor: typeof window === 'undefined' ? undefined : persistor,

    // The MUI dialog (see `StoreParameters.tsx`). Actions only run in the browser, after
    // hydration, so the dialog never has to render on the server.
    showUserException: userExceptionDialog,
  });
}
