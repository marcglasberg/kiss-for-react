import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, PersistorPrinterDecorator, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('PersistorPrinterDecorator');

Bdd(feature)
  .scenario('The PersistorPrinterDecorator saves a state that can\'t be converted to a string.')
  .given('A store whose persistor is decorated with the PersistorPrinterDecorator.')
  .and('The state is <State>.')
  .when('An action changes the state.')
  .then('The decorated persistor saves the new state.')
  .and('No error is reported.')
  .example(val('State', 'an object with no prototype'))
  .example(val('State', 'an object with a circular reference'))
  .example(val('State', 'an object with a BigInt'))
  .run(async (ctx) => {
    const createState = STATES[ctx.example.val('State')];
    const persistor = new RecordingPersistor();
    const errors: any[] = [];

    const store = new Store<any>({
      initialState: createState(0),
      persistor: new PersistorPrinterDecorator<any>(persistor),
      errorObserver: ({ error }) => {
        errors.push(error);
        return null;
      },
      logger: () => {},
    });
    await store.ready();

    store.dispatch(new SetCount(createState, 1));
    await delayMillis(10);

    expect(errors).toEqual([]);
    expect(persistor.saved.length).toBe(1);
    expect(persistor.saved[0].count).toBe(1);
  });

Bdd(feature)
  .scenario('The PersistorPrinterDecorator prints the content of the states it saves.')
  .given('A store whose persistor is decorated with the PersistorPrinterDecorator.')
  .and('The state is <State>.')
  .when('An action changes the count of the state from 0 to 1.')
  .then('The printed message has the content of the last saved state, and of the new state.')
  .and('It does not print "[object Object]".')
  .example(val('State', 'a class instance'))
  .example(val('State', 'an object with no prototype'))
  .run(async (ctx) => {
    const createState = STATES[ctx.example.val('State')];
    const messages: string[] = [];

    const store = new Store<any>({
      initialState: createState(0),
      persistor: new PersistorPrinterDecorator<any>(new RecordingPersistor()),
      logger: (obj) => messages.push(String(obj)),
    });
    await store.ready();

    store.dispatch(new SetCount(createState, 1));
    await delayMillis(10);

    const message = messages.find((m) => m.includes('persist difference'));
    expect(message).toBeDefined();
    expect(message).toContain('"count":0');
    expect(message).toContain('"count":1');
    expect(message).not.toContain('[object Object]');
  });

Bdd(feature)
  .scenario('The PersistorPrinterDecorator does not describe the states when logging is off.')
  .given('A store whose persistor is decorated with the PersistorPrinterDecorator.')
  .and('The logger is turned off.')
  .when('An action changes the state.')
  .then('The decorated persistor saves the new state.')
  .and('The states are not converted to text.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    let describedCount = 0;
    const createState = (count: number) => ({
      count,
      toJSON() {
        describedCount++;
        return { count };
      },
    });

    const store = new Store<any>({
      initialState: createState(0),
      persistor: new PersistorPrinterDecorator<any>(persistor),
      logger: null,
    });
    await store.ready();

    store.dispatch(new SetCount(createState, 1));
    await delayMillis(10);

    expect(persistor.saved.length).toBe(1);
    expect(describedCount).toBe(0);
  });

class RecordingPersistor extends Persistor<any> {
  saved: any[] = [];

  async readState() {
    return null;
  }

  async deleteState() {
  }

  async persistDifference(_lastPersistedState: any, newState: any) {
    this.saved.push(newState);
  }

  async saveInitialState(_state: any) {
  }

  get throttle(): number | null {
    return null;
  }
}

class SetCount extends KissAction<any> {
  constructor(readonly createState: (count: number) => any, readonly count: number) {
    super();
  }

  reduce() {
    return this.createState(this.count);
  }
}

class CountState {
  constructor(readonly count: number) {
  }
}

const STATES: Record<string, (count: number) => any> = {
  'a class instance': (count) => new CountState(count),
  'an object with no prototype': (count) => Object.assign(Object.create(null), { count }),
  'an object with a circular reference': (count) => {
    const state: any = { count };
    state.self = state;
    return state;
  },
  'an object with a BigInt': (count) => ({ count, big: BigInt(7) }),
};
