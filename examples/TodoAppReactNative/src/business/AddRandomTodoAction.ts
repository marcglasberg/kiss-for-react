import { Action } from '../infra/Action';
import { Filter } from './Filter';
import { State } from './State';
import { UserException } from 'kiss-for-react';

/**
 * Add a random item to the list. The item is a random todo from the DummyJSON API
 * (https://dummyjson.com), like "Play cricket". If the item already exists, try again until it
 * gets a new one. If the API fails, shows an error dialog to the user.
 */
export class AddRandomTodoAction extends Action {

  async reduce() {

    let text = await this.getRandomTodoFromTheDummyJsonApi();

    return (state: State) => state
      .withTodos(state.todoList.addTodoFromText(text))
      .withFilter(Filter.showActive, Filter.showAll);
  }

  /**
   * Repeats while the item already exists in the list, up to a few times: the API has a few
   * hundred todos, so a long list could otherwise keep the button spinning for a long time.
   */
  private async getRandomTodoFromTheDummyJsonApi() {

    for (let attempt = 0; attempt < 10; attempt++) {
      // Connect with the DummyJSON API to get a random todo.
      let response = await fetch('https://dummyjson.com/todos/random/1');

      // If the connection failed, throw an exception.
      if (!response.ok) throw new UserException('Failed to connect to the DummyJSON API.');

      // The response is a list with one todo: `[{ "todo": "Play cricket", ... }]`.
      const json = await response.json() as { todo?: string }[];
      const text = json[0]?.todo;

      // If the response has no todo, throw an exception.
      if (!text) throw new UserException('Failed to get a todo from the DummyJSON API.');

      if (!this.state.todoList.ifExists(text)) return text;
    }

    throw new UserException('Could not find a random todo that is not in the list yet.');
  }
}
