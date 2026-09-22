'use strict';
/**
 * Verifica el snapshot del dex generado por export_dex.js.
 *   node tools/check_dex_export.js
 */
const fs = require('fs');
const path = require('path');

const DEX = path.resolve(__dirname, '..', 'web', 'public', 'dex');
const read = f => JSON.parse(fs.readFileSync(path.join(DEX, f), 'utf8'));
let fails = 0;
const check = (ok, msg) => {
	if (!ok) { console.error(`✗ ${msg}`); fails++; } else console.log(`✓ ${msg}`);
};

const species = read('species.json');
const moves = read('moves.json');
const meta = read('meta.json');

check(Object.keys(species).length > 1000, 'más de 1000 especies exportadas');
check(species.garchomp.bst === 600 && species.garchomp.pseudo === true, 'Garchomp es pseudo-legendario');
check(species.garchomp.leagueLegal === true, 'Garchomp es legal en la liga');
check(species.greattusk.paradox === true, 'Great Tusk es Paradox');
check(species.koraidon.paradox === false, 'Koraidon no lleva el tag Paradox en PS (es Restricted Legendary)');
check(species.koraidon.restricted === true, 'Koraidon es restricted legendary');
check(species.buzzwole.ultraBeast === true, 'Buzzwole es Ultra Beast');
check(species.buzzwole.leagueLegal === false, 'Buzzwole no es legal en la liga');
check(species.zaciancrowned.leagueLegal === false, 'Zacian-Crowned está prohibido');
check(species.pikachu.color === 'Yellow' && species.pikachu.gen === 1, 'Pikachu: color y generación');
check(species.raichualola.gen === 1, 'Raichu-Alola hereda la generación de su especie base');
check(species.dragonite.eggGroups.includes('Dragon'), 'Dragonite conserva sus egg groups');
check(moves.earthquake.basePower === 100, 'Earthquake tiene 100 de poder');

const bucket = read(path.join('learnsets', 'g.json'));
check(bucket.garchomp.includes('earthquake'), 'Garchomp aprende Earthquake');
check(!bucket.garchomp.includes('psychic'), 'Garchomp NO aprende Psychic');
check(!!meta.generated_at && !!meta.ps_commit, 'meta tiene fecha y commit de PS');

process.exit(fails ? 1 : 0);
