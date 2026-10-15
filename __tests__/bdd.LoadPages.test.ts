import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, LoadPages, PageDirection, Pages, PagesToLoad, Store, StoreException, UserException } from '../src';
import { Deferred, flushMicrotasks } from './fixtures/deferred';

reporter(new FeatureFileReporter());

const feature = new Feature('Paged (infinite) loading, with LoadPages');

class State {
  constructor(
    readonly todos: Pages<number[], number> | null = null,
    readonly lists: Readonly<Record<string, Pages<number[], number> | null>> = {},
  ) {}

  copy(changes: { todos?: Pages<number[], number> | null, lists?: Record<string, Pages<number[], number> | null> }) {
    return new State(changes.todos === undefined ? this.todos : changes.todos, changes.lists ?? this.lists);
  }
}

type Request = { param: number, direction: PageDirection, deferred: Deferred<number[]> };

/**
 * A fake server with items `1..count`, served in pages of `pageSize` items. A page is asked by
 * cursor (the items after the given id) or by page number. When `manual` is true, the requests
 * stay pending until the test resolves them with `resolve(i)`.
 */
class Server {
  items: number[];
  pageSize = 3;
  manual = false;
  failNext = false;
  readonly requests: Request[] = [];
  readonly log: string[] = [];

  constructor(count: number) {
    this.items = Array.from({ length: count }, (_, i) => i + 1);
  }

  after(cursor: number): number[] {
    return this.items.filter(item => item > cursor).slice(0, this.pageSize);
  }

  /** Page `n` has the items `(n - first) * pageSize + 1` onward. */
  numbered(n: number, first: number): number[] {
    const start = (n - first) * this.pageSize;
    return this.items.slice(start, start + this.pageSize);
  }

  load(param: number, direction: PageDirection, page: () => number[]): Promise<number[]> {
    this.log.push(`${direction} ${param}`);
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new UserException('Server failed.'));
    }
    if (!this.manual) return Promise.resolve(page());
    const deferred = new Deferred<number[]>();
    this.requests.push({ param, direction, deferred });
    return deferred.promise;
  }

  /** Resolves the pending request `i`, with the page it asked for. */
  resolve(i: number, byNumber: { first: number } | null = null): void {
    const request = this.requests[i];
    request.deferred.resolve(byNumber ? this.numbered(request.param, byNumber.first) : this.after(request.param));
  }
}

/** Loads todos by cursor: the page param is the id of the last item of the previous page. */
class LoadTodos extends LoadPages<State, number[], number> {
  constructor(readonly server: Server, which: PagesToLoad = 'refresh') { super(which); }

  getPagesFromState(state: State) { return state.todos; }
  applyPagesToState(state: State, todos: Pages<number[], number>) { return state.copy({ todos }); }
  initialPageParam() { return 0; }
  loadPage(cursor: number, direction: PageDirection) { return this.server.load(cursor, direction, () => this.server.after(cursor)); }

  nextPageParam(lastPage: number[]) {
    return lastPage.length < this.server.pageSize ? null : lastPage[lastPage.length - 1];
  }
}

/** Loads todos by page number, in both directions, starting at `startPage`. */
class LoadByNumber extends LoadPages<State, number[], number> {
  constructor(
    readonly server: Server,
    readonly startPage: number,
    which: PagesToLoad = 'refresh',
    readonly firstPageNumber: number = 1,
  ) { super(which); }

  getPagesFromState(state: State) { return state.todos; }
  applyPagesToState(state: State, todos: Pages<number[], number>) { return state.copy({ todos }); }
  initialPageParam() { return this.startPage; }

  loadPage(n: number, direction: PageDirection) {
    return this.server.load(n, direction, () => this.server.numbered(n, this.firstPageNumber));
  }

  nextPageParam(lastPage: number[], _all: readonly number[][], lastPageParam: number) {
    return lastPage.length < this.server.pageSize ? null : lastPageParam + 1;
  }

