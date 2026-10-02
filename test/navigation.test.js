import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessOwnerBackup, currentNavigationSection } from '../client/src/utils/navigation.js';

test('navigation identifies the active section across buyer routes', () => {
  assert.equal(currentNavigationSection('/'), 'directory');
  assert.equal(currentNavigationSection('/buyers/new'), 'directory');
  assert.equal(currentNavigationSection('/buyers/123'), 'directory');
  assert.equal(currentNavigationSection('/buyers/123/edit'), 'directory');
  assert.equal(currentNavigationSection('/owner/backup'), 'backup');
  assert.equal(currentNavigationSection('/missing'), null);
});

test('Owner Backup is available only to a non-demo owner', () => {
  assert.equal(canAccessOwnerBackup({ role: 'owner', is_demo: false }), true);
  assert.equal(canAccessOwnerBackup({ role: 'owner', is_demo: true }), false);
  assert.equal(canAccessOwnerBackup({ role: 'user', is_demo: false }), false);
  assert.equal(canAccessOwnerBackup(null), false);
});
