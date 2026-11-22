export type FlashKind = "success" | "error" | "info" | "warning";

export type Flash = {
  kind: FlashKind;
  title: string;
  message?: string;
};

export type FlashHandler = (flash: Flash) => void;

export const REGIONS: Array<[value: string, label: string]> = [
  ["us-east-1", "US East (N. Virginia)"],
  ["us-east-2", "US East (Ohio)"],
  ["us-west-1", "US West (N. California)"],
  ["us-west-2", "US West (Oregon)"],
  ["af-south-1", "Africa (Cape Town)"],
  ["ap-east-1", "Asia Pacific (Hong Kong)"],
  ["ap-south-2", "Asia Pacific (Hyderabad)"],
  ["ap-southeast-1", "Asia Pacific (Singapore)"],
  ["eu-central-1", "Europe (Frankfurt)"],
  ["eu-west-1", "Europe (Ireland)"],
  ["eu-west-3", "Europe (Paris)"],
  ["sa-east-1", "South America (Sao Paulo)"],
];

export const ERROR_CODE_REFERENCE: Array<{ code: string; description: string }> = [
  {
    code: "InvalidBucketName",
    description: "The bucket name does not meet S3 naming rules (3-63 characters, lowercase letters, numbers and hyphens).",
  },
  {
    code: "BucketAlreadyExists",
    description: "The bucket name is already used inside this simulator or is reserved by AWS.",
  },
  {
    code: "BucketNotEmpty",
    description: "A bucket must be empty before it can be deleted.",
  },
  {
    code: "NoSuchBucket",
    description: "The requested bucket does not exist.",
  },
  {
    code: "NoSuchKey",
    description: "The requested object key does not exist in the bucket.",
  },
  {
    code: "InvalidObjectState",
    description: "The requested operation is not valid for the object's current state, such as a delete marker.",
  },
];

const CONTENT_TYPES: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  ts: "application/typescript",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  zip: "application/zip",
  gz: "application/gzip",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
};

export function inferContentType(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
