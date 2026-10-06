import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { listZipEntries, readZipEntry } from '../scripts/lib/zip.mjs';

/**
 * A minimal ZIP writer, here only so the reader can be exercised without shipping a binary fixture.
 * It writes the same local-header / central-directory / end-of-central-directory layout the SEC's
 * quarterly archives use.
 */
function makeZip(entries: { name: string; data: Buffer; store?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const body = e.store ? e.data : deflateRawSync(e.data);
    const method = e.store ? 0 : 8;
    const name = Buffer.from(e.name, 'utf8');
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 14); // crc, which this reader does not check
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, body);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

const SUB = 'adsh\tcik\tform\n0001-26-1\t320193\t10-Q\n';
const NUM = Array.from({ length: 5_000 }, (_, i) => `row${i}\tTag${i}\t${i}`).join('\n');

describe('zip — reading an SEC data set', () => {
  const zip = makeZip([
    { name: 'sub.txt', data: Buffer.from(SUB, 'utf8') },
    { name: 'num.txt', data: Buffer.from(NUM, 'utf8') },
    { name: 'readme.txt', data: Buffer.from('stored, not deflated', 'utf8'), store: true },
  ]);

  it('lists the members', () => {
    expect(listZipEntries(zip)).toEqual(['sub.txt', 'num.txt', 'readme.txt']);
  });

  it('reads a deflated member back byte for byte', () => {
    expect(readZipEntry(zip, 'sub.txt').toString('utf8')).toBe(SUB);
    expect(readZipEntry(zip, 'num.txt').toString('utf8')).toBe(NUM);
  });

  it('reads a stored member', () => {
    expect(readZipEntry(zip, 'readme.txt').toString('utf8')).toBe('stored, not deflated');
  });

  it('names what it found when a member is missing', () => {
    expect(() => readZipEntry(zip, 'pre.txt')).toThrow(/no member named pre.txt \(found: sub.txt, num.txt, readme.txt\)/);
  });

  it('refuses a file that is not an archive, rather than reading rubbish', () => {
    expect(() => listZipEntries(Buffer.alloc(100))).toThrow(/not a ZIP archive/);
  });

  it('refuses a compression method it does not implement', () => {
    const odd = Buffer.from(zip);
    // Rewrite the first central-directory entry's method to 9 (deflate64).
    const dirStart = odd.readUInt32LE(odd.length - 6);
    odd.writeUInt16LE(9, dirStart + 10);
    expect(() => readZipEntry(odd, 'sub.txt')).toThrow(/compression method 9/);
  });
});
