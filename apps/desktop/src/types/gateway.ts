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

/**
 * A device paired with this profile.
 *
 * The token itself is never returned. A QR is shown once, when the
 * device is paired; losing it means pairing again rather than the
 * desktop handing out a live credential a second time.
 */
export interface PairedDevice {
  /** First 8 characters of the token. Revoke takes this. */
  tokenId: string;
  /** Enough of the token to tell two rows apart. */
  tokenPreview: string;
  label: string;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  expiresAt: string;
  /** Null means every workspace in the profile, now and later. */
  workspaceIds: string[] | null;
}
