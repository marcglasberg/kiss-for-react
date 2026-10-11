import { afterEach, beforeEach, expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, PersistAction, Persistor, Store, UpdateStateAction } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Persistence process');

// Fake timers make the persistor throttle exact, so that the tests don't depend on how long
// real timers take when the machine is busy. They also fake `Date`, used by the throttle.
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

const throttle = 300;

const advance = (millis: number) => jest.advanceTimersByTimeAsync(millis);

// Runs the pending promise callbacks, without advancing the time.
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

// ==========================================================================
// The initial state, and simple saves.
// ==========================================================================

Bdd(feature)
  .scenario('The state read from the persistor is the last persisted state.')
  .given('A persistor with a saved state.')
  .when('The store is created, and it is ready.')
  .then('Nothing is saved.')
  .and('The saved state is the last persisted state.')
  .run(async (_) => {
    const s0 = new S(0);
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, new S(0));

    expect(p.saves).toEqual([]);
    expect(store.state).toBe(s0);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s0);
  });

Bdd(feature)
  .scenario('Without throttle, a state change is saved right away.')
  .given('A persistor with no throttle.')
  .when('The state changes twice, each time after the previous save finished.')
  .then('Each new state is saved right away.')
  .and('Each save gets the difference from the last persisted state.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].lastPersistedState).toBe(s0);
    expect(p.saves[0].newState).toBe(s1);
    await p.finish(0);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s1);

    store.dispatch(new SetState(s2));
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s2);
    await p.finish(1);
    expect(p.stored).toBe(s2);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s2);
  });

Bdd(feature)
  .scenario('An action that does not change the state does not save it.')
  .given('A persistor with no throttle.')
  .when('An action returns null.')
  .and('An action returns the same state object.')
  .then('Nothing is saved.')
  .run(async (_) => {
    const s0 = new S(0);
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    await store.dispatchAndWait(new ReturnNull());
    await store.dispatchAndWait(new ReturnSameState());
    await flush();

    expect(p.saves).toEqual([]);
  });

Bdd(feature)
  .scenario('A new state object equal to the persisted one is saved.')
  .given('A persistor with no throttle.')
  .when('An action returns a new state object, equal to the persisted state.')
  .then('It is saved, since states are compared by identity, not by equality.')
  .run(async (_) => {
    const s0 = new S(0);
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    const s0copy = new S(0);
    store.dispatch(new SetState(s0copy));
    await p.finish(0);

    expect(p.saves.length).toBe(1);
    expect(p.saves[0].newState).toBe(s0copy);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s0copy);
  });

Bdd(feature)
  .scenario('The state changed by an async action is saved when its reducer finishes.')
  .given('A persistor with no throttle.')
  .when('An async action is dispatched.')
  .then('Nothing is saved while its reducer is running.')
  .and('The new state is saved when the reducer finishes.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    const reducerCanFinish = new Gate();
    store.dispatch(new SetStateAsync(s1, reducerCanFinish.promise));
    await flush();
    expect(p.saves).toEqual([]);

    reducerCanFinish.open();
    await flush();
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].newState).toBe(s1);
  });

// ==========================================================================
// State changes while a save is running.
// ==========================================================================

Bdd(feature)
  .scenario('Saves never overlap, and only the newest state is saved next.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('The state changes two more times, while the save is still running.')
  .then('No other save starts while the first one is running.')
  .and('When it finishes, only the newest state is saved,')
  .and('with the difference from the state that was just saved.')
  .run(async (_) => {
    const [s0, s1, s2, s3] = [new S(0), new S(1), new S(2), new S(3)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s2));
    store.dispatch(new SetState(s3));
    await flush();
    expect(p.saves.length).toBe(1);

    await p.finish(0);
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s3);

    await p.finish(1);
    expect(p.saves.length).toBe(2);
    expect(p.stored).toBe(s3);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s3);
  });

Bdd(feature)
  .scenario('A state that goes back to the one being saved is not saved again.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('The state changes to another state,')
  .and('and then back to the state being saved, while the save is running.')
  .then('When the save finishes, nothing else is saved.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s2));
    store.dispatch(new SetState(s1));

    await p.finish(0);
    expect(p.saves.length).toBe(1);
    expect(p.stored).toBe(store.state);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s1);
  });

