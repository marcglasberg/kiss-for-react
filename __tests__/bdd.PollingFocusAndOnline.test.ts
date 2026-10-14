import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Poll, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Polling only when the app is focused and online');
const logger = (_obj: any) => {};

type Signal = 'focus' | 'online';

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

// Sync action that adds 1 to the count. Polls every 100 millis. By default, it only ticks
// while the app is focused and online.
class Count extends KissAction<State> {
  pollInterval = 100;

  constructor(
    readonly poll = Poll.once,
    readonly options: { pollOnlyWhenFocused?: boolean, pollOnlyWhenOnline?: boolean } = {},
  ) {
    super();
    if (options.pollOnlyWhenFocused !== undefined) this.pollOnlyWhenFocused = options.pollOnlyWhenFocused;
    if (options.pollOnlyWhenOnline !== undefined) this.pollOnlyWhenOnline = options.pollOnlyWhenOnline;
  }

  createPollingAction() { return new Count(Poll.once, this.options); }

  reduce() {
    return new State(this.state.count + 1);
  }
}

// Runs the test with fake timers, and then stops all polling.
async function withFakeTimers(store: Store<State>, test: () => Promise<void>) {
  jest.useFakeTimers();
  try {
    await test();
  } finally {
    store.setShutDown(true);
    jest.useRealTimers();
  }
}

const elapse = (millis: number) => jest.advanceTimersByTimeAsync(millis);

function set(store: Store<State>, signal: Signal, value: boolean) {
  if (signal === 'focus') store.setFocused(value);
  else store.setOnline(value);
}

Bdd(feature)
  .scenario('By default, polling does not tick while the app is not focused, or not online.')
  .given('An action that polls every 100 millis, and is polling.')
  .when('The app loses focus (or goes offline).')
  .then('The ticks that come due do not run.')
  .and('When the app is focused (or online) again, the tick that was due runs right away.')
  .and('Then the polling goes on, every 100 millis.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      expect(store.state.count).toBe(1);

      await elapse(100);
      expect(store.state.count).toBe(2);

      set(store, signal, false);
      await elapse(100);
      expect(store.state.count).toBe(2);
      await elapse(500);
      expect(store.state.count).toBe(2);

      set(store, signal, true);
      expect(store.state.count).toBe(3); // The tick that was due runs right away.

      await elapse(100);
      expect(store.state.count).toBe(4);

      await elapse(100);
      expect(store.state.count).toBe(5);
    });
  });

Bdd(feature)
  .scenario('If the app is focused again before a tick is due, the tick runs at its normal time.')
  .given('An action that polls every 100 millis, and is polling.')
  .when('The app loses focus and is focused again, 50 millis after the last tick.')
  .then('The next tick runs at its normal time, 100 millis after the last tick, not right away.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      expect(store.state.count).toBe(1);

      await elapse(50);
      set(store, signal, false);
      set(store, signal, true);
      expect(store.state.count).toBe(1);

      await elapse(50);
      expect(store.state.count).toBe(2);
    });
  });

Bdd(feature)
  .scenario('With pollOnlyWhenFocused false, polling ticks while the app is not focused.')
  .given('An action that polls every 100 millis, with pollOnlyWhenFocused false (or pollOnlyWhenOnline false).')
  .when('The app loses focus (or goes offline).')
  .then('The ticks keep running.')
  .example(val('Signal', 'focus'), val('Options', { pollOnlyWhenFocused: false }))
  .example(val('Signal', 'online'), val('Options', { pollOnlyWhenOnline: false }))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const options = ctx.example.val('Options') as { pollOnlyWhenFocused?: boolean, pollOnlyWhenOnline?: boolean };
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start, options));
      expect(store.state.count).toBe(1);

      set(store, signal, false);
      await elapse(100);
      expect(store.state.count).toBe(2);
      await elapse(100);
      expect(store.state.count).toBe(3);
    });
  });

Bdd(feature)
  .scenario('Each option only looks at its own signal.')
  .given('An action with pollOnlyWhenFocused false, but pollOnlyWhenOnline true (the default).')
  .when('The app loses focus.')
  .then('The ticks keep running.')
  .and('When the app goes offline, the ticks stop.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start, { pollOnlyWhenFocused: false }));
      store.setFocused(false);
      await elapse(100);
      expect(store.state.count).toBe(2);

      store.setOnline(false);
      await elapse(100);
      expect(store.state.count).toBe(2);
    });
  });

Bdd(feature)
  .scenario('When both are required, a tick waits until the app is focused AND online.')
  .given('An action that polls, and the app is not focused and not online.')
  .when('A tick comes due, and then the app is focused again, but is still offline.')
  .then('The tick does not run.')
  .and('When the app is online again, the tick runs.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      store.setFocused(false);
      store.setOnline(false);
      await elapse(100);
      expect(store.state.count).toBe(1);

      store.setFocused(true);
      expect(store.state.count).toBe(1);

      store.setOnline(true);
      expect(store.state.count).toBe(2);

      await elapse(100);
      expect(store.state.count).toBe(3);
    });
  });

