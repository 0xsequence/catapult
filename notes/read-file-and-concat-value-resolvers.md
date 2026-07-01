# `read-file` + `concat` value resolvers (and why not a blob registry)

*Design note, branch `feat/read-file-value` (cut from `origin/master`, v1.5.0). Motivated by building a "Shape 1" Safe relay in `0xsequence/live-contracts` — a catapult job that broadcasts a fully-signed Gnosis Safe `execTransaction` on-chain, rather than emitting calldata for a human to paste into the Safe UI.*

## The problem

Building the relay we hit two real gaps:

1. **No home for an opaque per-execution blob.** The packed Safe owner signatures are a large chunk of hex that changes every execution and is pure operational data. The only place to put a value today is `constants` YAML. That works but is the wrong shelf: constants are meant to be small, stable, shared configuration, not big per-run payloads, and they can't be `.gitignore`d cleanly.

2. **`{{ref}}` only resolves when it is the *entire* value.** In `src/lib/core/resolver.ts` the reference match is anchored:

   ```ts
   const refMatch = value.match(/^{{(.*)}}$/)
   ```

   So `".../multisig-transactions/{{tx-hash}}/"` is sent **literally** — which 404'd us against the Safe Transaction Service. `networks.yaml` gets embedded interpolation, but only via a special-case regex in the network loader (`resolveRpcUrlTokens`, `RPC*` tokens only), not the general resolver.

