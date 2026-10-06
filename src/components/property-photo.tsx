import Image from "next/image";
import { propertyImageUrl } from "@/lib/images";
import type { PublicImage } from "@/lib/data/types";
import { cx } from "@/components/ui";

/**
 * Listing photograph with a graceful fallback. When a listing has no approved
 * image yet, or the storage URL cannot be resolved, we render a neutral panel
 * instead of a broken image.
 */
export function PropertyPhoto({
  images,
  alt,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  className,
  priority = false,
  rounded = true,
}: {
  images: PublicImage[];
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  rounded?: boolean;
}) {
  const first = images[0];
  const src = first ? propertyImageUrl(first.path) : null;
  const description = first?.alt?.trim() || alt;

  if (!src) {
    return (
      <div
        className={cx(
          "flex items-center justify-center bg-navy-800 text-navy-200",
          rounded && "rounded-t-lg",
          className,
        )}
        aria-hidden="true"
      >
        <span className="px-4 text-center text-xs tracking-[0.2em] uppercase">
          No photograph yet
        </span>
      </div>
    );
  }

  return (
    <div className={cx("relative overflow-hidden bg-navy-800", rounded && "rounded-t-lg", className)}>
      <Image
        src={src}
        alt={description}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}

/** Compact square thumbnail used in CRM image managers and visit rows. */
export function PropertyThumb({
  path,
  alt,
  className,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const src = propertyImageUrl(path);
  if (!src) {
    return (
      <div
        className={cx("flex items-center justify-center bg-navy-800 text-navy-300", className)}
        aria-hidden="true"
      >
        <span className="text-[10px] tracking-[0.15em] uppercase">No photo</span>
      </div>
    );
  }
  return (
    <div className={cx("relative overflow-hidden bg-navy-800", className)}>
      <Image src={src} alt={alt} fill sizes="96px" className="object-cover" />
    </div>
  );
}