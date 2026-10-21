import { useEffect, useState } from "react";
import { imageUrl, resolveImageUrl } from "../services/api";
import type { Photo as Image } from "../lib/types";
export default function Photo({
  image,
  title,
  shareId,
  eager = false,
}: {
  image: Image;
  title: string;
  shareId?: string;
  eager?: boolean;
}) {
  const [resolved, setResolved] = useState({ key: "", src: "" });
  const key = image.src + (shareId || "");
  const src =
    resolved.key === key ? resolved.src : imageUrl(image.src, shareId);
  useEffect(() => {
    let active = true;
    void resolveImageUrl(image.src, shareId).then(
      (url) => {
        if (active) setResolved({ key, src: url });
      },
      () => {
        if (active) setResolved({ key, src: "/missing-image.svg" });
      },
    );
    return () => {
      active = false;
    };
  }, [image.src, shareId, key]);
  return (
    <div className="photo-frame">
      {image.src === '/images/pose-reference-styles.png' && image.panel != null ? (
        <svg viewBox="0 0 768 1024" preserveAspectRatio="xMidYMid slice" role="img" aria-label={title}>
          <svg viewBox={`${image.panel % 3 * 768} ${Math.floor(image.panel / 3) * 1024} 768 1024`} width="768" height="1024" overflow="hidden">
            <image href={src} width="2304" height="2048" preserveAspectRatio="none" />
          </svg>
        </svg>
      ) : image.panel !== undefined && image.panel !== null ? (
        <svg
          viewBox={`${image.panel * 724} 0 724 724`}
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label={title}
          style={{ overflow: "hidden" }}
        >
          <image href={src} width="2172" height="724" />
        </svg>
      ) : (
        <img src={src} alt={title} loading={eager ? "eager" : "lazy"} />
      )}
      <span className="image-label">
        {image.ai ? "AI 生成参考图" : "用户上传图片"}
      </span>
    </div>
  );
}
