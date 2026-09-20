"""
bats_core/bot/sets.py
================
Pool de sets competitivos para el PGL-Bot — Torneo #02.

Condiciones del mes:
  C1: Tipo Hielo obligatorio
  C2: Mínimo 1 Pokémon Gen 5 (#494–649)
  C3: Mínimo 1 Pokémon Egg Group Dragón
  C4: Mínimo 1 Pokémon color principal Amarillo

Pools:
  RESTRICTED_POOL    — Legendarios restringidos (máx. 1)
  PSEUDO_POOL        — Pseudo-legendarios (máx. 1)
  ICE_OU_POOL        — Backup Ice-type si C1 no cubierto (10 opciones)
  GEN5_POOL          — Backup Gen 5 si C2 no cubierto (14 opciones)
  DRAGON_EGG_POOL    — Backup Egg Group Dragón si C3 no cubierto (12 opciones)
  YELLOW_POOL        — Backup color Amarillo si C4 no cubierto (13 opciones)
  OU_POOL            — Relleno estándar (23 opciones)

Cada entrada incluye:
  name        Nombre canónico PS (para normalizar contra bans)
  types       Tipos del Pokémon
  gen         Generación (basado en número de dex)
  color       Color PS (string en inglés)
  egg_groups  Grupos huevo
  item        Item equipado (para Item Clause)
  paste       Set completo en formato Showdown
"""

from typing import TypedDict


class PokemonSet(TypedDict):
    name:       str
    types:      list[str]
    gen:        int
    color:      str
    egg_groups: list[str]
    item:       str
    paste:      str


# ─── Legendarios Restringidos ─────────────────────────────────────────────────

RESTRICTED_POOL: list[PokemonSet] = [
    {
        "name": "Koraidon",
        "types": ["Fighting", "Dragon"],
        "gen": 9, "color": "Red", "egg_groups": ["Undiscovered"],
        "item": "Choice Band",
        "paste": """\
Koraidon @ Choice Band
Ability: Orichalcum Pulse
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Collision Course
- Close Combat
- Flare Blitz
- U-turn""",
    },
    {
        "name": "Miraidon",
        "types": ["Electric", "Dragon"],
        "gen": 9, "color": "Purple", "egg_groups": ["Undiscovered"],
        "item": "Choice Specs",
        "paste": """\
Miraidon @ Choice Specs
Ability: Hadron Engine
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Electro Drift
- Draco Meteor
- Dazzling Gleam
- Volt Switch""",
    },
    {
        "name": "Urshifu-Rapid-Strike",
        "types": ["Fighting", "Water"],
        "gen": 8, "color": "Blue", "egg_groups": ["Undiscovered"],
        "item": "Choice Band",
        "paste": """\
Urshifu-Rapid-Strike @ Choice Band
Ability: Unseen Fist
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Surging Strikes
- Close Combat
- Aqua Jet
- U-turn""",
    },
    {
        "name": "Zamazenta",
        "types": ["Fighting"],
        "gen": 8, "color": "Red", "egg_groups": ["Undiscovered"],
        "item": "Leftovers",
        "paste": """\
Zamazenta @ Leftovers
Ability: Dauntless Shield
Tera Type: Fighting
EVs: 252 HP / 4 Def / 252 Spe
Jolly Nature
- Iron Defense
- Body Press
- Crunch
- Substitute""",
    },
    {
        "name": "Ting-Lu",
        "types": ["Dark", "Ground"],
        "gen": 9, "color": "Brown", "egg_groups": ["Undiscovered"],
        "item": "Rocky Helmet",
        "paste": """\
Ting-Lu @ Rocky Helmet
Ability: Vessel of Ruin
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
- Earthquake
- Ruination
- Stealth Rock
- Whirlwind""",
    },
    {
        "name": "Chien-Pao",
        "types": ["Dark", "Ice"],
        "gen": 9, "color": "White", "egg_groups": ["Undiscovered"],
        "item": "Focus Sash",
        "paste": """\
Chien-Pao @ Focus Sash
Ability: Sword of Ruin
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Icicle Crash
- Crunch
- Sacred Sword
- Sucker Punch""",
    },
]


# ─── Pseudo-Legendarios ───────────────────────────────────────────────────────

