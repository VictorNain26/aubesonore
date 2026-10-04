// ISO 3901: country (2 letters), registrant (3 alphanumerics), year (2 digits),
// designation (5 digits). A malformed code names no recording: it is absent.
const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export function toIsrc(value: unknown): string | null {
  return typeof value === 'string' && ISRC.test(value) ? value : null;
}
