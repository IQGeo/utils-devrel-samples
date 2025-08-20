const fs = require('fs');
const { parse } = require('comment-parser');

// file path
// const filePath = './comms/public/js/api/structureManagerPlugin.js';


const args = process.argv.slice(2);
const filePath = args[0];
const outputPath = args[1] || './functionDescriptions.json';

if (!fs.existsSync(filePath)) {
  console.error(`Input file not found: ${filePath}`);
  process.exit(1);
}

const code = fs.readFileSync(filePath, 'utf8');
const lines = code.split('\n');
const comments = parse(code);

const descriptions = {};

for (const block of comments) {
    const commentLine = block.source[block.source.length - 1]?.number;

    // search next 5 lines for function definition
    for (let offset = 1; offset <= 5; offset++) {
        const checkLine = lines[commentLine + offset]?.trim();
        if (!checkLine) continue;

        // match function definition
        const match = checkLine.match(/^(async\s+)?(\w+)\s*\(/);

        if (match) {
            // extract async status and function name
            const isAsync = !!match[1];
            const funcName = match[2];
            if (!descriptions[funcName]) {
                let fullDesc = `Async: ${isAsync}\n\n${block.description.trim()}`;

                // add parameters if available
                const params = block.tags.filter(tag => tag.tag === 'param');
                if (params.length > 0) {
                    fullDesc += '\n\nParameters:';
                    for (const param of params) {
                        fullDesc += `\n- \`${param.name}\` (${param.type}): ${param.description}`;
                    }
                }

                // add returns if available
                const returns = block.tags.find(tag => tag.tag === 'returns');
                if (returns) {
                    fullDesc += `\n\nReturns:\n- (${returns.type}): ${returns.description}`;
                }
                descriptions[funcName] = fullDesc;
            }
            break;
        }
    }
}

fs.writeFileSync(outputPath, JSON.stringify(descriptions, null, 2));
