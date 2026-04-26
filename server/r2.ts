import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.R2_API_TOKEN;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_API_TOKEN;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "offload-photos";
const R2_ENDPOINT = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

const r2Enabled = !!(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);

let s3Client: S3Client | null = null;
if (r2Enabled) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function uploadToR2(key: string, data: Buffer, contentType: string): Promise<string> {
  if (!s3Client) throw new Error("R2 not configured");
  await s3Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));
  return key;
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  if (!s3Client) throw new Error("R2 not configured");
  return getSignedUrl(s3Client, new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 3600 });
}

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  if (!s3Client) throw new Error("R2 not configured");
  return getSignedUrl(s3Client, new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  }), { expiresIn: 3600 });
}

export async function deleteFromR2(key: string): Promise<void> {
  if (!s3Client) throw new Error("R2 not configured");
  await s3Client.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  }));
}

export function isR2Enabled(): boolean {
  return r2Enabled;
}
