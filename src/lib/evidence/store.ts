import "server-only";
import { randomUUID } from "node:crypto";
import { get, put } from "@vercel/blob";

/** Evidence photos for Cancel/Hold requests. Never public: they are served through /api/evidence to signed-in users. */
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export interface StoredFile {
  body: ReadableStream<Uint8Array> | Uint8Array;
  contentType: string;
}

const LOCAL_PREFIX = "local:";
const globalStore = globalThis as unknown as { __evidence?: Map<string, { bytes: Uint8Array; contentType: string }> };
const local = () => (globalStore.__evidence ??= new Map());

/** Private Vercel Blob when BLOB_READ_WRITE_TOKEN is set; otherwise in-memory (dev/demo only, lost on restart). */
function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Returns the reference to keep in Approvals.evidence_url. */
export async function saveEvidence(file: File): Promise<string> {
  const ext = EVIDENCE_TYPES[file.type];
  if (!ext) throw new Error(`unsupported type ${file.type}`);
  if (file.size > MAX_EVIDENCE_BYTES) throw new Error("file too large");
  if (blobEnabled()) {
    const blob = await put(`evidence/${randomUUID()}.${ext}`, file, { access: "private", contentType: file.type });
    return blob.url;
  }
  const id = randomUUID();
  local().set(id, { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type });
  return `${LOCAL_PREFIX}${id}`;
}

/** Placeholder "photos" for the demo dataset's pending requests. */
function demoEvidence(name: string): StoredFile {
  const label = name === "memo" ? "บันทึกข้อความ: ปรับโครงสร้างสาขา" : "ประกาศ: ปิดปรับปรุงร้าน";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450"><rect width="600" height="450" fill="#eef0e9"/><rect x="60" y="40" width="480" height="370" rx="12" fill="#fff" stroke="#d6dacf"/><text x="300" y="120" font-family="sans-serif" font-size="26" text-anchor="middle" fill="#2a302b">${label}</text><g fill="#d6dacf">${[170, 200, 230, 260, 290, 320].map((y) => `<rect x="110" y="${y}" width="380" height="10" rx="5"/>`).join("")}</g><text x="300" y="385" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#848486">รูปตัวอย่าง (ข้อมูลทดลอง)</text></svg>`;
  return { body: new TextEncoder().encode(svg), contentType: "image/svg+xml" };
}

export async function readEvidence(ref: string): Promise<StoredFile | null> {
  if (ref.startsWith(`${LOCAL_PREFIX}demo-`)) return demoEvidence(ref.slice(`${LOCAL_PREFIX}demo-`.length));
  if (ref.startsWith(LOCAL_PREFIX)) {
    const f = local().get(ref.slice(LOCAL_PREFIX.length));
    return f ? { body: f.bytes, contentType: f.contentType } : null;
  }
  if (!blobEnabled()) return null;
  const res = await get(ref, { access: "private" });
  if (!res || res.statusCode !== 200) return null;
  return { body: res.stream, contentType: res.blob.contentType };
}

/** Same-origin URL the browser can load (the route checks the session). */
export function evidenceHref(ref: string): string {
  return `/api/evidence?ref=${encodeURIComponent(ref)}`;
}