  previousPageParam(_firstPage: number[], _all: readonly number[][], firstPageParam: number) {
    return firstPageParam > this.firstPageNumber ? firstPageParam - 1 : null;
  }
}

/** Loads one list per `listId`, all with the same class. */
class LoadList extends LoadTodos {
  constructor(server: Server, readonly listId: string, which: PagesToLoad = 'refresh') { super(server, which); }

  pagesKeyParams() { return this.listId; }
  getPagesFromState(state: State) { return state.lists[this.listId]; }

  applyPagesToState(state: State, pages: Pages<number[], number>) {
    return state.copy({ lists: { ...state.lists, [this.listId]: pages } });
  }
}

/** Removes an item from the loaded todos. */
class RemoveTodo extends KissAction<State> {
  constructor(readonly item: number) { super(); }

  reduce() {
    const todos = this.state.todos!;
    return this.state.copy({ todos: todos.copy({ pages: todos.pages.map(page => page.filter(i => i !== this.item)) }) });
  }
}

function createStore(initialState = new State()) {
  return new Store<State>({ initialState, logger: () => {}, showUserException: () => {} });
}

/** The items of all the pages, flattened. */
const items = (pages: Pages<number[], number> | null) => pages!.pages.flat();

// ---------------------------------------------------------------------------------------------
// Loading the pages

Bdd(feature)
  .scenario('Dispatching the action with no argument, when nothing was loaded yet, loads the first page.')
  .given('A state where the pages were never loaded (null).')
  .and('A server with 10 items, in pages of 3.')
  .when('The action is dispatched with no argument (which is "refresh").')
  .then('The state has one page, with the first 3 items, loaded with the initial page param.')
  .and('The page param of that page is the initial one.')
  .and('There is a next page, but no previous page (the action has no `previousPageParam`).')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();

    await store.dispatchAndWait(new LoadTodos(server));

    expect(store.state.todos!.pages).toEqual([[1, 2, 3]]);
    expect(store.state.todos!.pageParams).toEqual([0]);
    expect(store.state.todos!.hasNextPage).toBe(true);
    expect(store.state.todos!.hasPreviousPage).toBe(false);
    expect(server.log).toEqual(['forward 0']);
  });

Bdd(feature)
  .scenario('"next" loads the page after the last one, and adds it to the end, keeping the pages already loaded.')
  .given('A server with 10 items, in pages of 3, and the first page loaded.')
  .when('"next" is dispatched three times.')
  .then('After each one, the state has one more page, and all the items loaded so far.')
  .and('Each page was asked with the id of the last item of the page before it.')
  .and('After the last page (which has less than 3 items), there is no next page.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));

    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    expect(items(store.state.todos)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(store.state.todos!.pageParams).toEqual([0, 3]);
    expect(store.state.todos!.hasNextPage).toBe(true);

    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    expect(items(store.state.todos)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(store.state.todos!.hasNextPage).toBe(true);

    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    expect(store.state.todos!.pages).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
    expect(store.state.todos!.pageParams).toEqual([0, 3, 6, 9]);
    expect(store.state.todos!.hasNextPage).toBe(false);
    expect(server.log).toEqual(['forward 0', 'forward 3', 'forward 6', 'forward 9']);
  });

Bdd(feature)
  .scenario('"next" does nothing when there is no next page.')
  .given('All the pages loaded, so there is no next page.')
  .when('"next" is dispatched.')
  .then('The dispatch is aborted: nothing is asked to the server, and the state does not change.')
  .run(async (_) => {
    const server = new Server(4);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    expect(store.state.todos!.hasNextPage).toBe(false);
    const stateBefore = store.state;
    const logBefore = [...server.log];

    const status = await store.dispatchAndWait(new LoadTodos(server, 'next'));

    expect(status.isDispatchAborted).toBe(true);
    expect(store.state).toBe(stateBefore);
    expect(server.log).toEqual(logBefore);
  });

Bdd(feature)
  .scenario('"next" and "previous" load the first page when nothing was loaded yet.')
  .given('A state where the pages were never loaded.')
  .when('"next" is dispatched.')
  .then('The first page is loaded.')
  .and('When the pages are emptied, and "previous" is dispatched.')
  .and('Then the first page is loaded again.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();

    await store.dispatchAndWait(new LoadByNumber(server, 1, 'next'));
    expect(store.state.todos!.pages).toEqual([[1, 2, 3]]);
    expect(store.state.todos!.pageParams).toEqual([1]);

    store.dispatch(new (class extends KissAction<State> {
      reduce() { return this.state.copy({ todos: Pages.empty() }); }
    })());
    await store.dispatchAndWait(new LoadByNumber(server, 1, 'previous'));
    expect(store.state.todos!.pages).toEqual([[1, 2, 3]]);
    expect(server.log).toEqual(['forward 1', 'forward 1']);
  });

