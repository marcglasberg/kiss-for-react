<img src="https://kissforreact.org/img/KISS_outline.svg" alt="Kiss for React Image" width="150" />

* Simple to learn and easy to use
* Powerful enough to handle complex apps with millions of users
* Testable
<br></br>

## What is it?

Kiss is a state management package for React, launched in May 2025. While new to React, it's a **mature solution**, having been available for Flutter for years under the name [Async Redux](https://pub.dev/packages/async_redux) (top 8% of packages), battle-tested in hundreds of real-world applications.

## Documentation

The Kiss docs are published
at **[https://kissforreact.org](https://kissforreact.org)**

* [Getting Started](https://kissforreact.org/react/intro)
* [Tutorial: A simple Todo List app](https://kissforreact.org/react/tutorial/setting-up-the-store)
* [The Basics](https://kissforreact.org/react/basics/store-and-state)
* [Complete AI Documentation](https://kissforreact.org/kiss-state-management-docs.md): A single file containing all Kiss documentation, optimized for AI agents. Just copy the link and paste it into any AI.

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

### Retry

To retry an action a few times with exponential backoff if it fails,
add the `retry` property to your action class.

```tsx
class LoadText extends Action {   
  retry = {on: true}
         
  reduce() { ... }
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
   
  reduce() { ... }
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

### Debounce (soon)

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

### Throttle (soon)

To prevent an action from running too frequently, you can add a `throttle` property to your
action class. This means that once the action runs it's considered _fresh_, and it won't run
again for a set period of time, even if you dispatch it again during that period.
After this period ends, the action is considered _stale_ and is ready to run again.

```tsx
class LoadPrices extends Action {    
  throttle = 5000 // Milliseconds
   
  async reduce()  {      
    let result = await loadJson('https://example.com/prices');
    return (state: State) => state.copy({prices: result});
  } 
}
```

### OptimisticUpdate (soon)

To provide instant feedback when an action saves data to the server, you can use an optimistic update.
This feature changes the state immediately, before the server confirms that the update succeeded.
If the server update fails, the state is changed back. You can also show a notification to the user.

```tsx
class SaveName extends Action {    
  optimisticUpdate = { ... } 
   
  async reduce() { ... } 
}
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

You can add a `stateObserver` to collect app metrics, an `errorObserver` to log errors,
an `actionObserver` to log information to the console during development,
and a `globalWrapError` to change errors before they are handled.

```tsx
const store = createStore<string>({    
  initialState: '',
  stateObserver: (action, prevState, newState, error, count) => { ... },
  errorObserver: (error, action, store) => { ... },
  actionObserver: (action, count, ini) => { ... },
  globalWrapError: (error) => { ... }
});  
```

For example, here we handle `FirestoreError` errors thrown by Firebase.
We convert them into `UserException` errors, which are built-in types that
automatically show a message to the user in an error dialog:

```tsx
globalWrapError: (error: any) => {
   return (error instanceof FirestoreError)
      ? new UserException('Error connecting to Firebase')
      : error;
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
