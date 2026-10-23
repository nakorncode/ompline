/** Builders for the commands the session page sends. Each one serializes to a single stdin line. */

export type Command = Record<string, unknown>;

export function prompt(id: string, message: string): Command {
  return { id, type: "prompt", message };
}

export function followUp(id: string, message: string): Command {
  return { id, type: "follow_up", message };
}

export function steer(id: string, message: string): Command {
  return { id, type: "steer", message };
}

export function abort(id: string): Command {
  return { id, type: "abort" };
}

export function newSession(id: string): Command {
  return { id, type: "new_session" };
}

export function getState(id: string): Command {
  return { id, type: "get_state" };
}

/** Answers an `extension_ui_request` with `select`. `value` must be one of the request's exact option labels. */
export function approvalResponse(requestId: string, value: string): Command {
  return { type: "extension_ui_response", id: requestId, value };
}
