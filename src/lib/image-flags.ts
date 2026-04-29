export function smartImageEnabled() {
  return process.env.NEXT_PUBLIC_SMART_IMAGE_ENABLED !== "false";
}

export function nextImageEnabled() {
  return process.env.NEXT_PUBLIC_NEXT_IMAGE_ENABLED !== "false";
}

export function imageMetricsEnabled() {
  return process.env.NEXT_PUBLIC_IMAGE_METRICS_ENABLED !== "false";
}
