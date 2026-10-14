import { TodoItem, TodoList } from './TodoList';
import { Action } from '../infra/Action';
import { State } from './State';
import { UserException } from 'kiss-for-react';
import { toggleTodo } from '@/app/actions';

/**
 * Toggles a todo, on the server (the server action `toggleTodo`, by text, since the texts
 * are unique), and puts the server's list in the state.
 */
export class ToggleTodoAction extends Action {

  constructor(readonly item: TodoItem) {
    super();
  }

  async reduce() {
    const result = await toggleTodo(this.item.text);
    if (!result.ok) throw new UserException(result.error);
    return (state: State) => state.withTodos(TodoList.fromJson(result.todos));
  }
}
