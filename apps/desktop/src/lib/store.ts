import type { RouterOutputs } from "@bloxchat/api";
import { load } from "@tauri-apps/plugin-store";

export type AuthSession = RouterOutputs["auth"]["login"];

type StoreSchema = {
  auth: AuthSession | null;
  apiUrl: string;
  logsPath: string;
  imageLoadingEnabled: boolean;
  guiOpacity: number;
  favoritedMedia: string[];
};

export const DEFAULT_API_HOST = "bloxchat.logix.lol";
export const DEFAULT_API_URL = `https://${DEFAULT_API_HOST}`;

const defaults: StoreSchema = {
  auth: null,
  apiUrl: DEFAULT_API_URL,
  logsPath: "",
  imageLoadingEnabled: false,
  guiOpacity: 1,
  favoritedMedia: [],
};

const storePromise = load("store.json", {
  autoSave: true,
  defaults,
});

const getStore = () => storePromise;

const storeGet = async <K extends keyof StoreSchema>(key: K) => {
  const store = await getStore();
  const value = await store.get(key);
  return (value as StoreSchema[K]) ?? defaults[key];
};

const storeSet = async <K extends keyof StoreSchema>(
  key: K,
  value: StoreSchema[K],
) => {
  const store = await getStore();
  await store.set(key, value);
  await store.save();
};

export const normalizeApiUrl = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_API_URL;

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  return withProtocol.replace(/\/+$/, "");
};

export const toWsUrl = (apiUrl: string) =>
  apiUrl.replace(/^https/i, "wss").replace(/^http/i, "ws");

export const getApiUrl = async () => normalizeApiUrl(await storeGet("apiUrl"));

export const setApiUrl = async (value: string) => {
  const normalized = normalizeApiUrl(value);
  await storeSet("apiUrl", normalized);
  return normalized;
};

export const getAuthSession = async () => storeGet("auth");

export const setAuthSession = async (session: AuthSession | null) => {
  await storeSet("auth", session);
};

export const getLogsPath = async () => storeGet("logsPath");

export const setLogsPath = async (value: string) => {
  const normalized = value.trim();
  await storeSet("logsPath", normalized);
  return normalized;
};

export const getImageLoadingEnabled = async () =>
  storeGet("imageLoadingEnabled");

export const setImageLoadingEnabled = async (value: boolean) => {
  await storeSet("imageLoadingEnabled", value);
  return value;
};

export const normalizeGuiOpacity = (value: unknown) => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(numeric)) return defaults.guiOpacity;

  return Math.max(0.2, Math.min(1, numeric));
};

export const getGuiOpacity = async () =>
  normalizeGuiOpacity(await storeGet("guiOpacity"));

export const setGuiOpacity = async (value: number) => {
  const normalized = normalizeGuiOpacity(value);
  await storeSet("guiOpacity", normalized);
  return normalized;
};

export const getFavoritedMedia = async () => storeGet("favoritedMedia");

export const addFavoritedMedia = async (url: string) => {
  const normalized = url.trim();
  if (!normalized) return getFavoritedMedia();

  const current = await getFavoritedMedia();
  if (current.includes(normalized)) return current;

  const next = [normalized, ...current];
  await storeSet("favoritedMedia", next);
  return next;
};

export const removeFavoritedMedia = async (url: string) => {
  const normalized = url.trim();
  if (!normalized) return getFavoritedMedia();

  const current = await getFavoritedMedia();
  const next = current.filter((item) => item !== normalized);
  await storeSet("favoritedMedia", next);
  return next;
};
