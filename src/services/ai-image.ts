import { AI_LIMITS, type AiImage } from "../lib/ai-types.ts";

function matchesMime(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob?.type === "image/jpeg"
          ? resolve(blob)
          : reject(Error("图片 JPEG 编码失败")),
      "image/jpeg",
      quality,
    ),
  );
}

/** Produces request data only. Preview object URLs are owned and revoked by the UI. */
export async function prepareAiImage(file: File): Promise<AiImage> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw Error("请选择 JPEG、PNG 或 WebP 图片");
  }
  if (file.size > AI_LIMITS.originalBytes)
    throw Error("原始图片不能超过 10 MiB");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!matchesMime(header, file.type))
    throw Error("图片文件内容与 JPEG、PNG 或 WebP 类型不匹配");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw Error("图片无法解码，请选择有效图片");
  }
  const canvas = document.createElement("canvas");
  try {
    if (!bitmap.width || !bitmap.height) throw Error("图片尺寸无效");
    const originalSide = Math.max(bitmap.width, bitmap.height);
    let side = Math.min(originalSide, AI_LIMITS.imageSide);
    const context = canvas.getContext("2d");
    if (!context) throw Error("浏览器不支持图片处理");
    for (;;) {
      const scale = side / originalSide;
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await encode(canvas, quality);
        if (blob.size <= AI_LIMITS.imageBytes) {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 8192) {
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 8192),
            );
          }
          return { mime: "image/jpeg", base64: btoa(binary) };
        }
      }
      if (side <= 400) throw Error("图片压缩后仍超过 2 MiB，请选择更小的图片");
      side = Math.max(400, Math.floor(side / 2));
    }
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
