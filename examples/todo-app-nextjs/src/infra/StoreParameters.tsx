import { ClassPersistor, type ShowUserException, UserException, } from 'kiss-for-react';
import { Button, Dialog, DialogActions, DialogContent } from '@mui/material';
import { State } from '../business/State';
import { TodoItem, TodoList } from '../business/TodoList';
import { Filter } from '../business/Filter';
import { createRoot } from "react-dom/client";

// This module is only imported by `store.ts`, from the client component `KissProvider.tsx`,
// so it's part of the client bundle (which Next.js also runs on the server, to render the
// client components to HTML). It doesn't need `'use client'` itself: that directive marks the
// boundary where server components hand over to client ones, and no server component imports
// this module. `server-state.ts`, which runs in the root layout, must not import it.

/**
 * Uses localStorage, since this is a React web app.
 * Could also use IndexedDB.
 * If it was a React Native app, we would use AsyncStorage.
 *
 * It's created here, at module level, on the server as well, but `store.ts` only gives it to
 * the store in the browser: the callbacks below touch `window`, which the server doesn't have.
 *
 * The classes it lists declare a static `typeName` (see `State.ts` and `TodoList.ts`), since
 * Next.js minifies class names in production and the persistor saves the state by class name.
 * Without it, this constructor would throw a StoreException in the production build.
 */
export const persistor = new ClassPersistor<State>(
  async () => window.localStorage.getItem('state'),
  async (serialized: string) => window.localStorage.setItem('state', serialized),
  async () => window.localStorage.clear(),
  [State, TodoList, TodoItem, Filter]
);

/**
 * Shows the UserExceptions thrown by the actions in an MUI dialog, rendered in its own React
 * root, in the `#dialog-root` element of the root layout. Only the browser runs it: actions
 * are dispatched by the user, after hydration.
 *
 * It could also open a browser dialog:
 *
 * ```ts
 * const userExceptionDialog: ShowUserException =
 *   (exception, count, next) => {
 *     let message = exception.title ? `${exception.title} - ${exception.message}` : exception.message;
 *     window.alert(message);
 *     next();
 *   };
 * ```
 *
 * In React Native it could be:
 *
 * ```ts
 * const userExceptionDialog: ShowUserException =
 *   (exception, count, next) => {
 *     Alert.alert(
 *       exception.title || exception.message,
 *       exception.title ? exception.message : '',
 *       [{ text: 'OK', onPress: (_value?: string) => next() }]
 *     );
 *   };
 * ```
 */
export const userExceptionDialog: ShowUserException = (exception: UserException, _count: number, next: () => void) => {

  const container = document.getElementById('dialog-root');
  if (!container) return;

  const root = createRoot(container!);

  const closeDialog = () => {
    root.unmount();
    next();
  };

  root.render(
    <Dialog open={true} onClose={closeDialog}>
      <DialogContent data-testid="user-exception-dialog">
        <p>{exception.title || 'Error'}</p>
        <p>{exception.message}</p>
      </DialogContent>
      <DialogActions>
        <Button data-testid="user-exception-ok" onClick={closeDialog}>OK</Button>
      </DialogActions>
    </Dialog>
  );
};
