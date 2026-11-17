// Temporary fixture generator (not committed). Creates minimal valid PDF + DOCX.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const outDir = path.resolve('apps/api/tests/fixtures');
fs.mkdirSync(outDir, { recursive: true });

// ---------- Minimal valid PDF (text: "John Doe - Software Engineer") ----------
const pdfContent = [
  '%PDF-1.4',
  '1 0 obj',
  '<</Type /Catalog /Pages 2 0 R>>',
  'endobj',
  '2 0 obj',
  '<</Type /Pages /Kids [3 0 R] /Count 1>>',
  'endobj',
  '3 0 obj',
  '<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>',
  'endobj',
  '4 0 obj',
  '<</Length 68>>',
  'stream',
  'BT',
  '/F1 12 Tf',
  '72 720 Td',
  '(John Doe - Software Engineer) Tj',
  'ET',
  'endstream',
  'endobj',
  '5 0 obj',
  '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>',
  'endobj',
  'xref',
  '0 6',
  '0000000000 65535 f ',
  '0000000010 00000 n ',
  '0000000062 00000 n ',
  '0000000114 00000 n ',
  '0000000220 00000 n ',
  '0000000312 00000 n ',
  'trailer',
  '<</Size 6 /Root 1 0 R>>',
  'startxref',
  '385',
  '%%EOF',
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'sample.pdf'), pdfContent);

// ---------- Minimal valid DOCX (stored zip, text: "Jane Doe - Product Manager") ----------
const files = {
  '[Content_Types].xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>',
  '_rels/.rels':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>',
  'word/_rels/document.xml.rels':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>' +
    '</Relationships>',
  'word/document.xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body><w:p><w:r><w:t xml:space="preserve">Jane Doe - Product Manager</w:t></w:r></w:p></w:body>' +
    '</w:document>',
};

const entries = [];
for (const [name, content] of Object.entries(files)) {
  const data = Buffer.from(content, 'utf8');
  const crc = createHash('md5'); // placeholder; we compute CRC32 below
  entries.push({ name, data });
}

// CRC32
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const parts = [];
let offset = 0;
for (const e of entries) {
  const crc = crc32(e.data);
  const nameBuf = Buffer.from(e.name, 'utf8');
  const header = Buffer.alloc(30 + nameBuf.length);
  header.writeUInt32LE(0x04034b50, 0); // signature
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0, 6); // flag
  header.writeUInt16LE(0, 8); // method stored
  header.writeUInt16LE(0, 10); // time
  header.writeUInt16LE(0, 12); // date
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(e.data.length, 18);
  header.writeUInt32LE(e.data.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28); // extra length
  nameBuf.copy(header, 30);
  parts.push(header, e.data);
  offset += header.length + e.data.length;
  e.offset = offset - header.length - e.data.length;
  e.crc = crc;
  e.compSize = e.data.length;
  e.uncompSize = e.data.length;
}

// Central directory
let cdStart = offset;
const cdParts = [];
for (const e of entries) {
  const nameBuf = Buffer.from(e.name, 'utf8');
  const cd = Buffer.alloc(46 + nameBuf.length);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(0, 10);
  cd.writeUInt16LE(0, 12);
  cd.writeUInt32LE(e.crc, 14);
  cd.writeUInt32LE(e.compSize, 18);
  cd.writeUInt32LE(e.uncompSize, 22);
  cd.writeUInt16LE(nameBuf.length, 26);
  cd.writeUInt16LE(0, 28); // extra
  cd.writeUInt16LE(0, 30); // comment
  cd.writeUInt16LE(0, 32); // disk start
  cd.writeUInt16LE(0, 34); // internal attr
  cd.writeUInt32LE(0, 36); // external attr
  cd.writeUInt32LE(e.offset, 42);
  nameBuf.copy(cd, 46);
  cdParts.push(cd);
  offset += cd.length;
}
const cdBuf = Buffer.concat(cdParts);
const cdSize = cdBuf.length;

// End of central directory
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(entries.length, 8);
eocd.writeUInt16LE(entries.length, 10);
eocd.writeUInt32LE(cdSize, 12);
eocd.writeUInt32LE(cdStart, 16);
eocd.writeUInt16LE(0, 20);

const docx = Buffer.concat([...parts, cdBuf, eocd]);
fs.writeFileSync(path.join(outDir, 'sample.docx'), docx);

console.log('Fixtures written to', outDir);
console.log('PDF checksum:', createHash('md5').update(fs.readFileSync(path.join(outDir, 'sample.pdf'))).digest('hex'));
