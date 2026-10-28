export async function api<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const data = (await response
    .json()
    .catch(() => ({ error: "INTERNAL_ERROR" }))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "INTERNAL_ERROR");
  return data as T;
}
export function money(amount: number, currency = "IQD", lang = "ar") {
  return new Intl.NumberFormat(lang === "ar" ? "ar-IQ" : "en-IQ", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "IQD" ? 0 : 2,
  }).format(amount);
}
export function localName(
  row: { name_ar: string; name_en: string },
  lang: string,
) {
  return lang === "ar"
    ? row.name_ar || row.name_en
    : row.name_en || row.name_ar;
}
export function description(
  row: { description_ar: string; description_en: string },
  lang: string,
) {
  return lang === "ar"
    ? row.description_ar || row.description_en
    : row.description_en || row.description_ar;
}
