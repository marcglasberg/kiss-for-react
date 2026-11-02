import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { Store } from 'kiss-for-react';
import { Filter } from '../src/business/Filter';
import { NextFilterAction, SetFilterAction } from '../src/business/NextFilterAction';
import { State } from '../src/business/State';
import { TodoItem, TodoList } from '../src/business/TodoList';

reporter(new FeatureFileReporter());

const feature = new Feature('Filter');

function createStore(filter: Filter) {
  return new Store<State>({
    initialState: new State({ todoList: new TodoList([new TodoItem('Buy milk')]), filter }),
    logger: () => {},
  });
}

Bdd(feature)
  .scenario('The user changes to the next filter.')
  .given('The filter is [Filter before].')
  .when('The user changes to the next filter.')
  .then('The filter becomes [Filter after].')
  .and('The list does not change.')
  .example(val('Filter before', Filter.showActive), val('Filter after', Filter.showCompleted))
  .example(val('Filter before', Filter.showCompleted), val('Filter after', Filter.showAll))
  .example(val('Filter before', Filter.showAll), val('Filter after', Filter.showActive))
  .run(async (ctx) => {
    const store = createStore(ctx.example.val('Filter before'));
    const todoListBefore = store.state.todoList;

    await store.dispatchAndWait(new NextFilterAction());

    expect(store.state.filter).toBe(ctx.example.val('Filter after'));
    expect(store.state.todoList).toBe(todoListBefore);
  });

Bdd(feature)
  .scenario('The filter is set to a given value.')
  .given('The filter is "Showing ALL".')
  .when('The filter is set to "Showing COMPLETED".')
  .then('The filter becomes "Showing COMPLETED".')
  .run(async () => {
    const store = createStore(Filter.showAll);

    await store.dispatchAndWait(new SetFilterAction(Filter.showCompleted));

    expect(store.state.filter).toBe(Filter.showCompleted);
  });
