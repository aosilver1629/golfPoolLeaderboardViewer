"use client";

export default function LocalTimestamp({ isoString }: { isoString: string }) {
  return <>{new Date(isoString).toLocaleString()}</>;
}
