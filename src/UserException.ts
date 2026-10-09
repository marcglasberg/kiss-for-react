/**
 * This exception is meant to represent a user input error, and not a bug or
 * a system error. It must not be logged as an error, but instead shown to the
 * user. When dispatched inside a reducer, a dialog will be shown to the user,
 * with the given message.
 *
 * Usage:
 *
 * ```ts
 * // Throws an exception with the given message.
 * throw new UserException('The item already exists');
 *
 * // Throws an exception with the given message and title.
 * throw new UserException('The item already exists', { title: 'Could not add' });
 * ```
 *
 * You can also define a hardCause for the exception:
 * ```ts
 * // Throws an exception with the given message.
 * throw new UserException('The item already exists', {hardCause: someError});
 * ```
 *
 * The user exception is immutable. But you can use some methods to create a modified copy:
 * - withTitle
 * - withMessage
 * - withHardCause
 * - withDialog
 * - withErrorText
 * - addProps
 * - addCallbacks
 */
export class UserException extends Error {

  /**
   * The title of the dialog that shows the message.
   */
  readonly title: string;

  /**
   * The original error that caused the user exception. For example, when validating
   * some user input, if you get a ValidationError, that's the hardCause.
   * Then: `throw new UserException('Invalid number').withHardCause(validationError)`.
   */
  readonly hardCause: any;

  /**
   * If `true`, throwing the exception will show a dialog or similar UI.
   * If `false` you can still show the error in a different way, usually showing `errorText`
   * in the UI element that is responsible for the error.
   */
  readonly ifOpenDialog: boolean;

  /**
   * Some text to be displayed in the UI element that is responsible for the error.
   * For example, a text field could show this as red text, below it.
   * When building your widgets, you can get the `errorText` from the failed action:
   * `errorText = store.exceptionFor(MyAction).errorText`.
   */
  readonly errorText: string | null;

  /**
   * Callback to be called after the user views the error, and taps OK in the dialog.
   */
  readonly onOk?: () => void;

  /**
   * Callback to be called after the user views the error, and taps CANCEL in the dialog.
   */
  readonly onCancel?: () => void;

  private readonly _props: { [key: string]: any };

