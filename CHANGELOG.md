# Changelog

## 2.0.0

### Breaking changes

- Require Node.js 22 or newer.

### Added

- Add a `safe-transaction` action that creates versioned Safe transaction artifacts, simulates calls, exports Safe Transaction Builder JSON, and optionally proposes transactions through the Safe Transaction Service.
- Add `read-file` and `concat` value resolvers for loading operational inputs and composing strings.
- Add the `safe-exec-transaction` standard template for broadcasting fully signed Safe transactions.

### Changed

- Update CI and package tooling to Node.js 22 and pnpm 10.

See [#22](https://github.com/0xsequence/catapult/pull/22) and [#24](https://github.com/0xsequence/catapult/pull/24) for the complete changes.
