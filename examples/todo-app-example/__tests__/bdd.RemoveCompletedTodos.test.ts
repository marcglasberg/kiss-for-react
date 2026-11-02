import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { Store } from 'kiss-for-react';
import { Filter } from '../src/business/Filter';
import { RemoveCompletedTodosAction } from '../src/business/RemoveCompletedTodosAction';
import { State } from '../src/business/State';
import { TodoItem, TodoList } from '../src/business/TodoList';

reporter(new FeatureFileReporter());

const feature = new Feature('Remove completed todos');

function createStore(todos: TodoItem[], filter: Filter) {
  return new Store<State>({
    initialState: new State({ todoList: new TodoList(todos), filter }),
    logger: () => {},
  });
}

Bdd(feature)
  .scenario('The user removes all the completed todos.')
  .given('The list has the completed todos "Buy milk" and "Pay the bills".')
  .and('The list has the todo "Walk the dog", which is not completed.')
  .and('The filter is [Filter].')
  .when('The user removes the completed todos.')
  .then('The list has only "Walk the dog".')
  .and('In the end, the filter is [Filter] again.')
  .example(val('Filter', Filter.showAll))
  .example(val('Filter', Filter.showActive))
  .example(val('Filter', Filter.showCompleted))
  .run(async (ctx) => {
    const walkTheDog = new TodoItem('Walk the dog');
    const store = createStore([
      new TodoItem('Buy milk', true),
      walkTheDog,
      new TodoItem('Pay the bills', true),
    ], ctx.example.val('Filter'));

    await store.dispatchAndWait(new RemoveCompletedTodosAction());

    expect(store.state.todoList.items).toEqual([walkTheDog]);
    expect(store.state.filter).toBe(ctx.example.val('Filter'));
  });

Bdd(feature)
  .scenario('While the completed todos are removed, they are visible.')
  .given('The list has the completed todo "Buy milk".')
  .and('The filter is "Showing ACTIVE", so completed todos are not visible.')
  .when('The user removes the completed todos.')
  .then('While the todos are removed, the filter is "Showing COMPLETED".')
  .and('In the end, the filter is "Showing ACTIVE" again.')
  .run(async () => {
    const store = createStore([new TodoItem('Buy milk', true)], Filter.showActive);

    // The action waits 500 milliseconds after it shows the completed todos, before it removes them.
    const promise = store.dispatchAndWait(new RemoveCompletedTodosAction());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(store.state.filter).toBe(Filter.showCompleted);

    await promise;
    expect(store.state.todoList.isEmpty()).toBe(true);
    expect(store.state.filter).toBe(Filter.showActive);
  });

Bdd(feature)
  .scenario('Removing the completed todos when there are none does nothing.')
  .given('The list has no completed todos.')
  .when('The user removes the completed todos.')
  .then('The state does not change.')
  .run(async () => {
    const store = createStore([new TodoItem('Walk the dog')], Filter.showActive);
    const stateBefore = store.state;

    await store.dispatchAndWait(new RemoveCompletedTodosAction());

    expect(store.state).toBe(stateBefore);
  });
