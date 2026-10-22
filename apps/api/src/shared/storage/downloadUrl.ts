/**
 * The same Cloudinary file as a download: `fl_attachment` makes the browser or phone save it under `name` rather than
 * open it. Only image-type deliveries (which is how Cloudinary stores PDFs and pictures) take the flag; a raw file
 * (Word, Excel, PowerPoint) downloads anyway, so its URL is returned as is, as is any URL that is not Cloudinary's.
 */
export function downloadUrlOf(url: string, name: string): string {
  const marker = '/image/upload/';
  const at = url.indexOf(marker);
  if (at === -1 || !url.includes('res.cloudinary.com')) return url;
  // The flag's value may not hold dots, slashes, commas or spaces; Cloudinary adds the extension itself.
  const safe = name.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  const flag = safe ? `fl_attachment:${safe}` : 'fl_attachment';
  return `${url.slice(0, at + marker.length)}${flag}/${url.slice(at + marker.length)}`;
}

