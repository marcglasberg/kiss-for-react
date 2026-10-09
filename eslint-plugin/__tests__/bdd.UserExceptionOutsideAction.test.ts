import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/userExceptionOutsideAction';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: user-exception-outside-action');

const prelude = `import { useEffect, useState } from 'react';
import { KissAction, UserException, useDispatch } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
  copy(count: number): State { return new State(count); }
}

class SaveCount extends KissAction<State> {
  constructor(readonly count: number) { super(); }
  reduce() { return this.state.copy(this.count); }
}
`;

const outsideActionMessage = 'This `UserException` is thrown outside of an action, so it\'s not shown to the user.';

Bdd(feature)
  .scenario('A UserException thrown in an event handler of a component is reported.')
  .given('A component that uses useDispatch.')
  .and('An event handler of the component throws a UserException.')
  .when('The code is linted (with or without type information).')
  .then('The throw is reported.')
  .and('The suggestion dispatches a UserExceptionAction instead, and imports it.')
  .and('The suggested code compiles.')
  .run(async (_) => {
    const code = `${prelude}
export function Counter() {
  const dispatch = useDispatch();
  const [text, setText] = useState('');

  const onSave = () => {
    const count = Number(text);
    if (isNaN(count)) throw new UserException('Please enter a valid number');
    dispatch(new SaveCount(count));
  };

  return <div><input value={text} onChange={(e) => setText(e.target.value)} /><button onClick={onSave}>Save</button></div>;
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages.map((m) => m.text)).toEqual(["throw new UserException('Please enter a valid number');"]);
      expect(result.messages[0].message).toContain(outsideActionMessage);
      expect(result.messages[0].suggestions).toEqual(['Dispatch a `UserExceptionAction` instead.']);
      const suggested = result.withSuggestion(0, 0);
      expect(suggested).toContain(`import { KissAction, UserException, UserExceptionAction, useDispatch } from 'kiss-for-react';`);
      expect(suggested).toContain(`if (isNaN(count)) { dispatch(new UserExceptionAction('Please enter a valid number')); return; }`);
      if (types) expect(lint(rule, suggested).typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('A UserException thrown in an effect of a hook is reported.')
  .given('A hook whose useEffect callback throws a UserException, as its last statement.')
  .and('The hook uses useDispatch.')
  .when('The code is linted.')
  .then('The throw is reported.')
  .and('The suggestion dispatches a UserExceptionAction, without a return, and the code compiles.')
  .run(async (_) => {
    const code = `${prelude}
export function useCheckCount(count: number) {
  const dispatch = useDispatch();
  useEffect(() => {
    if (count >= 0) return;
    throw new UserException(\`Invalid count: \${count}\`);
  }, [count]);
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['throw new UserException(`Invalid count: ${count}`);']);
    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain('    dispatch(new UserExceptionAction(`Invalid count: ${count}`));\n  }, [count]);');
    expect(lint(rule, suggested).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('A UserException thrown in the after method of an action is reported.')
  .given('An action whose after method throws a UserException.')
  .when('The code is linted (with or without type information).')
  .then('The throw is reported, saying Kiss ignores errors thrown in after.')
  .and('The suggestion dispatches a UserExceptionAction with this.dispatch, and the code compiles.')
  .run(async (_) => {
    const code = `${prelude}
class Increment extends KissAction<State> {
  reduce() { return this.state.copy(this.state.count + 1); }
  after() {
    if (this.state.count > 10) throw new UserException('Too many');
  }
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages.map((m) => m.text)).toEqual(["throw new UserException('Too many');"]);
      expect(result.messages[0].message).toContain('This `UserException` is thrown in `after`');
      const suggested = result.withSuggestion(0, 0);
      expect(suggested).toContain(`if (this.state.count > 10) { this.dispatch(new UserExceptionAction('Too many')); return; }`);
      if (types) expect(lint(rule, suggested).typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('Without a dispatch function, or with more than a message, there is no suggestion.')
  .given('A component {Case}.')
  .when('The code is linted.')
  .then('The throw is reported, without a suggestion.')
  .example(
    val('Case', 'whose event handler throws, but which has no dispatch function'),
    val('Code', `
export function Counter() {
  const onSave = () => {
    throw new UserException('Please enter a valid number');
  };
  return <button onClick={onSave}>Save</button>;
}
`))
  .example(
    val('Case', 'that throws while rendering, where dispatching would be wrong too'),
    val('Code', `
export const Counter = ({ count }: { count: number }) => {
  const dispatch = useDispatch();
  if (count < 0) throw new UserException('Invalid count');
  return <div>{count}</div>;
};
`))
  .example(
    val('Case', 'whose event handler throws a UserException with a title'),
    val('Code', `
export function Counter() {
  const dispatch = useDispatch();
  const onSave = () => {
    throw new UserException('Please enter a valid number', { title: 'Invalid' });
  };
  return <button onClick={onSave}>Save</button>;
}
`))
  .example(
    val('Case', 'whose event handler throws, and returns a value elsewhere'),
    val('Code', `
export function Counter() {
  const dispatch = useDispatch();
  const parse = (text: string) => {
    if (text === '') throw new UserException('Please enter a number');
    return Number(text);
  };
  return <button onClick={() => parse('1')}>Save</button>;
}
`))
  .run(async (ctx) => {
    const code = prelude + ctx.example.val('Code');
    const result = lint(rule, code);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain(outsideActionMessage);
    expect(result.messages[0].suggestions).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('A UserException thrown where Kiss shows it, or that may be called from an action, is not reported.')
  .given('A UserException thrown {Where}.')
  .when('The code is linted.')
  .then('There are no reports.')
  .example(
    val('Where', 'in reduce, before and wrapError of an action'),
    val('Code', `
class Check extends KissAction<State> {
  before() { if (this.state.count < 0) throw new UserException('Invalid count'); }
  reduce() {
    if (this.state.count > 10) throw new UserException('Too many');
    return this.state.copy(this.state.count + 1);
  }
  wrapError(error: any) { throw new UserException('Failed').withHardCause(error); }
}
`))
  .example(
    val('Where', 'in plain helper functions, which may be called from actions'),
    val('Code', `
function parseCount(text: string) {
  const count = Number(text);
  if (isNaN(count)) throw new UserException('Please enter a valid number');
  return count;
}

const validate = (count: number) => {
  if (count < 0) throw new UserException('Invalid count');
};

function Validate(count: number) {
  if (count < 0) throw new UserException('Invalid count');
}
`))
  .example(
    val('Where', 'in an event handler, inside a try that catches it'),
    val('Code', `
export function Counter() {
  const [error, setError] = useState('');
  const onSave = () => {
    try {
      throw new UserException('Please enter a valid number');
    } catch (e) {
      setError(String(e));
    }
  };
  return <button onClick={onSave}>{error}</button>;
}
`))
  .example(
    val('Where', 'in the after method, inside a function that is not called there'),
    val('Code', `
class Increment extends KissAction<State> {
  reduce() { return this.state.copy(this.state.count + 1); }
  after() {
    const check = () => { throw new UserException('Too many'); };
  }
}
`))
  .run(async (ctx) => {
    const code = prelude + ctx.example.val('Code');
    const result = lint(rule, code);
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Other errors thrown in components are not reported.')
  .given('A component whose event handler throws an Error, which is not a UserException.')
  .when('The code is linted.')
  .then('There are no reports.')
  .run(async (_) => {
    const code = `${prelude}
export function Counter() {
  const onSave = () => { throw new Error('Unexpected'); };
  return <button onClick={onSave}>Save</button>;
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });
