import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { apiBase, ApiError, TOKEN_KEY } from "./api";
import { storage } from "./storage";

/** Длинная сторона фото после уменьшения (docs/TZ.md, 9: фото сжимаются в телефоне до 1600 px). */
const MAX_SIDE = 1600;

/**
 * Снимок только с камеры (решение владельца 2026-09-27): старое или чужое фото из галереи не подсунуть, время снимка
 * ставит сервер. В браузере на телефоне открывается камера, на компьютере — выбор файла. null — съёмку отменили.
 */
export async function takePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new ApiError(0, "camera", "Разрешите приложению доступ к камере в настройках телефона");
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], cameraType: ImagePicker.CameraType.back, quality: 1 });
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  const ctx = ImageManipulator.manipulate(a.uri);
  if (Math.max(a.width, a.height) > MAX_SIDE) ctx.resize(a.width >= a.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return out.uri;
}

/** Фото на сервер как есть, без multipart: тело запроса — сама картинка. Ответ — файл с подписанной ссылкой. */
export async function uploadPhoto(path: string, uri: string): Promise<{ id: string; kind: string; url: string }> {
  const token = await storage.get(TOKEN_KEY);
  let res: Response;
  try {
    const blob = await (await fetch(uri)).blob();
    res = await fetch(apiBase() + path, {
      method: "POST",
      headers: { "content-type": "image/jpeg", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: blob,
    });
  } catch {
    throw new ApiError(0, "offline", "Нет связи с сервером. Проверьте интернет");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? "unknown", data.error?.message ?? "Не удалось загрузить фото");
  return data.file;
}

/** Снять и сразу отправить. null — съёмку отменили. */
export async function shootAndUpload(path: string) {
  const uri = await takePhoto();
  return uri ? uploadPhoto(path, uri) : null;
}
