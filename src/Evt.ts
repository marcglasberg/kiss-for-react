/**
 * An event: a one-time notification kept in the store state, for an action to ask the UI to
 * do something once, that is not a state change: scroll a list to the top, clear or focus an
 * input, open a dialog. The UI keeps these things itself (DOM elements, refs, scroll
 * positions), so the reducer can't reach them.
 *
 * Name event fields with the `Evt` suffix, like `scrollToTopEvt`. In the initial state, use
 * `Evt.spent()`, an event that was already used, so that nothing fires when the app starts.
 * Actions then put a new event in the state:
 *
 * ```ts
 * class State {
 *   constructor(
 *     readonly messages: readonly Message[],
 *     readonly scrollToTopEvt: Evt,          // A boolean event.
 *     readonly changeTextEvt: Evt<string>,   // An event with a value.
 *   ) {}
 *
 *   static initialState = new State([], Evt.spent(), Evt.spent());
 * }
 *
 * class ScrollFeedToTop extends Action {
 *   reduce() { return this.state.copy({ scrollToTopEvt: new Evt() }); }
 * }
 *
 * class ChangeText extends Action {
 *   async reduce() {
 *     const text = await api.fetchText();
 *     return (state: State) => state.copy({ changeTextEvt: new Evt(text) });
 *   }
 * }
 * ```
 *
 * Components handle the event with the `useEvent` hook (or `useLayoutEvent`), which calls the
 * callback once per event, with its value, and then marks the event as **spent**:
 *
 * ```tsx
 * useEvent((state: State) => state.scrollToTopEvt, () => listRef.current?.scrollTo({ top: 0 }));
 * useEvent((state: State) => state.changeTextEvt, (text) => { inputRef.current!.value = text; });
 * ```
 *
 * `new Evt()` is a boolean event, whose `value` is `true`. `new Evt(value)` holds a value of
 * any type. Each new event is a new object, so a new event always fires, even if its value is
 * the same as the previous one. Reading `value` doesn't spend the event.
 *
 * The event object itself is immutable: the store keeps which events were spent (see
 * `store.isEventSpent`). So the state stays immutable, and two stores that share the same
 * state (in two tests, for example) each spend the event on their own.
 *
 * Each event is handled by one component only: the first one whose effect runs. For two
 * components to react, create two events in the state. Or use `EvtState`, when it's fine to
 * miss events that happen while the component is not mounted.
 *
 * Persistence: the `ClassPersistor` saves events as spent, and restores them as `Evt.spent()`,
 * so an old event doesn't fire when the app starts. A custom persistor must do the same: never
 * save events, or restore them as `Evt.spent()`.
 *
 * You don't need events when:
 * - The component dispatched the action itself. It can wait for the action, and then act:
 *   `await dispatchAndWait(new SendMessage(text)); inputRef.current!.value = '';`
 * - There's already a state change to react to. Do it in an effect: for example, scroll to
 *   the end when a message arrives: `useEffect(() => scrollToEnd(), [messages.length])`.
 */
export class Evt<T = true> {

  /**
   * The value of the event: `true` for a boolean event (`new Evt()`), or the value given to
   * the constructor. Reading it doesn't spend the event. It's `undefined` for `Evt.spent()`,
   * and for a restored (persisted) event. Components should get the value from `useEvent`,
   * which also spends the event.
   */
  readonly value: T | undefined;

  /**
   * Internal: `true` for `Evt.spent()`, and for a restored (persisted) event. Such an event is
   * spent in every store. Use `store.isEventSpent(evt)` instead.
   * @internal
   */
  readonly _spentAtCreation: boolean;

  /**
   * Creates a new, unspent event. `new Evt()` is a boolean event, whose `value` is `true`.
   * `new Evt(value)` holds a value of any type.
   */
  constructor(value?: T) {
    this.value = (value === undefined ? true : value) as T;
    this._spentAtCreation = false;
  }

  /**
   * An event that was already used, for the initial state. It never fires, in any store, and
   * has no value (`undefined`).
   */
  static spent<T = true>(): Evt<T> {
    const evt = new Evt<T>();
    return Object.assign(evt, {value: undefined, _spentAtCreation: true}) as Evt<T>;
  }

  toString(): string {
    return this._spentAtCreation ? 'Evt.spent()' : `Evt(${String(this.value)})`;
  }
}

/**
 * An event that is never spent, so that all the mounted components that use it react to it,
 * but only while they are mounted. It's an alternative to `Evt`, which fires once, in one
 * component only, even if the component mounts later.
 *
 * Each `new EvtState(value)` is a new object. A component that uses it with `useEvent` (or
 * `useLayoutEvent`) is called when the state has a different `EvtState` than the last one the
 * component saw. So it doesn't fire when the component mounts (or remounts), nor on unrelated
 * re-renders, and it fires in every mounted component that uses it, even if the value is the
 * same as the previous one.
 *
 * In the initial state, use `EvtState.spent()`, which never fires, so that nothing fires after
 * a `logOut` puts the initial state back. The `ClassPersistor` also restores an `EvtState` as
 * `EvtState.spent()`.
 *
 * ```ts
 * class State {
 *   constructor(readonly highlightEvt: EvtState<string>) {}
 *   static initialState = new State(EvtState.spent());
 * }
 *
 * // In an action:
 * reduce() { return this.state.copy({ highlightEvt: new EvtState(this.itemId) }); }
 *
 * // In any number of components:
 * useEvent((state: State) => state.highlightEvt, (itemId) => highlight(itemId));
 * ```
 */
export class EvtState<T = true> {

  /**
   * The value of the event: `true` for `new EvtState()`, or the value given to the constructor.
   * It's `undefined` for `EvtState.spent()`, and for a restored (persisted) event.
   */
  readonly value: T | undefined;

  /**
   * Internal: `true` for `EvtState.spent()`, and for a restored (persisted) event, which never
   * fire. Use `store.isEventSpent(evt)` instead.
   * @internal
   */
  readonly _spentAtCreation: boolean;

  /** Creates a new event. `new EvtState()` has the value `true`. `new EvtState(value)` holds a value. */
  constructor(value?: T) {
    this.value = (value === undefined ? true : value) as T;
    this._spentAtCreation = false;
  }

  /** An event that never fires, for the initial state. It has no value (`undefined`). */
  static spent<T = true>(): EvtState<T> {
    const evt = new EvtState<T>();
    return Object.assign(evt, {value: undefined, _spentAtCreation: true}) as EvtState<T>;
  }

  toString(): string {
    return this._spentAtCreation ? 'EvtState.spent()' : `EvtState(${String(this.value)})`;
  }
}
