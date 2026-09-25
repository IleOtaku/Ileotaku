/** Shared by the server (token/room routes) and the client (lib/livekitGroupCall.ts) so a group
 * call's LiveKit room name is computed identically everywhere from nothing but its callId —
 * never stored or passed around as its own field. */
export function groupCallRoomName(callId: string): string {
  return `group-${callId}`;
}
