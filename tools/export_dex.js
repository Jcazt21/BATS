'use strict';
/**
 * tools/export_dex.js
 * ===================
 * Vuelca el dex del fork de Pokémon Showdown a JSON estático (web/public/dex/).
 * Es la fuente de verdad del teambuilder y de la validación de equipos en BATS.
 *
 * No requiere que el servidor PS esté corriendo, pero sí compilado (`node build`):
 *   node tools/export_dex.js && node tools/check_dex_export.js
 *
 * Se puede apuntar a otro checkout con BATS_PS_DIR.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PS_DIR = process.env.BATS_PS_DIR || path.resolve(__dirname, '..', '..', 'pokemon-showdown');
const OUT = path.resolve(__dirname, '..', 'web', 'public', 'dex');
const LEAGUE = 'gen9pinchesgueysleague';
const SPARRING = 'gen9pglsparring';
// Mismo conjunto que LEGENDARY_TAGS en config/formats.ts: si cambia allá, cambia aquí.
const LEGENDARY_TAGS = new Set(['Sub-Legendary', 'Restricted Legendary', 'Mythical', 'Ultra Beast', 'Paradox']);
const RESTRICTED_TAGS = ['Sub-Legendary', 'Restricted Legendary', 'Mythical'];

const { Dex } = require(path.join(PS_DIR, 'dist/sim/dex'));
const { TeamValidator } = require(path.join(PS_DIR, 'dist/sim/team-validator'));
Dex.formats.load();

const validator = TeamValidator.get(LEAGUE);
const dex = validator.dex;
const ruleTable = validator.ruleTable;

/** NatDex admite lo "Past"; CAP y lo custom no existen para la liga. */
const usable = thing => !thing.isNonstandard || thing.isNonstandard === 'Past' || thing.isNonstandard === 'Unobtainable';
const usableItem = thing => !thing.isNonstandard || thing.isNonstandard === 'Past';

const write = (file, data) => {
	const target = path.join(OUT, file);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, JSON.stringify(data));
};

fs.rmSync(path.join(OUT, 'learnsets'), { recursive: true, force: true });

const species = {};
const learnsets = {}; // letra -> { speciesId: [moveId] }
for (const sp of dex.species.all()) {
	if (!usable(sp)) continue;
	const tags = sp.tags || [];
	const bst = Object.values(sp.baseStats).reduce((a, b) => a + b, 0);
	const base = dex.species.get(sp.baseSpecies || sp.name);
	species[sp.id] = {
		id: sp.id,
		name: sp.name,
		num: sp.num,
		types: sp.types,
		bst,
		baseStats: sp.baseStats,
		color: sp.color,
		eggGroups: sp.eggGroups,
		// La generación de una forma regional es la de su especie base (como en formats.ts).
		gen: base.gen,
		tags,
		abilities: Object.values(sp.abilities),
		spriteid: sp.spriteid,
		baseSpecies: sp.baseSpecies,
		forme: sp.forme || null,
		prevo: sp.prevo || null,
		isNonstandard: sp.isNonstandard || null,
		restricted: tags.some(t => RESTRICTED_TAGS.includes(t)),
		paradox: tags.includes('Paradox'),
		ultraBeast: tags.includes('Ultra Beast'),
		pseudo: bst === 600 && !tags.some(t => LEGENDARY_TAGS.has(t)),
		// La banlist real del formato (Crowned, Rider...) + los Ultra Beasts, que formats.ts prohíbe por tag.
		leagueLegal: !ruleTable.isBannedSpecies(sp) && !tags.includes('Ultra Beast'),
	};
	const bucket = /^[a-z]/.test(sp.id) ? sp.id[0] : '0';
	(learnsets[bucket] ||= {})[sp.id] = [...dex.species.getMovePool(sp.id, true)].sort();
}

const moves = {};
for (const mv of dex.moves.all()) {
	if (!usableItem(mv)) continue;
	moves[mv.id] = {
		id: mv.id, name: mv.name, type: mv.type, category: mv.category, basePower: mv.basePower,
		accuracy: mv.accuracy, pp: mv.pp, priority: mv.priority, shortDesc: mv.shortDesc || mv.desc || '',
	};
}

const items = {};
for (const it of dex.items.all()) {
	if (!usableItem(it)) continue;
	items[it.id] = { id: it.id, name: it.name, desc: it.shortDesc || it.desc || '' };
}

const abilities = {};
for (const ab of dex.abilities.all()) {
	if (!usableItem(ab)) continue;
	abilities[ab.id] = { id: ab.id, name: ab.name, desc: ab.shortDesc || ab.desc || '' };
}

const natures = {};
for (const na of dex.natures.all()) natures[na.id] = { name: na.name, plus: na.plus || null, minus: na.minus || null };

write('species.json', species);
write('moves.json', moves);
write('items.json', items);
write('abilities.json', abilities);
write('natures.json', natures);
for (const [bucket, data] of Object.entries(learnsets)) write(path.join('learnsets', `${bucket}.json`), data);

let psCommit = 'desconocido';
try { psCommit = execSync('git rev-parse --short HEAD', { cwd: PS_DIR }).toString().trim(); } catch { /* sin git */ }
write('meta.json', {
	generated_at: new Date().toISOString(),
	ps_commit: psCommit,
	counts: { species: Object.keys(species).length, moves: Object.keys(moves).length },
	formats: { league: LEAGUE, sparring: SPARRING },
});
console.log(`Dex exportado a ${OUT} (${Object.keys(species).length} especies, PS ${psCommit}).`);
