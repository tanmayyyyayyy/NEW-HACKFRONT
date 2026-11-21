"use client";

// Consumed after same-tab navigation. No URL, cookie or web-storage token.
let pending: { userId:string; repository:string; token:string } | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;
export function transferPrivateAccess(value: NonNullable<typeof pending>) {
  clearTimeout(expiry);
  pending = value;
  expiry = setTimeout(() => { pending = undefined; }, 30000);
}
export function takePrivateAccess(userId:string) {
  const result = pending;
  pending = undefined;
  clearTimeout(expiry);
  return result?.userId === userId ? result : undefined;
}
