import crypto from "node:crypto";

export function verifyAdminPassword(candidate: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected || typeof candidate !== "string") {
    return false;
  }

  const expectedBuf = Buffer.from(expected, "utf8");
  const candidateBuf = Buffer.from(candidate.trim(), "utf8");

  if (expectedBuf.length !== candidateBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, candidateBuf);
}
