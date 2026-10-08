import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { OptimisticUpdate, Store, UpdateStateAction, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Optimistic update actions');

class State {
  constructor(readonly items: string[]) {
  }
}

const OLD = ['old'];
const NEW = ['new'];
const SERVER = ['server-truth'];

/** Configurable optimistic update action, used by all scenarios. */
class SaveItems extends OptimisticUpdate<State> {
  constructor(readonly opts: {
    saveError?: Error;
    reload?: () => Promise<any>;
    onSave?: () => void;
    log?: string[];
  }) {
    super();
    if (opts.reload !== undefined) {
      this.reloadValue = async () => {
        opts.log?.push('reload: ' + JSON.stringify(this.state.items));
        return opts.reload!();
      };
    }
  }

  newValue() {
    return NEW;
  }

  getValueFromState(state: State) {
    return state.items;
  }

  applyState(value: any, state: State) {
    return new State(value);
  }

  async saveValue(_newValue: any): Promise<void> {
    this.opts.log?.push('save: ' + JSON.stringify(this.state.items));
    this.opts.onSave?.();
    if (this.opts.saveError) throw this.opts.saveError;
  }
}

Bdd(feature)
  .scenario('A successful save keeps the new value and then applies the reloaded value.')
  .given('An optimistic update action whose save succeeds.')
  .and('Its reload returns the value from the server.')
  .when('The action is dispatched.')
  .then('The new value is applied before saving.')
  .and('The final state has the reloaded value.')
  .and('The action completes OK.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(OLD) });
    const action = new SaveItems({ reload: async () => SERVER, log });

    await store.dispatchAndWait(action);

    expect(log).toEqual(['save: ["new"]', 'reload: ["new"]']);
    expect(store.state.items).toEqual(SERVER);
    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('When the save fails, the action fails with the save error.')
  .given('An optimistic update action whose save throws a UserException.')
  .when('The action is dispatched.')
  .then('The action completes with the save error.')
  .and('The action is marked as failed in the store.')
  .and('The error is shown to the user.')
  .run(async (_) => {
    const error = new UserException('Save failed.');
    const shown: UserException[] = [];
    const store = new Store<State>({
      initialState: new State(OLD),
      showUserException: (exception: UserException, _count: number, next: () => void) => {
        shown.push(exception);
        next();
      },
    });
    const action = new SaveItems({ saveError: error, reload: async () => SERVER });

    await store.dispatchAndWait(action);

    expect(action.status.isCompletedOk).toBe(false);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(error);
    expect(store.isFailed(SaveItems)).toBe(true);
    expect(shown).toEqual([error]);
  });

Bdd(feature)
  .scenario('When the save fails, the rollback happens before the reload, so the reloaded value wins.')
  .given('An optimistic update action whose save fails.')
  .and('Its reload returns the value from the server.')
  .when('The action is dispatched.')
  .then('The state is rolled back to the old value before reloading.')
  .and('The final state has the reloaded value, not the old one.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(OLD) });
    const action = new SaveItems({ saveError: new UserException('Save failed.'), reload: async () => SERVER, log });

    await store.dispatchAndWait(action);

    expect(log).toEqual(['save: ["new"]', 'reload: ["old"]']);
    expect(store.state.items).toEqual(SERVER);
  });

Bdd(feature)
  .scenario('When the save fails and there is no reload, the state is rolled back.')
  .given('An optimistic update action whose save fails.')
  .and('The action does not provide a reload method.')
  .when('The action is dispatched.')
  .then('The state goes back to the old value.')
  .and('The action fails with the save error.')
  .run(async (_) => {
    const error = new UserException('Save failed.');
    const store = new Store<State>({ initialState: new State(OLD) });
    const action = new SaveItems({ saveError: error });

    await store.dispatchAndWait(action);

    expect(store.state.items).toEqual(OLD);
    expect(action.status.originalError).toBe(error);
  });

Bdd(feature)
  .scenario('When the save fails but the state was changed meanwhile, there is no rollback.')
  .given('An optimistic update action whose save fails.')
  .and('While saving, another action changes the same value.')
  .and('The action does not provide a reload method.')
  .when('The action is dispatched.')
  .then('The state keeps the value set by the other action.')
  .and('The action fails with the save error.')
  .run(async (_) => {
    const error = new UserException('Save failed.');
    const store = new Store<State>({ initialState: new State(OLD) });
    const action = new SaveItems({
      saveError: error,
      onSave: () => store.dispatch(new UpdateStateAction(() => new State(['other']))),
    });

    await store.dispatchAndWait(action);

    expect(store.state.items).toEqual(['other']);
    expect(action.status.originalError).toBe(error);
  });

Bdd(feature)
  .scenario('When the reload fails after a successful save, the action fails with the reload error.')
  .given('An optimistic update action whose save succeeds.')
  .and('Its reload throws an error.')
  .when('The action is dispatched.')
  .then('The action fails with the reload error.')
  .and('The state keeps the new value.')
  .run(async (_) => {
    const reloadError = new UserException('Reload failed.');
    const store = new Store<State>({ initialState: new State(OLD) });
    const action = new SaveItems({ reload: async () => { throw reloadError; } });

    await store.dispatchAndWait(action);

    expect(action.status.originalError).toBe(reloadError);
    expect(store.state.items).toEqual(NEW);
  });

Bdd(feature)
  .scenario('When both the save and the reload fail, the action fails with the save error.')
  .given('An optimistic update action whose save fails.')
  .and('Its reload also throws an error.')
  .when('The action is dispatched.')
  .then('The action fails with the save error.')
  .and('The state is rolled back to the old value.')
  .run(async (_) => {
    const saveError = new UserException('Save failed.');
    const store = new Store<State>({ initialState: new State(OLD) });
    const action = new SaveItems({
      saveError,
      reload: async () => { throw new UserException('Reload failed.'); },
    });

    await store.dispatchAndWait(action);

    expect(action.status.originalError).toBe(saveError);
    expect(store.state.items).toEqual(OLD);
  });
