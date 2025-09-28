// Shared DM PIN used for authentication and character protection
export const DM_PIN = '123123';

// Optional device fingerprint used to hide DM tools on unauthorized devices.
// Leave this empty to allow any device with the DM PIN to see the tools.
// To restrict the tools to a single device, compute the fingerprint using
// `window.computeDmDeviceFingerprint()` in the browser console and copy the
// resulting string here.
export const DM_DEVICE_FINGERPRINT = '';
