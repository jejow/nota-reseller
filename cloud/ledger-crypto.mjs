const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const headerSize = 13;
const context = (owner, revision) => encoder.encode('Nota Reseller ledger v1/' + owner + '/' + revision);

export function createLedgerCipher(secret) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
  const raw = Uint8Array.from(atob(secret.replaceAll('-', '+').replaceAll('_', '/') + '='), (char) =>
    char.charCodeAt(0),
  );
  const key = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return {
    async seal(bytes, owner, revision) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: context(owner, revision) },
        await key,
        bytes,
      );
      const packet = new Uint8Array(headerSize + cipher.byteLength);
      packet[0] = 1;
      packet.set(iv, 1);
      packet.set(new Uint8Array(cipher), headerSize);
      return packet.buffer;
    },
    async open(payload, owner, revision) {
      const packet = payload instanceof ArrayBuffer ? new Uint8Array(payload) : Uint8Array.from(payload);
      if (packet[0] !== 1 || packet.length < headerSize + 16) throw new Error('Invalid ledger format');
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: packet.subarray(1, headerSize), additionalData: context(owner, revision) },
        await key,
        packet.subarray(headerSize),
      );
      return JSON.parse(decoder.decode(plain));
    },
  };
}