PSEUDO_POOL: list[PokemonSet] = [
    {
        "name": "Garchomp",
        "types": ["Dragon", "Ground"],
        "gen": 4, "color": "Blue", "egg_groups": ["Monster", "Dragon"],
        "item": "Rocky Helmet",
        "paste": """\
Garchomp @ Rocky Helmet
Ability: Rough Skin
EVs: 252 HP / 164 Def / 92 Spe
Impish Nature
- Earthquake
- Stealth Rock
- Dragon Tail
- Stomping Tantrum""",
    },
    {
        "name": "Dragapult",
        "types": ["Dragon", "Ghost"],
        "gen": 8, "color": "Blue", "egg_groups": ["Dragon", "Amorphous"],
        "item": "Choice Specs",
        "paste": """\
Dragapult @ Choice Specs
Ability: Infiltrator
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Draco Meteor
- Shadow Ball
- Flamethrower
- U-turn""",
    },
    {
        "name": "Tyranitar",
        "types": ["Rock", "Dark"],
        "gen": 2, "color": "Green", "egg_groups": ["Monster"],
        "item": "Choice Band",
        "paste": """\
Tyranitar @ Choice Band
Ability: Sand Stream
EVs: 252 Atk / 4 SpD / 252 Spe
Adamant Nature
- Stone Edge
- Crunch
- Earthquake
- Ice Punch""",
    },
    {
        "name": "Hydreigon",
        "types": ["Dark", "Dragon"],
        "gen": 5, "color": "Blue", "egg_groups": ["Dragon"],
        "item": "Choice Scarf",
        "paste": """\
Hydreigon @ Choice Scarf
Ability: Levitate
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Draco Meteor
- Dark Pulse
- Flash Cannon
- U-turn""",
    },
    {
        "name": "Salamence",
        "types": ["Dragon", "Flying"],
        "gen": 3, "color": "Blue", "egg_groups": ["Dragon"],
        "item": "Life Orb",
        "paste": """\
Salamence @ Life Orb
Ability: Intimidate
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Draco Meteor
- Flamethrower
- Hyper Voice
- Dragon Pulse""",
    },
    {
        "name": "Baxcalibur",
        "types": ["Dragon", "Ice"],
        "gen": 9, "color": "Blue", "egg_groups": ["Dragon", "Mineral"],
        "item": "Loaded Dice",
        "paste": """\
Baxcalibur @ Loaded Dice
Ability: Thermal Exchange
Tera Type: Ground
EVs: 252 Atk / 4 SpD / 252 Spe
Adamant Nature
- Dragon Dance
- Icicle Spear
- Glaive Rush
- Earthquake""",
    },
    {
        # C2 (Gen5) + C3 (Dragon egg) + C4 (Yellow) — triple condición
        "name": "Haxorus",
        "types": ["Dragon"],
        "gen": 5, "color": "Yellow", "egg_groups": ["Monster", "Dragon"],
        "item": "Lum Berry",
        "paste": """\
Haxorus @ Lum Berry
Ability: Mold Breaker
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Dragon Dance
- Outrage
- Earthquake
- Iron Head""",
    },
]


# ─── Ice-type backup (C1) ─────────────────────────────────────────────────────

