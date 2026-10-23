/**
 * 极简 ZIP 读写：备份包用「json + 图片二进制」的结构，
 * 比 base64 内嵌小三分之一左右，也能直接用解压软件打开看。
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1)
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const hasCompression = () =>
  typeof CompressionStream !== "undefined" &&
  typeof DecompressionStream !== "undefined";

async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (!hasCompression()) return null;
  const stream = new Blob([data as unknown as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const out = await new Response(stream).arrayBuffer();
  return new Uint8Array(out);
}

export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (!hasCompression()) throw new Error("当前浏览器不支持解压 ZIP");
  const stream = new Blob([data as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export type ZipEntry = { name: string; data: Uint8Array };

export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const compressed = await deflateRaw(entry.data);
    const useDeflate =
      compressed !== null && compressed.length < entry.data.length;
    const payload = useDeflate ? compressed! : entry.data;
    const method = useDeflate ? 8 : 0;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, payload.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, payload.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, payload);
    centrals.push(central);
    offset += local.length + payload.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...locals, ...centrals, end] as unknown as BlobPart[], {
    type: "application/zip",
  });
}

export async function readZip(blob: Blob): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let eocd = -1;
  for (
    let i = bytes.length - 22;
    i >= Math.max(0, bytes.length - 65558);
    i -= 1
  ) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP 结构损坏：找不到目录");
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("ZIP 结构损坏：目录项无效");
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);
    files.set(name, method === 8 ? await inflateRaw(raw) : raw.slice());
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
