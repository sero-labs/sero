# What the `run` SDK guarantees

Research for [ticket #480](https://github.com/sero-labs/sero/issues/480) on map
[#479](https://github.com/sero-labs/sero/issues/479).

Sources: https://run-sdk.dev/docs (introduction, foundations/serialization, advanced/limits,
advanced/continuations, api-reference/run, api-reference/create-runner) and the published package
`run@2.1.2` from npm, read directly.

Where a fact is not in a primary source, this file says **not documented**.

---

## 1. Interrupt and resume

**The API.** A host function calls `getHostFunctionContext()`. The context carries `resume`
(`undefined` when the run is not a resume) and `interrupt()`.

```js
context.interrupt({ kind: 'approval', recipient, body });
```

`interrupt()` works by throwing internally. The docs say: *"Do not catch it inside the host
function."*

**The result.** The run returns `status: 'interrupted'` — type `RunInterruptedResult<string>`, with
the guard `isRunInterruptedResult`. It carries an **opaque continuation token**.

**Resuming.** The host passes resolutions keyed by interruption id:

```js
resolutions: approval.interruptions.map((interruption) => ({
  interruptionId: interruption.id,
  value: true,
})),
```

**What must match on resume.** *"The original source, asynchronous and synchronous host function
names, module loader identity, audience, and continuation context must match when the run
resumes."* A changed tool surface invalidates a pending continuation.

**The token is signed, not encrypted.** The default codec uses HMAC. The docs state that source,
arguments, results and payloads *may be visible to token recipients*. Configuration:

```js
createRunner({
  continuationSecret: process.env.RUN_CONTINUATION_SECRET, // at least 32 bytes
  continuationAudience: 'message-approval-v1',
});
```

**Expiry and replay.** Signed tokens expire **after one hour by default**, and stay **replayable
until they expire**. The docs give three warnings:

- *"Treat every continuation token as a bearer capability."*
- Store it behind access controls, send it over an authenticated channel, never log the raw token.
- *"Scope validation does not authorize the person submitting a resolution."*

**The replay claim, stated precisely.** The brief says finished host calls are not replayed. The
docs are narrower: *"Replay uses recorded synchronous and module outcomes without invoking those
integrations again."* Asynchronous calls that happen **after** the interruption point *"dispatch
normally"*. So the guarantee covers recorded synchronous and module outcomes, not everything.

**The other codec.** `createStoredContinuationCodec({ storage, maxAgeMs })` keeps continuation
state in host-controlled storage. It implements a claim lifecycle: `acquire()`, `release()`,
`consume()`. This is the mechanism that makes a continuation single-use.

---

## 2. Worker threads and Electron

**`run@2.1.2` has zero runtime dependencies.** The only peer dependency is
`typescript >=5.1.6 <7`.

**There is no WASM file and no native module.** No `.wasm` and no `.node` exists in the package.
QuickJS is inlined into `dist/runtime/worker-source.js` — one line, 944 KB.

**How the worker starts.** From `dist/runtime/manager.js`:

```js
function createRuntimeWorker() {
  if (isBunRuntime) {
    return new Worker(INLINE_RUN_WORKER_SOURCE, { eval: true, execArgv: [] });
  }
  return new Worker(getInlineWorkerUrl(), { execArgv: [] });
}
// getInlineWorkerUrl() builds a memoised data:text/javascript;base64,... URL.
```

Under Node the worker starts from a **`data:` URL**, not from a file. Nothing is read from disk.

**What this means for Sero packaging.** Nothing needs `asarUnpack`. Sero's Electron main is
already ESM — `main = dist/electron/main.mjs`, built by esbuild with `format: 'esm'` and
`bundle: true` (`apps/desktop/scripts/build-electron.mjs:21-27`). `run` is not in that build's
`external` list, so it bundles straight in. `run` is ESM-only (`"type": "module"`), which the
existing ESM main accepts.

**Worker cost.** `dist/runtime/max-workers.js` caps the pool at **32 workers** and estimates
**48 MiB overhead per worker** on top of `memoryLimitBytes`. Admission is based on available
memory. The Electron main process pays this.

**Node version.** The package declares `engines: { node: ">=20.19.0" }`. The introduction page
says Node 22.13 or newer. The two disagree. Sero runs Node 22.22.0, so it satisfies both.

**Not verified.** Nobody has run this inside an Electron main process. That is the job of
[the prototype spike](https://github.com/sero-labs/sero/issues/488).

---

## 3. Serialization

The host and guest share no memory. Every value is encoded, copied and rebuilt.

Serialization applies to host function arguments, host function outputs, the final result,
interruption payloads, resolutions, and the host function history inside a continuation.

**Supported:** strings, numbers, booleans, `null`, objects, arrays, `undefined`, `BigInt`, `NaN`,
infinity, negative zero, dates, regular expressions, maps, sets, array buffers, data views, typed
arrays, errors, aggregate errors. Cyclic objects, sparse arrays and repeated references survive
within one transferred value.

**Not supported:** functions, symbols, promises, weak collections, weak references, and arbitrary
class instances. A host function *may* return a promise, because the runtime awaits it, but the
promise itself never reaches the guest.

**The rule for Sero.** Every tool handler exposed as a host function must return plain data. A
class instance loses its prototype, its methods and its private state. Failures raise
`RUN_SERIALIZATION_ERROR`.

---

## 4. Limits

Every invocation has a `RunLimits` budget. It covers the whole invocation: guest execution, host
function calls, result serialization and continuation operations.

| Limit | Default | Bounds |
| --- | --- | --- |
| `timeoutMs` | 30 seconds | The complete invocation |
| `memoryLimitBytes` | 64 MiB | QuickJS and sync-bridge admission |
| `maxStackSizeBytes` | 2 MiB | QuickJS stack |
| `maxSourceBytes` | 256 KiB | Entry and loaded module source |
| `maxResultBytes` | 1 MiB | Serialized result data |
| `maxConsoleOutputBytes` | 64 KiB | Guest console output |
| `maxHostFunctionArgumentsBytes` | 1 MiB | Serialized arguments for one call |
| `maxHostFunctionOutputBytes` | 4 MiB | Serialized binding or loader output |
| `maxBridgeRequests` | 256 | Binding and module requests |
| `maxInFlightBridgeRequests` | 32 | Host function calls active at once |
| `maxContinuationBytes` | 32 MiB | Serialized continuation state |

Limits are set on `createRunner({ limits })` and may be overridden per `run({ limits })`. Only the
named values are replaced; the rest come from the runner.

**Sizes are measured after encoding.** A small-looking object can serialize much larger.

**Failure codes.** `RUN_TIMEOUT`, `RUN_SOURCE_TOO_LARGE`, `RUN_BRIDGE_LIMIT`,
`RUN_HOST_FUNCTION_ERROR`, `RUN_SERIALIZATION_ERROR`, `RUN_PROTOCOL_ERROR` (which covers a
continuation over `maxContinuationBytes`). Use `RunError.isInstance(error)` and `error.code`.

**QuickJS memory and stack exhaustion have no stable error code.** Treat them as runtime failures.

**The docs warn against automatic retry.** *"Do not automatically retry a limit violation with a
larger budget. First determine whether the source is behaving as expected and whether host side
effects are safe to repeat."*

**What bites Sero.** `maxHostFunctionOutputBytes` is 4 MiB for one call, and `maxResultBytes` is
1 MiB. A large `bash` output or a large `read` can exceed them. `maxInFlightBridgeRequests` of 32
also caps how wide a `Promise.all` over tools can go.

---

## 5. TypeScript and imports

`source` is *"JavaScript or type-stripped TypeScript source"*.

- **Without `moduleLoader`:** the source is *"an async function body with top-level await and
  return"*. There are no imports at all.
- **With `moduleLoader`:** the source is an ES module. The loader is host-controlled and needs
  *"a non-empty stable identity"* to create or resume continuations. Module-backed runs return
  `value: undefined`.

So the guest can only import what the host chooses to serve. There is no ambient module access.

`maxSourceBytes` applies **both before and after** type stripping.

---

## 6. Maturity

- **Version 2.1.2.** Licence **Apache-2.0**. Repository `vercel-labs/run`.
- **The release cadence is very fast.** 2.0.0 shipped 2026-08-13. 2.1.2 shipped 2026-08-31. That
  is eight releases in about nineteen days.
- The docs do not declare the API stable. **Not documented.**
- No blocking open issue was identified from the published package alone.

**The risk.** A dependency this young moves under you. Pin the exact version, and keep the call
site behind one narrow seam so an upgrade is a single-file change.
