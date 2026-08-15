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