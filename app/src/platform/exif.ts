/**
 * EXIF, read from the photograph itself.
 *
 * `exifr` reads JPEG and the TIFF-based RAWs (ARW, NEF, CR2, DNG). Only the fields the app uses
 * are asked for, which keeps it from parsing maker notes on a 60 MB file.
 */

import exifr from "exifr";
import { PhotoMetadata } from "@core/images/PhotoMetadata";

export async function readPhotoMetadata(file: File): Promise<PhotoMetadata> {
  const m: PhotoMetadata = {};
  try {
    const tags = (await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "Make", "Model", "BodySerialNumber", "ImageWidth", "ImageHeight", "ExifImageWidth", "ExifImageHeight"],
      translateValues: true,
    })) as Record<string, unknown> | undefined;
    if (!tags) return m;
    const when = tags.DateTimeOriginal ?? tags.CreateDate;
    if (when instanceof Date && !isNaN(when.getTime())) m.captureDate = when;
    else if (typeof when === "string") m.captureDate = PhotoMetadata.parseExifDate(when);
    if (typeof tags.Make === "string") m.cameraMake = tags.Make;
    if (typeof tags.Model === "string") m.cameraModel = tags.Model;
    if (typeof tags.BodySerialNumber === "string") m.bodySerialNumber = tags.BodySerialNumber;
    const w = tags.ExifImageWidth ?? tags.ImageWidth, h = tags.ExifImageHeight ?? tags.ImageHeight;
    if (typeof w === "number") m.pixelWidth = w;
    if (typeof h === "number") m.pixelHeight = h;
  } catch {
    // A file with no EXIF is a file with no capture date, not an error.
  }
  return m;
}
