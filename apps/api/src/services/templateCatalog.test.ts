import test from 'node:test';
import assert from 'node:assert/strict';
import { findTemplate, getAllTemplates } from '../templates/systemTemplates.ts';

test('system templates keep custom entries and override by id', () => {
  const customTemplates = [
    {
      id: 'meeting-minutes',
      name: '회의록(커스텀)',
      description: '업데이트된 템플릿',
      persona: '관리자',
      fields: [],
    },
    {
      id: 'team-brief',
      name: '팀 브리프',
      description: '새 템플릿',
      persona: '리더',
      fields: [],
    },
  ];

  const all = getAllTemplates(customTemplates);
  assert.equal(all.find((template) => template.id === 'meeting-minutes')?.name, '회의록(커스텀)');
  assert.equal(findTemplate('team-brief', customTemplates)?.name, '팀 브리프');
});
