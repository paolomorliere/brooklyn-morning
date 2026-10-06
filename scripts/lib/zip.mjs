// Just enough ZIP to read one member out of an SEC Financial Statement Data Set.
//
// Each quarterly set is a 60 MB archive holding `sub.txt`, `num.txt`, `pre.txt` and `tag.txt`, and only
// the first two are wanted. Node ships inflate but not an archive reader, so the options were a new
// dependency, shelling out to `unzip`, or sixty lines of central-directory parsing. This is the sixty
// lines: no package to audit, nothing to install, and no assumption about which binaries a runner has.

import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;

/** Find the end-of-central-directory record, scanning back over the comment field. */
function findEocd(buf) {
  const from = Math.max(0, buf.length - 65_557);
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('not a ZIP archive: no end-of-central-directory record');
}

/**
 * Where the central directory starts and how many entries it has.
 *
 * The 32-bit fields saturate at 0xFFFF / 0xFFFFFFFF, and the SEC's sets are nowhere near those limits,
 * but a Zip64 archive would otherwise be read as garbage rather than refused. So when a field is
 * saturated the Zip64 records are read instead.
 */
function directoryOf(buf) {
  const eocd = findEocd(buf);
  let count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || offset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || buf.readUInt32LE(loc) !== EOCD64_LOCATOR_SIG) throw new Error('ZIP needs Zip64 but the locator is missing');
    const eocd64 = Number(buf.readBigUInt64LE(loc + 8));
    if (buf.readUInt32LE(eocd64) !== EOCD64_SIG) throw new Error('ZIP Zip64 end-of-central-directory record is missing');
    count = Number(buf.readBigUInt64LE(eocd64 + 32));
    offset = Number(buf.readBigUInt64LE(eocd64 + 48));
  }
  return { count, offset };
}

/** Pure: the member names in the archive. */
export function listZipEntries(buf) {
  const { count, offset } = directoryOf(buf);
  const names = [];
  let p = offset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL_SIG) throw new Error(`ZIP central directory entry ${i} is malformed`);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/**
 * Pure: one member's bytes, decompressed.
 *
 * Only stored (0) and deflate (8) are supported, which is everything a conventional archive uses. The
 * local file header is re-read rather than trusted from the central directory, because its name and
 * extra-field lengths are what determine where the data actually begins.
 */
export function readZipEntry(buf, name) {
  const { count, offset } = directoryOf(buf);
  let p = offset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL_SIG) throw new Error(`ZIP central directory entry ${i} is malformed`);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const entryName = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const localNameLen = buf.readUInt16LE(localOffset + 26);
      const localExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const data = buf.subarray(start, start + compressedSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`ZIP member ${name} uses compression method ${method}, which is not supported`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`ZIP has no member named ${name} (found: ${listZipEntries(buf).join(', ')})`);
}
