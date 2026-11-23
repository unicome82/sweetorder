import { registerHooks } from 'node:module';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(specifier + '.ts', context);
    }
    return nextResolve(specifier, context);
  },
});

const { ORDER_SLOTS, QUEUE_COUNT } = await import('../src/game/constants.ts');
const { TRAY_CAPACITY_BY_DIFFICULTY } = await import('../src/game/trayCapacity.ts');
const { createGame, selectDonut } = await import('../src/game/engine.ts');
const { DONUT_TYPES } = await import('../src/game/types.ts');
const { difficultyForStage, campaignProgress, hiddenDessertCount, STAGE_COUNT, CHUNK_SIZE } = await import('../src/game/stages/schedule.ts');

// Bump a difficulty's revision to regenerate its stored layouts with the current rules.
const layoutRevisions = { easy: 20, normal: 21, hard: 23 };
// Usage: stages:generate -- <chunks, e.g. 1-100 or 7> [--seed N] [--jobs N] [--force]
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const campaignSeed = Number(option('--seed') ?? 2026);
const force = args.includes('--force');
const lastChunk = Math.ceil(STAGE_COUNT / CHUNK_SIZE);
const [chunkFrom, chunkTo = chunkFrom] = (args.find(arg => /^\d+(-\d+)?$/.test(arg)) ?? `1-${lastChunk}`).split('-').map(Number);
if (!(chunkFrom >= 1 && chunkTo >= chunkFrom && chunkTo <= lastChunk) || !Number.isInteger(campaignSeed) || campaignSeed < 0 || campaignSeed > 0xffffffff) {
  throw new Error(`Usage: npm run stages:generate -- <chunk or range within 1–${lastChunk}> [--seed N] [--jobs N] [--force]`);
}

// Layout knobs are sampled from these ranges; bot success bands decide which candidate is kept.
// Menus stay small (10/12/14 kinds) so players are not juggling too many desserts; the lost
// difficulty comes from wider batches, which put desserts for later customers in front.
const profiles = {
  easy: { variety: 10, orders: 9, kinds: [2, 2], batch: [2, 5], runSize: [3, 7], dessertTotal: [126, 140], bonus: 2 },
  normal: { variety: 12, orders: 12, kinds: [2, 3], batch: [4, 9], runSize: [2, 6], dessertTotal: [160, 176], bonus: 0 },
  hard: { variety: 14, orders: 15, kinds: [3, 3], batch: [6, 11], runSize: [3, 5], dessertTotal: [200, 216], bonus: 0 },
};
const lerp = (from, to, progress) => from + (to - from) * progress;
// Success-rate targets (percent) for a skilled bot (nearest needed dessert first) and a
// novice bot (taps any needed front dessert). Targets tighten as the campaign advances.
function targetsFor(difficulty, progress) {
  if (difficulty === 'easy') return { skilled: [97, 100], novice: band(lerp(96, 72, progress), 6) };
  if (difficulty === 'normal') return { skilled: band(lerp(98, 88, progress), 4), novice: band(lerp(50, 18, progress), 12) };
  return { skilled: band(lerp(86, 68, progress), 5), novice: [0, lerp(20, 10, progress)] };
}
function band(center, tolerance) {
  return [Math.max(0, center - tolerance), Math.min(100, center + tolerance)];
}

const chunkName = chunk => String(chunk).padStart(4, '0') + '.json';
const stageFile = chunk => new URL(`../src/game/stages/chunks/${chunkName(chunk)}`, import.meta.url);
const solutionFile = chunk => new URL(`../src/game/stages/solutions/${chunkName(chunk)}`, import.meta.url);

function randomFor(seed) {
  let state = seed >>> 0;
  return size => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state / 0x100000000 * size);
  };
}
const between = (random, [low, high]) => low + random(high - low + 1);

