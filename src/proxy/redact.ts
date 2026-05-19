export function redactProxyUrl(url: string): string {
  return url.replace(/:\/\/([^:@/]+):[^@]+@/, '://$1:***@');
}
