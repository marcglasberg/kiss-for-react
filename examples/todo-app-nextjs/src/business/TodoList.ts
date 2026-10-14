import { Filter } from './Filter';

/**
 * The plain-object form of a todo: what crosses the server/client boundary (the `StoreSlice`
 * prop of the page, and the results of the server actions, are JSON), and what the server
 * keeps in its file. `TodoItem.fromJson` and `TodoList.fromJson` rebuild the class instances.
 */
export type TodoJson = { text: string; completed: boolean };

export class TodoItem {

  // Next.js minifies class names in the production build (`TodoItem` becomes something like
  // `e`), and the ClassPersistor saves the state by class name: without a stable name, the
  // saved state could not be restored, and the persistor throws a StoreException. `typeName`
  // is the name it saves the class under, whatever the minifier calls it.
  static readonly typeName = 'TodoItem';

  constructor(
    public text: string,
    public completed: boolean = false) {
  }

  static fromJson(json: TodoJson): TodoItem {
    return new TodoItem(json.text, json.completed);
  }

  toJson(): TodoJson {
    return { text: this.text, completed: this.completed };
  }

  // Returns a new item with the same text, but with the opposite completed status.
  toggleCompleted() {
    return new TodoItem(this.text, !this.completed);
  }

  showsWhenFilterIs(filter: Filter) {
    switch (filter) {
      case Filter.showCompleted:
        return this.completed;
      case Filter.showActive:
        return !this.completed;
      case Filter.showAll:
      default:
        return true;
    }
  }

  toString() {
    return `TodoItem{text=${this.text}, completed=${this.completed}}`;
  }
}

export class TodoList {

  // See the comment in TodoItem. A `typeName` is not inherited: each class needs its own.
  static readonly typeName = 'TodoList';

  static empty: TodoList = new TodoList();

  constructor(public readonly items: TodoItem[] = []) {}

  static fromJson(json: TodoJson[]): TodoList {
    return new TodoList(json.map(TodoItem.fromJson));
  }

  toJson(): TodoJson[] {
    return this.items.map(item => item.toJson());
  }

  addTodoFromText(text: string): TodoList {
    const trimmedText = text.trim();
    const capitalizedText = trimmedText.charAt(0).toUpperCase() + trimmedText.slice(1);
    return this.addTodo(new TodoItem(capitalizedText));
  }

  // If the item already exists, don't add it again.
  // Otherwise, add it to the top of the list.
  // If the text of the item is empty, don't add it.
  addTodo(newItem: TodoItem): TodoList {
    if ((newItem.text === '') || this.ifExists(newItem.text))
      return this;
    else
      return new TodoList([newItem, ...this.items]);
  }

  // Returns true if the given text is already in the list.
  ifExists(text: string): boolean {
    return this.items.some(todo => todo.text === text);
  }

  // Returns the item with the given text, or undefined if there is none.
  // The texts are unique in the list (see `addTodo`), so a text identifies an item.
  findByText(text: string): TodoItem | undefined {
    return this.items.find(todo => todo.text === text);
  }

  // Remove the given item from the list.
  removeTodo(item: TodoItem): TodoList {
    return new TodoList(this.items.filter(todo => todo !== item));
  }

  // Remove all the completed items from the list.
  removeCompletedTodos(): TodoList {
    return new TodoList(this.items.filter(todo => !todo.completed));
  }

  // Toggle the completed status of the given item.
  toggleTodo(item: TodoItem): TodoList {
    const newTodos = this.items.map(itemInList =>
      (itemInList === item) ? item.toggleCompleted() : itemInList
    );
    return new TodoList(newTodos);
  }

  // Count the number of todos that appear when the given filter is applied.
  // If no filter is given, count all todos.
  count(filter?: Filter) {
    return this.items.filter(item => item.showsWhenFilterIs(filter ?? Filter.showAll)).length;
  }

  // Returns true if there are no todos that appear when the given filter is applied.
  // If no filter is given, checks if there are no todos at all.
  isEmpty(filter?: Filter) {
    return this.count(filter) === 0;
  }

  * [Symbol.iterator]() {
    for (let i = 0; i < this.items.length; i++) {
      yield this.items[i];
    }
  }

  toString() {
    return `TodoList{${this.items.join(',')}}`;
  }
}
