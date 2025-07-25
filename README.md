# Deployito

Ethereum contract deployment CLI tool built with TypeScript and Node.js.

## Installation

### From source
```bash
git clone <repository-url>
cd deployito
npm install
npm run build
npm link
```

## Development

### Prerequisites
- Node.js >= 16.0.0
- npm or yarn

### Setup
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Watch for changes
npm run watch
```

### Scripts
- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run the CLI in development mode with ts-node
- `npm run watch` - Watch for changes and recompile automatically
- `npm run clean` - Remove compiled files
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically

## Project Structure

```
deployito/
├── src/
│   ├── index.ts          # Main CLI entry point
│   ├── cli.ts            # Command setup
│   └── commands/         # Individual command implementations
├── dist/                 # Compiled JavaScript output
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.json
├── .gitignore
└── README.md
```

## Usage

Commands for Ethereum contract deployment will be implemented here.

## License

MIT License 