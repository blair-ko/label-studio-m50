export const SERVICE = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';
export const IO = 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f';
export const HEAD = 112;
export const DOTS_PER_MM = 8;
// Estimated from the M50's measured top and bottom margins.
export const PRINT_GUIDE_HEIGHT_MM = 12;

export function bitmapFromImage(image) {
  const {width, height, data} = image;
  if (height > HEAD || width < 1 || width > 800) throw Error('點陣尺寸超出 M50 範圍。');
  const bytes = new Uint8Array(width * 14);
  const top = Math.floor((HEAD - height) / 2);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (data[(y * width + x) * 4] !== 0) continue;
      const headBit = HEAD - 1 - y - top;
      bytes[x * 14 + (headBit >> 3)] |= 0x80 >> (headBit & 7);
    }
  }
  return bytes;
}

export function makeJob(bytes) {
  const rows = bytes.length / 14;
  if (!(bytes instanceof Uint8Array) || !Number.isInteger(rows) || rows < 1 || rows > 800) {
    throw Error('列印資料的尺寸無效。');
  }
  const job = new Uint8Array(30 + bytes.length);
  job.set([0x10,0xff,0xf1,0x02,0x1d,0x76,0x30,0,14,0,rows & 0xff,rows >> 8],12);
  job.set(bytes,24);
  job.set([0x1d,0x0c,0x10,0xff,0xf1,0x45],24 + bytes.length);
  return job;
}

export class Printer {
  #device;
  #io;
  #receiving;
  #pending;
  #changed;
  #closed = false;

  constructor(changed) { this.#changed = changed; }
  get connected() { return Boolean(this.#io && this.#device?.gatt?.connected); }

  async connect() {
    if (this.connected) return;
    if (!navigator.bluetooth) throw Error('此瀏覽器不支援藍牙列印。請使用 Mac 的 Chrome 或 Edge。');
    const device = await navigator.bluetooth.requestDevice({
      filters:[{namePrefix:'Kodak Label_'}], optionalServices:[SERVICE],
    });
    this.#device = device;
    this.#closed = false;
    device.addEventListener('gattserverdisconnected', this.#disconnect);
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE);
      this.#io = await service.getCharacteristic(IO);
      this.#io.addEventListener('characteristicvaluechanged', this.#notification);
      await this.#io.startNotifications();
      const state = await this.status();
      if (state.model !== 'M50') throw Error('這台裝置未回報 M50 型號。');
      this.#changed(state);
      return state;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  #notification = event => {
    const value = event.target.value;
    this.#receiving?.(new Uint8Array(value.buffer,value.byteOffset,value.byteLength));
  };

  #disconnect = () => this.close();

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#pending?.(Error('標籤機已斷線，請確認機器狀態。'));
    this.#io?.removeEventListener('characteristicvaluechanged',this.#notification);
    this.#io = undefined;
    this.#device?.removeEventListener('gattserverdisconnected',this.#disconnect);
    if (this.#device?.gatt?.connected) this.#device.gatt.disconnect();
    this.#device = undefined;
    this.#changed();
  }

  async #exchange(bytes, accept, timeout, finishAfterWrite=false) {
    if (!this.connected) throw Error('請先連接 M50。');
    if (this.#pending) throw Error('標籤機正在處理上一個操作。');
    const io = this.#io;
    let timer, endWait, finish;
    let settled = false;
    const response = new Promise((resolve,reject) => {
      finish = (error, result) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve(result);
      };
      this.#pending = error => finish(error);
      this.#receiving = data => {
        if (settled) return;
        const result = accept(data);
        if (result !== undefined) finish(null,result);
      };
      timer = setTimeout(() => finish(Error('等候標籤機回覆逾時。請查看機器是否已印出，再決定是否重印。')),timeout);
    });
    const writing = (async () => {
      for (let index = 0; index < bytes.length; index += 20) {
        await io.writeValueWithResponse(bytes.subarray(index,index+20));
      }
      if (finishAfterWrite && !settled) endWait=setTimeout(()=>finish(null,false),9000);
    })();
    try {
      const [result] = await Promise.all([response,writing]);
      return result;
    } catch (error) {
      this.close();
      throw error;
    } finally {
      clearTimeout(timer);
      clearTimeout(endWait);
      this.#pending = undefined;
      this.#receiving = undefined;
    }
  }

  status() {
    const decoder = new TextDecoder();
    let text = '';
    return this.#exchange(Uint8Array.of(0x10,0xff,0x70),data => {
      text += decoder.decode(data,{stream:true});
      const f = text.split('|');
      const stock = f[8]?.replace(/[^\x20-\x7e].*$/s,'').trim();
      if (f.length < 9 || !/^(Continuous|\d+\s*mm)$/i.test(stock)) return;
      return {model:f[0],name:f[1],firmware:f[4],battery:f[6],state:f[7],stock};
    },4500);
  }

  async print(bytes) {
    const status = await this.status();
    if (status.state !== 'ready') throw Error('M50 回報 '+status.state+'。請檢查紙捲與上蓋。');
    return this.#exchange(makeJob(bytes),data => {
      for (let i=0; i<data.length; i++) {
        if (data[i] === 0xff) { i++; continue; }
        if (data[i] === 0xaa) return true;
      }
    },45000,true);
  }
}