Bdd(feature)
  .scenario('"first" loads the first page again, and throws away the other pages.')
  .given('Three pages loaded.')
  .when('"first" is dispatched.')
  .then('Only the first page is asked to the server, with the initial page param.')
  .and('The state has only that page, and there is a next page.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    expect(store.state.todos!.pages.length).toBe(3);
    server.log.length = 0;

    await store.dispatchAndWait(new LoadTodos(server, 'first'));

    expect(server.log).toEqual(['forward 0']);
    expect(store.state.todos!.pages).toEqual([[1, 2, 3]]);
    expect(store.state.todos!.pageParams).toEqual([0]);
    expect(store.state.todos!.hasNextPage).toBe(true);
  });

Bdd(feature)
  .scenario('"refresh" loads again all the loaded pages, one after the other from the first, and changes the state once, at the end.')
  .given('Three pages loaded (items 1 to 9), and a server that answers when the test says so.')
  .and('Item 2 was deleted in the server.')
  .when('"refresh" is dispatched.')
  .then('Only the first page is asked, with the page param of the first page.')
  .and('When it arrives, the second page is asked with the id of its new last item (4, not 3).')
  .and('The state does not change until the last page arrives.')
  .and('Then the state has the three new pages, with their new page params.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    const stateBefore = store.state;
    server.items = server.items.filter(item => item !== 2);
    server.manual = true;
    server.log.length = 0;

    const promise = store.dispatchAndWait(new LoadTodos(server, 'refresh'));
    await flushMicrotasks();
    expect(server.log).toEqual(['forward 0']);

    server.resolve(0);
    await flushMicrotasks();
    expect(server.log).toEqual(['forward 0', 'forward 4']);
    expect(store.state).toBe(stateBefore);

    server.resolve(1);
    await flushMicrotasks();
    expect(server.log).toEqual(['forward 0', 'forward 4', 'forward 7']);
    expect(store.state).toBe(stateBefore);

    server.resolve(2);
    await promise;
    expect(store.state.todos!.pages).toEqual([[1, 3, 4], [5, 6, 7], [8, 9, 10]]);
    expect(store.state.todos!.pageParams).toEqual([0, 4, 7]);
    expect(store.state.todos!.hasNextPage).toBe(true);
  });

Bdd(feature)
  .scenario('"refresh" stops early when the server has fewer pages than before.')
  .given('Three pages loaded (items 1 to 9).')
  .and('The server now has only 4 items.')
  .when('"refresh" is dispatched.')
  .then('Only two pages are asked, since the second one is the last.')
  .and('The state has two pages, and no next page.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    server.items = [1, 2, 3, 4];
    server.log.length = 0;

    await store.dispatchAndWait(new LoadTodos(server, 'refresh'));

    expect(server.log).toEqual(['forward 0', 'forward 3']);
    expect(store.state.todos!.pages).toEqual([[1, 2, 3], [4]]);
    expect(store.state.todos!.pageParams).toEqual([0, 3]);
    expect(store.state.todos!.hasNextPage).toBe(false);
  });