We shipped the live-contracts job by working around both: a full-URL constant (couldn't template it) plus `json-request` + `read-json` to fetch the pre-packed `signatures` field from the tx-service at run time.

## Options considered

### A. Generic "blob registry" (a free-form `build-info`) — **rejected**

The original ask was: should catapult have a place to store "blobs of data" that isn't constants — a free-form version of build-info?

No. build-info earns its keep precisely because it is **typed and validated** (abi/bytecode, discoverable by hash) and referenced *semantically* via `Contract(name)`. A free-form analog has none of that — it is just "constants, but a second bag," with its own discovery/merge/duplicate-key machinery to build and maintain, and no added safety.

This repo's own `notes/roadmap-thinking.md` (§3) already diagnosed the adjacent pain — build-info blobs hand-copied from other repos with the source link lost — and concluded the right frame is **provenance metadata about a canonical artifact**, not a generic blob bucket. A blob registry pulls in the opposite direction. The blob problem is better served by the smallest primitive that lets a blob live in *its own file*: `read-file`.

### B. `read-file` value resolver — **built**

A blob lives in its own file, referenced by path, resolved relative to the job dir, gitignorable, with an encoding hint. Small, general, and it composes with the resolvers that already exist (`read-json`, `slice-bytes`, `abi-encode`, …).

### C. `concat` value resolver — **built**

An explicit string-join, chosen over implicit whole-string interpolation. Implicit interpolation risks mangling values that legitimately contain `{{` and forces the resolver to guess intent; an explicit `concat` is unambiguous and self-documenting. Solves URL/path templating.

### D. `safe-exec-transaction` std template — **sketched below, not built**

Encapsulates the whole Shape-1 relay on top of the primitives + existing `json-request`/`read-json`. Worth doing, but it is a composition of primitives and should land after the primitives it depends on; it also overlaps with the `propose-transaction` / `pending`-state design in `roadmap-thinking.md` §2 and deserves that wider discussion.

## What was built

Two pure value resolvers, wired into the existing `ValueResolver` union and the resolver dispatch switch, matching the surrounding code's style and error conventions.

### `read-file`

```yaml
signatures:
  type: "read-file"
  arguments:
    path: "signatures.hex"     # relative to the job/template directory
    encoding: "hex"            # "utf8" (default) | "hex" | "json"
```

- `utf8` — returns text as-is with a single trailing newline trimmed (so file contents compare cleanly against inline strings).
- `hex` — validates and normalizes to a `0x`-prefixed lowercase hex string (accepts input with or without `0x`).
- `json` — parses the file and returns the value; composes with `read-json` to pull a nested field.

### `concat`

```yaml
url:
  type: "concat"
  arguments:
    values:
      - "https://safe-transaction-mainnet.safe.global/api/v1/multisig-transactions/"
      - "{{safe-tx-hash}}"
      - "/"
    separator: ""              # optional, default "" (direct concatenation)
```

Each part is resolved then coerced to a string (numbers/booleans allowed; objects/null/undefined rejected with a clear error) and joined by `separator`.

### Files touched

- `src/lib/types/values.ts` — `ReadFileValue`, `ConcatValue` interfaces + added to the `ValueResolver` union.
- `src/lib/core/resolver.ts` — imports, two dispatch cases, `resolveReadFile` / `resolveConcat` implementations.
- `src/lib/core/context.ts` — optional `projectRoot` constructor arg + `getProjectRoot()` (used to confine reads). Backwards-compatible: existing 5-arg callers and test mocks are unaffected.
- `src/lib/deployer.ts` — passes `options.projectRoot` into the context.
- `src/lib/core/__tests__/resolver.spec.ts` — `read-file` (11 cases) and `concat` (6 cases) describe blocks.
- `README.md` — `read-file` and `concat` sections under Value Resolvers.

## Security considerations

`read-file` reads from disk driven by YAML, so path handling is the whole risk surface:

- **No absolute paths.** Rejected outright — a job must not name `/etc/...` or a home-dir key file.
- **Confined to the project root.** The path is resolved against the job/template directory, then checked with `path.relative(projectRoot, resolved)`; anything that starts with `..` or is absolute (i.e. escapes the root) is refused. `../../secrets` cannot climb out. (When `projectRoot` is unknown — e.g. a bare unit-test context — the resolver still rejects absolute paths and resolves relative to the context dir; the deployer always supplies `projectRoot` in real runs.)
- **No secret auto-discovery.** The resolver only reads the exact file named. It never scans, globs, or reads `.env`/keystores implicitly. Secrets (the deployer key) continue to arrive via env/CLI, never through this path.
- **Blobs are meant to be gitignorable.** Operational payloads (signatures) live in their own file the operator can `.gitignore`, keeping large per-run data out of git and out of `constants`.

`concat` has no I/O and no injection surface beyond producing a string; object parts are rejected so a misresolved reference fails loudly instead of emitting `[object Object]`.

## How live-contracts consumes it

**Before** (what we actually shipped as a workaround): the endpoint URL had to be a single full-URL constant because it couldn't be templated, and the packed signatures came from a run-time `json-request` to the Safe Transaction Service because there was nowhere good to store them:

```yaml
constants:
  # Whole URL as one opaque constant — the tx hash could not be interpolated.
  safe_tx_url: "https://safe-transaction-mainnet.safe.global/api/v1/multisig-transactions/0xabc.../"

actions:
  - name: fetch-sigs
    type: "json-request"
    arguments:
      url: "{{safe_tx_url}}"
  - name: relay
    type: "send-transaction"
    arguments:
      to: "{{safe_address}}"
      data:
        type: "abi-encode"
        arguments:
          signature: "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)"
          values: [ ..., { type: "read-json", arguments: { json: "{{fetch-sigs.response}}", path: "signatures" } } ]
```

**After** — the URL is templated with `concat`, and the collected signatures live in a gitignorable file read with `read-file` (offline, deterministic, no dependency on the tx-service being reachable at relay time):

```yaml
constants:
  safe_tx_service: "https://safe-transaction-mainnet.safe.global/api/v1"

actions:
  # Option 1: still fetch from the service, but build the URL with concat
  - name: fetch-sigs
    type: "json-request"
    arguments:
      url:
        type: "concat"
        values:
          - "{{safe_tx_service}}"
          - "/multisig-transactions/"
          - "{{safe-tx-hash}}"
          - "/"

  # Option 2: read pre-collected packed signatures straight from a file
  - name: relay
    type: "send-transaction"
    arguments:
      to: "{{safe_address}}"
      data:
        type: "abi-encode"
        arguments:
          signature: "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)"
          values:
            - # ...to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver...
            - { type: "read-file", arguments: { path: "signatures.hex", encoding: "hex" } }
```

## Sketch: `safe-exec-transaction` std template (not implemented)

A std template in `src/lib/std/templates/safe-exec-transaction.yaml`, taking the Safe address, the inner call, and either a signatures file or a tx-service base URL. It would:

1. Compute/accept the SafeTxHash for the inner transaction.
2. Obtain packed signatures — either `read-file` (offline) or `json-request` + `read-json` against a `concat`-built tx-service URL (online).
3. `abi-encode` `execTransaction(...)` with the inner call + packed signatures.
4. `send-transaction` to the Safe.
5. Guard with a `skip_condition` that observes the on-chain effect (the same idempotent-convergence pattern as deployments), so a re-run either lands the tx or finds it already applied.

Open design point: this overlaps with the `propose-transaction` + `pending`-state model in `roadmap-thinking.md` §2. The primitives here (`read-file`, `concat`) are useful regardless of which way that lands, which is the argument for shipping them independently first.

## Test results

`src/lib/core/__tests__/resolver.spec.ts`: 216/216 pass (includes the 11 new `read-file` + 6 new `concat` cases). Build is clean (`pnpm build`), lint has 0 errors (only the pre-existing repo-wide `no-explicit-any` warnings).

The full suite has 4–5 pre-existing failures in `engine.spec.ts` (`send-signed-transaction`, `test-nicks-method`) — these fail identically on a clean `origin/master` tree and are environmental: the local node at `127.0.0.1:8545` is a Polygon mainnet fork (chainId `0x89`), not a clean instant-mining anvil with an unlocked funded account. They are unrelated to this change, which adds only two pure value resolvers and one optional constructor argument.
