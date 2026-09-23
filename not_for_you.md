# not_for_you.md

A personal working log. Nothing here is needed to run or contribute to ShopFlow;
[README.md](README.md) and [DEVDOC.md](DEVDOC.md) cover that.

---

## The overhaul pass, 2026-09-23

This repository arrived in better shape than most. The last four commits had
already fixed dead-letter loss, added correlation-ID tracing, log rotation, CI
and loopback-only API binding, and moved RabbitMQ credentials out of the CI
workflow. 154 unit tests passed and ruff was clean before I touched anything.
So most of this log is about two things I got wrong and one I got right.

### The HAProxy change I had to take back

`infrastructure/haproxy/haproxy.cfg` had `stats auth admin:shopflow123`
hardcoded, while every other service in the stack reads
`${RABBITMQ_PASS:-shopflow123}`. Change the password everywhere and that page
keeps answering to the old one. A real config-drift bug, and the haproxy service
had no `environment:` block at all, so it could not have read the variable even
if the config asked for it.

So I parameterised it, added the environment block, and added a guard:

```
.if !defined(RABBITMQ_PASS)
    .alert "RABBITMQ_PASS is not set; refusing to publish the stats page..."
.endif
    stats auth ${RABBITMQ_USER}:${RABBITMQ_PASS}
```

`haproxy -c` validated it. The guard fired correctly when the variable was
missing and passed when it was set. It looked finished.

**HAProxy does not expand `${VAR}` in `stats auth`.** It does not fail either.
It takes the literal text as the username and password. Proved it by starting a
minimal config in a container and curling the stats page:

| credentials tried | result |
|---|---|
| no auth | 401 |
| `admin:shopflow123` | 401 |
| `admin:wrong` | 401 |
| **`${RABBITMQ_USER}:${RABBITMQ_PASS}` literally** | **200** |

So my "fix" replaced a documented demo password with a predictable literal one.
Worse than what it replaced, and `haproxy -c` cannot see it, because the config
is syntactically perfect.

Reverted. The credential is hardcoded again, with a comment explaining exactly
why it cannot be parameterised and a matching note in `.env.example` so whoever
changes `RABBITMQ_PASS` knows to change this too. Rendering the config from a
template at container start would fix it properly, and that is more machinery
than a demo stats page is worth.

**What found it was CI**, specifically validate.sh test 24, "All 3 HAProxy
backends are UP", which reads the stats CSV over basic auth. Twenty-three of
twenty-four checks passed; that one failure was the only visible symptom.

### An arrow that was valid everywhere except JSX

116 non-ASCII characters across thirteen files: 86 em dashes, 17 arrows, 7 en
dashes, 4 stars and 2 coffee cups. The mechanical replacement was mostly fine,
with two wrinkles.

The arrows in the README's routing diagram are inside a code fence and
column-aligned:

```
  notification.email.*    -> notif_email_queue
  notification.sms.urgent -> notif_sms_queue
```

Replacing a one-character arrow with a two-character `->` shifts every target
one column right. Consuming one of the preceding spaces keeps the alignment.

The other wrinkle cost a CI run. In `panels/advanced.jsx` the arrow was in JSX
text, and `->` there is a parse error: JSX reads the bare `>` as a tag. It needs
`{'->'}`. That broke both the frontend lint job and, less obviously, the
frontend Docker build inside the integration job, which is why three jobs went
red from one character.

### The coffee cup that is a test, not decoration

`test_encodes_utf8` asserted a round trip through a string containing a
Latin-1 supplement letter and a coffee-cup dingbat.

The dingbat sweep flags this, and deleting it would quietly weaken the only test
asserting that non-ASCII survives an encode/decode round trip.

Replaced with a string that tests more: a two-byte Latin-1 supplement letter, a
three-byte CJK run, and a four-byte astral-plane codepoint that is a surrogate
pair in UTF-16. The last is the interesting one, because a library that handles
the first two can still mangle it. The hygiene job in CI exempts this one file
by path, with the reason written next to the exemption.

### Smaller things

- `python-dotenv` was pinned at 1.0.1, two minor versions behind an advisory
  where `set_key()` and `unset_key()` follow symlinks when rewriting `.env`.
  This project never calls either function, so it was not exploitable here, but
  nothing was checking runtime dependencies at all. Bumped to 1.2.2 and added a
  `pip-audit` job.
- `docs/DEVELOPMENT.md` became `DEVDOC.md` at the root, which is where every
  other repository in this job keeps it. Its logo path needed adjusting for the
  move.

### Left alone

- **The demo credentials stay committed.** `.env.example` already says they are
  demonstration defaults, deliberately committed so the stack runs out of the
  box, and warns to change all three before exposing it to a network. That is
  the right call for a teaching system, and the Erlang cookie is in the same
  category.
- **No dashboard screenshots.** Capturing them needs all 24 services up, and
  this machine was already running the owner's local Supabase stack and
  TourismToolKit, both up twelve hours. Starting a three-node RabbitMQ cluster
  and sixteen consumers alongside them risked the OOM killer taking something of
  theirs. Left for the owner to decide.
