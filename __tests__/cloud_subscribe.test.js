import { jest } from '@jest/globals';
import { subscribeCloudSaves } from '../scripts/storage.js';

test('subscribeCloudSaves reacts to cloud events', () => {
  let instance;
  global.EventSource = class {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      instance = this;
    }
    addEventListener(type, cb) {
      this.listeners[type] = cb;
    }
    close() {
      this.closed = true;
    }
  };

  const handler = jest.fn();
  subscribeCloudSaves(handler);
  expect(handler).toHaveBeenCalledTimes(1); // initial cache
  instance.listeners.put({ data: '{}' });
  expect(handler).toHaveBeenCalledTimes(2);
});