ICE_OU_POOL: list[PokemonSet] = [
    {
        "name": "Ninetales-Alola",
        "types": ["Ice", "Fairy"],
        "gen": 1, "color": "Blue", "egg_groups": ["Field"],
        "item": "Light Clay",
        "paste": """\
Ninetales-Alola @ Light Clay
Ability: Snow Warning
EVs: 244 HP / 92 SpD / 172 Spe
Timid Nature
IVs: 0 Atk
- Aurora Veil
- Moonblast
- Encore
- Freeze-Dry""",
    },
    {
        "name": "Weavile",
        "types": ["Dark", "Ice"],
        "gen": 4, "color": "Black", "egg_groups": ["Field"],
        "item": "Life Orb",
        "paste": """\
Weavile @ Life Orb
Ability: Pressure
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Triple Axel
- Knock Off
- Ice Shard
- Low Kick""",
    },
    {
        "name": "Mamoswine",
        "types": ["Ice", "Ground"],
        "gen": 4, "color": "Brown", "egg_groups": ["Field"],
        "item": "Assault Vest",
        "paste": """\
Mamoswine @ Assault Vest
Ability: Thick Fat
EVs: 252 HP / 252 Atk / 4 SpD
Adamant Nature
- Icicle Crash
- Earthquake
- Ice Shard
- Knock Off""",
    },
    {
        # C1 (Ice) + C2 (Gen 5)
        "name": "Cryogonal",
        "types": ["Ice"],
        "gen": 5, "color": "White", "egg_groups": ["Mineral"],
        "item": "Heavy-Duty Boots",
        "paste": """\
Cryogonal @ Heavy-Duty Boots
Ability: Levitate
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
IVs: 0 Atk
- Ice Beam
- Freeze-Dry
- Rapid Spin
- Recover""",
    },
    {
        # C1 (Ice) + C2 (Gen 5)
        "name": "Darmanitan-Galar",
        "types": ["Ice"],
        "gen": 5, "color": "White", "egg_groups": ["Field"],
        "item": "Choice Scarf",
        "paste": """\
Darmanitan-Galar @ Choice Scarf
Ability: Gorilla Tactics
EVs: 252 Atk / 4 Def / 252 Spe
Jolly Nature
- Icicle Crash
- Flare Blitz
- U-turn
- Earthquake""",
    },
    {
        # C1 (Ice) + C2 (Gen 5) — doble condición
        "name": "Beartic",
        "types": ["Ice"],
        "gen": 5, "color": "White", "egg_groups": ["Field"],
        "item": "Choice Band",
        "paste": """\
Beartic @ Choice Band
Ability: Slush Rush
EVs: 252 Atk / 4 SpD / 252 Spe
Adamant Nature
- Icicle Crash
- Close Combat
- Earthquake
- Superpower""",
    },
    {
        "name": "Aurorus",
        "types": ["Rock", "Ice"],
        "gen": 6, "color": "Blue", "egg_groups": ["Monster"],
        "item": "Choice Specs",
        "paste": """\
Aurorus @ Choice Specs
Ability: Refrigerate
EVs: 252 HP / 252 SpA / 4 SpD
Modest Nature
IVs: 0 Atk
- Hyper Voice
- Freeze-Dry
- Thunderbolt
- Earth Power""",
    },
    {
        "name": "Froslass",
        "types": ["Ice", "Ghost"],
        "gen": 4, "color": "White", "egg_groups": ["Mineral", "Fairy"],
        "item": "Spell Tag",
        "paste": """\
Froslass @ Spell Tag
Ability: Cursed Body
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Ice Beam
- Shadow Ball
- Spikes
- Destiny Bond""",
    },
    {
        "name": "Cetitan",
        "types": ["Ice"],
        "gen": 9, "color": "White", "egg_groups": ["Field"],
        "item": "Sitrus Berry",
        "paste": """\
Cetitan @ Sitrus Berry
Ability: Thick Fat
Tera Type: Ice
EVs: 252 HP / 252 Atk / 4 SpD
Adamant Nature
- Icicle Crash
- Heavy Slam
- Ice Shard
- Earthquake""",
    },
    {
        "name": "Walrein",
        "types": ["Ice", "Water"],
        "gen": 3, "color": "Blue", "egg_groups": ["Field", "Water 1"],
        "item": "Leftovers",
        "paste": """\
Walrein @ Leftovers
Ability: Thick Fat
EVs: 252 HP / 4 SpA / 252 SpD
Calm Nature
IVs: 0 Atk
- Ice Beam
- Surf
- Toxic
- Protect""",
    },
]


# ─── Gen 5 backup (C2) ───────────────────────────────────────────────────────

