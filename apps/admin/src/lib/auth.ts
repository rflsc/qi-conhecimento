export function getAccessToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )access_token=([^;]*)/);
  return match?.[1] ?? null;
}

export function clearAccessToken(): void {
  if (typeof document === 'undefined') return;
  document.cookie = 'access_token=; path=/; max-age=0';
}