// Bug: process() returns early when the new state is the last persisted state, before it
// checks if a save is running. So it doesn't remember that, when the running save finishes,
// the state must be saved again.

Bdd(feature)
  .scenario('The state goes back to the last persisted state while a save is running.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('The state goes back to the last persisted state object (an undo).')
  .and('The running save finishes.')
  .then('The last persisted state is saved again,')
  .and('so that the saved state is the same as the state of the store.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s0));

    await p.finish(0);
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s0);

    await p.finish(1);
    expect(p.stored).toBe(store.state);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s0);
  });

Bdd(feature)
  .scenario('An undo to a saved state while a save is running is saved.')
  .given('A persistor with no throttle.')
  .and('The state changed to a state that was saved.')
  .and('The state changed again, and its save is running.')
  .when('The state goes back to the saved state object (an undo).')
  .and('The running save finishes.')
  .then('The saved state is saved again.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    await p.finish(0);

    store.dispatch(new SetState(s2));
    store.dispatch(new SetState(s1));

    await p.finish(1);
    expect(p.saves.length).toBe(3);
    expect(p.saves[2].lastPersistedState).toBe(s2);
    expect(p.saves[2].newState).toBe(s1);

    await p.finish(2);
    expect(p.stored).toBe(store.state);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s1);
  });

Bdd(feature)
  .scenario('The state goes back to the last persisted state while a save is running, with a throttle.')
  .given('A persistor with a throttle.')
  .and('The throttle is over, the state changed, and its save is running.')
  .when('The state goes back to the last persisted state object (an undo).')
  .and('The running save finishes.')
  .then('The last persisted state is saved again, when the throttle is over.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0, throttle });
    const store = await createStore(p, s0);
    await advance(400);

    store.dispatch(new SetState(s1));
    expect(p.saves.length).toBe(1);
    store.dispatch(new SetState(s0));

    await p.finish(0);
    await advance(500);
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s0);

    await p.finish(1);
    expect(p.stored).toBe(store.state);
  });

Bdd(feature)
  .scenario('The state goes back to the last persisted state, and then changes again, while a save is running.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('The state goes back to the last persisted state object,')
  .and('and then changes to another state, while the save is running.')
  .then('When the save finishes, the newest state is saved.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s0));
    store.dispatch(new SetState(s2));

    await p.finish(0);
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s2);

    await p.finish(1);
    expect(p.stored).toBe(s2);
  });

Bdd(feature)
  .scenario('The state goes back to the last persisted state while a save is running, and that save fails.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('The state goes back to the last persisted state object.')
  .and('The running save fails.')
  .then('Nothing else is saved, since the saved state is the state of the store.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0, swallowErrors: true });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s0));

    await p.fail(0);
    expect(p.saves.length).toBe(1);
    expect(p.stored).toBe(store.state);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s0);
  });

Bdd(feature)
  .scenario('The state changes while a save is running, and that save fails.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('The state changes again, while the save is running.')
  .and('The running save fails.')
  .then('The newest state is saved,')
  .and('with the difference from the last state that was actually persisted.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0, swallowErrors: true });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s2));

    await p.fail(0);
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s0);
    expect(p.saves[1].newState).toBe(s2);

    await p.finish(1);
    expect(p.stored).toBe(s2);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s2);
  });

Bdd(feature)
  .scenario('A state change that should not be persisted, made while a save is running, is not saved when it finishes.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('An UpdateStateAction with ifPersists false changes the state, while the save is running.')
  .and('The running save finishes.')
  .then('Nothing else is saved.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.dispatch(new UpdateStateAction<S>(() => s2, false));

    await p.finish(0);
    expect(p.saves.length).toBe(1);
    expect(p.stored).toBe(s1);
    expect(store.state).toBe(s2);
  });

