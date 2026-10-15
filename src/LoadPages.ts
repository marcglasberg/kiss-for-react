import { _isSameNonReentrantKey, AsyncReducerResult, KissAction } from './KissAction';
import { Store } from './Store';
import { kissAbort, StoreException } from './StoreException';

/**
 * The pages of a list loaded page by page, to keep in the state. It's created and changed by a
 * `LoadPages` action, and it's immutable: each load puts a new `Pages` in the state.
 *
 * - `pages` are the pages loaded so far, in order. Each page is whatever `loadPage` returned
 *   (an array of items, or an object with the items and some information from the server).
 * - `pageParams` are the page params (cursors, page numbers, etc.) used to load each page.
 *   `pageParams[i]` loaded `pages[i]`.
 * - `hasNextPage` is `true` if there is a page after the last one, as told by `nextPageParam`.
 * - `hasPreviousPage` is `true` if there is a page before the first one, as told by
 *   `previousPageParam`. It's always `false` if the action doesn't implement it.
 *
 * Start with `Pages.empty()` in the initial state (or with `null`, since `getPagesFromState`
 * may return `null` when nothing was loaded yet). To show the items, flatten the pages in the
 * component: `pages.pages.flat()`, or `pages.pages.flatMap(page => page.items)`.
 *
 * To change the pages yourself (for example, to remove an item that was deleted), use `copy`
 * with the new `pages` array. Keep `pageParams` with one param per page, since a `refresh`
 * reloads the pages with them.
 *
 * If you persist the state with a `ClassPersistor`, add `Pages` to its classes.
 */
export class Pages<Page, PageParam = unknown> {

  constructor(
    readonly pages: readonly Page[] = [],
    readonly pageParams: readonly PageParam[] = [],
    readonly hasNextPage: boolean = false,
    readonly hasPreviousPage: boolean = false,
  ) {
  }

  /** No pages loaded yet. Dispatching `next`, `previous` or `refresh` then loads the first page. */
  static empty<Page, PageParam = unknown>(): Pages<Page, PageParam> {
    return new Pages<Page, PageParam>();
  }

  /** True if no page was loaded. */
  get isEmpty(): boolean {
    return this.pages.length === 0;
  }

  /** Returns a copy with the given changes. */
  copy(changes: {
    pages?: readonly Page[],
    pageParams?: readonly PageParam[],
    hasNextPage?: boolean,
    hasPreviousPage?: boolean,
  }): Pages<Page, PageParam> {
    return new Pages<Page, PageParam>(
      changes.pages ?? this.pages,
      changes.pageParams ?? this.pageParams,
      changes.hasNextPage ?? this.hasNextPage,
      changes.hasPreviousPage ?? this.hasPreviousPage,
    );
  }

  toString(): string {
    return `Pages(${this.pages.length} pages, hasNextPage: ${this.hasNextPage}, hasPreviousPage: ${this.hasPreviousPage})`;
  }
}

/**
 * Which pages a `LoadPages` action loads. See `LoadPages`.
 *
 * - `'refresh'` (the default): Loads again all the pages that are in the state, in order, from
 *   the first one. If no page was loaded yet, loads the first page.
 * - `'next'`: Loads the page after the last one, and adds it to the end.
 * - `'previous'`: Loads the page before the first one, and adds it to the start.
 * - `'first'`: Loads the first page only, and throws away the other pages.
 */
export type PagesToLoad = 'first' | 'next' | 'previous' | 'refresh';

/**
 * The direction of a page load, given to `LoadPages.loadPage`: `'forward'` for the first page,
 * a `next` page and a `refresh`; `'backward'` for a `previous` page.
 */
export type PageDirection = 'forward' | 'backward';

