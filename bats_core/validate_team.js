'use strict';
/**
 * bats_core/validate_team.js
 * =====================
 * Validador standalone de equipos Pokémon Showdown.
 * Lee un JSON por stdin, retorna un JSON por stdout.
 *
 * Stdin:  { "format": "gen9pinchesgueysleague", "team": "<paste>" }
 * Stdout: { "valid": true|false, "errors": ["..."] }
 *
 * No requiere que el servidor PS esté corriendo.
 * Requiere pokemon-showdown compilado (node build) como repo hermano:
 *   node bats_core/validate_team.js < input.json
 */

const path = require('path');

// Directorio raíz de pokemon-showdown (repo hermano de bats/, fuera de este repo).
// Se puede sobreescribir con BATS_PS_DIR.
const PS_DIR = process.env.BATS_PS_DIR || path.resolve(__dirname, '..', '..', 'pokemon-showdown');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
	try {
		const { format, team } = JSON.parse(input);

		const { Dex }           = require(path.join(PS_DIR, 'dist/sim/dex'));
		const { Teams }         = require(path.join(PS_DIR, 'dist/sim/teams'));
		const { TeamValidator } = require(path.join(PS_DIR, 'dist/sim/team-validator'));

		// Cargar formatos de config/formats.js (incluye el formato PGL personalizado)
		Dex.formats.load();

		const sets = Teams.import(team);
		if (!sets || sets.length === 0) {
			respond({ valid: false, errors: ['No se pudo parsear el equipo (paste vacío o inválido)'] });
			return;
		}

		const errors = TeamValidator.get(format).validateTeam(sets) ?? [];
		respond({ valid: errors.length === 0, errors });

	} catch (err) {
		respond({ valid: false, errors: [`Error interno del validador: ${err.message}`] });
	}
});

function respond(obj) {
	process.stdout.write(JSON.stringify(obj) + '\n');
}
