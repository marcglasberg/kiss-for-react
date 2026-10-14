import { Action } from '../infra/Action';
import { Filter } from './Filter';
import { State } from './State';
import { TodoList } from './TodoList';
import { UserException } from 'kiss-for-react';
import { removeCompletedTodos } from '@/app/actions';

/**
 * Removes all the completed todos, on the server (the server action `removeCompletedTodos`,
 * one call for all of them), and puts the server's list in the state. The button shows a
 * spinner while it runs (`useIsWaiting`).
 */
export class RemoveCompletedTodosAction extends Action {

  async reduce() {

    // If there are no completed items, do nothing.
    if (this.state.todoList.isEmpty(Filter.showCompleted)) return null;

    const result = await removeCompletedTodos();
    if (!result.ok) throw new UserException(result.error);
    return (state: State) => state.withTodos(TodoList.fromJson(result.todos));
  }
}
