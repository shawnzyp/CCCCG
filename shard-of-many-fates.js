'use strict';

(function(){
  const DEFAULT_CAMPAIGN_ID = 'ccampaign-001';
  const REALTIME_PATHS = {
    deck: () => 'shardDeck/deck',
    audits: () => 'shardDeck/audits',
    notices: () => 'shardDeck/notices',
    resolutions: () => 'shardDeck/resolutions',
    npcs: () => 'shardDeck/active_npcs',
    hidden: () => 'shardDeck/hidden',
    hiddenSignals: () => 'shardDeck/hidden_signals',
  };
  const LOCAL_KEYS = {
    deck: cid => `somf_deck__${cid}`,
    audits: cid => `somf_audit__${cid}`,
    notices: cid => `somf_notices__${cid}`,
    resolutions: cid => `somf_resolutions__${cid}`,
    npcs: cid => `somf_active_npcs__${cid}`,
    lastNotice: cid => `somf_last_notice__${cid}`,
    hidden: cid => `somf_hidden__${cid}`,
    hiddenSignal: cid => `somf_hidden_signal__${cid}`,
  };
  const MAX_LOCAL_RECORDS = 120;

  const SHARDS_OF_MANY_FATES = [
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

  const SHARD_ART_BASE = ['images', 'The Shards of Many Fates Art']
    .map(segment => encodeURIComponent(segment))
    .join('/');

  const SHARD_ART_BY_ID = {
    VAULT: 'The Vault.png',
    ECHO: 'The Echo.png',
    JUDGE: 'The Judge.png',
    COMET: 'The Comet.png',
    CONTRACT: 'The Contract.png',
    PEACEKEEPER: 'The Peacekeeper.png',
    WRAITH: 'The Wraith.png',
    KEY: 'The Key.png',
    THRONE: 'The Throne.png',
    CRASH: 'The Crash.png',
    CHRONICLE: 'The Chronicile.png',
    SUNSHARD: 'The Sunshard.png',
    MOONSHARD: 'The Moonshard.png',
    STARSHARD: 'The Starshard.png',
    SCRAMBLER: 'The Scrambler.png',
    UPRISING: 'The Uprising.png',
    GORGON_CODE: 'The Gorgon Code.png',
    GLITCH: 'The Glitch.png',
    PRANK: 'The Prank.png',
    CATALYST: 'The Catalyst.png',
    WANDERER: 'The Wanderer.png',
    VOID: 'The Void.png',
  };

  const shardArtById = id => {
    if (typeof id !== 'string' || !id) return null;
    const file = SHARD_ART_BY_ID[id];
    return file ? `${SHARD_ART_BASE}/${encodeURIComponent(file)}` : null;
  };

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const escapeAttr = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');

  function shardLinkMarkup({ id, label, noticeKey, noticeIndex }) {
    if (typeof id !== 'string' || !id) return escapeHtml(label || id || '');
    const rawLabel = String(label || id || '');
    const attrs = [`data-somf-art="${escapeAttr(id)}"`];
    if (typeof noticeKey === 'string' && noticeKey) {
      attrs.push(`data-somf-notice="${escapeAttr(noticeKey)}"`);
    }
    if (Number.isFinite(noticeIndex)) {
      attrs.push(`data-somf-index="${escapeAttr(String(noticeIndex))}"`);
    }
    const safeLabel = escapeHtml(rawLabel);
    const title = `Open artwork for ${rawLabel}`;
    attrs.push(`title="${escapeAttr(title)}"`);
    return `<a href="#" ${attrs.join(' ')}>${safeLabel}</a>`;
  }

  const LEGACY_STRUCTURED_SHARDS = [
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
        "created_by_shard": "WRAITH",
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
        "created_by_shard": "UPRISING",
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
        "created_by_shard": "UPRISING",
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
        "created_by_shard": "UPRISING",
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
        "created_by_shard": "UPRISING",
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

    }
  };

  const LEGACY_SHARD_BY_ID = Object.fromEntries(
    LEGACY_STRUCTURED_SHARDS
      .filter(shard => shard && typeof shard.id === 'string' && shard.id)
      .map(shard => [shard.id, shard])
  );

  const CURRENT_SHARDS = SHARDS_OF_MANY_FATES.map(plate => {
    if (!plate || typeof plate !== 'object' || typeof plate.id !== 'string') return null;
    const legacy = LEGACY_SHARD_BY_ID[plate.id];
    const merged = legacy ? { ...legacy } : {};
    merged.id = plate.id;
    merged.name = plate.name || merged.name || plate.id;
    merged.visual = plate.visual || merged.visual || '';
    merged.player = Array.isArray(plate.player)
      ? plate.player.slice()
      : (Array.isArray(merged.player) ? merged.player.slice() : []);
    merged.dm = Array.isArray(plate.dm)
      ? plate.dm.slice()
      : (Array.isArray(merged.dm) ? merged.dm.slice() : []);
    return merged;
  }).filter(Boolean);

  SOMF_DECK.shards = CURRENT_SHARDS;

  const RESOLVE_OPTIONS = [
    {name:'Stabilize the Fracture', desc:'Seal the shard in PFV Vault stasis to end its immediate fallout.'},
    {name:'Catalyze a Hero', desc:'Bind the shard to a PC or ally as a bespoke boon, mutation, or power surge.'},
    {name:'Prime a Mission Asset', desc:'Channel the shard into a base, vehicle, or downtime project to unlock new capabilities.'},
    {name:'Manifest a Fatebound NPC', desc:'Let the shard call, empower, or redeem a notable NPC tied to its omen.'},
    {name:'Let Fate Ripple', desc:'Resolve the shard through a narrative twist that reshapes faction clocks or campaign stakes.'},
  ];

  const PLATES = Array.isArray(SOMF_DECK.shards) ? SOMF_DECK.shards : [];
  const PLATE_BY_ID = Object.fromEntries(PLATES.map(plate => [plate.id, plate]));
  const FALLBACK_PLATE_BY_ID = LEGACY_SHARD_BY_ID;
  const ITEM_BY_ID = SOMF_DECK.items || {};
  const NPC_BY_ID = SOMF_DECK.npcs || {};
  const NPCS_BY_SHARD = Object.values(NPC_BY_ID).reduce((map, npc) => {
    const shard = npc?.created_by_shard;
    if (typeof shard !== 'string' || !shard) return map;
    if (!map[shard]) map[shard] = [];
    map[shard].push(npc);
    return map;
  }, {});

  const dom = {
    one: selector => document.querySelector(selector),
    all: selector => Array.from(document.querySelectorAll(selector)),
  };

  const formatNumber = value => typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString()
    : value;

  const words = value => typeof value === 'string' ? value.replace(/_/g, ' ') : '';

  function sentenceCase(text) {
    const value = words(text).trim();
    return value ? value[0].toUpperCase() + value.slice(1) : '';
  }

  function joinWithConjunction(list, conjunction = 'and') {
    const entries = list.filter(Boolean);
    if (!entries.length) return '';
    if (entries.length === 1) return entries[0];
    if (entries.length === 2) return `${entries[0]} ${conjunction} ${entries[1]}`;
    return `${entries.slice(0, -1).join(', ')}, ${conjunction} ${entries[entries.length - 1]}`;
  }

  const pluralize = (word, count) => (count === 1 ? word : `${word}s`);

  function preferReducedMotion() {
    try {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    } catch {
      return false;
    }
  }

  function normalizeHiddenValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    return undefined;
  }

  const Random = {
    int(max) {
      if (!Number.isFinite(max) || max <= 0) return 0;
      if (window.crypto?.getRandomValues) {
        const buffer = new Uint32Array(1);
        window.crypto.getRandomValues(buffer);
        return Math.floor((buffer[0] / 2 ** 32) * max);
      }
      return Math.floor(Math.random() * max);
    }
  };

  const localKey = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function readStorage(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota errors */
    }
  }

  function dispatch(type, detail) {
    if (typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent(type, { detail }));
    } else {
      const evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(type, false, false, detail);
      window.dispatchEvent(evt);
    }
  }

  const HiddenSync = (() => {
    if (typeof window === 'undefined') {
      return {
        broadcast() {},
        subscribe() { return () => {}; },
        restorePreparedState() {},
        prepareRefresh() {},
      };
    }

    const CHANNEL_NAME = 'somf-hidden-sync';
    const STORAGE_EVENT_KEY = 'somf:hidden-sync-event';
    const REFRESH_STATE_KEY = 'somf:hidden-sync-refresh';
    const sourceId = Math.random().toString(36).slice(2);
    const listeners = new Set();
    let broadcastChannel = null;

    function notify(detail) {
      listeners.forEach(listener => {
        try {
          listener(detail);
        } catch (err) {
          console.error(err);
        }
      });
    }

    function handleIncoming(raw) {
      if (!raw || typeof raw !== 'object') return;
      if (raw.source && raw.source === sourceId) return;
      if (raw.type !== 'hidden-sync') return;
      const normalized = { ...raw };
      const normalizedHidden = normalizeHiddenValue(normalized.hidden);
      normalized.hidden = typeof normalizedHidden === 'boolean' ? normalizedHidden : undefined;
      notify(normalized);
    }

    function ensureChannel() {
      if (broadcastChannel || typeof BroadcastChannel !== 'function') return broadcastChannel;
      try {
        broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
        const handler = event => handleIncoming(event?.data);
        if (typeof broadcastChannel.addEventListener === 'function') {
          broadcastChannel.addEventListener('message', handler);
        } else {
          broadcastChannel.onmessage = handler;
        }
      } catch (err) {
        console.error('Failed to establish hidden sync channel', err);
        broadcastChannel = null;
      }
      return broadcastChannel;
    }

    function storageListener(event) {
      if (event.key !== STORAGE_EVENT_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue);
        handleIncoming(parsed);
      } catch (err) {
        console.error('Failed to parse hidden sync storage payload', err);
      }
    }

    function prepareRefresh(reason = 'hidden-sync') {
      if (typeof sessionStorage === 'undefined') return;
      try {
        if (window.CC?.prepareForcedRefresh) {
          window.CC.prepareForcedRefresh();
        }
      } catch (err) {
        /* ignore prepare failures */
      }
      try {
        const state = {
          reason,
          ts: Date.now(),
          scrollX: Math.max(0, Math.round(window.scrollX || window.pageXOffset || 0)),
          scrollY: Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0)),
          hash: window.location.hash || '',
          focusId: document.activeElement?.id || null,
          launching: document.body?.classList?.contains('launching') || false,
        };
        sessionStorage.setItem(REFRESH_STATE_KEY, JSON.stringify(state));
      } catch (err) {
        console.error('Failed to cache refresh state', err);
      }
    }

    function restorePreparedState() {
      if (typeof sessionStorage === 'undefined') return;
      let parsed = null;
      try {
        const raw = sessionStorage.getItem(REFRESH_STATE_KEY);
        if (!raw) return;
        sessionStorage.removeItem(REFRESH_STATE_KEY);
        parsed = JSON.parse(raw);
      } catch (err) {
        console.error('Failed to restore refresh state', err);
        return;
      }
      if (!parsed || parsed.reason !== 'hidden-sync') return;

      try {
        if (parsed.launching && document.body?.classList?.contains('launching')) {
          document.body.classList.remove('launching');
        }
        document.body?.classList?.add('somf-hidden-refresh');
      } catch {
        /* ignore body mutations */
      }

      const applyScroll = () => {
        try {
          if (parsed.hash) {
            const target = document.querySelector(parsed.hash);
            if (target) {
              try {
                target.scrollIntoView({ block: 'center' });
              } catch {
                target.scrollIntoView();
              }
              return;
            }
          }
          window.scrollTo(parsed.scrollX || 0, parsed.scrollY || 0);
        } catch (err) {
          console.error('Failed to restore scroll position', err);
        }
      };

      const restoreFocus = () => {
        if (!parsed.focusId) return;
        const el = document.getElementById(parsed.focusId);
        if (!el) return;
        try {
          el.focus({ preventScroll: true });
        } catch {
          try { el.focus(); } catch { /* ignore focus errors */ }
        }
      };

      if (document.readyState === 'complete') {
        applyScroll();
        window.requestAnimationFrame(restoreFocus);
      } else {
        window.addEventListener('load', () => {
          applyScroll();
          window.requestAnimationFrame(restoreFocus);
        }, { once: true });
      }
    }

    function broadcast(campaignId, hidden, extra) {
      const extras = extra && typeof extra === 'object' ? extra : {};
      const detail = {
        type: 'hidden-sync',
        campaignId: campaignId || DEFAULT_CAMPAIGN_ID,
        hidden: !!hidden,
        ts: Date.now(),
        source: sourceId,
        ...extras,
      };

      let delivered = false;
      const channel = ensureChannel();
      if (channel) {
        try {
          channel.postMessage(detail);
          delivered = true;
        } catch (err) {
          console.error('Failed to post hidden sync message', err);
        }
      }

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(detail));
          window.setTimeout(() => {
            try {
              localStorage.removeItem(STORAGE_EVENT_KEY);
            } catch {
              /* ignore cleanup failures */
            }
          }, 0);
          delivered = true;
        }
      } catch (err) {
        console.error('Failed to write hidden sync storage event', err);
      }

      notify(detail);

      if (!delivered) {
        prepareRefresh();
        try {
          window.location.reload();
        } catch {
          /* ignore reload failures */
        }
      }
    }

    function subscribe(handler) {
      if (typeof handler !== 'function') return () => {};
      listeners.add(handler);
      return () => listeners.delete(handler);
    }

    ensureChannel();
    window.addEventListener('storage', storageListener);

    return {
      broadcast,
      subscribe,
      restorePreparedState,
      prepareRefresh,
    };
  })();

  HiddenSync.restorePreparedState();

  if (typeof window !== 'undefined') {
    window.SOMF_MIN = window.SOMF_MIN || {};
    window.SOMF_MIN.prepareHiddenRefresh = reason => HiddenSync.prepareRefresh(reason || 'hidden-sync');
  }

  async function runLightningFlash() {
    const flash = dom.one('#draw-flash');
    const lightning = dom.one('#draw-lightning');
    if (!flash) return;

    flash.classList.remove('show');
    if (preferReducedMotion()) {
      flash.hidden = true;
      if (lightning) { lightning.hidden = true; lightning.innerHTML = ''; }
      return;
    }

    flash.hidden = false;
    if (lightning) {
      lightning.hidden = false;
      lightning.innerHTML = '';
      for (let i = 0; i < 3; i += 1) {
        const bolt = document.createElement('div');
        bolt.className = 'bolt';
        bolt.style.left = `${10 + Math.random() * 80}%`;
        bolt.style.top = `${Math.random() * 60}%`;
        bolt.style.transform = `rotate(${Math.random() * 30 - 15}deg)`;
        bolt.style.animationDelay = `${i * 0.1}s`;
        lightning.appendChild(bolt);
      }
    }

    await new Promise(resolve => {
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        flash.classList.remove('show');
        flash.hidden = true;
        if (lightning) { lightning.hidden = true; lightning.innerHTML = ''; }
        flash.removeEventListener('animationend', cleanup);
        flash.removeEventListener('animationcancel', cleanup);
        resolve();
      };
      flash.addEventListener('animationend', cleanup);
      flash.addEventListener('animationcancel', cleanup);
      void flash.offsetWidth;
      flash.classList.add('show');
      setTimeout(cleanup, 1100);
    });
  }

  function showShardRevealAlert() {
    const overlay = dom.one('#somf-reveal-alert');
    const dismiss = overlay?.querySelector('[data-somf-reveal-dismiss]');
    const card = overlay?.querySelector('.somf-reveal-alert__card');
    if (!overlay || !dismiss) return Promise.resolve();

    const body = document.body;
    const suppressedBodyClasses = [];
    if (body?.classList?.contains('modal-open')) {
      try { body.classList.remove('modal-open'); } catch {}
      suppressedBodyClasses.push('modal-open');
    }
    if (body?.classList?.contains('touch-controls-disabled')) {
      try { body.classList.remove('touch-controls-disabled'); } catch {}
      suppressedBodyClasses.push('touch-controls-disabled');
    }

    const overlayWasInert = overlay.hasAttribute('inert');
    if (overlayWasInert) {
      try { overlay.removeAttribute('inert'); } catch {}
    }

    const previouslyFocused = document.activeElement;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-visible');
    document.body?.classList?.add('somf-reveal-active');

    const focusTarget = card || dismiss;
    window.requestAnimationFrame(() => {
      try { focusTarget?.focus({ preventScroll: true }); }
      catch {
        try { focusTarget?.focus(); } catch { /* ignore focus errors */ }
      }
    });

    return new Promise(resolve => {
      const cleanup = () => {
        overlay.classList.remove('is-visible');
        document.body?.classList?.remove('somf-reveal-active');

        if (body && suppressedBodyClasses.length) {
          suppressedBodyClasses.forEach(cls => {
            if (cls && !body.classList.contains(cls)) {
              try { body.classList.add(cls); } catch {}
            }
          });
        }

        const finalize = () => {
          if (overlayWasInert) {
            try { overlay.setAttribute('inert', ''); } catch {}
          }
          overlay.hidden = true;
          overlay.setAttribute('aria-hidden', 'true');
          if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
            try { previouslyFocused.focus({ preventScroll: true }); }
            catch { try { previouslyFocused.focus(); } catch { /* ignore */ } }
          }
          resolve();
        };

        if (preferReducedMotion()) {
          finalize();
          return;
        }

        let settled = false;
        const onTransitionEnd = () => {
          if (settled) return;
          settled = true;
          overlay.removeEventListener('transitionend', onTransitionEnd);
          finalize();
        };
        overlay.addEventListener('transitionend', onTransitionEnd);
        window.setTimeout(onTransitionEnd, 400);
      };

      const handleKey = event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          dismiss.removeEventListener('click', handleDismiss);
          overlay.removeEventListener('keydown', handleKey);
          cleanup();
        }
      };

      const handleDismiss = () => {
        dismiss.removeEventListener('click', handleDismiss);
        overlay.removeEventListener('keydown', handleKey);
        cleanup();
      };

      overlay.addEventListener('keydown', handleKey);
      dismiss.addEventListener('click', handleDismiss);
    });
  }

  let revealSequencePromise = null;
  function triggerShardRevealEffects(options = {}) {
    const { showAlert = true } = typeof options === 'object' && options ? options : {};
    if (revealSequencePromise) return revealSequencePromise;
    revealSequencePromise = (async () => {
      await runLightningFlash();
      if (showAlert) {
        await showShardRevealAlert();
      }
      try { HiddenSync.prepareRefresh('hidden-sync'); }
      catch { /* ignore prep errors */ }
      try { window.location.reload(); }
      catch (err) { console.error('Failed to reload after shard reveal', err); }
    })().finally(() => {
      revealSequencePromise = null;
    });
    return revealSequencePromise;
  }

  const toArray = value => {
    if (Array.isArray(value)) return value.slice();
    if (!value || typeof value !== 'object') return [];
    const keys = Object.keys(value);
    keys.sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      const aIsNum = Number.isFinite(na);
      const bIsNum = Number.isFinite(nb);
      if (aIsNum && bIsNum) return na - nb;
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      return a.localeCompare(b);
    });
    return keys.map(key => value[key]);
  };

  const toStringList = value => toArray(value)
    .map(item => {
      if (typeof item === 'string') return item.trim();
      if (item == null) return '';
      try {
        return String(item).trim();
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  const describeItem = (itemId, quantity = 1) => {
    const item = ITEM_BY_ID[itemId];
    const name = item?.name || sentenceCase(itemId);
    const suffix = quantity > 1 ? ` ×${quantity}` : '';
    return `${name}${suffix}`.trim();
  };

  const describeNpc = npcId => {
    const npc = NPC_BY_ID[npcId];
    return npc?.name || sentenceCase(npcId);
  };

  function summarizeChoiceOption(option) {
    if (option == null) return '';
    if (typeof option === 'string') return option;
    if (typeof option === 'number') return formatNumber(option);
    if (Array.isArray(option)) return option.map(summarizeChoiceOption).filter(Boolean).join(', ');
    if (typeof option !== 'object') return String(option);
    if (option.type) return summarizeEffect(option);
    const entries = Object.entries(option);
    if (entries.length === 1) {
      const [key, value] = entries[0];
      switch (key) {
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
      .map(([key, value]) => `${sentenceCase(key)}: ${summarizeChoiceOption(value)}`.trim())
      .join(', ');
  }

  function summarizeEffect(effect) {
    if (effect == null) return '';
    if (typeof effect === 'string') return effect;
    if (Array.isArray(effect)) return effect.map(summarizeEffect).filter(Boolean).join(' ');
    if (typeof effect !== 'object') return String(effect);
    const { type } = effect;
    if (!type) return summarizeChoiceOption(effect);
    switch (type) {
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
      case 'grant_item':
        return `Gain ${describeItem(effect.item_id, effect.quantity)}`;
      case 'ability_score_increase_perm': {
        const value = Number(effect.value) || 0;
        const cap = effect.cap ? ` (cap ${effect.cap})` : '';
        const count = Number(effect.count) || 1;
        if (effect.ability) {
          return `Increase ${effect.ability.toUpperCase()} by +${value} permanently${cap}`;
        }
        if (effect.ability_choice) {
          return `Increase an ability of your choice by +${value} permanently${cap}`;
        }
        if (effect.choices?.length) {
          const list = joinWithConjunction(effect.choices.map(choice => choice.toUpperCase()), 'or');
          const pick = count > 1 ? `${count} different abilities` : 'one ability';
          return `Increase ${pick} (${list}) by +${value} permanently${cap}`;
        }
        return `Increase ability score by +${value} permanently${cap}`;
      }
      case 'skill_bonus_perm': {
        const value = Number(effect.value) || 0;
        if (effect.target_skill_choice) return `Gain a permanent +${value} bonus to a skill of your choice`;
        if (effect.skill) return `Gain a permanent +${value} bonus to ${sentenceCase(effect.skill)}`;
        return `Gain a permanent +${value} skill bonus`;
      }
      case 'choose_one':
      case 'choice': {
        const label = type === 'choose_one' ? 'Choose one' : 'Choose';
        const options = (effect.options || []).map(option => summarizeChoiceOption(option)).filter(Boolean);
        return options.length ? `${label}: ${options.join('; ')}` : label;
      }
      case 'flag_next_combat_bounty': {
        const condition = words(effect.condition || '').trim();
        const rewards = (effect.rewards || []).map(entry => summarizeEffect(entry)).filter(Boolean).join('; ');
        return `Next combat bounty — if ${condition || 'the condition is met'}, gain ${rewards}`.trim();
      }
      case 'declare_two_mechanical_weaknesses_on_next_boss':
        return 'GM declares two mechanical weaknesses on the next boss';
      case 'downtime_advantage': {
        const uses = Number(effect.uses) || 1;
        const task = sentenceCase(effect.task || 'a downtime task');
        return `Gain advantage on ${task} downtime ${pluralize('check', uses)} (${uses} use${uses === 1 ? '' : 's'})`;
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
        const methods = (effect.methods || []).map(method => {
          if (method.downtime) {
            const parts = [`${method.downtime} downtime`];
            if (method.dc) parts.push(`DC ${method.dc}`);
            if (method.successes_required) parts.push(`${method.successes_required} ${pluralize('success', method.successes_required)}`);
            return parts.join(', ');
          }
          if (method.item) {
            const parts = [`Use ${describeItem(method.item)}`];
            if (method.special_counter) parts.push(words(method.special_counter));
            return parts.join(' — ');
          }
          return Object.entries(method)
            .map(([key, value]) => `${sentenceCase(key)}: ${summarizeChoiceOption(value)}`.trim())
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
        const parts = ['The drawer is imprisoned and removed from play'];
        if (effect.rescue) {
          const rescue = [];
          if (effect.rescue.mission_required) rescue.push('requires a focused mission');
          if (effect.rescue.scenes_required) rescue.push(`at least ${effect.rescue.scenes_required} ${pluralize('scene', effect.rescue.scenes_required)}`);
          if (effect.rescue.fail_consequence) rescue.push(`failure: ${effect.rescue.fail_consequence}`);
          if (rescue.length) parts.push(`Rescue ${rescue.join('; ')}`);
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
        return `Immediately draw ${count} additional ${pool} shard${count === 1 ? '' : 's'}`;
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
      case 'destroy_equipped_items': {
        const count = Number(effect.count) || 1;
        return `Destroy ${count} equipped ${pluralize('item', count)} (${words(effect.priority?.join?.(', ') || effect.priority) || 'GM choice'})`;
      }
      case 'immediate_theft': {
        const priority = effect.steal?.priority ? words(effect.steal.priority) : 'an item';
        const fallback = effect.steal?.fallback_credits ? ` (or ${formatNumber(effect.steal.fallback_credits)} cr)` : '';
        return `An enemy steals ${priority}${fallback}`.trim();
      }
      case 'grant_free_boost_roll':
        return `Gain a free ${effect.value || '+1d4'} boost roll`;
      case 'free_boost_roll_first_attack_vs_declared_enemy':
        return `Each ally gains a free ${effect.value || '+1d4'} boost on their first attack vs the declared enemy`;
      default:
        return Object.entries(effect)
          .map(([key, value]) => `${sentenceCase(key)}: ${summarizeChoiceOption(value)}`.trim())
          .join(', ');
    }
  }

  function plateForPlayer(plate) {
    if (!plate) {
      return { id: 'UNKNOWN', name: 'Unknown Shard', visual: '—', player: ['No effect data available.'], image: null };
    }
    if (Array.isArray(plate.player) && plate.player.length) {
      return {
        id: plate.id,
        name: plate.name || plate.id,
        visual: plate.visual || sentenceCase(plate.polarity ? `${plate.polarity} shard` : '') || '—',
        player: plate.player.slice(),
        image: shardArtById(plate.id),
      };
    }
    const lines = [];
    const effects = Array.isArray(plate.effect) ? plate.effect : (plate.effect ? [plate.effect] : []);
    effects.map(summarizeEffect).filter(Boolean).forEach(line => lines.push(line));
    if (plate.resolution) lines.push(`Resolution: ${plate.resolution}`);
    const visualParts = [];
    if (plate.visual) visualParts.push(plate.visual);
    if (!plate.visual && plate.polarity) visualParts.push(`${sentenceCase(plate.polarity)} shard`);
    if (plate.id) visualParts.push(`ID: ${plate.id}`);
    return {
      id: plate.id,
      name: plate.name || plate.id || 'Unknown Shard',
      visual: visualParts.filter(Boolean).join(' • ') || '—',
      player: lines.length ? lines : ['No effect data available.'],
      image: shardArtById(plate.id),
    };
  }

  function plateForDM(plate) {
    if (!plate) {
      return { id: 'UNKNOWN', name: 'Unknown Shard', desc: ['No GM information available.'] };
    }
    const name = plate.name || plate.id || 'Unknown Shard';
    if (Array.isArray(plate.dm) && plate.dm.length) {
      return { id: plate.id, name, desc: plate.dm.slice() };
    }
    const details = [];
    const effects = Array.isArray(plate.effect) ? plate.effect : (plate.effect ? [plate.effect] : []);
    effects.map(summarizeEffect).filter(Boolean).forEach(line => details.push(line));
    if (plate.requirements) {
      const reqEntries = Object.entries(plate.requirements)
        .map(([key, value]) => {
          if (value == null || value === false) return '';
          if (typeof value === 'boolean') {
            return sentenceCase(words(key));
          }
          return `${sentenceCase(words(key))}: ${summarizeChoiceOption(value)}`.trim();
        })
        .filter(Boolean);
      if (reqEntries.length) details.push(`Requirements: ${reqEntries.join('; ')}`);
    }
    if (plate.resolution) details.push(`Resolution: ${plate.resolution}`);
    if (!details.length) details.push('No GM information available.');
    return { id: plate.id, name, desc: details };
  }

  const Catalog = {
    shardIds() {
      return PLATES.map(plate => plate.id);
    },
    shuffleShardIds() {
      const ids = this.shardIds();
      for (let i = ids.length - 1; i > 0; i -= 1) {
        const j = Random.int(i + 1);
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      return ids;
    },
    shardById(id) {
      if (typeof id !== 'string' || !id) return null;
      return PLATE_BY_ID[id] || FALLBACK_PLATE_BY_ID[id] || null;
    },
    allShards() {
      return PLATES.slice();
    },
    allItems() {
      return Object.values(ITEM_BY_ID);
    },
    allNpcs() {
      return Object.values(NPC_BY_ID);
    },
    npcsByShard(shardId) {
      if (typeof shardId !== 'string' || !shardId) return [];
      const list = NPCS_BY_SHARD[shardId];
      return Array.isArray(list) ? list.slice() : [];
    },
    relatedNpcs(shardIds) {
      const seen = new Set();
      const results = [];
      toStringList(shardIds).forEach(id => {
        this.npcsByShard(id).forEach(npc => {
          const key = npc?.id || `${id}-${results.length}`;
          if (!key || seen.has(key)) return;
          seen.add(key);
          results.push(npc);
        });
      });
      return results;
    },
    resolveOptions() {
      return RESOLVE_OPTIONS.slice();
    },
    playerCard(plate) {
      return plateForPlayer(plate);
    },
    dmCard(plate) {
      return plateForDM(plate);
    },
    shardName(id) {
      return this.shardById(id)?.name || id;
    }
  };

  function normalizeTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value) {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) return asNumber;
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return Date.now();
  }

  function normalizeCount(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function normalizeNotice(raw) {
    if (!raw) return null;
    const ids = toStringList(raw.ids);
    let names = toStringList(raw.names);
    if (!names.length) {
      names = ids.map(id => Catalog.shardName(id)).filter(Boolean);
    }
    if (!names.length && typeof raw.name === 'string' && raw.name) {
      names = [raw.name];
    }
    if (!names.length) names = ['Unknown shard'];
    const ts = normalizeTimestamp(raw.ts);
    const count = normalizeCount(raw.count, ids.length || names.length || 0);
    const key = raw.key || raw.id || raw.noticeId || null;
    return { key, ids, names, ts, count };
  }

  const normalizeNoticeList = list => (Array.isArray(list) ? list : [])
    .map(normalizeNotice)
    .filter(Boolean)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  function pushLocalLimited(key, entry, limit = MAX_LOCAL_RECORDS) {
    const list = readStorage(key, []);
    if (!Array.isArray(list)) {
      writeStorage(key, [entry]);
      return [entry];
    }
    list.push(entry);
    if (list.length > limit) {
      list.splice(0, list.length - limit);
    }
    writeStorage(key, list);
    return list;
  }

  class LocalStore {
    constructor(campaignId) {
      this.setCampaign(campaignId || DEFAULT_CAMPAIGN_ID);
    }

    setCampaign(campaignId) {
      this.cid = campaignId || DEFAULT_CAMPAIGN_ID;
    }

    key(name) {
      const lookup = LOCAL_KEYS[name];
      return typeof lookup === 'function' ? lookup(this.cid) : '';
    }

    ensureDeck() {
      let deck = readStorage(this.key('deck'), null);
      if (!Array.isArray(deck) || !deck.every(id => typeof id === 'string')) {
        deck = Catalog.shuffleShardIds();
      }
      if (!deck.length) deck = Catalog.shuffleShardIds();
      writeStorage(this.key('deck'), deck);
      return deck.slice();
    }

    drawOne() {
      let deck = this.ensureDeck();
      if (!deck.length) {
        deck = Catalog.shuffleShardIds();
      }
      const index = Random.int(deck.length);
      const [id] = deck.splice(index, 1);
      writeStorage(this.key('deck'), deck);
      pushLocalLimited(this.key('audits'), { id, name: Catalog.shardName(id), ts: Date.now() }, MAX_LOCAL_RECORDS);
      dispatch('somf-local-deck', { action: 'draw', id });
      return id;
    }

    reset() {
      writeStorage(this.key('deck'), Catalog.shuffleShardIds());
      writeStorage(this.key('audits'), []);
      writeStorage(this.key('notices'), []);
      writeStorage(this.key('resolutions'), []);
      writeStorage(this.key('npcs'), []);
      dispatch('somf-local-deck', { action: 'reset' });
      dispatch('somf-local-notice', { action: 'reset' });
      dispatch('somf-local-resolution', { action: 'reset' });
    }

    pushNotice(payload) {
      const entry = normalizeNotice({ ...payload, key: payload.key || localKey('notice'), ts: payload.ts || Date.now() });
      pushLocalLimited(this.key('notices'), entry, MAX_LOCAL_RECORDS);
      dispatch('somf-local-notice', { key: entry.key, action: 'add', notice: entry });
      return entry;
    }

    loadNotices(limit = 30) {
      return normalizeNoticeList(readStorage(this.key('notices'), [])).slice(0, limit);
    }

    removeNotice(key) {
      const current = readStorage(this.key('notices'), []);
      const next = Array.isArray(current) ? current.filter(entry => entry?.key !== key) : [];
      writeStorage(this.key('notices'), next);
      dispatch('somf-local-notice', { key, action: 'remove' });
      return normalizeNoticeList(next);
    }

    pushResolutionBatch(ids) {
      const entry = { ids: toStringList(ids), ts: Date.now(), key: localKey('resolution') };
      pushLocalLimited(this.key('resolutions'), entry, MAX_LOCAL_RECORDS);
      dispatch('somf-local-resolution', { entry });
      return entry;
    }

    loadResolutions(limit = 50) {
      const list = readStorage(this.key('resolutions'), []);
      if (!Array.isArray(list)) return [];
      return list.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, limit);
    }

    async setHidden(hidden) {
      writeStorage(this.key('hidden'), !!hidden);
      dispatch('somf-local-hidden', !!hidden);
    }

    getHidden() {
      const stored = readStorage(this.key('hidden'));
      const normalized = normalizeHiddenValue(stored);
      return typeof normalized === 'boolean' ? normalized : true;
    }

    watchNotices(handler) {
      const listener = event => handler(event?.detail || {});
      window.addEventListener('somf-local-notice', listener);
      return () => window.removeEventListener('somf-local-notice', listener);
    }

    watchDeck(handler) {
      const listener = event => handler(event?.detail || {});
      window.addEventListener('somf-local-deck', listener);
      return () => window.removeEventListener('somf-local-deck', listener);
    }

    watchHidden(handler) {
      const listener = event => {
        const normalized = normalizeHiddenValue(event?.detail);
        handler(typeof normalized === 'boolean' ? normalized : undefined);
      };
      window.addEventListener('somf-local-hidden', listener);
      const storageHandler = evt => {
        if (!evt || evt.key !== this.key('hidden')) return;
        try {
          const value = evt.newValue ? JSON.parse(evt.newValue) : undefined;
          const normalized = normalizeHiddenValue(value);
          handler(typeof normalized === 'boolean' ? normalized : undefined);
        } catch {
          handler(undefined);
        }
      };
      window.addEventListener('storage', storageHandler);
      return () => {
        window.removeEventListener('somf-local-hidden', listener);
        window.removeEventListener('storage', storageHandler);
      };
    }
  }

  class RealtimeStore {
    constructor(db, campaignId) {
      this.setDatabase(db || null);
      this.setCampaign(campaignId || DEFAULT_CAMPAIGN_ID);
      this.noticeListeners = [];
      this.hiddenListener = null;
      this.hiddenSignalListener = null;
    }

    setDatabase(db) {
      this.db = db || null;
    }

    setCampaign(campaignId) {
      this.cid = campaignId || DEFAULT_CAMPAIGN_ID;
    }

    hasDatabase() {
      return !!this.db;
    }

    ref(name) {
      if (!this.hasDatabase()) throw new Error('Firebase database not configured');
      const path = REALTIME_PATHS[name];
      if (typeof path !== 'function') throw new Error(`Unknown path: ${name}`);
      return this.db.ref(path(this.cid));
    }

    async ensureDeck() {
      const deckRef = this.ref('deck');
      const snap = await deckRef.get();
      if (!snap.exists()) {
        const shuffled = Catalog.shuffleShardIds();
        await deckRef.set(shuffled);
        return shuffled.slice();
      }
      const value = snap.val();
      const arr = Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
      if (!arr.length) {
        const shuffled = Catalog.shuffleShardIds();
        await deckRef.set(shuffled);
        return shuffled.slice();
      }
      return arr;
    }

    async drawOne() {
      const deckRef = this.ref('deck');
      let drawnId = null;
      await deckRef.transaction(current => {
        let deck = Array.isArray(current) ? current.slice() : [];
        if (!deck.length) deck = Catalog.shuffleShardIds();
        const index = Random.int(deck.length);
        drawnId = deck.splice(index, 1)[0];
        return deck;
      });
      await this.ref('audits').push({ id: drawnId, name: Catalog.shardName(drawnId), ts: this.db.ServerValue.TIMESTAMP });
      return drawnId;
    }

    async reset() {
      await this.ref('deck').set(Catalog.shuffleShardIds());
      await this.ref('audits').remove();
      await this.ref('notices').remove();
      await this.ref('resolutions').remove();
      await this.ref('npcs').remove();
    }

    async pushNotice(payload) {
      const noticeRef = this.ref('notices').push();
      const data = { count: payload.count, ids: payload.ids, names: payload.names, ts: this.db.ServerValue.TIMESTAMP };
      await noticeRef.set(data);
      return normalizeNotice({ ...data, ts: Date.now(), key: noticeRef.key });
    }

    async loadNotices(limit = 30) {
      const snap = await this.ref('notices').get();
      if (!snap.exists()) return [];
      const collected = [];
      snap.forEach(child => {
        collected.push(normalizeNotice({ key: child.key, ...child.val() }));
      });
      const sorted = collected.filter(Boolean).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return sorted.slice(0, limit);
    }

    async removeNotice(key) {
      await this.ref('notices').child(key).remove();
    }

    async pushResolutionBatch(ids) {
      await this.ref('resolutions').push({ ids: toStringList(ids), ts: this.db.ServerValue.TIMESTAMP });
    }

    async loadResolutions(limit = 50) {
      const snap = await this.ref('resolutions').get();
      if (!snap.exists()) return [];
      const collected = [];
      snap.forEach(child => {
        const value = child.val();
        collected.push({ key: child.key, ids: toStringList(value?.ids), ts: normalizeTimestamp(value?.ts) });
      });
      return collected.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, limit);
    }

    async setHidden(hidden) {
      await this.ref('hidden').set(!!hidden);
    }

    async pushHiddenSignal(hidden, payload = {}) {
      const signalsRef = this.ref('hiddenSignals').push();
      const data = {
        hidden: !!hidden,
        ts: this.db.ServerValue.TIMESTAMP,
      };
      const signalId = typeof payload.signalId === 'string' && payload.signalId ? payload.signalId : null;
      const source = typeof payload.source === 'string' && payload.source ? payload.source : null;
      if (signalId) data.signalId = signalId;
      if (source) data.source = source;
      await signalsRef.set(data);
      return {
        key: signalsRef.key,
        hidden: !!hidden,
        ts: Date.now(),
        signalId,
        source,
      };
    }

    async getHidden() {
      const snap = await this.ref('hidden').get();
      if (!snap.exists()) return true;
      const value = snap.val();
      const normalized = normalizeHiddenValue(value);
      return typeof normalized === 'boolean' ? normalized : true;
    }

    watchNotices(callbacks) {
      this.unwatchNotices();
      if (!this.hasDatabase()) return () => {};
      const ref = this.ref('notices');
      const limitRef = typeof ref.limitToLast === 'function' ? ref.limitToLast(1) : ref;
      const added = limitRef.on('child_added', snap => {
        const value = normalizeNotice({ key: snap.key, ...snap.val() });
        if (value && callbacks?.onAdd) callbacks.onAdd(value);
        if (callbacks?.onChange) callbacks.onChange();
      });
      const removed = ref.on('child_removed', snap => {
        if (callbacks?.onRemove) callbacks.onRemove({ key: snap.key });
        if (callbacks?.onChange) callbacks.onChange();
      });
      this.noticeListeners = [
        () => { if (typeof limitRef.off === 'function') limitRef.off('child_added', added); },
        () => { if (typeof ref.off === 'function') ref.off('child_removed', removed); }
      ];
      return () => this.unwatchNotices();
    }

    unwatchNotices() {
      this.noticeListeners.forEach(fn => fn());
      this.noticeListeners = [];
    }

    watchHidden(handler) {
      this.unwatchHidden();
      if (!this.hasDatabase()) return () => {};
      const ref = this.ref('hidden');
      const listener = snap => {
        const value = snap?.val();
        const normalized = normalizeHiddenValue(value);
        handler(typeof normalized === 'boolean' ? normalized : undefined);
      };
      ref.on('value', listener);
      this.hiddenListener = () => { if (typeof ref.off === 'function') ref.off('value', listener); };
      return () => this.unwatchHidden();
    }

    unwatchHidden() {
      if (this.hiddenListener) {
        this.hiddenListener();
        this.hiddenListener = null;
      }
    }

    watchHiddenSignals(handler) {
      this.unwatchHiddenSignals();
      if (!this.hasDatabase()) return () => {};
      const ref = this.ref('hiddenSignals');
      const limitRef = typeof ref.limitToLast === 'function' ? ref.limitToLast(10) : ref;
      const listener = limitRef.on('child_added', snap => {
        const value = snap?.val() || {};
        const normalizedHidden = normalizeHiddenValue(value.hidden);
        if (typeof normalizedHidden !== 'boolean') return;
        const detail = {
          key: snap.key,
          hidden: normalizedHidden,
          ts: normalizeTimestamp(value.ts),
          source: typeof value.source === 'string' && value.source ? value.source : null,
          signalId: typeof value.signalId === 'string' && value.signalId ? value.signalId : null,
        };
        handler(detail);
      });
      this.hiddenSignalListener = () => {
        if (typeof limitRef.off === 'function') limitRef.off('child_added', listener);
      };
      return () => this.unwatchHiddenSignals();
    }

    unwatchHiddenSignals() {
      if (this.hiddenSignalListener) {
        this.hiddenSignalListener();
        this.hiddenSignalListener = null;
      }
    }
  }

  class SomfRuntime {
    constructor() {
      this.catalog = Catalog;
      this.campaignId = window._somf_cid || DEFAULT_CAMPAIGN_ID;
      this.localStore = new LocalStore(this.campaignId);
      this.realtimeStore = window._somf_db ? new RealtimeStore(window._somf_db, this.campaignId) : null;
      this.player = null;
      this.dm = null;
      this.modeListeners = new Set();
      this.hiddenSignalSource = Math.random().toString(36).slice(2);
      this.hiddenSignalCache = new Set();
      const storedSignal = readStorage(LOCAL_KEYS.hiddenSignal(this.campaignId));
      if (storedSignal && typeof storedSignal === 'object') {
        const storedId = typeof storedSignal.id === 'string' && storedSignal.id ? storedSignal.id : null;
        const storedTs = Number(storedSignal.ts);
        this.lastProcessedHiddenSignal = storedId
          ? { id: storedId, ts: Number.isFinite(storedTs) ? storedTs : 0 }
          : null;
      } else if (typeof storedSignal === 'string' && storedSignal) {
        this.lastProcessedHiddenSignal = { id: storedSignal, ts: 0 };
      } else {
        this.lastProcessedHiddenSignal = null;
      }

      window.SOMF_MIN = window.SOMF_MIN || {};
      window.SOMF_MIN.setFirebase = db => this.setFirebase(db);
      window.SOMF_MIN.setCampaignId = id => this.setCampaignId(id);
      if (!window._somf_db && this.realtimeStore) {
        this.realtimeStore.setDatabase(null);
      }
    }

    setFirebase(db) {
      window._somf_db = db || null;
      if (db) {
        if (this.realtimeStore) {
          this.realtimeStore.setDatabase(db);
          this.realtimeStore.setCampaign(this.campaignId);
        } else {
          this.realtimeStore = new RealtimeStore(db, this.campaignId);
        }
      } else if (this.realtimeStore) {
        this.realtimeStore.setDatabase(null);
      }
      this.notifyModeChange();
    }

    setCampaignId(id) {
      const next = id || DEFAULT_CAMPAIGN_ID;
      this.campaignId = next;
      window._somf_cid = next;
      this.localStore.setCampaign(next);
      if (this.realtimeStore) this.realtimeStore.setCampaign(next);
      this.hiddenSignalCache.clear();
      const storedSignal = readStorage(LOCAL_KEYS.hiddenSignal(next));
      if (storedSignal && typeof storedSignal === 'object') {
        const storedId = typeof storedSignal.id === 'string' && storedSignal.id ? storedSignal.id : null;
        const storedTs = Number(storedSignal.ts);
        this.lastProcessedHiddenSignal = storedId
          ? { id: storedId, ts: Number.isFinite(storedTs) ? storedTs : 0 }
          : null;
      } else if (typeof storedSignal === 'string' && storedSignal) {
        this.lastProcessedHiddenSignal = { id: storedSignal, ts: 0 };
      } else {
        this.lastProcessedHiddenSignal = null;
      }
      this.notifyModeChange();
    }

    mode() {
      return this.hasRealtime() ? 'realtime' : 'local';
    }

    hasRealtime() {
      return !!(this.realtimeStore && this.realtimeStore.hasDatabase());
    }

    store() {
      return this.hasRealtime() ? this.realtimeStore : this.localStore;
    }

    onModeChange(listener) {
      this.modeListeners.add(listener);
      return () => this.modeListeners.delete(listener);
    }

    notifyModeChange() {
      const mode = this.mode();
      this.modeListeners.forEach(listener => {
        try { listener(mode); } catch (err) { console.error(err); }
      });
    }

    registerHiddenSignal(signalId, ts) {
      if (!signalId) return true;
      const normalizedTs = Number(ts);
      const last = this.lastProcessedHiddenSignal;
      if (last && last.id === signalId) return false;
      if (last && Number.isFinite(last.ts) && Number.isFinite(normalizedTs) && normalizedTs <= last.ts) return false;
      if (this.hiddenSignalCache.has(signalId)) return false;
      this.hiddenSignalCache.add(signalId);
      const record = {
        id: signalId,
        ts: Number.isFinite(normalizedTs) ? normalizedTs : Date.now(),
      };
      this.lastProcessedHiddenSignal = record;
      try {
        writeStorage(LOCAL_KEYS.hiddenSignal(this.campaignId), record);
      } catch { /* ignore storage errors */ }
      const clear = () => this.hiddenSignalCache.delete(signalId);
      try {
        setTimeout(clear, 5 * 60 * 1000);
      } catch {
        /* ignore timer errors */
      }
      return true;
    }

    async emitHiddenSignal(hidden, signalId) {
      if (!this.hasRealtime() || !this.realtimeStore?.pushHiddenSignal) return;
      try {
        await this.realtimeStore.pushHiddenSignal(hidden, { signalId, source: this.hiddenSignalSource });
      } catch (err) {
        console.error('Failed to push hidden toggle signal', err);
      }
    }

    onHiddenSignal(handler) {
      if (typeof handler !== 'function') return () => {};
      const disposers = [];
      const process = detail => {
        if (!detail || typeof detail.hidden !== 'boolean') return;
        const signalId = typeof detail.signalId === 'string' && detail.signalId ? detail.signalId : null;
        if (!this.registerHiddenSignal(signalId, detail.ts)) return;
        handler({ ...detail, signalId });
      };

      if (this.hasRealtime() && this.realtimeStore?.watchHiddenSignals) {
        disposers.push(this.realtimeStore.watchHiddenSignals(detail => {
          process({ ...detail, transport: 'realtime' });
        }));
      }

      disposers.push(HiddenSync.subscribe(detail => {
        if (!detail || detail.campaignId !== this.campaignId) return;
        const normalized = normalizeHiddenValue(detail.hidden);
        if (typeof normalized !== 'boolean') return;
        process({
          hidden: normalized,
          ts: detail.ts || Date.now(),
          source: detail.source || null,
          signalId: typeof detail.signalId === 'string' && detail.signalId ? detail.signalId : null,
          transport: 'broadcast',
        });
      }));

      return () => {
        disposers.forEach(fn => { if (typeof fn === 'function') fn(); });
      };
    }

    async draw(count) {
      const n = Math.max(1, Math.min(PLATES.length, Number(count) || 1));
      const store = this.store();
      if (store.ensureDeck) await store.ensureDeck();
      const ids = [];
      for (let i = 0; i < n; i += 1) {
        ids.push(await store.drawOne());
      }
      const names = ids.map(id => this.catalog.shardName(id));
      const notice = await store.pushNotice({ count: n, ids, names, ts: Date.now() });
      return notice;
    }

    async loadNotices(limit = 30) {
      const store = this.store();
      return store.loadNotices ? store.loadNotices(limit) : [];
    }

    async removeNotice(key) {
      const store = this.store();
      if (store.removeNotice) await store.removeNotice(key);
    }

    async pushResolutionBatch(ids) {
      const store = this.store();
      if (store.pushResolutionBatch) await store.pushResolutionBatch(ids);
    }

    async loadResolutions(limit = 50) {
      const store = this.store();
      return store.loadResolutions ? store.loadResolutions(limit) : [];
    }

    async resetDeck() {
      const store = this.store();
      if (store.reset) await store.reset();
    }

    async deckCount() {
      const store = this.store();
      if (store.ensureDeck) {
        const deck = await store.ensureDeck();
        return deck.length;
      }
      return Catalog.shardIds().length;
    }

    async setHidden(hidden) {
      const store = this.store();
      const normalized = !!hidden;
      if (store.setHidden) await store.setHidden(normalized);
      const signalId = `${this.hiddenSignalSource}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
      writeStorage(LOCAL_KEYS.hidden(this.campaignId), normalized);
      HiddenSync.broadcast(this.campaignId, normalized, { signalId });
      await this.emitHiddenSignal(normalized, signalId);
    }

    async getHidden() {
      const store = this.store();
      if (store.getHidden) {
        const value = await store.getHidden();
        const normalized = normalizeHiddenValue(value);
        if (typeof normalized === 'boolean') return normalized;
      }
      const fallback = normalizeHiddenValue(readStorage(LOCAL_KEYS.hidden(this.campaignId)));
      return typeof fallback === 'boolean' ? fallback : true;
    }

    watchNotices(callbacks) {
      if (this.hasRealtime()) {
        return this.realtimeStore.watchNotices(callbacks);
      }
      return this.localStore.watchNotices(detail => {
        if (detail.action === 'add' && callbacks?.onAdd) callbacks.onAdd(detail.notice);
        if (detail.action === 'remove' && callbacks?.onRemove) callbacks.onRemove({ key: detail.key });
        if (callbacks?.onChange) callbacks.onChange();
      });
    }

    watchDeck(handler) {
      if (this.hasRealtime()) {
        // Realtime deck updates are already captured via notice listeners; fallback to no-op
        return () => {};
      }
      return this.localStore.watchDeck(handler);
    }

    watchHidden(handler) {
      const safeHandler = value => {
        const normalized = normalizeHiddenValue(value);
        if (typeof normalized === 'boolean') {
          handler(normalized);
        }
      };

      const unsubStore = this.hasRealtime()
        ? this.realtimeStore.watchHidden(val => safeHandler(val))
        : this.localStore.watchHidden(val => safeHandler(val));

      const unsubBroadcast = HiddenSync.subscribe(detail => {
        if (!detail || detail.campaignId !== this.campaignId) return;
        if (typeof detail.hidden === 'boolean') handler(detail.hidden);
      });

      return () => {
        if (typeof unsubStore === 'function') unsubStore();
        if (typeof unsubBroadcast === 'function') unsubBroadcast();
      };
    }

    attachPlayer() {
      if (!this.player) {
        this.player = new PlayerController(this);
      }
      this.player.attach();
    }

    ensureDM() {
      if (!this.dm) {
        this.dm = new DMController(this);
      }
      this.dm.attach();
      return this.dm;
    }

    openDM(opts = {}) {
      const controller = this.ensureDM();
      controller.open(opts);
    }
  }

  class PlayerController {
    constructor(runtime) {
      this.runtime = runtime;
      this.dom = {};
      this.queue = [];
      this.queueIndex = 0;
      this.modeCleanup = null;
      this.noticeCleanup = null;
      this.hiddenCleanup = null;
      this.deckCleanup = null;
      this.tempArtwork = null;
      this.lastHiddenState = null;
      this.hiddenSignalCleanup = null;
      this.revealInviteQueue = [];
      this.revealInviteActive = null;
      this.revealInviteSeenSignals = new Set();
      this.lastRevealSignalDetail = null;
      this.revealInviteOverlayState = null;
      this.revealInviteAccepting = false;
      this.handleRevealInviteKeydown = event => this.onRevealInviteKeydown(event);
      const storedNotice = readStorage(LOCAL_KEYS.lastNotice(this.runtime.campaignId));
      if (storedNotice && typeof storedNotice === 'object') {
        const storedKey = typeof storedNotice.key === 'string' ? storedNotice.key : null;
        const storedTs = Number(storedNotice.ts);
        this.lastProcessedNotice = {
          key: storedKey,
          ts: Number.isFinite(storedTs) ? storedTs : 0,
        };
      } else {
        this.lastProcessedNotice = null;
      }
      this.pendingNoticeAdds = [];
      this.initialNoticesLoaded = false;
      this.seenNoticeKeys = new Set();
      this.playerToastData = null;
      this.toastEventsBound = false;
      this.toastShownHandler = evt => this.onGlobalToastShown(evt);
      this.toastDismissHandler = () => this.onGlobalToastDismissed();
      this.modalIsOpen = false;
    }

    attach() {
      this.captureDom();
      if (this.dom.count) this.dom.count.blur();
      if (this.dom.card) this.dom.card.hidden = true;
      this.bindEvents();
      this.bindToastHandlers();
      this.subscribe();
      this.loadInitialState();
    }

    captureDom() {
      this.dom = {
        count: dom.one('#somf-min-count'),
        drawBtn: dom.one('#somf-min-draw'),
        card: dom.one('#somf-min'),
        modal: dom.one('#somf-min-modal'),
        backdrop: dom.one('#somf-min-modal [data-somf-dismiss]'),
        close: dom.one('#somf-min-close'),
        image: dom.one('#somf-min-image'),
        revealInvite: dom.one('#somf-reveal-alert'),
        revealInviteCard: dom.one('#somf-reveal-alert .somf-reveal-alert__card'),
        revealInviteTitle: dom.one('#somf-reveal-title'),
        revealInviteMessage: dom.one('#somf-reveal-text'),
        revealInviteAccept: dom.one('#somf-reveal-alert [data-somf-reveal-dismiss]'),
      };
    }

    bindEvents() {
      if (this.dom.drawBtn && !this.dom.drawBtn.__somfBound) {
        this.dom.drawBtn.addEventListener('click', () => this.onDraw());
        this.dom.drawBtn.__somfBound = true;
      }
      if (this.dom.close && !this.dom.close.__somfBound) {
        this.dom.close.addEventListener('click', () => this.dismissCurrent());
        this.dom.close.__somfBound = true;
      }
      if (this.dom.modal && !this.dom.modal.__somfDismissBound) {
        this.dom.modal.addEventListener('click', evt => {
          const target = evt.target;
          if (target === this.dom.modal || target === this.dom.backdrop || target?.dataset?.somfDismiss !== undefined) {
            this.dismissCurrent();
          }
        });
        this.dom.modal.__somfDismissBound = true;
      }
      this.bindRevealInviteEvents();
    }

    bindRevealInviteEvents() {
      const { revealInvite, revealInviteAccept } = this.dom;
      if (revealInviteAccept && !revealInviteAccept.__somfBound) {
        revealInviteAccept.addEventListener('click', () => this.acceptRevealInvite());
        revealInviteAccept.__somfBound = true;
      }
      if (revealInvite && !revealInvite.__somfKeyBound) {
        revealInvite.addEventListener('keydown', this.handleRevealInviteKeydown);
        revealInvite.__somfKeyBound = true;
      }
    }

    onRevealInviteKeydown(event) {
      if (event.key === 'Escape' && this.revealInviteActive) {
        event.preventDefault();
        this.dismissRevealInvite();
      }
    }

    populateRevealInvite() {
      if (this.dom.revealInviteTitle) {
        this.dom.revealInviteTitle.textContent = 'The Shards of Many Fates';
      }
      if (this.dom.revealInviteMessage) {
        this.dom.revealInviteMessage.textContent = 'The Shards of Many Fates have revealed themselves to you, do you dare tempt Fate?';
      }
      if (this.dom.revealInviteAccept) {
        this.dom.revealInviteAccept.textContent = 'Eeehhhhh…';
      }
    }

    openRevealInvite() {
      const overlay = this.dom.revealInvite;
      if (!overlay) return;
      const body = document.body;
      const suppressedClasses = [];
      if (body?.classList?.contains('modal-open')) {
        try { body.classList.remove('modal-open'); }
        catch {}
        suppressedClasses.push('modal-open');
      }
      if (body?.classList?.contains('touch-controls-disabled')) {
        try { body.classList.remove('touch-controls-disabled'); }
        catch {}
        suppressedClasses.push('touch-controls-disabled');
      }
      const overlayWasInert = overlay.hasAttribute('inert');
      if (overlayWasInert) {
        try { overlay.removeAttribute('inert'); }
        catch {}
      }
      const previouslyFocused = typeof document !== 'undefined' ? document.activeElement : null;
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      overlay.classList.add('is-visible');
      body?.classList?.add('somf-reveal-active');
      this.revealInviteOverlayState = { suppressedClasses, overlayWasInert, previouslyFocused };
      const focusTarget = this.dom.revealInviteAccept
        || this.dom.revealInviteCard
        || overlay.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const focus = () => {
        if (!focusTarget) return;
        try { focusTarget.focus({ preventScroll: true }); }
        catch {
          try { focusTarget.focus(); }
          catch { /* ignore focus errors */ }
        }
      };
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(focus);
      } else {
        setTimeout(focus, 0);
      }
    }

    closeRevealInvite() {
      const overlay = this.dom.revealInvite;
      if (!overlay) return;
      const state = this.revealInviteOverlayState || {};
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.body?.classList?.remove('somf-reveal-active');
      const suppressed = Array.isArray(state.suppressedClasses) ? state.suppressedClasses : [];
      if (suppressed.length && document.body) {
        suppressed.forEach(cls => {
          if (cls && !document.body.classList.contains(cls)) {
            try { document.body.classList.add(cls); }
            catch {}
          }
        });
      }
      if (state.overlayWasInert) {
        try { overlay.setAttribute('inert', ''); }
        catch {}
      }
      const { previouslyFocused } = state;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus({ preventScroll: true }); }
        catch {
          try { previouslyFocused.focus(); }
          catch { /* ignore focus errors */ }
        }
      }
      const finalize = () => {
        overlay.hidden = true;
        overlay.removeEventListener('transitionend', finalize);
      };
      if (preferReducedMotion()) {
        finalize();
      } else {
        overlay.addEventListener('transitionend', finalize);
        window.setTimeout(finalize, 400);
      }
      this.revealInviteOverlayState = null;
    }

    showNextRevealInvite() {
      if (this.revealInviteActive || !this.revealInviteQueue.length) return;
      const next = this.revealInviteQueue.shift();
      this.revealInviteActive = next;
      this.populateRevealInvite(next);
      this.openRevealInvite();
    }

    enqueueRevealInvite(detail = {}) {
      if (!this.dom.revealInvite) return;
      const signalId = typeof detail.signalId === 'string' && detail.signalId ? detail.signalId : null;
      if (signalId) {
        if (this.revealInviteSeenSignals.has(signalId)) return;
        this.revealInviteSeenSignals.add(signalId);
      } else if (this.revealInviteActive || this.revealInviteQueue.some(entry => !entry.signalId)) {
        return;
      }
      const ts = Number(detail.ts);
      const entry = {
        signalId,
        ts: Number.isFinite(ts) ? ts : Date.now(),
      };
      this.revealInviteQueue.push(entry);
      this.revealInviteQueue.sort((a, b) => (a.ts || 0) - (b.ts || 0));
      this.showNextRevealInvite();
    }

    dismissRevealInvite() {
      if (this.revealInviteActive) {
        this.revealInviteActive = null;
      }
      this.closeRevealInvite();
      this.showNextRevealInvite();
    }

    async acceptRevealInvite() {
      if (this.revealInviteAccepting) return;
      if (!this.revealInviteActive) {
        this.closeRevealInvite();
        return;
      }
      this.revealInviteAccepting = true;
      const acceptBtn = this.dom.revealInviteAccept;
      if (acceptBtn) acceptBtn.disabled = true;
      this.revealInviteActive = null;
      this.closeRevealInvite();
      try {
        await triggerShardRevealEffects({ showAlert: false });
      } catch (err) {
        console.error('Failed to trigger shard reveal sequence', err);
      } finally {
        if (acceptBtn) acceptBtn.disabled = false;
        this.revealInviteAccepting = false;
      }
      this.showNextRevealInvite();
    }


    subscribe() {
      if (this.modeCleanup) this.modeCleanup();
      this.modeCleanup = this.runtime.onModeChange(() => {
        this.setupWatchers();
        this.reloadNotices();
      });
      this.setupWatchers();
    }

    setupWatchers() {
      if (this.noticeCleanup) this.noticeCleanup();
      this.noticeCleanup = this.runtime.watchNotices({
        onAdd: notice => this.handleNoticeAdded(notice),
        onChange: () => this.reloadNotices(),
      });
      if (this.hiddenCleanup) this.hiddenCleanup();
      this.hiddenCleanup = this.runtime.watchHidden(value => {
        if (typeof value === 'boolean') this.applyHiddenState(value);
      });
      if (this.hiddenSignalCleanup) this.hiddenSignalCleanup();
      this.hiddenSignalCleanup = this.runtime.onHiddenSignal(detail => this.handleHiddenSignal(detail));
    }

    async loadInitialState() {
      await this.reloadNotices();
      const hidden = await this.runtime.getHidden();
      this.applyHiddenState(hidden);
      this.initialNoticesLoaded = true;
      this.flushPendingNoticeAdds();
    }

    async reloadNotices() {
      const notices = await this.runtime.loadNotices(50);
      this.setNotices(notices);
    }

    setNotices(notices) {
      this.notices = normalizeNoticeList(notices || []);
      if (!this.initialNoticesLoaded) {
        const pendingKeys = new Set(this.pendingNoticeAdds
          .map(entry => (entry && typeof entry.key === 'string') ? entry.key : null)
          .filter(key => typeof key === 'string' && key));
        this.seenNoticeKeys = new Set(
          this.notices
            .map(entry => (entry && typeof entry.key === 'string') ? entry.key : null)
            .filter(key => typeof key === 'string' && key && !pendingKeys.has(key))
        );
      }
      const nextQueue = [];
      this.notices.forEach(notice => {
        const ids = toStringList(notice.ids);
        if (ids.length) {
          ids.forEach((id, index) => {
            const plate = Catalog.playerCard(Catalog.shardById(id));
            const name = notice.names?.[index] || plate.name || Catalog.shardName(id);
            nextQueue.push({ ...plate, name, _noticeKey: notice.key, _noticeIndex: index, _noticeTs: notice.ts || 0 });
          });
        } else {
          nextQueue.push({ id: notice.key, name: notice.names.join(', '), visual: '—', player: ['No effect data available.'], image: null, _noticeKey: notice.key, _noticeIndex: 0, _noticeTs: notice.ts || 0 });
        }
      });
      const previousEntry = this.queue[this.queueIndex];
      this.queue = nextQueue;
      if (previousEntry) {
        const signature = `${previousEntry._noticeKey || ''}:${previousEntry._noticeIndex || 0}`;
        const idx = this.queue.findIndex(entry => `${entry._noticeKey || ''}:${entry._noticeIndex || 0}` === signature);
        this.queueIndex = idx >= 0 ? idx : 0;
      } else {
        this.queueIndex = 0;
      }
      this.render();
      if (!this.queue.length) this.closeModal();
    }

    render() {
      const total = this.queue.length;
      if (this.queueIndex >= total) {
        this.queueIndex = total ? total - 1 : 0;
      }
      const entry = total ? this.queue[this.queueIndex] : null;
      let src = '';
      let label = '';
      if (entry?.image) {
        src = entry.image;
        label = entry?.name || '';
        this.tempArtwork = null;
      } else if (this.tempArtwork?.image) {
        src = this.tempArtwork.image;
        label = this.tempArtwork.name || '';
      }
      if (this.dom.image) {
        if (src) {
          if (this.dom.image.getAttribute('src') !== src) {
            this.dom.image.setAttribute('src', src);
          }
          this.dom.image.hidden = false;
        } else {
          this.dom.image.removeAttribute('src');
          this.dom.image.hidden = true;
        }
        const altLabel = label ? `${label} artwork` : 'Shard artwork';
        this.dom.image.alt = altLabel;
      }
    }

    bindToastHandlers() {
      if (typeof window === 'undefined') return;
      const toastEl = document.getElementById('toast');
      if (toastEl && !toastEl.__somfPlayerBound) {
        toastEl.addEventListener('click', () => this.handlePlayerToastClick());
        toastEl.__somfPlayerBound = true;
      }
      if (!this.toastEventsBound) {
        window.addEventListener('cc:toast-shown', this.toastShownHandler);
        window.addEventListener('cc:toast-dismissed', this.toastDismissHandler);
        this.toastEventsBound = true;
      }
    }

    onGlobalToastShown(event) {
      const detail = event?.detail;
      const meta = detail && detail.options && detail.options.somf;
      if (!meta || meta.context !== 'player-shard') {
        this.clearPlayerToastState();
      }
    }

    onGlobalToastDismissed() {
      this.clearPlayerToastState();
    }

    clearPlayerToastState() {
      this.playerToastData = null;
      const toastEl = document.getElementById('toast');
      if (!toastEl) return;
      delete toastEl.dataset.somfContext;
      delete toastEl.dataset.somfShardId;
      delete toastEl.dataset.somfNoticeKey;
      delete toastEl.dataset.somfNoticeIndex;
      delete toastEl.dataset.somfShardName;
      toastEl.removeAttribute('role');
      toastEl.removeAttribute('aria-label');
      toastEl.style.removeProperty('cursor');
    }

    handlePlayerToastClick() {
      if (!this.playerToastData) return;
      const payload = { ...this.playerToastData };
      let handled = false;
      try {
        handled = this.showArtworkLink(payload);
      } catch {
        handled = false;
      }
      if (!handled) {
        this.openModal();
      }
      if (typeof window.dismissToast === 'function') {
        try { window.dismissToast(); }
        catch {}
      }
      this.clearPlayerToastState();
    }

    handleNoticeAdded(notice) {
      if (!notice) return;
      if (!this.initialNoticesLoaded) {
        this.addPendingNotice(notice);
        return;
      }
      this.processNoticeAdd(notice);
    }

    processNoticeAdd(notice) {
      if (!notice) return;
      const key = typeof notice.key === 'string' ? notice.key : null;
      if (key && this.seenNoticeKeys.has(key)) return;
      if (key && this.lastProcessedNotice?.key === key) return;
      const ts = Number(notice.ts);
      if (!key && this.lastProcessedNotice && Number.isFinite(this.lastProcessedNotice.ts) && Number.isFinite(ts) && ts <= this.lastProcessedNotice.ts) {
        return;
      }
      if (this.lastHiddenState === true) {
        this.addPendingNotice(notice);
        return;
      }
      if (key) this.seenNoticeKeys.add(key);
      this.announceNotice(notice);
    }

    addPendingNotice(notice) {
      if (!notice) return;
      const key = typeof notice.key === 'string' ? notice.key : null;
      if (key && this.pendingNoticeAdds.some(entry => entry && entry.key === key)) return;
      this.pendingNoticeAdds.push(notice);
    }

    flushPendingNoticeAdds() {
      if (!this.pendingNoticeAdds.length) return;
      if (this.lastHiddenState === true) return;
      const pending = this.pendingNoticeAdds.splice(0);
      pending.forEach(entry => this.processNoticeAdd(entry));
    }

    announceNotice(notice) {
      const ids = toStringList(notice.ids);
      const providedNames = Array.isArray(notice.names)
        ? notice.names.filter(name => typeof name === 'string' && name.trim())
        : [];
      const fallbackNames = ids
        .map(id => Catalog.shardName(id) || id)
        .filter(name => typeof name === 'string' && name);
      const displayNames = providedNames.length ? providedNames : fallbackNames;
      if (!displayNames.length) return;
      const noticeKey = typeof notice.key === 'string' ? notice.key : null;
      const namesForMessage = joinWithConjunction(displayNames);
      const message = `The Shards reveal ${namesForMessage}.`;
      const primaryId = ids[0] || null;
      this.showPlayerToast({
        message,
        id: primaryId,
        name: displayNames[0] || '',
        noticeKey,
        noticeIndex: 0,
      });
      const logPrefix = displayNames.length > 1 ? 'Revealed shards' : 'Revealed shard';
      const logMessage = `${logPrefix}: ${displayNames.join(', ')}`;
      this.logShardAnnouncement(logMessage);
      this.recordLastProcessedNotice(noticeKey, notice.ts);
    }

    showPlayerToast({ message, id, name, noticeKey, noticeIndex }) {
      if (typeof window === 'undefined' || typeof window.toast !== 'function') return;
      const normalizedIndex = Number.isFinite(noticeIndex) ? Number(noticeIndex) : null;
      const toastOptions = {
        type: 'info',
        duration: 8000,
        somf: {
          context: 'player-shard',
          shardId: typeof id === 'string' ? id : null,
          noticeKey: typeof noticeKey === 'string' && noticeKey ? noticeKey : null,
          noticeIndex: normalizedIndex,
        },
      };
      try {
        window.toast(message, toastOptions);
      } catch {}
      const toastEl = document.getElementById('toast');
      if (toastEl) {
        toastEl.dataset.somfContext = 'player-shard';
        toastEl.dataset.somfShardId = typeof id === 'string' ? id : '';
        toastEl.dataset.somfNoticeKey = typeof noticeKey === 'string' ? noticeKey : '';
        toastEl.dataset.somfNoticeIndex = normalizedIndex != null ? String(normalizedIndex) : '';
        toastEl.dataset.somfShardName = typeof name === 'string' ? name : '';
        toastEl.style.cursor = 'pointer';
        toastEl.setAttribute('role', 'button');
        if (typeof name === 'string' && name) {
          toastEl.setAttribute('aria-label', `View ${name} artwork`);
        } else {
          toastEl.setAttribute('aria-label', 'View shard artwork');
        }
      }
      this.playerToastData = {
        id: typeof id === 'string' ? id : null,
        noticeKey: typeof noticeKey === 'string' && noticeKey ? noticeKey : null,
        noticeIndex: normalizedIndex,
      };
    }

    logShardAnnouncement(text) {
      const message = typeof text === 'string' ? text.trim() : '';
      if (!message) return;
      try {
        if (typeof window.logAction === 'function') {
          window.logAction(`The Shards: ${message}`);
        }
      } catch {}
      try {
        if (typeof window.queueCampaignLogEntry === 'function') {
          window.queueCampaignLogEntry(message, { name: 'The Shards' });
        }
      } catch {}
    }

    recordLastProcessedNotice(key, ts) {
      const normalizedKey = typeof key === 'string' && key ? key : null;
      const numericTs = Number(ts);
      const normalizedTs = Number.isFinite(numericTs) && numericTs > 0 ? numericTs : Date.now();
      this.lastProcessedNotice = { key: normalizedKey, ts: normalizedTs };
      writeStorage(LOCAL_KEYS.lastNotice(this.runtime.campaignId), this.lastProcessedNotice);
    }

    showArtworkLink(opts = {}) {
      const idRaw = typeof opts.id === 'string' ? opts.id.trim() : '';
      if (!idRaw) return false;
      const noticeKey = typeof opts.noticeKey === 'string' ? opts.noticeKey : null;
      const noticeIndex = Number.isFinite(Number(opts.noticeIndex ?? opts.index))
        ? Number(opts.noticeIndex ?? opts.index)
        : null;
      const normalizedId = idRaw;
      let targetIndex = -1;
      if (this.queue.length) {
        targetIndex = this.queue.findIndex(entry => {
          if (!entry || entry.id !== normalizedId) return false;
          if (noticeKey && entry._noticeKey !== noticeKey) return false;
          if (noticeIndex != null && entry._noticeIndex !== noticeIndex) return false;
          return true;
        });
      }
      let image = null;
      let name = '';
      if (targetIndex >= 0) {
        const entry = this.queue[targetIndex];
        image = entry?.image || null;
        name = entry?.name || '';
        this.queueIndex = targetIndex;
        this.tempArtwork = null;
      } else {
        const plate = Catalog.playerCard(Catalog.shardById(normalizedId));
        if (plate?.image) {
          image = plate.image;
          name = plate.name || normalizedId;
        } else {
          const fallback = shardArtById(normalizedId);
          if (fallback) {
            image = fallback;
            name = Catalog.shardName(normalizedId) || normalizedId;
          }
        }
        this.tempArtwork = image ? { image, name } : null;
      }
      if (!image) return false;
      this.render();
      this.openModal();
      return true;
    }

    async onDraw() {
      if (this.dom.count) this.dom.count.blur();
      if (!confirm('The Fates are fickle, are you sure you wish to draw from the Shards?')) return;
      if (!confirm('This cannot be undone, do you really wish to tempt Fate?')) return;
      const count = Math.max(1, Math.min(PLATES.length, Number(this.dom.count?.value) || 1));
      try {
        const notice = await this.runtime.draw(count);
        if (notice) {
          const ids = toStringList(notice.ids);
          const names = ids.map((id, idx) => notice.names?.[idx] || Catalog.shardName(id) || id);
          const listCount = notice.count || ids.length || count;
          const suffix = ' (unresolved)';
          const plainList = names.length ? names.join(', ') : (Array.isArray(notice.names) ? notice.names.join(', ') : 'Unknown Shard');
          const htmlList = (ids.length ? ids : notice.names || [])
            .map((id, idx) => {
              const label = names[idx] || notice.names?.[idx] || id;
              return shardLinkMarkup({
                id: typeof ids[idx] === 'string' ? ids[idx] : '',
                label,
                noticeKey: notice.key,
                noticeIndex: idx,
              });
            })
            .join(', ');
          const plainMessage = `Drew ${listCount} Shard(s): ${plainList}${suffix}`;
          const htmlMessage = `Drew ${listCount} Shard(s): ${htmlList || escapeHtml(plainList)}${suffix}`;
          if (typeof window.logAction === 'function') {
            window.logAction(htmlMessage);
          }
          if (typeof window.dmNotify === 'function') {
            window.dmNotify(plainMessage, { html: htmlMessage, ts: notice.ts });
          }
          await this.playAnimation();
          this.openModal();
          await this.reloadNotices();
        }
      } catch (err) {
        console.error('Shard draw failed', err);
      }
    }

    openModal() {
      this.render();
      if (this.dom.modal) this.dom.modal.hidden = false;
      if (!this.modalIsOpen) {
        this.modalIsOpen = true;
        if (typeof window?.coverFloatingLauncher === 'function') {
          window.coverFloatingLauncher();
        }
      }
    }

    closeModal() {
      if (this.dom.modal) this.dom.modal.hidden = true;
      if (this.modalIsOpen) {
        this.modalIsOpen = false;
        if (typeof window?.releaseFloatingLauncher === 'function') {
          window.releaseFloatingLauncher();
        }
      }
      this.tempArtwork = null;
    }

    dismissCurrent() {
      if (this.queue.length) {
        if (this.queueIndex < this.queue.length - 1) {
          this.queueIndex += 1;
        } else if (this.queueIndex >= this.queue.length) {
          this.queueIndex = this.queue.length - 1;
        }
      }
      this.closeModal();
    }

    async playAnimation() {
      await runLightningFlash();
    }

    handleHiddenSignal(detail) {
      if (!detail || typeof detail.hidden !== 'boolean') return;
      if (detail.hidden === false) {
        this.lastRevealSignalDetail = detail;
        this.enqueueRevealInvite(detail);
      } else if (detail.hidden === true) {
        this.lastRevealSignalDetail = null;
        this.revealInviteQueue = [];
        this.revealInviteActive = null;
        this.closeRevealInvite();
        try {
          if (typeof window.toast === 'function') {
            window.toast('The DM concealed the Shards of Many Fates', { type: 'info', duration: 4000 });
          }
        } catch {}
      }
    }

    applyHiddenState(hidden) {
      const normalized = !!hidden;
      const previous = this.lastHiddenState;
      this.lastHiddenState = normalized;
      if (this.dom.card) this.dom.card.hidden = normalized;
      if (normalized) {
        this.closeModal();
        this.revealInviteQueue = [];
        this.revealInviteActive = null;
        this.closeRevealInvite();
      }
      if (previous === true && normalized === false) {
        const detail = this.lastRevealSignalDetail || {};
        this.enqueueRevealInvite(detail);
      }
      if (normalized === false) {
        this.flushPendingNoticeAdds();
      }
      this.lastRevealSignalDetail = null;
    }
  }

  class DMController {
    constructor(runtime) {
      this.runtime = runtime;
      this.dom = {};
      this.initialized = false;
      this.notices = [];
      this.noticeCleanup = null;
      this.hiddenCleanup = null;
      this.hiddenSignalCleanup = null;
      this.modeCleanup = null;
      this.relatedNpcs = [];
      this.lastHiddenState = null;
      this.realtimeReady = this.runtime.hasRealtime();
    }

    attach() {
      if (this.initialized) return;
      this.initialized = true;
      this.captureDom();
      this.bindEvents();
      this.renderStaticLists();
      this.setupWatchers();
      this.refresh();
      this.updateRealtimeState();
      if (this.modeCleanup) this.modeCleanup();
      this.modeCleanup = this.runtime.onModeChange(() => this.handleModeChange());
    }

    captureDom() {
      this.dom = {
        modal: dom.one('#modal-somf-dm'),
        close: dom.one('#somfDM-close'),
        tabs: dom.all('.somf-dm-tabbtn'),
        cardTab: dom.one('#somfDM-tab-cards'),
        resolveTab: dom.one('#somfDM-tab-resolve'),
        npcTab: dom.one('#somfDM-tab-npcs'),
        itemTab: dom.one('#somfDM-tab-items'),
        reset: dom.one('#somfDM-reset'),
        cardCount: dom.one('#somfDM-cardCount'),
        incoming: dom.one('#somfDM-incoming'),
        noticeView: dom.one('#somfDM-noticeView'),
        markResolved: dom.one('#somfDM-markResolved'),
        spawnNPC: dom.one('#somfDM-spawnNPC'),
        npcList: dom.one('#somfDM-npcList'),
        itemList: dom.one('#somfDM-itemList'),
        toasts: dom.one('#somfDM-toasts'),
        ping: dom.one('#somfDM-ping'),
        playerToggle: dom.one('#somfDM-playerCard'),
        playerState: dom.one('#somfDM-playerCard-state'),
        resolveOptions: dom.one('#somfDM-resolveOptions'),
        queue: dom.one('#somfDM-notifications'),
        npcModal: dom.one('#somfDM-npcModal'),
        npcModalCard: dom.one('#somfDM-npcModalCard'),
      };
    }

    setupWatchers() {
      if (this.noticeCleanup) this.noticeCleanup();
      this.noticeCleanup = this.runtime.watchNotices({
        onAdd: notice => this.toastNotice(notice),
        onChange: () => this.refresh(),
      });
      if (this.hiddenCleanup) this.hiddenCleanup();
      this.hiddenCleanup = this.runtime.watchHidden(value => {
        if (typeof value === 'boolean') this.applyHiddenState(value);
      });
      if (this.hiddenSignalCleanup) this.hiddenSignalCleanup();
      this.hiddenSignalCleanup = this.runtime.onHiddenSignal(detail => this.handleHiddenSignal(detail));
    }

    handleModeChange() {
      const hasRealtime = this.runtime.hasRealtime();
      if (!this.initialized) {
        this.realtimeReady = hasRealtime;
        return;
      }
      const previous = this.realtimeReady;
      if (previous !== hasRealtime) {
        this.realtimeReady = hasRealtime;
        this.setupWatchers();
        Promise.resolve(this.refresh()).catch(err => console.error('Failed to refresh DM view after mode change', err));
      }
      this.updateRealtimeState();
      if (previous !== hasRealtime && previous != null) {
        const message = hasRealtime
          ? '<strong>Cloud Sync Restored</strong> The shard deck is now live.'
          : '<strong>Cloud Sync Lost</strong> Changes are paused until connection returns.';
        this.toast(message);
      }
    }

    updateRealtimeState() {
      const hasRealtime = this.runtime.hasRealtime();
      if (this.dom.playerToggle) {
        this.dom.playerToggle.disabled = !hasRealtime;
        this.dom.playerToggle.setAttribute('aria-disabled', hasRealtime ? 'false' : 'true');
      }
      if (this.dom.reset) {
        this.dom.reset.disabled = !hasRealtime;
      }
      this.updateNoticeActions();
    }

    updateNoticeActions() {
      const hasRealtime = this.runtime.hasRealtime();
      if (this.dom.markResolved) {
        const canResolve = !!this.activeNotice && hasRealtime;
        this.dom.markResolved.disabled = !canResolve;
      }
      if (this.dom.spawnNPC) {
        const canSpawn = this.relatedNpcs.length > 0 && hasRealtime;
        this.dom.spawnNPC.disabled = !canSpawn;
      }
    }

    ensureRealtime(action, fallback) {
      if (this.runtime.hasRealtime()) return true;
      const message = action
        ? `<strong>Cloud Sync Offline</strong> ${action}`
        : '<strong>Cloud Sync Offline</strong> Connect to manage the Shards of Many Fates.';
      this.toast(message);
      if (typeof fallback === 'function') {
        try { fallback(); }
        catch (err) { console.error(err); }
      }
      this.updateRealtimeState();
      return false;
    }

    restoreHiddenToggle() {
      if (!this.dom.playerToggle) return;
      const hidden = typeof this.lastHiddenState === 'boolean' ? this.lastHiddenState : true;
      this.dom.playerToggle.checked = !hidden;
      if (this.dom.playerState) this.dom.playerState.textContent = hidden ? 'Off' : 'On';
    }

    bindEvents() {
      if (this.dom.close && !this.dom.close.__somfBound) {
        this.dom.close.addEventListener('click', () => this.close());
        this.dom.close.__somfBound = true;
      }
      if (this.dom.modal && !this.dom.modal.__somfBound) {
        this.dom.modal.addEventListener('click', evt => { if (evt.target === this.dom.modal) this.close(); });
        this.dom.modal.__somfBound = true;
      }
      if (this.dom.tabs.length) {
        this.dom.tabs.forEach(btn => {
          if (btn.__somfBound) return;
          btn.addEventListener('click', () => this.activateTab(btn.dataset.tab));
          btn.__somfBound = true;
        });
      }
      if (this.dom.reset && !this.dom.reset.__somfBound) {
        this.dom.reset.addEventListener('click', () => this.resetDeck());
        this.dom.reset.__somfBound = true;
      }
      if (this.dom.playerToggle && !this.dom.playerToggle.__somfBound) {
        this.dom.playerToggle.addEventListener('change', () => this.onToggleHidden());
        this.dom.playerToggle.__somfBound = true;
      }
      if (this.dom.markResolved && !this.dom.markResolved.__somfBound) {
        this.dom.markResolved.addEventListener('click', () => this.resolveActiveNotice());
        this.dom.markResolved.__somfBound = true;
      }
      if (this.dom.spawnNPC && !this.dom.spawnNPC.__somfBound) {
        this.dom.spawnNPC.addEventListener('click', () => this.handleSpawnNpc());
        this.dom.spawnNPC.__somfBound = true;
      }
    }

    activateTab(tab) {
      const tabs = {
        cards: this.dom.cardTab,
        resolve: this.dom.resolveTab,
        npcs: this.dom.npcTab,
        items: this.dom.itemTab,
      };
      this.dom.tabs.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
      Object.values(tabs).forEach(section => {
        if (!section) return;
        section.classList.toggle('active', section === tabs[tab]);
      });
    }

    async refresh() {
      await this.refreshCounts();
      await this.refreshHiddenToggle();
      await this.renderNotices();
    }

    async refreshCounts() {
      if (this.dom.cardCount) {
        try {
          const count = await this.runtime.deckCount();
          this.dom.cardCount.textContent = `${count}/${PLATES.length}`;
        } catch {
          this.dom.cardCount.textContent = `${PLATES.length}`;
        }
      }
    }

    async refreshHiddenToggle() {
      if (!this.dom.playerToggle) return;
      const hidden = await this.runtime.getHidden();
      this.lastHiddenState = !!hidden;
      this.dom.playerToggle.checked = !hidden;
      if (this.dom.playerState) this.dom.playerState.textContent = hidden ? 'Off' : 'On';
    }

    async renderNotices() {
      this.notices = await this.runtime.loadNotices(30);
      if (this.dom.incoming) {
        this.dom.incoming.innerHTML = '';
        this.notices.forEach((notice, index) => {
          const li = document.createElement('li');
          li.dataset.key = notice.key || '';
          const count = document.createElement('strong');
          count.textContent = `${notice.count || notice.names.length || 1} shard(s)`;
          li.appendChild(count);
          li.appendChild(this.renderNoticeNames(notice));
          li.addEventListener('click', () => this.selectNotice(index));
          this.dom.incoming.appendChild(li);
        });
      }
      if (this.dom.queue) {
        this.dom.queue.innerHTML = '';
        this.notices.forEach(notice => {
          const li = document.createElement('li');
          li.textContent = `${notice.count || notice.names.length || 1} shard(s): ${notice.names.join(', ')}`;
          li.addEventListener('click', () => {
            this.open({ tab: 'resolve', focusKey: notice.key });
          });
          this.dom.queue.appendChild(li);
        });
      }
      if (this.notices.length) this.selectNotice(0);
      else this.selectNotice(-1);
    }

    renderNoticeNames(notice) {
      const wrapper = document.createElement('div');
      wrapper.className = 'somf-dm__noticeNames';
      const names = Array.isArray(notice?.names) ? notice.names : [];
      const ids = Array.isArray(notice?.ids) ? notice.ids : [];
      names.forEach((name, idx) => {
        if (idx > 0) wrapper.appendChild(document.createTextNode(', '));
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'somf-dm__link';
        btn.textContent = name;
        btn.addEventListener('click', event => {
          event.stopPropagation();
          this.focusShard(ids[idx] || name);
        });
        wrapper.appendChild(btn);
      });
      if (!wrapper.childNodes.length) wrapper.textContent = '—';
      return wrapper;
    }

    focusShard(ref) {
      const shardId = this.resolveShardId(ref);
      if (!shardId) return false;
      this.activateTab('cards');
      const applyFocus = () => {
        const card = document.getElementById(`somfDM-card-${shardId}`);
        if (!card) return;
        if (typeof card.scrollIntoView === 'function') {
          try { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
          catch { card.scrollIntoView(); }
        }
        this.highlightCard(card);
      };
      setTimeout(applyFocus, 0);
      return true;
    }

    resolveShardId(ref) {
      if (typeof ref !== 'string') return null;
      const trimmed = ref.trim();
      if (!trimmed) return null;
      if (Catalog.shardById(trimmed)) return trimmed;
      const upper = trimmed.toUpperCase();
      if (Catalog.shardById(upper)) return upper;
      const lower = trimmed.toLowerCase();
      const match = Catalog.allShards().find(plate => (plate?.name || '').toLowerCase() === lower);
      return match?.id || null;
    }

    highlightCard(card) {
      if (!card) return;
      card.classList.add('somf-dm__card--highlight');
      if (card.__somfHighlightTimeout) clearTimeout(card.__somfHighlightTimeout);
      card.__somfHighlightTimeout = setTimeout(() => {
        card.classList.remove('somf-dm__card--highlight');
        card.__somfHighlightTimeout = null;
      }, 2000);
    }

    selectNotice(index) {
      this.activeNotice = this.notices[index] || null;
      this.relatedNpcs = [];
      if (!this.activeNotice) {
        if (this.dom.noticeView) this.dom.noticeView.innerHTML = '';
        if (this.dom.spawnNPC) this.dom.spawnNPC.textContent = 'Spawn Related NPC';
        this.updateNoticeActions();
        return;
      }
      if (this.dom.incoming) {
        Array.from(this.dom.incoming.children).forEach((child, idx) => {
          child.classList.toggle('active', idx === index);
        });
      }
      if (this.dom.noticeView) {
        const list = this.activeNotice.names.map(name => `<li>${name}</li>`).join('');
        this.dom.noticeView.innerHTML = `<div><strong>Batch</strong> • ${new Date(this.activeNotice.ts || Date.now()).toLocaleString()}</div><ul style="margin:6px 0 0 18px;padding:0">${list}</ul>`;
      }
      const related = this.runtime.catalog.relatedNpcs(this.activeNotice.ids);
      this.relatedNpcs = related;
      if (this.dom.spawnNPC) {
        const count = related.length;
        this.dom.spawnNPC.textContent = count > 1
          ? `Spawn Related NPC (${count})`
          : 'Spawn Related NPC';
      }
      this.updateNoticeActions();
    }

    async resolveActiveNotice() {
      if (!this.activeNotice) return;
      if (!this.ensureRealtime('Reconnect to resolve shards before notifying players.')) {
        return;
      }
      const ids = toStringList(this.activeNotice.ids);
      await this.runtime.pushResolutionBatch(ids);
      await this.runtime.removeNotice(this.activeNotice.key);
      this.toast(`<strong>Resolved</strong> ${ids.length || this.activeNotice.count || 1} shard(s)`);
      await this.renderNotices();
    }

    handleSpawnNpc() {
      if (!this.relatedNpcs.length) return;
      if (!this.ensureRealtime('Reconnect before spawning related NPCs.')) {
        return;
      }
      this.showNpcModal(this.relatedNpcs[0], this.relatedNpcs);
    }

    handleHiddenSignal(detail) {
      if (!detail || typeof detail.hidden !== 'boolean') return;
      const message = detail.hidden
        ? '<strong>Shards Concealed</strong> Players can no longer see the deck'
        : '<strong>Shards Revealed</strong> Broadcasting refresh to players';
      this.toast(message);
    }

    toastNotice(notice) {
      this.toast(`<strong>New Draw</strong> ${notice.count || notice.names.length || 1} shard(s): ${notice.names.join(', ')}`, () => {
        this.open({ tab: 'cards', focusKey: notice.key });
      });
    }

    toast() {}

    renderStaticLists() {
      if (this.dom.cardTab) {
        this.dom.cardTab.innerHTML = '';
        Catalog.allShards().forEach(plate => {
          const card = document.createElement('div');
          card.style.cssText = 'border:1px solid #1b2532;border-radius:8px;background:#0c1017;padding:8px;margin-bottom:8px;';
          card.id = `somfDM-card-${plate.id}`;
          const dm = Catalog.dmCard(plate);
          const subtitleParts = [];
          if (plate.polarity) subtitleParts.push(`${sentenceCase(plate.polarity)} shard`);
          if (plate.id) subtitleParts.push(`ID: ${plate.id}`);
          const subtitle = subtitleParts.filter(Boolean).join(' • ') || '—';
          const lines = Array.isArray(dm.desc) && dm.desc.length ? dm.desc : ['No GM information available.'];
          card.innerHTML = `<div><strong>${dm.name}</strong></div><div style="opacity:.8;font-size:12px">${subtitle}</div><ul style="margin:6px 0 0 18px;padding:0">${lines.map(line => `<li>${line}</li>`).join('')}</ul>`;
          this.dom.cardTab.appendChild(card);
        });
      }
      if (this.dom.itemList) {
        this.dom.itemList.innerHTML = '';
        Catalog.allItems().forEach(item => {
          const li = document.createElement('li');
          li.style.cssText = 'border-top:1px solid #1b2532;padding:8px 10px';
          if (!this.dom.itemList.children.length) li.style.borderTop = 'none';
          li.innerHTML = `<strong>${item.name}</strong><div style="opacity:.8;font-size:12px">${sentenceCase(item.type || '')}</div>`;
          this.dom.itemList.appendChild(li);
        });
      }
      if (this.dom.npcList) {
        this.dom.npcList.innerHTML = '';
        Catalog.allNpcs().forEach(npc => {
          const li = document.createElement('li');
          li.style.cssText = 'border-top:1px solid #1b2532;padding:8px 10px;cursor:pointer';
          if (!this.dom.npcList.children.length) li.style.borderTop = 'none';
          li.innerHTML = `<strong>${npc.name}</strong><div style="opacity:.8;font-size:12px">${sentenceCase(npc.role || '')}${npc.tier ? ` (T${npc.tier})` : ''}</div>`;
          li.addEventListener('click', () => this.showNpcModal(npc, [npc]));
          this.dom.npcList.appendChild(li);
        });
      }
      if (this.dom.resolveOptions) {
        this.dom.resolveOptions.innerHTML = '';
        Catalog.resolveOptions().forEach(option => {
          const li = document.createElement('li');
          li.innerHTML = `<strong>${option.name}</strong><div style="opacity:.8">${option.desc}</div>`;
          this.dom.resolveOptions.appendChild(li);
        });
      }
      this.activateTab('cards');
    }

    showNpcModal(npc, related = []) {
      if (!npc || !this.dom.npcModal || !this.dom.npcModalCard) return;
      this.dom.npcModalCard.innerHTML = '';

      const title = document.createElement('h4');
      title.textContent = npc.name || npc.id || 'Unknown NPC';
      this.dom.npcModalCard.appendChild(title);

      const meta = document.createElement('div');
      meta.style.opacity = '.8';
      const metaParts = [];
      if (npc.role) metaParts.push(sentenceCase(npc.role));
      if (npc.tier) metaParts.push(`T${npc.tier}`);
      if (npc.affiliation) metaParts.push(npc.affiliation);
      meta.textContent = metaParts.filter(Boolean).join(' • ') || '—';
      this.dom.npcModalCard.appendChild(meta);

      const statParts = [];
      if (typeof npc.hp === 'number') statParts.push(`HP ${npc.hp}`);
      if (typeof npc.sp === 'number') statParts.push(`SP ${npc.sp}`);
      if (npc.tc_base != null) statParts.push(`TC ${npc.tc_base}`);
      if (typeof npc.speed_ft === 'number') statParts.push(`Speed ${npc.speed_ft} ft`);
      if (statParts.length) {
        const stats = document.createElement('div');
        stats.style.opacity = '.8';
        stats.style.margin = '8px 0';
        stats.textContent = statParts.join(' • ');
        this.dom.npcModalCard.appendChild(stats);
      }

      if (Array.isArray(npc.features) && npc.features.length) {
        const head = document.createElement('div');
        head.className = 'somf-subttl';
        head.textContent = 'Features';
        this.dom.npcModalCard.appendChild(head);
        const list = document.createElement('ul');
        list.className = 'somf-list';
        npc.features.forEach(feature => {
          const item = document.createElement('li');
          item.textContent = feature;
          list.appendChild(item);
        });
        this.dom.npcModalCard.appendChild(list);
      }

      if (Array.isArray(npc.powers) && npc.powers.length) {
        const head = document.createElement('div');
        head.className = 'somf-subttl';
        head.textContent = 'Signature Powers';
        this.dom.npcModalCard.appendChild(head);
        const list = document.createElement('ul');
        list.className = 'somf-list';
        npc.powers.slice(0, 3).forEach(power => {
          const item = document.createElement('li');
          const name = power?.name ? `${power.name}` : '';
          const effect = power?.effect ? ` — ${power.effect}` : '';
          item.textContent = (name + effect).trim() || power?.name || '—';
          list.appendChild(item);
        });
        this.dom.npcModalCard.appendChild(list);
      }

      const others = Array.isArray(related)
        ? related.filter(other => other && other.id && other.id !== npc.id)
        : [];
      if (others.length) {
        const head = document.createElement('div');
        head.className = 'somf-subttl';
        head.textContent = 'Other related NPCs';
        this.dom.npcModalCard.appendChild(head);
        const list = document.createElement('ul');
        list.className = 'somf-list';
        others.forEach(other => {
          const item = document.createElement('li');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'somf-btn somf-ghost';
          btn.textContent = other.name || other.id;
          btn.addEventListener('click', () => this.showNpcModal(other, related));
          item.appendChild(btn);
          list.appendChild(item);
        });
        this.dom.npcModalCard.appendChild(list);
      }

      const close = document.createElement('button');
      close.className = 'somf-btn somf-ghost';
      close.textContent = 'Close';
      close.addEventListener('click', () => this.hideNpcModal());
      this.dom.npcModalCard.appendChild(close);

      this.dom.npcModal.style.display = 'flex';
      this.dom.npcModal.classList.remove('hidden');
      this.dom.npcModal.setAttribute('aria-hidden', 'false');
      if (!this.dom.npcModal.__somfBound) {
        this.dom.npcModal.addEventListener('click', evt => { if (evt.target === this.dom.npcModal) this.hideNpcModal(); });
        this.dom.npcModal.__somfBound = true;
      }
    }

    hideNpcModal() {
      if (!this.dom.npcModal) return;
      this.dom.npcModal.classList.add('hidden');
      this.dom.npcModal.style.display = 'none';
      this.dom.npcModal.setAttribute('aria-hidden', 'true');
    }

    async onToggleHidden() {
      if (!this.dom.playerToggle) return;
      const hidden = !this.dom.playerToggle.checked;
      if (!this.ensureRealtime(hidden ? 'Connect before concealing the Shards.' : 'Connect before revealing the Shards.', () => this.restoreHiddenToggle())) {
        return;
      }
      await this.runtime.setHidden(hidden);
      if (this.dom.playerState) this.dom.playerState.textContent = hidden ? 'Off' : 'On';
    }

    async resetDeck() {
      if (!this.ensureRealtime('Connect to the deck before resetting.')) {
        return;
      }
      await this.runtime.resetDeck();
      this.toast('<strong>Deck Reset</strong> Shards reshuffled');
      await this.refresh();
    }

    applyHiddenState(hidden) {
      const normalized = !!hidden;
      const previous = this.lastHiddenState;
      this.lastHiddenState = normalized;
      if (this.dom.playerToggle) this.dom.playerToggle.checked = !normalized;
      if (this.dom.playerState) this.dom.playerState.textContent = normalized ? 'Off' : 'On';
    }

    open(opts = {}) {
      if (!this.dom.modal) return;
      this.dom.modal.style.display = 'flex';
      this.dom.modal.classList.remove('hidden');
      this.dom.modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      if (opts.tab) this.activateTab(opts.tab);
      if (opts.focusKey && this.dom.incoming) {
        const idx = this.notices.findIndex(notice => notice.key === opts.focusKey);
        if (idx >= 0) this.selectNotice(idx);
      }
    }

    close() {
      if (!this.dom.modal) return;
      this.dom.modal.classList.add('hidden');
      this.dom.modal.style.display = 'none';
      this.dom.modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      this.hideNpcModal();
    }
  }

  const runtime = new SomfRuntime();

  function handleSomfArtLinkClick(event) {
    const anchor = event.target.closest('[data-somf-art]');
    if (!anchor) return;
    const shardId = anchor.getAttribute('data-somf-art');
    if (!shardId) return;
    event.preventDefault();
    const noticeKey = anchor.getAttribute('data-somf-notice') || null;
    const indexAttr = anchor.getAttribute('data-somf-index');
    const noticeIndex = indexAttr !== null && indexAttr !== '' ? Number(indexAttr) : null;
    const payload = { id: shardId, noticeKey };
    if (Number.isFinite(noticeIndex)) payload.noticeIndex = noticeIndex;
    const handled = runtime?.player?.showArtworkLink?.(payload);
    if (handled) return;
    const fallback = shardArtById(shardId);
    if (fallback) {
      try {
        window.open(fallback, '_blank', 'noopener,noreferrer');
      } catch (err) {
        console.error('Unable to open shard artwork', err);
      }
    }
  }

  document.addEventListener('click', handleSomfArtLinkClick);

  function initSomf() {
    runtime.setFirebase(window._somf_db || null);
    runtime.attachPlayer();
    if (document.getElementById('somfDM-playerCard') || document.getElementById('modal-somf-dm')) {
      runtime.ensureDM();
    }
  }

  document.addEventListener('DOMContentLoaded', initSomf);
  if (document.readyState !== 'loading') initSomf();

  window.initSomfDM = () => runtime.ensureDM();
  window.openSomfDM = opts => runtime.openDM(opts || {});

})();
