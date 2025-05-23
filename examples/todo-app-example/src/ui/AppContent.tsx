import { useState } from 'react';
import {
  useAllState,
  useClearExceptionFor,
  useDispatch,
  useExceptionFor,
  useIsFailed,
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
import './AppStyles.css';

export function AppContent() {
  return (
    <div className='appContentStyle'>
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

function TodoInput() {

  const [inputText, setInputText] = useState<string>('');

  const store = useStore();
  const isFailed = useIsFailed(AddTodoAction);
  const errorText = useExceptionFor(AddTodoAction)?.errorText ?? '';
  const clearExceptionFor = useClearExceptionFor();

  async function sendInputToStore(text: string) {
    const status = await store.dispatchAndWait(new AddTodoAction(text))
    if (status.isCompletedOk) setInputText(''); // If added, clean the text from the TextField.
  }

  return (
    <div className='inputWrapper'>

      <TextField className='inputField'
                 inputProps={{style: {paddingTop: 0, paddingBottom: 0, height: 55}}}
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
      <Button style={{height: 55}} variant="contained" color="primary"
              onClick={() => sendInputToStore(inputText)}>
        Add
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
    let warningText = '';
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
      <div className='noTodosDiv'>
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
      <div className='todoListDiv'>
        {items.filter(filterTodos).map((item, index) => (
          <TodoItemComponent key={index} item={item}/>
        ))}
      </div>
    );
  }
}

function TodoItemComponent({item}: {item: TodoItem}) {
  const store = useStore();

  return <FormControlLabel
    control={
      <Checkbox
        checked={item.completed}
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

  return (
    <Button style={{display: "block", width: '100%', height: '60px', marginBottom: "10px"}}
            variant="outlined"
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
  const isDisabled = useIsWaiting(RemoveCompletedTodosAction);

  return (
    <Button style={{
      display: "block",
      width: '100%',
      height: '60px',
      marginBottom: "10px",
      color: 'white'
    }}
            disabled={isDisabled}
            variant="contained"
            onClick={() => dispatch(new RemoveCompletedTodosAction())}
    >
      {isDisabled ? <CircularProgress size={24} color='inherit'/> : 'Remove Completed Todos'}
    </Button>
  );
}

function AddRandomTodoButton() {
  const isLoading = useIsWaiting(AddRandomTodoAction);
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
            onClick={() => store.dispatch(new AddRandomTodoAction())}
    >
      {isLoading ? <CircularProgress size={24} color='inherit'/> : 'Add Random Todo'}
    </Button>
  );
}


