const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLES, STATUS, VISIBILITY, isAdminRole, normalizeVisibility, assignableRoles, isSuperAdmin } = require('../shared/access.mjs');
const constants = require('../lib/constants');

test('the server constants are the shared ones', () => {
  assert.equal(constants.ROLES, ROLES);
  assert.equal(constants.STATUS, STATUS);
  assert.equal(constants.VISIBILITY, VISIBILITY);
  assert.deepEqual({ ...ROLES, ...STATUS, ...VISIBILITY }, { OWNER: 'owner', CHURCH_OWNER: 'church_owner', ADMIN: 'admin', USER: 'user', ACTIVE: 'active', PENDING: 'pending', INACTIVE: 'inactive', PUBLIC: 'public', PRIVATE: 'private' });
});

test('isAdminRole accepts the owner, church super admins and admins only', () => {
  assert.deepEqual(['owner', 'church_owner', 'admin', 'user', '', undefined].map(isAdminRole), [true, true, true, false, false, false]);
  assert.deepEqual(['owner', 'church_owner', 'admin', 'user'].map(isSuperAdmin), [true, true, false, false]);
});

test('normalizeVisibility keeps private and makes anything else public', () => {
  assert.deepEqual(['private', 'public', undefined, null, 'PRIVATE', 'secret'].map(normalizeVisibility), ['private', 'public', 'public', 'public', 'public', 'public']);
});

test('the password minimum is a shared limit', () => {
  assert.equal(require('../shared/public-constants.json').limits.PASSWORD_MIN, 6);
  assert.equal(constants.LIMITS.PASSWORD_MIN, 6);
});

test('scripts sign in with the shared demo account', () => {
  assert.deepEqual(require('../scripts/lib/session.mjs').DEMO_ACCOUNT, require('../shared/public-constants.json').DEMO_ACCOUNT);
  assert.deepEqual(require('../shared/public-constants.json').DEMO_ACCOUNT, { username: 'demo', password: 'demopass123' });
});

const { manageUserError } = require('../shared/access.mjs');

const owner = { id: 1, role: 'owner', church_id: 1 };
const admin = { id: 2, role: 'admin', church_id: 1 };
const otherAdmin = { id: 3, role: 'admin', church_id: 1 };
const member = { id: 4, role: 'user', church_id: 1 };
const superAdmin = { id: 5, role: 'church_owner', church_id: 1 };
const otherChurchMember = { id: 6, role: 'user', church_id: 2 };
const otherChurchSuper = { id: 7, role: 'church_owner', church_id: 2 };

test('the owner manages admins and users but not themself', () => {
  assert.equal(manageUserError(owner, admin), null);
  assert.equal(manageUserError(owner, member), null);
  assert.equal(manageUserError(owner, owner), 'Cannot modify the owner');
});

test('admins manage users only', () => {
  assert.equal(manageUserError(admin, member), null);
  assert.equal(manageUserError(admin, otherAdmin), 'Only a super admin can manage admins');
  assert.equal(manageUserError(admin, admin), 'Only a super admin can manage admins');
  assert.equal(manageUserError(admin, owner), 'Cannot modify the owner');
  assert.equal(manageUserError(member, member), 'Cannot modify yourself');
});

test('church super admins manage admins and members of their own church only', () => {
  assert.equal(manageUserError(superAdmin, admin), null);
  assert.equal(manageUserError(superAdmin, member), null);
  assert.equal(manageUserError(superAdmin, otherChurchMember), 'Not in your church');
  assert.equal(manageUserError(superAdmin, otherChurchSuper), 'Not in your church');
  assert.equal(manageUserError(admin, otherChurchMember), 'Not in your church');
  assert.equal(manageUserError(otherChurchSuper, superAdmin), 'Not in your church');
});

test('only the owner manages church super admins, in any church', () => {
  assert.equal(manageUserError(owner, otherChurchSuper), null);
  assert.equal(manageUserError(owner, otherChurchMember), null);
  assert.equal(manageUserError({ id: 9, role: 'church_owner', church_id: 1 }, superAdmin), 'Only the owner can manage church super admins');
});

test('who can give which role', () => {
  assert.deepEqual(assignableRoles(owner), ['user', 'admin', 'church_owner']);
  assert.deepEqual(assignableRoles(superAdmin), ['user', 'admin']);
  assert.deepEqual(assignableRoles(admin), ['user']);
});