/**
 * Base class for actions that load a list page by page: a "load more" button, or an infinite
 * scroll. It keeps the loaded pages in the state, in a `Pages` value, and knows how to load the
 * next page, the previous page, the first page again, or all the loaded pages again.
 *
 * Your action says where the pages are in the state, what the first page param is, how to
 * load a page, and how to get the param of the next page from the last page loaded:
 *
 * ```ts
 * class LoadTodos extends LoadPages<State, Todo[], string | null> {
 *   getPagesFromState(state: State) { return state.todos; }                      // Pages<Todo[], string | null>
 *   applyPagesToState(state: State, todos: Pages<Todo[], string | null>) { return state.copy({ todos }); }
 *   initialPageParam() { return null; }                                           // The first page has no cursor.
 *   loadPage(cursor: string | null) { return api.todosAfter(cursor, 20); }        // 20 items with id > cursor.
 *   nextPageParam(lastPage: Todo[]) { return lastPage.length < 20 ? null : lastPage.at(-1)!.id; } // null = no more.
 * }
 * ```
 *
 * The page param can be anything: the id of the last item (as above), a page number, or an
 * opaque cursor from the server. If the server returns the cursor of the next page with each
 * page, make the page an object with it, like `{ items: Todo[], nextCursor: string | null }`,
 * and return `lastPage.nextCursor` from `nextPageParam`.
 *
 * Dispatch it with the pages to load (see `PagesToLoad`):
 *
 * ```ts
 * dispatch(new LoadTodos());           // Same as 'refresh'. When mounting the screen.
 * dispatch(new LoadTodos('next'));     // The "load more" button, or the end of the scroll.
 * dispatch(new LoadTodos('first'));    // Start over: a pull-to-refresh, or when a filter changes.
 * dispatch(new LoadTodos('previous')); // Only if `previousPageParam` is implemented.
 * ```
 *
 * - `'refresh'` loads again the pages that are in the state, one after the other from the
 *   first, using the param of the first page and then the params `nextPageParam` gives for
 *   each new page (so the pages stay consistent if items were added or removed). The state
 *   only changes at the end, with all the pages. It stops early if `nextPageParam` says there
 *   are no more pages. If no page was loaded yet, it loads the first page. So, it's safe to
 *   dispatch it whenever the screen is shown, or the app comes back to the foreground,
 *   together with `fresh`, to skip it when the data is recent.
 *
 * - `'next'` loads the page after the last one and adds it to the end. If there is no next
 *   page (`pages.hasNextPage` is `false`), nothing is loaded (the dispatch is aborted). If no
 *   page was loaded yet, it loads the first page.
 *
 * - `'previous'` is the same, for the page before the first one, and adds it to the start.
 *   Implement `previousPageParam` to use it. For example, a chat that starts at the newest
 *   messages and loads the older ones upward.
 *
 * - `'first'` loads the first page, with `initialPageParam()`, and throws away the other
 *   pages.
 *
 * ## In the component
 *
 * ```tsx
 * const todos = useSelect((state: State) => state.todos);  // A `Pages<Todo[], string | null>`.
 * const isLoading = useIsWaiting(LoadTodos);
 * const items = todos.pages.flat();
 * ...
 * <button disabled={!todos.hasNextPage || isLoading} onClick={() => dispatch(new LoadTodos('next'))}>
 *   {isLoading ? 'Loading...' : 'Load more'}
 * </button>
 * ```
 *
 * ## Only one load per list at a time
 *
 * While a `LoadTodos` is running, a `'next'` or `'previous'` dispatched for the same list is
 * aborted, as if it was not dispatched: two quick taps on "load more" load one page, and a
 * scroll handler can dispatch `'next'` freely. A `'first'` or `'refresh'` instead aborts the
 * loads of the same list that are running, and runs: the newest request wins. The aborted
 * action's `abortSignal` is aborted, so pass it to `fetch` in `loadPage` to cancel its request.
 *
 * ## Several lists with the same action
 *
 * If the same action class loads different lists (one per user, per tab, etc.), override
 * `pagesKeyParams()` to tell them apart. Loads of different keys don't affect each other, and
 * the key is also the `statusKey` of the action, so `useIsWaiting(LoadTodos, { statusKey })`
 * tells if that list is loading:
 *
 * ```ts
 * class LoadComments extends LoadPages<State, Comment[], number> {
 *   constructor(readonly postId: string, which: PagesToLoad = 'refresh') { super(which); }
 *   pagesKeyParams() { return this.postId; }
 *   getPagesFromState(state: State) { return state.commentsOf(this.postId); }
 *   ...
 * }
 * ```
 *
 * ## Limiting the pages in memory
 *
 * Set `maxPages` to keep at most that many pages. When a `'next'` page is added past the
 * limit, the first page is dropped (and when a `'previous'` page is added, the last one). A
 * `'refresh'` then only reloads the pages kept. Implement `previousPageParam` too, so that the
 * user can load the dropped pages again by scrolling back.
 *
 * ## With the other features
 *
 * - `fresh` and `throttle` only apply to `'first'` and `'refresh'`: a `'next'` or `'previous'`
 *   always runs, since loading more is never "the same data again" (it also starts a new fresh
 *   period). If you override `ignoreFresh` or `ignoreThrottle`, keep that: for example,
 *   `get ignoreFresh() { return this.force || super.ignoreFresh; }`.
 * - `retry`, `checkInternet` and `debounce` work as usual. With `retry`, the whole load is
 *   retried (all the pages of a `'refresh'`).
 * - It should not be combined with `nonReentrant` or `ignoreOld`, since it already decides
 *   which loads run. Dispatching it with those throws a `StoreException`.
 * - To poll a list, override `createPollingAction()` to return a `'refresh'`.
 * - Do not override `reduce`, `abortDispatch` or `statusKey`.
 */
