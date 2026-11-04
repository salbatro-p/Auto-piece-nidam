import { createHmac } from 'node:crypto';
if (process.env.DEMO_MODE !== 'true' || !process.env.DEMO_TOTP_SECRET)
  throw new Error('Only available for isolated demo mode');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let bits = '';
for (const char of process.env.DEMO_TOTP_SECRET) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
const key = Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2)));
const count = Buffer.alloc(8);
count.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
const digest = createHmac('sha1', key).update(count).digest();
const offset = digest[19] & 15;
console.log(String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0'));