Bdd(feature)
  .scenario('"refresh" loads the first page when nothing was loaded yet.')
  .given('A state with empty pages.')
  .when('"refresh" is dispatched.')
  .then('The first page is loaded.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore(new State(Pages.empty()));

    await store.dispatchAndWait(new LoadTodos(server, 'refresh'));

    expect(store.state.todos!.pages).toEqual([[1, 2, 3]]);
    expect(server.log).toEqual(['forward 0']);
  });

// ---------------------------------------------------------------------------------------------
// Previous pages, and maxPages

Bdd(feature)
  .scenario('"previous" loads the page before the first one, and adds it to the start.')
  .given('An action that loads by page number, in both directions, and page 3 loaded.')
  .when('"previous" is dispatched twice.')
  .then('Pages 2 and 1 are added to the start, asked backward.')
  .and('There is a previous page until page 1 is loaded.')
  .and('When "previous" is dispatched once more.')
  .and('Then the dispatch is aborted, since there is no previous page.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadByNumber(server, 3));
    expect(store.state.todos!.pages).toEqual([[7, 8, 9]]);
    expect(store.state.todos!.hasPreviousPage).toBe(true);

    await store.dispatchAndWait(new LoadByNumber(server, 3, 'previous'));
    expect(store.state.todos!.pages).toEqual([[4, 5, 6], [7, 8, 9]]);
    expect(store.state.todos!.pageParams).toEqual([2, 3]);
    expect(store.state.todos!.hasPreviousPage).toBe(true);

    await store.dispatchAndWait(new LoadByNumber(server, 3, 'previous'));
    expect(store.state.todos!.pages).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    expect(store.state.todos!.pageParams).toEqual([1, 2, 3]);
    expect(store.state.todos!.hasPreviousPage).toBe(false);
    expect(store.state.todos!.hasNextPage).toBe(true);
    expect(server.log).toEqual(['forward 3', 'backward 2', 'backward 1']);

    const status = await store.dispatchAndWait(new LoadByNumber(server, 3, 'previous'));
    expect(status.isDispatchAborted).toBe(true);
    expect(server.log.length).toBe(3);
  });

Bdd(feature)
  .scenario('Without `previousPageParam`, there is never a previous page, and "previous" does nothing.')
  .given('An action that does not implement `previousPageParam`, and the second page loaded.')
  .when('"previous" is dispatched.')
  .then('There is no previous page, and the dispatch is aborted.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    expect(store.state.todos!.hasPreviousPage).toBe(false);

    const status = await store.dispatchAndWait(new LoadTodos(server, 'previous'));

    expect(status.isDispatchAborted).toBe(true);
    expect(server.log).toEqual(['forward 0', 'forward 3']);
  });

Bdd(feature)
  .scenario('A page param of 0 is a valid page param. Only null and undefined mean there is no page.')
  .given('An action whose pages are numbered from 0, with page 1 loaded.')
  .when('"previous" is dispatched.')
  .then('Page 0 is loaded, and there is no previous page after it.')
  .and('When "refresh" is dispatched.')
  .and('Then the pages are loaded again from page 0.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadByNumber(server, 1, 'refresh', 0));
    expect(store.state.todos!.pages).toEqual([[4, 5, 6]]);
    expect(store.state.todos!.hasPreviousPage).toBe(true);

    await store.dispatchAndWait(new LoadByNumber(server, 1, 'previous', 0));
    expect(store.state.todos!.pages).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(store.state.todos!.pageParams).toEqual([0, 1]);
    expect(store.state.todos!.hasPreviousPage).toBe(false);

    server.log.length = 0;
    await store.dispatchAndWait(new LoadByNumber(server, 1, 'refresh', 0));
    expect(server.log).toEqual(['forward 0', 'forward 1']);
    expect(store.state.todos!.pageParams).toEqual([0, 1]);
  });

