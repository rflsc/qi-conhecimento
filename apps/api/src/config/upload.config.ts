const DEFAULT_MAX_UPLOAD_MB = 150;

export function resolveMaxUploadBytes(): number {
  const maxMb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? DEFAULT_MAX_UPLOAD_MB);
  return maxMb * 1024 * 1024;
}
