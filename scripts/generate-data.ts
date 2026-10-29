import { mkdir, writeFile } from 'node:fs/promises';
import { createDemoCsv } from '../server/demo.js';
import { HEADERS } from '../server/analysis.js';

await mkdir('data', { recursive: true });
await writeFile('data/northstar-demo.csv', createDemoCsv());
await writeFile('data/template.csv', HEADERS.join(',') + '\nMG-0001,2026-09-01,EXAMPLE,Accessories,100.00,10.00,1,30.00,4.90,6.50,0.00,0.00\n');
await writeFile('data/invalid-example.csv', HEADERS.join(',') + '\nMG-0001,2026-02-30,EXAMPLE,Accessories,100.00,10.00,1,30.00,4.90,6.50,0.00,0.00\n');
console.log('Generated deterministic seed 73021: data/northstar-demo.csv (504 orders), template.csv, invalid-example.csv.');
