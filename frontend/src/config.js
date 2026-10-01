// Dynamically determine the API base URL based on the current hostname
// This allows the app to work seamlessly whether accessed via localhost or a network IP
export const API_BASE = `http://${window.location.hostname}:8005`;
