import { useEffect, useState } from "react";

type ThumbProps = {
  // null = there is nothing to load, so the fallback shows straight away.
  src: string | null;
  alt?: string;
  className?: string;
  // Shown when there is no src or the image fails to load (a file deleted outside the app).
  fallback: React.ReactNode;
};

// An <img> that never shows the browser's broken-image icon: when the file is gone it draws
// the fallback instead.
export const Thumb: React.FC<ThumbProps> = ({
  src,
  alt = "",
  className,
  fallback,
}) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // A new src (a replaced clip) gets its own chance.
  useEffect(() => {
    setFailedSrc(null);
  }, [src]);

  if (src === null || failedSrc === src) {
    return <>{fallback}</>;
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
};