Bdd(feature)
  .scenario('With `maxPages`, adding a page past the limit drops the page at the other end.')
  .given('An action with `maxPages = 2`, that loads by page number, and page 1 loaded.')
  .when('"next" is dispatched twice.')
  .then('The state has pages 2 and 3 only: page 1 was dropped.')
  .and('There is now a previous page.')
  .and('When "previous" is dispatched.')
  .and('Then the state has pages 1 and 2: page 3 was dropped.')
  .and('When "refresh" is dispatched.')
  .and('Then only the two kept pages are loaded again, from the first one kept.')
  .run(async (_) => {
    class LoadLimited extends LoadByNumber {
      maxPages = 2;
    }

    const server = new Server(12);
    const store = createStore();
    await store.dispatchAndWait(new LoadLimited(server, 1));
    await store.dispatchAndWait(new LoadLimited(server, 1, 'next'));
    expect(store.state.todos!.pageParams).toEqual([1, 2]);

    await store.dispatchAndWait(new LoadLimited(server, 1, 'next'));
    expect(store.state.todos!.pages).toEqual([[4, 5, 6], [7, 8, 9]]);
    expect(store.state.todos!.pageParams).toEqual([2, 3]);
    expect(store.state.todos!.hasPreviousPage).toBe(true);
    expect(store.state.todos!.hasNextPage).toBe(true);

    await store.dispatchAndWait(new LoadLimited(server, 1, 'previous'));
    expect(store.state.todos!.pages).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(store.state.todos!.pageParams).toEqual([1, 2]);
    expect(store.state.todos!.hasPreviousPage).toBe(false);

    server.log.length = 0;
    await store.dispatchAndWait(new LoadLimited(server, 1, 'refresh'));
    expect(server.log).toEqual(['forward 1', 'forward 2']);
    expect(store.state.todos!.pageParams).toEqual([1, 2]);
  });

// ---------------------------------------------------------------------------------------------
// One load per list at a time

Bdd(feature)
  .scenario('A "next" dispatched while a load of the same list is running is aborted, so two quick taps load one page.')
  .given('The first page loaded, and a server that answers when the test says so.')
  .when('"next" is dispatched, and then "next" again, while the first one is still running.')
  .then('The second dispatch is aborted, and only one page is asked to the server.')
  .and('While the first "next" runs, `isWaiting` is true for the action, with or without the statusKey.')
  .and('When the server answers, the state has two pages.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));
    server.manual = true;
    server.log.length = 0;

    const first = store.dispatchAndWait(new LoadTodos(server, 'next'));
    const second = await store.dispatchAndWait(new LoadTodos(server, 'next'));

    expect(second.isDispatchAborted).toBe(true);
    expect(server.log).toEqual(['forward 3']);
    expect(store.isWaiting(LoadTodos)).toBe(true);
    expect(store.isWaiting(LoadTodos, { statusKey: null })).toBe(true);

    server.resolve(0);
    await first;
    expect(store.isWaiting(LoadTodos)).toBe(false);
    expect(store.state.todos!.pages).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

Bdd(feature)
  .scenario('A "first" dispatched while a "next" is running aborts the "next": its result is ignored, even if it arrives later.')
  .given('The first page loaded, and a server that answers when the test says so.')
  .when('"next" is dispatched, and then "first" while it runs.')
  .then('The "next" action is aborted, and its abortSignal is aborted (so a fetch would be cancelled).')
  .and('When the server answers the "first" request, and only then the "next" request.')
  .and('Then the state has only the first page: the late "next" page was ignored.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));
    server.manual = true;
    server.log.length = 0;

    const next = new LoadTodos(server, 'next');
    const nextPromise = store.dispatchAndWait(next);
    const firstPromise = store.dispatchAndWait(new LoadTodos(server, 'first'));
    expect(next.isAborted).toBe(true);
    expect(next.abortSignal.aborted).toBe(true);
    expect(server.log).toEqual(['forward 3', 'forward 0']);

    server.resolve(1); // The "first".
    await firstPromise;
    expect(store.state.todos!.pages).toEqual([[1, 2, 3]]);

    server.resolve(0); // The late "next".
    const nextStatus = await nextPromise;
    expect(nextStatus.isDispatchAborted).toBe(true);
    expect(store.state.todos!.pages).toEqual([[1, 2, 3]]);
  });

