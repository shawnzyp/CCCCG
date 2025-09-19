/* =========================================================================
   SHARED MINIMAL RUNTIME
   - Optional Firebase RTDB for shared deck + notices
   - LocalStorage fallback for solo/offline testing
   ========================================================================= */
window.SOMF_MIN = window.SOMF_MIN || {};

function initSomf(){
  const $ = s=>document.querySelector(s);
  const $$ = s=>Array.from(document.querySelectorAll(s));

  // Public hook for your app:
  window.SOMF_MIN = {
    setFirebase: (db)=> { window._somf_db = db || null; },
    setCampaignId: (id)=> { window._somf_cid = id || 'ccampaign-001'; }
  };

  const OLD_PLATES = [
    {id:'VAULT',name:'The Vault',visual:'Space folds into a recursion cell.',player:[
      'You vanish from the scene.',
      'An adjacent ally can pull you back.',
      'Return battered when the scene ends.'
    ],dm:[
      'Timing: Immediate • Duration: Scene',
      'Effect: Drawer phases out and cannot act or be targeted.',
      'Freeing: Adjacent ally may spend Reaction (no roll) to pull them back immediately.',
      'Fail-safe: If not freed by scene end, drawer returns at 1 HP and 0 SP.'
    ]},
    {id:'ECHO',name:'The Echo',visual:'Time ripples and rewinds.',player:[
      'Once today, redo a d20 affecting you.'
    ],dm:[
      'Timing: Banked (use once within the campaign day)',
      'Effect: Cancel and reroll any one d20 you just made or that targets you.',
      'Resolution: Use the new result. Free.'
    ]},
    {id:'JUDGE',name:'The Judge',visual:'Alignment scales shimmer.',player:[
      'Shift one step on an alignment axis.',
      'Advantage on one downtime check this session.'
    ],dm:[
      'Timing: Immediate • Duration: Session',
      'Effect: Shift one step on Light/Shadow or Law/Chaos axis.',
      'Benefit: Gain advantage on one Downtime check of your choice this session.'
    ]},
    {id:'COMET',name:'The Comet',visual:'Fiery streak heralds your turn.',player:[
      'Next combat, your first attack, save, and skill check each get a boost.'
    ],dm:[
      'Timing: Your next combat, on your turn 1',
      'Effect: Three free +1d4 Boost Rolls applied this turn only in order:',
      '1) +1d4 to first attack roll, 2) +1d4 to first save, 3) +1d4 to first skill check.'
    ]},
    {id:'CONTRACT',name:'The Contract',visual:'Greyline sigil burns.',player:[
      'A deadly assassin will strike within three scenes.',
      'Defeating it grants extra stamina for this session.'
    ],dm:[
      'Timing: A Greyline assassin will strike within 3 scenes',
      'Effect: Spawn Enemy NPC: "Null Hound" prioritizing the drawer.',
      'Reward: If defeated, drawer gains +1 SP max for the rest of this session.'
    ]},
    {id:'PEACEKEEPER',name:'The Peacekeeper',visual:'PFV badge glows.',player:[
      'Seraph Quinn joins you for one mission chain.'
    ],dm:[
      'Timing: Immediate or at start of next mission chain',
      'Effect: Spawn Ally NPC "Seraph Quinn" serving for one mission (one chain of scenes).',
      'Resolution: Ally departs after mission unless story recruits them.'
    ]},
    {id:'WRAITH',name:'The Wraith',visual:'Psionic specter manifests.',player:[
      'A psionic wraith stalks your next combat.',
      'Defeating it grants each ally a boost.'
    ],dm:[
      'Timing: Add to your next combat',
      'Effect: Spawn Enemy NPC "Herald of Silence" fixated on the drawer.',
      'On defeat: Each ally immediately gains one free +1d4 Boost Roll in that combat.'
    ]},
    {id:'KEY',name:'The Key',visual:'Shard reshapes into a lockpick.',player:[
      'Gain a quantum lockpick that slips one barrier per scene.'
    ],dm:[
      'Item: Quantum Lockpick (Unique Utility, Uncommon)',
      'Use: 1/scene, bonus action, spend 1 SP and make INT save DC 13 to bypass one lock/field you can touch.',
      'Success: You and one ally may pass through that barrier this round.',
      'Failure: No effect; SP still spent.'
    ]},
    {id:'THRONE',name:'The Throne',visual:'Command beacon descends.',player:[
      'Gain a command beacon to issue a powerful order at combat start.'
    ],dm:[
      'Item: Command Beacon (Unique Utility, consumable; 1 use)',
      'Activation: Beginning of combat (Round 1) after initiative, before first turn; free to activate.',
      'Choose one order for entire combat: Shield Wall (+3 TC to allies within 15 ft),',
      'Prime Strike (each ally gains one free +1d4 Boost Roll), or Tactical Recon (learn one enemy weakness; first attack each ally makes vs that enemy gains +1d4).'
    ]},
    {id:'CRASH',name:'The Crash',visual:'Gear sparks and fails.',player:[
      'One equipped item is disabled for this session.'
    ],dm:[
      'Timing: Immediate • Duration: Session',
      'Effect: Choose one equipped item (armor, shield, or utility); it is disabled for the rest of this session.',
      'Repair: Restore later with Train or Tinker downtime.'
    ]},
    {id:'CHRONICLE',name:'The Chronicle',visual:'Future scenes unfold.',player:[
      'Learn a weakness of the next boss and gain a research edge.'
    ],dm:[
      'Timing: Immediate',
      'Effect: Immediately learn one mechanical weakness of the next boss you will face.',
      'Bonus: Your next Research downtime on that threat has advantage and grants a tactical detail you can invoke in play.'
    ]},
    {id:'SUNSHARD',name:'The Sunshard',visual:'Solar badge radiates.',player:[
      'Gain a Solaris Badge that heightens senses and can bolster nearby allies.'
    ],dm:[
      'Item: Solaris Badge (Unique Utility, Rare)',
      'Passive: +1 Passive Perception while worn.',
      'Active: 1/scene, bonus action, you and allies within 10 ft gain +1 TC until start of your next turn (no SP).'
    ]},
    {id:'MOONSHARD',name:'The Moonshard',visual:'Lunar mote pulses.',player:[
      'Hold two free boost rolls; use one in each of your next two encounters.'
    ],dm:[
      'Timing: Banked',
      'Effect: Gain two free +1d4 Boost Rolls (no SP).',
      'Restriction: Must spend one in each of your next two encounters or they expire.'
    ]},
    {id:'STARSHARD',name:'The Starshard',visual:'Starlight mends wounds.',player:[
      'For three turns, end-of-turn energy heals or restores stamina to you or an ally.'
    ],dm:[
      'Timing: This combat • Duration: Your next 3 turns',
      'Effect: At end of each of your next three turns, choose you or an ally within 30 ft to regain 1d6 HP or 1d6 SP.'
    ]},
    {id:'SCRAMBLER',name:'The Scrambler',visual:'Inventory flickers away.',player:[
      'Your consumables fizzle out.'
    ],dm:[
      'Timing: Immediate',
      'Effect: All non-legendary consumables and throwables are treated as expended.',
      'Resolution: Mark expended; reacquire later.'
    ]},
    {id:'UPRISING',name:'The Uprising',visual:'Faction banners clash.',player:[
      'Faction reputations shift against each other.'
    ],dm:[
      'Timing: Immediate',
      'Effect: Choose a faction (e.g., O.M.N.I., PFV, Conclave, Greyline). Reduce your Reputation with it by one step; increase the opposed faction by one step.',
      'Resolution: Update faction reputation boxes now.'
    ]},
    {id:'GORGON_CODE',name:'The Gorgon Code',visual:'Digital gaze locks on.',player:[
      'Enemies hit you more easily this combat, but you can spend stamina to negate it.'
    ],dm:[
      'Timing: This combat • Duration: Combat',
      'Effect: Attacks against you have +1 to hit this combat.',
      'Reaction: Spend 1 SP once/round to cancel this +1 on a single attack that targets you.'
    ]},
    {id:'GLITCH',name:'The Glitch',visual:'Memory fragments scatter.',player:[
      'Your intellect is dulled until rested or researched away.'
    ],dm:[
      'Timing: Immediate • Duration: Until long rest or cleared',
      'Effect: –1 to INT checks and INT saves.',
      'Clear early: Succeed a Research downtime check DC 13 to remove the penalty.'
    ]},
    {id:'PRANK',name:'The Prank',visual:'Shard flashes with mischief.',player:[
      'Random boon: either a free Signature Move or extra damage next fight.'
    ],dm:[
      'Timing: Immediate',
      'Effect: Roll 1d2 — 1: Gain one free use of your Signature Move this session. 2: Gain +1d6 bonus damage on your first hit next combat.'
    ]},
    {id:'CATALYST',name:'The Catalyst',visual:'Three shard batteries appear.',player:[
      'Gain three batteries that instantly restore stamina.'
    ],dm:[
      'Timing: Immediate',
      'Items: Shard Battery ×3 (consumable, Common)',
      'Use: Bonus action to gain +2 SP immediately. Consumed on use.'
    ]},
    {id:'WANDERER',name:'The Wanderer',visual:'Power shifts unpredictably.',player:[
      'This combat, retag one of your powers.'
    ],dm:[
      'Timing: This combat • Duration: Combat',
      'Effect: Choose one of your powers; for this combat only, you may change its Effect Tag to any one legal tag without changing SP cost. Declare new tag when first used; revert afterward.'
    ]},
    {id:'VOID',name:'The Void',visual:'Stamina well runs dry.',player:[
      'Next turn your stamina doesn’t refresh, then Fate grants a boost.'
    ],dm:[
      'Timing: Start of your next turn',
      'Effect: Your SP does not refresh for 1 round (retain current SP). After that round ends, gain one free +1d4 Boost Roll.'
    ]},
  ];

  const SOMF_DECK = {
    "schema_version": "2.0",
    "notes": {
      "SP": "Stamina Points; refresh to full at the start of each combat round.",
      "BoostRoll": "Add +1d4 to a roll. Normally costs 1 SP unless marked free.",
      "TC": "Target Class (defense).",
      "XP_unit": "xp",
      "Money_unit": "cr",
      "Ability_caps": "Permanent increases cannot push a base ability score above 20; temporary effects can exceed."
    },

    "items": {
      "CMD_BEACON": {
        "id": "CMD_BEACON",
        "name": "Command Beacon",
        "rarity": "Unique",
        "slot": "Utility",
        "type": "consumable",
        "uses": 1,
        "activation": {
          "when": "combat_round1_start",
          "cost_sp": 0,
          "action": "free",
          "can_activate_if_downed": true
        },
        "orders": {
          "A_SHIELD_WALL": {
            "name": "Shield Wall",
            "duration": "combat",
            "aura_center": "item_holder",
            "radius_ft": 15,
            "effects": [
              { "target": "allies_in_aura", "type": "tc_bonus", "value": 3, "stacks": true }
            ],
            "persists_if_holder_unconscious": true,
            "moves_with_holder": true
          },
          "B_PRIME_STRIKE": {
            "name": "Prime Strike",
            "duration": "combat",
            "effects": [
              { "target": "each_ally", "type": "free_boost_roll", "value": "1d4", "count": 1 }
            ]
          },
          "C_TACTICAL_RECON": {
            "name": "Tactical Recon",
            "duration": "combat",
            "effects": [
              { "target": "gm", "type": "declare_mechanical_weakness", "specific": true },
              { "target": "each_ally", "type": "free_boost_roll_first_attack_vs_declared_enemy", "value": "1d4" }
            ]
          }
        }
      },

      "PRISM_EDGE": {
        "id": "PRISM_EDGE",
        "name": "Prism Edge",
        "rarity": "Legendary",
        "slot": "Weapon",
        "type": "melee",
        "requirements": { "dex_or_int_mod_at_least": 2 },
        "attack_profile": { "to_hit_mod_from_ability": "DEX", "damage": "2d10 radiant" },
        "powers": [
          {
            "name": "Starlight Decree",
            "cost_sp": 3,
            "range": "melee",
            "effect": "On hit, add +1d10 radiant and target makes WIS save DC 14 or Stunned 1 round"
          }
        ]
      },

      "ASCENDANT_HALO": {
        "id": "ASCENDANT_HALO",
        "name": "Ascendant Halo",
        "rarity": "Legendary",
        "slot": "Utility",
        "type": "reusable",
        "active": {
          "uses": "1_per_combat",
          "activation": { "when": "your_turn", "action": "bonus_action", "cost_sp": 0 },
          "duration": "3_rounds",
          "aura": { "radius_ft": 10 },
          "effects": [
            { "target": "allies_in_aura", "type": "free_boost_roll_first_roll_each_turn", "value": "1d4" }
          ]
        }
      },

      "SOLARIS_DIADEM": {
        "id": "SOLARIS_DIADEM",
        "name": "Solaris Diadem",
        "rarity": "Legendary",
        "slot": "Utility",
        "type": "reusable",
        "passive": [
          { "type": "passive_perception_bonus", "value": 2 }
        ],
        "active": {
          "uses": "1_per_scene",
          "activation": { "when": "your_turn", "action": "bonus_action", "cost_sp": 0 },
          "duration": "until_start_of_your_next_turn",
          "aura": { "radius_ft": 15 },
          "effects": [
            { "target": "you_and_allies_in_aura", "type": "tc_bonus", "value": 2 }
          ]
        }
      },

      "COMET_SPURS": {
        "id": "COMET_SPURS",
        "name": "Comet Spurs",
        "rarity": "Rare",
        "slot": "Utility",
        "type": "reusable",
        "passive": [{ "type": "speed_bonus_ft", "value": 10 }],
        "active": {
          "uses": "1_per_combat",
          "activation": { "when": "your_turn", "action": "bonus_action", "cost_sp": 1 },
          "effects": [
            { "target": "self", "type": "free_boost_roll", "value": "1d4" },
            { "target": "self", "type": "dash_no_reaction_attacks_this_turn" }
          ]
        }
      },

      "Q_LOCKPICK": {
        "id": "Q_LOCKPICK",
        "name": "Quantum Lockpick",
        "rarity": "Uncommon",
        "slot": "Utility",
        "type": "reusable",
        "uses": "1_per_scene",
        "activation": { "when": "your_turn", "action": "bonus_action", "cost_sp": 1 },
        "effect": {
          "test": { "type": "save", "ability": "INT", "dc": 13 },
          "on_success": "Bypass a touched lock/field; you and one ally may pass this round.",
          "on_failure": "No effect; SP spent."
        }
      },

      "SOLARIS_BADGE": {
        "id": "SOLARIS_BADGE",
        "name": "Solaris Badge",
        "rarity": "Rare",
        "slot": "Utility",
        "type": "reusable",
        "passive": [{ "type": "passive_perception_bonus", "value": 1 }],
        "active": {
          "uses": "1_per_scene",
          "activation": { "when": "your_turn", "action": "bonus_action", "cost_sp": 0 },
          "aura": { "radius_ft": 10 },
          "effects": [{ "target": "you_and_allies_in_aura", "type": "tc_bonus", "value": 1, "duration": "until_start_of_your_next_turn" }]
        }
      },

      "SHARD_BATTERY": {
        "id": "SHARD_BATTERY",
        "name": "Shard Battery",
        "rarity": "Common",
        "slot": "Consumable",
        "type": "consumable",
        "activation": { "when": "your_turn", "action": "bonus_action", "cost_sp": 0 },
        "effect": [{ "target": "self", "type": "gain_sp", "value": 2 }]
      }
    },

    "npcs": {
      "ALLY_KNIGHT_COMMANDER_AERIN": {
        "id": "ALLY_KNIGHT_COMMANDER_AERIN",
        "name": "Knight-Commander Aerin Valis",
        "created_by_shard": "LEGEND_KNIGHT_COMMANDER",
        "role": "Ally",
        "affiliation": "PFV",
        "loyal_to": "drawer",
        "tier": 3,
        "classification": "Enhanced Human",
        "power_style": "Physical Powerhouse",
        "speed_ft": 30,
        "hp": 50,
        "sp": 7,
        "tc_base": 14,
        "tc_notes": "Base 10 + DEX 1 + Tectonic Armor Rig +3 = 14. Immune to knockback. +3 TC vs charge attacks from G-Force Displacer (situational).",
        "abilities": { "STR": 16, "DEX": 12, "CON": 14, "INT": 12, "WIS": 12, "CHA": 14 },
        "saves": { "STR": 3, "DEX": 1, "CON": 2, "INT": 1, "WIS": 1, "CHA": 2 },
        "skills": { "Athletics": 5, "Intimidation": 4, "Perception": 3 },
        "gear": {
          "armor": { "name": "Tectonic Armor Rig", "effects": ["+3 TC", "Immune to knockback"] },
          "shield": { "name": "G-Force Displacer", "effects": ["+3 TC vs charge attacks (1 round)"] },
          "utility": { "name": "Seismic Stabilizers", "effects": ["On melee hit: ground shock; target DEX save DC 15 or Prone"] }
        },
        "weapons": [
          { "name": "Mag-Hammer", "range": "melee", "to_hit": "+3", "damage": "2d8 bludgeoning" }
        ],
        "powers": [
          { "name": "Hammer Verdict", "cost_sp": 2, "range": "melee", "effect": "2d8 bludgeoning; target DEX save DC 13 or Prone (1 round)" },
          { "name": "Aegis Intercept", "cost_sp": 0, "timing": "reaction_once_per_combat", "effect": "Halve damage of one attack vs you or adjacent ally" },
          { "name": "Rift Catch", "cost_sp": 3, "range": "10 ft", "effect": "Redirect a hit from ally to self; reduce damage by 5" }
        ],
        "features": [
          "Loyal to the drawer (permanent unless slain).",
          "If Aerin would break, may fight to 0 HP once per session instead."
        ]
      },
      "ALLY_ECHO_OPERATIVE_ZERO": {
        "id": "ALLY_ECHO_OPERATIVE_ZERO",
        "name": "Echo Operative Z3R0",
        "created_by_shard": "LEGEND_ECHO_ZERO",
        "role": "Ally",
        "affiliation": "Echo Network",
        "loyal_to": "drawer",
        "tier": 3,
        "classification": "Enhanced Human",
        "power_style": "Telekinetic/Psychic",
        "speed_ft": 30,
        "hp": 49,
        "sp": 6,
        "tc_base": 16,
        "tc_notes": "Base 10 + DEX 3 + Thoughtweave Lining +3 = 16. +2 TC vs mental effects (Mind Ward Halo). Telekinetic Aegis: +2 TC for 1 round (1 SP).",
        "abilities": { "STR": 10, "DEX": 16, "CON": 12, "INT": 14, "WIS": 14, "CHA": 12 },
        "saves": { "STR": 0, "DEX": 3, "CON": 1, "INT": 2, "WIS": 2, "CHA": 1 },
        "skills": { "Stealth": 5, "Perception": 4, "Insight": 4, "Technology": 4 },
        "gear": {
          "armor": { "name": "Thoughtweave Lining", "effects": ["+3 TC", "+1 to resist psychic"] },
          "shield": { "name": "Mind Ward Halo", "effects": ["+2 TC vs mental effects"] },
          "utility": { "name": "Telekinetic Aegis", "effects": ["Spend 1 SP for +2 TC for 1 round"] }
        },
        "weapons": [
          { "name": "TK Darts", "range": "ranged", "to_hit": "+3", "damage": "1d10 psychic" }
        ],
        "powers": [
          { "name": "Mind Spike", "cost_sp": 2, "range": "60 ft", "effect": "2d6 psychic; WIS save DC 14 or Stunned (1 round)" },
          { "name": "Kinetic Shove", "cost_sp": 2, "range": "60 ft", "effect": "Push 15 ft; STR or DEX save DC 13 resists" },
          { "name": "Veil Step", "cost_sp": 1, "range": "self", "effect": "Teleport 10 ft; advantage on next attack this turn" }
        ],
        "features": [
          "Psi-link with the drawer: once per combat the drawer may reroll a failed save."
        ]
      },
      "ENEMY_ARCHNEMESIS_NYX": {
        "id": "ENEMY_ARCHNEMESIS_NYX",
        "name": "Razor Nyx",
        "created_by_shard": "LEGEND_NEMESIS_NYX",
        "role": "Enemy",
        "affiliation": "Greyline",
        "archenemy_of": "drawer",
        "tier": 3,
        "classification": "Enhanced Human",
        "power_style": "Speedster",
        "speed_ft": 40,
        "hp": 49,
        "sp": 6,
        "tc_base": 14,
        "tc_notes": "Base 10 + DEX 4 = 14. +3 TC if moved ≥20 ft (Glide Suit), +2 TC if moved ≥10 ft (Momentum Redirector), +1 TC passive (Stutter-Blink Harness) — up to TC 20 with full movement.",
        "abilities": { "STR": 12, "DEX": 18, "CON": 12, "INT": 12, "WIS": 12, "CHA": 12 },
        "saves": { "STR": 1, "DEX": 4, "CON": 1, "INT": 1, "WIS": 1, "CHA": 1 },
        "skills": { "Stealth": 6, "Acrobatics": 7, "Perception": 3, "Deception": 3 },
        "gear": {
          "armor": { "name": "Kinetic Glide Suit", "effects": ["+3 TC if moved ≥20 ft this round"] },
          "shield": { "name": "Momentum Redirector", "effects": ["+2 TC if moved ≥10 ft this round"] },
          "utility": { "name": "Stutter-Blink Harness", "effects": ["+1 TC passive", "Reaction: 5-ft teleport once/round when targeted"] }
        },
        "weapons": [
          { "name": "Mono-Knife", "range": "melee", "to_hit": "+4", "damage": "1d8+4 slashing" }
        ],
        "powers": [
          { "name": "Throat of Silence", "cost_sp": 2, "range": "melee", "effect": "2d6 slashing; CON save DC 14 or Weaken (–2 attack) 1 round" },
          { "name": "Mirrorstep Assault", "cost_sp": 1, "range": "self", "effect": "Move 20+ ft; advantage on next two attacks this turn" },
          { "name": "Temporal Slip", "cost_sp": 3, "timing": "reaction", "trigger": "Targeted by an attack", "effect": "Teleport 5 ft; attacker rerolls to hit" }
        ],
        "features": [
          "Archenemy of the drawer.",
          "If reduced to 0 HP and not slain, escapes and returns later with +1 to all saves and elite tactics."
        ]
      },
      "ENEMY_ARCHNEMESIS_SILAS": {
        "id": "ENEMY_ARCHNEMESIS_SILAS",
        "name": "Inquisitor Silas Vane",
        "created_by_shard": "LEGEND_INQUISITOR_SILAS",
        "role": "Enemy",
        "affiliation": "Conclave",
        "archenemy_of": "drawer",
        "tier": 3,
        "classification": "Enhanced Human",
        "power_style": "Energy Manipulator",
        "speed_ft": 30,
        "hp": 49,
        "sp": 6,
        "tc_base": 12,
        "tc_notes": "Base 10 + DEX 2 = 12. +2 TC vs energy (Light Prism Carapace). Phase Dome Generator: +2 TC aura to adjacent allies for 1 round (1 SP).",
        "abilities": { "STR": 12, "DEX": 14, "CON": 12, "INT": 14, "WIS": 16, "CHA": 14 },
        "saves": { "STR": 1, "DEX": 2, "CON": 1, "INT": 2, "WIS": 3, "CHA": 2 },
        "skills": { "Insight": 5, "Persuasion": 4, "Perception": 4, "Technology": 4 },
        "gear": {
          "armor": { "name": "Light Prism Carapace", "effects": ["+2 TC vs energy attacks"] },
          "shield": { "name": "Phase Dome Generator", "effects": ["1 SP: +2 TC to adjacent allies for 1 round"] },
          "utility": { "name": "Charge Sink Filament", "effects": ["When hit by energy: gain 1 SP (once/round)"] }
        },
        "weapons": [
          { "name": "Officer’s Prism Edge", "range": "melee", "to_hit": "+2", "damage": "2d10 radiant" }
        ],
        "powers": [
          { "name": "Starlight Decree", "cost_sp": 3, "range": "melee", "effect": "On hit add +1d10 radiant; WIS save DC 15 or Stunned 1 round" },
          { "name": "Accession Step", "cost_sp": 2, "range": "self", "effect": "Teleport 10 ft; +2 TC until start of next turn" },
          { "name": "Dazzling Edict", "cost_sp": 2, "range": "15-ft cone", "effect": "2d6 radiant; CON save DC 14 or Blinded 1 round" }
        ],
        "features": [
          "Archenemy of the drawer.",
          "If defeated and not slain, triggers political reprisals: drawer loses 1 step Reputation with Conclave and Silas returns later with a counter-relic."
        ]
      },
      "HERALD_OF_SILENCE": {
        "id": "HERALD_OF_SILENCE",
        "name": "Herald of Silence",
        "created_by_shard": "SKULL",
        "role": "Enemy",
        "affiliation": "Morvox",
        "tier": 2,
        "classification": "Mystical Being",
        "power_style": "Telekinetic/Psychic",
        "speed_ft": 30,
        "movement_modes": ["hover"],
        "hp": 56,
        "sp": 7,
        "tc_base": 15,
        "tc_notes": "Base 10 + DEX 2 + Thoughtweave Lining +3 = 15. +2 TC vs mental (Mind Ward Halo). Telekinetic Aegis: +2 TC for 1 round (1 SP).",
        "abilities": { "STR": 8, "DEX": 14, "CON": 14, "INT": 14, "WIS": 14, "CHA": 12 },
        "saves": { "STR": -1, "DEX": 2, "CON": 2, "INT": 2, "WIS": 2, "CHA": 1 },
        "skills": { "Perception": 4, "Insight": 4 },
        "gear": {
          "armor": { "name": "Thoughtweave Lining", "effects": ["+3 TC", "+1 to resist psychic"] },
          "shield": { "name": "Mind Ward Halo", "effects": ["+2 TC vs mental effects"] },
          "utility": { "name": "Telekinetic Aegis", "effects": ["Spend 1 SP for +2 TC for 1 round"] }
        },
        "powers": [
          { "name": "Mind Spike", "cost_sp": 2, "range": "60 ft", "effect": "2d6 psychic; WIS save DC 14 or Stunned 1 round" },
          { "name": "Kinetic Shove", "cost_sp": 2, "range": "60 ft", "effect": "Push 15 ft; STR or DEX save DC 13 resists" },
          { "name": "Silence Bloom", "cost_sp": 3, "range": "aura 15 ft", "sustain_cost_sp_per_round": 1, "effect": "Enemies in aura: disadvantage on CHA checks; must pass CHA save DC 13 to use verbal/sonic powers this round" }
        ],
        "features": [
          "Skull duel rule: Only the drawer can damage the Herald until it reaches 0 HP."
        ]
      },
      "PFV_HUNTER_RIOT_UNIT": {
        "id": "PFV_HUNTER_RIOT_UNIT",
        "name": "PFV Hunter (Riot Unit)",
        "created_by_shard": "FLAMES",
        "role": "Enemy",
        "affiliation": "PFV",
        "tier": 2,
        "classification": "Enhanced Human",
        "power_style": "Tactics/Control",
        "speed_ft": 30,
        "hp": 56,
        "sp": 7,
        "tc_base": 16,
        "tc_notes": "Base 10 + DEX 2 + Kinetic Carapace +2 + Riot Shield +2 = 16. Riot Shield bonus is strongest vs melee.",
        "abilities": { "STR": 14, "DEX": 14, "CON": 14, "INT": 10, "WIS": 12, "CHA": 10 },
        "saves": { "STR": 2, "DEX": 2, "CON": 2, "INT": 0, "WIS": 1, "CHA": 0 },
        "skills": { "Athletics": 4, "Perception": 3, "Intimidation": 2 },
        "gear": {
          "armor": { "name": "Kinetic Carapace", "effects": ["+2 TC"] },
          "shield": { "name": "Riot Shield", "effects": ["+2 TC vs melee attacks"] },
          "utility": { "name": "Stun-Net Emitter", "effects": ["Deploy electrified net for crowd control (GM adjudication)"] }
        },
        "weapons": [
          { "name": "SMG Burst", "range": "ranged", "to_hit": "+2", "damage": "2d6+2 ballistic" },
          { "name": "Riot Baton", "range": "melee", "to_hit": "+2", "damage": "1d6+2 bludgeoning" }
        ],
        "powers": [
          { "name": "Suppression Volley", "cost_sp": 2, "range": "30 ft", "effect": "Hit up to 2 targets: 1d6+2 ballistic each; WIS save DC 13 or Weaken (–2 attack) 1 round" },
          { "name": "Shock Taser", "cost_sp": 2, "range": "melee", "effect": "1d6 lightning; CON save DC 13 or Stunned until end of target’s next turn" },
          { "name": "Riot Wall", "cost_sp": 1, "range": "self+adjacent allies", "effect": "+2 TC to you and adjacent allies until start of your next turn" }
        ],
        "features": [
          "Spawns once per session until dismissed by successful parley/media scene against PFV."
        ]
      },
      "OMNI_TRACKER_RECON": {
        "id": "OMNI_TRACKER_RECON",
        "name": "O.M.N.I. Tracker (Recon Marksman)",
        "created_by_shard": "FLAMES",
        "role": "Enemy",
        "affiliation": "O.M.N.I.",
        "tier": 2,
        "classification": "Enhanced Human",
        "power_style": "Marksman/Control",
        "speed_ft": 30,
        "hp": 55,
        "sp": 6,
        "tc_base": 16,
        "tc_notes": "Base 10 + DEX 3 + Lightweave Cloak +2 + Kinetic Buckler +1 = 16. Cloak bonus is strongest vs ranged.",
        "abilities": { "STR": 10, "DEX": 16, "CON": 12, "INT": 12, "WIS": 14, "CHA": 10 },
        "saves": { "STR": 0, "DEX": 3, "CON": 1, "INT": 1, "WIS": 2, "CHA": 0 },
        "skills": { "Stealth": 5, "Perception": 4, "Technology": 3 },
        "gear": {
          "armor": { "name": "Lightweave Cloak", "effects": ["+2 TC vs ranged attacks"] },
          "shield": { "name": "Kinetic Buckler", "effects": ["+1 TC"] },
          "utility": { "name": "Sensor Darts", "effects": ["Reveal hidden targets within 30 ft (GM adjudication)"] }
        },
        "weapons": [
          { "name": "Marksman Rifle", "range": "ranged", "to_hit": "+3", "damage": "1d10+3 ballistic" }
        ],
        "powers": [
          { "name": "Hunter’s Tag", "cost_sp": 2, "range": "90 ft", "effect": "Mark one target; your attacks vs it gain advantage this combat" },
          { "name": "Netline Shock", "cost_sp": 2, "range": "60 ft", "effect": "1d6 lightning; DEX save DC 14 or Weaken and Push 5 ft" },
          { "name": "Ghost Step", "cost_sp": 1, "range": "self", "effect": "Move 10 ft; attacks vs you have disadvantage until your next turn" }
        ],
        "features": [
          "Spawns once per session until dismissed by successful parley/media scene against O.M.N.I."
        ]
      },
      "CONCLAVE_CENSOR": {
        "id": "CONCLAVE_CENSOR",
        "name": "Conclave Censor (Edict Enforcer)",
        "created_by_shard": "FLAMES",
        "role": "Enemy",
        "affiliation": "Conclave",
        "tier": 2,
        "classification": "Enhanced Human",
        "power_style": "Energy/Control",
        "speed_ft": 30,
        "hp": 55,
        "sp": 6,
        "tc_base": 15,
        "tc_notes": "Base 10 + DEX 1 + Prism Vest +2 + Phase Buckler +2 = 15. Phase Buckler strongest vs powers.",
        "abilities": { "STR": 12, "DEX": 12, "CON": 12, "INT": 14, "WIS": 14, "CHA": 12 },
        "saves": { "STR": 1, "DEX": 1, "CON": 1, "INT": 2, "WIS": 2, "CHA": 1 },
        "skills": { "Insight": 4, "Perception": 3, "Persuasion": 3, "Technology": 3 },
        "gear": {
          "armor": { "name": "Prism Vest", "effects": ["+2 TC vs energy"] },
          "shield": { "name": "Phase Buckler", "effects": ["+2 TC vs powers"] },
          "utility": { "name": "Edict Seal", "effects": ["1 SP: create 10-ft silence zone; CHA save DC 13 to use verbal/sonic powers in zone"] }
        },
        "weapons": [
          { "name": "Prism Edge", "range": "melee", "to_hit": "+1", "damage": "2d10 radiant" }
        ],
        "powers": [
          { "name": "Dazzling Edict", "cost_sp": 2, "range": "15-ft cone", "effect": "2d6 radiant; CON save DC 13 or Blinded 1 round" },
          { "name": "Command Suppression", "cost_sp": 2, "range": "30 ft", "effect": "WIS save DC 14 or Weaken (–2 attack) 1 round" },
          { "name": "Accession Step", "cost_sp": 2, "range": "self", "effect": "Teleport 10 ft; +2 TC until start of next turn" }
        ],
        "features": [
          "Spawns once per session until dismissed by successful parley/media scene against the Conclave."
        ]
      },
      "GREYLINE_ENFORCER": {
        "id": "GREYLINE_ENFORCER",
        "name": "Greyline Enforcer (Shock Cell)",
        "created_by_shard": "FLAMES",
        "role": "Enemy",
        "affiliation": "Greyline",
        "tier": 2,
        "classification": "Enhanced Human",
        "power_style": "Speed/Assault",
        "speed_ft": 35,
        "hp": 56,
        "sp": 7,
        "tc_base": 13,
        "tc_notes": "Base 10 + DEX 2 + Stutter-Blink Harness +1 = 13. +3 TC if moved ≥20 ft (Glide Suit), +2 TC if moved ≥10 ft (Momentum Redirector) — up to TC 18 with movement.",
        "abilities": { "STR": 14, "DEX": 14, "CON": 14, "INT": 12, "WIS": 12, "CHA": 10 },
        "saves": { "STR": 2, "DEX": 2, "CON": 2, "INT": 1, "WIS": 1, "CHA": 0 },
        "skills": { "Acrobatics": 4, "Stealth": 4, "Intimidation": 2 },
        "gear": {
          "armor": { "name": "Kinetic Glide Suit", "effects": ["+3 TC if moved ≥20 ft this round"] },
          "shield": { "name": "Momentum Redirector", "effects": ["+2 TC if moved ≥10 ft this round"] },
          "utility": { "name": "Stutter-Blink Harness", "effects": ["+1 TC", "Reaction: 5-ft teleport once/round when targeted"] }
        },
        "weapons": [
          { "name": "SMG", "range": "ranged", "to_hit": "+2", "damage": "1d10+2 ballistic" }
        ],
        "powers": [
          { "name": "Rapid Barrage", "cost_sp": 2, "range": "30 ft", "effect": "Hit up to two targets for 1d6+2 ballistic each" },
          { "name": "Throat of Silence", "cost_sp": 2, "range": "melee", "effect": "2d6 slashing; CON save DC 13 or Weaken 1 round" },
          { "name": "Smoke Vanish", "cost_sp": 1, "range": "self", "effect": "Become obscured (attacks vs you at disadvantage) until your next turn; move 10 ft" }
        ],
        "features": [
          "Spawns once per session until dismissed by successful parley/media scene against Greyline."
        ]
      }

    },
    "shards": [
      { "id": "SUNSHARD", "name": "The Sun", "polarity": "good", "effect": [ { "type": "xp_delta", "value": 5000 }, { "type": "grant_item", "item_id": "SOLARIS_DIADEM", "quantity": 1 } ], "resolution": "Add XP and item immediately." },
      { "id": "GEM", "name": "The Gem", "polarity": "good", "effect": [ { "type": "credits_delta", "value": 20000 }, { "type": "grant_item", "item_id": "SHARD_BATTERY", "quantity": 3 } ], "resolution": "Credit the account; add consumables." },
      { "id": "KEY", "name": "The Key", "polarity": "good", "effect": [ { "type": "grant_item", "item_id": "PRISM_EDGE", "quantity": 1 } ], "requirements": { "owner_binds_on_equip": true }, "resolution": "Bind legendary weapon to the drawer." },
      { "id": "STAR", "name": "The Star", "polarity": "good", "effect": [ { "type": "ability_score_increase_perm", "choices": ["STR","DEX","CON","INT","WIS","CHA"], "value": 2, "cap": 20 }, { "type": "skill_bonus_perm", "target_skill_choice": true, "value": 2 } ], "resolution": "Apply permanent changes; obey ability cap." },
      { "id": "MOON", "name": "The Moon", "polarity": "good", "effect": [ { "type": "choose_one", "options": [ { "xp_delta": 3000 }, { "credits_delta": 15000 }, { "remove_one_negative_shard_curse": true } ] } ], "resolution": "Record chosen boon and apply." },
      { "id": "COMET", "name": "The Comet", "polarity": "good", "effect": [ { "type": "flag_next_combat_bounty", "condition": "drawer_deals_final_blow_to_highest_hp_enemy", "rewards": [ { "type": "xp_delta", "value": 1500 }, { "type": "grant_item", "item_id": "COMET_SPURS", "quantity": 1 } ] } ], "resolution": "Check condition at end of combat; grant rewards if met." },
      { "id": "VIZIER", "name": "The Vizier", "polarity": "good", "effect": [ { "type": "declare_two_mechanical_weaknesses_on_next_boss" }, { "type": "downtime_advantage", "task": "Research", "uses": 1 } ], "resolution": "GM states two concrete weaknesses; mark downtime advantage." },
      { "id": "THRONE", "name": "The Throne", "polarity": "good", "effect": [ { "type": "grant_item", "item_id": "CMD_BEACON", "quantity": 1 } ], "resolution": "Add Beacon; must be activated at start of round 1 if used." },
      { "id": "ASCENDANT", "name": "The Ascendant", "polarity": "good", "effect": [ { "type": "ability_score_increase_perm", "choices": ["STR","DEX","CON","INT","WIS","CHA"], "value": 1, "count": 2, "cap": 20 }, { "type": "grant_free_boost_per_encounter", "count_encounters": 3, "value": "1d4" } ], "resolution": "Apply permanent +1 to two different abilities; track 3 free boosts." },
      { "id": "HALO", "name": "The Halo", "polarity": "good", "effect": [ { "type": "grant_item", "item_id": "ASCENDANT_HALO", "quantity": 1 } ], "resolution": "Add legendary utility and its uses." },

      { "id": "RUIN", "name": "Ruin", "polarity": "bad", "effect": [ { "type": "credits_delta", "value": -20000 } ], "resolution": "Deduct credits immediately." },
      { "id": "TALONS", "name": "Talons", "polarity": "bad", "effect": [ { "type": "destroy_equipped_items", "count": 2, "priority": ["highest_rarity_first"], "exceptions": ["bonded_legendary_1_item_choice"] } ], "resolution": "Remove items; note they cannot be recovered except via major story quest." },
      { "id": "IDIOT", "name": "The Idiot", "polarity": "bad", "effect": [ { "type": "xp_delta", "value": -2500 }, { "type": "ability_score_decrease_perm", "ability": "INT", "value": -2, "floor": 3 } ], "resolution": "Apply losses; only a major quest can restore the permanent INT loss (+2)." },
      { "id": "EURYALE", "name": "Euryale", "polarity": "bad", "effect": [ { "type": "attack_penalty_curse", "value": -2, "duration": "until_cleansed" }, { "type": "cleanse_method", "methods": [ { "downtime": "Gather Intel", "dc": 15, "successes_required": 2 }, { "item": "PRISM_EDGE", "special_counter": "Spend 3 SP to shatter the curse once" } ] } ], "resolution": "Track –2 to all attack rolls until a listed cleanse completes." },
      { "id": "SKULL", "name": "Skull", "polarity": "bad", "effect": [ { "type": "spawn_enemy_1v1", "enemy_template": "HERALD_OF_SILENCE", "rule": "Only the drawer can damage it until it is reduced to 0 HP" } ], "resolution": "Run immediate duel if drawn during combat; otherwise at next safe opportunity." },
      { "id": "DONJON", "name": "Donjon", "polarity": "bad", "effect": [ { "type": "imprison_drawer", "state": "removed_from_play", "rescue": { "mission_required": true, "scenes_required": 2, "fail_consequence": "drawer loses 1000 xp and 5000 cr" } } ], "resolution": "Team must rescue via a focused side-mission." },
      { "id": "FLAMES", "name": "Flames", "polarity": "bad", "effect": [ { "type": "faction_rep_delta", "faction": "chosen_major", "value": -2 }, { "type": "spawn_hunters", "tier": 2, "count": 1, "frequency": "once_per_session_until_you_complete_parley" } ], "resolution": "Hunters appear once per session; a successful Media Control or Parley scene dismisses them." },
      { "id": "ROGUE", "name": "Rogue", "polarity": "bad", "effect": [ { "type": "convert_contact_to_enemy", "pick_existing_contact": true }, { "type": "steal_item_or_credits", "priority": "highest_rarity_item_else_5000cr" } ], "resolution": "Mark contact hostile; stolen goods are gone unless retrieved in play." },
      { "id": "FOOL", "name": "Fool", "polarity": "bad", "effect": [ { "type": "xp_delta", "value": -2000 }, { "type": "force_draw", "pool": "bad_only", "count": 1 } ], "resolution": "Apply XP loss; immediately draw one additional bad shard and resolve it." },
      { "id": "STATIC", "name": "Static", "polarity": "bad", "effect": [ { "type": "choice", "options": [ { "ability_score_decrease_perm": { "ability_choice": true, "value": -2, "floor": 3 } }, { "lose_one_trained_skill_perm": true } ] } ], "resolution": "Apply chosen permanent penalty." },

      { "id": "LEGEND_KNIGHT_COMMANDER", "name": "Legendary Shard — The Knight-Commander", "polarity": "legendary", "effect": [ { "type": "spawn_ally_loyal_permanent", "npc_id": "ALLY_KNIGHT_COMMANDER_AERIN", "tier": 3 }, { "type": "title_award", "title": "Commander’s Aegis", "mechanic": "Once per session you may call Aerin to your location within 1 scene if plausible." } ], "resolution": "Add ally sheet; loyal to the drawer permanently unless slain." },
      { "id": "LEGEND_ECHO_ZERO", "name": "Legendary Shard — The Echo Zero", "polarity": "legendary", "effect": [ { "type": "spawn_ally_loyal_permanent", "npc_id": "ALLY_ECHO_OPERATIVE_ZERO", "tier": 3 }, { "type": "bond", "text": "Z3R0 shares a psi-link with the drawer; once/combat, the drawer may reroll a failed save." } ], "resolution": "Add ally sheet; loyal to the drawer permanently unless slain." },
      { "id": "LEGEND_NEMESIS_NYX", "name": "Legendary Shard — Nemesis Nyx", "polarity": "legendary", "effect": [ { "type": "spawn_archenemy_permanent", "npc_id": "ENEMY_ARCHNEMESIS_NYX", "tier": 3 }, { "type": "immediate_theft", "steal": { "priority": "highest_rarity_non_bonded_item", "fallback_credits": 10000 } } ], "resolution": "Nyx becomes the drawer’s archenemy and returns if driven off." },
      { "id": "LEGEND_INQUISITOR_SILAS", "name": "Legendary Shard — Inquisitor Silas", "polarity": "legendary", "effect": [ { "type": "spawn_archenemy_permanent", "npc_id": "ENEMY_ARCHNEMESIS_SILAS", "tier": 3 }, { "type": "faction_rep_delta", "faction": "Conclave", "value": -1 } ], "resolution": "Silas marks the drawer for doctrinal judgment and recurs until defeated." }
    ]
  };
  // Use the full shard list from the deck definition when available so the
  // DM tools can render every shard, even outside the minimal test deck.
  const PLATES = SOMF_DECK.shards || OLD_PLATES;
  const plateById = Object.fromEntries(PLATES.map(p => [p.id, p]));
  const ITEM_BY_ID = SOMF_DECK.items || {};
  const NPC_BY_ID = SOMF_DECK.npcs || {};

  function formatNumber(value){
    return typeof value === 'number' && Number.isFinite(value)
      ? value.toLocaleString()
      : value;
  }
  function words(str){
    return typeof str === 'string' ? str.replace(/_/g, ' ') : '';
  }
  function sentenceCase(str){
    const text = words(str).trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }
  function joinWithConjunction(list, conjunction='and'){
    const arr = list.filter(Boolean);
    if(!arr.length) return '';
    if(arr.length === 1) return arr[0];
    if(arr.length === 2) return `${arr[0]} ${conjunction} ${arr[1]}`;
    return `${arr.slice(0, -1).join(', ')}, ${conjunction} ${arr[arr.length-1]}`;
  }
  function pluralize(word, count){
    return count === 1 ? word : `${word}s`;
  }
  function describeItem(itemId, quantity=1){
    const item = ITEM_BY_ID[itemId];
    const name = item?.name || sentenceCase(itemId);
    const qty = quantity && quantity > 1 ? ` ×${quantity}` : '';
    return `${name}${qty}`.trim();
  }
  function describeNpc(npcId){
    const npc = NPC_BY_ID[npcId];
    return npc?.name || sentenceCase(npcId);
  }
  function summarizeChoiceOption(option){
    if(option == null) return '';
    if(typeof option === 'string') return option;
    if(typeof option === 'number') return formatNumber(option);
    if(Array.isArray(option)){
      return option.map(summarizeChoiceOption).filter(Boolean).join(', ');
    }
    if(typeof option !== 'object') return String(option);
    if(option.type) return summarizeEffect(option);
    const entries = Object.entries(option);
    if(entries.length === 1){
      const [key, value] = entries[0];
      switch(key){
        case 'xp_delta':
          return summarizeEffect({ type: 'xp_delta', value });
        case 'credits_delta':
          return summarizeEffect({ type: 'credits_delta', value });
        case 'remove_one_negative_shard_curse':
          return 'Remove one negative shard curse';
        case 'ability_score_decrease_perm':
          return summarizeEffect({ type: 'ability_score_decrease_perm', ...value });
        case 'lose_one_trained_skill_perm':
          return 'Lose one trained skill permanently';
        default:
          return `${sentenceCase(key)}: ${summarizeChoiceOption(value)}`.trim();
      }
    }
    return entries
      .map(([key,value])=>`${sentenceCase(key)}: ${summarizeChoiceOption(value)}`.trim())
      .join(', ');
  }
  function summarizeEffect(effect){
    if(effect == null) return '';
    if(typeof effect === 'string') return effect;
    if(Array.isArray(effect)){
      return effect.map(summarizeEffect).filter(Boolean).join(' ');
    }
    if(typeof effect !== 'object') return String(effect);
    const type = effect.type;
    if(!type) return summarizeChoiceOption(effect);
    switch(type){
      case 'xp_delta': {
        const value = Number(effect.value) || 0;
        const verb = value >= 0 ? 'Gain' : 'Lose';
        return `${verb} ${formatNumber(Math.abs(value))} XP`;
      }
      case 'credits_delta': {
        const value = Number(effect.value) || 0;
        const verb = value >= 0 ? 'Gain' : 'Lose';
        return `${verb} ${formatNumber(Math.abs(value))} cr`;
      }
      case 'grant_item': {
        return `Gain ${describeItem(effect.item_id, effect.quantity)}`;
      }
      case 'ability_score_increase_perm': {
        const value = Number(effect.value) || 0;
        const cap = effect.cap ? ` (cap ${effect.cap})` : '';
        const count = Number(effect.count) || 1;
        if(effect.ability){
          return `Increase ${effect.ability.toUpperCase()} by +${value} permanently${cap}`;
        }
        if(effect.ability_choice){
          return `Increase an ability of your choice by +${value} permanently${cap}`;
        }
        if(effect.choices?.length){
          const list = joinWithConjunction(effect.choices.map(c=>c.toUpperCase()), 'or');
          const pick = count > 1 ? `${count} different abilities` : 'one ability';
          return `Increase ${pick} (${list}) by +${value} permanently${cap}`;
        }
        return `Increase ability score by +${value} permanently${cap}`;
      }
      case 'skill_bonus_perm': {
        const value = Number(effect.value) || 0;
        if(effect.target_skill_choice) return `Gain a permanent +${value} bonus to a skill of your choice`;
        if(effect.skill) return `Gain a permanent +${value} bonus to ${sentenceCase(effect.skill)}`;
        return `Gain a permanent +${value} skill bonus`;
      }
      case 'choose_one':
      case 'choice': {
        const label = type === 'choose_one' ? 'Choose one' : 'Choose';
        const options = (effect.options||[])
          .map(opt=>summarizeChoiceOption(opt))
          .filter(Boolean);
        return options.length ? `${label}: ${options.join('; ')}` : label;
      }
      case 'flag_next_combat_bounty': {
        const condition = words(effect.condition || '').trim();
        const rewards = (effect.rewards||[]).map(r=>summarizeEffect(r)).filter(Boolean).join('; ');
        return `Next combat bounty — if ${condition || 'the condition is met'}, gain ${rewards}`.trim();
      }
      case 'declare_two_mechanical_weaknesses_on_next_boss':
        return 'GM declares two mechanical weaknesses on the next boss';
      case 'downtime_advantage': {
        const uses = Number(effect.uses) || 1;
        const task = sentenceCase(effect.task || 'a downtime task');
        return `Gain advantage on ${task} downtime ${pluralize('check', uses)} (${uses} use${uses===1?'':'s'})`;
      }
      case 'grant_free_boost_per_encounter': {
        const count = Number(effect.count_encounters) || 1;
        const value = effect.value ? effect.value : 'a boost';
        return `Gain a free ${value} in each of your next ${count} ${pluralize('encounter', count)}`;
      }
      case 'ability_score_decrease_perm': {
        const value = Math.abs(Number(effect.value) || 0);
        const target = effect.ability_choice
          ? 'an ability of your choice'
          : (effect.ability ? effect.ability.toUpperCase() : 'an ability');
        const floor = effect.floor ? ` (minimum ${effect.floor})` : '';
        return `Permanently reduce ${target} by ${value}${floor}`;
      }
      case 'attack_penalty_curse': {
        const value = Math.abs(Number(effect.value) || 0);
        const duration = words(effect.duration || '').trim();
        return `Suffer -${value} to attack rolls${duration ? ` ${duration}` : ''}`.trim();
      }
      case 'cleanse_method': {
        const methods = (effect.methods||[]).map(m=>{
          if(m.downtime){
            const parts=[`${m.downtime} downtime`];
            if(m.dc) parts.push(`DC ${m.dc}`);
            if(m.successes_required) parts.push(`${m.successes_required} ${pluralize('success', m.successes_required)}`);
            return parts.join(', ');
          }
          if(m.item){
            const parts=[`Use ${describeItem(m.item)}`];
            if(m.special_counter) parts.push(words(m.special_counter));
            return parts.join(' — ');
          }
          return Object.entries(m)
            .map(([k,v])=>`${sentenceCase(k)}: ${summarizeChoiceOption(v)}`.trim())
            .join(', ');
        });
        return methods.length ? `Cleanse by: ${methods.join('; ')}` : 'Cleanse via special method';
      }
      case 'spawn_enemy_1v1': {
        const name = describeNpc(effect.enemy_template);
        const rule = effect.rule ? ` ${effect.rule}` : '';
        return `${name || 'An enemy'} challenges the drawer to a one-on-one duel.${rule}`.trim();
      }
      case 'imprison_drawer': {
        const parts=['The drawer is imprisoned and removed from play'];
        if(effect.rescue){
          const rescue=[];
          if(effect.rescue.mission_required) rescue.push('requires a focused mission');
          if(effect.rescue.scenes_required) rescue.push(`at least ${effect.rescue.scenes_required} ${pluralize('scene', effect.rescue.scenes_required)}`);
          if(effect.rescue.fail_consequence) rescue.push(`failure: ${effect.rescue.fail_consequence}`);
          if(rescue.length) parts.push(`Rescue ${rescue.join('; ')}`);
        }
        return parts.join('. ');
      }
      case 'faction_rep_delta': {
        const value = Number(effect.value) || 0;
        const faction = sentenceCase(effect.faction || 'faction');
        const verb = value >= 0 ? 'Increase' : 'Decrease';
        return `${verb} ${faction} reputation by ${formatNumber(Math.abs(value))}`;
      }
      case 'spawn_hunters': {
        const count = Number(effect.count) || 1;
        const tier = effect.tier ? `Tier ${effect.tier} ` : '';
        const frequency = words(effect.frequency || '').trim();
        return `Spawn ${count} ${tier}${pluralize('hunter', count)}${frequency ? ` (${frequency})` : ''}`.trim();
      }
      case 'convert_contact_to_enemy':
        return 'Choose an existing contact to become an enemy';
      case 'steal_item_or_credits': {
        const priority = words(effect.priority || 'an item');
        const fallback = effect.fallback_credits ? ` (or ${formatNumber(effect.fallback_credits)} cr if none)` : '';
        return `A foe steals ${priority}${fallback}`.trim();
      }
      case 'force_draw': {
        const count = Number(effect.count) || 1;
        const pool = words(effect.pool || 'from the deck');
        return `Immediately draw ${count} additional ${pool} shard${count===1?'':'s'}`;
      }
      case 'ability_score_decrease_temp': {
        const value = Math.abs(Number(effect.value) || 0);
        const target = effect.ability ? effect.ability.toUpperCase() : 'an ability';
        return `Temporarily reduce ${target} by ${value}`;
      }
      case 'spawn_ally_loyal_permanent': {
        const name = describeNpc(effect.npc_id);
        const tier = effect.tier ? ` (Tier ${effect.tier})` : '';
        return `${name || 'An ally'} joins you as a loyal companion${tier}`;
      }
      case 'title_award':
        return `Gain the title "${effect.title}" — ${effect.mechanic || 'new privileges'}`;
      case 'bond':
        return effect.text || 'Gain a special bond';
      case 'spawn_archenemy_permanent': {
        const name = describeNpc(effect.npc_id);
        const tier = effect.tier ? ` (Tier ${effect.tier})` : '';
        return `${name || 'An archenemy'} marks you permanently${tier}`;
      }
      case 'immediate_theft': {
        const steal = effect.steal || {};
        const priority = words(steal.priority || 'a prized item');
        const fallback = steal.fallback_credits ? ` (or ${formatNumber(steal.fallback_credits)} cr if none)` : '';
        return `Nemesis steals ${priority}${fallback}`.trim();
      }
      default:
        return sentenceCase(type);
    }
  }
  function summarizeRequirements(requirements){
    if(!requirements) return '';
    const parts=[];
    if(requirements.owner_binds_on_equip) parts.push('Item binds to the drawer when equipped');
    Object.entries(requirements).forEach(([key,val])=>{
      if(key==='owner_binds_on_equip') return;
      if(typeof val === 'boolean'){
        parts.push(sentenceCase(key));
      }else{
        parts.push(`${sentenceCase(key)}: ${summarizeChoiceOption(val)}`.trim());
      }
    });
    return parts.join('; ');
  }
  function plateForPlayer(p){
    if(!p) return { id: null, name: 'Unknown Shard', visual: '—', player: ['No effect data available.'] };
    if(Array.isArray(p.player) && p.player.length){
      return {
        id: p.id,
        name: p.name || p.id || 'Unknown Shard',
        visual: p.visual || '—',
        player: p.player.slice(),
      };
    }
    const lines=[];
    const req = summarizeRequirements(p.requirements);
    if(req) lines.push(`Requirement: ${req}`);
    const effects = Array.isArray(p.effect) ? p.effect : (p.effect ? [p.effect] : []);
    effects.map(summarizeEffect).filter(Boolean).forEach(text=>lines.push(text));
    if(p.resolution) lines.push(`Resolution: ${p.resolution}`);
    const visualParts=[];
    if(p.visual) visualParts.push(p.visual);
    if(!p.visual && p.polarity) visualParts.push(`${sentenceCase(p.polarity)} shard`);
    if(p.id) visualParts.push(`ID: ${p.id}`);
    return {
      id: p.id,
      name: p.name || p.id || 'Unknown Shard',
      visual: visualParts.filter(Boolean).join(' • ') || '—',
      player: lines.length ? lines : ['No effect data available.'],
    };
  }

  /* ---------- Helpers ---------- */
  const hasRealtime = ()=> !!window._somf_db;
  const db = ()=> {
    if (!hasRealtime()) throw new Error('Firebase Realtime Database required');
    return window._somf_db;
  };
  const CID = ()=> window._somf_cid || 'ccampaign-001';
  // Firebase location for the shared Shard Deck. The campaign ID is kept for
  // compatibility but no longer affects the path so all campaigns share the
  // same data at /shardDeck in the RTDB.
  const path = {
    deck: (_cid)=>`shardDeck/deck`,
    audits: (_cid)=>`shardDeck/audits`,
    notices: (_cid)=>`shardDeck/notices`,
    resolutions: (_cid)=>`shardDeck/resolutions`,
    npcs: (_cid)=>`shardDeck/active_npcs`,
    hidden: (_cid)=>`shardDeck/hidden`,
  };
  const LSK = {
    deck: cid=>`somf_deck__${cid}`,
    audits: cid=>`somf_audit__${cid}`,
    notices: cid=>`somf_notices__${cid}`,
    resolutions: cid=>`somf_resolutions__${cid}`,
    npcs: cid=>`somf_active_npcs__${cid}`,
    lastNotice: cid=>`somf_last_notice__${cid}`,
    hidden: cid=>`somf_hidden__${cid}`,
  };
  const getLocal = k => { const r=localStorage.getItem(k); return r? JSON.parse(r): null; };
  const setLocal = (k,v)=> localStorage.setItem(k, JSON.stringify(v));

  function cryptoInt(max){
    if (crypto?.getRandomValues){
      const a=new Uint32Array(1); crypto.getRandomValues(a);
      return Math.floor((a[0]/2**32)*max);
    }
    return Math.floor(Math.random()*max);
  }
  function shuffledIds(){
    const ids = PLATES.map(p=>p.id);
    for(let i=ids.length-1;i>0;i--){
      const j = cryptoInt(i+1);
      [ids[i],ids[j]] = [ids[j],ids[i]];
    }
    return ids;
  }
  async function rtdbInitDeckIfMissing(){
    const deckRef = db().ref(path.deck(CID()));
    const snap = await deckRef.get();
    if (!snap.exists()) await deckRef.set(PLATES.map(p=>p.id));
  }
  async function rtdbDrawOne(){
    const deckRef = db().ref(path.deck(CID()));
    let out = null;
    await deckRef.transaction(cur=>{
      let arr = Array.isArray(cur)? cur.slice(): [];
      if (!arr.length) arr = PLATES.map(p=>p.id);
      const idx = cryptoInt(arr.length);
      out = arr[idx]; arr.splice(idx,1);
      return arr;
    });
    await db().ref(path.audits(CID())).push({ id: out, name: plateById[out]?.name || out, ts: db().ServerValue.TIMESTAMP });
    return out;
  }

  /* ======================================================================
     PLAYER FLOW (draw, double confirm, reveal one-by-one, resolved gate)
     ====================================================================== */
  const PUI = {
    count: $('#somf-min-count'),
    drawBtn: $('#somf-min-draw'),
    modal: $('#somf-min-modal'),
    close: $('#somf-min-close'),
    name: $('#somf-min-name'),
    visual: $('#somf-min-visual'),
    effect: $('#somf-min-effect'),
    idx: $('#somf-min-idx'),
    total: $('#somf-min-total'),
    resolved: $('#somf-min-resolved'),
    next: $('#somf-min-next'),
  };
  let queue = []; let qi = 0;

  if (PUI.count) {
    PUI.count.blur();
  }

  function openPlayerModal(){ PUI.modal.hidden=false; }
  function closePlayerModal(){ PUI.modal.hidden=true; }

  async function playShardAnimation(){
    const flash=document.getElementById('draw-flash');
    const lightning=document.getElementById('draw-lightning');
    if(!flash) return;
    flash.hidden=false;
    if(lightning){
      lightning.hidden=false;
      lightning.innerHTML='';
      for(let i=0;i<3;i++){
        const b=document.createElement('div');
        b.className='bolt';
        b.style.left=`${10+Math.random()*80}%`;
        b.style.top=`${Math.random()*60}%`;
        b.style.transform=`rotate(${Math.random()*30-15}deg)`;
        b.style.animationDelay=`${i*0.1}s`;
        lightning.appendChild(b);
      }
    }
    await new Promise(res=>{
      flash.classList.add('show');
      const done=()=>{
        flash.classList.remove('show');
        flash.hidden=true;
        if(lightning){ lightning.hidden=true; lightning.innerHTML=''; }
        flash.removeEventListener('animationend', done);
        res();
      };
      flash.addEventListener('animationend', done);
    });
  }

  function renderCurrent(){
    const p = queue[qi] || { name: '—', visual: '—', player: ['No effect data available.'] };
    if (PUI.name) PUI.name.textContent = p.name || '—';
    if (PUI.visual) PUI.visual.textContent = p.visual || '—';
    if (PUI.effect) {
      const lines = (Array.isArray(p.player) && p.player.length) ? p.player : ['No effect data available.'];
      PUI.effect.innerHTML = lines.map(e=>`<li>${e}</li>`).join('');
    }
    if (PUI.idx) PUI.idx.textContent = String(Math.min(queue.length, qi+1));
    if (PUI.total) PUI.total.textContent = String(queue.length);
    if (PUI.resolved) PUI.resolved.checked = false;
    if (PUI.next) PUI.next.disabled = true;
  }

  if (PUI.resolved) {
    PUI.resolved.addEventListener('change', ()=> PUI.next.disabled = !PUI.resolved.checked);
  }
  if (PUI.next) {
    PUI.next.addEventListener('click', async ()=>{
      if (!PUI.resolved.checked) return;
      if (qi < queue.length-1){ qi++; await playShardAnimation(); renderCurrent(); } else { closePlayerModal(); }
    });
  }
  if (PUI.close) {
    PUI.close.addEventListener('click', closePlayerModal);
  }

  async function doDraw(){
    const n = Math.max(1, Math.min(PLATES.length, +PUI.count.value||1));
    if (!confirm('The Fates are fickle, are you sure you wish to draw from the Shards?')) return;
    if (!confirm('This cannot be undone, do you really wish to tempt Fate?')) return;

    const ids = [];
    let names = [];
    await rtdbInitDeckIfMissing();
    for (let i=0;i<n;i++) ids.push(await rtdbDrawOne());
    names = ids.map(id=> plateById[id]?.name || id);
    // batch notice (for DM): count + ids + names
    await db().ref(path.notices(CID())).push({ ts: db().ServerValue.TIMESTAMP, count:n, ids, names });

    window.dmNotify?.(`Drew ${n} Shard(s): ${names.join(', ')} (unresolved)`);
    queue = ids.map(id=> plateForPlayer(plateById[id]));
    qi = 0;
    await playShardAnimation();
    openPlayerModal(); renderCurrent();
  }
  if (PUI.drawBtn) {
    PUI.drawBtn.addEventListener('click', ()=>{
      if (PUI.count) PUI.count.blur();
      doDraw();
    });
  }

  const playerCard = $('#somf-min');
  let _lastHidden = true;
  async function applyHiddenState(h){
    if(!playerCard) return;
    if(_lastHidden && !h){
      await playShardAnimation();
      toast('The Shards of Many Fates have reveled themselves to you.',6000);
      playerCard.hidden = false;
    }else{
      playerCard.hidden = h;
    }
    if(h) closePlayerModal();
    _lastHidden = h;
  }
  async function initPlayerHidden(){
    const stored = getLocal(LSK.hidden(CID()));
    const defaultHidden = typeof stored === 'boolean' ? stored : true;

    if (!hasRealtime()){
      const handleLocalHidden = (evt)=>{
        const detail = evt?.detail;
        const next = typeof detail === 'boolean' ? detail : !!detail;
        setLocal(LSK.hidden(CID()), next);
        applyHiddenState(next);
      };
      window.addEventListener('somf-local-hidden', handleLocalHidden);
      setLocal(LSK.hidden(CID()), defaultHidden);
      await applyHiddenState(defaultHidden);
      return;
    }

    const ref = db().ref(path.hidden(CID()));
    let initial = defaultHidden;
    try {
      const snap = await ref.get();
      if (snap.exists()) {
        const raw = typeof snap.val === 'function' ? snap.val() : snap.val;
        initial = typeof raw === 'boolean' ? raw : defaultHidden;
      }
    } catch (err) {
      console.error('SOMF hidden state sync failed', err);
    }
    setLocal(LSK.hidden(CID()), initial);
    await applyHiddenState(initial);
    let fallbackHidden = initial;
    ref.on('value', s=>{
      let raw;
      try {
        raw = typeof s?.val === 'function' ? s.val() : s?.val;
      } catch {
        raw = undefined;
      }
      const h = typeof raw === 'boolean' ? raw : fallbackHidden;
      fallbackHidden = h;
      setLocal(LSK.hidden(CID()), h);
      window.dispatchEvent(new CustomEvent('somf-local-hidden',{detail:h}));
      applyHiddenState(h);
    });
  }

  /* ======================================================================
     DM TOOL (notifications, resolve, npcs)
     ====================================================================== */
  const D = {
    root: $('#modal-somf-dm'),
    close: $('#somfDM-close'),
    tabs: $$('.somf-dm-tabbtn'),
    cardTab: $('#somfDM-tab-cards'),
    resTab: $('#somfDM-tab-resolve'),
    npcsTab: $('#somfDM-tab-npcs'),
    itemsTab: $('#somfDM-tab-items'),
    reset: $('#somfDM-reset'),
    cardCount: $('#somfDM-cardCount'),
    incoming: $('#somfDM-incoming'),
    noticeView: $('#somfDM-noticeView'),
    markResolved: $('#somfDM-markResolved'),
    spawnNPC: $('#somfDM-spawnNPC'),
    npcList: $('#somfDM-npcList'),
    itemList: $('#somfDM-itemList'),
    npcModal: $('#somfDM-npcModal'),
    npcModalCard: $('#somfDM-npcModalCard'),
    toasts: $('#somfDM-toasts'),
    ping: $('#somfDM-ping'),
    playerCardToggle: $('#somfDM-playerCard'),
    playerCardState: $('#somfDM-playerCard-state'),
    resolveOptions: $('#somfDM-resolveOptions'),
    queue: $('#somfDM-notifications'),
  };
  let _selectLatest = false;
  let _selectKey = null;
  let _focusId = null;
  function preventTouch(e){ if(e.target===D.root) e.preventDefault(); }
  function openDM(opts={}){
    if(!D.root) return;
    D.root.style.display='flex';
    D.root.classList.remove('hidden');
    D.root.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
    D.root.addEventListener('touchmove', preventTouch, { passive: false });
    if(opts.selectLatest) _selectLatest = true;
    if(opts.selectKey) _selectKey = opts.selectKey;
    if(opts.focusId) _focusId = opts.focusId;
    initDM();
    if(opts.tab){
      D.tabs.forEach(x=> x.classList.remove('active'));
      [D.cardTab,D.resTab,D.npcsTab,D.itemsTab].forEach(el=> el.classList.remove('active'));
      const t=opts.tab;
      if(t==='cards') D.cardTab.classList.add('active');
      if(t==='resolve') D.resTab.classList.add('active');
      if(t==='npcs') D.npcsTab.classList.add('active');
      if(t==='items') D.itemsTab.classList.add('active');
      D.tabs.forEach(b=>{ if(b.dataset.tab===t) b.classList.add('active'); });
    }
  }
  function closeDM(){
    if(!D.root) return;
    D.root.classList.add('hidden');
    D.root.setAttribute('aria-hidden','true');
    D.root.style.display='none';
    document.body.classList.remove('modal-open');
    D.root.removeEventListener('touchmove', preventTouch);
  }
  D.root?.addEventListener('click', e=>{ if(e.target===D.root) closeDM(); });
  D.root?.addEventListener('touchstart', e=>{ if(e.target===D.root) closeDM(); });
  D.close?.addEventListener('click', closeDM);
  window.openSomfDM = openDM;

  // Tabs
  D.tabs.forEach(b=>{
    b.addEventListener('click', ()=>{
      D.tabs.forEach(x=> x.classList.remove('active'));
      b.classList.add('active');
      [D.cardTab,D.resTab,D.npcsTab,D.itemsTab].forEach(el=> el.classList.remove('active'));
      const t = b.dataset.tab;
      if (t==='cards') D.cardTab.classList.add('active');
      if (t==='resolve') D.resTab.classList.add('active');
      if (t==='npcs') D.npcsTab.classList.add('active');
      if (t==='items') D.itemsTab.classList.add('active');
    });
  });

  // Toasts
  function toast(msg, ttl=6000){
    const t=document.createElement('div');
    t.style.cssText='background:#0b1119;color:#e6f1ff;border:1px solid #1b2532;border-radius:8px;padding:10px 12px;min-width:260px;box-shadow:0 8px 24px #0008';
    t.innerHTML = msg;
    if (D.toasts) D.toasts.appendChild(t);
    try{ D.ping.currentTime=0; D.ping.play(); }catch{}
    setTimeout(()=> t.remove(), ttl);
    if ('Notification' in window && Notification.permission==='granted'){
      new Notification('Shards Drawn', { body: msg.replace(/<[^>]+>/g,'') });
    }
    return t;
  }

  window.addEventListener('cc:content-updated', evt => {
    const detail = evt?.detail || {};
    const msg =
      typeof detail.message === 'string' && detail.message
        ? detail.message
        : 'Codex content updated with new data.';
    toast(`<strong>Codex Update</strong> ${msg}`);
  });

  D.playerCardToggle?.addEventListener('change', async ()=>{
    const hidden = !D.playerCardToggle.checked;
    if(D.playerCardState) D.playerCardState.textContent = D.playerCardToggle.checked ? 'On' : 'Off';
    try {
      await applyHiddenState(hidden);
    } catch (err) {
      console.error('SOMF hidden state apply failed', err);
    }
    if(hasRealtime()){
      try {
        await db().ref(path.hidden(CID())).set(hidden);
      } catch (err) {
        console.error('SOMF hidden state update failed', err);
      }
    }
    setLocal(LSK.hidden(CID()), hidden);
    window.dispatchEvent(new CustomEvent('somf-local-hidden',{detail:hidden}));
  });

  async function refreshHiddenToggle(){
    let hidden = true;
    if(hasRealtime()){
      try {
        const snap = await db().ref(path.hidden(CID())).get();
        hidden = snap.exists()? !!snap.val() : true;
      } catch (err) {
        console.error('SOMF hidden toggle refresh failed', err);
        const stored = getLocal(LSK.hidden(CID()));
        hidden = typeof stored === 'boolean' ? stored : true;
      }
    } else {
      const stored = getLocal(LSK.hidden(CID()));
      hidden = typeof stored === 'boolean' ? stored : true;
    }
    if(D.playerCardToggle) {
      D.playerCardToggle.checked = !hidden;
      if(D.playerCardState) D.playerCardState.textContent = D.playerCardToggle.checked ? 'On' : 'Off';
    }
  }
  // request notification permission up front
  if('Notification' in window && Notification.permission!=='granted'){
    Notification.requestPermission().catch(()=>{});
  }

  // Dice (for NPC buttons)
  function roll(expr){
    const m = String(expr).replace(/\s+/g,'').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) return {total:NaN, rolls:[], mod:0};
    const n=Math.max(1,parseInt(m[1]||'1',10)), faces=parseInt(m[2],10), mod=parseInt(m[3]||'0',10);
    const rolls=Array.from({length:n},()=>1+Math.floor(Math.random()*faces));
    return { total: rolls.reduce((a,b)=>a+b,0)+mod, rolls, mod };
  }
  function rollBtn(label, expr){
    const b=document.createElement('button');
    b.textContent=`${label} (${expr})`;
    b.style.cssText='padding:6px 10px;border:1px solid #253247;background:#121821;color:#e6f1ff;border-radius:6px;cursor:pointer';
    b.addEventListener('click', ()=>{
      const r=roll(expr);
      toast(`<strong>${label}</strong> ${r.total} <span style="opacity:.85;font-family:monospace">[${r.rolls.join(', ')}${r.mod? (r.mod>0?` + ${r.mod}`:` - ${Math.abs(r.mod)}`):''}]</span>`);
    });
    return b;
  }

  // NPCs pulled from the deck definition
  const NPCS = Object.values(SOMF_DECK.npcs || {});
  const spawnFor = (id)=> {
    if (id==='SKULL') return 'HERALD_OF_SILENCE';
    if (id==='LEGEND_KNIGHT_COMMANDER') return 'ALLY_KNIGHT_COMMANDER_AERIN';
    if (id==='LEGEND_ECHO_ZERO') return 'ALLY_ECHO_OPERATIVE_ZERO';
    if (id==='LEGEND_NEMESIS_NYX') return 'ENEMY_ARCHNEMESIS_NYX';
    if (id==='LEGEND_INQUISITOR_SILAS') return 'ENEMY_ARCHNEMESIS_SILAS';
    return null;
  };

  const RESOLVE_OPTIONS = [
    {name:'Return to the Vault', desc:'Shuffle the shard back into the deck and remove its effects.'},
    {name:'Destroy the Shard', desc:'Use a powerful ritual or device to permanently remove it from play.'},
    {name:'Forge into Gear', desc:'Channel the shard into a unique item granting its power.'},
    {name:'Empower or Summon an NPC', desc:'Consume the shard to create or enhance a notable NPC.'},
    {name:'Story Consequence', desc:'Resolve the shard as a narrative event that alters the campaign.'},
  ];

  function npcCard(n){
    const card=document.createElement('div');
    card.style.cssText='border:1px solid #1b2532;border-radius:8px;background:#0c1017;padding:8px';
    const ability = n.abilities || n.ability || {};
    const abilityGrid = ['STR','DEX','CON','INT','WIS','CHA']
      .map(k=>`<div><span style="opacity:.8;font-size:12px">${k}</span><div>${ability[k]??''}</div></div>`)
      .join('');
    const saves = typeof n.saves === 'string' ? n.saves : Object.entries(n.saves||{}).map(([k,v])=>`${k}+${v}`).join(' ');
    const skills = typeof n.skills === 'string' ? n.skills : Object.entries(n.skills||{}).map(([k,v])=>`${k}+${v}`).join(' ');
    const weapons = (n.weapons||[]).map(w=>({n:w.name, atk:w.to_hit||w.attack, dmg:w.damage}));
    const traits=[];
    if(n.tc_notes) traits.push(`TC Notes: ${n.tc_notes}`);
    Object.values(n.gear||{}).forEach(g=>{
      const eff = g.effects?.join ? g.effects.join('; ') : (g.effect||g.bonus||'');
      traits.push(`${g.name}: ${eff}`);
    });
    (n.features||[]).forEach(f=> traits.push(f));
    const powers = (n.powers||[]).map(p=>{
      const parts=[];
      if(p.cost_sp!=null) parts.push(`${p.cost_sp} SP`);
      if(p.range) parts.push(p.range);
      if(p.damage) parts.push(p.damage);
      if(p.effect) parts.push(p.effect);
      if(p.save) parts.push(`${p.save.ability} save DC ${p.save.dc}${p.save.on_fail? ' or '+p.save.on_fail:''}`);
      return `${p.name} — ${parts.join(', ')}`;
    });
    const hostMarkup = weapons.length? `<div class="roll-host" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"></div>`:'';
    card.innerHTML = `
      <div><strong>${n.name}</strong> <span style="opacity:.8">• ${n.role||''}${n.affiliation? ' • '+n.affiliation:''}${n.tier? ' (T'+n.tier+')':''}</span></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
        <div><span style="opacity:.8;font-size:12px">HP</span><div>${n.hp_average??n.hp??''}</div></div>
        <div><span style="opacity:.8;font-size:12px">TC</span><div>${n.tc_computed_example??n.tc_base??''}</div></div>
        <div><span style="opacity:.8;font-size:12px">SP</span><div>${n.sp??''}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${abilityGrid}</div>
      ${saves? `<div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Saves</span><div>${saves}</div></div>`:''}
      ${skills? `<div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Skills</span><div>${skills}</div></div>`:''}
      ${powers.length? `<div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Powers</span><ul style="margin:4px 0 0 18px;padding:0">${powers.map(p=>`<li>${p}</li>`).join('')}</ul></div>`:''}
      ${weapons.length? `<div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Weapons</span><div>${weapons.map(w=>`${w.n}${w.atk?` (atk ${w.atk}`:''}${w.dmg?`${w.atk?', ' : ''}dmg ${w.dmg}`:''}${w.atk||w.dmg?')':''}`).join('; ')}</div></div>`:''}
      ${traits.length? `<div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Traits</span><ul style="margin:4px 0 0 18px;padding:0">${traits.map(t=>`<li>${t}</li>`).join('')}</ul></div>`:''}
      ${hostMarkup}
    `;
    const host = card.querySelector('.roll-host');
    if(host){
      weapons.forEach(w=>{
        if(w.atk) host.appendChild(rollBtn(`${w.n} Attack`, w.atk));
        if(w.dmg) host.appendChild(rollBtn(`${w.n} Damage`, w.dmg));
      });
    }
    return card;
  }

function itemCard(it){
  const card=document.createElement('div');
  card.style.cssText='border:1px solid #1b2532;border-radius:8px;background:#0c1017;padding:8px';
  const toText = v => {
    if(v==null) return '';
    if(typeof v==='string') return v.replace(/_/g,' ');
    if(Array.isArray(v)) return v.map(toText).join(', ');
    if(typeof v==='object') return Object.entries(v).map(([k,val])=>`${k.replace(/_/g,' ')}: ${toText(val)}`).join(', ');
    return String(v);
  };
  card.innerHTML = `<div><strong>${it.name}</strong> <span style="opacity:.8">• ${it.rarity||''} ${it.slot||''}</span></div>`;
  if(it.type) card.innerHTML += `<div style="opacity:.8;font-size:12px">${toText(it.type)}</div>`;
  if(it.passive){
    const arr = Array.isArray(it.passive)? it.passive: [it.passive];
    card.innerHTML += `<div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Passive</span><ul style="margin:4px 0 0 18px;padding:0">${arr.map(p=>`<li>${toText(p)}</li>`).join('')}</ul></div>`;
  }
  if(it.active){
    const a=it.active, details=[];
    if(a.uses) details.push(`Uses: ${toText(a.uses)}`);
    if(a.activation){
      const act=[];
      if(a.activation.when) act.push(toText(a.activation.when));
      if(a.activation.action) act.push(toText(a.activation.action));
      if(a.activation.cost_sp!=null) act.push(`${a.activation.cost_sp} SP`);
      details.push(`Activation: ${act.join(', ')}`);
    }
    if(a.duration) details.push(`Duration: ${toText(a.duration)}`);
    card.innerHTML += `<div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Active</span><div style="opacity:.8;font-size:12px">${details.join(' • ')}</div>${a.effects? `<ul style="margin:4px 0 0 18px;padding:0">${a.effects.map(e=>`<li>${toText(e)}</li>`).join('')}</ul>`:''}</div>`;
  }
  if(it.effect){
    const effs=Array.isArray(it.effect)? it.effect:[it.effect];
    card.innerHTML += `<div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Effect</span><ul style="margin:4px 0 0 18px;padding:0">${effs.map(e=>`<li>${toText(e)}</li>`).join('')}</ul></div>`;
  }
  if(it.orders){
    const ord=Object.values(it.orders);
    card.innerHTML += `<div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Orders</span><ul style="margin:4px 0 0 18px;padding:0">${ord.map(o=>`<li><strong>${o.name}</strong> (${toText(o.duration)})</li>`).join('')}</ul></div>`;
  }
  return card;
}

  function renderItemList(){
    if(!D.itemList) return;
    D.itemList.innerHTML='';
    Object.values(SOMF_DECK.items||{}).forEach(it=>{
      const li=document.createElement('li');
      li.style.cssText='border-top:1px solid #1b2532;padding:8px 10px';
      if(D.itemList.children.length===0) li.style.borderTop='none';
      li.appendChild(itemCard(it));
      D.itemList.appendChild(li);
    });
  }

function renderCardList(){
    if(!D.cardTab) return;
    D.cardTab.innerHTML='';
    const toText = v => {
      if(v==null) return '';
      if(typeof v==='string') return v.replace(/_/g,' ');
      if(Array.isArray(v)) return v.map(toText).join(', ');
      if(typeof v==='object') return Object.entries(v).map(([k,val])=>`${k.replace(/_/g,' ')}: ${toText(val)}`).join(', ');
      return String(v);
    };
    PLATES.forEach(p=>{
      const d=document.createElement('div');
      d.id = `somfDM-card-${p.id}`;
      d.style.cssText='border:1px solid #1b2532;border-radius:8px;background:#0c1017;padding:8px';
      let html = `<div><strong>${p.name}</strong></div>
        <div style="opacity:.8;font-size:12px">ID: ${p.id}</div>`;
      if(p.visual) html += `
        <div style="margin-top:4px;opacity:.8;font-size:12px">${p.visual}</div>`;
      if(Array.isArray(p.player)) html += `
        <div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Player</span><ul style="margin:4px 0 0 18px;padding:0">${p.player.map(e=>`<li>${e}</li>`).join('')}</ul></div>`;
      if(Array.isArray(p.dm)) html += `
        <div style="margin-top:6px"><span style="opacity:.8;font-size:12px">DM</span><ul style="margin:4px 0 0 18px;padding:0">${p.dm.map(e=>`<li>${e}</li>`).join('')}</ul></div>`;
      if(p.effect && !p.player && !p.dm){
        const effs = Array.isArray(p.effect)? p.effect: [p.effect];
        html += `
        <div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Effect</span><ul style="margin:4px 0 0 18px;padding:0">${effs.map(e=>`<li>${toText(e)}</li>`).join('')}</ul></div>`;
        if(p.resolution) html += `
        <div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Resolution</span><div style="opacity:.8;font-size:12px">${toText(p.resolution)}</div></div>`;
      }
      d.innerHTML = html;
      D.cardTab.appendChild(d);
    });
    if(_focusId){
      const target = D.cardTab.querySelector(`#somfDM-card-${_focusId}`);
      _focusId=null;
      if(target){
        target.scrollIntoView({behavior:'smooth', block:'start'});
        target.style.outline='2px solid #39f';
        setTimeout(()=>{ target.style.outline=''; },1200);
      }
    }
  }

  function openNPCModal(n){
    if(!D.npcModal || !D.npcModalCard) return;
    D.npcModalCard.innerHTML='';
    const card=npcCard(n);
    const close=document.createElement('button');
    close.textContent='Close';
    close.className='somf-btn somf-ghost';
    close.style.marginTop='8px';
    close.addEventListener('click', closeNPCModal);
    D.npcModalCard.appendChild(card);
    D.npcModalCard.appendChild(close);
    D.npcModal.style.display='flex';
    D.npcModal.classList.remove('hidden');
    D.npcModal.setAttribute('aria-hidden','false');
  }
  function closeNPCModal(){
    if(!D.npcModal) return;
    D.npcModal.classList.add('hidden');
    D.npcModal.setAttribute('aria-hidden','true');
    D.npcModal.style.display='none';
  }
  D.npcModal?.addEventListener('click', e=>{ if(e.target===D.npcModal) closeNPCModal(); });

  function renderNPCList(){
    if(!D.npcList) return;
    D.npcList.innerHTML='';
    NPCS.forEach(n=>{
      const li=document.createElement('li');
      li.style.cssText='border-top:1px solid #1b2532;padding:8px 10px;cursor:pointer';
      if(D.npcList.children.length===0) li.style.borderTop='none';
      const type = n.type || `${n.role||''}${n.affiliation? ' • '+n.affiliation:''}${n.tier? ' (T'+n.tier+')':''}`;
      li.innerHTML=`<strong>${n.name}</strong><div style="opacity:.8">${type}</div>`;
      li.addEventListener('click', ()=> openNPCModal(n));
      D.npcList.appendChild(li);
    });
  }

  function renderResolveOptions(){
    if(!D.resolveOptions) return;
    D.resolveOptions.innerHTML='';
    RESOLVE_OPTIONS.forEach(o=>{
      const li=document.createElement('li');
      li.innerHTML = `<strong>${o.name}</strong><div style="opacity:.8">${o.desc}</div>`;
      D.resolveOptions.appendChild(li);
    });
  }

  // Counts + incoming
  async function refreshCounts(){
    let deckLen = PLATES.length;
    const deckSnap = await db().ref(path.deck(CID())).get();
    const deck = deckSnap.exists()? deckSnap.val(): [];
    deckLen = Array.isArray(deck)? deck.length : PLATES.length;
    if(D.cardCount) D.cardCount.textContent = `${deckLen}/${PLATES.length}`;
  }

  async function removeNotice(n){
    await db().ref(path.notices(CID())).child(n.key).remove();
  }

  async function resolveNotice(n,count){
    await pushResolutionBatch(n);
    await removeNotice(n);
    toast(`<strong>Resolved</strong> ${count} shard(s)`);
    loadAndRender();
  }

  function renderIncoming(notices){
    D.incoming.innerHTML='';
    notices.forEach((n,ix)=>{
      const li=document.createElement('li');
      li.style.cssText='border-top:1px solid #1b2532;padding:8px 10px;cursor:pointer';
      if (ix===0) li.style.borderTop='none';
      const ids = n.ids || [];
      const names = n.names || ids.map(id=> plateById[id]?.name || id);
      li.innerHTML = `<strong>${names.length} shard(s)</strong><div style="opacity:.8">${names.map((x,i)=>`<span data-id="${ids[i]}" style="text-decoration:underline;cursor:pointer">${x}</span>`).join(', ')}</div>`;
      li.dataset.key = n.key || '';
      li.querySelectorAll('span[data-id]').forEach(sp=>{
        sp.addEventListener('click', e=>{ e.stopPropagation(); openDM({tab:'cards', focusId: sp.dataset.id}); });
      });
      li.addEventListener('click', ()=>{
        $$('#somfDM-incoming li').forEach(x=> x.style.background='');
        li.style.background='#0b2a3a';
        D.noticeView.innerHTML = `<div><strong>Batch</strong> • ${new Date(n.ts||Date.now()).toLocaleString()}</div>`+
          `<ul style="margin:6px 0 0 18px;padding:0">${names.map((x,i)=>`<li data-id="${ids[i]}" style="cursor:pointer;text-decoration:underline">${x}</li>`).join('')}</ul>`;
        D.noticeView.querySelectorAll('li[data-id]').forEach(li2=>{
          li2.addEventListener('click', ()=> openDM({tab:'cards', focusId: li2.dataset.id}));
        });
        const spawnCode = (n.ids.length===1)? (spawnFor(n.ids[0])||null) : null;
        D.spawnNPC.disabled = !spawnCode;
        D.spawnNPC.onclick = ()=>{
          if (!spawnCode) return;
          const tpl = NPCS.find(x=>x.id===spawnCode);
          openNPCModal(tpl);
          toast(`<strong>NPC</strong> ${tpl.name}`);
        };
        D.markResolved.disabled = false;
        D.markResolved.onclick = async ()=>{
          await resolveNotice(n, names.length);
        };
      });
      D.incoming.appendChild(li);
    });
    if(_selectKey){
      const target = D.incoming.querySelector(`li[data-key="${_selectKey}"]`);
      _selectKey=null;
      if(target) target.click();
      else if(_selectLatest){
        _selectLatest=false;
        const first=D.incoming.firstElementChild;
        if(first) first.click();
      }
    } else if(_selectLatest){
      _selectLatest=false;
      const first=D.incoming.firstElementChild;
      if(first) first.click();
    }
  }

  function renderQueue(notices){
    if(!D.queue) return;
    D.queue.innerHTML='';
    notices.forEach(n=>{
      const ids = n.ids || [];
      const names = n.names || ids.map(id=> plateById[id]?.name || id);
      const li=document.createElement('li');
      li.innerHTML = `${names.length} shard(s): ${names.map((nm,i)=>`<span data-id="${ids[i]}" style="text-decoration:underline;cursor:pointer">${nm}</span>`).join(', ')}`;
      li.addEventListener('click', ()=> openDM({tab:'resolve', selectKey:n.key}));
      li.querySelectorAll('span[data-id]').forEach(sp=>{
        sp.addEventListener('click', e=>{ e.stopPropagation(); openDM({tab:'cards', focusId: sp.dataset.id}); });
      });
      D.queue.appendChild(li);
    });
  }

  async function loadNotices(limit=30){
    const snap = await db().ref(path.notices(CID())).limitToLast(limit).get();
    if (!snap.exists()) return [];
    const arr = [];
    snap.forEach(child=> arr.push({ key: child.key, ...child.val() }));
    arr.sort((a,b)=> (b.ts||0)-(a.ts||0));
    return arr;
  }

  async function loadResolutions(limit=50){
    const snap = await db().ref(path.resolutions(CID())).limitToLast(limit).get();
    if(!snap.exists()) return [];
    const arr = Object.values(snap.val()).sort((a,b)=> (b.ts||0)-(a.ts||0));
    return arr;
  }

  async function resetDeck(){
    await db().ref(path.deck(CID())).set(shuffledIds());
    await db().ref(path.audits(CID())).remove();
    await db().ref(path.notices(CID())).remove();
    await db().ref(path.resolutions(CID())).remove();
    await db().ref(path.npcs(CID())).remove();
    await loadAndRender();
  }


  async function pushResolutionBatch(n){
    await db().ref(path.resolutions(CID())).push({ ts: db().ServerValue.TIMESTAMP, ids:n.ids });
  }

  async function loadAndRender(){
    // Always render static lists so the DM modal has content even if the
    // realtime database isn't configured (offline/solo play).
    renderCardList();
    renderItemList();
    renderNPCList();
    renderResolveOptions();
    try {
      await refreshCounts();
      const notices = await loadNotices();
      renderIncoming(notices);
      renderQueue(notices);
      await refreshHiddenToggle();
    } catch (err) {
      console.error('SOMF DM load failed', err);
    }
  }

  // Live listeners
  function enableLive(){
    if(!hasRealtime()) return;
    if(_noticeRef) _noticeRef.off();
    if(_hiddenRef) _hiddenRef.off();
    _noticeRef = db().ref(path.notices(CID()));
    _noticeRef.limitToLast(1).on('child_added', snap=>{
      const v=snap.val(); if (!v) return;
      const names = v.names || (v.ids||[]).map(id=> plateById[id]?.name || id);
      const key = snap.key;
      const firstId = v.ids && v.ids[0];
      const t = toast(`<strong>New Draw</strong> ${v.count} shard(s): ${names.join(', ')}`);
      t.style.cursor='pointer';
      t.addEventListener('click', ()=>{
        if(firstId) openDM({tab:'cards', focusId:firstId, selectKey:key});
        else openDM({tab:'resolve', selectKey:key});
      });
      loadAndRender();
    });
    _noticeRef.on('child_removed', ()=>{ loadAndRender(); });
    _hiddenRef = db().ref(path.hidden(CID()));
    let fallbackHidden = getLocal(LSK.hidden(CID()));
    if (typeof fallbackHidden !== 'boolean') fallbackHidden = true;
    _hiddenRef.on('value', s=>{
      let raw;
      try {
        raw = typeof s?.val === 'function' ? s.val() : s?.val;
      } catch {
        raw = undefined;
      }
      const h = typeof raw === 'boolean' ? raw : fallbackHidden;
      fallbackHidden = h;
      if(D.playerCardToggle) {
        D.playerCardToggle.checked = !h;
        if(D.playerCardState) D.playerCardState.textContent = D.playerCardToggle.checked ? 'On' : 'Off';
      }
      setLocal(LSK.hidden(CID()), h);
      window.dispatchEvent(new CustomEvent('somf-local-hidden',{detail:h}));
    });
  }

  D.reset?.addEventListener('click', resetDeck);

  let _noticeRef=null,_hiddenRef=null;
  function initDM(){
    loadAndRender();
    enableLive();
  }

  initPlayerHidden();
  try {
    if (sessionStorage.getItem('dmLoggedIn') === '1') initDM();
  } catch {
    /* ignore */
  }
  window.initSomfDM = initDM;

}

document.addEventListener('DOMContentLoaded', initSomf);
if(document.readyState !== 'loading'){
  initSomf();
}

