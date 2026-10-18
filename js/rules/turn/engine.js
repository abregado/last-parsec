(function (LP) {
  'use strict';

  /*
   * Campaign turn engine.
   *
   * A turn is a fixed sequence of registered stages. Each stage is either
   * done (it has a record), skipped (its applies() returned a reason), or the
   * current one waiting for input. Only confirmed stages are stored:
   *
   *   campaign.turn = {
   *     startedAt,
   *     memoryAtStart,                // turnMemory when the turn began (for Restart)
   *     draft: { id, input } | null,  // input to pre-fill after an Undo
   *     records: [{ id, input, output, pending, facts, todo, history, memoryBefore, geoBefore }]
   *   }
   *   campaign.turnMemory = { ... }   // values remembered between turns (pre-fills)
   *
   * Stage definition:
   *   id, step ('travel' | 'world' | 'post'), number ('1.2'), title, page
   *   applies(ctx)               -> true, or a string saying why it is skipped
   *   fields(ctx)                -> input fields (see ui/stageForm.js), with default values
   *   validate(input, ctx)       -> error message or null            (optional)
   *   resolve(input, ctx)        -> { output, pending? }             all dice rolled here
   *   choose(record, value, ctx) -> { output, pending? }             (if it can be pending)
   *   facts(input, output, ctx)  -> values later stages read         (optional)
   *   remember(input, output, ctx) -> values kept for the next turn  (optional)
   *   todo(input, output, ctx)  -> [text] changes the player makes by hand (Crew tab) (optional)
   *   itemSource                 -> what gained items are credited to ("a trade roll"), text or
   *                                 (input, output, ctx) -> text                     (optional)
   *   apply(input, output, ctx)  -> changes planets (campaign.planets / currentPlanetId).
   *                                 Runs after resolve and again after each choice, always
   *                                 starting from the planets as they were before the stage,
   *                                 so it must only depend on input and output. (optional)
   *
   * Undo and Restart restore planets as well as turnMemory. Items a stage
   * gains go into the Crew tab's Stash (tagged, so Undo and Restart take them back).
   *
   * ctx = { settings, memory, facts, campaign, planet }; facts merges every
   * earlier confirmed stage's facts in order.
   *
   * Output is plain data: { headline, tone, lines: [line] } (see lines below).
   * A pending output carries { prompt, options: [{ value, label }] } and must
   * be answered with choose() before the turn moves on.
   */

  const STAGES = [];

  function register(def) {
    if (STAGES.some((s) => s.id === def.id)) throw new Error('Duplicate stage id: ' + def.id);
    STAGES.push(def);
  }

  function getStage(id) {
    return STAGES.find((s) => s.id === id) || null;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  /** Snapshot of the planets a stage may change (null for campaigns without planets). */
  function geo(campaign) {
    return Array.isArray(campaign.planets) ? { planets: clone(campaign.planets), currentPlanetId: campaign.currentPlanetId || null } : null;
  }

  function setGeo(campaign, snapshot) {
    if (!snapshot) return;
    campaign.planets = clone(snapshot.planets);
    campaign.currentPlanetId = snapshot.currentPlanetId;
  }

  function newTurn(campaign) {
    return {
      startedAt: new Date().toISOString(),
      memoryAtStart: clone(campaign.turnMemory),
      geoAtStart: geo(campaign),
      draft: null,
      records: []
    };
  }

  /** Create or repair campaign.turn and campaign.turnMemory. */
  function ensure(campaign) {
    if (!campaign.turnMemory || typeof campaign.turnMemory !== 'object' || Array.isArray(campaign.turnMemory)) {
      campaign.turnMemory = {};
    }
    const turn = campaign.turn;
    if (!turn || typeof turn !== 'object' || !Array.isArray(turn.records)) {
      campaign.turn = newTurn(campaign);
    } else {
      // Drop records for stages that no longer exist, and anything after them.
      const firstBad = turn.records.findIndex((r) => !getStage(r.id));
      if (firstBad >= 0) turn.records = turn.records.slice(0, firstBad);
      if (!turn.memoryAtStart) turn.memoryAtStart = clone(campaign.turnMemory);
    }
    return campaign.turn;
  }

  /** ctx.memory is turnMemory, with contacts, traits and invasion taken from the current planet. */
  function context(campaign, records) {
    const facts = {};
    for (const record of records) Object.assign(facts, record.facts || {});
    const planet = LP.planets && Array.isArray(campaign.planets) ? LP.planets.current(campaign) : null;
    let memory = campaign.turnMemory;
    if (planet) {
      memory = Object.assign({}, campaign.turnMemory, {
        rivals: planet.rivals.length,
        patrons: planet.patrons.length,
        worldTraits: planet.worldTraits.slice(),
        invadedNext: !!(planet.invasion && planet.invasion.status === 'invaded')
      });
    }
    return { settings: campaign.settings, memory: memory, facts: facts, campaign: campaign, planet: planet };
  }

  /**
   * Walk the stages. Returns
   *   { items: [{ def, status: 'done' | 'pending' | 'skipped' | 'current', record?, reason?, ctx? }],
   *     current: def | null, finished: bool }
   */
  function walk(campaign) {
    const records = ensure(campaign).records;
    const items = [];
    let index = 0;

    for (const def of STAGES) {
      const record = records[index];
      if (record && record.id === def.id) {
        index++;
        if (record.pending) {
          items.push({ def, record, status: 'pending' });
          return { items, current: null, finished: false };
        }
        items.push({ def, record, status: 'done' });
        continue;
      }
      const ctx = context(campaign, records.slice(0, index));
      const applies = def.applies ? def.applies(ctx) : true;
      if (applies !== true) {
        items.push({ def, status: 'skipped', reason: applies || 'Not needed this turn.' });
        continue;
      }
      items.push({ def, status: 'current', ctx });
      return { items, current: def, finished: false };
    }
    return { items, current: null, finished: true };
  }

  /** Fields for the current stage, with Undo drafts applied over the defaults. */
  function currentFields(campaign) {
    const w = walk(campaign);
    if (!w.current) return null;
    const ctx = context(campaign, campaign.turn.records);
    const fields = (w.current.fields ? w.current.fields(ctx) : []).filter(Boolean);
    const draft = campaign.turn.draft;
    if (draft && draft.id === w.current.id) {
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(draft.input, field.key)) field.value = clone(draft.input[field.key]);
      }
    }
    return fields;
  }

  /** Tag on the items a record put in the Stash. */
  function itemTag(campaign, record) {
    return campaign.turn.startedAt + '/' + record.id;
  }

  /** Put a stage's gained items in the Stash; def.itemSource credits those outside a sourced group. */
  function syncItems(campaign, def, record, ctx) {
    if (!LP.roster) return;
    const source = typeof def.itemSource === 'function' ? def.itemSource(record.input, record.output, ctx) : def.itemSource;
    LP.roster.syncStageItems(campaign, itemTag(campaign, record), record.output, {
      label: source || 'the ' + def.title.charAt(0).toLowerCase() + def.title.slice(1) + ' step',
      planet: ctx.planet ? ctx.planet.name : null,
      turn: LP.roster.turnNumber(campaign)
    });
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  /** Changes the player makes by hand: the stage's todo() plus follow-up gains. */
  function todoFor(def, record, ctx) {
    const list = def.todo ? (def.todo(record.input, record.output, ctx) || []).filter(Boolean) : [];
    const g = (record.output && record.output.fu && record.output.fu.gains) || {};
    if (g.storyPoints) list.push('+' + plural(g.storyPoints, 'story point', 'story points') + '.');
    if (g.rumors) list.push('+' + plural(g.rumors, 'Rumor', 'Rumors') + '.');
    if (!ctx.planet && g.rivals) list.push('Add ' + plural(g.rivals, 'Rival', 'Rivals') + '.');
    if (!ctx.planet && g.patrons) list.push('Add ' + plural(g.patrons, 'Patron', 'Patrons') + '.');
    return list;
  }

  /** After a stage's output changes: items into the Stash, and the to-do list. */
  function finish(campaign, def, record, ctx) {
    syncItems(campaign, def, record, ctx);
    record.todo = todoFor(def, record, ctx);
  }

  function applyResult(campaign, def, record, result, ctx) {
    record.output = result.output;
    record.pending = result.pending || null;
    record.facts = def.facts ? def.facts(record.input, record.output, ctx) || {} : {};
    if (def.remember) Object.assign(campaign.turnMemory, def.remember(record.input, record.output, ctx) || {});
    if (def.apply && record.geoBefore) {
      setGeo(campaign, record.geoBefore);
      def.apply(record.input, record.output, context(campaign, campaign.turn.records.filter((r) => r !== record)));
    }
    finish(campaign, def, record, ctx);
  }

  /** Confirm the current stage. Returns { ok: true } or { error }. */
  function confirm(campaign, input) {
    const w = walk(campaign);
    if (!w.current) return { error: 'There is no stage waiting for input.' };
    const def = w.current;
    const turn = campaign.turn;
    const ctx = context(campaign, turn.records);
    const error = def.validate ? def.validate(input, ctx) : null;
    if (error) return { error };

    const record = {
      id: def.id,
      input: clone(input),
      output: null,
      pending: null,
      facts: {},
      history: [],
      memoryBefore: clone(campaign.turnMemory),
      geoBefore: geo(campaign)
    };
    applyResult(campaign, def, record, def.resolve(clone(input), ctx), ctx);
    turn.records.push(record);
    turn.draft = null;
    return { ok: true };
  }

  /** Answer the pending choice on the last stage. */
  function choose(campaign, value) {
    const turn = ensure(campaign);
    const record = turn.records[turn.records.length - 1];
    if (!record || !record.pending) return { error: 'Nothing is waiting for a choice.' };
    if (!record.pending.options.some((o) => o.value === value)) return { error: 'Unknown choice.' };
    const def = getStage(record.id);
    const ctx = context(campaign, turn.records.slice(0, -1));
    record.history.push({
      output: clone(record.output),
      pending: clone(record.pending),
      facts: clone(record.facts),
      memory: clone(campaign.turnMemory),
      geo: geo(campaign)
    });
    applyResult(campaign, def, record, def.choose(record, value, ctx), ctx);
    return { ok: true };
  }

  function canUndo(campaign) {
    return ensure(campaign).records.length > 0;
  }

  /** Undo the last choice, or else remove the last stage and refill its form. */
  function undo(campaign) {
    const turn = ensure(campaign);
    const record = turn.records[turn.records.length - 1];
    if (!record) return false;
    if (record.history.length) {
      const previous = record.history.pop();
      record.output = previous.output;
      record.pending = previous.pending;
      record.facts = previous.facts;
      campaign.turnMemory = previous.memory;
      setGeo(campaign, previous.geo);
      finish(campaign, getStage(record.id), record, context(campaign, turn.records.slice(0, -1)));
      return true;
    }
    turn.records.pop();
    campaign.turnMemory = record.memoryBefore || {};
    setGeo(campaign, record.geoBefore);
    if (LP.roster) LP.roster.removeTagged(campaign, itemTag(campaign, record), true);
    turn.draft = { id: record.id, input: record.input };
    return true;
  }

  /** Throw this turn away and start it again, as it was when it began. */
  function restart(campaign) {
    ensure(campaign);
    campaign.turnMemory = clone(campaign.turn.memoryAtStart) || {};
    setGeo(campaign, campaign.turn.geoAtStart);
    if (LP.roster) LP.roster.removeTagged(campaign, campaign.turn.startedAt + '/', true);
    campaign.turn = newTurn(campaign);
  }

  /** Begin the next turn, keeping what this turn remembered. */
  function nextTurn(campaign) {
    ensure(campaign);
    campaign.turnNumber = (LP.roster ? LP.roster.turnNumber(campaign) : campaign.turnNumber || 1) + 1;
    campaign.turn = newTurn(campaign);
  }

  /* ---------------------------------------------------------------------- */
  /* Output line helpers                                                    */
  /* ---------------------------------------------------------------------- */

  /*
   * Line shapes (rendered by ui/resultCard.js):
   *   { type: 'roll',  label, notation, dice: [..], modifiers: [{ label, value }], total,
   *                    target?, success?, text?, children? }
   *   { type: 'table', table, die, natural, modifier, total, title, text, children? }
   *   { type: 'text',  text, tone?: 'good' | 'bad' | 'note' }
   *   { type: 'facts', items: [[label, value], ...] }
   */

  /**
   * Roll dice. options: { label, modifiers: [{ label, value }], target (number, "N+"),
   * successText, failText, text, invert }
   * invert: success is bad news for the crew (e.g. a Rival following you),
   * so the verdict is coloured the other way round.
   */
  function rollLine(notation, options) {
    const opts = options || {};
    const r = LP.rng.roll(notation);
    const modifiers = (opts.modifiers || []).filter((m) => m.value);
    const total = r.total + modifiers.reduce((sum, m) => sum + m.value, 0);
    const line = {
      type: 'roll',
      label: opts.label || '',
      notation: r.notation,
      dice: r.dice,
      base: r.total,
      modifiers: modifiers,
      total: total
    };
    if (opts.target !== undefined) {
      line.target = opts.target;
      line.success = total >= opts.target;
      const text = line.success ? opts.successText : opts.failText;
      if (text) line.text = text;
      if (opts.invert) line.invert = true;
    } else if (opts.text) {
      line.text = opts.text;
    }
    return line;
  }

  /** Roll on a table with its own die and printed ranges (rng.rollOn options). */
  function tableLine(tableName, options) {
    const opts = options || {};
    const result = LP.rng.rollOn(tableName, opts);
    const table = LP.rng.getTable(tableName);
    const row = result.row;
    const line = {
      type: 'table',
      table: tableName,
      die: result.die,
      natural: result.natural,
      modifier: result.modifier,
      total: result.total,
      rowId: row ? row.id : null,
      title: row ? row[table.labelColumn] : 'No result',
      text: row && opts.textColumn ? row[opts.textColumn] : ''
    };
    if (opts.label) line.label = opts.label;
    return line;
  }

  function textLine(text, tone) {
    return tone ? { type: 'text', text: text, tone: tone } : { type: 'text', text: text };
  }

  function factsLine(items) {
    return { type: 'facts', items: items };
  }

  /**
   * "Succeeds if the character has Savvy +2 or better." for a 1D6 + Savvy roll.
   * options.engineer: Engineers add +1 (Repair rolls).
   */
  function savvyNote(natural, target, options) {
    const opts = options || {};
    const need = target - natural;
    if (need <= 0) return 'Succeeds whatever the character’s Savvy.';
    if (need > 5 && !(opts.engineer && need - 1 <= 5)) return 'Fails whatever the character’s Savvy (+5 is the maximum).';
    let text = 'Succeeds if the character has Savvy +' + need + ' or better';
    if (opts.engineer) {
      text += need - 1 <= 0 ? ', or is an Engineer' : ' (+' + (need - 1) + ' or better for an Engineer)';
    }
    return text + '.';
  }

  LP.turn = {
    STAGES,
    register,
    getStage,
    ensure,
    itemTag,
    walk,
    currentFields,
    context,
    confirm,
    choose,
    canUndo,
    undo,
    restart,
    nextTurn,
    line: { roll: rollLine, table: tableLine, text: textLine, facts: factsLine, savvyNote }
  };
})(window.LP);