Bdd(feature)
  .scenario('A "refresh" dispatched while a "next" is running aborts the "next", and a "next" dispatched meanwhile is aborted too.')
  .given('Two pages loaded, and a server that answers when the test says so.')
  .when('"next" is dispatched, then "refresh" while it runs, then "next" again.')
  .then('The first "next" is aborted by the "refresh", and the second "next" is aborted because the "refresh" is running.')
  .and('When the refresh finishes, the state has the two pages, loaded again.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    server.manual = true;
    server.log.length = 0;

    const next = new LoadTodos(server, 'next');
    const nextPromise = store.dispatchAndWait(next);
    const refreshPromise = store.dispatchAndWait(new LoadTodos(server, 'refresh'));
    expect(next.isAborted).toBe(true);
    const secondNext = await store.dispatchAndWait(new LoadTodos(server, 'next'));
    expect(secondNext.isDispatchAborted).toBe(true);

    server.resolve(0); // The aborted "next".
    expect((await nextPromise).isDispatchAborted).toBe(true);
    server.resolve(1); // Page 1 of the refresh.
    await flushMicrotasks();
    server.resolve(2); // Page 2 of the refresh.
    await refreshPromise;

    expect(server.log).toEqual(['forward 6', 'forward 0', 'forward 3']);
    expect(store.state.todos!.pages).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

Bdd(feature)
  .scenario('A "refresh" that is aborted stops loading the remaining pages.')
  .given('Three pages loaded, and a server that answers when the test says so.')
  .when('"refresh" is dispatched, and the action is aborted with `store.abort` while the first page loads.')
  .and('The server answers the first page.')
  .then('The other pages are not asked, and the state does not change.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    const stateBefore = store.state;
    server.manual = true;
    server.log.length = 0;

    const promise = store.dispatchAndWait(new LoadTodos(server, 'refresh'));
    store.abort(LoadTodos);
    server.resolve(0);
    const status = await promise;

    expect(status.isDispatchAborted).toBe(true);
    expect(server.log).toEqual(['forward 0']);
    expect(store.state).toBe(stateBefore);
  });

Bdd(feature)
  .scenario('An item removed from the pages while a "next" is loading stays removed when the page arrives.')
  .given('The first page loaded, and a "next" running.')
  .when('Another action removes item 2 from the pages.')
  .and('The next page arrives.')
  .then('The state has the first page without item 2, followed by the new page.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));
    server.manual = true;

    const promise = store.dispatchAndWait(new LoadTodos(server, 'next'));
    store.dispatch(new RemoveTodo(2));
    expect(store.state.todos!.pages).toEqual([[1, 3]]);

    server.resolve(0);
    await promise;
    expect(store.state.todos!.pages).toEqual([[1, 3], [4, 5, 6]]);
    expect(store.state.todos!.pageParams).toEqual([0, 3]);
  });

// ---------------------------------------------------------------------------------------------
// Several lists

Bdd(feature)
  .scenario('Loads of different lists (different `pagesKeyParams`) do not affect each other, and the statusKey tells which list is loading.')
  .given('One action class that loads a list per id, with the first page of lists "a" and "b" loaded.')
  .and('A server that answers when the test says so.')
  .when('"next" is dispatched for "a", and then for "b".')
  .then('Both run (the second is not aborted), and `isWaiting` with the statusKey is true for "a" and "b", but not for "c".')
  .and('When the server answers the request of "a".')
  .and('Then list "a" has two pages, list "b" still has one, and only "b" is still loading.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadList(server, 'a'));
    await store.dispatchAndWait(new LoadList(server, 'b'));
    server.manual = true;

    const promiseA = store.dispatchAndWait(new LoadList(server, 'a', 'next'));
    const promiseB = store.dispatchAndWait(new LoadList(server, 'b', 'next'));
    await flushMicrotasks();
    expect(server.requests.length).toBe(2);
    expect(store.isWaiting(LoadList, { statusKey: 'a' })).toBe(true);
    expect(store.isWaiting(LoadList, { statusKey: 'b' })).toBe(true);
    expect(store.isWaiting(LoadList, { statusKey: 'c' })).toBe(false);

    server.resolve(0);
    await promiseA;
    expect(items(store.state.lists['a'])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(items(store.state.lists['b'])).toEqual([1, 2, 3]);
    expect(store.isWaiting(LoadList, { statusKey: 'a' })).toBe(false);
    expect(store.isWaiting(LoadList, { statusKey: 'b' })).toBe(true);

    server.resolve(1);
    await promiseB;
    expect(items(store.state.lists['b'])).toEqual([1, 2, 3, 4, 5, 6]);
  });

