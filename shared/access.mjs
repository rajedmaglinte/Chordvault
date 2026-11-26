/**
 * owner: runs the whole site (every church). church_owner: super admin of one church.
 * admin: manages members of their church. user: a member.
 */
export const ROLES = { OWNER: 'owner', CHURCH_OWNER: 'church_owner', ADMIN: 'admin', USER: 'user' };

/** inactive: deactivated song, hidden everywhere until an admin reactivates it. */
export const STATUS = { ACTIVE: 'active', PENDING: 'pending', INACTIVE: 'inactive' };

export const VISIBILITY = { PUBLIC: 'public', PRIVATE: 'private' };

export const isAdminRole = role => role === ROLES.ADMIN || role === ROLES.CHURCH_OWNER || role === ROLES.OWNER;

/** Super admins delete songs and users for good: the site owner anywhere, a church super admin in their church. */
export const isSuperAdmin = role => role === ROLES.OWNER || role === ROLES.CHURCH_OWNER;

export const isSiteOwner = role => role === ROLES.OWNER;

/** Both accounts belong to the same church. */
export const sameChurch = (a, b) => a?.church_id != null && a.church_id === b?.church_id;

/** What the UI calls each role. */
export const ROLE_LABELS = { [ROLES.OWNER]: 'Owner', [ROLES.CHURCH_OWNER]: 'Church super admin', [ROLES.ADMIN]: 'Admin', [ROLES.USER]: 'Member' };

/** Anything other than "private" is stored as public. */
export const normalizeVisibility = visibility => (visibility === VISIBILITY.PRIVATE ? VISIBILITY.PRIVATE : VISIBILITY.PUBLIC);

/** Why `actor` may not manage `target`'s account, or null when they may. */
export function manageUserError(actor, target) {
  if (target.role === ROLES.OWNER) return 'Cannot modify the owner';
  if (actor.role !== ROLES.OWNER) {
    if (!sameChurch(actor, target)) return 'Not in your church';
    if (target.role === ROLES.CHURCH_OWNER) return 'Only the owner can manage church super admins';
    if (target.role === ROLES.ADMIN && actor.role !== ROLES.CHURCH_OWNER) return 'Only a super admin can manage admins';
  }
  if (target.id === actor.id) return 'Cannot modify yourself';
  return null;
}

/** Roles `actor` may give someone: the owner any church role, a church super admin member/admin. */
export function assignableRoles(actor) {
  if (actor?.role === ROLES.OWNER) return [ROLES.USER, ROLES.ADMIN, ROLES.CHURCH_OWNER];
  if (actor?.role === ROLES.CHURCH_OWNER) return [ROLES.USER, ROLES.ADMIN];
  return [ROLES.USER];
}