export abstract class LoadPages<St, Page, PageParam = unknown> extends KissAction<St> {

  /**
   * Which pages to load (see `PagesToLoad`). By default, `'refresh'`: loads again the pages in
   * the state, or the first page if there are none.
   */
  readonly which: PagesToLoad;

  constructor(which: PagesToLoad = 'refresh') {
    super();
    this.which = which;
  }

  /**
   * The maximum number of pages to keep in the state. When a page is added past the limit, the
   * page at the other end is dropped. By default, there is no limit.
   */
  declare maxPages?: number;

  /**
   * Returns the `Pages` value from the given `state`. Return `null` or `undefined` if nothing
   * was loaded yet (it's the same as `Pages.empty()`).
   *
   * ```ts
   * getPagesFromState(state: State) { return state.todos; }
   * ```
   */
  protected abstract getPagesFromState(state: St): Pages<Page, PageParam> | null | undefined;

  /**
   * Returns a new state, with the given `pages` applied to the given `state`.
   *
   * ```ts
   * applyPagesToState(state: State, todos: Pages<Todo[], string | null>) { return state.copy({ todos }); }
   * ```
   */
  protected abstract applyPagesToState(state: St, pages: Pages<Page, PageParam>): St;

  /**
   * Returns the page param of the first page: `null` or `''` for a cursor, `0` or `1` for a
   * page number, etc.
   */
  protected abstract initialPageParam(): PageParam;

  /**
   * Loads and returns one page, given its `pageParam`. The `direction` is `'backward'` for a
   * `'previous'` page, and `'forward'` otherwise. Pass `this.abortSignal` to `fetch`, so that
   * the request is cancelled when a `'first'` or `'refresh'` of the same list aborts this one.
   *
   * ```ts
   * async loadPage(cursor: string | null) {
   *   const response = await fetch(`/api/todos?after=${cursor ?? ''}`, { signal: this.abortSignal });
   *   return await response.json() as Todo[];
   * }
   * ```
   */
  protected abstract loadPage(pageParam: PageParam, direction: PageDirection): Promise<Page> | Page;

  /**
   * Returns the page param of the page after the last one, or `null` or `undefined` if there
   * are no more pages (then `pages.hasNextPage` is `false`). It's given the last page, all the
   * pages, the param of the last page, and all the params.
   *
   * ```ts
   * // A cursor: the id of the last item. A page with less than 20 items is the last one.
   * nextPageParam(lastPage: Todo[]) { return lastPage.length < 20 ? null : lastPage.at(-1)!.id; }
   *
   * // A cursor from the server.
   * nextPageParam(lastPage: TodosPage) { return lastPage.nextCursor; }
   *
   * // A page number.
   * nextPageParam(lastPage: Todo[], allPages: Todo[][], lastPageParam: number) {
   *   return lastPage.length === 0 ? null : lastPageParam + 1;
   * }
   * ```
   */
  protected abstract nextPageParam(
    lastPage: Page,
    allPages: readonly Page[],
    lastPageParam: PageParam,
    allPageParams: readonly PageParam[],
  ): PageParam | null | undefined;

  /**
   * Implement this method to load `'previous'` pages. Returns the page param of the page before
   * the first one, or `null` or `undefined` if there is none (then `pages.hasPreviousPage` is
   * `false`). It's given the first page, all the pages, the param of the first page, and all the
   * params. If it's not implemented, `pages.hasPreviousPage` is always `false`.
   *
   * ```ts
   * previousPageParam(firstPage: Todo[], allPages: Todo[][], firstPageParam: number) {
   *   return firstPageParam > 1 ? firstPageParam - 1 : null;
   * }
   * ```
   */
  protected previousPageParam?(
    firstPage: Page,
    allPages: readonly Page[],
    firstPageParam: PageParam,
    allPageParams: readonly PageParam[],
  ): PageParam | null | undefined;

