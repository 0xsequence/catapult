# Catapult

**Catapult** is a powerful Ethereum contract deployment and management framework designed to simplify the orchestration of complex contract deployments across multiple blockchain networks. Built with TypeScript and Node.js, it provides a declarative YAML-based approach to defining deployment jobs, templates, and dependencies.

## Overview

Catapult addresses the challenge of managing complex contract deployment scenarios where multiple contracts need to be deployed in a specific order, with dependencies between them, across multiple blockchain networks. Instead of writing custom deployment scripts for each scenario, you define your deployment logic declaratively using YAML files.

### Key Features

- **🔄 Declarative Deployment Jobs**: Define complex deployment workflows using YAML configuration files
- **📋 Template System**: Create reusable deployment templates that can be shared across projects
- **🔗 Dependency Management**: Automatic resolution of deployment dependencies and execution ordering
- **🌐 Multi-Network Support**: Deploy to multiple blockchain networks simultaneously
- **⚡ Built-in Actions**: Comprehensive set of built-in actions for common deployment tasks
- **🧮 Value Resolvers**: Powerful system for computing values, encoding data, and performing calculations
- **✅ Skip Conditions**: Smart conditional logic to avoid redundant deployments
- **🔍 Validation & Dry Run**: Validate configurations and preview deployment plans without execution
- **📊 Event System**: Rich event system for monitoring deployment progress and debugging

## Installation

### From Source

```bash
git clone <repository-url>
cd catapult
npm install
npm run build
npm link
```

### Global Installation (when published)

```bash
npm install -g catapult
```

## Project Structure

A Catapult project follows this structure:

```
my-deployment-project/
├── networks.yaml              # Network configurations
├── jobs/                      # Deployment job definitions
│   ├── core-contracts.yaml
│   ├── factory-setup.yaml
│   └── token-deployment.yaml
├── templates/                 # Custom template definitions
│   ├── erc20-factory.yaml
│   └── proxy-deployment.yaml
├── artifacts/                 # Contract build artifacts
│   ├── MyContract.json
│   └── Factory.json
└── output/                    # Generated deployment results
```

## Configuration

### Networks Configuration

Create a `networks.yaml` file in your project root to define target networks:

```yaml
- name: "Ethereum Mainnet"
  chainId: 1
  rpcUrl: "https://mainnet.infura.io/v3/YOUR_PROJECT_ID"

- name: "Arbitrum One"
  chainId: 42161
  rpcUrl: "https://arb1.arbitrum.io/rpc"

- name: "Polygon"
  chainId: 137
  rpcUrl: "https://polygon-rpc.com"
  supports: ["etherscan_v2"]  # Optional: verification platforms supported
  gasLimit: 500000            # Optional: gas limit for all transactions on this network
```

The `supports` field is optional and specifies which verification platforms are available for the network. Currently supported platforms:

- `etherscan_v2`: Etherscan v2 verification API (supports Ethereum, Polygon, Arbitrum, BSC, etc.)

The `gasLimit` field is optional and specifies a fixed gas limit to use for all transactions on this network. If not specified, the system will use ethers.js default gas estimation.

If a network doesn't specify `supports` or doesn't include a verification platform, verification jobs will be silently skipped on that network.

### Job Definitions

Jobs are the core deployment units. Create YAML files in the `jobs/` directory:

```yaml
# jobs/core-contracts.yaml
name: "core-contracts"
version: "1.0.0"
description: "Deploy core system contracts"

actions:
  - name: "deploy-factory"
    template: "sequence-universal-deployer-2"
    arguments:
      creationCode: "{{Contract(MyFactory).creationCode}}"
      salt: "0"

  - name: "deploy-implementation"
    template: "sequence-universal-deployer-2"
    depends_on: ["deploy-factory"]
    arguments:
      creationCode:
        type: "constructor-encode"
        arguments:
          creationCode: "{{Contract(MyImplementation).creationCode}}"
          types: ["address"]
          values: ["{{deploy-factory.address}}"]
      salt: "0"
```

### Template Definitions

Templates are reusable deployment patterns. Create them in the `templates/` directory:

```yaml
# templates/proxy-factory.yaml
name: "proxy-factory"

arguments:
  implementation:
    type: "address"
  salt:
    type: "bytes32"

returns:
  address:
    type: "address"

setup:
  - type: "job-completed"
    arguments:
      job: "core-contracts"

actions:
  - type: "send-transaction"
    arguments:
      to: "{{core-contracts.deploy-factory.address}}"
      data:
        type: "abi-encode"
        arguments:
          signature: "createProxy(address,bytes32)"
          values:
            - "{{implementation}}"
            - "{{salt}}"

skip_condition:
  - type: "contract-exists"
    arguments:
      address:
        type: "compute-create2"
        arguments:
          deployerAddress: "{{core-contracts.deploy-factory.address}}"
          salt: "{{salt}}"
          initCode:
            type: "constructor-encode"
            arguments:
              creationCode: "{{Contract(ProxyBytecode).creationCode}}"
              types: ["address"]
              values: ["{{implementation}}"]

outputs:
  address:
    type: "compute-create2"
    arguments:
      deployerAddress: "{{core-contracts.deploy-factory.address}}"
      salt: "{{salt}}"
      initCode:
        type: "constructor-encode"
        arguments:
          creationCode: "{{Contract(ProxyBytecode).creationCode}}"
          types: ["address"]
          values: ["{{implementation}}"]
```

## Usage

### Running Deployments

Deploy all jobs to all configured networks:

```bash
catapult run --private-key YOUR_PRIVATE_KEY
```

Deploy specific jobs:

```bash
catapult run core-contracts token-setup --private-key YOUR_PRIVATE_KEY
```

Deploy to specific networks:

