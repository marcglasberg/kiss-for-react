import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/eventNameSuffix';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: event-name-suffix');

const message = (field: string, className: string, suggestion: string) =>
  `The field \`${field}\` of \`${className}\` is an event. Name it with the \`Evt\` suffix, like \`${suggestion}\`, ` +
  'so that it\'s clear it\'s an event that fires once, and not a value to read.';

Bdd(feature)
  .scenario('Event fields named with the Evt suffix are fine.')
  .given('A state class whose event fields end with Evt: properties, parameter properties, with and without a declared type.')
  .when('The code is linted, with or without type information.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `import { Evt, EvtState, KissAction } from 'kiss-for-react';
class State {
  readonly openDialogEvt: Evt = Evt.spent();
  readonly closeDialogEvt = Evt.spent<string>();
  readonly refreshEvt = new EvtState();
  readonly count: number = 0;
  readonly name = 'x';
  constructor(
    readonly scrollToTopEvt: Evt,
    readonly changeTextEvt: Evt<string> | null,
    readonly pulseEvt: EvtState<number>,
    readonly items: readonly string[],
  ) {}
}
export abstract class Action extends KissAction<State> {}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An event field without the Evt suffix is a warning, with a suggested name.')
  .given('A class with an event field (Evt or EvtState) whose name doesn\'t end with Evt.')
  .when('The code is linted, with or without type information.')
  .then('There is a warning on the field name, suggesting the name with the Evt suffix.')
  .example(val('Type information', true), val('Field', 'readonly scrollToTop: Evt'), val('Name', 'scrollToTop'), val('Suggestion', 'scrollToTopEvt'))
  .example(val('Type information', false), val('Field', 'readonly scrollToTop: Evt'), val('Name', 'scrollToTop'), val('Suggestion', 'scrollToTopEvt'))
  .example(val('Type information', true), val('Field', 'readonly changeText: Evt<string>'), val('Name', 'changeText'), val('Suggestion', 'changeTextEvt'))
  .example(val('Type information', true), val('Field', 'readonly pulse: EvtState<number>'), val('Name', 'pulse'), val('Suggestion', 'pulseEvt'))
  .example(val('Type information', true), val('Field', 'readonly focus: Evt | null'), val('Name', 'focus'), val('Suggestion', 'focusEvt'))
  .example(val('Type information', true), val('Field', 'readonly openDialog = Evt.spent()'), val('Name', 'openDialog'), val('Suggestion', 'openDialogEvt'))
  .example(val('Type information', false), val('Field', 'readonly closeDialog = new Evt()'), val('Name', 'closeDialog'), val('Suggestion', 'closeDialogEvt'))
  .example(val('Type information', true), val('Field', 'readonly highlight = new EvtState(\'x\')'), val('Name', 'highlight'), val('Suggestion', 'highlightEvt'))
  .example(val('Type information', true), val('Field', 'readonly scrollToTopEvent: Evt'), val('Name', 'scrollToTopEvent'), val('Suggestion', 'scrollToTopEvt'))
  .example(val('Type information', true), val('Field', 'readonly event: Evt'), val('Name', 'event'), val('Suggestion', 'eventEvt'))
  .run(async (ctx) => {
    const code = `import { Evt, EvtState } from 'kiss-for-react';
export class State {
  ${ctx.example.val('Field')};
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    const name = ctx.example.val('Name') as string;
    expect(result.messages.map((m) => m.text)).toEqual([name]);
    expect(result.messages[0].message).toBe(message(name, 'State', ctx.example.val('Suggestion') as string));
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('Event parameter properties without the Evt suffix are a warning too.')
  .given('A class whose constructor has event parameter properties without the suffix, one with a default value instead of a type.')
  .when('The code is linted, with or without type information.')
  .then('There is a warning on each of them.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `import { Evt, EvtState } from 'kiss-for-react';
export class Chat {
  constructor(
    readonly messages: readonly string[],
    readonly scrollToTop: Evt,
    public readonly changeText: Evt<string>,
    private pulse: EvtState,
    readonly openDialog = Evt.spent(),
    readonly closeDialogEvt: Evt,
  ) {}
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['scrollToTop', 'changeText', 'pulse', 'openDialog']);
    expect(result.messages[0].message).toBe(message('scrollToTop', 'Chat', 'scrollToTopEvt'));
  });

Bdd(feature)
  .scenario('Events imported with a namespace import are found too.')
  .given('A class with an event field typed kiss.Evt, with import * as kiss.')
  .when('The code is linted.')
  .then('There is a warning.')
  .run(async (_) => {
    const code = `import * as kiss from 'kiss-for-react';
export class State {
  readonly scrollToTop: kiss.Evt = kiss.Evt.spent();
  readonly pulse = new kiss.EvtState();
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['scrollToTop', 'pulse']);
  });

Bdd(feature)
  .scenario('A class named Evt that is not from Kiss is not an event.')
  .given('A local class named Evt, and a class with a field of that type, without the suffix.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `class Evt { constructor(readonly value: boolean) {} }
export class State {
  readonly scrollToTop: Evt = new Evt(true);
  readonly other = Evt.name;
}
`;
    const result = lint(rule, code);
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Not reported in tests.')
  .given('A test file with an event field without the suffix.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `import { Evt } from 'kiss-for-react';
export class State {
  readonly scrollToTop: Evt = Evt.spent();
}
`;
    expect(lint(rule, code, {filename: 'state.test.ts'}).messages).toEqual([]);
    expect(lint(rule, code, {filename: '__tests__/state.ts'}).messages).toEqual([]);
  });