Bdd(feature)
  .scenario('The immediate run of Poll.start and Poll.runNowAndRestart is not affected.')
  .given('The app is not focused (or not online).')
  .when('An action is dispatched with Poll.start, and later with Poll.runNowAndRestart.')
  .then('It runs right away, both times.')
  .and('But the ticks wait for the app to be focused (or online) again.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      set(store, signal, false);

      store.dispatch(new Count(Poll.start));
      expect(store.state.count).toBe(1);

      await elapse(100);
      expect(store.state.count).toBe(1);

      store.dispatch(new Count(Poll.runNowAndRestart));
      expect(store.state.count).toBe(2);

      await elapse(100);
      expect(store.state.count).toBe(2);

      set(store, signal, true);
      expect(store.state.count).toBe(3);
    });
  });

Bdd(feature)
  .scenario('Poll.stop while a tick is waiting for the app to be focused cancels that tick.')
  .given('An action that is polling, and a tick is waiting for the app to be focused (or online).')
  .when('The action is dispatched with Poll.stop, and then the app is focused (or online) again.')
  .then('The tick does not run, and there are no more ticks.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      set(store, signal, false);
      await elapse(100);
      expect(store.state.count).toBe(1);

      store.dispatch(new Count(Poll.stop));
      set(store, signal, true);
      expect(store.state.count).toBe(1);

      await elapse(500);
      expect(store.state.count).toBe(1);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

Bdd(feature)
  .scenario('Poll.runNowAndRestart while a tick is waiting replaces that tick.')
  .given('An action that is polling, and a tick is waiting for the app to be focused.')
  .when('The action is dispatched with Poll.runNowAndRestart, and then the app is focused again.')
  .then('The action ran once, for the Poll.runNowAndRestart, and the waiting tick is dropped.')
  .and('The polling goes on from the restart.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      store.setFocused(false);
      await elapse(100);
      expect(store.state.count).toBe(1);

      store.dispatch(new Count(Poll.runNowAndRestart));
      expect(store.state.count).toBe(2);

      store.setFocused(true);
      expect(store.state.count).toBe(2);

      await elapse(100);
      expect(store.state.count).toBe(3);
    });
  });

Bdd(feature)
  .scenario('Clearing the internal action props, or disposing the store, cancels the waiting ticks.')
  .given('An action that is polling, and a tick is waiting for the app to be focused.')
  .when('clearInternalActionProps is called (or the store is disposed), and then the app is focused again.')
  .then('The tick does not run.')
  .example(val('How', 'clearInternalActionProps'))
  .example(val('How', 'dispose'))
  .run(async (ctx) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      store.setFocused(false);
      await elapse(100);
      expect(store.state.count).toBe(1);

      if (ctx.example.val('How') === 'dispose') await store.dispose();
      else store.clearInternalActionProps();

      store.setFocused(true);
      expect(store.state.count).toBe(1);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

Bdd(feature)
  .scenario('A polling action without these options does not make the store listen to the focus and online sources.')
  .given('A store with custom focus and online sources.')
  .and('An action that polls, with pollOnlyWhenFocused false and pollOnlyWhenOnline false.')
  .when('It polls for a while.')
  .then('The sources are never started.')
  .and('With the defaults, the sources are started by the first tick.')
  .run(async (_) => {
    let starts = 0;
    const store = new Store<State>({
      initialState: new State(0), logger: logger,
      focusSource: () => { starts++; },
      onlineSource: () => { starts++; },
    });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start, { pollOnlyWhenFocused: false, pollOnlyWhenOnline: false }));
      await elapse(300);
      expect(store.state.count).toBe(4);
      expect(starts).toBe(0);

      store.dispatch(new Count(Poll.stop));
      store.dispatch(new Count(Poll.start));
      expect(starts).toBe(0); // The immediate run doesn't look at the signals.
      await elapse(100);
      expect(starts).toBe(2);
    });
  });

Bdd(feature)
  .scenario('Where the store cannot know if the app is focused or online, polling never pauses.')
  .given('A store in Node, with no document and no navigator, and an action that polls with the defaults.')
  .when('It polls for a while.')
  .then('Every tick runs, since the app counts as focused and online.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      await elapse(300);
      expect(store.state.count).toBe(4);
    });
  });

Bdd(feature)
  .scenario('Invalid pollOnlyWhenFocused or pollOnlyWhenOnline values make the dispatch throw.')
  .given('An action that polls, with a non-boolean value in one of the options.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .example(val('Option', 'pollOnlyWhenFocused'))
  .example(val('Option', 'pollOnlyWhenOnline'))
  .run(async (ctx) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    const action = new Count(Poll.start);
    (action as any)[ctx.example.val('Option') as string] = 'yes';
    expect(() => store.dispatch(action)).toThrow(/pollOnlyWhen/);
    await store.dispose();
  });
