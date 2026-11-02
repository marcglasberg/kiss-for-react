import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { Store } from 'kiss-for-react';
import { Filter } from '../src/business/Filter';
import { RemoveTodoAction } from '../src/business/RemoveTodoAction';
import { State } from '../src/business/State';
import { ToggleTodoAction } from '../src/business/ToggleTodoAction';
import { TodoItem, TodoList } from '../src/business/TodoList';

reporter(new FeatureFileReporter());

const feature = new Feature('Toggle and remove todos');

function createStore(todos: TodoItem[]) {
  return new Store<State>({
    initialState: new State({ todoList: new TodoList(todos), filter: Filter.showAll }),
    logger: () => {},
  });
}

Bdd(feature)
  .scenario('The user marks a todo as completed, or as not completed.')
  .given('The list has the todos "Buy milk" and "Walk the dog".')
  .and('"Buy milk" is [Completed before].')
  .when('The user toggles "Buy milk".')
  .then('"Buy milk" becomes [Completed after].')
  .and('"Walk the dog" does not change, and the order of the list does not change.')
  .example(val('Completed before', 'not completed'), val('Completed after', 'completed'))
  .example(val('Completed before', 'completed'), val('Completed after', 'not completed'))
  .run(async (ctx) => {
    const buyMilk = new TodoItem('Buy milk', ctx.example.val('Completed before') === 'completed');
    const walkTheDog = new TodoItem('Walk the dog');
    const store = createStore([buyMilk, walkTheDog]);

    await store.dispatchAndWait(new ToggleTodoAction(buyMilk));

    const [first, second] = store.state.todoList.items;
    expect(first.text).toBe('Buy milk');
    expect(first.completed).toBe(ctx.example.val('Completed after') === 'completed');
    expect(second).toBe(walkTheDog);
    expect(second.completed).toBe(false);
  });

Bdd(feature)
  .scenario('The user removes a todo from the list.')
  .given('The list has the todos "Buy milk" and "Walk the dog".')
  .when('The user removes "Buy milk".')
  .then('The list has only "Walk the dog".')
  .run(async () => {
    const buyMilk = new TodoItem('Buy milk');
    const walkTheDog = new TodoItem('Walk the dog');
    const store = createStore([buyMilk, walkTheDog]);

    await store.dispatchAndWait(new RemoveTodoAction(buyMilk));

    expect(store.state.todoList.items).toEqual([walkTheDog]);
  });
