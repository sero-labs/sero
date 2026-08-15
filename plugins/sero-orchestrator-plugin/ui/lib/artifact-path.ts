import type { RoomMember } from '../../shared/room-types';

export function resolveArtifactPath(ref: string, member: Pick<RoomMember, 'worktreePath'> | undefined): string {
  if (ref.startsWith('/') || !member?.worktreePath) return ref;
  return `${member.worktreePath}/${ref.replace(/^\.\//, '')}`;
}

export function artifactFileName(path: string): string {
  return path.replace(/\/+$/, '').split('/').at(-1) || path;
}
