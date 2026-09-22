'use strict';

/** Comprueba el contrato canónico entre BATS (Python) y Pokémon Showdown. */
const fs = require('fs');
const path = require('path');

const BATS_DIR = path.resolve(__dirname, '..');
const PS_DIR = process.env.BATS_PS_DIR || path.resolve(BATS_DIR, '..', 'pokemon-showdown');
const fixtures = JSON.parse(fs.readFileSync(
	path.join(BATS_DIR, 'tests', 'fixtures', 'sets_canonicos.json'), 'utf8'
));
const { Dex } = require(path.join(PS_DIR, 'dist', 'sim', 'dex'));
const { canonicalSet } = require(path.join(PS_DIR, 'dist', 'config', 'formats'));

if (typeof canonicalSet !== 'function') {
	throw new Error('config/formats.ts no exporta canonicalSet; ejecuta node build en Pokémon Showdown.');
}

Dex.includeFormats();
const dex = Dex.forFormat('gen9pinchesgueysleague');
let fails = 0;
for (const fixture of fixtures) {
	const set = {
		species: fixture.set.name,
		item: fixture.set.held_item || '',
		ability: fixture.set.ability || '',
		nature: fixture.set.nature || '',
		teraType: fixture.set.tera_type || '',
		moves: fixture.set.moves || [],
		evs: fixture.set.evs || {},
		ivs: fixture.set.ivs || {},
	};
	const got = canonicalSet(dex, set);
	if (got !== fixture.canonical) {
		console.error(`✗ ${fixture.set.name}\n  BATS: ${fixture.canonical}\n  PS:   ${got}`);
		fails++;
	} else {
		console.log(`✓ ${fixture.set.name}`);
	}
}
process.exit(fails ? 1 : 0);