Bdd(feature)
  .scenario('A state change that should not be persisted goes back to the last persisted state while a save is running.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('An UpdateStateAction with ifPersists false changes the state back to the last persisted state object.')
  .and('The running save finishes.')
  .then('Nothing else is saved.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.dispatch(new UpdateStateAction<S>(() => s0, false));

    await p.finish(0);
    expect(p.saves.length).toBe(1);
    expect(p.stored).toBe(s1);
    expect(store.state).toBe(s0);
  });

// ==========================================================================
// Throttle.
// ==========================================================================

Bdd(feature)
  .scenario('The throttle starts counting when the store is created.')
  .given('A persistor with a throttle.')
  .when('The state changes 3 times, right after the store is created.')
  .then('Nothing is saved before the throttle is over.')
  .and('When the throttle is over, only the newest state is saved, once.')
  .run(async (_) => {
    const [s0, s1, s2, s3] = [new S(0), new S(1), new S(2), new S(3)];
    const p = new ControlledPersistor({ stored: s0, throttle, autoFinish: true });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s2));
    store.dispatch(new SetState(s3));
    await advance(290);
    expect(p.saves).toEqual([]);

    await advance(20);
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].lastPersistedState).toBe(s0);
    expect(p.saves[0].newState).toBe(s3);
    expect(p.stored).toBe(s3);

    await advance(1000);
    expect(p.saves.length).toBe(1);
  });

Bdd(feature)
  .scenario('A state change after the throttle is over is saved right away.')
  .given('A persistor with a throttle.')
  .and('The throttle is over.')
  .when('The state changes.')
  .then('It is saved right away.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0, throttle, autoFinish: true });
    const store = await createStore(p, s0);
    await advance(400);

    store.dispatch(new SetState(s1));
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].newState).toBe(s1);
  });

Bdd(feature)
  .scenario('The throttle counts from the start of the last save.')
  .given('A persistor with a throttle.')
  .and('The state changed after the throttle was over, so it was saved right away.')
  .when('The state changes again, before the throttle is over.')
  .then('It is not saved right away.')
  .and('It is saved when the throttle, counted from the start of the last save, is over.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0, throttle, autoFinish: true });
    const store = await createStore(p, s0);
    await advance(400);

    store.dispatch(new SetState(s1));
    expect(p.saves.length).toBe(1);

    await advance(50);
    store.dispatch(new SetState(s2));
    await advance(240);
    expect(p.saves.length).toBe(1);

    await advance(20);
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s2);
  });

Bdd(feature)
  .scenario('A state that goes back to the persisted state before the throttle is over is not saved.')
  .given('A persistor with a throttle.')
  .when('The state changes, and then goes back to the persisted state object,')
  .and('before the throttle is over.')
  .then('Nothing is saved when the throttle is over.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0, throttle, autoFinish: true });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s0));
    await advance(500);

    expect(p.saves).toEqual([]);
    expect(p.stored).toBe(store.state);
  });

Bdd(feature)
  .scenario('A state waiting for a running save is saved when it finishes, if the throttle is over.')
  .given('A persistor with a throttle.')
  .and('The throttle is over, the state changed, and its save is running.')
  .and('The state changed again, while the save is running.')
  .when('The running save finishes after the throttle is over.')
  .then('The newest state is saved right away.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0, throttle });
    const store = await createStore(p, s0);
    await advance(400);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s2));
    await advance(400);
    expect(p.saves.length).toBe(1);

    await p.finish(0);
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s2);
  });

Bdd(feature)
  .scenario('A state waiting for a running save is saved when the throttle is over, if the save finishes before that.')
  .given('A persistor with a throttle.')
  .and('The throttle is over, the state changed, and its save is running.')
  .and('The state changed again, while the save is running.')
  .when('The running save finishes before the throttle is over.')
  .then('The newest state is not saved right away.')
  .and('It is saved when the throttle, counted from the start of the last save, is over.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0, throttle });
    const store = await createStore(p, s0);
    await advance(400);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s2));
    await advance(50);
    await p.finish(0);
    expect(p.saves.length).toBe(1);

    await advance(240);
    expect(p.saves.length).toBe(1);

    await advance(20);
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s2);
  });

