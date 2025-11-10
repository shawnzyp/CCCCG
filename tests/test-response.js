const { Response: GlobalResponse } = globalThis;

function normalizeHeaderName(name) {
  return typeof name === 'string' ? name.toLowerCase() : String(name ?? '').toLowerCase();
}

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => normalizeHeaderValue(item)).join(', ');
  }
  return typeof value === 'string' || value instanceof String ? String(value) : String(value ?? '');
}

class SimpleHeaders {
  constructor(init = []) {
    this._map = new Map();
    if (Array.isArray(init) || (init && typeof init[Symbol.iterator] === 'function')) {
      for (const entry of init) {
        if (!entry) continue;
        const [key, value] = entry;
        if (key) this.append(key, value);
      }
    } else if (init && typeof init === 'object') {
      for (const [key, value] of Object.entries(init)) {
        if (key) this.append(key, value);
      }
    }
  }

  get(name) {
    return this._map.get(normalizeHeaderName(name)) ?? null;
  }

  set(name, value) {
    if (!name) return;
    this._map.set(normalizeHeaderName(name), normalizeHeaderValue(value));
  }

  append(name, value) {
    if (!name) return;
    const key = normalizeHeaderName(name);
    const normalizedValue = normalizeHeaderValue(value);
    if (!this._map.has(key)) {
      this._map.set(key, normalizedValue);
      return;
    }
    const existing = this._map.get(key);
    this._map.set(key, `${existing}, ${normalizedValue}`);
  }

  delete(name) {
    if (!name) return;
    this._map.delete(normalizeHeaderName(name));
  }

  has(name) {
    return this._map.has(normalizeHeaderName(name));
  }

  forEach(callback, thisArg) {
    for (const [key, value] of this._map.entries()) {
      callback.call(thisArg, value, key, this);
    }
  }

  keys() {
    return this._map.keys();
  }

  values() {
    return this._map.values();
  }

  entries() {
    return this._map.entries();
  }

  [Symbol.iterator]() {
    return this.entries();
  }
}

class SimpleResponse {
  #buffer;

  constructor(body = '', init = {}) {
    this.#buffer = SimpleResponse.#normalizeBody(body);
    this.status = typeof init.status === 'number' ? init.status : 200;
    this.statusText = typeof init.statusText === 'string' ? init.statusText : '';
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new SimpleHeaders(init.headers);
    this.bodyUsed = false;
  }

  static #normalizeBody(body) {
    if (body == null) return Buffer.alloc(0);
    if (Buffer.isBuffer(body)) return Buffer.from(body);
    if (body instanceof Uint8Array) return Buffer.from(body);
    if (body instanceof ArrayBuffer) return Buffer.from(body);
    if (typeof body === 'string' || body instanceof String) return Buffer.from(body);
    return Buffer.from(String(body));
  }

  #consumeBody() {
    if (this.bodyUsed) {
      throw new TypeError('Body has already been consumed.');
    }
    this.bodyUsed = true;
    return Buffer.from(this.#buffer);
  }

  async json() {
    const text = await this.text();
    return text ? JSON.parse(text) : {};
  }

  async text() {
    const buffer = this.#consumeBody();
    return buffer.toString('utf8');
  }

  async arrayBuffer() {
    const buffer = this.#consumeBody();
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  async blob() {
    const buffer = this.#consumeBody();
    if (typeof Blob === 'function') {
      return new Blob([buffer], { type: this.headers.get('content-type') ?? '' });
    }
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return {
      size: buffer.length,
      type: this.headers.get('content-type') ?? '',
      arrayBuffer: async () => arrayBuffer,
      text: async () => buffer.toString('utf8'),
    };
  }

  clone() {
    if (this.bodyUsed) {
      throw new TypeError('Cannot clone a Response whose body is already used.');
    }
    return new SimpleResponse(Buffer.from(this.#buffer), {
      status: this.status,
      statusText: this.statusText,
      headers: Object.fromEntries(this.headers.entries()),
    });
  }
}

Object.defineProperty(SimpleResponse.prototype, Symbol.toStringTag, {
  value: 'Response',
  writable: false,
});

export const TestResponse = typeof GlobalResponse === 'function' ? GlobalResponse : SimpleResponse;
