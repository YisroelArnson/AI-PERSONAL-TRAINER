# Tool-Only Agent Loop

This spec defines the runtime contract for the coach agent loop and the stream contract that clients consume.

## Runtime contract

Every successful model turn must contain at least one native tool call.

Plain-text assistant output outside native tool calls is invalid. The runtime treats that as a contract violation, injects a corrective retry message, and does not expose the plain text to the user.

User-visible assistant communication happens only through these terminal tools:

- `message_notify_user`
- `message_ask_user`
- `idle`

`message_notify_user` supports two delivery modes:

- `delivery="transient"` is stream-only and non-terminal.
- `delivery="feed"` writes a durable assistant feed item and ends the run.

`message_ask_user` writes a durable assistant question and ends the run. In v1 it does not suspend and resume the same run; the next user reply starts a new run.

`idle` ends the run without writing a user-visible feed item.

The runtime rejects any model response that mixes terminal and non-terminal tools in the same batch. A valid terminal response contains exactly one terminal tool call and no other tool calls.

If the run reaches the iteration cap without a terminal tool, the runtime marks the run as failed instead of manufacturing a plain-text fallback reply.

## Transcript contract

Durable assistant feed messages are written by tool handlers, not by the loop runner.

The transcript event types used for user-visible assistant output are:

- `assistant.notify`
- `assistant.ask`

Legacy direct assistant transcript writes such as `assistant.message` are not part of the active contract for this runtime.

## Stream contract

`/v1/runs/:runId/stream` exposes tool-native events as the primary public contract:

- `tool.call.requested`
- `tool.call.completed`
- `workout.state.updated`
- `run.completed`
- `run.failed`

For `message_notify_user` and `message_ask_user`, safe message text is included in the tool call events so clients can render progress or provisional assistant output immediately.

Clients should not depend on `assistant.commentary.*` or `assistant.final.*`. Those events are outside the shipped milestone contract.