  /**
   * By default, all the actions of the class load the same list. Override `pagesKeyParams()`
   * to return a field (or an array of fields) when the same class loads different lists, so
   * that their loads don't affect each other:
   *
   * ```ts
   * pagesKeyParams() { return this.postId; }
   * ```
   *
   * The result is also the `statusKey` of the action, so that
   * `useIsWaiting(LoadComments, { statusKey: postId })` tells if the list of that post is
   * loading.
   *
   * Params are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents.
   */
  protected pagesKeyParams(): any {
    return null;
  }

  /** The `statusKey` is `pagesKeyParams()`. Do NOT override this; override `pagesKeyParams()`. */
  get statusKey(): unknown {
    return this.pagesKeyParams();
  }

  /** A `'next'` or `'previous'` always runs, even if the list is fresh. See `LoadPages`. */
  get ignoreFresh(): boolean {
    return this._loadsMore;
  }

  /** A `'next'` or `'previous'` always runs, even if the list is throttled. See `LoadPages`. */
  get ignoreThrottle(): boolean {
    return this._loadsMore;
  }

  /** True if `which` is `'next'` or `'previous'`. */
  private get _loadsMore(): boolean {
    return this.which === 'next' || this.which === 'previous';
  }

  /**
   * Do NOT override this method. A `'next'` or `'previous'` is aborted if another load of the
   * same list is running, or if there is no page to load in that direction.
   */
  protected abortDispatch(): boolean {
    if (!this._loadsMore) return false;

    // Another load of the same list is running. Note this action is not in progress yet.
    if (this.store.isWaiting(this._type, { statusKey: this.statusKey })) return true;

    // There is no page to load in that direction. But when no page was loaded yet, the first
    // page is loaded.
    const pages = this.getPagesFromState(this.state);
    if (pages == null || pages.isEmpty) return false;
    return !(this.which === 'previous' ? pages.hasPreviousPage : pages.hasNextPage);
  }

  /**
   * Do NOT override this method. Implement `getPagesFromState`, `applyPagesToState`,
   * `initialPageParam`, `loadPage` and `nextPageParam` instead.
   */
  protected async reduce(): Promise<AsyncReducerResult<St>> {
    // A `'first'` or `'refresh'` aborts the other loads of the same list, so that the newest
    // request wins. The results of the aborted ones are ignored.
    if (!this._loadsMore) this._abortOtherLoads();

    const old = this.getPagesFromState(this.state) ?? Pages.empty<Page, PageParam>();

    if (this._loadsMore && !old.isEmpty) return this._loadOneMore(old);

    const loaded = await this._loadFromStart(old);
    return (state: St) => this.applyPagesToState(state, loaded);
  }

  // Loads the `'next'` or `'previous'` page, and adds it to the end or the start. Returns `null`
  // if there is no page in that direction. The page is added to the pages as they are when it
  // arrives (and not as they were when the load started), so that a change made meanwhile by
  // another action (for example, an item removed) is kept.
  private async _loadOneMore(old: Pages<Page, PageParam>): Promise<AsyncReducerResult<St>> {
    const backward = this.which === 'previous';
    const param = backward ? this._previousParamOf(old) : this._nextParamOf(old);
    if (param == null) return null;

    const page = await this.loadPage(param, backward ? 'backward' : 'forward');
    const addTo = backward ? addToStart : addToEnd;

    return (state: St) => {
      const current = this.getPagesFromState(state) ?? Pages.empty<Page, PageParam>();
      return this.applyPagesToState(state, this._withFlags(
        addTo(current.pages, page, this.maxPages),
        addTo(current.pageParams, param, this.maxPages)));
    };
  }

