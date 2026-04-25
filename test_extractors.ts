import { CopilotExtractor } from './src/core/extractors/CopilotExtractor';
import { CursorExtractor } from './src/core/extractors/CursorExtractor';
import { AntigravityExtractor } from './src/core/extractors/AntigravityExtractor';
import { WindsurfExtractor } from './src/core/extractors/WindsurfExtractor';
import { TraeExtractor } from './src/core/extractors/TraeExtractor';
import { KiroExtractor } from './src/core/extractors/KiroExtractor';

async function main() {
  const extractors = [
    new CopilotExtractor(),
    new CursorExtractor(),
    new AntigravityExtractor(),
    new WindsurfExtractor(),
    new TraeExtractor(),
    new KiroExtractor()
  ];

  console.log('Starting IDE Extractors Test...\n');
  const currentWorkspace = process.cwd();
  console.log(`Current Workspace: ${currentWorkspace}\n`);

  for (const ext of extractors) {
    console.log(`--- Testing ${ext.ideId} ---`);
    const result = await ext.extract(currentWorkspace);
    console.log(`Status: ${result.readStatus}`);
    console.log(`Path: ${result.rawPath}`);
    if (result.errorDetail) {
      console.log(`Error: ${result.errorDetail}`);
    }
    console.log(`Messages Extracted: ${result.messages.length}`);
    if (result.messages.length > 0) {
      const firstMsg = result.messages[0];
      const lastMsg = result.messages[result.messages.length - 1];
      console.log(`[First] ${firstMsg.role}: ${firstMsg.content.substring(0, 100).replace(/\\n/g, ' ')}...`);
      console.log(`[Last]  ${lastMsg.role}: ${lastMsg.content.substring(0, 100).replace(/\\n/g, ' ')}...`);
    }
    console.log('\n');
  }
}

main().catch(console.error);
