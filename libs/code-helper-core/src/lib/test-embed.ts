import { readCodeFiles, embedCode } from './embed.js';
import { initCollection, upsertEmbedding } from './qdrant.js';
import { v4 as uuid } from 'uuid';

// ✅ Chunking function
function chunkContent(content: string, maxLength = 500): string[] {
  const lines = content.split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if ((current + line).length > maxLength) {
      chunks.push(current);
      current = '';
    }
    current += line + '\n';
  }
  if (current) chunks.push(current);
  return chunks;
}

async function run() {
  await initCollection();

  const files = readCodeFiles('apps/code-helper-ui');

  for (const f of files) {
    const chunks = chunkContent(f.content);
    for (const chunk of chunks) {
      const vector = await embedCode(chunk);
      await upsertEmbedding(uuid(), vector, {
        file: f.file,
        content: chunk,
      });
    }
  }

  console.log('✅ All chunks embedded and indexed to Qdrant.');
}

run();
