export const studioBasePath = process.env.NEXT_PUBLIC_STUDIO_BASE_PATH ?? '';

export function studioPath(path: string) {
  return studioBasePath + (path === '/' && studioBasePath ? '' : path);
}