GEN5_POOL: list[PokemonSet] = [
    {
        # C2 (Gen 5) + C4 (Yellow)
        "name": "Galvantula",
        "types": ["Bug", "Electric"],
        "gen": 5, "color": "Yellow", "egg_groups": ["Bug"],
        "item": "Focus Sash",
        "paste": """\
Galvantula @ Focus Sash
Ability: Compound Eyes
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Thunder
- Bug Buzz
- Volt Switch
- Energy Ball""",
    },
    {
        "name": "Chandelure",
        "types": ["Fire", "Ghost"],
        "gen": 5, "color": "Black", "egg_groups": ["Amorphous"],
        "item": "Choice Scarf",
        "paste": """\
Chandelure @ Choice Scarf
Ability: Flash Fire
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Fire Blast
- Shadow Ball
- Energy Ball
- Trick""",
    },
    {
        "name": "Conkeldurr",
        "types": ["Fighting"],
        "gen": 5, "color": "Pink", "egg_groups": ["Human-Like"],
        "item": "Assault Vest",
        "paste": """\
Conkeldurr @ Assault Vest
Ability: Guts
EVs: 252 HP / 252 Atk / 4 SpD
Adamant Nature
- Drain Punch
- Mach Punch
- Knock Off
- Ice Punch""",
    },
    {
        "name": "Excadrill",
        "types": ["Ground", "Steel"],
        "gen": 5, "color": "Brown", "egg_groups": ["Field"],
        "item": "Air Balloon",
        "paste": """\
Excadrill @ Air Balloon
Ability: Mold Breaker
EVs: 252 Atk / 4 SpD / 252 Spe
Adamant Nature
- Earthquake
- Iron Head
- Rapid Spin
- Rock Slide""",
    },
    {
        "name": "Ferrothorn",
        "types": ["Grass", "Steel"],
        "gen": 5, "color": "Green", "egg_groups": ["Grass", "Monster"],
        "item": "Leftovers",
        "paste": """\
Ferrothorn @ Leftovers
Ability: Iron Barbs
EVs: 252 HP / 88 Def / 168 SpD
Relaxed Nature
IVs: 0 Spe
- Stealth Rock
- Leech Seed
- Power Whip
- Knock Off""",
    },
    {
        "name": "Krookodile",
        "types": ["Ground", "Dark"],
        "gen": 5, "color": "Red", "egg_groups": ["Field"],
        "item": "Black Glasses",
        "paste": """\
Krookodile @ Black Glasses
Ability: Moxie
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Earthquake
- Knock Off
- Stone Edge
- Crunch""",
    },
    {
        "name": "Bisharp",
        "types": ["Dark", "Steel"],
        "gen": 5, "color": "Black", "egg_groups": ["Human-Like"],
        "item": "Life Orb",
        "paste": """\
Bisharp @ Life Orb
Ability: Defiant
EVs: 252 Atk / 4 SpD / 252 Spe
Adamant Nature
- Sucker Punch
- Knock Off
- Iron Head
- Swords Dance""",
    },
    {
        # C2 (Gen 5) + C4 (Yellow) — doble condición
        "name": "Cofagrigus",
        "types": ["Ghost"],
        "gen": 5, "color": "Yellow", "egg_groups": ["Mineral"],
        "item": "Colbur Berry",
        "paste": """\
Cofagrigus @ Colbur Berry
Ability: Mummy
EVs: 252 HP / 4 SpA / 252 SpD
Calm Nature
IVs: 0 Atk
- Shadow Ball
- Will-O-Wisp
- Hex
- Protect""",
    },
    {
        "name": "Mienshao",
        "types": ["Fighting"],
        "gen": 5, "color": "Purple", "egg_groups": ["Field"],
        "item": "White Herb",
        "paste": """\
Mienshao @ White Herb
Ability: Reckless
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- High Jump Kick
- U-turn
- Knock Off
- Fake Out""",
    },
    {
        "name": "Reuniclus",
        "types": ["Psychic"],
        "gen": 5, "color": "Green", "egg_groups": ["Amorphous"],
        "item": "Weakness Policy",
        "paste": """\
Reuniclus @ Weakness Policy
Ability: Magic Guard
EVs: 252 HP / 252 SpA / 4 SpD
Modest Nature
IVs: 0 Atk
- Psychic
- Focus Blast
- Shadow Ball
- Recover""",
    },
    {
        "name": "Zoroark",
        "types": ["Dark", "Normal"],
        "gen": 5, "color": "Red", "egg_groups": ["Field"],
        "item": "Eject Button",
        "paste": """\
Zoroark @ Eject Button
Ability: Illusion
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Night Slash
- Low Kick
- Flamethrower
- Sucker Punch""",
    },
    {
        "name": "Amoonguss",
        "types": ["Grass", "Poison"],
        "gen": 5, "color": "Green", "egg_groups": ["Grass"],
        "item": "Black Sludge",
        "paste": """\
Amoonguss @ Black Sludge
Ability: Regenerator
EVs: 252 HP / 136 Def / 120 SpD
Bold Nature
IVs: 0 Atk
- Spore
- Giga Drain
- Clear Smog
- Synthesis""",
    },
    {
        "name": "Mandibuzz",
        "types": ["Dark", "Flying"],
        "gen": 5, "color": "Brown", "egg_groups": ["Flying"],
        "item": "Shed Shell",
        "paste": """\
Mandibuzz @ Shed Shell
Ability: Overcoat
EVs: 248 HP / 136 Def / 124 Spe
Impish Nature
IVs: 0 Atk
- Foul Play
- Roost
- Whirlwind
- Defog""",
    },
]


# ─── Dragon Egg Group backup (C3) ─────────────────────────────────────────────

