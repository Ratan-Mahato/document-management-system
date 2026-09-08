import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "us-east-1",
  endpoint: "http://127.0.0.1:9000",
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: "dms-minio",
    secretAccessKey: "dms-minio-secret",
  },
});

const bucket = "dms-documents";

async function main() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket "${bucket}" already exists.`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Created bucket "${bucket}".`);
  }

  await s3.send(
    new PutBucketVersioningCommand({
      Bucket: bucket,
      VersioningConfiguration: { Status: "Enabled" },
    })
  );
  console.log("Enabled bucket versioning.");
  // Note: this MinIO build handles CORS preflight automatically per-request
  // (reflects the Origin header) and doesn't implement the bucket-level
  // PutBucketCors API, so no explicit CORS configuration step is needed here.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
