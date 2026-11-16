import { replay } from '../engine/replay.js';
import { ENGINE_VERSION } from '../engine/sim.js';
import { json } from './errors.js';

/**
 * Batalla sintética de 10 turnos (2 contra 2, semilla fija). Va embebida en el código porque
 * `tests/` no se despliega: sirve para comprobar en el entorno real que el simulador carga,
 * es determinista y cuánto tarda una rejugada.
 */
const BATALLA = {
  inputLog: [
    '>start {"formatid":"gen9nationaldexag@@@Standard NatDex,-Baton Pass,Limit One Restricted,*Sub-Legendary,*Restricted Legendary,*Mythical,Item Clause = 1","seed":"sodium,00000000000000000000000000000001"}',
    '>player p1 {"name":"uno","team":"Garchomp||Leftovers|RoughSkin|Earthquake|Hardy||||||]Gyarados||SitrusBerry|Intimidate|Waterfall|Hardy||||||"}',
    '>player p2 {"name":"dos","team":"Tyranitar||Leftovers|SandStream|Crunch|Hardy||||||]Rotom-Wash||SitrusBerry|Levitate|HydroPump|Hardy||||||"}',
    '>p1 team 1, 2',
    '>p2 team 1, 2',
    '>p1 move earthquake',
    '>p2 move crunch',
    '>p1 move earthquake',
    '>p2 move crunch',
    '>p2 switch 2',
    '>p1 move earthquake',
    '>p2 move hydropump',
    '>p1 move earthquake',
    '>p2 move hydropump',
    '>p1 switch 2',
    ...Array.from({ length: 6 }, () => ['>p1 move waterfall', '>p2 move hydropump']).flat(),
  ],
  winner: 'uno',
  turns: 10,
};

export function checkEngine(): { ok: boolean; replay_ms: number } {
  const inicio = performance.now();
  const battle = replay(BATALLA.inputLog, () => {});
  const replay_ms = Math.round((performance.now() - inicio) * 100) / 100;
  const ok = battle.ended && battle.winner === BATALLA.winner && battle.turn === BATALLA.turns;
  return { ok, replay_ms };
}

export function health(): Response {
  const { ok, replay_ms } = checkEngine();
  return json({ ok, engine: ENGINE_VERSION, node: process.version, replay_ms }, ok ? 200 : 500);
}