DRAGON_EGG_POOL: list[PokemonSet] = [
    {
        "name": "Flygon",
        "types": ["Dragon", "Ground"],
        "gen": 3, "color": "Green", "egg_groups": ["Bug", "Dragon"],
        "item": "Life Orb",
        "paste": """\
Flygon @ Life Orb
Ability: Levitate
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Outrage
- Earthquake
- U-turn
- Stone Edge""",
    },
    {
        "name": "Noivern",
        "types": ["Dragon", "Flying"],
        "gen": 6, "color": "Black", "egg_groups": ["Dragon", "Flying"],
        "item": "Choice Specs",
        "paste": """\
Noivern @ Choice Specs
Ability: Infiltrator
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Draco Meteor
- Hurricane
- Flamethrower
- U-turn""",
    },
    {
        "name": "Turtonator",
        "types": ["Dragon", "Fire"],
        "gen": 7, "color": "Brown", "egg_groups": ["Monster", "Dragon"],
        "item": "Sitrus Berry",
        "paste": """\
Turtonator @ Sitrus Berry
Ability: Shell Armor
EVs: 252 HP / 4 SpA / 252 SpD
Modest Nature
IVs: 0 Atk
- Shell Smash
- Fire Blast
- Dragon Pulse
- Flash Cannon""",
    },
    {
        "name": "Dragonite",
        "types": ["Dragon", "Flying"],
        "gen": 1, "color": "Pink", "egg_groups": ["Water 1", "Dragon"],
        "item": "Heavy-Duty Boots",
        "paste": """\
Dragonite @ Heavy-Duty Boots
Ability: Multiscale
EVs: 252 Atk / 4 SpD / 252 Spe
Adamant Nature
- Dragon Dance
- Extreme Speed
- Outrage
- Fire Punch""",
    },
    {
        "name": "Goodra-Hisui",
        "types": ["Dragon", "Steel"],
        "gen": 6, "color": "Purple", "egg_groups": ["Dragon"],
        "item": "Assault Vest",
        "paste": """\
Goodra-Hisui @ Assault Vest
Ability: Thick Fat
EVs: 252 HP / 4 SpA / 252 SpD
Sassy Nature
IVs: 0 Spe
- Dragon Pulse
- Flash Cannon
- Fire Blast
- Earthquake""",
    },
    {
        "name": "Kommo-o",
        "types": ["Dragon", "Fighting"],
        "gen": 7, "color": "Blue", "egg_groups": ["Dragon"],
        "item": "Throat Spray",
        "paste": """\
Kommo-o @ Throat Spray
Ability: Soundproof
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Clangorous Soul
- Clanging Scales
- Flash Cannon
- Aura Sphere""",
    },
    {
        "name": "Dragalge",
        "types": ["Poison", "Dragon"],
        "gen": 6, "color": "Green", "egg_groups": ["Water 1", "Dragon"],
        "item": "Black Sludge",
        "paste": """\
Dragalge @ Black Sludge
Ability: Adaptability
EVs: 248 HP / 252 SpA / 8 Spe
Modest Nature
IVs: 0 Atk
- Draco Meteor
- Sludge Wave
- Fire Blast
- Toxic Spikes""",
    },
    {
        "name": "Altaria",
        "types": ["Dragon", "Flying"],
        "gen": 3, "color": "Blue", "egg_groups": ["Flying", "Dragon"],
        "item": "Leftovers",
        "paste": """\
Altaria @ Leftovers
Ability: Natural Cure
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
- Dragon Dance
- Body Slam
- Roost
- Earthquake""",
    },
    {
        "name": "Drampa",
        "types": ["Normal", "Dragon"],
        "gen": 7, "color": "White", "egg_groups": ["Monster", "Dragon"],
        "item": "Iapapa Berry",
        "paste": """\
Drampa @ Iapapa Berry
Ability: Berserk
EVs: 252 HP / 252 SpA / 4 SpD
Modest Nature
IVs: 0 Atk
- Hyper Voice
- Dragon Pulse
- Flamethrower
- Calm Mind""",
    },
    {
        "name": "Kingdra",
        "types": ["Water", "Dragon"],
        "gen": 2, "color": "Blue", "egg_groups": ["Water 1", "Dragon"],
        "item": "Lum Berry",
        "paste": """\
Kingdra @ Lum Berry
Ability: Swift Swim
EVs: 252 SpA / 4 SpD / 252 Spe
Modest Nature
IVs: 0 Atk
- Draco Meteor
- Surf
- Ice Beam
- Focus Energy""",
    },
    {
        "name": "Archaludon",
        "types": ["Steel", "Dragon"],
        "gen": 8, "color": "Blue", "egg_groups": ["Mineral", "Dragon"],
        "item": "Weakness Policy",
        "paste": """\
Archaludon @ Weakness Policy
Ability: Stamina
Tera Type: Steel
EVs: 252 HP / 4 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Flash Cannon
- Dragon Pulse
- Electro Shot
- Body Press""",
    },
]


# ─── Yellow backup (C4) ───────────────────────────────────────────────────────

