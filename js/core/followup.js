(function (LP) {
  'use strict';

  /*
   * Runs follow-up scripts: the extra dice a table result calls for.
   *
   * Scripts are plain data (js/data/followups.js), keyed by table name and
   * row id. Running produces output lines (the same shapes as LP.turn.line)
   * and can pause on a player choice. The whole run state is plain JSON, so a
   * paused run can be saved and resumed after a reload:
   *
   *   state = {
   *     lines: [],                   output lines (nested via line.children)
   *     stack: [{ steps, target, env }],
   *     pending: null | { prompt, options, step, target, env },
   *     gains: { storyPoints, rumors, rivals, patronOffers }   counts later stages can use
   *   }
   *
   * Steps:
   *   { table, label?, times?, modifier?, note?, then? }
   *       Roll on a table, then run that row's own script and `then`.
   *       note: shown under the result (e.g. "Damaged: needs Repair.").
   *   { rollAgain: true, label? }       roll again on the table being resolved
   *   { roll: '1D6', label?, times?, keep?: 'highest', add?: [{ label, value }], target?, invert?,
   *     savvy?: true, engineer?: true, text?,
   *     outcomes?: [{ natural? | range | min/max, text, tone?, gain?, then? }],
   *     ifFail?: [steps] }
   *       add: modifiers added to the total (zero values are dropped).
   *       savvy: a "1D6 + Savvy" check. The verdict is left open and a note
   *       says what Savvy is needed; ifFail steps are shown as "If it fails".
   *       outcomes are checked in order; `natural` matches the first die alone;
   *       `final: true` on an outcome replaces the Savvy note (e.g. natural 1 always fails);
   *       `fail: true` marks the roll failed whatever the total.
   *   { text, tone? }
   *   { gain: { storyPoints: 1, ... }, text? }
   *   { when: 'If your ship has Hull damage', steps: [...] }
   *       Something the app can't know: rolled anyway and shown under the condition.
   *   { group: 'World 1', source?, who?, steps: [...] }
   *       source: what gained items are credited to ("a trade roll by Ava")
   *       who: Savvy rolls inside are for this crew member (see below)
   *   { choice: { prompt, options: [{ value, label, then? }] } }   pauses the run
   *   { randomCrew: true, label?, count? }       a name from env.crewNames, or "Crew member 3 of 6" from env.crewCount
   *   { randomRival: true }                      a name from env.rivalNames, or "n of N" from env.rivals
   *   { enemyNumbers: true, plus? }              highest of (crew size - 3) D6
   *   { species: true, label? }                  a species from the combined table, using
   *                                              env.speciesWeights (or the book defaults)
   *
   * Table steps may also carry damaged: true (or a note starting "Damaged") and
   * conditional: true (only gained if something else happens); both mark the
   * items rolled under them for the Stash (LP.items.linesIn).
   * Savvy rolls may carry who: { name, savvy, engineer } to roll for a known
   * crew member: their Savvy (and Engineer +1) is added and the roll passes or fails.
   *
   * env: { crewCount, crewNames, rivals, crewSize, disabled (campaign.models.disabled), table, depth }
   */

  const MAX_DEPTH = 6;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function scriptFor(tableName, rowId) {
    const scripts = (LP.data && LP.data.followups) || {};
    return (scripts[tableName] && scripts[tableName][rowId]) || [];
  }

  /** The column with a row's rule text (the first non-weight column after the label). */
  function textColumn(table) {
    return table.columns.find((c) => !c.startsWith('weight') && c !== table.labelColumn) || null;
  }

  function container(state, path) {
    let list = state.lines;
    for (const index of path) {
      const line = list[index];
      if (!line.children) line.children = [];
      list = line.children;
    }
    return list;
  }

  function append(state, path, line) {
    const list = container(state, path);
    list.push(line);
    return path.concat(list.length - 1);
  }

  function addGains(state, gains) {
    for (const [key, value] of Object.entries(gains || {})) {
      state.gains[key] = (state.gains[key] || 0) + value;
    }
  }

  function inRange(total, outcome, natural) {
    if (outcome.natural !== undefined) return natural === outcome.natural;
    if (outcome.range !== undefined) {
      const r = LP.rng.parseRange(outcome.range);
      return r && total >= r.min && total <= r.max;
    }
    const min = outcome.min !== undefined ? outcome.min : -Infinity;
    const max = outcome.max !== undefined ? outcome.max : Infinity;
    return total >= min && total <= max;
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  /** Distinct random picks from 1..n. */
  function pickDistinct(n, count) {
    const pool = [];
    for (let i = 1; i <= n; i++) pool.push(i);
    const out = [];
    while (out.length < count && pool.length) out.push(pool.splice(LP.rng.int(pool.length), 1)[0]);
    return out.sort((a, b) => a - b);
  }

  /* ---------------------------------------------------------------------- */
  /* Step handlers                                                          */
  /* ---------------------------------------------------------------------- */

  function push(state, steps, target, env) {
    if (steps && steps.length) state.stack.push({ steps: clone(steps), target: target, env: env });
  }

  /** Expand `times` into repeated copies with numbered labels. */
  function expandTimes(step, frame) {
    const copies = [];
    for (let i = 1; i <= step.times; i++) {
      const copy = clone(step);
      delete copy.times;
      copy.label = (step.label || '') + (step.label ? ' ' : '') + '(' + i + ' of ' + step.times + ')';
      copies.push(copy);
    }
    frame.steps.unshift(...copies);
  }

  function runTable(state, step, frame, tableName) {
    const env = frame.env;
    if ((env.depth || 0) >= MAX_DEPTH) {
      append(state, frame.target, { type: 'text', text: 'Stopped: too many rolls in a row.', tone: 'note' });
      return;
    }
    const disabled = (env.disabled && env.disabled[tableName]) || [];
    const line = LP.turn.line.table(tableName, { modifier: step.modifier, exclude: disabled, label: step.label });
    const table = LP.rng.getTable(tableName);
    const column = textColumn(table);
    const row = line.rowId ? table.rows.find((r) => r.id === line.rowId) : null;
    // Only show rule text for "event" style tables; item tables have none.
    if (row && column && step.showText !== false) line.text = row[column];
    // Item flags for the Crew tab's Stash (see LP.items.linesIn).
    if (step.damaged || (step.note && /^Damaged/.test(step.note))) line.damaged = true;
    if (step.conditional) line.conditional = true;
    const path = append(state, frame.target, line);

    // The row's own follow-ups first, so a note ("Damaged…") ends up after the final item.
    const next = [];
    if (row) next.push(...scriptFor(tableName, row.id));
    if (step.note) next.push({ text: step.note, tone: 'note' });
    if (step.then) next.push(...step.then);
    push(state, next, path, Object.assign({}, env, { table: tableName, depth: (env.depth || 0) + 1 }));
  }

  function runRoll(state, step, frame) {
    const r = LP.rng.roll(step.roll);
    const who = step.savvy ? step.who || frame.env.who || null : null;
    const own = who ? [{ label: who.name + '’s Savvy', value: who.savvy || 0 }, { label: 'Engineer', value: step.engineer && who.engineer ? 1 : 0 }] : [];
    const modifiers = (step.add || []).concat(own).filter((m) => m.value);
    const added = modifiers.reduce((sum, m) => sum + m.value, 0);
    const line = { type: 'roll', label: step.label || '', notation: r.notation, dice: r.dice, base: r.total, modifiers: modifiers, total: r.total + added };
    if (step.keep === 'highest') {
      line.keep = 'highest';
      line.total = Math.max(...r.dice);
    }
    if (step.target !== undefined && (!step.savvy || who)) {
      line.target = step.target;
      line.success = line.total >= step.target;
      if (step.invert) line.invert = true;
    }
    const texts = [];
    if (step.savvy && !who) texts.push(LP.turn.line.savvyNote(line.total, step.target, { engineer: step.engineer }));
    if (step.text) texts.push(step.text);

    let then = [];
    let gains = step.gain || null;
    if (step.outcomes) {
      const outcome = step.outcomes.find((o) => inRange(line.total, o, r.dice[0]));
      if (outcome) {
        if (outcome.final) texts.length = 0;
        if (outcome.text) texts.push(outcome.text);
        if (outcome.tone) line.tone = outcome.tone;
        if (outcome.fail && line.success !== undefined) line.success = false;
        if (outcome.gain) gains = outcome.gain;
        then = outcome.then || [];
      }
    } else if (line.success === true && step.successText) {
      texts.push(step.successText);
    } else if (line.success === false && step.failText) {
      texts.push(step.failText);
    }
    if (texts.length) line.text = texts.join(' ');
    addGains(state, gains);
    const path = append(state, frame.target, line);

    const next = then.slice();
    if (step.ifFail && who) {
      if (line.success === false) next.push(...step.ifFail);
    } else if (step.ifFail) {
      next.push({ when: step.savvy ? 'If it fails' : 'If it failed', steps: step.ifFail });
    }
    push(state, next, path, frame.env);
  }

  function runStep(state, step, frame) {
    if (step.times && step.times > 1) {
      expandTimes(step, frame);
      return;
    }
    const env = frame.env;

    if (step.table) return runTable(state, step, frame, step.table);
    if (step.rollAgain) {
      if (!env.table) return;
      return runTable(state, { label: step.label || 'Roll again' }, frame, env.table);
    }
    if (step.roll) return runRoll(state, step, frame);

    if (step.choice) {
      const path = append(state, frame.target, { type: 'text', text: step.choice.prompt, tone: 'note' });
      state.pending = {
        prompt: step.choice.prompt,
        options: step.choice.options.map((o) => ({ value: o.value, label: o.label })),
        step: step,
        target: path,
        env: env
      };
      return;
    }

    if (step.when || step.group) {
      const head = { type: 'text', text: (step.when || step.group) + ':', tone: step.when ? 'note' : undefined };
      if (step.when) head.when = true;
      if (step.source) head.source = step.source;
      const path = append(state, frame.target, head);
      push(state, step.steps, path, step.who ? Object.assign({}, env, { who: step.who }) : env);
      return;
    }

    if (step.randomCrew) {
      const n = env.crewCount;
      const count = step.count || 1;
      const names = env.crewNames;
      let text;
      if (names && names.length) {
        const picks = pickDistinct(names.length, count).map((i) => names[i - 1]);
        text = picks.join(', ') + '.';
      } else if (!n) {
        text = 'Pick ' + (count === 1 ? 'a random crew member' : count + ' random crew members') + '.';
      } else {
        const picks = pickDistinct(n, count);
        text = (count === 1 ? 'Crew member ' + picks[0] : 'Crew members ' + picks.join(', ')) + ' (of ' + n + ', in your roster order).';
      }
      append(state, frame.target, { type: 'text', text: (step.label ? step.label + ': ' : '') + text });
      return;
    }

    if (step.randomRival) {
      const names = env.rivalNames;
      const n = names ? names.length : env.rivals;
      let text;
      if (names && names.length) text = 'Rival: ' + names[LP.rng.int(names.length)] + '.';
      else text = n ? 'Rival ' + (LP.rng.int(n) + 1) + ' of ' + n + ' (in your list order).' : 'If you have Rivals, pick one at random.';
      append(state, frame.target, { type: 'text', text: text });
      return;
    }

    if (step.species) {
      const weights = env.speciesWeights || LP.archetypes.defaultSpeciesWeights();
      const pickRow = LP.rng.weightedPick(Object.entries(weights).map(([id, weight]) => ({ id, weight })));
      const s = pickRow ? LP.data.species.byId[pickRow.id] : null;
      const groups = { 'human': 'Human', 'bot': 'Bot', 'primary-alien': 'Primary Alien', 'strange': 'Strange Character' };
      append(state, frame.target, {
        type: 'table', table: 'Species', die: null, natural: null, label: step.label,
        rowId: s ? s.id : null,
        title: s ? s.name + ' (' + groups[s.group] + ')' : 'No species can be recruited here'
      });
      return;
    }

    if (step.enemyNumbers) {
      const dice = Math.max(1, (env.crewSize || 6) - 3);
      return runRoll(state, {
        roll: dice + 'D6',
        keep: 'highest',
        label: 'Enemy numbers (highest of ' + dice + 'D6)',
        text: 'Add the Numbers from the enemy profile' + (step.plus ? ', +' + plural(step.plus, 'extra figure', 'extra figures') : '') + '.'
      }, frame);
    }

    if (step.gain) addGains(state, step.gain);
    if (step.text) append(state, frame.target, { type: 'text', text: step.text, tone: step.tone });
  }

  /* ---------------------------------------------------------------------- */
  /* Public API                                                             */
  /* ---------------------------------------------------------------------- */

  /** Start a run of `steps` (and run it until done or a choice). */
  function start(steps, env) {
    const state = { lines: [], stack: [], pending: null, gains: {} };
    push(state, steps, [], Object.assign({ depth: 0 }, env));
    return run(state);
  }

  function run(state) {
    while (!state.pending && state.stack.length) {
      const frame = state.stack[state.stack.length - 1];
      if (!frame.steps.length) {
        state.stack.pop();
        continue;
      }
      runStep(state, frame.steps.shift(), frame);
    }
    return state;
  }

  /** Answer the pending choice and keep running. Returns false for an unknown value. */
  function choose(state, value) {
    const pending = state.pending;
    if (!pending) return false;
    const option = pending.step.choice.options.find((o) => o.value === value);
    if (!option) return false;
    state.pending = null;
    const chosen = container(state, pending.target);
    chosen.push({ type: 'text', text: '→ ' + option.label });
    push(state, option.then || [], pending.target, pending.env);
    run(state);
    return true;
  }

  /** The pending choice in the shape the turn engine expects, or null. */
  function pendingChoice(state) {
    return state.pending ? { prompt: state.pending.prompt, options: state.pending.options } : null;
  }

  LP.followup = { start, run, choose, pendingChoice, scriptFor, textColumn };
})(window.LP);
