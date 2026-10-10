import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('showUserException that throws');

type St = { n: number };

class Fail extends KissAction<St> {
  reduce(): St { throw new UserException('x'); }
}

Bdd(feature)
  .scenario('If showUserException throws once, later user exceptions are still shown.')
  .given('A showUserException that throws the first time it is called.')
  .when('Two actions fail with UserException.')
  .then('showUserException is called for the second one too.')
  .run(async (_) => {
    Store.log = () => {};
    let calls = 0;
    const store = new Store<St>({
      initialState: { n: 0 },
      showUserException: (_e, _count, next) => {
        calls++;
        if (calls === 1) throw new Error('ui');
        next();
      },
    });
    try { store.dispatch(new Fail()); } catch { /* empty */ }
    try { store.dispatch(new Fail()); } catch { /* empty */ }
    expect(calls).toBe(2);
  });

Bdd(feature)
  .scenario('A throwing showUserException does not replace the action error, nor skip the errorObserver.')
  .given('A showUserException that always throws.')
  .and('An errorObserver that records the errors it gets.')
  .when('An action fails with UserException.')
  .then('dispatch does not throw.')
  .and('The errorObserver gets the UserException, not the showUserException error.')
  .and('The action status has the UserException as its error.')
  .run(async (_) => {
    Store.log = () => {};
    const observed: any[] = [];
    const store = new Store<St>({
      initialState: { n: 0 },
      showUserException: () => { throw new Error('ui'); },
      errorObserver: ({ error }) => { observed.push(error); return error; },
    });
    const action = new Fail();
    expect(() => store.dispatch(action)).not.toThrow();
    expect(observed).toHaveLength(1);
    expect(observed[0]).toBeInstanceOf(UserException);
    expect(action.status.wrappedError).toBeInstanceOf(UserException);
  });