  constructor(
    message: string,
    {title, hardCause, ifOpenDialog, errorText, onOk, onCancel, props}: {
      title?: string,
      hardCause?: any,
      ifOpenDialog?: boolean,
      errorText?: string | null,
      onOk?: () => void,
      onCancel?: () => void
      props?: { [key: string]: any }
    } = {}) {

    super(message);

    this.name = 'UserException';
    this.title = title ?? '';
    this.hardCause = hardCause;
    this.ifOpenDialog = ifOpenDialog ?? true;
    this.errorText = errorText || null;
    this.onOk = onOk;
    this.onCancel = onCancel;
    this._props = props || {};

    // Maintains proper stack trace for where our error was thrown (only available on V8).
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UserException);
    }
  }

  /**
   * Returns a copy of the props object.
   * You can add properties to the user exception by using `addProps`.
   */
  get props(): { [key: string]: any } {
    return {...this._props};
  }

  /**
   Adds a title to the exception.

   Usage:

   ```ts
   // Throws an exception with the given message and title.
   throw new UserException('The item already exists').withTitle('Could not add');
   ```
   */
  withTitle(title: string): this {
    return this.copy({title});
  }

  /**
   Adds a message to the exception.

   Usage:

   ```ts
   // Throws an exception with the given message and title.
   throw new UserException('The item already exists').withTitle('Could not add');
   ```
   */
  withMessage(message: string): this {
    return this.copy({message});
  }

  /**
   * Adds a hardCause to the exception.
   *
   * Usage:
   *
   * ```ts
   * throw new UserException('The item already exists').withHardCause(someError);
   * ```
   */
  withHardCause(hardCause: any): this {
    return this.copy({hardCause});
  }

  /**
   * If `true`, throwing the exception will show a dialog or similar UI.
   * If `false` you can still show the error in a different way, usually showing `errorText`
   * in the UI element that is responsible for the error.
   *
   * Usage:
   *
   * ```ts
   * throw new UserException('The item already exists').withDialog(false);
   * ```
   *
   */
  withDialog(ifOpenDialog: boolean): this {
    return this.copy({ifOpenDialog});
  }

  /**
   * This exception should NOT open a dialog.
   * Still, the error may be shown in a different way, usually showing [errorText]
   * somewhere in the UI.
   * This is the same as doing: `.withDialog(false)`.
   */
  get noDialog(): this {
    return this.withDialog(false);
  }

  /**
   * Adds some text to be displayed in the UI element that is responsible for the error.
   * For example, a text field could show this as red text, below it.
   *
   * When building your widgets, you can get the `errorText` from the failed action:
   * `errorText = store.exceptionFor(MyAction).errorText`.
   *
   * Usage:
   *
   * ```ts
   * throw new UserException('The item already exists').withDialog(false);
   * ```
   *
   */
  withErrorText(errorText: string | null): this {
    return this.copy({errorText});
  }

  /**
   * Adds `moreProps` to the properties of the `UserException`.
   * If the exception already had `props`, the new `moreProps` will be merged with those.
   */
  addProps(moreProps?: { [key: string]: any }): this {
    if (!moreProps) return this;
    return this.copy({props: {...this._props, ...moreProps}});
  }

  /**
   * Adds callbacks to the `UserException`.
   *
   * This method is used to add `onOk` and `onCancel` callbacks to the `UserException`.
   *
   * The `onOk` callback will be called when the user taps OK in the error dialog.
   * The `onCancel` callback will be called when the user taps CANCEL in the error dialog.
   *
   * If the exception already had callbacks, the new callbacks will be merged with the old ones,
   * and the old callbacks will be called before the new ones.
   */
  addCallbacks(onOk?: () => void, onCancel?: () => void): this {
    let _onOk: (() => void) | undefined;
    let _onCancel: (() => void) | undefined;

    if (this.onOk === undefined)
      _onOk = onOk;
    else
      _onOk = () => {
        this.onOk?.();
        onOk?.();
      };

    if (this.onCancel === undefined)
      _onCancel = onCancel;
    else
      _onCancel = () => {
        this.onCancel?.();
        onCancel?.();
      };

    return this.copy({onOk: _onOk, onCancel: _onCancel});
  }

  /**
   * Returns a new exception with the same fields as this one,
   * except for the ones given in `changes`.
   *
   * The copy has the same prototype as this exception, so it keeps its subclass, and the
   * fields of the subclass. The constructor of the subclass is not called, since it may
   * take different parameters.
   */
  private copy(changes: {
    message?: string,
    title?: string,
    hardCause?: any,
    ifOpenDialog?: boolean,
    errorText?: string | null,
    onOk?: () => void,
    onCancel?: () => void,
    props?: { [key: string]: any }
  }): this {
    const has = (key: string) => Object.prototype.hasOwnProperty.call(changes, key);
    const copy = Object.create(Object.getPrototypeOf(this));
    Object.defineProperties(copy, Object.getOwnPropertyDescriptors(this));

    // Same defaults as the constructor.
    if (has('message')) copy.message = changes.message;
    if (has('title')) copy.title = changes.title ?? '';
    if (has('hardCause')) copy.hardCause = changes.hardCause;
    if (has('ifOpenDialog')) copy.ifOpenDialog = changes.ifOpenDialog ?? true;
    if (has('errorText')) copy.errorText = changes.errorText || null;
    if (has('onOk')) copy.onOk = changes.onOk;
    if (has('onCancel')) copy.onCancel = changes.onCancel;
    if (has('props')) copy._props = changes.props || {};

    // The copy gets its own stack trace, from where it was made, like a new exception would.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(copy, this.copy);
    }

    return copy;
  }
}
