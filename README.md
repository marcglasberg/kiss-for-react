<img src="https://kissforreact.org/img/KISS_outline.svg" alt="Kiss for React Image" width="150" />

* Simple to learn and easy to use
* Powerful enough to handle complex apps with millions of users
* Testable
<br></br>

## What is it?

Kiss is a state management package for React, launched in May 2025. While new to React, it's a **mature solution**, having been available for Flutter for years under the name [Async Redux](https://pub.dev/packages/async_redux) (top 8% of packages), battle-tested in hundreds of real-world applications.

## Documentation & AI

### Complete docs → **[https://kissforreact.org](https://kissforreact.org)**

* [Getting Started](https://kissforreact.org/react/intro)
* [Tutorial: A simple Todo List app](https://kissforreact.org/react/tutorial/setting-up-the-store)
* [The Basics](https://kissforreact.org/react/basics/store-and-state)
* [Complete AI Documentation](https://kissforreact.org/kiss-state-management-docs.md): A single file containing all Kiss documentation, optimized for AI agents. Just copy the link and paste it into any AI.

### Linter and Quick fixes → [eslint-plugin-kiss-for-react](https://www.npmjs.com/package/eslint-plugin-kiss-for-react)

## How does it compare?

State management solutions can sometimes overwhelm you with complex concepts and the significant knowledge overhead needed to avoid pitfalls. Kiss is the opposite, as there's no need to be especially clever to make things work.
[Detailed comparison](https://kissforreact.org/react/category/comparisons).

**AI-ready:** Kiss centralizes state and business logic in predictable ways, making it easier for AI models to reason about code. This improves AI-driven code generation and helps you get good results with surprisingly little effort.

---

# Overview

Here are the main concepts:

## Store and state

The **store** holds all application **state**. Here are a few examples:

```tsx
// If your state is a number
const store = createStore<number>({initialState: 1});

// If your state is a plain JavaScript object
const store = createStore({initialState: {name: 'Mary', age: 25}});

// If your state is an instance of an ES6 class
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

The `useAllState` hook lets you access the state from any component.
The component re-renders when the state changes.

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

The only way to change the store's state is by dispatching an **action**.
This runs the action's reducer to get a new state.
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
store.dispatchWhen(new LoadText(), (state) => state.count >= 3, { timeoutMillis: 0 });
```

&nbsp;

## Components can dispatch actions

Hooks for dispatching actions include `useDispatch`, `useDispatchAll`, `useDispatchWhen`, etc.

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

To dispatch actions when the component mounts, when some values change, and when it unmounts:

```tsx
const dispatch = useDispatch({
  deps: userId,
  onMount: (store) => store.dispatch(new LoadUser(userId)),
  onDepsChange: (store, oldUserId) => {
    store.dispatch(new StopListening(oldUserId));
    store.dispatch(new LoadUser(userId));
  },
  onUnmount: (store) => store.dispatch(new CleanResources()),
});
```

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
change the state. Errors are caught globally and can be handled later in one central place.

If you throw a `UserException`, a type provided by Kiss, a dialog or another UI element
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

To stop an action silently instead, throw an `AbortDispatchException`. The action is
aborted without showing any errors, and it doesn't count as failed:

```tsx
class LoadText extends Action {

  async before() {
    if (await isTextCached()) throw new AbortDispatchException();
  }
  
  async reduce() { ... }
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

## Add features to your actions

It's easy to add your own reusable features to actions.
Kiss also includes several useful features out of the box:

### NonReentrant

To prevent an action from running again while it is already running,
add the `nonReentrant` property to your action class and set it to `true`.

```tsx
class LoadText extends Action { 
  nonReentrant = true;
   
  reduce() { ... }
}
```

By default, it checks the action class. To let actions of the same class run in parallel
when they have different parameters, override `nonReentrantKeyParams()`:

```tsx
class SaveItem extends Action {
  nonReentrant = true;
  constructor(readonly itemId: string) { super(); }
  nonReentrantKeyParams() { return this.itemId; }
  ...
}
```

Now `SaveItem('A')` and `SaveItem('B')` can run in parallel, but two `SaveItem('A')` cannot.
To make different action classes share the same key, override `computeNonReentrantKey()`.

### Retry

To retry an action a few times with exponential backoff if it fails,
add the `retry` property to your action class.

```tsx
class LoadText extends Action {   
  retry = {on: true}
         
  async reduce() { ... }
}
```

And you can specify the retry policy:

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

### CheckInternet

To check for an internet connection before running the action, add the `checkInternet` property.
If there is no internet connection, the action stops. You can also show a dialog that says,
"There is no internet connection. Please check your connection."

```tsx
class LoadPrices extends Action {    
  checkInternet = { dialog: true } 
   
  async reduce() { ... } 
}
```

Use `checkInternet = { dialog: false }` to fail without a dialog, so you can show the error
in your components with `isFailed`. Or use `checkInternet = { abort: true }` to abort the
action silently, as if it had never been dispatched, without any errors.

In tests, simulate the internet connection as off (or on) for all actions with
`store.forceInternetOnOffSimulation = () => false`. Return `null` to use the real connection.

### UnlimitedRetryCheckInternet

To keep trying an action until it succeeds, even while the device is offline, add the
`unlimitedRetryCheckInternet` property. If there is no internet, the action waits, and
retries until there is. It also retries if there is internet but the action fails.

```tsx
class LoadPrices extends Action {    
  unlimitedRetryCheckInternet = true
   
  async reduce() { ... } 
}
```

Note that combining `retry` with `checkInternet` doesn't retry when there is no internet.
It only retries when there is internet but the action fails.

The action is non-reentrant for the whole time until it succeeds, including the waits between
retries. You can also change the retry delays:

```tsx
class LoadPrices extends Action {

  unlimitedRetryCheckInternet = {
    initialDelay: 350,        // Delay in milliseconds before the first retry
    multiplier: 2,            // Factor used to increase the delay after each retry
    maxDelay: 5000,           // Maximum delay between retries, when the action fails
    maxDelayNoInternet: 1000, // Maximum delay between retries, when there is no internet
  }
   
  async reduce() { ... }
}
```

### Debounce

To limit how often an action runs in response to rapid input, add a `debounce` property
to your action class. For example, when a user types into a search bar, debouncing ensures that not
every keystroke triggers a server request. Instead, the action waits until the user stops typing for a short time
before running.

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

Each dispatch resets the wait time, and only the last action runs its reducer. The previous
ones finish without changing the state. Use `debounce = true` for the default of 333 milliseconds.

By default, actions of the same class debounce each other. To use a different lock, override
`debounceLockBuilder()`. Actions with the same lock debounce each other, even if they are
of different classes:

```tsx
class SearchText extends Action {
  constructor(public field: string, public searchTerm: string) { super(); }
  debounce = 300;
  debounceLockBuilder() { return this.field; }
  ...
}
```

### Throttle

To prevent an action from running too frequently, you can add a `throttle` property to your
action class. The action then runs at most once per throttle period. If you dispatch it again
during that period, the new dispatch is aborted. After the period ends, the next dispatch runs,
and starts a new period.

```tsx
class LoadPrices extends Action {    
  throttle = 5000 // Milliseconds
   
  async reduce()  {      
    let result = await loadJson('https://example.com/prices');
    return (state: State) => state.copy({prices: result});
  } 
}
```

Use `throttle = true` for the default of 1000 milliseconds. Override `ignoreThrottle` to run
the action anyway under some conditions (for example, a `force` flag). If the action fails,
the throttle period is kept, unless you set `removeThrottleLockOnError = true`.

By default, actions of the same class throttle each other. To use a different lock, override
`throttleLockBuilder()`. Actions with the same lock throttle each other, even if they are
of different classes:

```tsx
class LoadPrices extends Action {
  constructor(public category: string, public force = false) { super(); }
  throttle = 5000;
  get ignoreThrottle() { return this.force; }
  throttleLockBuilder() { return this.category; }
  ...
}
```

### Fresh

To avoid reloading the same information too often, add a `fresh` property to your action class.
When the action runs, its result is considered fresh for that period (counted from the
dispatch), and dispatching it again during that period is aborted. After the period ends, the data is stale, and the next
dispatch runs and starts a new period.

```tsx
class LoadPrices extends Action {    
  fresh = 5000 // Milliseconds
   
  async reduce()  {      
    let result = await loadJson('https://example.com/prices');
    return (state: State) => state.copy({prices: result});
  } 
}
```

Use `fresh = true` for the default of 1000 milliseconds. Override `ignoreFresh` to run the
action anyway under some conditions (for example, a `force` flag). Unlike `throttle`, if the
action fails, its data doesn't stay fresh, so you can dispatch it again right away.

By default, actions of the same class share the fresh period. Override `freshKeyParams()` to
give each value of some fields its own fresh period, or `computeFreshKey()` so that actions of
different classes share it:

```tsx
class LoadUserCart extends Action {
  constructor(public userId: string, public force = false) { super(); }
  fresh = 5000;
  get ignoreFresh() { return this.force; }
  freshKeyParams() { return this.userId; }
  ...
}
```

### Sequential

To make actions run one at a time, in the exact order they were dispatched, add the
`sequential` property to your action class and set it to `true`. Each dispatched action
waits until all the actions dispatched before it have finished, and only then runs its
`before`, `reduce` and `after` methods.

```tsx
class SaveItem extends Action {
  sequential = true;
  constructor(readonly item: Item) { super(); }
   
  async reduce() {
    await saveItem(this.item);
    return null;
  }
}
```

By default, all sequential actions share a single queue, even if they are of different
classes. To have independent queues, override `sequentialKeyParams()`. Actions with the same
key run one at a time, while actions with different keys run in parallel:

```tsx
class SaveUser extends Action {
  sequential = true;
  constructor(readonly userId: string) { super(); }
  sequentialKeyParams() { return this.userId; }
  ...
}
```

If the actions depend on the previous ones (for example, creating an item and then updating
it), override `discardQueueOnError()` to return `true`. If an action fails, the actions
waiting behind it are then discarded, without running. While waiting for their turn, actions
count as being in progress, so `isWaiting` shows a spinner right away. Note an action must
never wait (for example, with `dispatchAndWait`) for another action in the same queue,
because they would wait for each other forever.

### Polling

To periodically dispatch an action at a fixed interval, add a `poll` property to your action
class (usually as a constructor parameter), and override `createPollingAction()` to return
the action each tick dispatches. Dispatch it with `Poll.start` to run it right away and start
polling, and with `Poll.stop` to stop polling. Use `Poll.runNowAndRestart` to run it now and
restart the timer, and `Poll.once` (the default) to run it once, without affecting the polling.

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

The default `pollInterval` is 10000 milliseconds. Each tick waits for the previous run to
finish, so runs never overlap. Set `pollWaitsForRun = false` to tick at a fixed rate instead.
By default, actions of the same class share the same polling. Override `pollingKeyParams()`
to give each value of some fields its own polling, or `computePollingKey()` so that actions
of different classes share it. To stop all polling at once (for example, on logout), call
`stopAllPolling()` from any action.

### OptimisticCommand

To provide instant feedback when an action sends a command to the server (like adding a todo,
or sending a message), extend `OptimisticCommand`. It changes the state immediately, before the server
confirms that the command succeeded. If the command fails, the state is changed back, and the
error is shown to the user. It can also reload the value from the server.

```tsx
class AddTodo extends OptimisticCommand<State, Todo[]> {
  constructor(readonly todo: Todo) { super(); }

  optimisticValue() { return [...this.state.todos, this.todo]; }
  getValueFromState(state: State) { return state.todos; }
  applyValueToState(state: State, todos: Todo[]) { return state.copy({ todos }); }
  sendCommandToServer() { return api.addTodo(this.todo); }
  reloadFromServer() { return api.loadTodos(); }
}
```

### OptimisticSync

For rapid toggles (like a "like" button), extend `OptimisticSync`. Every dispatch changes the
state immediately, but only one request per key is sent to the server at a time. When the
request finishes, if the state changed meanwhile, a follow-up request sends the latest value,
until the state stabilizes. This keeps the UI responsive, while minimizing server load.

```tsx
class ToggleLike extends OptimisticSync<State, boolean> {
  constructor(readonly itemId: string) { super(); }

  optimisticSyncKeyParams() { return this.itemId; }
  valueToApply() { return !this.state.isLiked(this.itemId); }
  applyOptimisticValueToState(state: State, liked: boolean) { return state.setLiked(this.itemId, liked); }
  getValueFromState(state: State) { return state.isLiked(this.itemId); }
  sendValueToServer(liked: boolean) { return api.setLiked(this.itemId, liked); }
}
```

Optionally, apply the server response with `applyServerResponseToState`, and run code when the
state stabilizes, or when a request fails, with `onFinish` (for example, to reload the value
from the server).

### OptimisticSyncWithPush and ServerPush

If your app also receives server pushes (WebSockets, Server-Sent Events, Firebase) that may
change the same values, and more than one device can change them, extend
`OptimisticSyncWithPush` instead of `OptimisticSync`, and apply the pushes with an action that
extends `ServerPush`. They track revisions, so that stale or out-of-order pushes are ignored,
local changes are not overwritten by older pushes, and the last write wins across devices.

```tsx
class ToggleLike extends OptimisticSyncWithPush<State, boolean> {
  constructor(readonly itemId: string) { super(); }

  optimisticSyncKeyParams() { return this.itemId; }
  valueToApply() { return !this.state.isLiked(this.itemId); }
  applyOptimisticValueToState(state: State, liked: boolean) { return state.setLiked(this.itemId, liked); }
  getValueFromState(state: State) { return state.isLiked(this.itemId); }
  getServerRevisionFromState(state: State, key: any) { return state.revisionOf(key); }

  async sendValueToServer(liked: boolean, localRevision: number, deviceId: number) {
    const response = await api.setLiked(this.itemId, liked, localRevision, deviceId);
    this.informServerRevision(response.serverRevision);
  }
}

class PushLike extends ServerPush<State> {
  constructor(readonly itemId: string, readonly liked: boolean, readonly metadata: PushMetadata) { super(); }

  associatedAction() { return ToggleLike; }
  optimisticSyncKeyParams() { return this.itemId; }
  pushMetadata() { return this.metadata; } // { serverRevision, localRevision, deviceId }
  applyServerPushToState(state: State, key: any, serverRevision: number) {
    return state.setLiked(this.itemId, this.liked).setRevision(key, serverRevision);
  }
  getServerRevisionFromState(state: State, key: any) { return state.revisionOf(key); }
}
```

The server must return a server revision that always increases, and its pushes must include
the server revision, and the local revision and device ID sent by `sendValueToServer`.

### Clearing the features on logout

The store keeps some information for these features: the fresh keys, the throttle and
debounce locks, the polling timers, the sequential queues, the actions waiting to retry, the
`OptimisticSync` and `OptimisticSyncWithPush` keys, and the revisions kept by
`OptimisticSyncWithPush` and `ServerPush`.
On logout, call
`store.clearInternalActionProps()` so that the previous user's actions stop, and don't affect
the next user. For example, without it, loading the new user's data could be aborted because
the previous user's data is still "fresh".

```tsx
class Logout extends Action {
  reduce() {
    this.store.clearInternalActionProps();
    return State.initialState();
  }
}
```

It removes the fresh keys and throttle locks, makes waiting debounced actions finish without
running their reducer, stops all polling, discards the actions waiting in sequential queues,
and stops the actions that retry (with `retry` or `unlimitedRetryCheckInternet`). Actions that
are already running still finish, and may still change the state. It's also called when the
store is shut down with `store.setShutDown(true)`.

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
persistor (with a `null` action). It returns the error to use: the same one, a different one,
or `null` to swallow it. Then, a `UserException` is shown to the user in an error dialog, and
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
Use `logger` to send these messages somewhere else, or set it to `null` to turn logging off.
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

The team lead can create a base action class that all actions will extend, and add some common
functionality to it. For example, the base class can provide getter shortcuts to important parts of the state
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

* Created by [Marcelo Glasberg](https://glasberg.dev) ([GitHub](https://github.com/marcglasberg), [LinkedIn](https://www.linkedin.com/in/marcglasberg/))