Bdd(feature)
  .scenario('A "first" of one list does not abort the loads of another list.')
  .given('Lists "a" and "b" loaded, and a "next" of "b" running.')
  .when('"first" is dispatched for "a".')
  .then('The "next" of "b" is not aborted, and both finish normally.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadList(server, 'a'));
    await store.dispatchAndWait(new LoadList(server, 'b'));
    server.manual = true;

    const nextB = new LoadList(server, 'b', 'next');
    const promiseB = store.dispatchAndWait(nextB);
    const promiseA = store.dispatchAndWait(new LoadList(server, 'a', 'first'));
    expect(nextB.isAborted).toBe(false);

    server.resolve(0);
    server.resolve(1);
    await Promise.all([promiseA, promiseB]);
    expect(items(store.state.lists['b'])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(items(store.state.lists['a'])).toEqual([1, 2, 3]);
  });

// ---------------------------------------------------------------------------------------------
// Errors and misconfiguration

Bdd(feature)
  .scenario('If loading a page fails, the action fails and the state does not change.')
  .given('Three pages loaded.')
  .when('"refresh" is dispatched, and the server fails on the second page.')
  .then('The action fails with the error, and the state keeps the three old pages.')
  .and('`isFailed` is true for the action.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadTodos(server, 'first'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    await store.dispatchAndWait(new LoadTodos(server, 'next'));
    const stateBefore = store.state;
    server.manual = true;

    const promise = store.dispatchAndWait(new LoadTodos(server, 'refresh'));
    await flushMicrotasks();
    server.failNext = true;
    server.resolve(0);
    const status = await promise;

    expect(status.isCompletedFailed).toBe(true);
    expect(status.originalError).toBeInstanceOf(UserException);
    expect(store.state).toBe(stateBefore);
    expect(store.isFailed(LoadTodos)).toBe(true);
  });

Bdd(feature)
  .scenario('LoadPages cannot be combined with `nonReentrant` or `ignoreOld`, and `maxPages` must be a positive integer.')
  .given('LoadPages actions with `nonReentrant`, with `ignoreOld`, with `maxPages = 0`, and with an invalid `which`.')
  .when('Each one is dispatched.')
  .then('The dispatch throws a StoreException.')
  .run(async (_) => {
    const server = new Server(10);
    const store = createStore();

    class WithNonReentrant extends LoadTodos { nonReentrant = true; }
    class WithIgnoreOld extends LoadTodos { ignoreOld = true; }
    class WithBadMax extends LoadTodos { maxPages = 0; }

    expect(() => store.dispatch(new WithNonReentrant(server))).toThrow(StoreException);
    expect(() => store.dispatch(new WithIgnoreOld(server))).toThrow(StoreException);
    expect(() => store.dispatch(new WithBadMax(server))).toThrow(StoreException);
    expect(() => store.dispatch(new LoadTodos(server, 'all' as PagesToLoad))).toThrow(StoreException);
  });

// ---------------------------------------------------------------------------------------------
// With the other features

