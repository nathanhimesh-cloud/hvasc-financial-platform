import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FinancialSnapshot } from "@/lib/types";

/**
 * Runtime snapshot store — where uploaded / ODBC-pushed data lives AFTER the
 * bundled snapshot.json (which is only the build-time fallback).
 *
 *   - Production (Vercel): a PRIVATE Vercel Blob store, when BLOB_READ_WRITE_TOKEN
 *     is set. Blobs are written with `access: "private"` and read back with the
 *     authenticated SDK `get()` — the financial data is never exposed at a public
 *     URL. (Create the Blob store in the Vercel dashboard → token auto-injected.)
 *   - Local dev / anywhere with a writable disk: a JSON file under .data/.
 *
 * Reads/writes degrade gracefully: if neither is available, callers fall back
 * to the bundled snapshot.json.
 */

const BLOB_KEY = "feed/snapshot.json";
const LOCAL_FILE = path.join(process.cwd(), ".data", "snapshot.json");
const INPUTS_BLOB_KEY = "feed/inputs.json";
const LOCAL_INPUTS = path.join(process.cwd(), ".data", "inputs.json");

function hasBlob(): boolean {
  // Two ways the store is available:
  //   - BLOB_READ_WRITE_TOKEN  → explicit token (local dev, external scripts)
  //   - BLOB_STORE_ID          → store connected via OIDC (Vercel's recommended
  //     mode; the SDK exchanges the runtime OIDC token automatically, so no
  //     long-lived token is needed in the deployment).
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

async function writeJson(blobKey: string, localFile: string, data: unknown, pretty = false): Promise<string> {
  const body = JSON.stringify(data, null, pretty ? 2 : undefined);
  if (hasBlob()) {
    const { put } = await import("@vercel/blob");
    const res = await put(blobKey, body, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.url;
  }
  await fs.mkdir(path.dirname(localFile), { recursive: true });
  await fs.writeFile(localFile, body, "utf8");
  return localFile;
}

async function readJson<T>(blobKey: string, localFile: string): Promise<T | null> {
  try {
    if (hasBlob()) {
      // Private blob: read with the authenticated SDK (token), not a public URL.
      // Vercel CDN-caches private reads by default, so this stays cheap/fast.
      const { get } = await import("@vercel/blob");
      const res = await get(blobKey, { access: "private" });
      if (!res || res.statusCode !== 200 || !res.stream) return null;
      const text = await new Response(res.stream).text();
      return JSON.parse(text) as T;
    }
    return JSON.parse(await fs.readFile(localFile, "utf8")) as T;
  } catch {
    return null; // nothing stored yet → caller uses bundled fallback
  }
}

/**
 * The raw parsed rows of each uploaded report, persisted so subsequent uploads
 * can merge (add a FY25 baseline, replace one report) without re-uploading
 * everything. Keyed by report kind.
 */
export interface RuntimeInputs {
  byFunction?: string[][];
  income?: string[][];
  grants?: string[][];
  fy25ByFunction?: string[][];
  /** Monthly Income Statement exports, for the cumulative trend. */
  monthly?: { idx: number; label: string; rows: string[][] }[];
}

export async function writeRuntimeInputs(inputs: RuntimeInputs): Promise<void> {
  await writeJson(INPUTS_BLOB_KEY, LOCAL_INPUTS, inputs);
}

export async function readRuntimeInputs(): Promise<RuntimeInputs | null> {
  return readJson<RuntimeInputs>(INPUTS_BLOB_KEY, LOCAL_INPUTS);
}

export async function writeRuntimeSnapshot(snapshot: FinancialSnapshot): Promise<string> {
  return writeJson(BLOB_KEY, LOCAL_FILE, snapshot, true);
}

export async function readRuntimeSnapshot(): Promise<FinancialSnapshot | null> {
  return readJson<FinancialSnapshot>(BLOB_KEY, LOCAL_FILE);
}

/** Where uploads are being persisted, for display in the UI. */
export function storeKind(): "vercel-blob" | "local-file" {
  return hasBlob() ? "vercel-blob" : "local-file";
}
