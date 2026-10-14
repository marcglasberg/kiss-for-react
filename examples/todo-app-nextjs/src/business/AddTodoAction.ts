import { Action } from '../infra/Action';
import { UserException } from 'kiss-for-react';
import { Filter } from './Filter';
import { State } from './State';
import { TodoList } from './TodoList';
import { addTodo } from '@/app/actions';

/**
 * Adds a todo. The validation runs here first, on the client (a duplicate throws a
 * `UserException`, shown in the dialog, with no round trip); then the server action `addTodo`
 * (`app/actions.ts`) saves it on the server, and returns the server's list, which replaces
 * the one in the state. If the server refuses it (as a value, never a thrown error: see the
 * server action), that becomes a `UserException` too.
 */
export class AddTodoAction extends Action {

  constructor(readonly text: string) {
    super();
  }

  async reduce() {

    // An empty text is ignored, like the Vite app does (its `TodoList.addTodo` adds nothing).
    if (this.text.trim() === '') return null;

    if (this.state.todoList.ifExists(this.text)) {
      throw new UserException(
        `The item "${this.text}" already exists.`, {
          errorText: `Type something else other than "${this.text}"`
        });
    }

    const result = await addTodo(this.text);
    if (!result.ok) throw new UserException(result.error);

    return (state: State) => state
      .withTodos(TodoList.fromJson(result.todos))
      .withFilter(Filter.showActive, Filter.showAll);
  }
}
