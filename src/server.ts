// The entry point of the package under the `react-server` export condition (see package.json),
// which React Server Components bundlers (like the Next.js app router) use for the modules of
// server components. It has everything of the main entry point except the hooks, which need
// React's client features. So a server component can create a store, dispatch actions and read
// the state, and importing a hook from it is a build error, instead of a runtime one. The
// `StoreProvider` and `StoreSlice` components are exported, so that a server component can
// render them: their module is marked `'use client'`, and the bundler turns them into client
// references. It's also exported as `kiss-for-react/server`, for code that must never pull in
// the hooks.
//
// Keep it in sync with `index.ts`: `__tests__/bdd.ServerEntryPoint.test.ts` checks that it
// exports everything of `index.ts` that is not a hook.
import { PersistAction, PersistException, Persistor, PersistorDummy, PersistorPrinterDecorator, } from './Persistor';
import { ClassPersistor } from './ClassPersistor';
import { ProcessPersistence } from './ProcessPersistence';
import {
  ActionStatus,
  AsyncReducer,
  AsyncReducerResult,
  OptimisticCommand,
  OptimisticSync,
  OptimisticSyncWithPush,
  PushMetadata,
  ServerPush,
  KissAction,
  MergeServerStateAction,
  Poll,
  UserExceptionAction,
  ReduxReducer,
  Retry,
  RetryOptions,
  UnlimitedRetryCheckInternet,
  SyncReducer,
  UpdateStateAction,
  StatusOptions,
} from './KissAction';
import { Store, createStore, ShowUserException, PropDispose, PropPredicate, SetPropOptions, AppSignalSource } from './Store';
import { StoreProvider, StoreProviderProps, StoreSlice, StoreSliceProps } from './StoreProvider';
import { AbortDispatchException, StoreException, TimeoutException } from './StoreException';
import { Evt, EvtState } from './Evt';
import { UserException } from './UserException';

export {
  Persistor, PersistorPrinterDecorator, PersistorDummy, PersistException, PersistAction, UpdateStateAction,
  ClassPersistor,
  ProcessPersistence,
  KissAction,
  MergeServerStateAction,
  UserExceptionAction,
  ActionStatus, ReduxReducer, SyncReducer, AsyncReducer, AsyncReducerResult, StatusOptions,
  Store, createStore, PropDispose, PropPredicate, SetPropOptions, AppSignalSource, ShowUserException,
  StoreProvider, StoreProviderProps, StoreSlice, StoreSliceProps,
  Evt, EvtState,
  StoreException,
  AbortDispatchException,
  TimeoutException,
  UserException,
  OptimisticCommand, OptimisticSync, OptimisticSyncWithPush, ServerPush, PushMetadata, Retry, RetryOptions, UnlimitedRetryCheckInternet,
  Poll,
};
