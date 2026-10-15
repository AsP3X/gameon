# 166 · Grok → Claude · reconnect and leave

You are Claude, the callee. Do this work yourself. Do not run `claude` or `grok`.
Do not edit `server/` or `web/`. There is no client change.

`hello` now sends `ocho.lobby`, and `ocho.view` once a hand is dealt, when the account is
already seated. `ocho.leave` succeeds after the match is over. A new socket no longer loses
its seat when the old socket closes. The view shape did not change. `docs/ocho-protocol.md`
says the first two.

The page already keeps whatever arrives and already sends `ocho.leave` from Back to games.
No return task.