  // Loads the pages from the first one: only the first page for a `'first'` (or when no page
  // was loaded yet), or as many pages as the state has for a `'refresh'`. Each new page param
  // comes from `nextPageParam`, so the pages stay consistent. Stops early when there are no
  // more pages.
  private async _loadFromStart(old: Pages<Page, PageParam>): Promise<Pages<Page, PageParam>> {
    const isRefresh = this.which === 'refresh';
    const count = isRefresh ? Math.max(old.pages.length, 1) : 1;

    let pages: readonly Page[] = [];
    let params: readonly PageParam[] = [];

    for (let i = 0; i < count; i++) {
      let param: PageParam;
      if (i === 0) {
        param = (isRefresh ? old.pageParams[0] : undefined) ?? this.initialPageParam();
      } else {
        // Aborted meanwhile (by a newer `'first'` or `'refresh'`, or `store.abort`): doesn't
        // load the other pages for nothing. The store ignores the result anyway.
        if (this.isAborted) throw kissAbort('The load of the pages was aborted.');
        const next = this._nextParamOf(new Pages(pages, params));
        if (next == null) break;
        param = next;
      }
      const page = await this.loadPage(param, 'forward');
      pages = addToEnd(pages, page, this.maxPages);
      params = addToEnd(params, param, this.maxPages);
    }

    return this._withFlags(pages, params);
  }

  // Creates the `Pages`, computing `hasNextPage` and `hasPreviousPage` from the last and first pages.
  private _withFlags(pages: readonly Page[], params: readonly PageParam[]): Pages<Page, PageParam> {
    const result = new Pages<Page, PageParam>(pages, params);
    return result.copy({
      hasNextPage: this._nextParamOf(result) != null,
      hasPreviousPage: this._previousParamOf(result) != null,
    });
  }

  private _nextParamOf(pages: Pages<Page, PageParam>): PageParam | null | undefined {
    const last = pages.pages.length - 1;
    if (last < 0) return undefined;
    return this.nextPageParam(pages.pages[last], pages.pages, pages.pageParams[last], pages.pageParams);
  }

  private _previousParamOf(pages: Pages<Page, PageParam>): PageParam | null | undefined {
    if (pages.isEmpty || this.previousPageParam === undefined) return undefined;
    return this.previousPageParam(pages.pages[0], pages.pages, pages.pageParams[0], pages.pageParams);
  }

  // Aborts the other loads of the same list (same class and `pagesKeyParams()`) in progress.
  private _abortOtherLoads(): void {
    for (const other of this.store.actionsInProgress()) {
      if (other !== this && other instanceof this._type && _isSameNonReentrantKey(other.statusKey, this.statusKey))
        other._abort(`A newer ${this.constructor.name} ('${this.which}') started loading the same pages.`);
    }
  }

  private get _type(): abstract new (...args: any[]) => KissAction<St> {
    return this.constructor as abstract new (...args: any[]) => KissAction<St>;
  }

  /**
   * For Kiss internal use only.
   * @internal
   */
  _injectStore(_store: Store<St>) {
    super._injectStore(_store);

    if (!['first', 'next', 'previous', 'refresh'].includes(this.which))
      throw new StoreException(
        `Action ${this.constructor.name} is a LoadPages with an invalid \`which\`: ${String(this.which)}. ` +
        `Use 'first', 'next', 'previous' or 'refresh'.`);

    if (this.maxPages !== undefined && (!Number.isInteger(this.maxPages) || this.maxPages < 1))
      throw new StoreException(
        `Action ${this.constructor.name} is a LoadPages with an invalid \`maxPages\`: ${String(this.maxPages)}. ` +
        'Use a positive integer, or leave it undefined for no limit.');

    if (this.nonReentrant)
      throw new StoreException(
        `Action ${this.constructor.name} is a LoadPages, which already runs one load per list at a time. ` +
        'Remove its `nonReentrant` property.');

    if (this.ignoreOld)
      throw new StoreException(
        `Action ${this.constructor.name} is a LoadPages, which already aborts the older loads of the list. ` +
        'Remove its `ignoreOld` property.');
  }
}

// Adds `item` to the end of `items`. If the result has more than `max` pages, drops the first.
function addToEnd<T>(items: readonly T[], item: T, max?: number): readonly T[] {
  const result = [...items, item];
  return (max !== undefined && result.length > max) ? result.slice(1) : result;
}

// Adds `item` to the start of `items`. If the result has more than `max` pages, drops the last.
function addToStart<T>(items: readonly T[], item: T, max?: number): readonly T[] {
  const result = [item, ...items];
  return (max !== undefined && result.length > max) ? result.slice(0, -1) : result;
}
