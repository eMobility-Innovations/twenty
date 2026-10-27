"""The fleet alert contract client — make conforming EASIER than hand-rolling.

    curl -fsS http://192.168.103.231:8097/v1/client > alert_client.py

THIS FILE IS THE ANSWER TO THE ACTUAL QUESTION. The operator wires 1-2 new notifications
a day and every one breaks the rules — not out of carelessness, but because hand-rolling
`{"text": ..., "channel": ...}` and `urlopen`-ing it is four lines, and doing it properly
was a document. So the rules got documentation and the payloads got improvised. A rule
that is harder to follow than to break is a preference.

    client = AlertClient(owner_repo="eMobility-Innovations/kc-cache", service="kc-cache",
                         spool_dir="/var/lib/kc-cache/alert-spool")
    client.fire(entity="ct246", fingerprint="kc-cache:read-timeout",
                title="kc-cache read timed out", body="3 consecutive timeouts",
                severity="major", page=True, runbook="docs/runbooks/kc-cache.md")
    ...
    client.clear(entity="ct246", fingerprint="kc-cache:read-timeout",
                 title="kc-cache reads recovered", body="2 clean cycles")

IF YOUR ENTITY IS THIS MACHINE, USE `pinned_host()` — NEVER `hostname`.

    client.fire(entity=pinned_host(), ...)      # `patryk-macbook`, across a rename
    ENTITY="$(python3 alert_client.py --print-pinned-host)"     # the same, from shell

A hostname is a setting, not an identity. Renaming one workstation on 2026-08-19 left
eleven conditions open under a name no producer would ever post again — the relay declares
no DELETE, so they are unclosable forever. `pinned_host()` reads the name the policy beacon
pinned at enrolment and falls back to the hostname only where there is no pin at all. See
its docstring for the order and why it is duplicated here rather than imported.

STANDALONE ON PURPOSE. Zero imports outside the standard library and zero imports from
this repo, so it is copied into a producer repo as one file and just works — the vendoring
model every `_notify_rail.py` in the estate already uses, except that this one is served
from the relay it talks to, so a repo can refresh it without knowing where the fleet repo
lives. Python 3.9+.

IT NEVER RAISES, AND IT NEVER DROPS.
  * A malformed call is FIXED UP and sent, with a warning on stderr. Refusing would turn
    a badly-shaped alert into a missed one, which is the one outcome this programme does
    not accept (operator decision 7) — and the client refusing would be worse than the
    relay refusing, because it fails at the producer where nobody is watching.
  * A relay that is down does not lose the alert: it is SPOOLED to disk (tmp + fsync +
    `os.replace`) and replayed on the next call or by `flush_spool()`. Spooling is
    preferred over falling back to the direct Mattermost hook, because the fallback is
    exactly what makes bypass invisible. A `fallback_webhook` is still available for a
    producer that cannot host a spool — use it and SAY SO in your handover.
  * Every exception inside this module is caught. A notification helper must never be
    what crashes the watchdog that called it.

WHAT IT DOES NOT DO. It does not judge your fingerprint. Fingerprint stability is checked
in two places that can actually see it: at commit time by
`claude-code-policy/bin/alert-contract-guard.py`, and at runtime from BEHAVIOUR by
`alert_ledger.unstable_fingerprints`. A client-side digit-grep would flag `ct170` and
`:5433`, which are perfectly stable — measure behaviour, not source text.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request

CONTRACT_VERSION = "v1"
# THE VERSION THE DRIFT DETECTOR READS. It exists because without it there was no way
# to tell a stale copy from a current one, and on 2026-08-18 that cost exactly what you
# would expect: the direction-aware rung one landed in `claude-code-policy`'s vendored
# copy and NOT in `proxmox-fleet-manager/control_ct/alert_client.py`, which is the file
# the relay itself serves at `/v1/client`. Every producer refreshing from the relay kept
# getting the old client, and `policy/vendored-artefacts.json` could not notice because
# its `alert-client` entry was disabled for want of a version to compare and an upstream
# to compare it with. Both are now declared. BUMP THIS on every change to this file.
CLIENT_VERSION = "1.20.0"
# THE NAME. Was `alert-relay.ha.fiszu.com` from 2026-08-12; changed 2026-08-18 because
# that name CANNOT work from outside the LAN and never could. Public DNS sends `.ha` names
# to Cloudflare, whose Universal SSL certificate covers `fiszu.com, *.fiszu.com` — ONE
# label — so a two-label name gets no certificate and the handshake is aborted before any
# HTTP happens (measured from a workstation: curl exit 35, HTTP 000). Every workstation
# producer therefore fell silently to rung two, the RFC1918 path the transport rule exists
# to forbid: compliant in configuration, non-compliant in behaviour.
#
# `alert-relay.fiszu.com` is one label, covered by the existing wildcard, and is attached
# at the Pangolin edge to `192.168.103.231:8097`. Verified from a workstation over the
# public internet: HTTP 200, ssl_verify=0, cert `CN=fiszu.com` (Let's Encrypt). The `.ha`
# name stays exactly as it is for server-to-server producers, which it serves correctly.
DEFAULT_URL = os.environ.get("FLEET_ALERT_RELAY_URL",
                             "https://alert-relay.fiszu.com/v1/alert")
# The SAME relay, addressed directly — rung two, not a second destination and not a
# configuration knob. A producer that cannot resolve `*.ha.fiszu.com` internally (the
# workstation resolves it publicly, deliberately) would otherwise skip straight to its
# fallback hook or its spool, and both of those lose the ledger row that makes this
# client worth vendoring in the first place.
# THE SERVER-TO-SERVER RUNG. Split-horizon resolves this to 192.168.103.232, the internal
# proxy, which holds a real Let's Encrypt `CN=*.ha.fiszu.com`. It is keyless by operator
# decision and it works perfectly — nothing about the internal leg needed changing.
DEFAULT_HA_URL = os.environ.get("FLEET_ALERT_RELAY_HA_URL",
                                "https://alert-relay.ha.fiszu.com/v1/alert")
DEFAULT_ALT_URL = os.environ.get("FLEET_ALERT_RELAY_ALT_URL",
                                 "http://192.168.103.231:8097/v1/alert")
DEFAULT_CHANNEL = "000-server-stability-notifications-dev"

# THE KEY FOR RUNG ONE. The relay had no authentication of any kind, so publishing a
# public name without one would have put an unauthenticated write endpoint — feeding the
# Server Stability channel, with a producer-supplied `source` — on the open internet. The
# relay now requires `X-Alert-Key` on the PUBLIC leg ONLY: the `.ha` leg and rung two are
# keyless by operator decision, so no server-side producer changed.
#
# A MISSING KEY IS NOT AN OUTAGE, and that is deliberate. Rung one answers 401, `_post`
# moves to rung two, and the alert is delivered. A machine that has not been given the
# secret degrades to exactly the previous behaviour instead of dropping alerts.
#
# ── AND THAT IS NOW THE PERMANENT ANSWER, NOT A GAP WAITING TO BE CLOSED ──────────────
#
# Operator decision, 2026-08-20: keyless machines stay on rung two. There is no fleet-wide
# provisioning of the SHARED key into `~/.claude/alert-relay.key` and none is going to be
# built. (What IS provisioned since 2026-10-08 is a machine's OWN per-identity `rk_` key,
# by `claude-code-policy/bin/relay-key-enrol.py`, into the same file when it holds no
# shared key — revocable per device, dead with the account, gated by the access matrix;
# see `control_ct/relay_identity_keys.py`. That answers the contributor case the ruling
# below could not, without the shared secret ever leaving the control plane.) Do not re-open
# this by reading the 401 stream as a work list — it was read as one, and here is what it
# actually held.
#
# The relay was taught to NAME the refused producer (#1050) precisely so the question could
# be answered instead of estimated. Measured over three windows on 2026-08-20 (50, 74 and
# 84 minutes, same answer each time): 117 refusals, 86 named, and the callers are FIVE
# machines — not the ~29 the IP-level table suggested, because a handful of machines each
# running several producers looks identical, at IP level, to a large unkeyed fleet.
#
# Of those five, a key is the right tool for at most two — `escooterclinic@PatrykPCAsus`
# and `KarolMiazga-Kojak@PCKJK`, personal Windows workstations between them accounting for
# 5 of 117 calls. Spreading a shared secret onto two people's own machines to save them one
# round trip each is a worse trade than the round trip. The other three are not key
# problems at all:
#
#   * the netcup VPS (`v2202604264507451294`) is 77 of 117 — a real off-estate fleet host,
#     but keying it needs inbound access it does not currently have; that is its own row,
#     and it is the ONLY member of this population that would change the numbers;
#   * `headscale` and `th323` are estate/personal side, where rung one is the keyless `.ha`
#     leg. For them a 401 on the PUBLIC leg means they had already fallen PAST rung one, so
#     it is a symptom of something else. Keying them does not fix that — it DELETES THE
#     EVIDENCE of it, by turning the visible 401 into a silent success on a rung they
#     should never have reached. Confirmed the same day: a population calling from behind
#     CT232 ran for 24h and stopped, and a positive control from that host showed rung one
#     answering HTTP 200 in 24ms. Healthy rung one, all along.
#
# So the refusal stream is not a backlog. It is a DETECTOR, and the thing it detects is a
# producer falling past rung one. 🛑 Do not silence the relay's refusal log line, and do
# not "fix" the 401 rate by handing out keys.
KEY_FILE = os.environ.get("FLEET_ALERT_RELAY_KEY_FILE",
                          os.path.expanduser("~/.claude/alert-relay.key"))


def _resolve_ha() -> str:
    """The address `alert-relay.ha.fiszu.com` resolves to here, or "" — never raises.

    Split-horizon answers with an RFC1918 address inside the estate. From outside, the
    SAME NAME still resolves — to Cloudflare — which is exactly what made this whole
    filing expensive, so "it resolved" is not the test. See `inside_the_estate`.
    """
    import socket
    host = DEFAULT_HA_URL.split("://", 1)[-1].split("/", 1)[0].split(":")[0]
    try:
        return socket.getaddrinfo(host, None, socket.AF_INET)[0][4][0]
    except Exception:   # noqa: BLE001 — a resolver failure is a measurement, not a crash
        return ""


def inside_the_estate() -> bool:
    """Is this a SERVER (split-horizon present) or an OPERATOR (public WAN)?

    This is the operator's transport rule expressed as a measurement rather than a
    setting: *operator-to-server must ride the public WAN; server-to-server may use
    split-horizon.* A PRIVATE answer for the `.ha` name means split-horizon is answering,
    which means this is the server direction.
    """
    import ipaddress
    addr = _resolve_ha()
    if not addr:
        return False
    try:
        return ipaddress.ip_address(addr).is_private or ipaddress.ip_address(addr).is_loopback
    except ValueError:
        return False


def pinned_url() -> str:
    """An explicit `FLEET_ALERT_RELAY_URL`, or "" — read at CALL time, never at import.

    `DEFAULT_URL` snapshots the same variable when this module is imported. That is fine
    for the constant, and wrong for a decision: a caller that exports the override and
    then imports (a test harness, a systemd unit whose EnvironmentFile is read late) would
    otherwise be told the operator had said nothing.
    """
    return os.environ.get("FLEET_ALERT_RELAY_URL", "").strip()


def default_rung_one() -> str:
    """Rung one: an explicit override if there is one, otherwise chosen by DIRECTION.

    MEASURED 2026-08-18 on CT231, which is why the direction half is not a constant: from
    a server the public name resolves to 89.222.20.15, the PUBLIC edge. Making it rung one
    for everyone sent server-to-server alerts out over the WAN and back through the edge,
    where they were refused for want of a key a server has no reason to hold, and landed
    on rung two — the exact condition that change exists to end, reintroduced from the
    other side.

    THE OVERRIDE HAD TO BE ADDED BACK ON TOP OF IT. `DEFAULT_URL` honours
    `FLEET_ALERT_RELAY_URL`; this function is what `AlertClient.__init__` actually calls,
    and it returned `DEFAULT_HA_URL` whenever `inside_the_estate()` was true without ever
    consulting the override. `inside_the_estate()` is true for anything resolving the `.ha`
    name privately — that is EVERY SERVER ON THE FLEET — so on a server the variable did
    nothing, and there was no error to notice.

    It was found the expensive way. Two notify-rail tests point the client at a local HTTP
    sink through this variable. They passed on the operator's workstation (public
    resolution, so `DEFAULT_URL`, so the override held) and failed on the Linux gate
    runner, where the client walked straight past the sink and posted to the LIVE relay —
    every suite run on an in-estate runner firing real alerts into the Server Stability
    channel.

    An explicit override beats auto-detection, always. Auto-detection is a guess about
    where this process is; the variable is somebody saying where the alert goes.
    """
    override = pinned_url()
    if override:
        return override
    return DEFAULT_HA_URL if inside_the_estate() else DEFAULT_URL


def relay_key() -> str:
    """The rung-one secret: the environment first, then the key file, else "".

    The environment wins because an explicit export is an operator overriding the file,
    not a tie. A missing or unreadable file is "" — never an exception: this runs on the
    alerting path, and a client that raised while reporting a fault would take the
    fault's own report down with it.
    """
    from_env = (os.environ.get("FLEET_ALERT_RELAY_KEY") or "").strip()
    if from_env:
        return from_env
    try:
        with open(KEY_FILE, encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return ""



#: WHERE THE POLICY PACKAGE KEEPS ITS PINS, when there is one. `CLAUDE_POLICY_CONFIG` is
#: the SAME variable `claude-code-policy/bin/machine_identity.py` reads, and it is honoured
#: here for one reason: two readers of the same pin that disagree about WHERE it lives are
#: worse than one reader. A machine that has relocated its policy config — a test jail, the
#: gate runner inside its egress jail — would otherwise have `machine_identity` answering
#: from the relocated directory while this client read the default path, where nothing is
#: written, and silently fell through to the live hostname. That is the exact failure this
#: whole file's `pinned_host` exists to end.
#:
#: The two `FLEET_ALERT_*` overrides below still win, because an explicit absolute path is
#: an operator naming one file, not relocating a directory.
POLICY_CONFIG_DIR = (os.environ.get("CLAUDE_POLICY_CONFIG")
                     or os.path.expanduser("~/.config/claude-policy"))

#: WHERE A MACHINE'S STABLE NAME LIVES when the policy package is installed. Absent on a
#: server that only vendors this client, which is why the hostname is a first-class
#: fallback rather than an error path.
MACHINE_ID_FILE = os.environ.get(
    "FLEET_ALERT_MACHINE_ID_FILE",
    os.path.join(POLICY_CONFIG_DIR, "machine-id"))

#: THE PINNED SHORT HOST NAME — `patryk-macbook`, not `patryk-macbook.local` and not
#: whatever the OS is calling itself this afternoon. Written by the policy beacon at
#: enrolment. This is the file `machine_identity.host()` consults first, and `pinned_host`
#: below consults it first for the same reason: it is exactly this field.
ENROLLED_HOST_FILE = os.environ.get(
    "FLEET_ALERT_ENROLLED_HOST_FILE",
    os.path.join(POLICY_CONFIG_DIR, "enrolled-host"))


def producer_identity() -> str:
    """WHO IS SENDING THIS. `id:<machine-id>` when there is one, else `host:<hostname>`.

    THE FIELD THE ESTATE WAS MISSING. MEASURED 2026-08-19 on the relay's ledger: every
    alert raised on a workstation is recorded with `producer_ip = 192.168.103.191` -- the
    Pangolin edge, not the machine -- because the edge IS the TCP peer for anything on the
    public rung. Nine enrolled machines were indistinguishable from one, so "which machine
    is flooding the channel" had no answer at all. The 2026-08-18 rung change put every
    workstation on that leg deliberately and correctly; losing attribution was its
    unrecorded side effect.

    THE RELAY RECORDS THIS AS A CLAIM, IN A FIELD NAMED `producer_claimed`, and never
    merges it into `producer_ip` -- see `alert_ledger.record`. It is client-written and
    therefore forgeable, exactly as `owner_repo`, `service` and `entity` already are. It
    is never an access decision: `public_leg_refusal` is not given headers at all and a
    test pins that signature.

    THE VALUE CARRIES ITS PROVENANCE. `id:` and `host:` are not decoration -- a hostname
    is chosen by whoever runs the box and two machines can share one, while a machine-id
    is minted once at enrolment. A reader that cannot tell which it got cannot know how
    much to trust it.

    Never raises. This runs on the alerting path, and a client that threw while naming
    itself would take down the report of the fault it was sending.
    """
    try:
        with open(MACHINE_ID_FILE, encoding="utf-8") as fh:
            value = fh.read().strip()
        if value:
            return "id:" + value
    except OSError:
        pass
    try:
        import socket
        host = socket.gethostname().strip()
        if host:
            return "host:" + host
    except Exception:   # noqa: BLE001 -- naming yourself must never fail the alert
        pass
    return ""


def _first_line(path: str) -> str:
    """First non-empty line of a pinned file, or "" — never raises.

    Deliberately the same shape as `machine_identity._read`: a pin file is written a line
    at a time by a beacon that may be interrupted, so the FIRST line is the value and
    anything after it is history, not part of the answer.
    """
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    return line
    except (OSError, ValueError, UnicodeDecodeError):
        pass
    return ""


def _short_host(name: str) -> str:
    """`Patryks-MacBook-Pro.local` -> `Patryks-MacBook-Pro`. CASE IS PRESERVED.

    Folding case here would be a silent rewrite of an identity the estate already has rows
    under: measured on the relay 2026-08-30, `kc-cache` stamped `Patryks-MacBook-Pro.local`
    verbatim while `pangolin-rail` lowercased via its own `tr`, and BOTH rows exist. A
    normaliser matches one and strands the other. Compare folded if you must compare;
    never stamp folded.
    """
    return (name or "").strip().split(".")[0]


def live_host() -> str:
    """What the OS calls this machine RIGHT NOW, domain stripped, or "" — never raises.

    An ATTRIBUTE of the machine, not its name. Correct for a diagnostic comparing live
    against pinned, and WRONG for anything that stamps a record — which is what
    `pinned_host` is for. It is exported rather than inlined so that a producer that
    genuinely wants the live name says so at the call site.
    """
    try:
        import socket
        return _short_host(socket.gethostname())
    except Exception:   # noqa: BLE001 -- naming yourself must never fail the alert
        return ""


def pinned_host() -> str:
    """THE NAME AN `entity=` SHOULD CARRY. The pin if there is one, else the live name.

    WHY THIS IS ON THE CLIENT AND NOT LEFT TO EACH PRODUCER. A machine's hostname is not
    an identity — it is a setting, and one workstation being renamed from
    `Patryks-MacBook-Pro` to `patryk-macbook` on 2026-08-19 made every condition those
    producers had open under the old name PERMANENTLY UNCLOSABLE: the relay declares no
    DELETE, and a producer that has changed its entity never posts the old one again to
    clear it. Eleven rows were stranded by that one rename. Measured on the relay
    2026-08-30, 105 of 149 producers post a machine-name entity and 47 of those key on a
    person's workstation, so the next rename is not a hypothesis.

    THE FIX HAD TO LAND HERE, at the chokepoint. `claude-code-policy/bin/machine_identity.py`
    has held the stable name since 2026-08-19, and the producers that still stamp the live
    one are exactly the ones that CANNOT import it — they run on hosts with no policy
    package at all, and they refresh this file from the relay's `/v1/client`. Putting the
    pin behind an import they cannot reach is why they were never migrated. Reading the pin
    FILE, with the hostname as a first-class fallback, is the same answer available to
    everyone.

    THE ORDER MATCHES `machine_identity.host()` EXACTLY, and must keep matching it:

      1. `enrolled-host` — the field itself, a short host name pinned by the beacon.
      2. the host half of `machine-id` — so a machine enrolled through the gate-fallback
         rail, which writes only `machine-id`, still answers with its pinned name instead
         of falling through.
      3. the live hostname — for the server that vendors this client and has no policy
         package. Not an error path: it is what those hosts have always stamped, and a
         name that has never been pinned cannot have been renamed out from under a row.

    Two implementations of one contract is the risk this creates, and it is accepted with
    its eyes open: the alternative is an import 105 producers cannot perform.
    `tests/test_alert_client_pinned_host.py` pins the order, the case rule and the
    fallback, and reads the contract off `machine_identity` where that module is present.

    Never raises, for the same reason `producer_identity` never raises.
    """
    pinned = _short_host(_first_line(ENROLLED_HOST_FILE))
    if pinned:
        return pinned
    identity_pin = _first_line(MACHINE_ID_FILE)
    if "@" in identity_pin:
        pinned = _short_host(identity_pin.rsplit("@", 1)[1])
        if pinned:
            return pinned
    return live_host()


# ------------------------------------------------------------------ WHICH RUNG
#: Reported by `send()` and named on stderr whenever an alert did not leave on rung one.
RUNG_PUBLIC = "public"
RUNG_INTERNAL = "internal"
RUNG_UNKNOWN = "unknown"


def rung_class(destination: str) -> str:
    """PUBLIC or INTERNAL — RESOLVED at delivery, never read off the URL.

    `claude-code-policy/bin/policies/_transport.py` records that destination SYNTAX
    cannot say who is dialling a rail, and that finding stands: this does not claim to answer direction.
    It answers the narrower question the string also gets wrong —
    `alert-relay.ha.fiszu.com` IS an internal address inside the estate and a Cloudflare
    address outside it, one literal and two honest answers — so the host is resolved and
    the verdict is whatever it actually resolved to at the moment of delivery.

    Never raises. This runs on the alerting path, and a client that crashed while
    reporting a fault would take the fault's own report down with it.
    """
    import ipaddress
    import socket
    import urllib.parse
    host = urllib.parse.urlsplit(destination or "").hostname or ""
    if not host:
        return RUNG_UNKNOWN
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        try:
            addr = ipaddress.ip_address(
                socket.getaddrinfo(host, None, socket.AF_INET)[0][4][0])
        except Exception:   # noqa: BLE001 — a resolver failure is a measurement, not a crash
            return RUNG_UNKNOWN
    return RUNG_INTERNAL if addr.is_private or addr.is_loopback else RUNG_PUBLIC


STATE_FIRE = "fire"
STATE_CLEAR = "clear"
SEVERITIES = ("major", "routine")

# Above this the spool has stopped being a hiccup and become a fault of its own. It is a
# LOUD WARNING, never a cap: a spool that discarded alerts to protect a disk would be
# solving the cheap problem by causing the expensive one.
SPOOL_WARN_DEPTH = 1000


def _log(msg: str) -> None:
    sys.stderr.write(f"[alert-client] {msg}\n")
    sys.stderr.flush()


def _rung_failures(failures) -> str:
    """Every rung's refusal, in the order they were tried, on one greppable line.

    ONE rung reads exactly as it always did — `<url>: <error>` — so a caller that pinned
    a single destination gets no chain-shaped noise and existing eyes and greps still
    work. Two or more are numbered, because the whole point is telling rung one's fault
    apart from rung three's: they fail for different reasons and have different remedies,
    and a reader who cannot separate them is the reader who probes the wrong port.
    """
    if not failures:
        return "no rung was tried"
    if len(failures) == 1:
        return failures[0]
    return " | ".join(f"rung {i}: {f}" for i, f in enumerate(failures, 1))


def _text(value) -> str:
    return "" if value is None else str(value).strip()


#: A payload the relay can never accept is worse than a lost one: the spool replays oldest
#: first and stops at the first failure, so ONE 4.27 MB payload (refused 413 by the relay's
#: 2.5 MB ingest ceiling) blocked every later alert behind it for a day and was re-sent, and
#: refused, on every send (57 files, 242 MB on CT231, 2026-10-26). The producer caps its own
#: text, with a notice, so nothing it builds can exceed the ceiling.
BODY_MAX_CHARS = 500_000
FIELD_MAX_CHARS = 2_000


def _cap(value, limit: int) -> str:
    text = _text(value)
    if len(text) <= limit:
        return text
    notice = f"\n\n_...TRUNCATED by the alert client, {len(text) - limit} more character(s) withheld._"
    return text[:max(limit - len(notice), 0)].rstrip() + notice


#: A spool file THIS client wrote: `<20-digit microseconds>-<pid>.json`, the format
#: `_spool` produces. Anything else in the directory belongs to somebody else — it is
#: never posted and never deleted. See `flush_spool` for the incident that earned this.
_SPOOL_NAME = re.compile(r"^\d{20}-\d+\.json$")


#: THE FALLBACK SPOOL, NAMED ONCE. `_usable_spool()` (the writer) and `AlertClient.
#: _spool_read_dir()` (the reader) must land on the SAME directory in DIFFERENT processes —
#: a timer-run producer spools on one tick and drains on the next, with no memo surviving in
#: between. Two copies of this string agree until somebody edits one, and the failure is a
#: spool that fills and never drains, silently. Kept unexpanded: `HOME` is read at CALL time,
#: which is what lets a suite redirect it.
_SPOOL_FALLBACK = "~/.claude/logs/alert-spool"


def _usable_spool(spool_dir: str) -> str:
    """The spool a producer ASKED for, or one this host can actually WRITE.

    WHY THIS IS IN THE CLIENT AND NOT IN EACH PRODUCER. `_deliver()` tries every relay rung
    first and only spools what it could not deliver, so the spool is the thing that turns an
    unreachable relay into a DELAY instead of a LOST alert. `_spool()` catches its own
    `OSError` and reports the loss as one stderr line — `fire()` never raises — so a producer
    pointed at a directory it cannot create loses alerts SILENTLY and passes every other test.

    `/var/lib/<service>/alert-spool` is correct for a root systemd unit with a
    `StateDirectory`, and creatable there. On a workstation it is not the operator's:

        [alert-client] could not spool ([Errno 13] Permission denied:
        '/var/lib/converge-pull') — THIS ALERT IS LOST

    Measured 2026-08-19 on `cheap-lane-model-probe` and again 2026-09-18 on `converge-pull`,
    the second time by probing `_spool()` directly, which returned False. The estate's answer
    was `usable_spool()` in claude-code-policy's `_relay_fire.py`, and it worked — for the
    producers that remembered to call it. Counted 2026-09-18 in that repo: ~66 call sites pass
    `spool_dir=`, ONE used the ladder, and 13 pointed under `/var/lib`. A guard 1 in 66
    producers remembers is a preference, so it moves HERE, where every producer gets it and a
    new one cannot start broken.

    🔴 AN EXPLICIT ISOLATION OVERRIDE IS NEVER DOWNGRADED. When
    `CLAUDE_POLICY_ALERT_SPOOL_ROOT` is set, the caller has already chosen a spool and the
    answer is that spool, creatable or not. Falling back would hand a suite the SHARED spool
    while telling it it was isolated — and `flush_spool()` runs before every send, posting and
    `os.unlink`-ing whatever it finds, so that mistake once deleted eleven real pending alerts
    (claude-code-policy `_relay_fire.usable_spool`, measured 2026-08-22). A loud loss is
    correct there; a silent redirection is not.

    Nothing here changes where a ROOT service spools: `/var/lib/...` is creatable for it and
    wins on the first candidate.
    """
    if not spool_dir:
        return spool_dir
    if os.environ.get("CLAUDE_POLICY_ALERT_SPOOL_ROOT", "").strip():
        return spool_dir
    for candidate in (spool_dir, os.path.expanduser(_SPOOL_FALLBACK)):
        try:
            os.makedirs(candidate, exist_ok=True)
            return candidate
        except OSError:
            continue
    return spool_dir   # neither can be had: let `_spool()` report the loss loudly


#: Mattermost splits a message over 16383 characters into several ROOT posts. The fallback
#: webhook bypasses the relay (which clamps), so it must stay under that itself.
FALLBACK_MAX_CHARS = 14000


def _clamp_fallback(text: str, limit: int = FALLBACK_MAX_CHARS) -> str:
    if len(text) <= limit:
        return text
    notice = (f"\n\n_...TRUNCATED, {len(text) - limit} more character(s) withheld so this stays ONE "
              f"post (relay unreachable or refused it; the producer's own log has the full text)._")
    return text[:max(limit - len(notice), 0)].rstrip() + notice


class AlertClient:
    """One producer's door to the relay. Cheap to construct; hold one per process."""

    def __init__(self, *, owner_repo: str, service: str,
                 url: str = "", alt_url: str = DEFAULT_ALT_URL,
                 alert_key: str = "", spool_dir: str = "",
                 fallback_webhook: str = "", channel: str = DEFAULT_CHANNEL,
                 username: str = "", timeout: int = 10, opener=None):
        self.owner_repo = _text(owner_repo)
        self.service = _text(service)
        # AN ENVIRONMENT OVERRIDE IS A PIN, on exactly the terms an explicit `url=` is.
        # Winning rung one is only half of what the operator asked for: leave the default
        # chain appended and the very next rung is the live relay, so a sink that is merely
        # slow or briefly refuses still ends with the alert delivered to production. That is
        # the same walked-past-the-sink outcome by a longer route.
        pinned = bool(url) or bool(pinned_url())
        self.url = url or default_rung_one()
        # AND THE BUILT-IN ALT GOES TOO, for an ENVIRONMENT pin. Suppressing the default
        # chain is not enough on its own: `DEFAULT_ALT_URL` is the live relay's RFC1918
        # address, so leaving it behind an operator-named sink is the walked-past-the-sink
        # incident again with one extra hop — a sink that merely refuses once still ends
        # with the alert in production. MEASURED on CT231 against the deployed 1.2.0:
        # rung one was the sink and `rungs` still ended `192.168.103.231:8097`.
        #
        # Scoped to the environment pin ON PURPOSE. A caller passing `url=` keeps whatever
        # alt it was given; that behaviour predates this and is not this fix's to move.
        # Only the DEFAULTED alt is dropped, so a caller naming an alt explicitly still
        # gets it — an operator who says "here, and here if that fails" is obeyed too.
        if not url and pinned and alt_url == DEFAULT_ALT_URL:
            alt_url = ""
        # Skipped when it is the same place — a caller that pinned the address explicitly
        # (the scoreboard, which runs ON the relay's own CT) must not retry itself.
        self.alt_url = alt_url if alt_url and alt_url != self.url else ""
        # EVERY rung, in order, RFC1918 LAST. A caller that pinned `url` gets exactly what
        # it asked for plus its own alt; only the default chain is direction-aware. Losing
        # a rung turns a reachable relay into a spooled alert, so nothing is dropped —
        # they are merely tried in the order this direction makes cheapest.
        self.rungs = [self.url]
        if not pinned:
            for extra in (DEFAULT_HA_URL, DEFAULT_URL):
                if extra not in self.rungs:
                    self.rungs.append(extra)
        if self.alt_url and self.alt_url not in self.rungs:
            self.rungs.append(self.alt_url)
        # Rung one only. Rung two is RFC1918 and does not check it, so sending it there
        # would spread the secret across a path that gains nothing from having it.
        # Defaulted, not required. Eight vendored consumers construct this class; if each
        # had to pass the key, the ones nobody remembered to edit would sit on rung two
        # forever and silently — the exact failure this change exists to end.
        self.alert_key = _text(alert_key) or relay_key()
        self.spool_dir = spool_dir
        self._spool_resolved = None
        self.fallback_webhook = fallback_webhook
        self.channel = channel
        # THE DISPLAY NAME THE CHANNEL SHOWS. Empty means "let the relay decide", and the
        # relay resolves an absent `username` to the SERVICE name (alert_relay.py). That
        # default is right for most producers and wrong for the ones whose channel identity
        # is already established and not their service name: mm-off-bot's watchdog has
        # posted as `tagger-health` since before the relay existed, and a cutover that
        # silently renamed it would change what a human sees while claiming to be a
        # transport change. Set it and the identity survives the move.
        self.username = username
        self.timeout = timeout
        self._opener = opener
        # Which rung the LAST delivery actually left on. See `_note_rung`.
        self.last_rung = ""
        self.last_rung_class = RUNG_UNKNOWN
        # WHETHER THE RELAY ACTUALLY POSTED THE LAST ONE, or parked it on its backoff
        # ladder. See `_note_verdict` for why a producer has to be able to tell.
        self.last_held = False
        self.last_held_reason = ""
        self.last_recorded = False

    # ------------------------------------------------------------------ public
    def fire(self, **kw) -> dict:
        """Report a problem. See `send` for the fields."""
        return self.send(state=STATE_FIRE, **kw)

    def clear(self, **kw) -> dict:
        """Report a recovery for a fingerprint that previously fired.

        A clear NEVER pages — the relay enforces that centrally — so `page` is ignored
        here rather than silently honoured. Post a clear on the TRANSITION only, never
        once per healthy cycle: a per-cycle clear is the "recovered out of nowhere"
        shape, and the relay reports it on the daily scoreboard.
        """
        kw.pop("page", None)
        return self.send(state=STATE_CLEAR, **kw)

    def send(self, *, entity: str, fingerprint: str, title: str, body: str = "",
             state: str = STATE_FIRE, severity: str = "routine", page: bool = False,
             runbook: str = "", immediate_escalation: bool = False,
             channel: str = "", username: str = "", mode: str = "",
             unearned: bool = False, notice: bool = False,
             record_only: bool = False) -> dict:
        """Build, validate-and-FIX, deliver or spool. Never raises, never drops.

        `fingerprint` must be STABLE across occurrences — it is the identity every dedup,
        backoff and "how long has this been broken" answer in the estate is keyed on.
        `service:what-broke` is the shape; never interpolate a timestamp, pid or uuid.

        `notice=True` says the arrival is a ONE-TIME message rather than a claim about a
        state that is still true: it is delivered and ledgered as normal, is never a
        condition, and never reaches the backoff ladder. Use it for a momentary thing
        with nothing to clear — a one-time code, a receipt, a completion. If a human
        could ever ask "is that still happening?", it is a condition, not a notice.

        `record_only=True` asks the relay to LEDGER the arrival and skip the Mattermost
        post. The relay honours it ONLY for fingerprint `producer-heartbeat` (a liveness
        pulse is read by producer-silence, never by a human); on anything else it is
        ignored and the alert is delivered as always.

        `mode` IS IN THIS SIGNATURE BECAUSE IT WAS NOT, AND THAT DROPPED ALERTS. `_build`
        has read `kw.get("mode")` since 1.6.0, but this method — which `fire()` and
        `clear()` both funnel through — listed its arguments explicitly and omitted it,
        with no `**kw` to catch the difference. So the ONLY documented way to state a
        delivery mode raised `TypeError: send() got an unexpected keyword argument
        'mode'` before a single byte was spooled. Measured 2026-08-23 on CT199: every
        `nexus` alert, all 23 producers, gone with one warning line each. The migration
        skill's own Phase 3 example is `client.fire(..., mode="relay")`, so every repo
        told to state its mode was told to write code that cannot run.
        """
        payload = self._build(entity=entity, fingerprint=fingerprint, title=title,
                             body=body, state=state, severity=severity, page=page,
                             runbook=runbook,
                             immediate_escalation=immediate_escalation,
                             channel=channel, username=username, mode=mode,
                             unearned=unearned, notice=notice,
                             record_only=record_only)
        self.flush_spool()
        return self._deliver(payload)

    def _spool_write_dir(self) -> str:
        """Where to WRITE a spool file — may create it, and memoises the answer."""
        if self._spool_resolved is None:
            self._spool_resolved = _usable_spool(self.spool_dir)
        return self._spool_resolved

    def _spool_read_dir(self) -> str:
        """Where to READ spool files from, CREATING NOTHING.

        `flush_spool()` runs before every send, and `test_the_fallback_webhook_is_used_
        before_spooling_when_configured` pins that a client which never needed a spool
        leaves no spool directory behind. A reader that created one to look in it would
        break that, and would also leave empty `/var/lib/<svc>/alert-spool` trees on every
        host that merely LOADED a producer. So this probes with `isdir` and never mkdirs.

        It must agree with `_spool_write_dir()` ACROSS PROCESSES, not just within one: a
        timer-run producer writes on one tick and drains on the next, with no memo left.
        Hence the same order — the asked-for path first, the fallback second — decided by
        what exists rather than by what can be created.
        """
        if self._spool_resolved is not None:
            return self._spool_resolved
        if not self.spool_dir:
            return self.spool_dir
        if os.environ.get("CLAUDE_POLICY_ALERT_SPOOL_ROOT", "").strip():
            return self.spool_dir
        if os.path.isdir(self.spool_dir):
            return self.spool_dir
        fallback = os.path.expanduser(_SPOOL_FALLBACK)
        return fallback if os.path.isdir(fallback) else self.spool_dir

    def _collapse_spooled_pairs(self, spool: str, names: list) -> list:
        """Drop a spooled FIRE whose later CLEAR is ALSO in the spool; return the names left.

        WHY. A watcher cut off from the relay spools every transition it sees. On
        reconnect it replayed fire then clear for a condition that was already over, which
        pages a human (the fire) about something that has recovered. Collapsing the pair
        sends nothing for it: the condition began and ended inside the outage.

        THE PAIR GOES TOGETHER. Dropping only the fire would leave a clear for a condition
        the relay never saw, which it ledgers as an unearned clear ("recovered out of
        nowhere"). Both files are removed.

        WHAT IS NEVER DROPPED: a fire with no later clear in the spool (the condition may
        still be true), a clear with no fire in the spool (the fire was delivered earlier,
        so the relay needs the clear), and anything of a different (service, entity,
        fingerprint). Order matters: clear-then-fire keeps the fire. A file that cannot
        be read or parsed is left alone and never paired.

        NOTHING IS LOST SILENTLY. Each collapsed pair is appended, with both payloads, to
        `collapsed.jsonl` beside the spool (a name `_SPOOL_NAME` does not match, so it is
        never replayed) and logged. The transient stays on record locally.
        """
        open_fires: dict = {}                 # identity -> [(name, payload), ...]
        pairs = []
        for name in names:
            try:
                with open(os.path.join(spool, name), encoding="utf-8") as fh:
                    payload = json.load(fh)
            except (OSError, ValueError):
                continue
            if not isinstance(payload, dict):
                continue
            ident = (_text(payload.get("service")), _text(payload.get("entity")),
                     _text(payload.get("fingerprint")))
            state = _text(payload.get("state")).lower() or STATE_FIRE
            if state == STATE_FIRE:
                open_fires.setdefault(ident, []).append((name, payload))
            elif state == STATE_CLEAR and open_fires.get(ident):
                pairs.append((open_fires.pop(ident), name, payload))
        removed = set()
        for fires, cname, cpayload in pairs:
            if self._record_collapsed(spool, fires, cname, cpayload):
                for fname, _ in fires:
                    removed.update(self._unlink_spooled(spool, fname))
                removed.update(self._unlink_spooled(spool, cname))
        return [n for n in names if n not in removed] if removed else names

    @staticmethod
    def _unlink_spooled(spool: str, name: str) -> list:
        try:
            os.unlink(os.path.join(spool, name))
        except OSError:
            return []
        return [name]

    @staticmethod
    def _record_collapsed(spool: str, fires: list, cname: str, cpayload: dict) -> bool:
        """Write the local record FIRST; False means keep the files (record or nothing)."""
        entry = {"collapsed_at": time.time(), "fires": [p for _, p in fires],
                 "clear": cpayload, "files": [n for n, _ in fires] + [cname]}
        try:
            with open(os.path.join(spool, "collapsed.jsonl"), "a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry) + "\n")
                fh.flush()
                os.fsync(fh.fileno())
        except OSError as exc:
            _log(f"could not record a collapsed fire+clear ({exc}) — replaying it instead")
            return False
        _log(f"spool: fire+clear for {cpayload.get('fingerprint')!r} on "
             f"{cpayload.get('entity')!r} collapsed — the condition ended during the outage; "
             f"recorded in {spool}/collapsed.jsonl")
        return True

    def flush_spool(self) -> int:
        """Replay everything spooled by an earlier failure. Returns how many it REPLAYED.

        ⚠️ NOT how many are left — that is `spool_depth()`. This said "how many left" from
        2026-08-28 until 2026-09-04 and the two readings differ on every non-empty spool:
        the loop counts `sent` and `break`s on the first failure, so a drain that clears a
        single alert returns 1 while the spool is now EMPTY. It cost a wrong docstring and
        a wrong variable name in `fleet.notify.drain_alert_spool` on the day that function
        was written, caught only by running the real path on esc04 rather than by reading.


        Called automatically before every send, so an outage self-heals on the producer's
        own next tick with no cron and no operator. Oldest first: an alert that has been
        waiting longest is the one most worth delivering.

        ONLY FILES THIS CLIENT WROTE. It used to replay every `*.json` in the directory,
        which made the spool a trap for any producer that kept its own state beside it:
        the client POSTed a file it had never written, the relay answered 200 to anything,
        and the client then DELETED that file as delivered.

        MEASURED 2026-08-28. `grafana-etl` on CT148 writes its rule-transition state to
        `<spool_dir>/consistency_last_state.json` (`lib/consistency_alerts.py:_state_path`).
        Every `send()` flushed first, so every consistency run POSTed that state map to
        `/v1/alert` as an anonymous, channel-less payload — no service, no fingerprint, no
        title — and then deleted the file. That was the whole live half of the estate's
        `?` unaddressed-producer row: 36 of its 60 retained ledger rows, arriving <1 ms
        before each batch of real `grafana-etl` alerts, unexplained since 2026-08-11.

        The near miss is worse than the noise. The state file is deleted on the relay's
        200 and only rewritten at the END of the run, so a crash in between loses the
        transition state — and a producer with no last state re-fires every currently
        failing rule as a new transition. One 200 from the relay was standing between
        this estate and an alert storm.

        `_spool` names its files `<20-digit microseconds>-<pid>.json`; nothing else in a
        spool directory is ours to send, and nothing else is ours to delete.
        """
        spool = self._spool_read_dir()
        if not spool or not os.path.isdir(spool):
            return 0
        sent = 0
        try:
            names = sorted(n for n in os.listdir(spool) if _SPOOL_NAME.match(n))
        except OSError:
            return 0
        names = self._collapse_spooled_pairs(spool, names)
        for name in names:
            path = os.path.join(spool, name)
            try:
                with open(path, encoding="utf-8") as fh:
                    payload = json.load(fh)
            except (OSError, ValueError):
                # A truncated spool file is a degraded record of ONE alert. Leave it in
                # place rather than deleting it: an operator can still read the bytes.
                continue
            if self._post(payload):
                sent += 1
                try:
                    os.unlink(path)
                except OSError:
                    pass
            else:
                break                       # still down; stop hammering, keep the order
        return sent

    def spool_depth(self) -> int:
        """How many of OUR alerts are waiting. Counted with the same pattern `flush_spool`
        replays, or the depth would report a foreign file as a pending alert and the
        oversize-spool warning would fire on someone else's config."""
        try:
            return len([n for n in os.listdir(self._spool_read_dir())
                        if _SPOOL_NAME.match(n)])
        except OSError:
            return 0

    # ------------------------------------------------------------------ internals
    def _build(self, **kw) -> dict:
        """The contract payload, with every fixable defect fixed and NAMED on stderr.

        Warning rather than raising is the deliberate half: the producer's author is told
        exactly what is wrong at the moment they run it, and the alert still gets through
        while they fix it. The commit-time gate is what actually stops the defect
        reaching main.
        """
        state = _text(kw.get("state")).lower() or STATE_FIRE
        if state not in (STATE_FIRE, STATE_CLEAR):
            _log(f"state {state!r} is not 'fire' or 'clear' — sending as 'fire'")
            state = STATE_FIRE
        severity = _text(kw.get("severity")).lower() or "routine"
        if severity not in SEVERITIES:
            _log(f"severity {severity!r} is not major/routine — sending as 'routine'")
            severity = "routine"
        page = bool(kw.get("page")) and state == STATE_FIRE
        runbook = _text(kw.get("runbook"))
        if page and not runbook:
            # It still pages. Waking someone with no instructions is bad; not waking
            # them at all is worse.
            _log("page=True with no runbook — it will page anyway, and the condition "
                 "will be flagged runbook-less on the scoreboard")
        payload = {
            "owner_repo": self.owner_repo,
            "service": self.service,
            "entity": _cap(kw.get("entity"), FIELD_MAX_CHARS),
            "fingerprint": _text(kw.get("fingerprint")),
            "state": state,
            "severity": severity,
            "title": _cap(kw.get("title"), FIELD_MAX_CHARS),
            "body": _cap(kw.get("body"), BODY_MAX_CHARS),
            "page": page,
            "runbook": runbook,
            "channel": _text(kw.get("channel")) or self.channel,
        }
        # OMITTED WHEN UNSET, never sent as "". The relay reads `raw.get("username") or
        # service`, so an empty string would fall through to the same default — but an
        # absent key and an empty one are different claims, and every existing producer
        # must keep behaving byte-for-byte as it did before this field existed.
        username = _text(kw.get("username")) or self.username
        if username:
            payload["username"] = username
        # ------------------------------------------------- an UNEARNED clear, admitted
        # OMITTED WHEN FALSE, exactly like `username` above: an absent key and a false
        # one are different claims, and every producer that predates this field must keep
        # behaving byte-for-byte as it did.
        #
        # WHAT IT MEANS: the producer has no record of ever having opened this condition.
        # It is a CLAIM BY THE PRODUCER about its own state, not a verdict by the relay,
        # and it is never a reason to refuse the clear.
        #
        # WHY IT IS WORTH A FIELD. The ledger holds 677 clears with no matching fire, over
        # 93 distinct (service, entity, fingerprint) triples in fourteen days, and almost
        # none of them is a fault: the dominant population is producers posting a clear
        # every healthy cycle instead of on the transition, which `clear()` above already
        # forbids in prose. The cost is not the noise. A LOST FIRE AND AN UNEARNED CLEAR
        # ARE THE SAME TWO ROWS, so while a producer's fires were being dropped -- as
        # every timer-fired alert on the claude-mem store was until 2026-08-31 -- the
        # shape that should have screamed was indistinguishable from ninety-three
        # producers being merely untidy. This field is what separates them.
        if kw.get("unearned"):
            payload["unearned"] = True
        # ---------------------------------------------------------------- delivery mode
        # STATE IT. `mode="relay"` posts this alert on its own, immediately;
        # `mode="summary"` lets the relay bundle it with whatever else is due for the
        # same channel. Omitting it is legal and falls back to the CHANNEL's default
        # (relay everywhere except Server Stability and HR) — but every migration brief
        # in this org asks for it explicitly, because the default is a property of the
        # channel a producer happens to post to today, and channels get repointed.
        #
        # Sent as a payload FIELD, not a header, so it survives the spool: a producer
        # that fires while the relay is down replays the same intent later. The
        # `X-Alert-Immediate` header remains as the header spelling of `mode="relay"`.
        mode = _text(kw.get("mode")).lower()
        if mode:
            if mode not in ("relay", "summary"):
                _log(f"unknown mode {mode!r} — sending anyway; the relay will fall back "
                     f"to the channel default rather than drop the alert")
            payload["mode"] = mode
        if kw.get("record_only"):
            payload["record_only"] = True       # survives the spool, like `mode`
        if kw.get("immediate_escalation"):
            # Exempts this alert from the relay's @sysadmin page budget. A NAMED class
            # only — credential exposure, data loss, a tripped destructive-path safety
            # valve. Marking a whole module immediate opts your repo out of the cap.
            payload["immediate_escalation"] = True
        # ------------------------------------------------------------------- one-time
        # `notice=True` says THIS ARRIVAL IS NOT A CLAIM ABOUT A STATE OF THE WORLD.
        # Everything else in this contract assumes it is — that is what a fingerprint
        # MEANS — so a message that is momentary gets delivered and ledgered exactly as
        # before, is excluded from the relay's conditions view, and never reaches the
        # backoff ladder at all.
        #
        # THE SHAPE IT EXISTS FOR, measured 2026-09-08: six one-time enrolment codes,
        # one per person per machine, sat open on the board for up to 14.67 days with
        # `ever_cleared=False`, five of them flagged stale. Nobody had a fault and nobody
        # could close one, because the only way to close a condition is a `clear`, a
        # clear is never throttled and always posts, and so tidying up would have DMed
        # four people to say their enrolment code had recovered. The day before, twelve
        # of those codes were HELD on rung 2 with a 12h window — the ladder being right
        # about conditions and wrong about this, because it cannot tell a one-time code
        # from a condition re-nagging.
        #
        # IT IS NOT `immediate_escalation` UNDER ANOTHER NAME. That one exempts an alert
        # from the page budget and still banks a rung, because a rung is banked PER POST
        # — so an immediate arrival still pins its condition on the ladder. A notice
        # never enters the ladder, so there is no rung to bank and nothing to pin.
        #
        # Sent as a payload FIELD so it survives the spool: a producer that fires while
        # the relay is down replays the same intent later, rather than replaying a
        # one-time message as a condition.
        if kw.get("notice"):
            if _text(kw.get("state")) == STATE_CLEAR:
                # A CLEAR MARKED `notice` WOULD SILENTLY FAIL TO CLEAR. The relay keeps
                # notices out of its conditions view, so the row this clear names would
                # stay open while the producer's own return value said it had been
                # delivered — the worst of both, and invisible. Deliver the clear and
                # drop the flag: a clear is by definition about a condition, so the two
                # cannot both be honoured and the clear is the one that was asked for.
                _log("notice=True on a CLEAR is a contradiction — clearing anyway and "
                     "dropping the notice flag, because a notice clear would never "
                     "close the condition it names")
            else:
                payload["notice"] = True
        missing = [k for k in ("owner_repo", "service", "entity", "fingerprint",
                               "title", "body") if not payload[k]]
        if missing:
            _log(f"missing required field(s): {', '.join(missing)} — sending anyway, "
                 f"tagged non-conforming and named on the daily scoreboard")
        return payload

    def _deliver(self, payload: dict) -> dict:
        """The result NAMES THE RUNG, because "delivered" was never the whole answer.

        `rung` and `rung_class` are additive: every existing caller embeds this dict in
        a status string and none of them reads a key, so the new fields cost nothing and
        put the rung into the producer's own log line for free.

        `held` AND `held_reason` ARE ADDITIVE IN EXACTLY THE SAME WAY, and `delivered`
        deliberately does NOT change meaning. `delivered` has always answered "the relay
        took it, it is on the board, nothing is lost", which stays true of a held
        arrival; every producer that banks a cooldown on that answer is right to. What
        was missing is the SECOND question, which only a producer can answer for itself:
        did a human see it NOW. For a condition the answer does not matter — the relay is
        holding it precisely because the same condition is already posted. For a one-time
        message it is the whole of the outcome, and until this field existed there was no
        way to ask. See `_note_verdict`.
        """
        if self._post(payload):
            return {"ok": True, "delivered": True, "spooled": False,
                    "held": self.last_held, "held_reason": self.last_held_reason,
                    "recorded": self.last_recorded,
                    "rung": self.last_rung, "rung_class": self.last_rung_class}
        if self.fallback_webhook and self._post_fallback(payload):
            # Reaching the channel by the wrong path beats not reaching it. It is also
            # invisible to the scoreboard, which is why the spool is preferred.
            #
            # NEVER HELD. The fallback hook is the Mattermost webhook itself, so it has
            # no ladder to be held by: the post either landed or it did not.
            return {"ok": True, "delivered": True, "spooled": False, "fallback": True,
                    "held": False, "held_reason": "",
                    "rung": self.fallback_webhook,
                    "rung_class": rung_class(self.fallback_webhook)}
        spooled = self._spool(payload)
        # A SPOOLED PAYLOAD IS NOT HELD. It never reached a ladder; it is on this disk
        # waiting for a relay to come back. Reporting it as held would tell a caller the
        # relay made a decision about it, and no relay has seen it yet.
        return {"ok": True, "delivered": False, "spooled": spooled,
                "held": False, "held_reason": "",
                "rung": "", "rung_class": RUNG_UNKNOWN}

    def _post(self, payload: dict) -> bool:
        """Try the relay by NAME, then by ADDRESS. Both are the same daemon.

        Only after BOTH fail is the relay considered unreachable — that is what keeps a
        host with no internal resolution of `*.ha.fiszu.com` on the batched, ledgered
        path instead of quietly dropping to its fallback hook or its spool.
        """
        body = json.dumps(payload).encode()
        opener = self._opener or urllib.request.urlopen
        last = ""
        # EVERY refusal, in order, each against the rung that gave it. Reporting
        # only the most recent one attributed rung two's error to rung one — seen
        # in a live drill on 2026-08-19, where a 401 from the public rung was
        # printed as an SSL handshake failure, which is a different fault with a
        # different remedy. See `_note_rung`.
        failures = []
        self.last_rung = ""
        self.last_rung_class = RUNG_UNKNOWN
        self.last_held = False
        self.last_held_reason = ""
        self.last_recorded = False
        chain = [d for d in self.rungs if d]
        for ordinal, destination in enumerate(chain):
            headers = {"Content-Type": "application/json"}
            # ON EVERY RUNG, not just the public one. The public rung is where the edge
            # hides the producer, but a ledger field that is present on one leg and absent
            # on another cannot be queried -- "which machines posted this" would silently
            # mean "which machines posted this over the public rung".
            identity = producer_identity()
            if identity:
                headers["X-Alert-Producer"] = identity
            # So the relay's ledger can say which producers have converged on a fix.
            headers["X-Alert-Client-Version"] = CLIENT_VERSION
            # The key belongs to the PUBLIC rung and only there. `.ha` and the RFC1918
            # address do not check it, so sending it would spread the secret across paths
            # that gain nothing from holding it.
            if self.alert_key and destination == DEFAULT_URL:
                headers["X-Alert-Key"] = self.alert_key
            req = urllib.request.Request(
                destination, data=body, headers=headers, method="POST")
            try:
                with opener(req, timeout=self.timeout) as resp:
                    answer = resp.read()
                self._note_verdict(answer)
                self._note_rung(destination, ordinal, chain[0], failures)
                return True
            except Exception as exc:    # noqa: BLE001 — a dead relay is not an error here
                last = f"{destination}: {exc}"
                failures.append(last)
        # EVERY refusal, in order — not just `last`. The list above was already being
        # built and was already documented as "every refusal, in order", but it only ever
        # reached `_note_rung`, which runs on the SUCCESS path. On total failure it was
        # discarded and this line named ONE rung out of three.
        #
        # THE COST, MEASURED. On 2026-09-04 this line was raised on `wip-02-002` naming
        # only the RFC1918 rung, and was filed as a find. The reading session could not
        # tell what else had been tried, so it hand-probed the `.ha` name ON THE RFC1918
        # RUNG'S PORT — a port the client never dials on that name; it uses 443 — and the
        # find had to open by asking which addresses the client actually tries. The client
        # knew, and threw the answer away.
        #
        # THE RUNGS ARE NAMED AT RUNTIME AND NOT IN THIS COMMENT, and that is not
        # squeamishness: this file is executed on every workstation, so claude-code-policy
        # counts the internal addresses it ships and holds that total to a ceiling that may
        # only fall. Spelling the two addresses out here spent two of that budget to say
        # what `_rung_failures(failures)` now prints from `self.rungs` on the one occasion
        # anybody needs it — which was the entire point of the change. The real cause was a 16.6-minute estate-wide
        # CT231 inbound-deafness window in which the relay's own HOST could not reach it
        # either; a line naming all three rungs and all three errors says "everything,
        # everywhere at once" and points at the relay on sight.
        _log(f"relay unreachable ({_rung_failures(failures)}) — spooling")
        return False

    def _note_verdict(self, answer) -> None:
        """Read the relay's OWN answer, which this client used to throw away.

        `resp.read()` was called and discarded — the body had to be read to free the
        connection, and nothing looked at it. The relay has always said whether it
        posted an arrival or parked it: a held one answers `{"ok": true, "held": true,
        "reason": "held — 32335s of a 43200s window at rung 2"}`. Dropping that made a
        held arrival indistinguishable from a delivered one at every layer above.

        MEASURED, 2026-09-07. Twelve Claude Code enrolment codes were requested in nine
        hours and none arrived. Each was accepted, ledgered, and held by the ladder; the
        producer read HTTP 200, reported `delivered: true`, and the person was told a
        code was on its way twelve times. The ladder was right — it cannot know a
        one-time code from a condition — and every layer that could have known had been
        handed a `True` with the answer stripped out of it.

        NEVER RAISES, and a body it cannot parse leaves `held` FALSE. This runs on the
        delivery path of every alert in the estate, so the failure it must not have is
        turning a delivered alert into an exception. An unparseable answer means an
        unknown verdict, and the safe reading of unknown is the one that changes no
        existing behaviour.
        """
        try:
            verdict = json.loads(answer.decode() if isinstance(answer, bytes) else answer)
            if isinstance(verdict, dict) and verdict.get("held"):
                self.last_held = True
                self.last_held_reason = str(verdict.get("reason") or "")
            # THE RELAY SAYS ITS LEDGER HOLDS THE ROW. Only a literal True counts: a relay
            # too old to send it leaves this False and the caller reads the ledger back.
            if isinstance(verdict, dict) and verdict.get("recorded") is True:
                self.last_recorded = True
        except Exception:               # noqa: BLE001 — an unread verdict is not a failed send
            pass

    def _note_rung(self, destination: str, ordinal: int, first: str,
                   failures) -> None:
        """Record — and when it was not rung one, SAY — which rung delivered this.

        THE PROPERTY THIS ENDS. `_post` returned True on the first rung that answered
        and told nobody which one, so a producer that had silently fallen to an internal
        rung was indistinguishable from a healthy one. That is the complaint the whole
        transport rule was written against, and it survived the rule: operator decision
        2026-08-18 is that the internal rung is ALLOWED but it must REPORT ITSELF.

        Silent on rung one, deliberately. A line on every healthy send is a line nobody
        reads, and this one has to still be legible on the day it matters.

        IT NAMES EVERY REFUSAL AGAINST THE RUNG THAT GAVE IT. The first version of this
        line reported only the most recent error, under the words "rung one did not
        answer" — so a live drill on 2026-08-19 printed rung one's 401 as an SSL
        handshake failure, which is rung TWO's fault, a different condition with a
        different remedy. A report that misattributes is worse than no report: it sends
        the reader to the wrong rung.
        """
        self.last_rung = destination
        self.last_rung_class = rung_class(destination)
        if ordinal == 0:
            return
        refused = "; ".join(failures) if failures else "no error recorded"
        _log("DELIVERED ON RUNG %d (%s, %s) — rung one was %s. Refused before it: %s"
             % (ordinal + 1, destination, self.last_rung_class, first, refused))

    def _post_fallback(self, payload: dict) -> bool:
        title = payload.get("title") or payload.get("fingerprint") or "alert"
        on = f" on `{payload['entity']}`" if payload.get("entity") else ""
        text = f"#### **{title}**{on}\n\n{payload.get('body') or ''}"
        # Operator decision D1 (2026-10-12): a ROUTINE condition never pages. The relay
        # coerces page=True on a routine alert; this path bypasses the relay, so it has
        # to apply the same rule itself or the relay-down case pages what the relay won't.
        if payload.get("page") and payload.get("severity") != "routine":
            text = "@sysadmin\n" + text
        text = _clamp_fallback(text)
        body = json.dumps({"text": text, "channel": payload.get("channel"),
                           "username": payload.get("service")}).encode()
        req = urllib.request.Request(
            self.fallback_webhook, data=body,
            headers={"Content-Type": "application/json"}, method="POST")
        opener = self._opener or urllib.request.urlopen
        try:
            with opener(req, timeout=self.timeout) as resp:
                resp.read()
            return True
        except Exception as exc:        # noqa: BLE001
            _log(f"fallback webhook also failed ({exc})")
            return False

    def _spool(self, payload: dict) -> bool:
        """tmp + fsync + os.replace, same durability the relay itself promises."""
        if not self.spool_dir:
            _log("NO SPOOL CONFIGURED and the relay is unreachable — THIS ALERT IS "
                 "LOST. Pass spool_dir= to AlertClient.")
            return False
        try:
            spool = self._spool_write_dir()
            os.makedirs(spool, exist_ok=True)
            # Monotonic-ish, collision-free, and sorts oldest-first as a plain string.
            #: MUST stay in step with `_SPOOL_NAME`. The writer and the reader of a spool
            #: name are the same contract; if this format changes, that pattern changes in
            #: the same commit or the spool silently stops draining.
            name = f"{int(time.time() * 1e6):020d}-{os.getpid()}.json"
            path = os.path.join(spool, name)
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                fh.write(json.dumps(payload))
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, path)
        except OSError as exc:
            _log(f"could not spool ({exc}) — THIS ALERT IS LOST")
            return False
        depth = self.spool_depth()
        if depth >= SPOOL_WARN_DEPTH:
            _log(f"spool depth is {depth} — the relay has been unreachable for a long "
                 f"time. Nothing has been discarded; this is a fault to investigate.")
        return True


