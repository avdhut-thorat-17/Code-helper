import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({ url: 'http://localhost:6333' });


const COLLECTION_NAME = 'code-files';

export async function initCollection() {
  const collections = await client.getCollections();
  const exists = collections.collections.some((c: any) => c.name === COLLECTION_NAME);

  if (!exists) {
    await client.createCollection(COLLECTION_NAME, {
      vectors: { size: 384, distance: 'Cosine' }, // 384 for MiniLM model
    });
    console.log(`✅ Collection '${COLLECTION_NAME}' created.`);
  } else {
    console.log(`✅ Collection '${COLLECTION_NAME}' already exists.`);
  }
}

export async function upsertEmbedding(id: string, vector: number[], metadata: any) {
  const point = {
    id,
    vector,
    payload: metadata,
  };
  await client.upsert(COLLECTION_NAME, { points: [point] });
  console.log(`✅ Upserted vector for ${metadata.file}`);
}

export async function search(queryVector: number[], topK = 3) {
  const result = await client.search(COLLECTION_NAME, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  });
  return result;
}