// ==========================================================================
// PersistAction.
// ==========================================================================

Bdd(feature)
  .scenario('PersistAction saves the state right away, ignoring the throttle.')
  .given('A persistor with a throttle.')
  .and('The state changed, and is waiting for the throttle.')
  .when('A PersistAction is dispatched.')
  .then('The state is saved right away.')
  .and('It is not saved again when the throttle is over.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0, throttle, autoFinish: true });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    expect(p.saves).toEqual([]);

    store.dispatch(new PersistAction<S>());
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].newState).toBe(s1);

    await advance(500);
    expect(p.saves.length).toBe(1);
    expect(p.stored).toBe(s1);
  });

Bdd(feature)
  .scenario('PersistAction while a save is running saves the newest state when the save finishes, ignoring the throttle.')
  .given('A persistor with a throttle.')
  .and('The throttle is over, the state changed, and its save is running.')
  .and('The state changed again, while the save is running.')
  .when('A PersistAction is dispatched.')
  .and('The running save finishes before the throttle is over.')
  .then('The newest state is saved right away, ignoring the throttle.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0, throttle });
    const store = await createStore(p, s0);
    await advance(400);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s2));
    store.dispatch(new PersistAction<S>());
    expect(p.saves.length).toBe(1);

    await p.finish(0);
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s2);
  });

Bdd(feature)
  .scenario('PersistAction while a save is running does nothing else, if the state did not change after the save started.')
  .given('A persistor with a throttle.')
  .and('The throttle is over, the state changed, and its save is running.')
  .when('A PersistAction is dispatched.')
  .and('The running save finishes.')
  .then('Nothing else is saved, not even after the throttle is over.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0, throttle });
    const store = await createStore(p, s0);
    await advance(400);

    store.dispatch(new SetState(s1));
    store.dispatch(new PersistAction<S>());

    await p.finish(0);
    await advance(500);
    expect(p.saves.length).toBe(1);
    expect(p.stored).toBe(s1);
  });

Bdd(feature)
  .scenario('PersistAction does nothing if the state is already persisted.')
  .given('A persistor with a throttle.')
  .and('The state did not change.')
  .when('A PersistAction is dispatched.')
  .then('Nothing is saved.')
  .run(async (_) => {
    const s0 = new S(0);
    const p = new ControlledPersistor({ stored: s0, throttle, autoFinish: true });
    const store = await createStore(p, s0);

    store.dispatch(new PersistAction<S>());
    await advance(500);
    expect(p.saves).toEqual([]);
  });

// ==========================================================================
// Pause and resume.
// ==========================================================================

Bdd(feature)
  .scenario('A paused persistor does not save, and saves the newest state when resumed.')
  .given('A persistor with no throttle.')
  .and('The persistor is paused.')
  .when('The state changes 3 times.')
  .then('Nothing is saved.')
  .and('When the persistor is resumed, only the newest state is saved.')
  .run(async (_) => {
    const [s0, s1, s2, s3] = [new S(0), new S(1), new S(2), new S(3)];
    const p = new ControlledPersistor({ stored: s0, autoFinish: true });
    const store = await createStore(p, s0);

    store.pausePersistor();
    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s2));
    store.dispatch(new SetState(s3));
    await flush();
    expect(p.saves).toEqual([]);

    store.resumePersistor();
    await flush();
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].lastPersistedState).toBe(s0);
    expect(p.saves[0].newState).toBe(s3);
    expect(p.stored).toBe(s3);
  });

Bdd(feature)
  .scenario('PersistAction does not save while the persistor is paused.')
  .given('A persistor with no throttle.')
  .and('The persistor is paused, and the state changed.')
  .when('A PersistAction is dispatched.')
  .then('Nothing is saved.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0, autoFinish: true });
    const store = await createStore(p, s0);

    store.pausePersistor();
    store.dispatch(new SetState(s1));
    store.dispatch(new PersistAction<S>());
    await flush();
    expect(p.saves).toEqual([]);
  });

