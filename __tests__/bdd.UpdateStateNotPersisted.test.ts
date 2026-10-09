import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Store, UpdateStateAction } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('UpdateStateAction that does not persist');

Bdd(feature)
  .scenario('A state change that should not be persisted is not saved, when nothing else is waiting to be saved.')
  .given('A store with a persistor, and all state changes already saved.')
  .when('An UpdateStateAction with ifPersists false changes the state.')
  .then('The new state is not saved.')
  .and('A later change is saved normally.')
  .run(async (_) => {
    const persistor = new MemPersistor(50);
    const store = new Store<number>({initialState: 0, persistor});
    await store.ready();
    await delayMillis(60);

    store.dispatchSync(new UpdateStateAction<number>(s => s + 100, false));
    await delayMillis(120);
    expect(store.state).toBe(100);
    expect(persistor.saved).toBe(0);
    expect(persistor.saves).toEqual([0]);

    store.dispatchSync(new Inc());
    await delayMillis(120);
    expect(persistor.saved).toBe(101);
  });

Bdd(feature)
  .scenario('A state change that should not be persisted does not cancel earlier changes waiting for the throttle.')
  .given('A store with a persistor with a throttle.')
  .and('A state change waiting for the throttle period to end before being saved.')
  .when('An UpdateStateAction with ifPersists false changes the state before the throttle period ends.')
  .then('When the throttle period ends, the current state is saved, including the earlier change.')
  .run(async (_) => {
    const persistor = new MemPersistor(50);
    const store = new Store<number>({initialState: 0, persistor});
    await store.ready();
    await delayMillis(60);

    store.dispatchSync(new Inc()); // Throttle has passed, so 1 is saved now.
    await delayMillis(5);
    expect(persistor.saved).toBe(1);

    store.dispatchSync(new Inc()); // 2 waits for the throttle.
    store.dispatchSync(new UpdateStateAction<number>(s => s + 100, false)); // 102

    await delayMillis(120);
    expect(store.state).toBe(102);
    expect(persistor.saved).toBe(102);
  });

Bdd(feature)
  .scenario('A state change that should not be persisted does not cancel changes made while a save is running.')
  .given('A store with a slow persistor.')
  .and('A save is running.')
  .and('A state change happened while it was running, so it waits to be saved.')
  .when('An UpdateStateAction with ifPersists false changes the state before the save finishes.')
  .then('When the running save finishes, the current state is saved, including the earlier change.')
  .run(async (_) => {
    const persistor = new MemPersistor(0, 50);
    const store = new Store<number>({initialState: 0, persistor});
    await store.ready();

    store.dispatchSync(new Inc()); // Starts saving 1, which takes 50ms.
    await delayMillis(5);
    store.dispatchSync(new Inc()); // 2 waits for the save to finish.
    store.dispatchSync(new UpdateStateAction<number>(s => s + 100, false)); // 102

    await delayMillis(200);
    expect(store.state).toBe(102);
    expect(persistor.saved).toBe(102);
  });

class Inc extends KissAction<number> {
  reduce() {
    return this.state + 1;
  }
}

class MemPersistor extends Persistor<number> {
  saved: number | null = null;
  saves: number[] = [];

  constructor(private readonly _throttle: number, private readonly saveDelay = 0) {
    super();
  }

  async readState() {
    return null;
  }

  async deleteState() {
    this.saved = null;
  }

  async saveInitialState(s: number) {
    await this.save(s);
  }

  async persistDifference(_last: number | null, s: number) {
    await this.save(s);
  }

  private async save(s: number) {
    if (this.saveDelay > 0) await delayMillis(this.saveDelay);
    this.saved = s;
    this.saves.push(s);
  }

  get throttle() {
    return this._throttle;
  }
}
