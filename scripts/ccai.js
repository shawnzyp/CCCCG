// Requires a modern browser with WebGPU. First load caches the chosen model.
let webllm = null;

// ===== Custom Element =====
class CCAssistant extends HTMLElement {
  constructor(){ super(); this.attachShadow({mode:"open"}); }
  connectedCallback(){ this.render(); }

  render(){
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block}
        .box{background:#0f1320;color:#e7e9ee;border:1px solid #263155;border-radius:12px;
             padding:12px;max-width:960px;font:15px system-ui, -apple-system, Segoe UI, Roboto}
        header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
        h3{margin:0;font:600 16px/1.2 system-ui}
        .tag{font:12px system-ui;padding:2px 8px;border:1px solid #2b3557;border-radius:999px;background:#141a2c}
        .log{background:#0b1020;border:1px solid #212b4c;border-radius:10px;padding:10px;min-height:180px;max-height:50vh;overflow:auto}
        .bubble{padding:8px 10px;margin:6px 0;border-radius:8px;white-space:pre-wrap}
        .you{background:#172034}
        .bot{background:#12182a}
        .sys{background:#11151f;border:1px dashed #27314b;color:#b3c0e0}
        textarea{width:100%;min-height:72px;padding:10px;border-radius:10px;background:#0f1320;color:#e7e9ee;border:1px solid #2a2f3f}
        button,select{background:#1e2740;border:1px solid #2c3454;color:#e7e9ee;padding:6px 12px;border-radius:8px;cursor:pointer}
        .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .pill{display:flex;align-items:center;gap:6px;border-radius:999px;border:1px solid #2b2f3a;background:#141827;padding:6px 10px}
        details{background:#0f1320;border:1px solid #1f2741;border-radius:10px;padding:8px 10px;margin-top:8px}
        summary{cursor:pointer}
        table{width:100%;border-collapse:collapse;font-size:14px}
        th,td{border:1px solid #28304a;padding:6px;text-align:left}
        .inline{width:100px}
        .spacer{flex:1}
      </style>
      <div class="box">
        <header>
          <h3>Catalyst Core — Assistant</h3>
          <span class="tag">Local model</span>
          <span id="gpu" class="tag">Checking WebGPU…</span>
          <span class="spacer"></span>
          <select id="model">
            <option value="Llama-3.2-1B-instruct-q4f16_1-MLC">Llama 3.2 1B (fast)</option>
            <option value="Llama-3.1-8B-instruct-q4f16_1-MLC">Llama 3.1 8B (bigger)</option>
            <option value="Phi-3.5-mini-instruct-q4f16_1-MLC">Phi 3.5 mini</option>
          </select>
          <button id="load">Load</button>
        </header>

        <div class="row" style="margin-bottom:6px">
          <label class="pill"><input type="checkbox" id="gm"> GM Mode</label>
          <label class="pill"><input type="checkbox" id="spoiler" checked> Spoiler Safe</label>
          <label class="pill"><input type="checkbox" id="structured" checked> Structured Answers</label>
        </div>

        <div class="log" id="log" aria-live="polite">
          <div class="bubble sys">Assistant loads a small model in your browser. First load may take a minute. Content cites the Character Creation Guide.:contentReference[oaicite:2]{index=2}:contentReference[oaicite:3]{index=3}</div>
        </div>

        <div class="row" style="margin-top:6px">
          <textarea id="msg" placeholder="Ask about Classifications, Power Styles, Origins, SP, Alignments, Downtime, CAP…"></textarea>
        </div>
        <div class="row" style="margin-top:6px">
          <button id="send">Send</button>
          <button id="clear">Clear</button>
        </div>

        <details>
          <summary><strong>Local Codex</strong> (preloaded from your guide, editable)</summary>
          <table><thead><tr><th>Type</th><th>Key</th><th>Text</th></tr></thead><tbody id="cxTable"></tbody></table>
          <div class="row" style="margin-top:8px">
            <select id="cxType">
              <option>classification</option><option>powerstyle</option><option>origin</option>
              <option>mechanic</option><option>alignment</option><option>tag</option>
              <option>element</option><option>glossary</option>
            </select>
            <input id="cxKey" class="inline" placeholder="Key">
            <input id="cxText" style="flex:1" placeholder="Text">
            <button id="cxAdd">Add/Update</button>
            <button id="cxExport">Export JSON</button>
            <input id="cxImport" type="file" accept="application/json">
          </div>
        </details>
      </div>
    `;

    const $ = (s)=>this.shadowRoot.querySelector(s);
    const log = $("#log");
    const msg = $("#msg");
    const modelSel = $("#model");
    const loadBtn = $("#load");
    const gpu = $("#gpu");
    const gm = $("#gm");
    const spoiler = $("#spoiler");
    const structured = $("#structured");
    const sendBtn = $("#send");
    const clearBtn = $("#clear");

    const append=(role,text)=>{
      const div=document.createElement("div");
      div.className="bubble "+(role||"bot");
      div.textContent=text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
      return div;
    };

    // WebGPU check
    gpu.textContent = ("gpu" in navigator) ? "WebGPU available" : "WebGPU not available";

    // ===== Preloaded CODEX from the Character Creation Guide =====
    // Citations: the content below is derived from the user's uploaded guide.:contentReference[oaicite:4]{index=4}:contentReference[oaicite:5]{index=5}
    let CODEX = [
      // Classifications
      {type:"classification", key:"mutant", text:"Mutant: Reroll one failed saving throw per long rest."},                              // :contentReference[oaicite:6]{index=6}
      {type:"classification", key:"enhanced_human", text:"Enhanced Human: Advantage on Technology checks."},                           // :contentReference[oaicite:7]{index=7}
      {type:"classification", key:"magic_user", text:"Magic User: Cast a minor effect (prestidigitation) once per long rest."},        // :contentReference[oaicite:8]{index=8}
      {type:"classification", key:"alien", text:"Alien/Extraterrestrial: Immune to environmental hazards; no penalty in rough terrain."}, // :contentReference[oaicite:9]{index=9}
      {type:"classification", key:"mystical_being", text:"Mystical Being: +2 to Persuasion or Intimidation."},                         // :contentReference[oaicite:10]{index=10}

      // Power Styles
      {type:"powerstyle", key:"physical_powerhouse", text:"Cut one attack in half once per combat."},                                   // :contentReference[oaicite:11]{index=11}
      {type:"powerstyle", key:"energy_manipulator", text:"Reroll 1s once per turn."},                                                   // :contentReference[oaicite:12]{index=12}
      {type:"powerstyle", key:"speedster", text:"+10 ft move and +1 AC while moving 20+ ft."},                                          // :contentReference[oaicite:13]{index=13}
      {type:"powerstyle", key:"telekinetic_psychic", text:"For one turn force enemies to reroll rolls above 17, once per rest."},       // :contentReference[oaicite:14]{index=14}
      {type:"powerstyle", key:"illusionist", text:"Create a 1-minute decoy once per combat."},                                          // :contentReference[oaicite:15]{index=15}
      {type:"powerstyle", key:"shapeshifter", text:"Advantage on Deception; disguise freely."},                                         // :contentReference[oaicite:16]{index=16}
      {type:"powerstyle", key:"elemental_controller", text:"+2 to hit and +5 damage once per turn with elemental powers."},             // :contentReference[oaicite:17]{index=17}

      // Origins
      {type:"origin", key:"accident", text:"Resistance to one damage type."},                                                           // :contentReference[oaicite:18]{index=18}
      {type:"origin", key:"experiment", text:"Reroll a failed CON or INT save once per long rest."},                                    // :contentReference[oaicite:19]{index=19}
      {type:"origin", key:"legacy", text:"Use another known character's powers once per long rest."},                                   // :contentReference[oaicite:20]{index=20}
      {type:"origin", key:"awakening", text:"+5 to hit and +10 to damage when below half HP."},                                         // :contentReference[oaicite:21]{index=21}
      {type:"origin", key:"pact", text:"Auto-success on one save or +10 to any roll once per long rest."},                              // :contentReference[oaicite:22]{index=22}
      {type:"origin", key:"lost_time", text:"Once per combat, on DC 17 check declare a Skill Move: 0 SP and +1d6 bonus."},              // :contentReference[oaicite:23]{index=23}
      {type:"origin", key:"exposure", text:"+5 elemental damage once per round."},                                                      // :contentReference[oaicite:24]{index=24}
      {type:"origin", key:"rebirth", text:"If knocked out, stand up at 1 HP and gain resistance to all damage for 1 round."},           // :contentReference[oaicite:25]{index=25}
      {type:"origin", key:"vigil", text:"Once per combat create a shield that reduces incoming damage to allies to zero for one turn."}, // :contentReference[oaicite:26]{index=26}
      {type:"origin", key:"redemption", text:"Once per day take damage for an ally within move; they heal 1d6 and gain advantage. After combat you gain advantage on all saves until dawn."}, // :contentReference[oaicite:27]{index=27}

      // Ability Scores and Core Formulas
      {type:"mechanic", key:"ability_method", text:"Assign abilities by rolling 7d20 and dropping the lowest; stats are STR, DEX, CON, INT, WIS, CHA."}, // :contentReference[oaicite:28]{index=28}
      {type:"mechanic", key:"tc", text:"Toughness Class (TC) = 10 + DEX mod + armor/shield + power/origin bonuses."},                  // :contentReference[oaicite:29]{index=29}
      {type:"mechanic", key:"hp_formula", text:"HP = 30 + CON mod + (Tier Bonus × 1d10). Tier 5 +1d10; T4 +2d10; T3 +3d10; T2 +4d10; T1 +5d10; T0 = fixed +100."}, // :contentReference[oaicite:30]{index=30}
      {type:"mechanic", key:"hp_zero", text:"At 0 HP: make three CON saves DC 13. Succeed at least twice to stabilize at 1 HP and remain prone; otherwise you fall unconscious."}, // :contentReference[oaicite:31]{index=31}

      // Optional Combat XP
      {type:"mechanic", key:"xp_tiers", text:"Combat XP thresholds: T4 2,000; T3 6,000; T2 18,000; T1 54,000; T0 162,000. XP triples per tier."}, // :contentReference[oaicite:32]{index=32}
      {type:"mechanic", key:"xp_awards", text:"Awards: minor 50; elite 250–500; boss 1,000–2,000; apocalyptic 5,000+."},                // :contentReference[oaicite:33]{index=33}

      // Power Design + SP
      {type:"mechanic", key:"sp_core", text:"SP = 5 + CON mod. SP fully regenerates at the start of each round. Powers cost 1–5 SP."},  // :contentReference[oaicite:34]{index=34}
      {type:"mechanic", key:"sp_costs", text:"1 SP basic; 2 SP core/status; 3 SP AoE or enhanced or heal; 4 SP strong AoE or hard CC; 5 SP ultimate (10-round cooldown)."}, // :contentReference[oaicite:35]{index=35}
      {type:"mechanic", key:"power_template", text:"Each power: Name, Range, Effect, SP Cost, Save DC/type if any, Description."},      // :contentReference[oaicite:36]{index=36}

      // Effect Tags
      {type:"tag", key:"burn", text:"Burn: target takes 1d4 fire damage at the start of next turn."},                                   // :contentReference[oaicite:37]{index=37}
      {type:"tag", key:"freeze", text:"Freeze: reduce movement by 10 ft for 1 round."},                                                 // :contentReference[oaicite:38]{index=38}
      {type:"tag", key:"stun", text:"Stun: target loses next turn (WIS save to resist)."},                                              // :contentReference[oaicite:39]{index=39}
      {type:"tag", key:"push_pull", text:"Push/Pull: move target 10–20 ft (STR or DEX save)."},                                         // :contentReference[oaicite:40]{index=40}
      {type:"tag", key:"weaken", text:"Weaken: –2 to attack rolls for 1 round."},                                                       // :contentReference[oaicite:41]{index=41}
      {type:"tag", key:"blind", text:"Blind: disadvantage on attacks and Perception checks (CON save)."},                               // :contentReference[oaicite:42]{index=42}
      {type:"tag", key:"regen", text:"Regen: regain 1d6 SP or HP at end of each of next 3 turns."},                                     // :contentReference[oaicite:43]{index=43}
      {type:"tag", key:"shield", text:"Shield: gain temp HP or AC boost until hit."},                                                   // :contentReference[oaicite:44]{index=44}
      {type:"tag", key:"phase", text:"Phase: short teleport or avoid attacks."},                                                        // :contentReference[oaicite:45]{index=45}

      // Elements (short highlights)
      {type:"element", key:"fire", text:"Strong vs Earth, Ice, Shadow; weak vs Water, Aether. Can ignite, melt, wreck tech."},          // :contentReference[oaicite:46]{index=46}
      {type:"element", key:"water", text:"Strong vs Fire, Catalyst; weak vs Earth, Lightning. Extinguish, slow, slick terrain."},       // :contentReference[oaicite:47]{index=47}
      {type:"element", key:"earth", text:"Strong vs Lightning, Air; weak vs Fire, Ice. Difficult terrain, barriers."},                  // :contentReference[oaicite:48]{index=48}
      {type:"element", key:"air", text:"Strong vs Water, Fire; weak vs Lightning, Shadow. Push, disarm flying, gusts."},               // :contentReference[oaicite:49]{index=49}
      {type:"element", key:"lightning", text:"Strong vs Water, Air; weak vs Earth, Shadow. Stun tech, electrify water."},              // :contentReference[oaicite:50]{index=50}
      {type:"element", key:"ice", text:"Strong vs Earth, Fire; weak vs Fire, Energy. Freeze movement, brittle hits."},                  // :contentReference[oaicite:51]{index=51}
      {type:"element", key:"light", text:"Strong vs Shadow, Psychic; weak vs Void, Corruption. Reveal, radiant damage, blind."},       // :contentReference[oaicite:52]{index=52}
      {type:"element", key:"shadow", text:"Strong vs Light, Psychic; weak vs Fire, Light. Fear, shadow strikes."},                     // :contentReference[oaicite:53]{index=53}
      {type:"element", key:"energy", text:"Strong vs Ice, Water, Light; weak vs Earth, Aether. Overload tech, 2d6 lightning."},        // :contentReference[oaicite:54]{index=54}
      {type:"element", key:"psychic", text:"Strong vs elemental/tech foes; weak vs Shadow, Light. Confuse, mind-read."},               // :contentReference[oaicite:55]{index=55}
      {type:"element", key:"void", text:"Strong vs Light, Energy, Catalyst; none weak. Deletes effects, true damage."},                 // :contentReference[oaicite:56]{index=56}
      {type:"element", key:"catalyst", text:"Strong vs technology, structure; weak vs Water, Void. Wild surges, corruption."},          // :contentReference[oaicite:57]{index=57}
      {type:"element", key:"aether", text:"Strong vs Fire, Lightning, Energy; weak vs Shadow, Void. Phase, time bend."},                // :contentReference[oaicite:58]{index=58}

      // Combat Core
      {type:"mechanic", key:"initiative", text:"Initiative: 1d20 + DEX mod."},                                                          // :contentReference[oaicite:59]{index=59}
      {type:"mechanic", key:"action_economy", text:"Each turn: 1 Action, 1 Movement, 1 Reaction. You may ready an attack or power as a bonus action. One bonus action per turn."}, // :contentReference[oaicite:60]{index=60}
      {type:"mechanic", key:"attack_rolls", text:"Attack rolls: 1d20 + relevant modifiers."},                                           // :contentReference[oaicite:61]{index=61}
      {type:"mechanic", key:"crits", text:"Critical hits: on natural 20 roll all damage dice twice."},                                   // :contentReference[oaicite:62]{index=62}
      {type:"mechanic", key:"saves", text:"Saves: STR, DEX, CON, INT, WIS, CHA vs appropriate threats."},                               // :contentReference[oaicite:63]{index=63}

      // CAP and Downtime
      {type:"mechanic", key:"cap", text:"Cinematic Action Point: 1 per session. Auto succeed, interrupt initiative, flashback +5, or rescue an ally."}, // :contentReference[oaicite:64]{index=64}
      {type:"mechanic", key:"downtime", text:"Downtime: Media Control, Research, Train/Tinker, Gather Intel, Personal Time."},           // :contentReference[oaicite:65]{index=65}

      // Alignments
      {type:"alignment", key:"paragon", text:"Paragon (Lawful Light): Auto succeed one Charisma check with civilians or allies per session."}, // :contentReference[oaicite:66]{index=66}
      {type:"alignment", key:"guardian", text:"Guardian (Neutral Light): Once per session restore 1d6 HP or 1 SP to an ally as a bonus action."}, // :contentReference[oaicite:67]{index=67}
      {type:"alignment", key:"vigilante", text:"Vigilante (Chaotic Light): Ignore opportunity attacks when moving toward a threat or hostage."}, // :contentReference[oaicite:68]{index=68}
      {type:"alignment", key:"sentinel", text:"Sentinel (Lawful Neutral): +1 to all saves when acting on orders or directives."},         // :contentReference[oaicite:69]{index=69}
      {type:"alignment", key:"outsider", text:"Outsider (True Neutral): Once per session reroll any roll or remove one condition from yourself."}, // :contentReference[oaicite:70]{index=70}
      {type:"alignment", key:"wildcard", text:"Wildcard (Chaotic Neutral): Advantage on Initiative and Deception once per combat."},     // :contentReference[oaicite:71]{index=71}
      {type:"alignment", key:"inquisitor", text:"Inquisitor (Lawful Shadow): Once per session deal maximum damage to enemies labeled criminal by GM."}, // :contentReference[oaicite:72]{index=72}
      {type:"alignment", key:"anti_hero", text:"Anti-Hero (Neutral Shadow): Heal 1d6 HP when defeating an enemy while no allies are within 10 ft."}, // :contentReference[oaicite:73]{index=73}
      {type:"alignment", key:"renegade", text:"Renegade (Chaotic Shadow): Once per combat add +1d6 damage when attacking from stealth or surprise."}, // :contentReference[oaicite:74]{index=74}

      // Resistances & Vulnerabilities (summarized)
      {type:"mechanic", key:"resistances_mutant", text:"Mutant: Resistant radiation, psychic; vulnerable necrotic, force."},            // :contentReference[oaicite:75]{index=75}
      {type:"mechanic", key:"resistances_enhanced", text:"Enhanced Human: Resistant piercing, fire; vulnerable psychic, radiation."},    // :contentReference[oaicite:76]{index=76}
      {type:"mechanic", key:"resistances_magic_user", text:"Magic User: Resistant force, necrotic; vulnerable confusion, radiation."},   // :contentReference[oaicite:77]{index=77}
      {type:"mechanic", key:"resistances_alien", text:"Alien: Resistant cold, acid, lightning; vulnerable radiant, emotion."},           // :contentReference[oaicite:78]{index=78}
      {type:"mechanic", key:"resistances_mystical", text:"Mystical Being: Resistant radiant, psychic; vulnerable corruption, radiation."}, // :contentReference[oaicite:79]{index=79}

      // Glossary
      {type:"glossary", key:"sp", text:"Stamina Points: resource to fuel powers. Refresh fully each round."},                            // :contentReference[oaicite:80]{index=80}
      {type:"glossary", key:"per_session", text:"Per Session: once per full play session."},                                            // :contentReference[oaicite:81]{index=81}
      {type:"glossary", key:"per_combat", text:"Per Combat: resets each new combat."},                                                 // :contentReference[oaicite:82]{index=82}
      {type:"glossary", key:"concentration", text:"Concentration: some powers cost +1 SP per round to sustain."}                        // :contentReference[oaicite:83]{index=83}
    ];

    // Render Codex table
    const renderCodex = ()=>{
      const tbody = this.shadowRoot.querySelector("#cxTable");
      tbody.innerHTML = "";
      CODEX.forEach(e=>{
        const tr=document.createElement("tr");
        tr.innerHTML = `<td>${e.type}</td><td>${e.key}</td><td>${e.text}</td>`;
        tr.onclick = ()=>{
          this.shadowRoot.querySelector("#cxType").value=e.type;
          this.shadowRoot.querySelector("#cxKey").value=e.key;
          this.shadowRoot.querySelector("#cxText").value=e.text;
        };
        tbody.appendChild(tr);
      });
    };
    renderCodex();

    // Codex add/update/export/import
    this.shadowRoot.querySelector("#cxAdd").onclick = ()=>{
      const t=this.shadowRoot.querySelector("#cxType").value.trim();
      const k=this.shadowRoot.querySelector("#cxKey").value.trim();
      const x=this.shadowRoot.querySelector("#cxText").value.trim();
      if(!t||!k||!x) return alert("Fill type, key, text");
      const i = CODEX.findIndex(e=>e.type===t && e.key===k);
      i>=0 ? CODEX[i].text = x : CODEX.push({type:t,key:k,text:x});
      renderCodex();
      this.shadowRoot.querySelector("#cxKey").value="";
      this.shadowRoot.querySelector("#cxText").value="";
    };
    this.shadowRoot.querySelector("#cxExport").onclick = ()=>{
      const blob = new Blob([JSON.stringify(CODEX,null,2)], {type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {href:url, download:"codex.json"});
      a.click(); URL.revokeObjectURL(url);
    };
    this.shadowRoot.querySelector("#cxImport").onchange = (e)=>{
      const f=e.target.files[0]; if(!f) return;
      const fr=new FileReader();
      fr.onload=()=>{ try{ CODEX = JSON.parse(fr.result); renderCodex(); alert("Imported codex."); } catch{ alert("Invalid JSON"); } };
      fr.readAsText(f);
    };

    // Model engine
    let engine = null;
    const loadModel = async ()=>{
      loadBtn.disabled = true;
      append("sys", `Loading model: ${modelSel.value}. This caches after first load.`);
      try {
        if(!webllm){
          webllm = await import("https://esm.run/@mlc-ai/web-llm");
        }
        engine = await webllm.CreateMLCEngine({ model: modelSel.value });
        append("sys","Model ready.");
      } catch (e){
        console.error(e);
        append("sys","Failed to load model. Try a smaller model or a newer browser.");
      } finally {
        loadBtn.disabled = false;
      }
    };
    loadBtn.onclick = loadModel;
    loadModel();

    // Prompts
    const systemPrompt = ()=>{
      return `You are the Catalyst Core Campaign Assistant.
Use the Local Codex when possible and cite entries in square brackets, e.g., [mechanic:sp], [alignment:paragon].
Style: concise, plain language, no emojis. Avoid purple prose.
If Spoiler Safe is on, do not reveal hidden twists or secret identities. If GM Mode is on, you may add a short GM Tips section.`;
    };

    const retrieve = (q, k=10)=>{
      const terms = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const scored = CODEX.map((e,idx)=>{
        const hay=(e.type+" "+e.key+" "+e.text).toLowerCase();
        let s=0; for(const t of terms){ if(hay.includes(t)) s++; }
        return {idx,score:s,e};
      }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,k);
      return scored.map(s=>s.e);
    };

    const buildUserPrompt = (q)=>{
      const flags = { gmMode: gm.checked, spoilerSafe: spoiler.checked, structured: structured.checked };
      const ctx = retrieve(q, 12);
      const ctxBlock = ctx.length ? "Local Codex:\n" + ctx.map(e=>`- [${e.type}:${e.key}] ${e.text}`).join("\n") + "\n\n" : "";
      const structNote = flags.structured ? "When helpful, use: Summary; Steps; Examples; GM Tips (GM only).\n" : "";
      return `${ctxBlock}Flags: ${JSON.stringify(flags)}\n${structNote}Question: ${q}\n\nNote: Rules sourced from the Character Creation Guide.:contentReference[oaicite:84]{index=84}:contentReference[oaicite:85]{index=85}`;
    };

    // Chat
    const send = async ()=>{
      const q = msg.value.trim(); if(!q) return;
      msg.value=""; append("you", q);
      const reply = append("bot","…thinking…");
      if(!engine){
        append("sys","Model not ready. Loading now.");
        await loadModel();
        if(!engine){ reply.textContent = "Model failed to load."; return; }
      }
      try{
        const stream = await engine.chat.completions.create({
          stream: true,
          messages: [
            {role:"system", content: systemPrompt()},
            {role:"user",   content: buildUserPrompt(q)}
          ]
        });
        let agg=""; for await (const ch of stream){
          const delta = ch.choices?.[0]?.delta?.content || "";
          agg += delta; reply.textContent = agg;
        }
      } catch(e){
        console.error(e);
        reply.textContent = "Error generating reply.";
      }
    };

    sendBtn.onclick = send;
    msg.addEventListener("keydown",(e)=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); }});
    clearBtn.onclick = ()=>{ log.innerHTML=""; append("sys","Chat cleared."); };
  }
}
customElements.define("cc-assistant-widget", CCAssistant);