function shuffle(values, random) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = random(index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

function makeCandidate(id, difficulty, progress, random) {
  const profile = profiles[difficulty];
  const knobs = {
    kinds: between(random, profile.kinds),
    batch: between(random, profile.batch),
    runSize: between(random, profile.runSize),
    dessertTotal: Math.round(lerp(...profile.dessertTotal, progress)),
  };
  const menuPool = difficulty === 'hard' ? DONUT_TYPES : DONUT_TYPES.slice(DONUT_TYPES.indexOf('croissant'));
  const menu = shuffle(menuPool, random).slice(0, profile.variety);
  const orders = Array.from({ length: profile.orders }, (_, index) => {
    const featured = menu[index % menu.length];
    const required = [featured, ...menu.slice(profile.orders + index, profile.orders + index + 1)].slice(0, knobs.kinds);
    const alternatives = shuffle(menu.filter(type => !required.includes(type)), random);
    const types = [...required, ...alternatives.slice(0, knobs.kinds - required.length)];
    return {
      id: `s${id}-o${index + 1}`,
      sequence: index + 1,
      items: Object.fromEntries(types.map(type => [type, 2 + random(4) + profile.bonus])),
    };
  });
  const dessertCount = orders.reduce((sum, order) =>
    sum + Object.values(order.items).reduce((total, quantity) => total + quantity, 0), 0);
  const additional = Math.max(0, knobs.dessertTotal - dessertCount);
  const extraOrders = Math.ceil(additional / 13);
  for (let extra = 0; extra < extraOrders; extra += 1) {
    const quantity = Math.floor(additional / extraOrders) + Number(extra < additional % extraOrders);
    const types = shuffle(menu, random).slice(0, Math.min(knobs.kinds, quantity));
    const items = Object.fromEntries(types.map((type, index) => [
      type, Math.floor(quantity / types.length) + Number(index < quantity % types.length),
    ]));
    const sequence = orders.length + 1;
    orders.push({ id: `s${id}-extra-o${sequence}`, sequence, items });
  }
  return arrangeStage(id, difficulty, random, menu, orders, knobs);
}

function arrangeStage(id, difficulty, random, menu, orders, knobs) {
  const queues = Array.from({ length: QUEUE_COUNT }, () => []);
  const columns = shuffle(queues.map((_, index) => index), random);
  let run = 0;
  for (let start = 0; start < orders.length; start += knobs.batch) {
    const runs = orders.slice(start, start + knobs.batch).flatMap(order =>
      Object.entries(order.items).flatMap(([type, quantity]) =>
        Array.from({ length: Math.ceil(quantity / knobs.runSize) }, (_, index) =>
          [type, Math.min(quantity - index * knobs.runSize, knobs.runSize)])));
    for (const [type, quantity] of shuffle(runs, random)) {
      const queue = queues[columns[run % QUEUE_COUNT]];
      for (let index = 0; index < quantity; index += 1) queue.push(menu.indexOf(type));
      run += 1;
    }
  }
  const stage = {
    id, difficulty, revision: layoutRevisions[difficulty], donutTypes: menu, targetOrders: orders.length,
    trayCapacity: TRAY_CAPACITY_BY_DIFFICULTY[difficulty], queues, orders,
  };
  const count = hiddenDessertCount(id, difficulty);
  if (count) {
    // Cover a fixed number of desserts, never one of a queue's first two.
    const spots = shuffle(queues.flatMap((queue, column) => queue.flatMap((_, index) => index >= 2 ? [[column, index]] : [])), random).slice(0, count);
    stage.hidden = queues.map((_, column) => spots.filter(([spot]) => spot === column).map(([, index]) => index).sort((a, b) => a - b));
  }
  return stage;
}

// Fast replica of the engine's instant-settle rules, used only to score candidates.
function simulate(stage, policy, random) {
  const kinds = stage.donutTypes.length;
  const hidden = stage.queues.map((_, column) => new Set(stage.hidden?.[column]));
  const demand = stage.orders.map(order => {
    const remaining = new Array(kinds).fill(0);
    for (const [type, quantity] of Object.entries(order.items)) remaining[stage.donutTypes.indexOf(type)] = quantity;
    return remaining;
  });
  const fronts = new Array(QUEUE_COUNT).fill(0);
  const tray = new Array(kinds).fill(0);
  let trayCount = 0;
  let next = Math.min(ORDER_SLOTS, demand.length);
  let completed = 0;
  const active = demand.slice(0, next).map((remaining, index) => ({ sequence: index, remaining: [...remaining], left: remaining.reduce((a, b) => a + b, 0) }));
  const needed = type => active.some(order => order.remaining[type] > 0);
  const absorb = order => {
    for (let type = 0; type < kinds; type += 1) {
      const used = Math.min(tray[type], order.remaining[type]);
      if (!used) continue;
      tray[type] -= used; trayCount -= used; order.remaining[type] -= used; order.left -= used;
    }
  };
  while (completed < demand.length) {
    let choice = -1;
    if (policy === 'skilled') {
      let best = Infinity;
      for (let column = 0; column < QUEUE_COUNT; column += 1) {
        const queue = stage.queues[column];
        if (fronts[column] >= queue.length) continue;
        let depth = 0;
        // A covered dessert behind the front is unknown, so the bot cannot plan for it.
        const unknownOrUnneeded = position => (position > fronts[column] && hidden[column].has(position)) || !needed(queue[position]);
        while (fronts[column] + depth < queue.length && unknownOrUnneeded(fronts[column] + depth)) depth += 1;
        const score = (fronts[column] + depth < queue.length ? depth : 1e6) + random(1000) / 1000;
        if (score < best) { best = score; choice = column; }
      }
    } else {
      const open = [];
      const useful = [];
      for (let column = 0; column < QUEUE_COUNT; column += 1) {
        if (fronts[column] >= stage.queues[column].length) continue;
        open.push(column);
        if (needed(stage.queues[column][fronts[column]])) useful.push(column);
      }
      const pool = useful.length ? useful : open;
      choice = pool.length ? pool[random(pool.length)] : -1;
    }
    if (choice < 0) return false;
    const type = stage.queues[choice][fronts[choice]];
    fronts[choice] += 1;
    const order = active.filter(candidate => candidate.remaining[type] > 0).sort((a, b) => a.sequence - b.sequence)[0];
    if (order) {
      order.remaining[type] -= 1; order.left -= 1;
    } else {
      tray[type] += 1; trayCount += 1;
    }
    for (let changed = true; changed;) {
      changed = false;
      for (let slot = 0; slot < active.length; slot += 1) {
        if (active[slot].left > 0) continue;
        completed += 1;
        changed = true;
        if (next < demand.length) {
          active[slot] = { sequence: next, remaining: [...demand[next]], left: demand[next].reduce((a, b) => a + b, 0) };
          next += 1;
          absorb(active[slot]);
        } else {
          active.splice(slot, 1);
          slot -= 1;
        }
      }
    }
    if (trayCount >= stage.trayCapacity && completed < demand.length) return false;
  }
  return true;
}

function successRate(stage, policy, runs, seed) {
  const random = randomFor(seed);
  let wins = 0;
  for (let run = 0; run < runs; run += 1) wins += Number(simulate(stage, policy, random));
  return 100 * wins / runs;
}

function measure(stage, runs, seed) {
  return { skilled: successRate(stage, 'skilled', runs, seed), novice: successRate(stage, 'novice', runs, seed ^ 0x5bd1e995) };
}
const distance = (value, [low, high]) => value < low ? low - value : value > high ? value - high : 0;
const miss = (rates, targets) => distance(rates.skilled, targets.skilled) * 2 + distance(rates.novice, targets.novice);

function toStage(candidate) {
  return {
    ...candidate,
    queues: candidate.queues.map((queue, column) => queue.map((menuIndex, index) => ({
      id: `s${candidate.id}-q${column}-${index}`, type: candidate.donutTypes[menuIndex],
    }))),
  };
}

// Witness path replayed through the real engine, so tests can prove each stage is clearable.
function findSolution(candidate, random) {
  const stage = toStage(candidate);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let state = createGame(stage);
    const solution = [];
    while (state.status === 'playing') {
      const needed = type => state.orders.some(order => (order?.remaining[type] ?? 0) > 0);
      let best = Infinity;
      let column = -1;
      for (const [index, queue] of state.queues.entries()) {
        if (!queue.length) continue;
        const depth = queue.findIndex(token => needed(token.type));
        const score = (depth < 0 ? 1e6 : depth) + random(1000) / 1000;
        if (score < best) { best = score; column = index; }
      }
      if (column < 0) break;
      const next = selectDonut(state, stage, column, state.queues[column][0].id).state;
      if (next === state) break;
      solution.push(column);
      state = next;
    }
    if (state.status === 'clear') return solution;
  }
  return undefined;
}

