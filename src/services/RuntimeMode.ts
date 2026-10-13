export function isLocalRecommendationMode(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password && url.searchParams.get('mode') === 'local';
  } catch { return false; }
}

export function normalModeUrl(value: string): string {
  const url = new URL(value);
  url.searchParams.delete('mode');
  return url.href;
}
