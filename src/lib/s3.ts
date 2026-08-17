import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
const UPLOAD_URL_TTL_SECONDS = 10 * 60;

/**
 * Builds a collision-resistant object key. Keeping uploads namespaced by
 * purpose (`quotes/`, `receipts/`) makes bucket lifecycle rules and IAM
 * scoping easier later, and the timestamp+random prefix means two people
 * uploading a file named `quote.pdf` at the same time never collide.
 */
export function buildObjectKey(
  prefix: "quotes" | "receipts",
  orderId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}/${orderId}/${unique}-${safeName}`;
}

/** Uploads a buffer to S3 and returns the object key it was stored under. */
export async function uploadObject(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET_NAME,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      // Files carry proof of a financial approval decision — keep them
      // private; access is only ever granted via short-lived presigned URLs.
      ServerSideEncryption: "AES256",
    }),
  );
  return params.key;
}

/**
 * Fetches a private object's bytes directly (as opposed to `getDownloadUrl`,
 * which hands the *browser* a link). Used server-side when an object's
 * content has to be read and transformed in-process — e.g. loading the
 * requester's uploaded quote file so it can be stamped for the approval
 * receipt.
 */
export async function downloadObject(key: string): Promise<Buffer> {
  const result = await getClient().send(
    new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET_NAME, Key: key }),
  );
  if (!result.Body) {
    throw new Error(`S3 object "${key}" has no body.`);
  }
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/** The client's PUT to `getUploadUrl`'s URL must include exactly this header — see the comment below. */
export const UPLOAD_SSE_HEADER = { "x-amz-server-side-encryption": "AES256" } as const;

/**
 * Mints a short-lived URL the *browser* can PUT a file to directly, so the
 * file's bytes go straight from the client to S3 and never pass through a
 * Next.js Server Action/function — needed because serverless hosts (e.g.
 * Vercel) cap request bodies well below what a quote file can be. Doesn't
 * pin a `ContentType` in the signature, so the client is free to send
 * whatever `Content-Type` header it wants (or none) with the PUT.
 *
 * `ServerSideEncryption` *is* pinned, to match `uploadObject`'s encryption
 * guarantee — but unlike most `PutObjectCommand` params, the presigner
 * signs this one as a required HTTP header rather than a URL query
 * parameter, so whatever calls the returned URL must send that literal
 * `x-amz-server-side-encryption: AES256` header (see `UPLOAD_SSE_HEADER`)
 * or S3 rejects the upload with `SignatureDoesNotMatch`.
 */
export async function getUploadUrl(
  key: string,
  expiresInSeconds: number = UPLOAD_URL_TTL_SECONDS,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET_NAME,
    Key: key,
    ServerSideEncryption: "AES256",
  });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}

/**
 * Mints a short-lived, read-only URL for a private object. Called on demand
 * (not stored), so access can't outlive the link past `expiresInSeconds`.
 */
export async function getDownloadUrl(
  key: string,
  expiresInSeconds: number = DOWNLOAD_URL_TTL_SECONDS,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.AWS_S3_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}