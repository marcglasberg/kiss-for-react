'use client';
import { useState, useSyncExternalStore } from 'react';
import {
  useAllState,
  useClearExceptionFor,
  useDispatch,
  useExceptionFor,
  useIsFailed,
  useIsStoreReady,
  useIsWaiting,
  useSelect,
  useStore,
} from 'kiss-for-react';
import { Button, Checkbox, CircularProgress, FormControlLabel, TextField } from '@mui/material';
import { State } from '../business/State';
import { AddTodoAction } from '../business/AddTodoAction';
import { ToggleTodoAction } from '../business/ToggleTodoAction';
import { RemoveCompletedTodosAction } from '../business/RemoveCompletedTodosAction';
import { TodoItem } from '../business/TodoList';
import { NextFilterAction } from '../business/NextFilterAction';
import { Filter } from '../business/Filter';
import { AddRandomTodoAction } from '../business/AddRandomTodoAction';

// The UI of the Vite todo app (examples/todo-app-example/src/ui/AppContent.tsx), as a client
// component: it uses the hooks and MUI. It's rendered by `app/page.tsx` inside the
// `StoreSlice` with the server's todos. Differences from the Vite UI: the actions that go to
// the server show their waiting state (`useIsWaiting`: the add button and the checkboxes are
// disabled while the server answers); a "Store ready" line the tests wait for; the elements the
// tests use have a `data-testid`; and `AppStyles.css` is imported by the root layout.
//
// On the server, the hooks render the server state of the slice (the todos of the file),
// `useIsStoreReady` renders `true`, and the status hooks render "nothing in progress", so the
// HTML shows the list, with the buttons enabled, and no spinner.

const subscribeToNothing = () => () => {};

export function TodoApp() {
  return (
    <div className='appContentStyle'>
      <ReadyLine/>
      <h1 className='h1Style'>Todo List</h1>
      <TodoInput/>
      <TodoList/>
      <div className='bottomFixedDiv'>
        <FilterButton/>
        <AddRandomTodoButton/>
        <RemoveAllButton/>
      </div>
    </div>
  );
}

/** "Store ready: yes" once the page has hydrated and the persistor read localStorage. */
function ReadyLine() {
  // False on the server and while hydrating, true after: the standard way to tell whether the
  // page has hydrated.
  const hydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);

  // On the server and while hydrating, `true`. After hydration, `false` until the persistor
  // read localStorage (the buttons are disabled meanwhile), and then `true`.
  const isReady = useIsStoreReady();

  return (
    <p style={{ textAlign: 'center', color: '#888', fontSize: 14, margin: 0 }}>
      Store ready: <span data-testid="ready">{hydrated && isReady ? 'yes' : 'no'}</span>
    </p>
  );
}

function TodoInput() {

  const [inputText, setInputText] = useState<string>('');

  const store = useStore();
  const isFailed = useIsFailed(AddTodoAction);
  const errorText = useExceptionFor(AddTodoAction)?.errorText ?? '';
  const clearExceptionFor = useClearExceptionFor();

  // The add goes to the server: the button shows a spinner meanwhile.
  const isAdding = useIsWaiting(AddTodoAction);

  // Actions can't be dispatched before the store loaded the persisted state.
  const isReady = useIsStoreReady();

  async function sendInputToStore(text: string) {
    if (!isReady || isAdding) return;
    const status = await store.dispatchAndWait(new AddTodoAction(text))
    if (status.isCompletedOk) setInputText(''); // If added, clean the text from the TextField.
  }

  return (
    <div className='inputWrapper'>

      <TextField className='inputField'
                 slotProps={{
                   htmlInput: {
                     style: {paddingTop: 0, paddingBottom: 0, height: 55},
                     'data-testid': 'todo-input',
                   }
                 }}
                 error={isFailed}
                 helperText={isFailed ? errorText : ""}
                 value={inputText}
                 onChange={(e) => {
                   const capitalizedText = e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1);
                   setInputText(capitalizedText);
                   clearExceptionFor(AddTodoAction);
                 }}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') sendInputToStore(inputText);
                 }}
      />
      <Button style={{height: 55, minWidth: 80}} variant="contained" color="primary"
              disabled={!isReady || isAdding}
              data-testid="add-button"
              onClick={() => sendInputToStore(inputText)}>
        {isAdding ? <CircularProgress size={24} color='inherit'/> : 'Add'}
      </Button>
    </div>
  );
}

