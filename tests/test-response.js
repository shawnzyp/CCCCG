const { Response: GlobalResponse } = globalThis;

class SimpleHeaders {
  constructor(init = []) {
    this._map = new Map();
    if (Array.isArray(init)) {
      for (const [key, value] of init) {
        if (key) this._map.set(String(key).toLowerCase(), String(value));
      }
    } else if (init && typeof init === 'object') {
      for (const [key, value] of Object.entries(init)) {
        if (key) this._map.set(String(key).toLowerCase(), String(value));
      }
    }
  }

  get(name) {
    return this._map.get(String(name).toLowerCase()) ?? null;
  }

  set(name, value) {
    if (!name) return;
    this._map.set(String(name).toLowerCase(), String(value));
  }

  has(name) {
    return this._map.has(String(name).toLowerCase());
  }

  entries() {
    return this._map.entries();
  }

  [Symbol.iterator]() {
    return this._map[Symbol.iterator]();
  }
}

class SimpleResponse {
  constructor(body = '', init = {}) {
    this._buffer = SimpleResponse.#normalizeBody(body);
    this.status = typeof init.status === 'number' ? init.status : 200;
    this.statusText = init.statusText ?? '';
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new SimpleHeaders(init.headers);
  }

  static #normalizeBody(body) {
    if (body == null) return Buffer.alloc(0);
    if (body instanceof Uint8Array) return Buffer.from(body);
    if (body instanceof ArrayBuffer) return Buffer.from(body);
    if (Buffer.isBuffer(body)) return Buffer.from(body);
    if (typeof body === 'string' || body instanceof String) return Buffer.from(body);
    return Buffer.from(String(body));
  }

  async json() {
    const text = await this.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }

  async text() {
    return this._buffer.toString('utf8');
  }

  async arrayBuffer() {
    return this._buffer.buffer.slice(this._buffer.byteOffset, this._buffer.byteOffset + this._buffer.byteLength);
  }

  async blob() {
    if (typeof Blob === 'function') {
      return new Blob([this._buffer]);
    }
    return {
      size: this._buffer.length,
      type: this.headers.get('content-type') ?? '',
      arrayBuffer: () => this.arrayBuffer(),
      text: () => this.text(),
    };
  }

  clone() {
    return new SimpleResponse(Buffer.from(this._buffer), {
      status: this.status,
      statusText: this.statusText,
      headers: Object.fromEntries(this.headers.entries()),
    });
  }
}

export const TestResponse = typeof GlobalResponse === 'function' ? GlobalResponse : SimpleResponse;
