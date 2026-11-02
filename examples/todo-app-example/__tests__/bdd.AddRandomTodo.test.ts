import { afterEach, expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { Store, UserException } from 'kiss-for-react';
import { AddRandomTodoAction } from '../src/business/AddRandomTodoAction';
import { Filter } from '../src/business/Filter';
import { State } from '../src/business/State';
import { TodoItem, TodoList } from '../src/business/TodoList';

reporter(new FeatureFileReporter());

const feature = new Feature('Add random todo');

afterEach(() => {
  jest.restoreAllMocks();
});

function createStore(todos: TodoItem[], filter: Filter, errors: UserException[] = []) {
  return new Store<State>({
    initialState: new State({ todoList: new TodoList(todos), filter }),
    showUserException: (exception, _count, next) => {
      errors.push(exception);
      next();
    },
    logger: () => {},
  });
}

/**
 * Replaces the DummyJSON API with a fake one. Each call returns the next response of the list
 * (the last one repeats). A response is a todo text, or an HTTP status for an error.
 */
function mockTheApi(...responses: (string | { status: number })[]) {
  let call = 0;
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const response = responses[Math.min(call++, responses.length - 1)];
    return (typeof response === 'string')
      ? new Response(JSON.stringify([{ id: 1, todo: response, completed: false }]), { status: 200 })
      : new Response('', { status: response.status });
  });
}

Bdd(feature)
  .scenario('The user adds a random todo, which comes from the DummyJSON API.')
  .given('The list has the todo "Buy milk".')
  .and('The filter is "Showing COMPLETED".')
  .and('The DummyJSON API returns the todo "Play cricket".')
  .when('The user adds a random todo.')
  .then('The todo "Play cricket" is added to the top of the list.')
  .and('The filter becomes "Showing ACTIVE", so the new todo is visible.')
  .run(async () => {
    const fetch = mockTheApi('Play cricket');
    const store = createStore([new TodoItem('Buy milk')], Filter.showCompleted);

    await store.dispatchAndWait(new AddRandomTodoAction());

    expect(fetch).toHaveBeenCalledWith('https://dummyjson.com/todos/random/1');
    expect(store.state.todoList.items.map((todo) => todo.text)).toEqual(['Play cricket', 'Buy milk']);
    expect(store.state.filter).toBe(Filter.showActive);
  });

Bdd(feature)
  .scenario('When the API returns a todo that is already in the list, it asks the API for another one.')
  .given('The list has the todo "Buy milk".')
  .and('The DummyJSON API returns "Buy milk" first, and "Play cricket" after that.')
  .when('The user adds a random todo.')
  .then('The todo "Play cricket" is added to the list.')
  .and('The API was called two times.')
  .run(async () => {
    const fetch = mockTheApi('Buy milk', 'Play cricket');
    const store = createStore([new TodoItem('Buy milk')], Filter.showAll);

    await store.dispatchAndWait(new AddRandomTodoAction());

    expect(store.state.todoList.items.map((todo) => todo.text)).toEqual(['Play cricket', 'Buy milk']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

Bdd(feature)
  .scenario('When the API only returns todos that are already in the list, it gives up after 10 tries.')
  .given('The list has the todo "Buy milk".')
  .and('The DummyJSON API always returns "Buy milk".')
  .when('The user adds a random todo.')
  .then('The list does not change.')
  .and('The API was called 10 times.')
  .and('The user sees an error that says no new todo was found.')
  .run(async () => {
    const fetch = mockTheApi('Buy milk');
    const errors: UserException[] = [];
    const store = createStore([new TodoItem('Buy milk')], Filter.showAll, errors);
    const stateBefore = store.state;

    await store.dispatchAndWait(new AddRandomTodoAction());

    expect(store.state).toBe(stateBefore);
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(errors.map((error) => error.message))
      .toEqual(['Could not find a random todo that is not in the list yet.']);
  });

Bdd(feature)
  .scenario('When the API fails, the user sees an error.')
  .given('The list has the todo "Buy milk".')
  .and('The DummyJSON API fails with the HTTP status 500.')
  .when('The user adds a random todo.')
  .then('The list does not change.')
  .and('The user sees an error that says the connection to the API failed.')
  .run(async () => {
    mockTheApi({ status: 500 });
    const errors: UserException[] = [];
    const store = createStore([new TodoItem('Buy milk')], Filter.showAll, errors);
    const stateBefore = store.state;

    const status = await store.dispatchAndWait(new AddRandomTodoAction());

    expect(store.state).toBe(stateBefore);
    expect(status.isCompletedFailed).toBe(true);
    expect(errors.map((error) => error.message)).toEqual(['Failed to connect to the DummyJSON API.']);
  });

Bdd(feature)
  .scenario('When the API returns no todo, the user sees an error.')
  .given('The list has the todo "Buy milk".')
  .and('The DummyJSON API returns an empty todo.')
  .when('The user adds a random todo.')
  .then('The list does not change.')
  .and('The user sees an error that says no todo was received from the API.')
  .run(async () => {
    mockTheApi('');
    const errors: UserException[] = [];
    const store = createStore([new TodoItem('Buy milk')], Filter.showAll, errors);
    const stateBefore = store.state;

    await store.dispatchAndWait(new AddRandomTodoAction());

    expect(store.state).toBe(stateBefore);
    expect(errors.map((error) => error.message)).toEqual(['Failed to get a todo from the DummyJSON API.']);
  });
