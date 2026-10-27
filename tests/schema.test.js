(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const E = LP.events;
  const S = E.schema;

  /** Every step in every base event, nested ones included. */
  function allSteps() {
    const out = [];
    const walk = (value) => {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (!value || typeof value !== 'object') return;
      if (S.kindOf(value) && !('from' in value && !('as' in value))) out.push(value);
      for (const v of Object.values(value)) walk(v);
    };
    for (const e of LP.data.basePack.events) walk(e.steps.concat(e.fallback || []));
    for (const f of LP.data.basePack.fragments) walk(f.steps);
    return out;
  }

  group('Event schema');

  test('every step kind has a unique id, and every kind of base step is recognised', (assert) => {
    const ids = S.STEP_KINDS.map((k) => k.id);
    assert.equal(new Set(ids).size, ids.length);
    const steps = allSteps();
    assert.ok(steps.length > 300);
    const seen = new Set();
    for (const step of steps) {
      const kind = S.kindOf(step);
      if (kind) seen.add(kind.id);
    }
    for (const id of ['roll', 'ask', 'effect', 'select', 'if', 'table', 'again', 'rollGroup', 'call', 'alternatives', 'forEach', 'repeat', 'say']) {
      assert.ok(seen.has(id), id + ' is used by the base pack');
    }
  });

  test('a new step of each kind is what the runner understands', (assert) => {
    for (const kind of S.STEP_KINDS) {
      const step = S.blank(kind.id);
      assert.equal(S.kindOf(step).id, kind.id, kind.id);
    }
    assert.equal(S.blank('nope'), null);
    const problems = E.run.validateSteps([S.blank('roll'), S.blank('effect'), S.blank('select'), S.blank('if'), S.blank('ask'), S.blank('table'), S.blank('again'), S.blank('say'), S.blank('forEach'), S.blank('repeat'), S.blank('group'), S.blank('alternatives'), S.blank('manual')], 'steps', {});
    assert.deepEqual(problems, []);
  });

  test('every base step can be described in a line', (assert) => {
    for (const step of allSteps()) {
      const line = S.describeStep(step);
      assert.ok(typeof line === 'string' && line.length > 0 && line !== 'Unknown step', JSON.stringify(step).slice(0, 60));
    }
  });

  test('descriptions read as plain English', (assert) => {
    assert.equal(S.describeStep({ effect: 'xp', target: '$actor', amount: 1 }), 'actor +1 XP');
    assert.equal(S.describeStep({ effect: 'resource', key: 'credits', amount: -3 }), '-3 credits');
    assert.equal(S.describeStep({ effect: 'resource', key: 'storyPoints', amount: 1 }), '+1 story points');
    assert.equal(S.describeStep({ roll: '1D6', target: 4, label: 'Piloting', as: 'r' }), 'Roll 1D6, needs 4+ (Piloting) → r');
    assert.equal(S.describeStep({ say: 'Hello' }), 'Say: Hello');
    assert.equal(S.describePredicate({ fact: 'crew.count', gte: 2 }), 'crew.count is at least 2');
    assert.equal(S.describePredicate({ all: [{ fact: 'member.species', of: '$actor', eq: 'kerin' }, { not: { fact: 'ship.hullDamaged' } }] }), 'member.species of actor is kerin and not (ship.hullDamaged is true)');
    assert.equal(S.describePredicate({ ask: 'Ready?' }), 'the player says yes to “Ready?”');
  });

  test('the fields for an effect or a prompt come from the registry or the prompt list', (assert) => {
    const xp = S.fieldsFor({ effect: 'xp' }).map((f) => f.key);
    assert.deepEqual(xp, ['target', 'amount', 'say']);
    assert.equal(S.fieldsFor({ effect: 'xp' })[0].type, 'var');
    assert.equal(S.fieldsFor({ effect: 'resource' }).find((f) => f.key === 'key').type, 'enum');
    assert.equal(S.fieldsFor({ effect: 'rival.add' }).find((f) => f.key === 'as').type, 'name');
    assert.ok(S.fieldsFor({ ask: 'number' }).some((f) => f.key === 'max'));
    assert.ok(S.fieldsFor({ ask: 'recruit' }).some((f) => f.key === 'variant.baseProfileOnly'));
    assert.deepEqual(S.fieldsFor({ wobble: 1 }), []);
  });

  test('every effect the editor offers exists, and hidden ones are the planned-by-the-app kind', (assert) => {
    for (const id of S.HIDDEN_EFFECTS) assert.ok(E.effects.get(id), id);
    const offered = E.effects.list().filter((d) => !S.HIDDEN_EFFECTS.includes(d.id));
    assert.ok(offered.length >= 20);
  });

  test('the variables an event binds are offered to later steps, with the ones a run always has', (assert) => {
    const names = S.variablesIn([
      { select: { from: 'crew' }, as: 'who' },
      { if: { var: '$x' }, then: [{ roll: '1D6', as: 'r' }] },
      { ask: 'offer', select: { from: 'items', offer: 2 }, as: 'gift', chosen: [], declined: [] }
    ]);
    for (const n of ['$who', '$r', '$gift', '$actor', '$each', '$i']) assert.ok(names.includes(n), n);
  });
})(window.LP);