function readJson(url, fallback) {
  return existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : fallback;
}
function writeJson(url, entries, open, close, format) {
  const temporary = new URL(url.href + '.tmp');
  writeFileSync(temporary, `${open}\n${entries.map(format).join(',\n')}\n${close}\n`);
  renameSync(temporary, url);
}

// Stages up to here were tuned with bot success bands; later stages come straight from the
// layout formula and are only checked to be clearable, which takes milliseconds instead of seconds.
const calibratedThrough = 101;
function formulaStage(id, difficulty, progress, random) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = makeCandidate(id, difficulty, progress, random);
    const solution = findSolution(candidate, random);
    if (solution) return { stage: candidate, solution };
  }
  throw new Error(`No clearable ${difficulty} layout for stage ${id}.`);
}

function generateStage(id) {
  const difficulty = difficultyForStage(id);
  const progress = campaignProgress(id);
  const random = randomFor(campaignSeed ^ Math.imul(id, 0x9e3779b9));
  if (id > calibratedThrough) return formulaStage(id, difficulty, progress, random);
  const targets = targetsFor(difficulty, progress);
  let best;
  for (let attempt = 0; attempt < 3000 && !(best && best.miss === 0); attempt += 1) {
    const candidate = makeCandidate(id, difficulty, progress, random);
    const quick = measure(candidate, 60, campaignSeed + attempt);
    if (best && miss(quick, targets) > best.miss + 10) continue;
    const rates = measure(candidate, 400, campaignSeed ^ id);
    const score = miss(rates, targets);
    if (!best || score < best.miss) best = { candidate, rates, miss: score };
  }
  const solution = findSolution(best.candidate, random);
  if (!solution) throw new Error(`No verified ${difficulty} layout for stage ${id}.`);
  console.log(`stage ${id} ${difficulty}: skilled ${best.rates.skilled.toFixed(0)}% novice ${best.rates.novice.toFixed(0)}%`
    + ` (target ${targets.skilled.map(Math.round).join('–')} / ${targets.novice.map(Math.round).join('–')})${best.miss ? ' *' : ''}`);
  return { stage: best.candidate, solution };
}

