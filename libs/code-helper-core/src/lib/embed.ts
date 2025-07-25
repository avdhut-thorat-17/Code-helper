// libs/code-helper-core/src/lib/embed.ts

import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';

// Load transformer model once globally
let embedder: any;

export async function loadEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

// Read all .ts and .js files in a directory
export function readCodeFiles(dirPath: string): { file: string; content: string }[] {
  const files = fs.readdirSync(dirPath);
  const codeFiles: { file: string; content: string }[] = [];

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      codeFiles.push(...readCodeFiles(fullPath));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      codeFiles.push({ file: fullPath, content });
    }
  }

  return codeFiles;
}

// Embed a single file’s content
export async function embedCode(content: string): Promise<number[]> {
  const embedder = await loadEmbedder();
  const output = await embedder(content, { pooling: 'mean', normalize: true });
  return output.data; // array of numbers (vector)
}
