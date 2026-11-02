import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { Store, UserException } from 'kiss-for-react';
import { AddTodoAction } from '../src/business/AddTodoAction';
import { Filter } from '../src/business/Filter';
import { State } from '../src/business/State';
import { TodoItem, TodoList } from '../src/business/TodoList';

reporter(new FeatureFileReporter());

const feature = new Feature('Add todo');

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

Bdd(feature)
  .scenario('The user adds a new todo to the list.')
  .given('The list has the todo "Buy milk".')
  .when('The user adds the todo "  walk the dog ".')
  .then('The todo "Walk the dog" is added to the top of the list, without the spaces, and capitalized.')
  .and('The todo is not completed.')
  .run(async () => {
    const store = createStore([new TodoItem('Buy milk')], Filter.showAll);

    await store.dispatchAndWait(new AddTodoAction('  walk the dog '));

    expect(store.state.todoList.items.map((todo) => todo.text)).toEqual(['Walk the dog', 'Buy milk']);
    expect(store.state.todoList.items[0].completed).toBe(false);
  });

Bdd(feature)
  .scenario('Adding a todo makes it visible, if the filter hides it.')
  .given('The filter is [Filter before].')
  .when('The user adds a new todo.')
  .then('The filter becomes [Filter after].')
  .example(val('Filter before', Filter.showAll), val('Filter after', Filter.showAll))
  .example(val('Filter before', Filter.showActive), val('Filter after', Filter.showActive))
  .example(val('Filter before', Filter.showCompleted), val('Filter after', Filter.showActive))
  .run(async (ctx) => {
    const store = createStore([], ctx.example.val('Filter before'));

    await store.dispatchAndWait(new AddTodoAction('Buy milk'));

    expect(store.state.todoList.count()).toBe(1);
    expect(store.state.filter).toBe(ctx.example.val('Filter after'));
  });

Bdd(feature)
  .scenario('The user cannot add a todo that is already in the list.')
  .given('The list has the todo "Buy milk".')
  .when('The user adds the todo "Buy milk" again.')
  .then('The list does not change.')
  .and('The user sees an error that says the todo already exists.')
  .run(async () => {
    const errors: UserException[] = [];
    const store = createStore([new TodoItem('Buy milk')], Filter.showAll, errors);
    const stateBefore = store.state;

    const status = await store.dispatchAndWait(new AddTodoAction('Buy milk'));

    expect(store.state).toBe(stateBefore);
    expect(status.isCompletedFailed).toBe(true);
    expect(errors.map((error) => error.message)).toEqual(['The item "Buy milk" already exists.']);
  });
