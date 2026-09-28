const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../../../storage/scientific');

async function storeTextArtifact(content, extension) {
  const buffer = Buffer.from(content, 'utf8');
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const safeExtension = String(extension || 'txt').replace(/[^a-z0-9]/gi, '').toLowerCase();
  await fs.mkdir(root, { recursive: true, mode: 0o750 });
  const filePath = path.join(root, `${checksum}.${safeExtension}`);
  try { await fs.writeFile(filePath, buffer, { flag: 'wx', mode: 0o640 }); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return { checksum, sizeBytes: buffer.length, objectUri: `local-object://scientific/${checksum}.${safeExtension}`, filePath };
}

async function storeFileArtifact(sourcePath, extension) {
  const buffer = await fs.readFile(sourcePath);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const safeExtension = String(extension || path.extname(sourcePath).slice(1) || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase();
  await fs.mkdir(root, { recursive: true, mode: 0o750 });
  const filePath = path.join(root, `${checksum}.${safeExtension}`);
  try { await fs.writeFile(filePath, buffer, { flag: 'wx', mode: 0o640 }); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return { checksum, sizeBytes: buffer.length, objectUri: `local-object://scientific/${checksum}.${safeExtension}`, filePath };
}

function resolveLocalObject(objectUri) {
  const prefix = 'local-object://scientific/';
  if (!String(objectUri).startsWith(prefix)) throw new Error('Unsupported object URI.');
  const filename = String(objectUri).slice(prefix.length);
  if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(filename)) throw new Error('Invalid object key.');
  return path.join(root, filename);
}

module.exports = { storeTextArtifact, storeFileArtifact, resolveLocalObject };
