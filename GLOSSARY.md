# ompline

A desktop application that gives oh-my-pi (omp), a terminal coding agent, a graphical interface. It runs omp sessions and shows their conversation, approvals and tool activity.

## Language

**Session**:
A conversation between the user and omp, saved and tied to one workspace. A session can be resumed, branched or forked.
_Avoid_: Chat, thread, conversation

**Turn**:
One user prompt together with omp's full response to it, including the tool calls it makes.
_Avoid_: Message, request, round

**Approval**:
The user's permission for omp to run a tool call. omp asks only when the active approval mode requires it.
_Avoid_: Permission, confirmation

**Approval mode**:
The omp setting that decides which tool calls ask the user for approval. omp owns this setting; the app shows it and uses it without defining its own.
_Avoid_: Permission preset, safety level

**Queue**:
Messages the user entered while omp was busy, held until they can be delivered.
_Avoid_: Backlog, buffer

**Subagent**:
A separate agent that omp starts inside a session to handle part of a task.
_Avoid_: Worker, child agent

**Workspace**:
The working directory a session operates in.
_Avoid_: Project, folder, repo
