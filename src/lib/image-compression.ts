/** 上传图片的默认压缩参数：长边 2048px 的 JPEG，70×100mm 打印仍约 400dpi。 */
export const IMAGE_MAX_EDGE = 2048;
export const IMAGE_QUALITY = 0.85;
/** 尺寸已经够小、但体积超过这个值的 JPEG 也重编码。 */
export const RECOMPRESS_BYTES = 1_500_000;

export type UploadPlan = { width: number; height: number; reencode: boolean };

/** 等比缩到长边不超过 maxEdge；小图不放大。 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    !Number.isFinite(maxEdge) ||
    maxEdge < 1
  )
    throw Error("图片尺寸无效");
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** 判断一张图要不要重编码：非 JPEG、需要缩小、或体积偏大。 */
export function uploadPlan(
  image: { width: number; height: number; size: number; type: string },
  maxEdge: number = IMAGE_MAX_EDGE,
): UploadPlan {
  const target = fitWithin(image.width, image.height, maxEdge);
  return {
    ...target,
    reencode:
      image.type !== "image/jpeg" ||
      target.width !== image.width ||
      target.height !== image.height ||
      image.size > RECOMPRESS_BYTES,
  };
}

/**
 * 上传前的统一处理：解码一次（顺带挡掉损坏文件），再按需缩到长边上限并转成 JPEG。
 * 透明区域铺白底，避免 PNG 转 JPEG 后变黑。
 */
export async function prepareUpload(
  file: File,
  options: { keepOriginal?: boolean; maxEdge?: number } = {},
): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw Error("无法读取图片，请重新选择有效文件");
  }
  try {
    const plan = uploadPlan(
      {
        width: bitmap.width,
        height: bitmap.height,
        size: file.size,
        type: file.type,
      },
      options.maxEdge ?? IMAGE_MAX_EDGE,
    );
    if (options.keepOriginal || !plan.reencode) return file;
    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    const context = canvas.getContext("2d");
    if (!context) throw Error("浏览器不支持图片处理");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, plan.width, plan.height);
    context.drawImage(bitmap, 0, 0, plan.width, plan.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY),
    );
    if (!blob) throw Error("图片压缩失败，请重试");
    return new File([blob], "image.jpg", {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
