import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FinancialSnapshot } from "@/lib/types";

/**
 * Runtime snapshot store — where uploaded data lives AFTER the bundled
 * snapshot.json (which is only the build-time fallback).
 *
 *   - Production (Vercel): Vercel Blob, when BLOB_READ_WRITE_TOKEN is set.
 *     (Create a Blob store in the Vercel dashboard → the token is injected
 *     automatically.) Vercel's filesystem is read-only, so Blob is required for
 *     uploads to persist there.
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
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

async function writeJson(blobKey: string, localFile: string, data: unknown): Promise<string> {
  const body = JSON.stringify(data);
  if (hasBlob()) {
    const { put } = await import("@vercel/blob");
    const res = await put(blobKey, body, {
      access: "public",
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
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: blobKey, limit: 1 });
      if (!blobs.length) return null;
      // Cache the payload (revalidate window + on-demand bust via the
      // "snapshot" tag, which both write paths invalidate). This avoids
      // re-downloading the blob on every render — cheaper and faster.
      const res = await fetch(blobs[0].url, { next: { revalidate: 600, tags: ["snapshot"] } });
      if (!res.ok) return null;
      return (await res.json()) as T;
    }
    return JSON.parse(await fs.readFile(localFile, "utf8")) as T;
  } catch {
    return null;
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
  const body = JSON.stringify(snapshot, null, 2);

  if (hasBlob()) {
    const { put } = await import("@vercel/blob");
    const res = await put(BLOB_KEY, body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.url;
  }

  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, body, "utf8");
  return LOCAL_FILE;
}

export async function readRuntimeSnapshot(): Promise<FinancialSnapshot | null> {
  try {
    if (hasBlob()) {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
      if (!blobs.length) return null;
      // Cache the payload (revalidate window + on-demand bust via the
      // "snapshot" tag, which both write paths invalidate). This avoids
      // re-downloading the blob on every render — cheaper and faster.
      const res = await fetch(blobs[0].url, { next: { revalidate: 600, tags: ["snapshot"] } });
      if (!res.ok) return null;
      return (await res.json()) as FinancialSnapshot;
    }
    const text = await fs.readFile(LOCAL_FILE, "utf8");
    return JSON.parse(text) as FinancialSnapshot;
  } catch {
    return null; // nothing uploaded yet → caller uses bundled fallback
  }
}

/** Where uploads are being persisted, for display in the UI. */
export function storeKind(): "vercel-blob" | "local-file" {
  return hasBlob() ? "vercel-blob" : "local-file";
}
