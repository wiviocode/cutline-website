/**
 * What the photograph already says about itself: EXIF for the capture time and camera, and any
 * IPTC a desk's ingest template put there — city, state, venue, the event headline — which the
 * setup screen offers as its starting point.
 */

import exifr from "exifr";
import { PhotoMetadata } from "@core/images/PhotoMetadata";

export async function readPhotoMetadata(file: File): Promise<PhotoMetadata> {
  const m: PhotoMetadata = {};
  try {
    const tags = (await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "SubSecTimeOriginal", "Make", "Model", "BodySerialNumber", "ImageWidth", "ImageHeight", "ExifImageWidth", "ExifImageHeight", "FocalLength", "ExposureTime", "FNumber", "ISO"],
      translateValues: true,
    })) as Record<string, unknown> | undefined;
    if (!tags) return m;
    const when = tags.DateTimeOriginal ?? tags.CreateDate;
    if (when instanceof Date && !isNaN(when.getTime())) {
      const sub = Number(String(tags.SubSecTimeOriginal ?? "").padEnd(3, "0").slice(0, 3));
      m.captureDate = isFinite(sub) && sub > 0 ? new Date(when.getTime() + sub) : when;
    } else if (typeof when === "string") m.captureDate = PhotoMetadata.parseExifDate(when);
    if (typeof tags.Make === "string") m.cameraMake = tags.Make;
    if (typeof tags.Model === "string") m.cameraModel = tags.Model;
    if (typeof tags.BodySerialNumber === "string") m.bodySerialNumber = tags.BodySerialNumber;
    const w = tags.ExifImageWidth ?? tags.ImageWidth, h = tags.ExifImageHeight ?? tags.ImageHeight;
    if (typeof w === "number") m.pixelWidth = w;
    if (typeof h === "number") m.pixelHeight = h;
    const n = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? v : undefined);
    m.focalLength = n(tags.FocalLength);
    m.exposureTime = n(tags.ExposureTime);
    m.fNumber = n(tags.FNumber);
    m.iso = n(Array.isArray(tags.ISO) ? tags.ISO[0] : tags.ISO);
  } catch {
    // A file with no EXIF is a file with no capture date, not an error.
  }
  return m;
}

export interface EmbeddedIPTC {
  city: string;
  state: string;
  venue: string;
  headline: string;
  description: string;
}

/** The IPTC/XMP location and headline a desk's ingest already wrote, if any. */
export async function readEmbeddedIPTC(file: File): Promise<EmbeddedIPTC> {
  const out: EmbeddedIPTC = { city: "", state: "", venue: "", headline: "", description: "" };
  try {
    const t = (await exifr.parse(file, { xmp: true, iptc: true, tiff: false, exif: false, gps: false })) as Record<string, unknown> | undefined;
    if (!t) return out;
    const s = (...keys: string[]) => {
      for (const k of keys) {
        const v = t[k];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (v && typeof v === "object" && "value" in (v as object)) { const x = (v as { value: unknown }).value; if (typeof x === "string" && x.trim()) return x.trim(); }
      }
      return "";
    };
    out.city = s("City");
    out.state = s("State", "ProvinceState");
    out.venue = s("Location", "Sublocation", "SubLocation");
    out.headline = s("Headline");
    out.description = s("description", "Caption", "Caption-Abstract");
  } catch { /* nothing embedded */ }
  return out;
}