Bdd(feature)
  .scenario('Resuming the persistor does nothing if the state is already persisted.')
  .given('A persistor with no throttle.')
  .when('The persistor is paused and resumed, before any state change.')
  .and('The persistor is paused, the state changes and goes back to the persisted state object, and the persistor is resumed.')
  .then('Nothing is saved.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0, autoFinish: true });
    const store = await createStore(p, s0);

    store.pausePersistor();
    store.resumePersistor();
    await flush();
    expect(p.saves).toEqual([]);

    store.pausePersistor();
    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s0));
    store.resumePersistor();
    await flush();
    expect(p.saves).toEqual([]);
  });

Bdd(feature)
  .scenario('Pausing the persistor does not affect the running save.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('The persistor is paused, and the state changes again.')
  .then('The running save finishes, and the new state is not saved.')
  .and('When the persistor is resumed, the new state is saved.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.pausePersistor();
    store.dispatch(new SetState(s2));

    await p.finish(0);
    expect(p.saves.length).toBe(1);
    expect(p.stored).toBe(s1);

    store.resumePersistor();
    await flush();
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s2);
  });

Bdd(feature)
  .scenario('The state goes back to the last persisted state while a save is running, and the persistor is paused.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('The persistor is paused,')
  .and('and the state goes back to the last persisted state object.')
  .and('The running save finishes.')
  .then('When the persistor is resumed, the last persisted state is saved again.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.pausePersistor();
    store.dispatch(new SetState(s0));

    await p.finish(0);
    expect(p.saves.length).toBe(1);

    store.resumePersistor();
    await flush();
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s0);

    await p.finish(1);
    expect(p.stored).toBe(store.state);
  });

Bdd(feature)
  .scenario('A paused persistor does not save when the throttle is over.')
  .given('A persistor with a throttle.')
  .and('The state changed, and is waiting for the throttle.')
  .when('The persistor is paused, and the throttle is over.')
  .then('Nothing is saved.')
  .and('When the persistor is resumed, the state is saved.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0, throttle, autoFinish: true });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    store.pausePersistor();
    await advance(500);
    expect(p.saves).toEqual([]);

    store.resumePersistor();
    await flush();
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].newState).toBe(s1);
  });

Bdd(feature)
  .scenario('persistAndPausePersistor saves the state right away, and then pauses.')
  .given('A persistor with a throttle.')
  .and('The state changed, and is waiting for the throttle.')
  .when('persistAndPausePersistor is called.')
  .then('The state is saved right away, ignoring the throttle.')
  .and('Later state changes are not saved, even after the throttle is over.')
  .and('When the persistor is resumed, the newest state is saved.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0, throttle, autoFinish: true });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    await store.persistAndPausePersistor();
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].newState).toBe(s1);

    store.dispatch(new SetState(s2));
    await advance(500);
    expect(p.saves.length).toBe(1);
    expect(p.stored).toBe(s1);

    store.resumePersistor();
    await flush();
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s2);
  });

Bdd(feature)
  .scenario('persistAndPausePersistor does not save if the state is already persisted.')
  .given('A persistor with no throttle.')
  .when('persistAndPausePersistor is called before any state change.')
  .and('persistAndPausePersistor is called after the state changed and was saved.')
  .then('Nothing else is saved.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0, autoFinish: true });
    const store = await createStore(p, s0);

    await store.persistAndPausePersistor();
    expect(p.saves).toEqual([]);

    store.resumePersistor();
    store.dispatch(new SetState(s1));
    await flush();
    expect(p.saves.length).toBe(1);

    await store.persistAndPausePersistor();
    expect(p.saves.length).toBe(1);
  });

