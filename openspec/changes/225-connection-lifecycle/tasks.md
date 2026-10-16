# Tasks: 225-connection-lifecycle

## Group 1: Implementation and focused tests

- [x] Implement `src/simulation/ConnectionLifecycle.ts` — `ConnectionState`,
      `ConnectionLifecycleOptions`, `TransitionRecord`, and `ConnectionLifecycle` with option
      validation (`ConnectionLifecycle: <detail>` throws), defaults, strict per-event source
      state validation, profile/reason validation, timeout arming/expiry in `update`,
      graceful/remote disconnect paths, `keepAliveCount`, bounded history, and `reset()`.
- [x] Unit tests: construction — pristine default state, defaults applied, invalid duration
      and history-limit rejections.
- [x] Unit tests: happy path — `connect(profile)`/`connected()`/`handshakeAccepted(profile)`
      chain, state/profile/getters per step, `at` timestamps and from/to chain in history,
      profile update at accept.
- [x] Unit tests: validation — every wrong-state event throws and changes nothing
      (connect-while-active, keepalive-before-connected, handshake-accept/reject before
      handshake, disconnect from disconnected/disconnecting, complete before disconnect,
      remoteDisconnect from disconnected); empty profile/reason rejected.
- [x] Unit tests: disconnects — graceful disconnect + complete (intermediate
      `disconnecting`, final reason), remote disconnect from each active state, reconnect
      cycle resets keepalive count.
- [x] Unit tests: keepalive — counter increments only in `connected`, deadline refresh
      (1099 stays connected, 1100 expires with `keepalive timeout`).
- [x] Unit tests: timeouts — connect timeout, handshake timeout, keepalive timeout at the
      `>=` boundary, non-finite/backward timestamps inert, no expiry while disconnected/
      disconnecting.
- [x] Unit tests: reset/history — reset restores pristine state; bounded history drops
      oldest; `history` returns a snapshot that external mutation cannot affect.
- [x] Unit tests: determinism — identical event schedules with identical scripted time
      produce identical state/reason/count/history on two instances.

## Group 2: Integration and regression

- [x] `npm run typecheck` and `npm run lint` clean.
- [x] Full unit suite `npm test` green (expect 2893 + new count; full run at
      `--testTimeout=15000` to avoid the documented grid-sweep load flake).
- [x] `npm run build` and `npm run test:e2e` green (22/22).

## Group 3: State, docs, publication

- [x] Update `openspec/PROGRAM_STATE.json` (currentChange 225 VERIFIED, completedTasks,
      validationResults entry with the feature head) and `openspec/PROGRAM_STATE.md`
      (checkpoint block + "What 225 implemented" section; next 226-server-chunk-streaming).
- [x] Commit feature + state advance, push to `origin/main`, verify published head matches
      local HEAD, and report the session.
