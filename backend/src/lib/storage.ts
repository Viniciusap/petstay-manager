import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import type { FastifyReply } from 'fastify';

function dataDir(): string {
  const d = process.env['DATA_DIR'];
  if (!d) throw new Error('DATA_DIR is required');
  return d;
}

function resolvedPath(relativePath: string): string {
  const full = path.resolve(dataDir(), relativePath);
  const base = path.resolve(dataDir());
  if (!full.startsWith(base + path.sep) && full !== base) {
    throw Object.assign(new Error('Path traversal detected'), { statusCode: 400 });
  }
  return full;
}

export async function saveFile(buffer: Buffer, relativePath: string): Promise<string> {
  const full = resolvedPath(relativePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return relativePath;
}

export async function readFile(relativePath: string): Promise<Buffer> {
  return fs.readFile(resolvedPath(relativePath));
}

export async function deleteFile(relativePath: string): Promise<void> {
  try {
    await fs.unlink(resolvedPath(relativePath));
  } catch {
    // ignore missing files
  }
}

export async function fileExists(relativePath: string | null | undefined): Promise<boolean> {
  if (!relativePath) return false;
  try {
    await fs.access(resolvedPath(relativePath));
    return true;
  } catch {
    return false;
  }
}

export function streamFile(reply: FastifyReply, relativePath: string, downloadName?: string): void {
  const full = resolvedPath(relativePath);
  if (downloadName) void reply.header('Content-Disposition', `attachment; filename="${downloadName}"`);
  void reply.type('application/pdf').send(createReadStream(full));
}

export function resolveFileUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  return `/uploads/${relativePath.replace(/^uploads\//, '')}`;
}