# ── the door for producers that are not Python ────────────────────────────────────────
#
# WHY THIS IS IN THE CLIENT AND NOT IN EACH REPO. The estate has shell watchdogs — timers
# running a `.sh`, curling a Mattermost webhook — and until this existed there was no
# compliant way for one to reach the relay: the client is a Python library, so every shell
# repo migrating had to invent its own launcher. That is exactly the per-repo divergence
# `tests/test_vendored_alert_client_copies.py` exists to prevent, arriving through the
# front door instead. The relay serves this file at `/v1/client`, so a shell producer
# vendors ONE file and calls it, and every fix to pooling, rungs or spooling reaches it on
# the next refresh like every Python consumer.
#
# It is deliberately thin: argument parsing and one call. No cooldown, no state, no
# scheduling. A producer's cadence is the producer's — usually an operator decision
# encoded in a file this must not read, let alone change.
def _cli(argv=None) -> int:
    """`python3 alert_client.py --entity ct228 --fingerprint svc:what-broke ...`

    Exit 0 when the alert was delivered OR spooled — both mean "not lost", which is the
    only thing a caller can act on. Exit 2 is a usage error. It never raises: a watchdog
    that crashes in its own notify path reports nothing at all, which is worse than the
    badly-shaped alert this is replacing.
    """
    import argparse

    argv = list(sys.argv[1:] if argv is None else argv)
    # ANSWERED BEFORE THE PARSER, and it has to be. Every other flag here is
    # `required=True`, and a shell producer asking only "what is this machine called"
    # has no `--owner-repo`, `--service` or `--title` to hand over to get an answer.
    #
    # THE SHELL HALF OF THE CHOKEPOINT. Three of the six producers still stamping the
    # live hostname are shell — `hostname -s` piped through `tr` — and no Python helper
    # reaches them. This is what they call instead:
    #
    #     ENTITY="$(python3 alert_client.py --print-pinned-host)"
    #
    # It prints the pin and exits 0 even when there is no pin, because the fallback IS
    # the live name and a producer whose entity came back empty would stamp "" and lose
    # its rows far more thoroughly than a rename ever did.
    if "--print-pinned-host" in argv:
        sys.stdout.write(pinned_host() + "\n")
        return 0

    p = argparse.ArgumentParser(
        prog="alert_client.py",
        description="Fire or clear one fleet alert through the relay.")
    p.add_argument("--owner-repo", required=True)
    p.add_argument("--service", required=True)
    p.add_argument("--entity", required=True)
    p.add_argument("--fingerprint", required=True,
                   help="STABLE dedup key, `service:what-broke`. Never a time, pid or uuid.")
    p.add_argument("--title", required=True)
    p.add_argument("--body", default="")
    p.add_argument("--state", choices=[STATE_FIRE, STATE_CLEAR], default=STATE_FIRE)
    p.add_argument("--severity", choices=["major", "routine"], default="routine")
    p.add_argument("--page", action="store_true")
    p.add_argument("--runbook", default="")
    p.add_argument("--spool-dir", default="",
                   help="Where to hold an alert the relay could not take. A producer "
                        "without one DROPS alerts during an outage.")
    p.add_argument("--channel", default="")
    p.add_argument("--username", default="",
                   help="Display name in the channel. Omit and the relay uses the "
                        "service name. Set it when the producer already has a channel "
                        "identity that is not its service name, so moving it onto the "
                        "client does not silently rename it in front of readers.")
    p.add_argument("--url", default="", help="Pin rung one. Normally omitted.")
    args = p.parse_args(argv)

    client = AlertClient(owner_repo=args.owner_repo, service=args.service,
                         url=args.url, spool_dir=args.spool_dir)
    call = client.clear if args.state == STATE_CLEAR else client.fire
    kw = dict(entity=args.entity, fingerprint=args.fingerprint, title=args.title,
              body=args.body, severity=args.severity, runbook=args.runbook,
              channel=args.channel, username=args.username)
    if args.state != STATE_CLEAR:
        kw["page"] = args.page
    result = call(**kw)
    # The rung is printed because a producer that has silently fallen to rung two looks
    # identical to a healthy one otherwise — the complaint `last_rung` exists to answer.
    sys.stderr.write("alert_client: {} rung={} result={}\n".format(
        args.state, client.last_rung or "none", json.dumps(result, sort_keys=True)))
    return 0 if (result.get("delivered") or result.get("spooled")) else 1


if __name__ == "__main__":       # pragma: no cover — exercised by tests/test_alert_client_cli.py
    sys.exit(_cli())
