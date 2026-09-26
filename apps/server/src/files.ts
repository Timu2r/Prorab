import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Queryable } from "./db";
import { ApiError, newId } from "./util";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 30;
export const IMAGE_TYPES = ["image/jpeg", "image/png"];

/**
 * Фото хранятся на диске сервера, открываются только по подписанной ссылке на 1 час (docs/TZ.md, правило 14).
 * Приложение сжимает фото до 1600 px ещё в телефоне; здесь только убираем геометки и прочие метаданные.
 */
export class FileService {
  constructor(
    private dir: string,
    private secret: string,
  ) {}

  url(id: string, ttlSec = 3600): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    return `/files/${id}?exp=${exp}&sig=${this.sign(id, exp)}`;
  }

  verify(id: string, exp: string | undefined, sig: string | undefined): boolean {
    const e = Number(exp);
    if (!sig || !Number.isInteger(e) || e < Date.now() / 1000) return false;
    const want = Buffer.from(this.sign(id, e));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  }

  private sign(id: string, exp: number): string {
    return createHmac("sha256", this.secret).update(`${id}.${exp}`).digest("base64url");
  }

  async save(
    q: Queryable,
    f: { requestId: string | null; payoutId: string | null; uploadedBy: string; kind: string; mime: string; data: Buffer },
  ): Promise<string> {
    if (!IMAGE_TYPES.includes(f.mime)) throw new ApiError(415, "bad_type", "Можно загружать только фото JPEG или PNG");
    if (f.data.length > MAX_FILE_BYTES) throw new ApiError(413, "too_big", "Фото больше 10 МБ");
    const clean = cleanImage(f.mime, f.data);
    const id = newId("fil");
    const now = new Date();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${f.mime === "image/png" ? "png" : "jpg"}`;
    await mkdir(dirname(join(this.dir, key)), { recursive: true });
    await writeFile(join(this.dir, key), clean);
    await q.query(
      `INSERT INTO files (id, request_id, payout_id, uploaded_by, kind, storage_key, mime, size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, f.requestId, f.payoutId, f.uploadedBy, f.kind, key, f.mime, clean.length],
    );
    return id;
  }

  async read(q: Queryable, id: string): Promise<{ mime: string; data: Buffer } | null> {
    const [f] = await q.query<{ storage_key: string; mime: string }>(`SELECT storage_key, mime FROM files WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!f) return null;
    return { mime: f.mime, data: await readFile(join(this.dir, f.storage_key)) };
  }
}

const badImage = () => new ApiError(400, "bad_image", "Файл повреждён или это не фото");

export function cleanImage(mime: string, data: Buffer): Buffer {
  return mime === "image/png" ? stripPng(data) : stripJpeg(data);
}

/** Убирает из JPEG блоки APP1 (EXIF с геометками, XMP) и APP13 (IPTC). Картинка не меняется. */
export function stripJpeg(buf: Buffer): Buffer {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw badImage();
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw badImage();
    const marker = buf[i + 1]!;
    if (marker === 0xda) {
      out.push(buf.subarray(i)); // начало данных изображения: остальное копируем как есть
      return Buffer.concat(out);
    }
    const end = i + 2 + buf.readUInt16BE(i + 2);
    if (end > buf.length) throw badImage();
    if (marker !== 0xe1 && marker !== 0xed) out.push(buf.subarray(i, end));
    i = end;
  }
  throw badImage();
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Убирает из PNG блоки с метаданными: eXIf и текстовые. */
export function stripPng(buf: Buffer): Buffer {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw badImage();
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const end = i + 12 + buf.readUInt32BE(i);
    if (end > buf.length) throw badImage();
    const type = buf.toString("latin1", i + 4, i + 8);
    if (!["eXIf", "tEXt", "iTXt", "zTXt"].includes(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") return Buffer.concat(out);
  }
  throw badImage();
}
