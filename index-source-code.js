// Better indexing script for source code only
import { QdrantClient } from '@qdrant/js-client-rest';
import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';

// Initialize Qdrant client
const client = new QdrantClient({ url: 'http://localhost:6333' });
const COLLECTION_NAME = 'source-code';

// Load transformer model
let embedder;

async function loadEmbedder() {
  if (!embedder) {
    console.log('Loading MiniLM model...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

// Embed code content
async function embedCode(content) {
  const embedder = await loadEmbedder();
  const output = await embedder(content, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Read source code files only
function readSourceFiles(dirPath, basePath = '') {
  const files = fs.readdirSync(dirPath);
  const sourceFiles = [];

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const relativePath = path.join(basePath, file);
    const stat = fs.statSync(fullPath);

    // Skip build directories and node_modules
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules' && file !== 'dist') {
        sourceFiles.push(...readSourceFiles(fullPath, relativePath));
      }
    } else if (
      (file.endsWith('.ts') || file.endsWith('.tsx') || 
       file.endsWith('.js') || file.endsWith('.jsx') ||
       file.endsWith('.json') || file.endsWith('.md')) &&
      !file.includes('.spec.') && !file.includes('.test.')
    ) {
      const content = fs.readFileSync(fullPath, 'utf8');
      sourceFiles.push({ 
        file: relativePath, 
        fullPath: fullPath,
        content: content.slice(0, 10000) // Limit content size
      });
    }
  }

  return sourceFiles;
}

// Chunk content intelligently
function chunkContent(content, maxLength = 800, fileName = '') {
  // Special handling for package.json files
  if (fileName.endsWith('package.json')) {
    return chunkPackageJson(content);
  }

  // Special handling for README and documentation files
  if (fileName.endsWith('.md')) {
    return chunkMarkdown(content, maxLength);
  }

  // Default code chunking
  return chunkCode(content, maxLength);
}

// Enhanced package.json chunking
function chunkPackageJson(content) {
  const chunks = [];

  try {
    const pkg = JSON.parse(content);

    // Create a comprehensive dependencies summary
    const deps = pkg.dependencies || {};
    const devDeps = pkg.devDependencies || {};
    const allDeps = { ...deps, ...devDeps };

    // Main info chunk
    chunks.push(`Package: ${pkg.name}
Version: ${pkg.version}
Description: ${pkg.description || 'No description'}
Type: ${pkg.type || 'commonjs'}
Main: ${pkg.main || 'index.js'}

This project uses the following libraries and dependencies:
${Object.keys(allDeps).map(dep => `- ${dep}: ${allDeps[dep]}`).join('\n')}

Key technologies: ${Object.keys(allDeps).filter(dep =>
  ['react', 'next', 'vue', 'angular', 'express', 'fastify', 'qdrant', 'transformers', 'openai', 'tailwind'].some(tech => dep.includes(tech))
).join(', ')}`);

    // Dependencies chunk
    if (Object.keys(deps).length > 0) {
      chunks.push(`Production Dependencies:
${Object.entries(deps).map(([name, version]) => `${name}: ${version}`).join('\n')}

These are the main libraries used in production for:
- Frontend: ${Object.keys(deps).filter(d => ['react', 'next', 'vue', 'angular'].some(f => d.includes(f))).join(', ') || 'None'}
- Backend: ${Object.keys(deps).filter(d => ['express', 'fastify', 'koa'].some(f => d.includes(f))).join(', ') || 'None'}
- Database: ${Object.keys(deps).filter(d => ['qdrant', 'mongo', 'postgres', 'redis'].some(f => d.includes(f))).join(', ') || 'None'}
- AI/ML: ${Object.keys(deps).filter(d => ['transformers', 'openai', 'anthropic', 'ollama'].some(f => d.includes(f))).join(', ') || 'None'}`);
    }

    // Dev dependencies chunk
    if (Object.keys(devDeps).length > 0) {
      chunks.push(`Development Dependencies:
${Object.entries(devDeps).map(([name, version]) => `${name}: ${version}`).join('\n')}

Development tools include:
- Build Tools: ${Object.keys(devDeps).filter(d => ['nx', 'webpack', 'vite', 'rollup'].some(f => d.includes(f))).join(', ') || 'None'}
- Testing: ${Object.keys(devDeps).filter(d => ['jest', 'playwright', 'cypress', 'vitest'].some(f => d.includes(f))).join(', ') || 'None'}
- Linting: ${Object.keys(devDeps).filter(d => ['eslint', 'prettier', 'tslint'].some(f => d.includes(f))).join(', ') || 'None'}
- TypeScript: ${Object.keys(devDeps).filter(d => ['typescript', '@types'].some(f => d.includes(f))).join(', ') || 'None'}`);
    }

  } catch (e) {
    // Fallback to text chunking if JSON parsing fails
    chunks.push(content);
  }

  return chunks;
}

// Enhanced markdown chunking
function chunkMarkdown(content, maxLength) {
  const chunks = [];
  const sections = content.split(/^#{1,6}\s+/m);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (section.length > 50) {
      if (section.length <= maxLength) {
        chunks.push(section);
      } else {
        // Split large sections
        const paragraphs = section.split('\n\n');
        let current = '';
        for (const para of paragraphs) {
          if (current.length + para.length > maxLength) {
            if (current) chunks.push(current.trim());
            current = para;
          } else {
            current += (current ? '\n\n' : '') + para;
          }
        }
        if (current) chunks.push(current.trim());
      }
    }
  }

  return chunks.filter(chunk => chunk.length > 50);
}

// Default code chunking (existing logic)
function chunkCode(content, maxLength) {
  const lines = content.split('\n');
  const chunks = [];
  let current = '';
  let inFunction = false;
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track braces for function/class boundaries
    braceCount += (line.match(/{/g) || []).length;
    braceCount -= (line.match(/}/g) || []).length;

    // Check if we're starting a function or class
    if (line.match(/^(export\s+)?(function|class|const\s+\w+\s*=|interface|type)/)) {
      inFunction = true;
    }

    current += line + '\n';

    // Split if we're at a logical boundary and chunk is getting large
    if (current.length > maxLength) {
      if (braceCount === 0 && !inFunction) {
        chunks.push(current.trim());
        current = '';
      } else if (current.length > maxLength * 1.5) {
        // Force split if too large
        chunks.push(current.trim());
        current = '';
        inFunction = false;
        braceCount = 0;
      }
    }

    if (braceCount === 0) {
      inFunction = false;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter(chunk => chunk.length > 50);
}

// Initialize collection
async function initCollection() {
  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);

  if (!exists) {
    await client.createCollection(COLLECTION_NAME, {
      vectors: { size: 384, distance: 'Cosine' },
    });
    console.log(`✅ Collection '${COLLECTION_NAME}' created.`);
  } else {
    console.log(`✅ Collection '${COLLECTION_NAME}' already exists.`);
  }
}

// Upsert embedding
async function upsertEmbedding(id, vector, metadata) {
  const point = {
    id,
    vector,
    payload: metadata,
  };
  await client.upsert(COLLECTION_NAME, { points: [point] });
  console.log(`✅ Indexed: ${metadata.file} (${metadata.chunkIndex + 1}/${metadata.totalChunks})`);
}

// Main function
async function run() {
  try {
    console.log('🚀 Starting source code indexing...');
    
    await initCollection();

    // Index key directories
    const directories = ['apps/code-helper-ui/src', 'libs/code-helper-core/src', '.'];
    let allFiles = [];
    
    for (const dir of directories) {
      if (fs.existsSync(dir)) {
        const files = readSourceFiles(dir);
        allFiles.push(...files);
      }
    }
    
    // Add key config files
    const configFiles = [
      'package.json', 'nx.json', 'tsconfig.base.json', 
      'README.md', 'project-overview.md'
    ];
    
    for (const file of configFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        allFiles.push({ file, fullPath: file, content });
      }
    }

    console.log(`📁 Found ${allFiles.length} source files`);

    let totalChunks = 0;
    for (const f of allFiles) {
      console.log(`📄 Processing: ${f.file}`);
      const chunks = chunkContent(f.content, 800, f.file);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vector = await embedCode(chunk);
        await upsertEmbedding(uuid(), vector, {
          file: f.file,
          fullPath: f.fullPath,
          content: chunk,
          chunkIndex: i,
          totalChunks: chunks.length,
          type: f.file.endsWith('.md') ? 'documentation' :
                f.file.endsWith('.json') ? 'configuration' : 'code'
        });
        totalChunks++;
      }
    }

    console.log(`✅ Source code indexing complete! Processed ${totalChunks} chunks from ${allFiles.length} files.`);
    console.log(`🔍 You can now search your codebase using the chat interface!`);
    
  } catch (error) {
    console.error('❌ Indexing failed:', error);
  }
}

run();
