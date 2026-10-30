<img src="https://kissforreact.org/img/KISS_outline.svg" alt="Kiss for React Image" width="150" />

## React state management for AI agents

Kiss helps AI agents stay on track, session after session, while spending fewer tokens.

* <img src="https://kissforreact.org/img/claude.svg" alt="Claude" width="20" height="20" align="top" /> [Read Claude's opinion about Kiss](https://kissforreact.org/react/getting-started/claude-opinion-kiss)
* <img src="https://kissforreact.org/img/openai-readme.svg" alt="OpenAI" width="20" height="20" align="top" /> [Read Codex's opinion about Kiss](https://kissforreact.org/react/getting-started/codex-opinion-kiss)

```bash
npm install kiss-for-react
```

## Complete docs → **[https://kissforreact.org](https://kissforreact.org)**

## Linter → **[eslint-plugin-kiss-for-react](https://www.npmjs.com/package/eslint-plugin-kiss-for-react)**

---
      
# Overview

## Store and state

The **store** holds all application **state**. Here are a few examples:

```tsx
// Your state is a number
const store = createStore<number>({initialState: 1});

// Your state is a plain JavaScript object
const store = createStore({initialState: {name: 'Mary', age: 25}});

// Your state is an instance of an ES6 class
class State { constructor(public name: string, public age: number){} }
const store = createStore<State>({initialState: new State('Mary', 25)});
```

Use a `StoreProvider` to add the store to your component tree:

```tsx
function App() {
  return (
    <StoreProvider store={store}>
      <AppContent />
    </StoreProvider>
  );
};
```

&nbsp;

## Components use the state

The `useAllState` hook lets you access the whole state from any component.
The component re-renders when any part of the state changes (not recommended, but good for
fast prototyping).

```tsx
function MyComponent() { 
  const state = useAllState<State>();   
  
  return <div>{state.name} is {state.age} years old</div>;    
};
```

The `useSelect` hook selects only the part of the state that your component needs.
The component re-renders only when that part changes.

```tsx
function MyComponent() { 
  const name = useSelect((state: State) => state.name);   
  const age = useSelect((state: State) => state.age);
     
  return <div>{name} is {age} years old</div>;    
};
```

The `useObject` hook also causes the component to re-render only when needed:

```tsx
function MyComponent() {
 
  const state = useObject((state: State) => ({
    name: state.name,
    age: state.age,
  }));
       
  return <div>{state.name} is {state.age} years old</div>;    
};
```

These hooks connect to the store with React's own
[`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore),
so React reads the state itself, compares what each component selected, and renders only
the components whose selection changed. React also checks the state again before
committing a
render it paused (a transition), and renders again if the state changed meanwhile, so a
screen never shows parts of two different states at the same time.

&nbsp;

## Actions and reducers

An **action** is a class with its own **reducer** function.
This reducer has access to the current state and returns a new state.

```tsx
class Increment extends Action {

  reduce() { 
    // The reducer has access to the current state
    return this.state + 1; // It returns a new state 
  };
}
```

&nbsp;

## Dispatch an action

The store's state is **immutable**.

The only way to change the store's state is by dispatching an **action**,
wich runs the action's reducer to get a new state.
The new state replaces the current one, and affected components re-render.

```tsx
// Dispatch an action
store.dispatch(new Increment());

// Dispatch multiple actions
store.dispatchAll([new Increment(), new LoadText()]);

// Dispatch an action and wait for it to finish
await store.dispatchAndWait(new Increment());

// Dispatch multiple actions and wait for them to finish
await store.dispatchAndWaitAll([new Increment(), new LoadText()]);

// Dispatch an action when the state meets a condition
store.dispatchWhen(new LoadText(), (state) => state.count >= 3);
```

&nbsp;

## Components can dispatch actions

Hooks for dispatching actions include `useDispatch`, `useDispatchAll`, `useDispatchWhen`,
etc.

```tsx
function MyComponent() { 
  const dispatch = useDispatch();  

  return (
    <Button onClick={() => dispatch(new LoadText())}> 
      Click me! 
    </Button>
  );
};
```

You can also get the store with `useStore` and dispatch actions directly:

```tsx
function MyComponent() { 
  const store = useStore();  

  return (
    <Button onClick={() => store.dispatch(new LoadText())}> 
      Click me! 
    </Button>
  );
};
```

To dispatch actions when the component mounts, when some values change, and when it
unmounts,
use `useStoreEffect` instead of a `useEffect`:

```tsx
useStoreEffect({
  deps: userId, // List the dependencies
  
  // Loads information needed for this screen
  onMount: (store) => store.dispatch(new LoadUser(userId)),
  
  // When the userId changes, stop listening to the old user and load the new one
  onDepsChange: (store, oldUserId) => {
    store.dispatch(new StopListening(oldUserId));
    store.dispatch(new LoadUser(userId));
  },
  
  // When the component unmounts, clean up any resources used by this screen
  onUnmount: (store) => store.dispatch(new CleanResources()),
});
```

To reload the data on screen when the user comes back to the browser tab, or when the
internet
comes back, add `onFocus` and `onOnline` (there are also `onBlur` and `onOffline`). They
run
only on the transitions, while the component is mounted, never on mount. Give the action a
`fresh` period to skip the reload when the data is recent:

```tsx
useStoreEffect({
  onMount: (store) => store.dispatch(new LoadPrices()),
  onFocus: (store) => store.dispatch(new LoadPrices()),
  onOnline: (store) => store.dispatch(new LoadPrices()),
});
```

Also available in components with `useIsFocused()` and `useIsOnline()`,
for an "offline" banner.

&nbsp;

## Actions can do asynchronous work

Actions can fetch data from the internet or do any other async work.

```tsx
const store = createStore<string>({initialState: ''});
```

```tsx
class LoadText extends Action {

  // This reducer returns a Promise
  async reduce() {

    // Download something from the internet
    let response = await fetch('https://dummyjson.com/todos/1');
    let text = await response.text(); 

    // Change the state with the downloaded information
    return (state: string) => text;
  }
}
```

&nbsp;

## Actions can throw errors

If an error occurs, you can simply **throw it**. In this case, the action will not
change the state. Errors are caught globally and can be handled later in one central
place.

If you throw a `UserException` (a type provided by Kiss), a dialog or another UI element
opens automatically and shows the error message to the user.

```tsx
class LoadText extends Action {
  
  async reduce() {
    let response = await fetch("https://dummyjson.com/todos/random/1");
    if (!response.ok) throw new UserException("Failed to load.");    
    
    let text = await response.text();     
    return (state: string) => text;
  }
}
```

&nbsp;

## Components can react to actions

To show a spinner while an asynchronous action is running, use `useIsWaiting(ActionType)`.

To show an error message inside the component, use `useIsFailed(ActionType)`.

```tsx
function MyComponent() {

  const isWaiting = useIsWaiting(LoadText); 
  const isFailed = useIsFailed(LoadText);  
  const state = useAllState<string>();  
  
  if (isWaiting) return <CircularProgress />
  if (isFailed) return <p>Loading failed...</p>;
  return <p>{state}</p>;
}
```

These hooks work per action class: `useIsWaiting(LoadUser)` is true while **any**
`LoadUser` runs. In a list where each row loads its own user,
give the action a `statusKey`, and pass the same key to the hooks,
so that each row sees only its own user:

```tsx
class LoadUser extends Action {
  constructor(readonly userId: string) { super(); }
  get statusKey() { return this.userId; }
  async reduce() { ... }
}

function UserRow({ userId }: { userId: string }) {
  const isWaiting = useIsWaiting(LoadUser, { statusKey: userId });
  const isFailed = useIsFailed(LoadUser, { statusKey: userId });
  ...
}
```

To show one spinner or one error while any of several actions runs or fails, pass an array.
`useExceptionFor([LoadUser, LoadPosts])` returns the `UserException` of the first type in
the array that has one:

```tsx
const isLoading = useIsWaiting([LoadUser, LoadPosts]);
const isFailed = useIsFailed([LoadUser, LoadPosts]);
const error = useExceptionFor([LoadUser, LoadPosts]);
```

Don't write `useIsWaiting(LoadUser) || useIsWaiting(LoadPosts)`. When the first hook returns
true, the second one is not called, and that breaks the rules of hooks.

### Suspense and error boundaries

If you prefer React's `<Suspense>` and error boundaries to `isWaiting`/`isFailed` checks,
use
`useSuspense` instead. It suspends the component while the action runs, and throws the
error
to the nearest error boundary if the action failed:

```tsx
function UserName({ userId }: { userId: string }) {
  useSuspense(LoadUser, { statusKey: userId });
  const user = useSelect((state: State) => state.users[userId]);
  return <p>{user.name}</p>;
}

function UserCard({ userId }: { userId: string }) {
  return (
    <ErrorBoundary fallback={<p>Loading failed.</p>}>
      <Suspense fallback={<Spinner />}>
        <UserName userId={userId} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

When the component needs the result of several actions, pass an array:
`useSuspense([LoadUser, LoadPosts])` suspends while an action of any of the types runs.

&nbsp;

## Actions can send events to the UI

Sometimes an action needs the UI to do something **once**, without changing the state.
For example:

* Scroll a list to the top
* Clear or focus an input
* Open a dialog

The UI keeps track of these things itself (DOM elements, refs, scroll positions).
They are not part of the global app state, so action reducers can't access them.

But you can put **events** (`Evt`) in the state, which actions can modify,
and then UI components can react to these events with `useEvent`:

```tsx
class State {
  constructor(
    readonly messages: readonly Message[],
    readonly scrollToTopEvt: Evt,          // A boolean event.
    readonly changeTextEvt: Evt<string>,   // An event with a value.
  ) {}

  static initialState = new State([], Evt.spent(), Evt.spent());
}

// Dispatch this action to scroll the list to the top
class ScrollFeedToTop extends Action {
  reduce() { return this.state.copy({ scrollToTopEvt: new Evt() }); }
}

// Dispatch this action to change the text in an input
class ChangeText extends Action {
  async reduce() {
    const text = await api.fetchText();
    return (state: State) => state.copy({ changeTextEvt: new Evt(text) });
  }
}

function Feed() {
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // The callbacks below run only once per event, with their values.
  
  // Handle the event that scrolls the list
  useEvent((state: State) => state.scrollToTopEvt, () => listRef.current?.scrollTo({ top: 0 }));
  
  // Handle the event that changes the input text
  useEvent((state: State) => state.changeTextEvt, (text) => { inputRef.current!.value = text; });
  ...
}
```

&nbsp;

## Actions can dispatch other actions

You can use `dispatchAndWait` to dispatch an action and wait for it to finish.

```tsx
class LoadTextAndIncrement extends Action {

  async reduce() {
  
    // Dispatch and wait for the action to finish   
    await this.dispatchAndWait(new LoadText());
    
    // Only then increment the state
    return (state: State) => state.copy({ count: state.count + 1 });  
  }
}
```

You can also dispatch actions in **parallel** and wait for them to finish:

```tsx
class BuyAndSell extends Action {

  async reduce() {  
    
    // Dispatch and wait for both actions to finish
    await this.dispatchAndWaitAll([
      new BuyAction('IBM'), 
      new SellAction('TSLA')
    ]);        

    return (state: State) => state.copy({ 
      message: `New cash balance is ${state.cash}` 
    });
  }
}
```

You can also use `waitCondition` to wait until the `state` meets a condition:

```tsx
class SellStockForPrice extends Action {
  constructor(public stock: string, public price: number) { super(); }

  async reduce() {
  
    // Wait until the stock price is higher than the limit price
    await this.waitCondition(
      (state) => state.stocks.getPrice(this.stock) >= this.price,
      { timeoutMillis: 0 }, // No timeout.
    );
    
    // Only then post the sell order to the backend
    let amount = await postSellOrder(this.stock);    
    
    return (state: State) => 
      state.copy({
        stocks: state.stocks.setAmount(this.stock, amount),
      });
  }
}
```

&nbsp;

## Add "features" to your actions

### NonReentrant

To prevent an action from running again while it is already running,
add the `nonReentrant` property to your action class and set it to `true`.

```tsx
class LoadText extends Action { 
  nonReentrant = true; // Here!
   
  reduce() { ... }
}
```

By default, it checks the action class. To let actions of the same class run in parallel
when they have different parameters, override `nonReentrantKeyParams()`:

```tsx
class SaveItem extends Action {
  constructor(readonly itemId: string) { super(); }
  
  nonReentrant = true;
  nonReentrantKeyParams() { return this.itemId; }
  ...
}
```

Now `SaveItem('A')` and `SaveItem('B')` can run in parallel, but two `SaveItem('A')`
cannot.

### Retry

To retry an action a few times with exponential backoff if it fails,
add the `retry` property to your action class.

```tsx
class LoadText extends Action {   
  retry = {on: true} // Here!
         
  async reduce() { ... }
}
```

Or you can specify the retry policy:

```tsx
class LoadText extends Action {

  retry = {
    initialDelay: 350, // Delay in milliseconds before the first retry
    maxRetries: 3,     // Number of retries before stopping
    multiplier: 2,     // Factor used to increase the delay after each retry
    maxDelay: 5000,    // Maximum delay between retries, in milliseconds
  }
   
  async reduce() { ... }
}
```

By default, every error is retried.
To give up on errors that will fail again anyway (like a 404 or a 401),
override `shouldRetry`.

```tsx
class LoadText extends Action {
  retry = {on: true}

  shouldRetry(error: unknown, attempt: number) {
    return !(error instanceof NotFoundError);
  }

  async reduce() { ... }
}
```

### CheckInternet

To check for an internet connection before running the action, add the `checkInternet`
property. If there is no internet connection, the action stops. You can also show a dialog
with the title "There is no Internet", and the message "Please, verify your connection".

```tsx
class LoadPrices extends Action {    
  checkInternet = { dialog: true } // Here! 
   
  async reduce() { ... } 
}
```

Use `checkInternet = { dialog: false }` to fail without a dialog, so you can show the
error in your components with `isFailed`. Or use `checkInternet = { abort: true }` to
abort the action silently, as if it had never been dispatched, without any errors.

To show a different error, override `noInternetException()`:

```tsx
class LoadPrices extends Action {    
  checkInternet = { dialog: true }

  noInternetException() {
    return new UserException('You are offline. The prices could not be loaded.');
  }
   
  async reduce() { ... } 
}
```

The store checks the internet before it calls the action's `before()` method. So you can
override `before()` without calling `super.before()`.

### UnlimitedRetryCheckInternet

To keep trying an action until it succeeds, add the `unlimitedRetryCheckInternet`
property. If there is no internet, the action waits, and retries until there is.
It also retries if there is internet but the action fails.

```tsx
class LoadPrices extends Action {    
  unlimitedRetryCheckInternet = true
   
  async reduce() { ... } 
}
```

### Debounce

To limit how often an action runs in response to rapid input, add a `debounce` property
to your action class. For example, when a user types into a search bar, debouncing ensures
that not every keystroke triggers a server request. Instead, the action waits until the
user stops typing for a short time before running.

```tsx
class SearchText extends Action {
  constructor(public searchTerm: string) { super(); }
  
  debounce = 300 // Milliseconds
   
  async reduce()  {      
    let result = await loadJson('https://example.com/?q=', this.searchTerm);
    return (state: State) => state.copy({searchResult: result});
  }   
}
```

### IgnoreOld

When the same action may be dispatched again before the previous one finishes (for
example, when the user switches tabs or filters quickly), a slow older request may finish
last, and overwrite the newer information. To prevent that, add the `ignoreOld` property
to your action class.

You can optionally pass the action's `abortSignal` to `fetch` to cancel requests:

```tsx
class LoadTab extends Action {
  constructor(readonly tab: string) { super(); }
  ignoreOld = true;

  async reduce() {
    let response = await fetch(`/api/items?tab=${this.tab}`, {signal: this.abortSignal});
    let items = await response.json();
    return (state: State) => state.copy({items});
  }
}
```

You can also check `this.isAborted` inside the reducer to know if the action was aborted.

### Aborting actions

Call `store.abort(ActionType)` to abort all the actions of that type that are in progress,
for example, from a "Cancel" button, or when the component that started a request
unmounts.

```tsx
useStoreEffect({
  onMount: (store) => store.dispatch(new LoadUser(userId)),
  onUnmount: (store) => store.abort(LoadUser),
});
```

To abort the actions of several types, pass an array: `store.abort([LoadUser, LoadPosts])`.

### Throttle

To prevent an action from running too frequently, you can add a `throttle` property to
your action class. The action then runs at most once per throttle period. If you dispatch
it again during that period, the new dispatch is aborted. After the period ends, the next
dispatch runs, and starts a new period.

```tsx
class LoadPrices extends Action {    
  throttle = 5000 // Milliseconds
   
  async reduce()  {      
    let result = await loadJson('https://example.com/prices');
    return (state: State) => state.copy({prices: result});
  } 
}
```

Override `ignoreThrottle` to run the action anyway under some conditions (for example,
a `force` flag).

```tsx
class LoadPrices extends Action {
  constructor(public force = false) { super(); }
  throttle = 5000;
  get ignoreThrottle() { return this.force; }  
  ...
}
```

### Fresh

To avoid reloading the same information too often, add a `fresh` property to your action
class. When the action runs, its result is considered fresh for that period of time,
and dispatching it again during that period is aborted. After the period ends,
the data is stale, and the next dispatch runs and starts a new period.

```tsx
class LoadPrices extends Action {    
  fresh = 5000 // Milliseconds
   
  async reduce()  {      
    let result = await loadJson('https://example.com/prices');
    return (state: State) => state.copy({prices: result});
  } 
}
```

### Sequential

To make actions run one at a time, in the exact order they were dispatched, add the
`sequential` property to your action class and set it to `true`. Each dispatched action
waits until all the actions dispatched before it have finished.

```tsx
class SaveItem extends Action {
  sequential = true; // Here!
  constructor(readonly item: Item) { super(); }
   
  async reduce() {
    await saveItem(this.item);
    return null;
  }
}
```

By default, all sequential actions share a single queue, even if they are of different
classes. To have independent queues, override `sequentialKeyParams()`. Actions with the
same key run one at a time, while actions with different keys run in parallel:

```tsx
class SaveUser extends Action {
  sequential = true;
  constructor(readonly userId: string) { super(); }
  sequentialKeyParams() { return this.userId; }
  ...
}
```

### Polling

To periodically dispatch an action at a fixed interval, add a `poll` property to your
action class (usually as a constructor parameter), and override `createPollingAction()` to
return the action each tick dispatches. Dispatch it with `Poll.start` to run it right away
and start polling, and with `Poll.stop` to stop polling. Use `Poll.runNowAndRestart` to
run it now and restart the timer, and `Poll.once` (the default) to run it once, without
affecting the polling.

```tsx
class LoadPrices extends Action {
  constructor(readonly poll = Poll.once) { super(); }
  pollInterval = 5000; // Milliseconds
  createPollingAction() { return new LoadPrices(); }
   
  async reduce() {
    let result = await loadJson('https://example.com/prices');
    return (state: State) => state.copy({prices: result});
  }
}

dispatch(new LoadPrices(Poll.start)); // Start polling.
dispatch(new LoadPrices(Poll.stop)); // Stop polling.
```

Each tick waits for the previous run to finish, so runs never overlap.
Set `pollWaitsForRun = false` to tick at a fixed rate instead.

By default, the ticks only run while the app is focused (in the browser, the tab is
visible) and online. A tick that comes due while the user is away waits, and runs as soon
as the user comes back to the tab, or the internet comes back. Set
`pollOnlyWhenFocused = false` or `pollOnlyWhenOnline = false` to keep polling anyway.

To stop all polling at once (for example, on logout), call `stopAllPolling()` from any
action.

## Advanced Features

### OptimisticCommand

To provide instant feedback when an action sends a command to the server (like adding a
todo, or sending a message), extend `OptimisticCommand`. It changes the state immediately,
before the server confirms that the command succeeded.
If the command fails, the state is changed back, and the error is shown to the user.
It can also reload the value from the server.

### OptimisticSync

For rapid toggles (like a "like" button), extend `OptimisticSync`. Every dispatch changes
the state immediately, but only one request per key is sent to the server at a time.
When the request finishes, if the state changed meanwhile, a follow-up request sends the
latest value, until the state stabilizes. This keeps the UI responsive, while minimizing
server load.

### OptimisticSyncWithPush and ServerPush

If your app also receives server pushes (WebSockets, Server-Sent Events, Firebase) that
may change the same values, and more than one device can change them, extend
`OptimisticSyncWithPush` instead of `OptimisticSync`, and apply the pushes with an action
that extends `ServerPush`. They track revisions, so that stale or out-of-order pushes are
ignored, local changes are not overwritten by older pushes, and the last write wins across
devices.

### LoadPages

To load a list page by page (a "load more" button, or an infinite scroll), extend
`LoadPages`.
It keeps the loaded pages in the state, in an immutable `Pages` value, and knows how to
load the next page, the previous page, the first page again, or all the loaded pages
again.

## Disposing the store

Apps have long-lived things that are not state, and must not go in the state: intervals,
WebSockets, `EventSource`s, `AbortController`s, listeners (like Firebase's `onSnapshot`,
which returns an unsubscribe function), RxJS subscriptions.

Keep them in the store **props**, with `setProp`, and close them with `disposeProp`:

```tsx
class StartClock extends Action {
  reduce() {
    const interval = setInterval(() => this.dispatch(new Tick()), 1000);
    this.setProp('clock', interval, { dispose: clearInterval });
    return null;
  }
}

class StopClock extends Action {
  reduce() {
    this.disposeProp('clock');
    return null;
  }
}
```

The props belong to the store, so each test (or each request, in server-side rendering)
has its own, and they can all be closed at once. Kiss knows how to automatically dispose
an `AbortController` (aborted), a `WebSocket`, `EventSource`, `BroadcastChannel`,
`MessagePort` or `Worker` (closed or terminated), an object with `unsubscribe()` (RxJS)
and an object with `[Symbol.dispose]()` or `[Symbol.asyncDispose]()`.

Setting a prop again with the same key disposes the previous value, so dispatching
`StartClock` twice doesn't leak the first interval. Read a prop with
`prop(key)`, list them with `props`, and dispose many with `disposeProps(predicate?)`.

The same methods exist on the store. On logout, `store.logOut({ disposeProps: true })`
disposes them too.

To end the store, when the app finishes or at the end of each test, call
`store.dispose()`. It shuts down the store, stops all the action features, cancels the
waiting `dispatchWhen`s, pauses the persistor, and disposes all the props.
It returns a promise that waits for the async disposals.

&nbsp;

## Environment, dependencies and configuration

Inject the services the actions use (API clients, repositories, analytics...) into the
store, instead of importing them from modules. Each test then creates its own store with
its own dependencies (fakes, for example), with nothing global to set up or reset, and two
stores can live side by side (tests running concurrently, or one store per request in
server-side rendering). The store takes the `environment` (production, staging,
testing...), a `configuration` factory (feature flags) and a `dependencies` factory. The
factories get the store, so they can depend on the environment, and the configuration is
created first, so the dependencies can read it:

```tsx
const store = createStore<State>({
  initialState: State.initialState,
  environment: Environment.production,
  configuration: (store) => new Config(),
  dependencies: (store) => new Dependencies(store.environment as Environment),
});
```

In components, `useEnvironment()` and `useConfiguration()` return the environment and the
configuration, and never re-render, since the values don't change. Components should
usually not need the dependencies. The `errorObserver` gets the store, so it can read
`store.environment`, for example to send the errors to a monitoring service only in
production.

In tests:

```tsx
const store = createStore<State>({
  initialState: State.initialState,
  environment: Environment.testing,
  dependencies: () => new FakeDependencies(),
});
```

&nbsp;

## Persist the state

You can add a `persistor` to save the state to the local device disk.
It supports serialization of JavaScript objects **and** ES6 class instances.

```tsx
const store = createStore<State>({  
  initialState: new State(),
  persistor: new MyPersistor(),
});  

// Wait for the saved state to load, then start the app.
await store.ready();
store.dispatch(new InitAppAction());
```

&nbsp;

## Server-side rendering

Kiss works with server-side rendering out of the box: plain Node with `renderToString` or
streaming, and Next.js with the app router or the pages router. The server renders the HTML
from the store, the browser hydrates it with no mismatches, and from then on it's a normal
Kiss app.

On the server, create a store per request with `server: true`, load the data with the same
actions the client uses, render, and dispose the store:

```tsx
const store = createStore<State>({ initialState: new State(), server: true });
await store.dispatchAndWait(new LoadData());
const html = renderToString(
  <StoreProvider store={store} serverState={store.state}>
    <App />
  </StoreProvider>
);
const transfer = JSON.stringify(store.state); // Goes in the HTML, for the browser.
await store.dispose();
```

In the browser, create the store with the state the server sent, and hydrate with the same
`StoreProvider`. That's all the setup. What you get:

- **No hydration mismatches.** While hydrating, the hooks render the state the server
  rendered, even if a persistor already restored a newer state in the browser. After
  hydration, the components catch up with the live state.
- **The same actions on both sides.** A `LoadData` that polls, retries or debounces in the
  browser simply runs once in the server store, so a request leaves nothing running in Node.
- **Next.js, both routers.** A server component (or `getServerSideProps`) loads the data, and
  a client component creates the store once and provides it. Each route gives its own data to
  the store with `StoreSlice`: the HTML shows it, and client-side navigation shows the new
  route's data in its very first render, with no empty or stale frame.

  ```tsx
  // app/users/[id]/page.tsx, a server component.
  export default async function UserPage({ params }) {
    const user = await fetchUser((await params).id);
    return <StoreSlice state={{ user }} key={user.id}><UserView /></StoreSlice>;
  }
  ```

  Mutations are ordinary Kiss actions, which call a server action or an API route, so you keep
  `useIsWaiting`, `useIsFailed`, retries and optimistic updates on top of them.
- **Streaming.** `renderToPipeableStream` and `renderToReadableStream` work, Suspense
  boundaries included.
- **Nothing half-loaded in the HTML.** On the server, `useIsWaiting` and `useIsFailed` are
  `false`, and `useSuspense` never suspends, so the HTML never shows a spinner or an error.

Complete examples, each with a persistor in the browser and Playwright tests that check the
server HTML, the hydration and the store:
[Next.js app router](examples/nextjs-app-router),
[Next.js pages router](examples/nextjs-pages-router),
[Express with streaming](examples/ssr-express), and a
[todo app with Next.js](examples/todo-app-nextjs) with a class-based state and the
`ClassPersistor`. The details (serialization, the persistor, streaming, React Server
Components) are in the
[server-side rendering](https://kissforreact.org/react/miscellaneous/server-side-rendering)
page of the docs.

&nbsp;

## Testing your app is easy

Just dispatch actions and wait for them to finish.
Then verify the new state or check whether an error occurred.

```tsx
class State {
  constructor(
    public items: Item[], 
    public selectedItem: number
  ) {}
}

test('Selecting an item', async () => {

  const store = createStore<State>({      
    initialState: new State([{id: 1, text: 'A'}, {id: 2, text: 'B'}, {id: 3, text: 'C'}], -1)
  });
  
  // Should select item 2
  await store.dispatchAndWait(new SelectItem(2));
  expect(store.state.selectedItem).toBe(2);
  
  // Fail to select item 42
  let status = await store.dispatchAndWait(new SelectItem(42));    
  expect(status.originalError).toBeInstanceOf(UserException);          
});
```

&nbsp;

## Advanced setup

If you are the team lead, you can set up the app's infrastructure in one central place,
so developers can focus on business logic.

You can add a `stateObserver` to collect app metrics, an `actionObserver` to log
information to the console during development, and an `errorObserver` to log errors,
and to change them before they are handled.

```tsx
const store = createStore<string>({    
  initialState: '',
  stateObserver: (action, prevState, newState, error, count) => { ... },
  actionObserver: (action, count, ini) => { ... },
  errorObserver: ({ error, originalError, action, store }) => { ... },
});  
```

The `errorObserver` gets all errors thrown by your actions, and also the errors of the
persistor (with a `null` action). It returns the error to use: the same one, a different
one,
or `null` to swallow it. Then, a `UserException` is shown to the user in an error dialog,
and
any other error is thrown.

For example, here we convert the `FirestoreError` errors thrown by Firebase into
`UserException` errors, which automatically show a message to the user. Other errors are
logged, and swallowed in production:

```tsx
errorObserver: ({ error, action }) => {
  if (error instanceof FirestoreError)
    return new UserException('Error connecting to Firebase').withHardCause(error);

  if (error instanceof UserException) return error;

  Logger.error(`Got ${error} in ${action ?? 'the persistor'}.`);
  return inProduction() ? null : error;
}
```

By default, Kiss logs what it does (for example, each dispatched action) to the console.
Use `logger` to send these messages somewhere else, or set it to `null` to turn logging
off.
With `null`, Kiss doesn't even build the log messages:

```tsx
const store = createStore<State>({
  initialState: new State(),
  logger: (obj) => myLogger.info(obj), // Or `null` to turn logging off.
  logStateChanges: true, // Also log every state change.
});
```

&nbsp;

## Advanced action configuration

The team lead can create a base action class that all actions will extend, and add some
common
functionality to it. For example, the base class can provide getter shortcuts to important
parts of the state
and helper methods to find information.

```tsx
class State {  
  constructor(
    public items: Item[],    
    public selectedItem: number
  ) {}
}

export abstract class Action extends KissAction<State> {

  // Convenience getters   
  get items() { return this.state.items; }
  get selectedItem() { return this.state.selectedItem; }
  
  // Selectors 
  findById(id: number) { return this.items.find((item) => item.id === id); }
  get selectedIndex() { return this.items.findIndex((item) => item.id === this.selectedItem); }
  searchByText(text: string) { return this.items.find((item) => item.text.includes(text)); }
}
```

Now, all actions can use them to access the state in their reducers:

```tsx
class SelectItem extends Action {
  constructor(public id: number) { super(); }

  reduce() {
    let item = this.findById(this.id);
    if (item === undefined) throw new UserException('Item not found');
    return new State(this.items, item.id);
  }
}
```

&nbsp;

## More

* Complete docs: [https://kissforreact.org](https://kissforreact.org)

* [Kiss GitHub](https://github.com/marcglasberg/kiss-for-react)

* Created by [Marcelo Glasberg](https://glasberg.dev)
  ([GitHub](https://github.com/marcglasberg), [LinkedIn](https://www.linkedin.com/in/marcglasberg/))
