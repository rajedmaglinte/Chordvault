export const ROLES = { OWNER: 'owner', ADMIN: 'admin', USER: 'user' };

/** inactive: deactivated song, hidden everywhere until an admin reactivates it. */
export const STATUS = { ACTIVE: 'active', PENDING: 'pending', INACTIVE: 'inactive' };

export const VISIBILITY = { PUBLIC: 'public', PRIVATE: 'private' };

export const isAdminRole = role => role === ROLES.ADMIN || role === ROLES.OWNER;

/** The owner is the super admin: the only one who can delete songs or users for good. */
export const isSuperAdmin = role => role === ROLES.OWNER;

/** What the UI calls each role. */
export const ROLE_LABELS = { [ROLES.OWNER]: 'Super admin', [ROLES.ADMIN]: 'Admin', [ROLES.USER]: 'Member' };

/** Anything other than "private" is stored as public. */
export const normalizeVisibility = visibility => (visibility === VISIBILITY.PRIVATE ? VISIBILITY.PRIVATE : VISIBILITY.PUBLIC);

/** Why `actor` may not manage `target`'s account, or null when they may. */
export function manageUserError(actor, target) {
  if (target.role === ROLES.OWNER) return 'Cannot modify the owner';
  if (target.role === ROLES.ADMIN && actor.role !== ROLES.OWNER) return 'Only the owner can manage admins';
  if (target.id === actor.id) return 'Cannot modify yourself';
  return null;
}
