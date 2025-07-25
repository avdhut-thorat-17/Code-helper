import { embedCode } from './embed.js';
import { search } from './qdrant.js';

async function askQuestion(query: string) {
  const vector = await embedCode(query);
  const results = await search(vector);
  for (const res of results) {
    console.log('📄', res.payload?.file);
    const content = res.payload?.content as string;
    console.log(content?.slice(0, 200), '...\n');
  }
}

askQuestion('What does the layout.tsx file do?');
