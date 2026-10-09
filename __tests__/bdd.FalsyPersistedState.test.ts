import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { Persistor, Store, UpdateStateAction } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Falsy persisted state');

Bdd(feature)
  .scenario('The last persisted state is returned even when it is falsy.')
  .given('A store with a persistor.')
  .when('A falsy state is saved.')
  .then('The last persisted state is that falsy state, not null.')
  .example(val('State', 0))
  .example(val('State', ''))
  .example(val('State', false))
  .run(async (ctx) => {
    const falsy = ctx.example.val('State');
    const store = new Store<any>({initialState: 'start', persistor: new MemPersistor()});
    await store.ready();
    expect(store.getLastPersistedStateFromPersistor()).toBe('start');

    store.dispatchSync(new UpdateStateAction<any>(() => falsy));
    await delayMillis(20);
    expect(store.getLastPersistedStateFromPersistor()).toBe(falsy);
  });

class MemPersistor extends Persistor<any> {
  async readState() {
    return null;
  }

  async deleteState() {
  }

  async saveInitialState(_s: any) {
  }

  async persistDifference(_last: any, _s: any) {
  }

  get throttle() {
    return 0;
  }
}
