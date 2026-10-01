import assert from 'node:assert/strict';
import test from 'node:test';
import { insertPromptTemplate, resizeComposer, shouldSendOnEnter, suggestedPrompts } from '../client/src/utils/assistantComposer.js';

test('all suggested actions provide editable templates without sending', () => {
  assert.deepEqual(suggestedPrompts.map(({ label }) => label), [
    'Add a buyer', 'Edit a buyer', 'Remove a buyer', 'Find a buyer', 'Find an LBC branch',
  ]);
  for (const { label, template } of suggestedPrompts) {
    assert.match(template, new RegExp(`^${label}`));
    assert.ok(template.includes(': '));
  }
});

test('selecting a prompt fills an empty input and preserves an unfinished message', () => {
  const template = suggestedPrompts[0].template;
  assert.equal(insertPromptTemplate('', template), template);
  assert.equal(insertPromptTemplate('   ', template), template);
  assert.equal(insertPromptTemplate('Name: Existing Buyer', template), `Name: Existing Buyer\n\n${template}`);
  assert.equal(insertPromptTemplate('First line\n', template), `First line\n\n${template}`);
});

test('desktop Enter sends while Shift+Enter, composition, and touch Enter insert a new line', () => {
  assert.equal(shouldSendOnEnter({ key: 'Enter', shiftKey: false, isComposing: false }, false), true);
  assert.equal(shouldSendOnEnter({ key: 'Enter', shiftKey: true, isComposing: false }, false), false);
  assert.equal(shouldSendOnEnter({ key: 'Enter', shiftKey: false, isComposing: true }, false), false);
  assert.equal(shouldSendOnEnter({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229 }, false), false);
  assert.equal(shouldSendOnEnter({ key: 'Enter', shiftKey: false, isComposing: false }, true), false);
});

test('textarea height follows pasted content and shrinks after clearing', () => {
  const textarea = { scrollHeight: 212, style: { height: '' } };
  resizeComposer(textarea);
  assert.equal(textarea.style.height, '212px');
  textarea.scrollHeight = 52;
  resizeComposer(textarea);
  assert.equal(textarea.style.height, '52px');
});