YELLOW_POOL: list[PokemonSet] = [
    {
        # C4 (Yellow) + C2 (Gen 5)
        "name": "Galvantula",
        "types": ["Bug", "Electric"],
        "gen": 5, "color": "Yellow", "egg_groups": ["Bug"],
        "item": "Focus Sash",
        "paste": """\
Galvantula @ Focus Sash
Ability: Compound Eyes
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Thunder
- Bug Buzz
- Volt Switch
- Energy Ball""",
    },
    {
        "name": "Electivire",
        "types": ["Electric"],
        "gen": 4, "color": "Yellow", "egg_groups": ["Human-Like"],
        "item": "Expert Belt",
        "paste": """\
Electivire @ Expert Belt
Ability: Motor Drive
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Wild Charge
- Ice Punch
- Cross Chop
- Earthquake""",
    },
    {
        "name": "Jolteon",
        "types": ["Electric"],
        "gen": 1, "color": "Yellow", "egg_groups": ["Field"],
        "item": "Choice Specs",
        "paste": """\
Jolteon @ Choice Specs
Ability: Volt Absorb
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Thunderbolt
- Volt Switch
- Shadow Ball
- Hyper Voice""",
    },
    {
        "name": "Heliolisk",
        "types": ["Electric", "Normal"],
        "gen": 6, "color": "Yellow", "egg_groups": ["Monster", "Dragon"],
        "item": "Life Orb",
        "paste": """\
Heliolisk @ Life Orb
Ability: Dry Skin
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Thunderbolt
- Hyper Voice
- Surf
- Grass Knot""",
    },
    {
        # C4 (Yellow) — Paradox (no es Sub-Legendary)
        "name": "Raging Bolt",
        "types": ["Electric", "Dragon"],
        "gen": 9, "color": "Yellow", "egg_groups": ["Undiscovered"],
        "item": "Booster Energy",
        "paste": """\
Raging Bolt @ Booster Energy
Ability: Protosynthesis
Tera Type: Electric
EVs: 252 HP / 252 SpA / 4 SpD
Modest Nature
IVs: 20 Atk
- Thunderclap
- Draco Meteor
- Dragon Pulse
- Calm Mind""",
    },
    {
        "name": "Ampharos",
        "types": ["Electric"],
        "gen": 2, "color": "Yellow", "egg_groups": ["Monster", "Field"],
        "item": "Leftovers",
        "paste": """\
Ampharos @ Leftovers
Ability: Static
EVs: 252 HP / 4 SpA / 252 SpD
Calm Nature
IVs: 0 Atk
- Thunderbolt
- Volt Switch
- Focus Blast
- Heal Bell""",
    },
    {
        "name": "Boltund",
        "types": ["Electric"],
        "gen": 8, "color": "Yellow", "egg_groups": ["Field"],
        "item": "Choice Band",
        "paste": """\
Boltund @ Choice Band
Ability: Strong Jaw
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Wild Charge
- Play Rough
- Crunch
- Thunder Fang""",
    },
    {
        # C4 (Yellow) + C2 (Gen 5) — doble condición
        "name": "Cofagrigus",
        "types": ["Ghost"],
        "gen": 5, "color": "Yellow", "egg_groups": ["Mineral"],
        "item": "Colbur Berry",
        "paste": """\
Cofagrigus @ Colbur Berry
Ability: Mummy
EVs: 252 HP / 4 SpA / 252 SpD
Calm Nature
IVs: 0 Atk
- Shadow Ball
- Will-O-Wisp
- Hex
- Protect""",
    },
    {
        "name": "Raichu",
        "types": ["Electric"],
        "gen": 1, "color": "Yellow", "egg_groups": ["Field", "Fairy"],
        "item": "Sitrus Berry",
        "paste": """\
Raichu @ Sitrus Berry
Ability: Lightning Rod
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Thunderbolt
- Volt Switch
- Focus Blast
- Nasty Plot""",
    },
    {
        # C4 (Yellow) — bonus C3 (Dragon egg via Monster/Dragon? No — Amorphous)
        "name": "Mimikyu",
        "types": ["Ghost", "Fairy"],
        "gen": 7, "color": "Yellow", "egg_groups": ["Amorphous"],
        "item": "Lum Berry",
        "paste": """\
Mimikyu @ Lum Berry
Ability: Disguise
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Swords Dance
- Shadow Sneak
- Play Rough
- Shadow Claw""",
    },
]


# ─── OU estándar ──────────────────────────────────────────────────────────────