Bdd(feature)
  .scenario('persistAndPausePersistor while a save is running saves the newest state when the save finishes.')
  .given('A persistor with a throttle.')
  .and('The throttle is over, the state changed, and its save is running.')
  .and('The state changed again, while the save is running.')
  .when('persistAndPausePersistor is called.')
  .then('No other save starts while the running save is running.')
  .and('When it finishes, the newest state is saved right away, ignoring the throttle.')
  .and('Then the persistor is paused, so later state changes are not saved.')
  .and('When the persistor is resumed, the newest state is saved.')
  .run(async (_) => {
    const [s0, s1, s2, s3] = [new S(0), new S(1), new S(2), new S(3)];
    const p = new ControlledPersistor({ stored: s0, throttle });
    const store = await createStore(p, s0);
    await advance(400);

    store.dispatch(new SetState(s1));
    store.dispatch(new SetState(s2));
    const persisting = store.persistAndPausePersistor();
    await flush();
    expect(p.saves.length).toBe(1);

    await p.finish(0);
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBe(s1);
    expect(p.saves[1].newState).toBe(s2);
    await p.finish(1);
    await persisting;
    expect(p.stored).toBe(s2);

    store.dispatch(new SetState(s3));
    await advance(500);
    expect(p.saves.length).toBe(2);

    store.resumePersistor();
    await flush();
    expect(p.saves.length).toBe(3);
    expect(p.saves[2].lastPersistedState).toBe(s2);
    expect(p.saves[2].newState).toBe(s3);
  });

Bdd(feature)
  .scenario('persistAndPausePersistor while a save is running does nothing else, if the state did not change after the save started.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('persistAndPausePersistor is called.')
  .and('The running save finishes.')
  .then('Nothing else is saved.')
  .and('The persistor is paused.')
  .run(async (_) => {
    const [s0, s1, s2] = [new S(0), new S(1), new S(2)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    const persisting = store.persistAndPausePersistor();

    await p.finish(0);
    await persisting;
    expect(p.saves.length).toBe(1);
    expect(p.stored).toBe(s1);

    store.dispatch(new SetState(s2));
    await flush();
    expect(p.saves.length).toBe(1);
  });

// ==========================================================================
// Reading, deleting, and saving the initial state, through the store.
// ==========================================================================

Bdd(feature)
  .scenario('Reading the state through the store makes it the last persisted state.')
  .given('A persistor with a saved state.')
  .when('The state is read with readStateFromPersistence.')
  .then('It returns the saved state.')
  .and('The saved state becomes the last persisted state.')
  .run(async (_) => {
    const [s0, s5] = [new S(0), new S(5)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    p.stored = s5;
    const read = await store.readStateFromPersistence();
    expect(read).toBe(s5);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s5);
  });

Bdd(feature)
  .scenario('Reading the state while a save is running: it waits for the save, and reads the saved state.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('The state is read with readStateFromPersistence.')
  .then('The read waits for the running save to finish.')
  .and('It returns the state that was just saved.')
  .and('That state is the last persisted state.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    let read: S | null | undefined = undefined;
    store.readStateFromPersistence().then(state => read = state);
    await flush();
    expect(read).toBeUndefined();

    await p.finish(0);
    expect(read).toBe(s1);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s1);
  });

Bdd(feature)
  .scenario('A state change while the state is being read is saved after the read finishes.')
  .given('A persistor with no throttle, where reading the state takes some time.')
  .when('The state is read with readStateFromPersistence.')
  .and('The state changes while the read is running.')
  .then('Nothing is saved while the read is running.')
  .and('When the read finishes, the new state is saved,')
  .and('with the difference from the state that was read.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    p.readCanFinish = new Gate();
    const reading = store.readStateFromPersistence();
    store.dispatch(new SetState(s1));
    await flush();
    expect(p.saves).toEqual([]);

    p.readCanFinish.open();
    expect(await reading).toBe(s0);
    await flush();
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].lastPersistedState).toBe(s0);
    expect(p.saves[0].newState).toBe(s1);
  });

Bdd(feature)
  .scenario('If reading the state fails, the error goes to the caller, and the state keeps being saved.')
  .given('A persistor with no throttle, where reading the state takes some time,')
  .and('and then fails.')
  .when('The state is read with readStateFromPersistence.')
  .and('The state changes while the read is running.')
  .then('The read throws the error.')
  .and('The last persisted state does not change.')
  .and('When the read finishes, the new state is saved.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    p.readCanFinish = new Gate();
    p.readError = new Error('Read failed');
    const reading = store.readStateFromPersistence();
    store.dispatch(new SetState(s1));
    await flush();
    expect(p.saves).toEqual([]);

    p.readCanFinish.open();
    await expect(reading).rejects.toThrow('Read failed');
    expect(store.getLastPersistedStateFromPersistor()).toBe(s0);

    await flush();
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].lastPersistedState).toBe(s0);
    expect(p.saves[0].newState).toBe(s1);
  });

