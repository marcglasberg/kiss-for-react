import { TodoItem, TodoList } from './TodoList';
import { Action } from '../infra/Action';
import { State } from './State';
import { UserException } from 'kiss-for-react';
import { removeTodo } from '@/app/actions';

/** Removes a todo, on the server (the server action `removeTodo`), and puts the server's list in the state. */
export class RemoveTodoAction extends Action {

  constructor(readonly item: TodoItem) {
    super();
  }

  async reduce() {
    const result = await removeTodo(this.item.text);
    if (!result.ok) throw new UserException(result.error);
    return (state: State) => state.withTodos(TodoList.fromJson(result.todos));
  }
}
