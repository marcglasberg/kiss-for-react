import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('UserException builder methods');

const builders: { [name: string]: (e: UserException) => UserException } = {
  'withTitle': (e) => e.withTitle('New title'),
  'withMessage': (e) => e.withMessage('New message'),
  'withHardCause': (e) => e.withHardCause(new Error('cause')),
  'withDialog': (e) => e.withDialog(false),
  'noDialog': (e) => e.noDialog,
  'withErrorText': (e) => e.withErrorText('Error text'),
  'addProps': (e) => e.addProps({ extra: true }),
  'addCallbacks': (e) => e.addCallbacks(),
};

Bdd(feature)
  .scenario('Builder methods keep the callbacks and props of the exception.')
  .given('A UserException with onOk and onCancel callbacks, and some props.')
  .when('A builder method is called on it.')
  .then('The new exception still calls the same callbacks.')
  .and('The new exception still has the same props.')
  .example(val('Builder', 'withTitle'))
  .example(val('Builder', 'withMessage'))
  .example(val('Builder', 'withHardCause'))
  .example(val('Builder', 'withDialog'))
  .example(val('Builder', 'noDialog'))
  .example(val('Builder', 'withErrorText'))
  .example(val('Builder', 'addProps'))
  .example(val('Builder', 'addCallbacks'))
  .run(async (ctx) => {
    // Given
    let calls: string[] = [];
    const original = new UserException('Message')
      .addCallbacks(() => calls.push('ok'), () => calls.push('cancel'))
      .addProps({ code: 42 });

    // When
    const result = builders[ctx.example.val('Builder') as string](original);

    // Then
    result.onOk?.();
    result.onCancel?.();
    expect(calls).toEqual(['ok', 'cancel']);
    expect(result.props).toMatchObject({ code: 42 });
  });

Bdd(feature)
  .scenario('Builder methods change only their own field.')
  .given('A UserException with message, title, hard cause, error text, dialog turned on, callbacks and props.')
  .when('Each builder method is called on it.')
  .then('Only the field of that builder changes, and all the other fields are kept.')
  .run(async (_) => {
    // Given
    const onOk = () => {};
    const onCancel = () => {};
    const cause = new Error('cause');
    const original = new UserException('Message', {
      title: 'Title', hardCause: cause, errorText: 'Text', onOk, onCancel, props: { code: 42 },
    });

    const expectSame = (e: UserException, changed: { [key: string]: any }) => {
      expect({
        message: e.message, title: e.title, hardCause: e.hardCause, ifOpenDialog: e.ifOpenDialog,
        errorText: e.errorText, onOk: e.onOk, onCancel: e.onCancel, props: e.props,
      }).toEqual({
        message: 'Message', title: 'Title', hardCause: cause, ifOpenDialog: true,
        errorText: 'Text', onOk, onCancel, props: { code: 42 }, ...changed,
      });
      expect(e.onOk).toBe(changed.onOk ?? onOk);
      expect(e.onCancel).toBe(changed.onCancel ?? onCancel);
    };

    // When / Then
    expectSame(original.withTitle('T2'), { title: 'T2' });
    expectSame(original.withMessage('M2'), { message: 'M2' });
    const cause2 = new Error('cause2');
    expectSame(original.withHardCause(cause2), { hardCause: cause2 });
    expectSame(original.withDialog(false), { ifOpenDialog: false });
    expectSame(original.noDialog, { ifOpenDialog: false });
    expectSame(original.withErrorText('Text2'), { errorText: 'Text2' });
    expectSame(original.addProps({ x: 1 }), { props: { code: 42, x: 1 } });
  });
