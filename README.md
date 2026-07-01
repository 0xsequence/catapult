# Catapult

[![CI](https://github.com/0xsequence/catapult/actions/workflows/ci.yml/badge.svg)](https://github.com/0xsequence/catapult/actions/workflows/ci.yml)

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
- **🧾 Multi-platform Verification**: Verify on Etherscan v2 and Sourcify (tries all configured platforms by default)

## Installation

### From npm (recommended)

Available on npm as `@0xsequence/catapult`.

Global install (provides the `catapult` CLI on your PATH):

```bash
npm install -g @0xsequence/catapult
# or
yarn global add @0xsequence/catapult
# or
pnpm add -g @0xsequence/catapult
```

Project-local install (use via npx or package.json scripts):

```bash
npm install -D @0xsequence/catapult
# or
yarn add -D @0xsequence/catapult
# or
pnpm add -D @0xsequence/catapult

# then run
npx catapult --help
```

### From Source

```bash
git clone <repository-url>
cd catapult
npm install
npm run build
npm link
```

### Global Installation (from npm)

```bash
npm install -g @0xsequence/catapult
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
  platform: "evm"             # Optional: evm (default), tron, or reserved svm
  supports: ["etherscan_v2"]  # Optional: verification platforms supported
  gasLimit: 500000            # Optional: gas limit for all transactions on this network
  testnet: true               # Optional: mark as test network
  evmVersion: "cancun"        # Optional: network EVM hardfork (e.g., london, paris, shanghai, cancun)

- name: "Tron Nile"
  chainId: 3448148188
  rpcUrl: "https://nile.trongrid.io"
  platform: "tron"
  params:
    feeLimit: 150000000       # Sun. 150 TRX max burn for energy/bandwidth
    tronGridApiKeyEnv: "TRONGRID_API_KEY"
```

`platform` defaults to `evm`. `tron` enables the TronWeb-backed adapter for direct contract deployment and contract calls. `svm` is accepted as a reserved value so projects can model future Solana/SVM networks, but SVM execution is not implemented yet and will fail with a clear "not implemented" error if selected.

The `supports` field is optional and specifies which verification platforms are available for the network. Currently supported platforms:

- `etherscan_v2`: Etherscan v2 verification API (supports Ethereum, Polygon, Arbitrum, BSC, etc.)
- `sourcify`: Sourcify verification (no API key required)

If `supports` is omitted, all built-in platforms are allowed for that network. Etherscan requires an API key to be considered “configured”; Sourcify requires no configuration. The `gasLimit` field is optional and specifies a fixed gas limit to use for all EVM transactions on this network. If not specified, EVM networks use ethers.js default gas estimation.

Tron notes:

- `value` fields are in sun, the smallest TRX unit.
- Contract gas estimates are converted from energy into sun fee limits using the node's `getEnergyFee` chain parameter; set `params.energyFeeSun` only for nodes that do not expose it.
- Contract addresses are stored internally as `0x`-prefixed 20-byte addresses; the Tron adapter converts Base58/`41`-prefixed addresses at the network boundary.
- `send-signed-transaction`, Nick's method bootstrap templates, and raw Ethereum pre-signed deployer templates are EVM-only for now.
- `get-storage-at` is not implemented for Tron.

### Constants

You can define reusable values in constants files or directly within a job.

- Top-level constants are discovered anywhere under your project root by adding YAML files with `type: "constants"`.
- Keys must be unique across all constants files; duplicates will fail the load.
- Within jobs/templates, reference constants using bare placeholders like `{{MY_CONSTANT}}`.
- Job-level constants override top-level constants when names collide.

Example top-level constants file (can be placed anywhere, e.g., `constants.yaml`):

```yaml
type: "constants"

constants:
  address-zero: "0x0000000000000000000000000000000000000000"
  salt-zero: "0x0000000000000000000000000000000000000000000000000000000000000000"
  developer-multisig-01: "0x007a47e6BF40C1e0ed5c01aE42fDC75879140bc4"
  entrypoint-4337-07: "0x0000000071727de22e5e9d8baf0edac6f37da032"
```

Job-level constants example (defined at the top of a job):

```yaml
name: "job-with-constants"
version: "1"
constants:
  FEE: "1000"
  ADMIN: "0x0000000000000000000000000000000000000001"
actions:
  - name: "example"
    template: "some-template"
    arguments:
      admin: "{{ADMIN}}"      # resolves to job-level constant
      defaultSalt: "{{salt-zero}}"  # resolves to top-level constant
```

Tip: Use `catapult list constants` to see discovered top-level constants and any job-level constants.

#### RPC URL tokens via environment variables

You can inject secrets (like access tokens) into `rpcUrl` using placeholders of the form `{{RPC_...}}`. At load time, any placeholder whose name starts with `RPC` will be replaced with the value of the corresponding environment variable. Placeholders not starting with `RPC` are left as-is.

Example `networks.yaml`:

```yaml
- name: "MyNet"
  chainId: 999
  rpcUrl: "https://node.url/something/{{RPC_URL_TOKEN}}"
```

With an environment variable:

```bash
export RPC_URL_TOKEN="my-secret-token"
```

Resulting `rpcUrl` at runtime:

```
https://node.url/something/my-secret-token
```

Notes:
- If an `{{RPC_*}}` placeholder is present and the corresponding environment variable is not set, it now defaults to an empty string. This allows templates like `https://node.url/{{RPC_TOKEN}}` to collapse gracefully to `https://node.url/` without failing the load.
- Multiple RPC tokens in one URL are supported, and whitespace inside the token delimiters is ignored (e.g., `{{  RPC_TOKEN  }}`).

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

#### Per-job network filters

Jobs run on all selected networks by default. You can restrict or exclude networks for a specific job by chain ID:

```yaml
name: "token-deployment"
version: "1.0.0"

# Run only on these networks (takes precedence if present)
only_networks: [1, 42161]

# Or, skip these networks (used only if only_networks is not set)
# skip_networks: [137]

actions:
  - name: "deploy"
    template: "erc-2470"
    arguments: { /* ... */ }
```

Rules:
- If `only_networks` is set and non-empty, the job runs only on those chain IDs.
- Else, if `skip_networks` is set and non-empty, the job is skipped on those chain IDs.
- Otherwise, the job runs on all networks selected for the run (via `networks.yaml` or `--network`).

#### Minimum EVM version per job

Jobs can declare a minimum EVM hardfork they require. When a network’s `evmVersion` is older than the job’s `min_evm_version`, the job is skipped on that network.

```yaml
name: "post-shanghai-feature"
version: "1.0.0"
min_evm_version: "shanghai"

actions:
  - name: "deploy"
    template: "erc-2470"
    arguments: { /* ... */ }
```

Supported identifiers include: `frontier`, `homestead`, `tangerine`, `spuriousdragon`, `byzantium`, `constantinople`, `petersburg`, `istanbul`, `berlin`, `london`, `paris` (The Merge), `shanghai`, `cancun`, `prague`.

#### Deprecating jobs

Mark a job as deprecated to opt it out of normal runs without deleting it:

```yaml
name: "legacy-seed"
version: "1.2.3"
deprecated: true
actions:
  - name: "noop"
    type: "static"
    arguments: { value: null }
```

Behavior:
- Deprecated jobs are skipped by default when running without specifying job names.
- Explicitly targeting a deprecated job on the CLI will run it even without extra flags: `catapult run legacy-seed -k $PRIVATE_KEY`.
- To include all deprecated jobs in a normal run, pass `--run-deprecated`: `catapult run --run-deprecated -k $PRIVATE_KEY`.
- If a non-deprecated job depends on a deprecated job, that deprecated dependency is ALWAYS included automatically to satisfy dependencies (even without `--run-deprecated`).

### Template Definitions

Templates are reusable deployment patterns. Create them in the `templates/` directory:

```yaml
# templates/proxy-factory.yaml
name: "proxy-factory"
type: "template"

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

Notes about template files:
- The `type: "template"` discriminator is optional but recommended for clarity. If provided, it must be exactly `template`.
- Templates are auto-discovered from your project `templates/` folder and any `templates/` subfolders under `jobs/`.

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

Deploy multiple jobs using wildcards (matches job names, including nested names like `sequence_v3/beta_4`):

```bash
# Run all jobs whose name starts with "sequence_"
catapult run sequence_* -k $PRIVATE_KEY

# Run all jobs under a namespace/folder-like prefix
catapult run "sequence_v3/*" -k $PRIVATE_KEY

# Combine patterns and exact names; duplicates are de-duplicated
catapult run job1 job? -k $PRIVATE_KEY
```

Deploy to specific networks:

```bash
# Comma-separated, supports chain IDs and network names (name matches include all networks with that name)
catapult run --network 1,42161 --private-key YOUR_PRIVATE_KEY
catapult run --network mainnet --private-key YOUR_PRIVATE_KEY       # all networks named "Mainnet"
catapult run --network mainnet,polygon -k $PRIVATE_KEY core-contracts
```

Common options (run):

- `-p, --project <path>`: Project root directory (defaults to current directory)
- `--dotenv <path>`: Load environment variables from a custom .env file (run command only)
- `-n, --network <selectors>`: Comma-separated selectors by chain ID or network name
- `--rpc-url <url>`: Run against a single custom RPC; chain ID is auto-detected. If `networks.yaml` defines that chain, Catapult merges yaml settings (name, `supports`, `gasLimit`, `testnet`, `evmVersion`, `params`) while using your RPC URL.
- `-k, --private-key <key>`: EOA private key (or set `PRIVATE_KEY`)
- `--etherscan-api-key <key>`: Etherscan API key (or set `ETHERSCAN_API_KEY`)
- `--fail-early`: Stop as soon as any job fails
- `--ignore-verify-errors`: Convert verification errors to warnings and show complete report at end (instead of exiting with error code)
- `--no-post-check-conditions`: Skip post-execution evaluation of skip conditions
- `--flat-output`: Write outputs in a single flat `output/` directory (do not mirror `jobs/` structure)
- `--no-summary`: Hide the end-of-run summary
- `--run-deprecated`: Allow running jobs marked `deprecated: true` (otherwise skipped unless explicitly targeted)
- `--no-std`: Do not load built-in standard templates
- `-v, --verbose` (repeatable): Increase logging verbosity (`-v`, `-vv`, `-vvv`)

Examples:

- Using a custom RPC (no networks.yaml needed):

```bash
catapult run --rpc-url http://127.0.0.1:8545 -k $PRIVATE_KEY
```

- Write outputs flat instead of mirroring `jobs/` folders:

```bash
catapult run --flat-output -k $PRIVATE_KEY
```

- Run a deprecated job explicitly:
  - Without flag (explicit targeting runs it):
    ```bash
    catapult run legacy-job -k $PRIVATE_KEY
    ```
  - Or include all deprecated jobs in the plan:
    ```bash
    catapult run --run-deprecated -k $PRIVATE_KEY
    ```

### Validation and Dry Run

Validate your configuration without executing transactions:

```bash
catapult dry-run
```

Validate specific jobs:

```bash
catapult dry-run core-contracts --network 1
catapult dry-run core-contracts --network polygon
catapult dry-run core-contracts --network mainnet,42161
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

List only test networks:

```bash
catapult list networks --only-testnets
```

List only non-test networks:

```bash
catapult list networks --only-non-testnets
```

List constants (top-level and per-job):

```bash
catapult list constants
```

Simple outputs for scripting:

```bash
# Names only, one per line
catapult list networks --simple

# Chain IDs only, one per line
catapult list networks --simple-chain-ids
```

Utilities:

```bash
# Convert chain ID to network name
catapult utils chain-id-to-name 42161 -p ./my-project
```

Etherscan helpers:

```bash
# Fetch ABI from Etherscan v2
catapult etherscan abi -n 1 -a 0xdAC17F958D2ee523a2206206994597C13D831ec7 --etherscan-api-key $ETHERSCAN_API_KEY
catapult etherscan abi -n mainnet -a 0xdAC17F... --etherscan-api-key $ETHERSCAN_API_KEY

# Fetch source (standard-json or flattened) from Etherscan v2
catapult etherscan source -n 1 -a 0xdAC17F958D2ee523a2206206994597C13D831ec7 --etherscan-api-key $ETHERSCAN_API_KEY
catapult etherscan source -n mainnet -a 0xdAC17F... --etherscan-api-key $ETHERSCAN_API_KEY
```

Source provenance helpers:

```bash
# Verify every source.yaml provenance entry in the project
catapult provenance verify

# Verify only one job's provenance entries
catapult provenance verify my-job

# Verify a job and the jobs it depends on
catapult provenance verify my-job --include-dependencies

# Generate missing build-info JSON files from source.yaml provenance
catapult provenance generate
```

## Built-in Actions

Catapult provides several built-in primitive actions:

### `send-transaction`
Send a transaction to the blockchain:

```yaml
- type: "send-transaction"
  arguments:
    to: "0x742..."
    value: "1000000000000000000"  # Native smallest unit: wei on EVM, sun on Tron
    data: "0x..."
    gasMultiplier: 1.5  # Optional: multiply gas limit by this factor
```

The `gasMultiplier` parameter is optional and allows you to tune the gas limit before sending the transaction:
- If a network gas limit is configured, it will be multiplied by this factor
- If no network gas limit is set, gas will be estimated first, then multiplied by this factor
- Must be a positive number (e.g., 1.5 for 50% more gas, 0.8 for 20% less gas)

### `send-signed-transaction`
Broadcast a pre-signed transaction:

```yaml
- type: "send-signed-transaction"
  arguments:
    transaction: "0x..."  # Raw signed transaction
```

### `static`
Sets a static value that can be referenced in subsequent steps. Useful for defining constants or passing data between actions.

```yaml
- type: "static"
  name: "my-value"
  arguments:
    value: "hello world"
```

The `name` field is optional. When provided, the value is stored under [`name.value`](src/lib/core/engine.ts:560) in the context. If omitted, the value is computed but not stored. Supports all JSON data types including strings, numbers, booleans, objects, and arrays.

Example with complex data:

```yaml
- type: "static"
  name: "config"
  arguments:
    value:
      endpoint: "https://api.example.com"
      timeout: 5000
      enabled: true
```

This makes `config.value.endpoint`, `config.value.timeout`, and `config.value.enabled` available for use in subsequent actions.

### `create-contract`
Create a contract by sending its creation bytecode (and optional value):

```yaml
- type: "create-contract"
  name: "deploy-foo"
  arguments:
    data: "{{Contract(Foo).creationCode}}"
    abi: "{{Contract(Foo).abi}}"
    gasMultiplier: 1.2
```

The `abi` field is optional and is useful for platforms that need constructor metadata, such as Tron payable constructors.

### `json-request`
Make an HTTP JSON request and use the result downstream:

```yaml
- type: "json-request"
  name: "get-config"
  arguments:
    url: "https://example.com/config.json"
    method: "GET"
```

### `assert`
Assert an on-chain invariant or value comparison. Evaluates a condition and throws a clear error if it doesn't hold (no broadcast, ever).

The action provides two ways to obtain the **ACTUAL** value:

1. **`to` + `signature`** — performs an `eth_call` (like the `call` value resolver)
2. **`actual`** — resolves any Value resolver (e.g. `read-balance`, `static`, etc.)

Then provide **exactly one** comparator key (`eq`, `neq`, `gt`, `lt`, `gte`, `lte`) whose value is the **EXPECTED** result. If the comparison is `false`, the action throws an error that fails the run.

Example — call a view function and compare:

```yaml
- type: assert
  name: check-deposit-manager
  arguments:
    to: "{{some-proxy}}"
    signature: "depositManager() returns (address)"
    eq: "{{expected-deposit-manager}}"
```

Example — resolve a value and compare:

```yaml
- type: assert
  name: check-balance
  arguments:
    actual: { type: read-balance, arguments: { address: "{{deployer}}" } }
    gte: "1000000000000000000"
    message: "deployer underfunded"
```

An optional `message` field is included in the error output for clarity.

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

### `abi-pack`
Pack values per ABI types into bytes:

```yaml
payload:
  type: "abi-pack"
  arguments:
    types: ["address", "uint256"]
    values: ["{{recipient}}", "{{amount}}"]
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

### `get-storage-at`
Read a raw EVM storage slot via `eth_getStorageAt` (EVM only):

```yaml
storageValue:
  type: "get-storage-at"
  arguments:
    address: "{{contract.address}}"
    slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"  # EIP-1967 implementation slot
```

The slot can be a hex string, a number, or a reference to another value. Returns the 32-byte storage value as a hex string.

### `compute-slot`
Compute EVM storage slots for the common Solidity storage layouts. The result is always a 32-byte, `0x`-prefixed hex string, so it can be fed directly into `get-storage-at` or nested as the `slot` of another `compute-slot` (e.g. for nested mappings). Select a layout with `kind`:

**`mapping`** — value slot of `mapping[key]` (`keccak256(h(key) . slot)`):

```yaml
slot:
  type: "compute-slot"
  arguments:
    kind: "mapping"
    slot: 0                 # declaration slot of the mapping
    key: "{{owner}}"
    keyType: "address"      # optional, default "uint256"; "string"/"bytes" keys are packed
```

Nested mappings (`balances[a][b]`) are expressed by nesting `compute-slot` in the `slot` field:

```yaml
slot:
  type: "compute-slot"
  arguments:
    kind: "mapping"
    key: "{{spender}}"
    keyType: "address"
    slot:
      type: "compute-slot"
      arguments:
        kind: "mapping"
        slot: 1
        key: "{{owner}}"
        keyType: "address"
```

**`dynamic-array`** — element slot of a dynamic array (`keccak256(slot) + index * elementSize`). The array length lives at `slot` itself:

```yaml
slot:
  type: "compute-slot"
  arguments:
    kind: "dynamic-array"
    slot: 3
    index: 4            # optional, default 0
    elementSize: 1      # optional slots-per-element, default 1
```

**`struct-field`** — a struct field or fixed-array element (`slot + offset`):

```yaml
slot:
  type: "compute-slot"
  arguments:
    kind: "struct-field"
    slot: "{{structBase}}"
    offset: 2
```

**`erc7201`** — ERC-7201 namespaced storage root (`keccak256(abi.encode(uint256(keccak256(id)) - 1)) & ~0xff`):

```yaml
slot:
  type: "compute-slot"
  arguments:
    kind: "erc7201"
    id: "openzeppelin.storage.Ownable"
```

**`eip1967`** — well-known EIP-1967 proxy slot (`keccak256("eip1967.proxy.<name>") - 1`), where `name` is `implementation`, `admin`, or `beacon`:

```yaml
implementation:
  type: "get-storage-at"
  arguments:
    address: "{{proxy.address}}"
    slot:
      type: "compute-slot"
      arguments:
        kind: "eip1967"
        name: "implementation"
```

### `verify-contract`
### `read-json`
Read a value from a JSON object at a given path:

```yaml
tokenAddress:
  type: "read-json"
  arguments:
    json: "{{get-config.response}}"
    path: "tokens.usdc.address"
```

### `slice-bytes`
Slice hex strings by byte offsets (supports negative indexes and range syntax):

```yaml
trimmedPatchData:
  type: "slice-bytes"
  arguments:
    value:
      type: "read-json"
      arguments:
        json: "{{get-guard-v1-signature.response}}"
        path: "txs.data"
    range: ":-1"  # Drop the trailing byte from the payload
```

You can also provide explicit `start` and `end` byte positions (end is exclusive). Negative indexes count from the end of the byte array, so `end: -1` trims the last byte and `start: -32` keeps the final 32 bytes. `range` accepts either `start:end` or the bracket form `[start:end]`.

Verify deployed contracts on block explorers:

```yaml
- type: "verify-contract"
  arguments:
    address: "{{deploy-factory.address}}"
    contract: "{{Contract(MyContract)}}"  # Reference to the contract to verify
    constructorArguments: "0x000000000000000000000000..."  # Optional hex-encoded args
    platform: "etherscan_v2"  # Optional, defaults to "all" (tries all configured platforms)
```

#### Verification Error Handling

By default, verification failures will cause the deployment to exit with an error code. To continue deployment even when verification fails and receive a comprehensive warning report at the end, use the `--ignore-verify-errors` flag:

```bash
catapult run --ignore-verify-errors
```

This is useful when:
- You want to complete all deployments even if some contract verifications fail
- Working with networks where verification platforms may be unreliable
- Running in CI/CD environments where you prefer warnings over hard failures for verification issues

When enabled, verification errors are converted to warnings and a detailed report is shown at the end of the deployment with all verification failures.

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

### `skip_if` (pure gate, no post-execution check)

In addition to `skip_condition`, jobs support a `skip_if` field for **pure gate** semantics:

- Evaluated ONCE, BEFORE the job runs (the pre-skip decision)
- If ANY condition in `skip_if` is true → skip the whole job (status `skipped`)
- **NEVER** post-execution-checked (this is the key difference from `skip_condition`)

Use `skip_if` for jobs that generate artifacts (e.g., Safe/multisig transaction payloads for human execution out-of-band) and should skip when already in the desired state, without requiring convergence within the run itself.

```yaml
name: "generate-upgrade-payload"
version: "1.0.0"
skip_if:
  - type: "contract-exists"
    arguments:
      address: "{{computed_upgrade_address}}"
actions:
  - name: "generate"
    type: "static"
    arguments:
      value: "upgrade-payload-data"
```

**Combining `skip_condition` and `skip_if`:**

If both are present, the job is skipped if ANY condition in either array is true at pre-skip time. Only `skip_condition` is post-execution-checked.

```yaml
name: "hybrid-job"
version: "1.0.0"
skip_condition:
  - type: "contract-exists"
    arguments:
      address: "{{deployed_address}}"
skip_if:
  - type: "job-completed"
    arguments:
      job: "setup-job"
actions:
  - name: "deploy"
    template: "erc-2470"
    arguments:
      creationCode: "{{Contract(MyContract).creationCode}}"
      salt: "0"
```

## Standard Templates

Catapult includes several standard templates:

- **`sequence-universal-deployer-2`**: Deploy contracts using Sequence's Universal Deployer v2
- **`nano-universal-deployer`**: Deploy contracts using the Nano Universal Deployer
- **`arachnid-deterministic-deployment-proxy`**: Deploy contracts via Arachnid's CREATE2 proxy at `0x4e59…`, with automatic factory bootstrapping
- **`erc-2470`** and raw variant: CREATE2 Deployer (singleton factory)
- **`assured-deployment`**: Helper to ensure a contract is deployed at a specific address
- **`min-balance`**: Ensure minimum balance for any given address
- Raw building blocks: `raw-sequence-universal-deployer-2`, `raw-nano-universal-deployer`, `raw-erc-2470`

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

Build-info files can carry optional source provenance through a nearby `source.yaml`
sidecar. Deployment runs still use committed artifacts; Catapult does not rebuild
from the source repository during `catapult run`.

```text
jobs/my-stack/build-info/rc-5/
├── stage1.json
└── source.yaml
```

```yaml
type: source

build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3"
    ref: "v3.0.0-rc.5"
    commit: "0d9061f229da73edae890e6fdd1fbf753028df6d"
    build: "forge build --build-info"
```

Catapult can use the same provenance to rebuild and compare build-info files on
demand:

```bash
# Rebuild each source provenance entry and compare it with the committed file
catapult provenance verify

# Scope to one job, or include that job's dependencies
catapult provenance verify my-job
catapult provenance verify my-job --include-dependencies

# Clone/build from provenance and write missing build-info files
catapult provenance generate
catapult provenance generate my-job --include-dependencies
```

`provenance generate` skips existing build-info files by default; pass `--force`
to overwrite them. Both commands clone the configured `repo`, check out `ref` or
`commit`, run the `build` command in that checkout, and look for generated
`build-info/*.json` files. If the build produces more than one build-info file,
Catapult selects by matching the committed build-info `id`, then by filename; if
neither is unique, the entry fails with an ambiguity error.

### Pinning the build toolchain with `image`

Because provenance compares the *entire* build-info JSON (including compiler
settings such as `evmVersion`), the rebuild must use the same toolchain that
produced the committed file. Add an optional `image` field to run the `build`
command inside a pinned Docker image instead of on the host:

```yaml
type: source

build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3"
    commit: "0d9061f229da73edae890e6fdd1fbf753028df6d"
    image: "ghcr.io/foundry-rs/foundry:v1.5.1"
    build: "forge build --build-info"
```

When `image` is set, Catapult runs `docker run <image>` with the checkout
bind-mounted at `/workspace` (also the working directory and `$HOME`), the build
command executed via `sh -c`, and — on POSIX hosts — the container running as the
caller's `uid:gid` so the generated files are owned by you and the temporary
checkout can be cleaned up. This keeps the toolchain pinned per entry (different
build-info files can use different images) and leaves the host/runner untouched;
it requires Docker to be installed and running. The `image` field is also
supported in per-contract `contracts` overrides.

If a build-info file needs a per-contract override, key it by fully-qualified
contract name:

```yaml
type: source

build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3"
    commit: "0d9061f229da73edae890e6fdd1fbf753028df6d"
    contracts:
      "src/Stage1Module.sol:Stage1Module":
        ref: "stage1-special"
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

Output layout and selection:

- By default, output files mirror the structure under `jobs/` (e.g., `jobs/core/job.yaml` -> `output/core/job.json`). Use `--flat-output` to write all job JSON files directly under `output/`.
- You can control which action outputs are persisted per job using the `output` flag on actions:
  - `output: true` to include all outputs for that action
  - `output: false` to exclude outputs for that action
  - `output: { key1: true, key2: true }` to include only specific keys from that action (e.g., `txHash`, `address`)

## Environment Variables

- `PRIVATE_KEY`: Signer private key (alternative to `--private-key`)
- `ETHERSCAN_API_KEY`: API key for Etherscan v2 verification (alternative to `--etherscan-api-key`)

You can load environment variables from a file using `--dotenv <path>` on the `run` command (defaults to `.env` in the current directory when provided).

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
- `npm run watch` - Watch for changes