Bdd(feature)
  .scenario('Saving the initial state through the store saves the whole state.')
  .given('A persistor.')
  .when('A state is saved with saveInitialStateInPersistence.')
  .then('It is saved with no last persisted state (so the whole state is saved).')
  .and('It becomes the last persisted state.')
  .run(async (_) => {
    const [s0, s5] = [new S(0), new S(5)];
    const p = new ControlledPersistor({ stored: s0, autoFinish: true });
    const store = await createStore(p, s0);

    await store.saveInitialStateInPersistence(s5);
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].lastPersistedState).toBeNull();
    expect(p.saves[0].newState).toBe(s5);
    expect(p.stored).toBe(s5);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s5);
  });

Bdd(feature)
  .scenario('Saving the initial state while a save is running: the initial state stays saved.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('A state is saved with saveInitialStateInPersistence.')
  .then('It is saved after the running save finishes.')
  .and('It stays saved, and is the last persisted state.')
  .run(async (_) => {
    const [s0, s1, s5] = [new S(0), new S(1), new S(5)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    const saving = store.saveInitialStateInPersistence(s5);
    await flush();
    expect(p.saves.length).toBe(1);

    await p.finish(0);
    expect(p.saves.length).toBe(2);
    expect(p.saves[1].lastPersistedState).toBeNull();
    expect(p.saves[1].newState).toBe(s5);

    await p.finish(1);
    await saving;
    expect(p.stored).toBe(s5);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s5);
  });

Bdd(feature)
  .scenario('Deleting the state while a save is running: the state stays deleted.')
  .given('A persistor with no throttle.')
  .and('The state changed, and its save is running.')
  .when('The state is deleted with deleteStateFromPersistence.')
  .and('The running save finishes.')
  .then('The state stays deleted.')
  .and('There is no last persisted state.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    store.dispatch(new SetState(s1));
    const deleting = store.deleteStateFromPersistence();
    await flush();

    await p.finish(0);
    await deleting;
    expect(p.saves.length).toBe(1);
    expect(p.stored).toBeNull();
    expect(store.getLastPersistedStateFromPersistor()).toBeNull();
  });

Bdd(feature)
  .scenario('A state change while the state is being deleted is saved after the delete finishes.')
  .given('A persistor with no throttle, where deleting the state takes some time.')
  .when('The state is deleted with deleteStateFromPersistence.')
  .and('The state changes while the delete is running.')
  .then('Nothing is saved while the delete is running.')
  .and('When the delete finishes, the whole new state is saved.')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0 });
    const store = await createStore(p, s0);

    p.deleteCanFinish = new Gate();
    const deleting = store.deleteStateFromPersistence();
    store.dispatch(new SetState(s1));
    await flush();
    expect(p.saves).toEqual([]);

    p.deleteCanFinish.open();
    await deleting;
    await flush();
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].lastPersistedState).toBeNull();
    expect(p.saves[0].newState).toBe(s1);

    await p.finish(0);
    expect(p.stored).toBe(s1);
    expect(store.getLastPersistedStateFromPersistor()).toBe(s1);
  });

Bdd(feature)
  .scenario('After the state is deleted, the next state change saves the whole state.')
  .given('A persistor with no throttle.')
  .when('The state is deleted with deleteStateFromPersistence.')
  .then('There is no last persisted state.')
  .and('The next state change is saved with no last persisted state (so the whole state is saved).')
  .run(async (_) => {
    const [s0, s1] = [new S(0), new S(1)];
    const p = new ControlledPersistor({ stored: s0, autoFinish: true });
    const store = await createStore(p, s0);

    await store.deleteStateFromPersistence();
    expect(p.stored).toBeNull();
    expect(store.getLastPersistedStateFromPersistor()).toBeNull();

    store.dispatch(new SetState(s1));
    await flush();
    expect(p.saves.length).toBe(1);
    expect(p.saves[0].lastPersistedState).toBeNull();
    expect(p.saves[0].newState).toBe(s1);
    expect(p.stored).toBe(s1);
  });

