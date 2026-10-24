/**
 * Blob/dataURL 互换，供图片导入导出复用。
 * dataUrlToBlob 直接解码，不经由 fetch——恢复一个大图包时少一次 data: 地址的 Request/Response 往返。
 */

/** dataURL（如 data:image/jpeg;base64,...）直接解码成 Blob。 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const metadata = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const mime =
    /^data:([^;,]+)/.exec(metadata)?.[1] || "application/octet-stream";
  return new Blob([bytes as unknown as BlobPart], { type: mime });
}

/** Blob 编码成 dataURL 字符串。 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取本机图片失败"));
    reader.readAsDataURL(blob);
  });
}