```bash
catapult run --network 1 42161 --private-key YOUR_PRIVATE_KEY
```

### Validation and Dry Run

Validate your configuration without executing transactions:

```bash
catapult dry-run
```

Validate specific jobs:

```bash
catapult dry-run core-contracts --network 1
```

### Listing Resources

List available jobs:

```bash
catapult list jobs
```

List detected contracts:

```bash
catapult list contracts
```

List available templates:

```bash
catapult list templates
```

List configured networks:

```bash
catapult list networks
```

## Built-in Actions

Catapult provides several built-in primitive actions:

### `send-transaction`
Send a transaction to the blockchain:

```yaml
- type: "send-transaction"
  arguments:
    to: "0x742..."
    value: "1000000000000000000"  # 1 ETH in wei
    data: "0x..."
```

### `send-signed-transaction`
Broadcast a pre-signed transaction:

```yaml
- type: "send-signed-transaction"
  arguments:
    transaction: "0x..."  # Raw signed transaction
```

## Value Resolvers

Catapult includes powerful value resolvers for computing complex values:

### `abi-encode`
ABI-encode function call data:

```yaml
data:
  type: "abi-encode"
  arguments:
    signature: "transfer(address,uint256)"
    values:
      - "0x742..."
      - "1000000000000000000"
```

### `constructor-encode`
Encode constructor parameters with bytecode:

```yaml
creationCode:
  type: "constructor-encode"
  arguments:
    creationCode: "{{Contract(MyContract).creationCode}}"
    types: ["address", "uint256"]
    values: ["{{factory.address}}", "100"]
```

### `compute-create2`
Compute CREATE2 addresses:

```yaml
address:
  type: "compute-create2"
  arguments:
    deployerAddress: "{{factory.address}}"
    salt: "{{salt}}"
    initCode: "{{creationCode}}"
```

### `basic-arithmetic`
Perform mathematical operations:

```yaml
amount:
  type: "basic-arithmetic"
  arguments:
    operation: "add"
    values: ["{{current_balance}}", "1000000000000000000"]
```

### `read-balance`
Read account balance:

```yaml
balance:
  type: "read-balance"
  arguments:
    address: "{{deployer_address}}"
```

### `call`
Make view/pure function calls:

```yaml
result:
  type: "call"
  arguments:
    to: "{{contract.address}}"
    signature: "getName()"
    values: []
```

### `verify-contract`
Verify deployed contracts on block explorers:

```yaml
- type: "verify-contract"
  arguments:
    address: "{{deploy-factory.address}}"
    contract: "{{Contract(MyContract)}}"  # Reference to the contract to verify
    constructorArguments: "0x000000000000000000000000..."  # Optional hex-encoded args
    platform: "etherscan_v2"  # Optional, defaults to "all" (tries all configured platforms)
```

## Skip Conditions

Avoid redundant operations with skip conditions:

### `contract-exists`
Skip if contract exists at address:

```yaml
skip_condition:
  - type: "contract-exists"
    arguments:
      address: "{{computed_address}}"
```

### `job-completed`
Skip if another job is completed:

```yaml
skip_condition:
  - type: "job-completed"
    arguments:
      job: "prerequisite-job"
```

## Standard Templates

Catapult includes several standard templates:

- **`sequence-universal-deployer-2`**: Deploy contracts using Sequence's Universal Deployer v2
- **`nano-universal-deployer`**: Deploy contracts using the Nano Universal Deployer
- **`min-balance`**: Ensure minimum balance for any given address

## Contract Resolution

Catapult automatically discovers and indexes contract artifacts in your project. It supports:

- **JSON artifacts** (Hardhat, Truffle, Foundry)
- **Nested directory structures**
- **Hash-based contract references**
- **Path-based contract references**
- **Name-based contract references**

Reference contracts in your YAML using the new unified Contract() syntax:

```yaml
creationCode: "{{Contract(path/to/MyContract).creationCode}}"
# or
creationCode: "{{Contract(0x1234...hash).creationCode}}"
```

## Output Format

After successful deployment, Catapult generates JSON files in the `output/` directory for each job. The output format is optimized to reduce repetition:

### Success Grouping

Networks with identical deployment outputs are grouped together:

```json
{
  "jobName": "core-contracts",
  "jobVersion": "1.0.0",
  "lastRun": "2025-01-15T10:30:45.123Z",
  "networks": [
    {
      "status": "success",
      "chainIds": ["1", "42161", "137"],
      "outputs": {
        "deploy-factory.address": "0x742d35Cc6ab8b3c7B3d4B8b3aB4c8f9e9C8e8aB6",
        "deploy-factory.txHash": "0xabc123...",
        "deploy-implementation.address": "0x123abc..."
      }
    }
  ]
}
```

### Error Handling

When deployments fail on specific networks, each failure is recorded separately:

```json
{
  "jobName": "core-contracts", 
  "jobVersion": "1.0.0",
  "lastRun": "2025-01-15T10:30:45.123Z",
  "networks": [
    {
      "status": "success",
      "chainIds": ["1", "42161"],
      "outputs": {
        "deploy-factory.address": "0x742d35Cc6ab8b3c7B3d4B8b3aB4c8f9e9C8e8aB6"
      }
    },
    {
      "status": "error",
      "chainId": "137",
      "error": "Transaction failed: insufficient funds"
    }
  ]
}
```

This format ensures:
- **Minimal repetition**: Successful deployments with identical outputs across multiple networks are grouped together
- **Clear error tracking**: Individual network failures are clearly documented
- **Scalability**: The format remains readable even with deployments across dozens of networks

## Environment Variables

- `PRIVATE_KEY`: Signer private key (alternative to `--private-key` flag)
- `PROJECT_ROOT`: Project root directory (alternative to `--project` flag)

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
- `npm run watch`