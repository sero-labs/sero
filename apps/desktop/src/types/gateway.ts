/** Data returned when generating a QR code for profile-wide device pairing. */
export interface QrLoginData {
  /** Data URL (SVG, base64) for rendering the QR code in an <img> tag. */
  qrDataUrl: string;
  /** Full login URL that the QR code encodes (e.g. https://host/?token=...). */
  loginUrl: string;
  /** ISO timestamp when the web token expires. */
  expiresAt: string;
  /** Number of days until expiry. */
  expiryDays: number;
}
