// GitHub stores some release asset punctuation as dots.
export function toGitHubAssetName(fileName: string): string {
  return fileName
    .replace(/[^A-Za-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');
}

export function toGitHubAssetKey(fileName: string): string {
  return toGitHubAssetName(fileName).toLowerCase();
}
