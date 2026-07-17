import "server-only";
import { google, sheets_v4 } from "googleapis";

// Named tab ranges pulled from the main Ads Reporting sheet. Column letters are
// generous (A:Z) since we parse by header text, not position — see tabSchemas.ts.
//
// "2026 Total" and "Ecom Campaigns" are intentionally NOT fetched: every
// project's real daily data comes from its own individual sheet instead (see
// snapshot.ts), and every Ecom project already shows up in "Ads Campaign
// details" (identifiable by "Ecom" in its name), making "Ecom Campaigns"
// redundant as a metadata source too.
export const TAB_RANGES = {
  adsCampaignDetails: "'Ads Campaign details'!A1:Z1000",
  leadFullKickOff: "'Lead- Full- Kick off'!A1:Z1000",
  plAds: "'PL Ads '!A1:Z1000", // trailing space is intentional — that's the sheet's real tab name
  okr: "'OKR'!A1:Z500",
} as const;

export type TabKey = keyof typeof TAB_RANGES;
export type RawTabs = Record<TabKey, unknown[][]>;

let cachedSheetsClient: sheets_v4.Sheets | null = null;

function getSheetsClient(): sheets_v4.Sheets {
  if (cachedSheetsClient) return cachedSheetsClient;

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY env vars"
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  cachedSheetsClient = google.sheets({ version: "v4", auth });
  return cachedSheetsClient;
}

/** One batchGet across all named tabs, instead of separate round trips. */
export async function fetchRawTabs(): Promise<RawTabs> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID env var");

  const sheets = getSheetsClient();
  const keys = Object.keys(TAB_RANGES) as TabKey[];
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: keys.map((k) => TAB_RANGES[k]),
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const valueRanges = res.data.valueRanges ?? [];
  const result = {} as RawTabs;
  keys.forEach((key, i) => {
    result[key] = (valueRanges[i]?.values as unknown[][]) ?? [];
  });
  return result;
}

export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function isRateLimitError(err: unknown): boolean {
  const status = (err as { code?: number; response?: { status?: number } })?.code
    ?? (err as { response?: { status?: number } })?.response?.status;
  return status === 429;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)),
  ]);
}

/** Retries on 429s with exponential backoff — refreshing ~100 external sheets can
 * bump into Google's default per-minute read quota. Each attempt is also capped
 * so one hanging call can't stall the whole batch. */
async function withRateLimitRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 4): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await withTimeout(fn(), 15_000, label);
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts || !isRateLimitError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

/**
 * Fetches one tab's full values from an external (per-project) spreadsheet.
 * `preferredTabNames` is a priority list (e.g. Ecom sheets prefer "Advertising
 * Performance", falling back to "Live Ads" — some individual sheets use one,
 * some the other). Tries each name as an exact match first (cheap, common
 * case); if none match exactly, falls back to listing the spreadsheet's tabs
 * and matching the first one that contains any of the names (case-insensitive),
 * since individual project sheets aren't perfectly uniform.
 */
export async function fetchExternalTabValues(
  spreadsheetId: string,
  preferredTabNames: string | string[]
): Promise<unknown[][]> {
  const names = Array.isArray(preferredTabNames) ? preferredTabNames : [preferredTabNames];
  const sheets = getSheetsClient();

  for (const name of names) {
    try {
      const res = await withRateLimitRetry(
        () =>
          sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${name}'!A1:AF5000`,
            valueRenderOption: "UNFORMATTED_VALUE",
          }),
        `values.get ${spreadsheetId} (${name})`
      );
      return (res.data.values as unknown[][]) ?? [];
    } catch (err) {
      if (isRateLimitError(err)) throw err;
      // Exact name didn't exist (or another error) — try the next preferred name.
    }
  }

  const meta = await withRateLimitRetry(
    () => sheets.spreadsheets.get({ spreadsheetId }),
    `spreadsheets.get ${spreadsheetId}`
  );
  for (const name of names) {
    const target = name.trim().toLowerCase();
    const match = meta.data.sheets?.find((s) =>
      (s.properties?.title ?? "").trim().toLowerCase().includes(target)
    );
    if (match?.properties?.title) {
      const res = await withRateLimitRetry(
        () =>
          sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${match.properties!.title}'!A1:AF5000`,
            valueRenderOption: "UNFORMATTED_VALUE",
          }),
        `values.get ${spreadsheetId} (${match.properties.title})`
      );
      return (res.data.values as unknown[][]) ?? [];
    }
  }

  throw new Error(`No matching tab found (tried: ${names.join(", ")})`);
}