// Released stages stay frozen: a stored stage is kept unless its rules revision changed or --force.
function generateChunk(chunk) {
  const firstId = Math.max(2, (chunk - 1) * CHUNK_SIZE + 1);
  const lastId = Math.min(STAGE_COUNT, chunk * CHUNK_SIZE);
  const stored = readJson(stageFile(chunk), { stages: [] }).stages;
  const storedSolutions = readJson(solutionFile(chunk), {});
  const stages = [];
  const solutions = {};
  for (let id = firstId; id <= lastId; id += 1) {
    const previous = stored.find(stage => stage.id === id);
    const difficulty = difficultyForStage(id);
    const keep = !force && previous && storedSolutions[id] && previous.revision === layoutRevisions[difficulty]
      && (previous.hidden?.flat().length ?? 0) === hiddenDessertCount(id, difficulty);
    const result = keep ? { stage: previous, solution: storedSolutions[id] } : generateStage(id);
    stages.push(result.stage);
    solutions[id] = result.solution;
  }
  mkdirSync(new URL('.', stageFile(chunk)), { recursive: true });
  mkdirSync(new URL('.', solutionFile(chunk)), { recursive: true });
  writeJson(stageFile(chunk), stages, '{\n  "stages": [', '  ]\n}', stage => '    ' + JSON.stringify(stage));
  writeJson(solutionFile(chunk), stages, '{', '}', ({ id }) => `  "${id}": ${JSON.stringify(solutions[id])}`);
  console.log(`Saved chunk ${chunk} (stages ${firstId}–${lastId}).`);
}

if (chunkFrom === chunkTo) {
  generateChunk(chunkFrom);
} else {
  // Stage seeds depend only on the stage id, so chunks can be generated in parallel processes.
  const jobs = Number(option('--jobs') ?? availableParallelism());
  const pending = Array.from({ length: chunkTo - chunkFrom + 1 }, (_, index) => chunkFrom + index);
  const passOn = [...(force ? ['--force'] : []), '--seed', String(campaignSeed)];
  let failed = false;
  const worker = async () => {
    for (let chunk = pending.shift(); chunk !== undefined && !failed; chunk = pending.shift()) {
      const child = spawn(process.execPath, [new URL(import.meta.url).pathname, String(chunk), ...passOn], { stdio: ['ignore', 'inherit', 'inherit'] });
      const code = await new Promise(resolve => child.on('close', resolve));
      if (code !== 0) failed = true;
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  if (failed) process.exit(1);
}