OU_POOL: list[PokemonSet] = [
    {
        # C4 (Yellow) — siempre útil si no está cubierto
        "name": "Gholdengo",
        "types": ["Steel", "Ghost"],
        "gen": 9, "color": "Yellow", "egg_groups": ["Mineral"],
        "item": "Choice Specs",
        "paste": """\
Gholdengo @ Choice Specs
Ability: Good as Gold
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Make It Rain
- Shadow Ball
- Dazzling Gleam
- Focus Blast""",
    },
    {
        "name": "Great Tusk",
        "types": ["Ground", "Fighting"],
        "gen": 9, "color": "Brown", "egg_groups": ["Undiscovered"],
        "item": "Booster Energy",
        "paste": """\
Great Tusk @ Booster Energy
Ability: Protosynthesis
Tera Type: Ground
EVs: 252 Atk / 4 Def / 252 Spe
Jolly Nature
- Earthquake
- Headlong Rush
- Ice Spinner
- Rapid Spin""",
    },
    {
        "name": "Kingambit",
        "types": ["Dark", "Steel"],
        "gen": 9, "color": "Black", "egg_groups": ["Human-Like"],
        "item": "Assault Vest",
        "paste": """\
Kingambit @ Assault Vest
Ability: Supreme Overlord
Tera Type: Dark
EVs: 252 HP / 252 Atk / 4 SpD
Adamant Nature
- Kowtow Cleave
- Sucker Punch
- Iron Head
- Brick Break""",
    },
    {
        "name": "Iron Valiant",
        "types": ["Fairy", "Fighting"],
        "gen": 9, "color": "Purple", "egg_groups": ["Undiscovered"],
        "item": "Life Orb",
        "paste": """\
Iron Valiant @ Life Orb
Ability: Quark Drive
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Moonblast
- Close Combat
- Thunderbolt
- Shadow Ball""",
    },
    {
        "name": "Skeledirge",
        "types": ["Fire", "Ghost"],
        "gen": 9, "color": "Red", "egg_groups": ["Monster", "Dragon"],
        "item": "Heavy-Duty Boots",
        "paste": """\
Skeledirge @ Heavy-Duty Boots
Ability: Unaware
EVs: 252 HP / 252 Def / 4 SpA
Bold Nature
IVs: 0 Atk
- Torch Song
- Shadow Ball
- Slack Off
- Will-O-Wisp""",
    },
    {
        "name": "Gliscor",
        "types": ["Ground", "Flying"],
        "gen": 4, "color": "Purple", "egg_groups": ["Bug"],
        "item": "Toxic Orb",
        "paste": """\
Gliscor @ Toxic Orb
Ability: Poison Heal
EVs: 252 HP / 184 Def / 72 Spe
Impish Nature
- Earthquake
- Knock Off
- Stealth Rock
- U-turn""",
    },
    {
        "name": "Clefable",
        "types": ["Normal"],
        "gen": 1, "color": "Pink", "egg_groups": ["Fairy"],
        "item": "Leftovers",
        "paste": """\
Clefable @ Leftovers
Ability: Magic Guard
EVs: 252 HP / 172 Def / 84 SpD
Calm Nature
IVs: 0 Atk
- Moonblast
- Wish
- Protect
- Stealth Rock""",
    },
    {
        "name": "Roaring Moon",
        "types": ["Dragon", "Dark"],
        "gen": 9, "color": "Blue", "egg_groups": ["Undiscovered"],
        "item": "Booster Energy",
        "paste": """\
Roaring Moon @ Booster Energy
Ability: Protosynthesis
Tera Type: Flying
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Dragon Dance
- Acrobatics
- Knock Off
- Earthquake""",
    },
    {
        "name": "Iron Moth",
        "types": ["Fire", "Poison"],
        "gen": 9, "color": "Red", "egg_groups": ["Undiscovered"],
        "item": "Booster Energy",
        "paste": """\
Iron Moth @ Booster Energy
Ability: Quark Drive
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Fiery Dance
- Sludge Wave
- Energy Ball
- Dazzling Gleam""",
    },
    {
        # C2 (Gen 5)
        "name": "Volcarona",
        "types": ["Bug", "Fire"],
        "gen": 5, "color": "Brown", "egg_groups": ["Bug"],
        "item": "Heavy-Duty Boots",
        "paste": """\
Volcarona @ Heavy-Duty Boots
Ability: Flame Body
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
IVs: 0 Atk
- Fire Blast
- Bug Buzz
- Quiver Dance
- Giga Drain""",
    },
    {
        "name": "Cinderace",
        "types": ["Fire"],
        "gen": 8, "color": "White", "egg_groups": ["Field", "Human-Like"],
        "item": "Choice Band",
        "paste": """\
Cinderace @ Choice Band
Ability: Libero
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Pyro Ball
- High Jump Kick
- U-turn
- Sucker Punch""",
    },
    {
        "name": "Meowscarada",
        "types": ["Grass", "Dark"],
        "gen": 9, "color": "Green", "egg_groups": ["Field"],
        "item": "Choice Scarf",
        "paste": """\
Meowscarada @ Choice Scarf
Ability: Protean
Tera Type: Grass
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Flower Trick
- Knock Off
- U-turn
- Play Rough""",
    },
    {
        "name": "Gouging Fire",
        "types": ["Fire", "Dragon"],
        "gen": 9, "color": "Red", "egg_groups": ["Undiscovered"],
        "item": "Booster Energy",
        "paste": """\
Gouging Fire @ Booster Energy
Ability: Protosynthesis
Tera Type: Fire
EVs: 252 HP / 4 Atk / 252 Spe
Jolly Nature
- Dragon Dance
- Flare Blitz
- Morning Sun
- Earthquake""",
    },
    {
        "name": "Iron Boulder",
        "types": ["Rock", "Psychic"],
        "gen": 9, "color": "Blue", "egg_groups": ["Undiscovered"],
        "item": "Booster Energy",
        "paste": """\
Iron Boulder @ Booster Energy
Ability: Quark Drive
Tera Type: Fighting
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Mighty Cleave
- Zen Headbutt
- Close Combat
- Swords Dance""",
    },
    {
        "name": "Ceruledge",
        "types": ["Fire", "Ghost"],
        "gen": 9, "color": "Blue", "egg_groups": ["Amorphous"],
        "item": "Weakness Policy",
        "paste": """\
Ceruledge @ Weakness Policy
Ability: Weak Armor
Tera Type: Fire
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Swords Dance
- Bitter Blade
- Shadow Sneak
- Poltergeist""",
    },
    {
        # C2 (Gen 5)
        "name": "Amoonguss",
        "types": ["Grass", "Poison"],
        "gen": 5, "color": "Green", "egg_groups": ["Grass"],
        "item": "Eject Button",
        "paste": """\
Amoonguss @ Eject Button
Ability: Regenerator
EVs: 252 HP / 136 Def / 120 SpD
Bold Nature
IVs: 0 Atk
- Spore
- Giga Drain
- Clear Smog
- Sludge Bomb""",
    },
    {
        "name": "Corviknight",
        "types": ["Flying", "Steel"],
        "gen": 8, "color": "Blue", "egg_groups": ["Flying"],
        "item": "Rocky Helmet",
        "paste": """\
Corviknight @ Rocky Helmet
Ability: Pressure
EVs: 252 HP / 4 Def / 252 SpD
Careful Nature
- Brave Bird
- Iron Head
- Defog
- Roost""",
    },
    {
        "name": "Toxapex",
        "types": ["Poison", "Water"],
        "gen": 7, "color": "Purple", "egg_groups": ["Water 1"],
        "item": "Poison Barb",
        "paste": """\
Toxapex @ Poison Barb
Ability: Regenerator
EVs: 252 HP / 252 Def / 4 SpD
Bold Nature
IVs: 0 Atk
- Scald
- Toxic
- Recover
- Haze""",
    },
    {
        "name": "Slowking",
        "types": ["Water", "Psychic"],
        "gen": 1, "color": "Pink", "egg_groups": ["Monster", "Water 1"],
        "item": "Assault Vest",
        "paste": """\
Slowking @ Assault Vest
Ability: Regenerator
EVs: 252 HP / 252 SpA / 4 SpD
Modest Nature
IVs: 0 Atk
- Scald
- Psychic
- Future Sight
- Fire Blast""",
    },
    {
        "name": "Rotom-Wash",
        "types": ["Electric", "Water"],
        "gen": 4, "color": "Red", "egg_groups": ["Amorphous"],
        "item": "Leftovers",
        "paste": """\
Rotom-Wash @ Leftovers
Ability: Levitate
EVs: 252 HP / 252 Def / 4 SpD
Bold Nature
IVs: 0 Atk
- Volt Switch
- Hydro Pump
- Will-O-Wisp
- Pain Split""",
    },
    {
        "name": "Scizor",
        "types": ["Bug", "Steel"],
        "gen": 2, "color": "Red", "egg_groups": ["Bug"],
        "item": "Choice Band",
        "paste": """\
Scizor @ Choice Band
Ability: Technician
EVs: 248 HP / 252 Atk / 8 SpD
Adamant Nature
- Bullet Punch
- U-turn
- Superpower
- Knock Off""",
    },
    {
        # C4 (Yellow)
        "name": "Mimikyu",
        "types": ["Ghost", "Fairy"],
        "gen": 7, "color": "Yellow", "egg_groups": ["Amorphous"],
        "item": "Lum Berry",
        "paste": """\
Mimikyu @ Lum Berry
Ability: Disguise
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Swords Dance
- Shadow Sneak
- Play Rough
- Shadow Claw""",
    },
    {
        # Paradox (Future) — Punching Glove boost a Drain Punch / Ice Punch / Thunder Punch
        "name": "Iron Hands",
        "types": ["Fighting", "Electric"],
        "gen": 9, "color": "Gray", "egg_groups": ["Undiscovered"],
        "item": "Punching Glove",
        "paste": """\
Iron Hands @ Punching Glove
Ability: Quark Drive
EVs: 252 HP / 252 Atk / 4 SpD
Adamant Nature
- Drain Punch
- Wild Charge
- Ice Punch
- Thunder Punch""",
    },
    {
        "name": "Pelipper",
        "types": ["Water", "Flying"],
        "gen": 3, "color": "White", "egg_groups": ["Water 1", "Flying"],
        "item": "Damp Rock",
        "paste": """\
Pelipper @ Damp Rock
Ability: Drizzle
EVs: 248 HP / 8 Def / 252 SpA
Modest Nature
IVs: 0 Atk
- Scald
- Hurricane
- U-turn
- Roost""",
    },
]
