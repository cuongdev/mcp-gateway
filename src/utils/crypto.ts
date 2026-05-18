import { hash, verify, Algorithm } from '@node-rs/argon2';

const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 1,
};

export async function hashSecret(secret: string): Promise<string> {
  return hash(secret, OPTIONS);
}

export async function verifySecret(secret: string, hashed: string): Promise<boolean> {
  try {
    return await verify(hashed, secret);
  } catch {
    return false;
  }
}