Bdd(feature)
  .scenario('`fresh` applies to "refresh" and "first", but "next" always runs.')
  .given('An action with `fresh = 300`, and the first page loaded.')
  .when('"refresh" is dispatched right away.')
  .then('It is aborted, since the list is fresh.')
  .and('When "next" is dispatched twice.')
  .and('Then both run, since loading more is never fresh.')
  .and('When "first" is dispatched.')
  .and('Then it is aborted, since the list is still fresh.')
  .run(async (_) => {
    class LoadFresh extends LoadTodos { fresh = 300; }

    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadFresh(server, 'refresh'));
    expect(store.state.todos!.pages.length).toBe(1);

    expect((await store.dispatchAndWait(new LoadFresh(server, 'refresh'))).isDispatchAborted).toBe(true);

    expect((await store.dispatchAndWait(new LoadFresh(server, 'next'))).isCompletedOk).toBe(true);
    expect((await store.dispatchAndWait(new LoadFresh(server, 'next'))).isCompletedOk).toBe(true);
    expect(store.state.todos!.pages.length).toBe(3);

    expect((await store.dispatchAndWait(new LoadFresh(server, 'first'))).isDispatchAborted).toBe(true);
    expect(store.state.todos!.pages.length).toBe(3);
  });

Bdd(feature)
  .scenario('`throttle` applies to "refresh" and "first", but "next" always runs.')
  .given('An action with `throttle = 300`, and the first page loaded.')
  .when('"first" is dispatched right away, and then "next".')
  .then('The "first" is aborted (throttled), but the "next" runs.')
  .run(async (_) => {
    class LoadThrottled extends LoadTodos { throttle = 300; }

    const server = new Server(10);
    const store = createStore();
    await store.dispatchAndWait(new LoadThrottled(server, 'first'));

    expect((await store.dispatchAndWait(new LoadThrottled(server, 'first'))).isDispatchAborted).toBe(true);
    expect((await store.dispatchAndWait(new LoadThrottled(server, 'next'))).isCompletedOk).toBe(true);
    expect(store.state.todos!.pages.length).toBe(2);
  });

Bdd(feature)
  .scenario('With `retry`, a load that fails is tried again.')
  .given('An action with `retry`, and a server that fails the first request.')
  .when('The action is dispatched.')
  .then('The page is asked twice, and the state has the page.')
  .run(async (_) => {
    class LoadWithRetry extends LoadTodos {
      retry = { on: true, initialDelay: 1, maxRetries: 2 };
    }

    const server = new Server(10);
    const store = createStore();
    server.failNext = true;

    const status = await store.dispatchAndWait(new LoadWithRetry(server));

    expect(status.isCompletedOk).toBe(true);
    expect(server.log).toEqual(['forward 0', 'forward 0']);
    expect(store.state.todos!.pages).toEqual([[1, 2, 3]]);
  });

// ---------------------------------------------------------------------------------------------
// The Pages value

Bdd(feature)
  .scenario('The Pages value is immutable, and can be copied with changes.')
  .given('An empty Pages, and a Pages with two pages.')
  .when('They are inspected and copied.')
  .then('The empty one has no pages and no next or previous page.')
  .and('The copy has the changed fields, and the original is not changed.')
  .run(async (_) => {
    const empty = Pages.empty<number[], number>();
    expect(empty.pages).toEqual([]);
    expect(empty.pageParams).toEqual([]);
    expect(empty.isEmpty).toBe(true);
    expect(empty.hasNextPage).toBe(false);
    expect(empty.hasPreviousPage).toBe(false);

    const pages = new Pages<number[], number>([[1, 2], [3, 4]], [0, 2], true, false);
    expect(pages.isEmpty).toBe(false);
    expect(pages.toString()).toBe('Pages(2 pages, hasNextPage: true, hasPreviousPage: false)');

    const copy = pages.copy({ pages: [[1], [3, 4]], hasNextPage: false });
    expect(copy.pages).toEqual([[1], [3, 4]]);
    expect(copy.pageParams).toEqual([0, 2]);
    expect(copy.hasNextPage).toBe(false);
    expect(copy.hasPreviousPage).toBe(false);
    expect(pages.pages).toEqual([[1, 2], [3, 4]]);
    expect(pages.hasNextPage).toBe(true);
  });