function NoTodosWarning() {

  // Getting the whole store state with `useAllState()` works,
  // but the component will rebuild whenever the state changes.
  const filter = useAllState<State>().filter;

  // Using `useSelect()` is better, because the component will
  // only rebuild when the selected part of the state changes.
  const todoList = useSelect((state: State) => state.todoList);
  const count = todoList.count(filter);
  const countCompleted = todoList.count(Filter.showCompleted);
  const countActive = todoList.count(Filter.showActive);

  if (count === 0) {
    let warningText: string;
    let additionalText = '';

    if (filter === Filter.showAll) {
      warningText = 'No todos';
    } else if (filter === Filter.showActive) {
      warningText = 'No active todos';
      if (countCompleted !== 0) {
        additionalText = ` (change filter to see ${countCompleted} completed)`;
      }
    } else if (filter === Filter.showCompleted) {
      warningText = 'No completed todos';
      if (countActive !== 0) {
        additionalText = ` (change filter to see ${countActive} active)`;
      }
    } else {
      throw new Error('Invalid filter: ' + filter);
    }

    return (
      <div className='noTodosDiv' data-testid="no-todos">
        <p className='noTodosText'>{warningText}</p>&nbsp;
        {additionalText && <p className='noTodosText'>{additionalText}</p>}
      </div>
    );
  }

  return <div></div>;
}

function TodoList() {

  const filter = useSelect((state: State) => state.filter);
  const count = useSelect((state: State) => state.todoList.count(filter));
  const items: TodoItem[] = useSelect((state: State) => state.todoList.items);

  // While the store is loading the persisted state, the list is still empty. Show it's loading,
  // instead of "No todos".
  const isReady = useIsStoreReady();
  if (!isReady) return <div className='noTodosDiv' data-testid="loading"><CircularProgress/></div>;

  // No todos to show with the current filter.
  if (count === 0) return <NoTodosWarning/>;
  //
  else {
    const filterTodos = (item: TodoItem) => {
      switch (filter) {
        case Filter.showCompleted:
          return item.completed;
        case Filter.showActive:
          return !item.completed;
        case Filter.showAll:
        default:
          return true;
      }
    };

    return (
      <div className='todoListDiv' data-testid="todo-list">
        {items.filter(filterTodos).map((item, index) => (
          <TodoItemComponent key={index} item={item}/>
        ))}
      </div>
    );
  }
}

function TodoItemComponent({item}: {item: TodoItem}) {
  const store = useStore();

  // The toggle goes to the server: the checkboxes are disabled meanwhile.
  const isToggling = useIsWaiting(ToggleTodoAction);

  return <FormControlLabel
    data-testid="todo-item"
    control={
      <Checkbox
        checked={item.completed}
        disabled={isToggling}
        onChange={() => store.dispatch(new ToggleTodoAction(item))}
        color="primary"
      />
    }
    label={item.text}
  />
}

function FilterButton() {
  const store = useStore();
  const filter = useSelect((state: State) => state.filter);
  const isReady = useIsStoreReady();

  return (
    <Button style={{display: "block", width: '100%', height: '60px', marginBottom: "10px"}}
            variant="outlined"
            disabled={!isReady}
            data-testid="filter-button"
            onClick={() => {
              store.dispatch(new NextFilterAction());
            }}
    >
      {filter}
    </Button>
  );
}

function RemoveAllButton() {
  const dispatch = useDispatch();
  const isWaiting = useIsWaiting(RemoveCompletedTodosAction);
  const isReady = useIsStoreReady();

  return (
    <Button style={{
      display: "block",
      width: '100%',
      height: '60px',
      marginBottom: "10px",
      color: 'white'
    }}
            disabled={isWaiting || !isReady}
            variant="contained"
            data-testid="remove-completed-button"
            onClick={() => dispatch(new RemoveCompletedTodosAction())}
    >
      {isWaiting ? <CircularProgress size={24} color='inherit'/> : 'Remove Completed Todos'}
    </Button>
  );
}

function AddRandomTodoButton() {
  const isLoading = useIsWaiting(AddRandomTodoAction);
  const isReady = useIsStoreReady();
  const store = useStore();

  return (
    <Button style={{
      display: "block",
      width: '100%',
      height: '60px',
      marginBottom: "10px",
      color: 'white'
    }}
            variant="contained"
            disabled={!isReady}
            data-testid="add-random-button"
            onClick={() => store.dispatch(new AddRandomTodoAction())}
    >
      {isLoading ? <CircularProgress size={24} color='inherit'/> : 'Add Random Todo'}
    </Button>
  );
}
