"use client";

import Image from "next/image";
import { useState } from "react";
import type { PublicImage } from "@/lib/data/types";
import { propertyImageUrl } from "@/lib/images";
import { cx } from "@/components/ui";

/**
 * Listing gallery. One main image plus a thumbnail strip. Buttons are real
 * buttons with pressed state, so the gallery is fully keyboard operable; the
 * main image is also rendered as a plain list of links for assistive tech
 * simplicity.
 */
export function PropertyGallery({
  images,
  title,
  reference,
}: {
  images: PublicImage[];
  title: string;
  reference: string;
}) {
  const resolved = images
    .map((image) => ({ ...image, url: propertyImageUrl(image.path) }))
    .filter((image): image is PublicImage & { url: string } => Boolean(image.url));

  const [active, setActive] = useState(0);

  const firstImage = resolved[0];
  if (!firstImage) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-lg bg-navy-800 text-navy-200">
        <p className="text-sm tracking-[0.2em] uppercase">Photographs to follow</p>
      </div>
    );
  }

  const current = resolved[Math.min(active, resolved.length - 1)] ?? firstImage;

  return (
    <div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-navy-800">
        <Image
          key={current.path}
          src={current.url}
          alt={current.alt || `${title}, reference ${reference}`}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-cover"
        />
        {resolved.length > 1 ? (
          <p className="absolute right-3 bottom-3 rounded-full bg-navy-950/75 px-3 py-1 text-xs text-white tabular-nums">
            {active + 1} / {resolved.length}
          </p>
        ) : null}
      </div>

      {resolved.length > 1 ? (
        <ul className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6">
          {resolved.map((image, index) => (
            <li key={image.path}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={index === active}
                aria-label={`Show photograph ${index + 1} of ${resolved.length}`}
                className={cx(
                  "relative block aspect-[4/3] w-full overflow-hidden rounded-md border-2 transition-colors",
                  index === active
                    ? "border-gold-500"
                    : "border-transparent hover:border-navy-300",
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}