// ==========================================================================
// Helpers.
// ==========================================================================

/**
 * The state. It's compared by identity in the persistence,
 * so the scenarios use `toBe()` to check it.
 */
class S {
  constructor(readonly n: number) {
  }
}

async function createStore(p: ControlledPersistor, initialState: S): Promise<Store<S>> {
  const store = new Store<S>({ initialState, persistor: p, logger: null });
  await store.ready();
  return store;
}

/** A promise that resolves when `open` is called. */
class Gate {
  open!: () => void;
  readonly promise = new Promise<void>(resolve => this.open = resolve);
}

/** A call to `Persistor.persistDifference`. */
class Save {
  resolve!: () => void;
  reject!: (error: any) => void;
  readonly promise = new Promise<void>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });

  constructor(readonly lastPersistedState: S | null, readonly newState: S) {
  }
}

/**
 * A persistor where each save keeps running until the scenario calls `finish` or `fail`,
 * unless `autoFinish` is true. The saved state (`stored`) changes when the save finishes.
 */
class ControlledPersistor extends Persistor<S> {
  /** The saved state. */
  stored: S | null;

  /** All calls to `persistDifference`, in order. */
  readonly saves: Save[] = [];

  /** If set, `readState` only finishes after it opens. */
  readCanFinish: Gate | null = null;

  /** If set, `readState` throws this error. */
  readError: Error | null = null;

  /** If set, `deleteState` only finishes after it opens. */
  deleteCanFinish: Gate | null = null;

  private readonly _throttle: number | null;
  private readonly _autoFinish: boolean;
  private readonly _swallowErrors: boolean;

  constructor({ stored, throttle = null, autoFinish = false, swallowErrors = false }: {
    stored: S | null,
    throttle?: number | null,
    // If true, each save finishes right away.
    autoFinish?: boolean,
    // If true, `wrapError` swallows the errors of the saves that fail.
    swallowErrors?: boolean,
  }) {
    super();
    this.stored = stored;
    this._throttle = throttle;
    this._autoFinish = autoFinish;
    this._swallowErrors = swallowErrors;
  }

  get throttle(): number | null {
    return this._throttle;
  }

  async readState(): Promise<S | null> {
    if (this.readCanFinish !== null) await this.readCanFinish.promise;
    if (this.readError !== null) throw this.readError;
    return this.stored;
  }

  async deleteState(): Promise<void> {
    if (this.deleteCanFinish !== null) await this.deleteCanFinish.promise;
    this.stored = null;
  }

  persistDifference(lastPersistedState: S | null, newState: S): Promise<void> {
    const save = new Save(lastPersistedState, newState);
    this.saves.push(save);
    if (this._autoFinish) {
      this.stored = newState;
      save.resolve();
    }
    return save.promise;
  }

  /** Finishes the save with the given `index`, successfully. */
  async finish(index: number): Promise<void> {
    const save = this.saves[index];
    this.stored = save.newState;
    save.resolve();
    await flush();
  }

  /** Finishes the save with the given `index`, with an error. */
  async fail(index: number): Promise<void> {
    this.saves[index].reject(new Error('Save failed'));
    await flush();
  }

  wrapError(error: any): any {
    return this._swallowErrors ? null : error;
  }
}

class SetState extends KissAction<S> {
  constructor(readonly newState: S) {
    super();
  }

  reduce() {
    return this.newState;
  }
}

class SetStateAsync extends KissAction<S> {
  constructor(readonly newState: S, readonly canFinish: Promise<void>) {
    super();
  }

  async reduce() {
    await this.canFinish;
    return () => this.newState;
  }
}

class ReturnNull extends KissAction<S> {
  reduce() {
    return null;
  }
}

class ReturnSameState extends KissAction<S> {
  reduce() {
    return this.state;
  }
}
