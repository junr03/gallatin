// Stock firmware protocol documented by https://github.com/okko/micro2-agent-keys.
// Only send thread status: never rewrite the keymap, firmware, or ambient lighting.
export function reports(message) {
  const bytes = Buffer.from(JSON.stringify(message).replace(/[\u0080-\uffff]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`));
  const output = [];
  for (let offset = 0; offset < bytes.length; offset += 61) {
    const report = Buffer.alloc(64);
    report[0] = 6;
    report[1] = 2;
    report[2] = Math.min(61, bytes.length - offset);
    bytes.copy(report, 3, offset, offset + report[2]);
    output.push(report);
  }
  return output;
}

export class Keyboard {
  constructor(handle, onPress) {
    this.handle = handle;
    this.pending = new Map();
    this.buffer = '';
    this.id = 100;
    this.failure = null;
    handle.on('error', error => this.fail(error));
    handle.on('data', data => {
      if (data[0] !== 6 || data[1] !== 2 || data[2] > 61) return;
      this.buffer += data.subarray(3, 3 + data[2]).toString('utf8');
      const lines = this.buffer.split(/\r?\n/);
      this.buffer = lines.pop();
      if (this.buffer.length > 65536) this.buffer = '';
      for (const line of lines) {
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          clearTimeout(pending.timer);
          if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
          else pending.resolve(message.result);
        } else if (message.result === undefined && message.error === undefined) onPress(message);
      }
    });
  }

  static async open(onPress) {
    const HID = await import('node-hid');
    const devices = await HID.devicesAsync();
    const info = devices.find(d => d.vendorId === 0x303a &&
      d.productId === 0x8298 && d.usagePage === 0xff00 && d.path);
    if (!info) throw new Error('Creator Micro 2 not connected or not visible; check USB and Input Monitoring');
    const handle = await HID.HIDAsync.open(info.path, { nonExclusive: true });
    return new Keyboard(handle, onPress);
  }

  fail(error) {
    this.failure = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  // Caller serializes requests. Firmware accepts numeric IDs below 999.
  async show(threads) {
    if (this.failure) throw this.failure;
    const id = this.id = this.id >= 998 ? 100 : this.id + 1;
    const reply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Keyboard status request timed out'));
      }, 3000);
      this.pending.set(id, { resolve, reject, timer });
    });
    // Attach a rejection handler before awaiting potentially slow USB writes.
    const write = (async () => {
      for (const report of reports({ method: 'v.oai.thstatus', params: threads, id }))
        await this.handle.write(report);
    })();
    try { await Promise.all([write, reply]); }
    catch (error) { this.fail(error); throw error; }
  }

  async close() {
    this.fail(new Error('Keyboard released'));
    await this.handle.close();
  }
}
