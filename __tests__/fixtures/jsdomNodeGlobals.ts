/**
 * Jest's jsdom environment hides some Node globals that React's streaming renderers need:
 * `setImmediate` (`renderToPipeableStream`), `MessageChannel` (`renderToReadableStream`) and
 * `ReadableStream` (web streams). A real server has them all. Import this module FIRST in a
 * jsdom test file that streams, so that it runs before `react-dom/server` loads.
 */
import { ReadableStream as NodeReadableStream } from 'stream/web';
import { clearImmediate as nodeClearImmediate, setImmediate as nodeSetImmediate } from 'timers';

const g = globalThis as any;

if (typeof g.setImmediate === 'undefined') {
  g.setImmediate = nodeSetImmediate;
  g.clearImmediate = nodeClearImmediate;
}

if (typeof g.MessageChannel === 'undefined') {
  // React's browser renderer creates a channel when it loads, sets `port1.onmessage`, and posts
  // to `port2` to schedule its work. Node's own `MessageChannel` would keep the process alive
  // (its ports are referenced again when `onmessage` is set), so Jest would not exit. This
  // minimal channel does what the renderer needs, with `setImmediate`.
  type Port = { onmessage: ((event: { data: unknown }) => void) | null, postMessage: (data: unknown) => void };
  g.MessageChannel = class ImmediateMessageChannel {
    readonly port1: Port;
    readonly port2: Port;

    constructor() {
      const deliver = (to: () => Port, data: unknown) => nodeSetImmediate(() => to().onmessage?.({ data }));
      this.port1 = { onmessage: null, postMessage: (data) => deliver(() => this.port2, data) };
      this.port2 = { onmessage: null, postMessage: (data) => deliver(() => this.port1, data) };
    }
  };
}

if (typeof g.ReadableStream === 'undefined') {
  g.ReadableStream = NodeReadableStream;
}

export {};
