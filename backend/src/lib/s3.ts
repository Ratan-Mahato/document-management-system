import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { env } from "../config/env";

export const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  // The SDK's newer default (WHEN_SUPPORTED) adds an x-amz-checksum-* query
  // param to presigned URLs. A plain browser `fetch()` PUT (what the frontend
  // uses to upload straight to S3/MinIO) never sends that header, so the
  // request gets rejected as "headers present which were not signed". Only
  // compute/require checksums when the API call actually demands one.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export function buildObjectKey(ownerId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `documents/${ownerId}/${randomUUID()}-${safeName}`;
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
  });
  return getSignedUrl(s3Client, command, {
    expiresIn: env.S3_PRESIGN_UPLOAD_TTL_SECONDS,
  });
}

export async function getPresignedDownloadUrl(
  key: string,
  downloadFileName?: string,
  disposition: "attachment" | "inline" = "attachment"
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ResponseContentDisposition: downloadFileName
      ? `${disposition}; filename="${downloadFileName.replace(/"/g, "")}"`
      : disposition,
  });
  return getSignedUrl(s3Client, command, {
    expiresIn: env.S3_PRESIGN_DOWNLOAD_TTL_SECONDS,
  });
}

export async function deleteObject(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key })
  );
}

const MAX_EXTRACTED_TEXT_BYTES = 200_000;

/**
 * Reads up to MAX_EXTRACTED_TEXT_BYTES of an object as UTF-8 text, for search
 * indexing of plain-text file content. Only meant to be called for text-ish
 * mime types; binary formats (PDF, docx, images) are not parsed.
 */
export async function getObjectText(key: string): Promise<string | null> {
  try {
    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key })
    );
    const body = result.Body;
    if (!body) return null;

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    // @ts-expect-error - Body is a Node Readable in the Node runtime
    for await (const chunk of body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > MAX_EXTRACTED_TEXT_BYTES) {
        chunks.push(buf.subarray(0, buf.length - (totalBytes - MAX_EXTRACTED_TEXT_BYTES)));
        break;
      }
      chunks.push(buf);
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch {
    return null;
  }
}
