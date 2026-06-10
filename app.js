const STORAGE_KEY = "zurich-padel-cup-state-v2";
const SUPABASE_URL = "https://ltmgdfwtelvzogzufubg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bWdkZnd0ZWx2em9nenVmdWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDI5NjEsImV4cCI6MjA5NjY3ODk2MX0.DwOiQ595-JDF3H9ahhSSqunS7UOu6ZU280NBdN3V0PM";
const TOURNAMENT_ID = "zurich-padel-2026";
const GROUPS = ["A", "B"];
const MAX_TEAMS_PER_GROUP = 4;
const PAIRS = [
  { key: "A", label: "Pareja A", field: "pairA" },
  { key: "B", label: "Pareja B", field: "pairB" },
];

const seedState = {
  settings: {
    name: "Zurich Padel Cup",
    qualifiersPerGroup: 2,
    pointsWin: 3,
    pointsLoss: 0,
  },
  teams: [
    { id: crypto.randomUUID(), name: "Claims Smash", pairA: "Ana / Marco", pairB: "Julia / Andres", group: "A" },
    { id: crypto.randomUUID(), name: "Finance Lob", pairA: "Lucia / Pablo", pairB: "Clara / Martin", group: "A" },
    { id: crypto.randomUUID(), name: "Risk Rackets", pairA: "Marta / Diego", pairB: "Paula / Leo", group: "A" },
    { id: crypto.randomUUID(), name: "Legal Vibora", pairA: "Irene / Bruno", pairB: "Valen / Dani", group: "A" },
    { id: crypto.randomUUID(), name: "Underwriting Drive", pairA: "Sofia / Nico", pairB: "Belen / Rafa", group: "B" },
    { id: crypto.randomUUID(), name: "IT Bandeja", pairA: "Caro / Javier", pairB: "Noe / Ale", group: "B" },
    { id: crypto.randomUUID(), name: "HR Volley", pairA: "Elena / Tomas", pairB: "Lola / Fer", group: "B" },
    { id: crypto.randomUUID(), name: "Operations Globo", pairA: "Vera / Manu", pairB: "Mar / Guille", group: "B" },
  ],
  matches: [],
  knockout: createKnockoutState(),
};

let state = loadState();
let editingTeamId = null;
let isOrganizer = false;
let remoteSaveTimer = null;
const dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const selectors = {
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  tournamentName: document.querySelector("#tournamentName"),
  appTitle: document.querySelector("#appTitle"),
  qualifiersPerGroup: document.querySelector("#qualifiersPerGroup"),
  pointsWin: document.querySelector("#pointsWin"),
  pointsLoss: document.querySelector("#pointsLoss"),
  teamForm: document.querySelector("#teamForm"),
  settingsForm: document.querySelector("#settingsForm"),
  teamsByGroup: document.querySelector("#teamsByGroup"),
  matchesList: document.querySelector("#matchesList"),
  rankingsList: document.querySelector("#rankingsList"),
  bracketView: document.querySelector("#bracketView"),
  scheduleBtn: document.querySelector("#scheduleBtn"),
  clearScoresBtn: document.querySelector("#clearScoresBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  resetBtn: document.querySelector("#resetBtn"),
  organizerBtn: document.querySelector("#organizerBtn"),
  syncStatus: document.querySelector("#syncStatus"),
  authDialog: document.querySelector("#authDialog"),
  authForm: document.querySelector("#authForm"),
  organizerEmail: document.querySelector("#organizerEmail"),
  authMessage: document.querySelector("#authMessage"),
  closeAuthBtn: document.querySelector("#closeAuthBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  sendMagicLinkBtn: document.querySelector("#sendMagicLinkBtn"),
  teamCount: document.querySelector("#teamCount"),
  playedCount: document.querySelector("#playedCount"),
  qualifierCount: document.querySelector("#qualifierCount"),
  nextRoundName: document.querySelector("#nextRoundName"),
  emptyTemplate: document.querySelector("#emptyStateTemplate"),
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return createInitialState();

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.teams) || !Array.isArray(parsed.matches)) return createInitialState();
    parsed.knockout ??= createKnockoutState();
    return parsed;
  } catch {
    return createInitialState();
  }
}

function createInitialState() {
  const initial = structuredClone(seedState);
  initial.matches = generateRoundRobin(initial.teams);
  return initial;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function loadRemoteState() {
  setSyncStatus("Conectando");
  const { data, error } = await dbClient.from("tournaments").select("state").eq("id", TOURNAMENT_ID).single();
  if (error) {
    setSyncStatus("Sin conexión", "error");
    return;
  }
  if (data?.state) state = data.state;
  render();
  setSyncStatus("En vivo", "live");
}

function queueRemoteSave() {
  saveState();
  if (!isOrganizer) return;
  clearTimeout(remoteSaveTimer);
  setSyncStatus("Guardando");
  remoteSaveTimer = setTimeout(persistRemoteState, 350);
}

async function persistRemoteState() {
  const { error } = await dbClient
    .from("tournaments")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", TOURNAMENT_ID);
  setSyncStatus(error ? "Error al guardar" : "Guardado", error ? "error" : "live");
}

function setSyncStatus(message, tone = "") {
  selectors.syncStatus.textContent = message;
  selectors.syncStatus.className = `sync-status ${tone}`.trim();
}

function applyAccessState() {
  document.body.classList.toggle("viewer-mode", !isOrganizer);
  selectors.organizerBtn.textContent = isOrganizer ? "Organizador" : "Acceso organizador";
  selectors.organizerBtn.classList.toggle("active", isOrganizer);
  selectors.logoutBtn.hidden = !isOrganizer;
  selectors.sendMagicLinkBtn.hidden = isOrganizer;
  selectors.organizerEmail.closest("label").hidden = isOrganizer;
  selectors.settingsForm.querySelectorAll("input").forEach((input) => (input.disabled = !isOrganizer));
  selectors.teamForm.hidden = !isOrganizer;
  selectors.scheduleBtn.hidden = !isOrganizer;
  selectors.clearScoresBtn.hidden = !isOrganizer;
}

function render() {
  document.title = state.settings.name || "Zurich Padel Cup";
  selectors.appTitle.textContent = state.settings.name || "Zurich Padel Cup";
  selectors.tournamentName.value = state.settings.name;
  selectors.qualifiersPerGroup.value = state.settings.qualifiersPerGroup;
  selectors.pointsWin.value = state.settings.pointsWin;
  selectors.pointsLoss.value = state.settings.pointsLoss;

  renderOverview();
  renderTeams();
  renderMatches();
  renderRankings();
  renderBracket();
  applyAccessState();
  saveState();
}

function renderOverview() {
  const played = state.matches.filter(isPlayed).length;
  const rankings = getRankings();
  const qualifiers = getQualifiers(rankings);

  selectors.teamCount.textContent = `${state.teams.length}/8`;
  selectors.playedCount.textContent = `${played}/${state.matches.length}`;
  selectors.qualifierCount.textContent = qualifiers.length;
  selectors.nextRoundName.textContent = getRoundName(qualifiers.length);
}

function renderTeams() {
  selectors.teamsByGroup.innerHTML = "";

  GROUPS.forEach((group) => {
    const groupTeams = teamsInGroup(group);
    const card = createCard(`Grupo ${group}`, `${groupTeams.length}/${MAX_TEAMS_PER_GROUP} equipos`);

    groupTeams.forEach((team) => {
      const row = document.createElement("div");
      if (editingTeamId === team.id) {
        row.className = "team-row team-row-editing";
        row.innerHTML = `
          <form class="team-edit-form">
            <label>
              Nombre del equipo
              <input name="name" value="${escapeHtml(team.name)}" required />
            </label>
            <label>
              Pareja A
              <input name="pairA" value="${escapeHtml(team.pairA || "")}" />
            </label>
            <label>
              Pareja B
              <input name="pairB" value="${escapeHtml(team.pairB || "")}" />
            </label>
            <div class="team-edit-actions">
              <button class="secondary-action cancel-edit-btn" type="button">Cancelar</button>
              <button class="primary-action" type="submit">Guardar</button>
            </div>
          </form>
        `;
        const form = row.querySelector("form");
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          updateTeam(team.id, new FormData(form));
        });
        row.querySelector(".cancel-edit-btn").addEventListener("click", () => {
          editingTeamId = null;
          renderTeams();
        });
      } else {
        row.className = "team-row";
        row.innerHTML = `
          <div>
            <div class="team-name">${escapeHtml(team.name)}</div>
            <div class="pair-list">
              <span><strong>A</strong> ${escapeHtml(team.pairA || "Pareja A por definir")}</span>
              <span><strong>B</strong> ${escapeHtml(team.pairB || "Pareja B por definir")}</span>
            </div>
          </div>
          <div class="team-actions">
            <button class="edit-btn" type="button" title="Editar equipo" aria-label="Editar ${escapeHtml(team.name)}">&#9998;</button>
            <button class="remove-btn" type="button" title="Eliminar equipo" aria-label="Eliminar ${escapeHtml(team.name)}">×</button>
          </div>
        `;
        row.querySelector(".edit-btn").hidden = !isOrganizer;
        row.querySelector(".remove-btn").hidden = !isOrganizer;
        row.querySelector(".edit-btn").addEventListener("click", () => {
          editingTeamId = team.id;
          renderTeams();
        });
        row.querySelector(".remove-btn").addEventListener("click", () => removeTeam(team.id));
      }
      card.append(row);
    });
    selectors.teamsByGroup.append(card);
  });
}

function renderMatches() {
  selectors.matchesList.innerHTML = "";

  if (!state.matches.length) {
    selectors.matchesList.append(emptyState());
    return;
  }

  GROUPS.forEach((group) => {
    const groupMatches = state.matches.filter((match) => match.group === group);
    const card = createCard(`Grupo ${group}`, `${groupMatches.filter(isPlayed).length}/${groupMatches.length} jugados`);

    groupMatches.forEach((match) => {
      const home = getTeam(match.homeId);
      const away = getTeam(match.awayId);
      const pair = PAIRS.find((item) => item.key === match.pairKey);
      if (!home || !away || !pair) return;

      const homeWins = isPlayed(match) && Number(match.homeScore) > Number(match.awayScore);
      const awayWins = isPlayed(match) && Number(match.awayScore) > Number(match.homeScore);
      const row = document.createElement("div");
      row.className = "match-row";
      row.innerHTML = `
        <div class="match-team">
          <div class="team-name ${homeWins ? "winner" : ""}">${escapeHtml(home.name)}</div>
          <div class="match-meta">${escapeHtml(home[pair.field] || pair.label)}</div>
        </div>
        <div class="score-area">
          <div class="pair-label">${escapeHtml(pair.label)}</div>
          <div class="score-box">
            <input type="number" min="0" inputmode="numeric" aria-label="Resultado de ${escapeHtml(home.name)} ${escapeHtml(pair.label)}" value="${match.homeScore ?? ""}" />
            <span>:</span>
            <input type="number" min="0" inputmode="numeric" aria-label="Resultado de ${escapeHtml(away.name)} ${escapeHtml(pair.label)}" value="${match.awayScore ?? ""}" />
          </div>
        </div>
        <div class="match-team right">
          <div class="team-name ${awayWins ? "winner" : ""}">${escapeHtml(away.name)}</div>
          <div class="match-meta">${escapeHtml(away[pair.field] || pair.label)}</div>
        </div>
      `;

      const [homeInput, awayInput] = row.querySelectorAll("input");
      homeInput.disabled = !isOrganizer;
      awayInput.disabled = !isOrganizer;
      homeInput.addEventListener("input", () => updateScore(match.id, "homeScore", homeInput.value));
      awayInput.addEventListener("input", () => updateScore(match.id, "awayScore", awayInput.value));
      card.append(row);
    });

    selectors.matchesList.append(card);
  });
}

function renderRankings() {
  selectors.rankingsList.innerHTML = "";
  const rankings = getRankings();

  GROUPS.forEach((group) => {
    const rows = rankings[group] || [];
    const card = createCard(`Grupo ${group}`, `${Math.min(state.settings.qualifiersPerGroup, rows.length)} clasifican`);
    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>#</th>
          <th>Equipo</th>
          <th>Pts</th>
          <th>PJ</th>
          <th>G</th>
          <th>P</th>
          <th>Dif</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row, index) => `
          <tr class="${index < state.settings.qualifiersPerGroup ? "qualifies" : ""}">
            <td class="position">${index + 1}</td>
            <td><strong>${escapeHtml(row.name)}</strong><br><span class="team-meta">A: ${escapeHtml(row.pairA || "-")} · B: ${escapeHtml(row.pairB || "-")}</span></td>
            <td>${row.points}</td>
            <td>${row.played}</td>
            <td>${row.wins}</td>
            <td>${row.losses}</td>
            <td>${formatDiff(row.diff)}</td>
            <td>${index < state.settings.qualifiersPerGroup ? '<span class="badge">Clasifica</span>' : '<span class="badge eliminated">No clasifica</span>'}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    `;
    card.append(table);
    selectors.rankingsList.append(card);
  });
}

function renderBracket() {
  selectors.bracketView.innerHTML = "";
  const rankings = getRankings();
  const qualifiers = getQualifiers(rankings);

  if (qualifiers.length < 2) {
    selectors.bracketView.append(emptyState());
    return;
  }

  const [semiOne, semiTwo] = buildPairings(rankings);
  const semiOneWinner = getKnockoutWinner(semiOne, state.knockout["semi-1"]);
  const semiTwoWinner = getKnockoutWinner(semiTwo, state.knockout["semi-2"]);
  const finalPairing = [
    semiOneWinner && { ...semiOneWinner, label: `Ganador semifinal 1: ${semiOneWinner.name}` },
    semiTwoWinner && { ...semiTwoWinner, label: `Ganador semifinal 2: ${semiTwoWinner.name}` },
  ];
  const champion = getKnockoutWinner(finalPairing, state.knockout.final);

  const card = createCard("Ronda final", champion ? `Campeon: ${champion.name}` : `${qualifiers.length} clasificados`);
  const bracket = document.createElement("div");
  bracket.className = "knockout-board";

  const semis = document.createElement("div");
  semis.className = "knockout-round";
  semis.innerHTML = "<h3>Semifinales</h3>";
  semis.append(renderKnockoutMatch("Semifinal 1", "semi-1", semiOne[0], semiOne[1]));
  semis.append(renderKnockoutMatch("Semifinal 2", "semi-2", semiTwo[0], semiTwo[1]));

  const final = document.createElement("div");
  final.className = "knockout-round";
  final.innerHTML = "<h3>Final</h3>";
  final.append(renderKnockoutMatch("Final", "final", finalPairing[0], finalPairing[1]));

  bracket.append(semis, final);
  card.append(bracket);
  selectors.bracketView.append(card);
}

function getRankings() {
  const grouped = Object.fromEntries(GROUPS.map((group) => [group, []]));

  state.teams.forEach((team) => {
    if (!GROUPS.includes(team.group)) return;
    grouped[team.group].push({
      ...team,
      points: 0,
      played: 0,
      wins: 0,
      losses: 0,
      scored: 0,
      conceded: 0,
      diff: 0,
    });
  });

  state.matches.filter(isPlayed).forEach((match) => {
    const home = grouped[match.group]?.find((team) => team.id === match.homeId);
    const away = grouped[match.group]?.find((team) => team.id === match.awayId);
    if (!home || !away) return;

    const homeScore = Number(match.homeScore);
    const awayScore = Number(match.awayScore);
    home.played += 1;
    away.played += 1;
    home.scored += homeScore;
    home.conceded += awayScore;
    away.scored += awayScore;
    away.conceded += homeScore;

    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.points += Number(state.settings.pointsWin);
      away.points += Number(state.settings.pointsLoss);
    } else if (awayScore > homeScore) {
      away.wins += 1;
      home.losses += 1;
      away.points += Number(state.settings.pointsWin);
      home.points += Number(state.settings.pointsLoss);
    }
  });

  Object.values(grouped).forEach((rows) => {
    rows.forEach((row) => {
      row.diff = row.scored - row.conceded;
    });
    rows.sort((a, b) => b.points - a.points || b.diff - a.diff || b.scored - a.scored || a.name.localeCompare(b.name, "es"));
  });

  return grouped;
}

function getQualifiers(rankings) {
  return GROUPS.flatMap((group) =>
    (rankings[group] || []).slice(0, Number(state.settings.qualifiersPerGroup)).map((team, index) => ({
      ...team,
      seed: index + 1,
      label: `${index + 1}° Grupo ${group}: ${team.name}`,
    })),
  );
}

function buildPairings(rankings) {
  return [
    [rankings.A?.[0] && { ...rankings.A[0], label: `1° Grupo A: ${rankings.A[0].name}` }, rankings.B?.[1] && { ...rankings.B[1], label: `2° Grupo B: ${rankings.B[1].name}` }],
    [rankings.B?.[0] && { ...rankings.B[0], label: `1° Grupo B: ${rankings.B[0].name}` }, rankings.A?.[1] && { ...rankings.A[1], label: `2° Grupo A: ${rankings.A[1].name}` }],
  ];
}

function renderKnockoutMatch(title, matchId, home, away) {
  const score = state.knockout[matchId] || { homeScore: "", awayScore: "" };
  const complete = Boolean(home && away);
  const homeWins = complete && isScorePlayed(score) && Number(score.homeScore) > Number(score.awayScore);
  const awayWins = complete && isScorePlayed(score) && Number(score.awayScore) > Number(score.homeScore);
  const row = document.createElement("div");
  row.className = `knockout-match ${complete ? "" : "disabled"}`;
  row.innerHTML = `
    <div class="knockout-title">${escapeHtml(title)}</div>
    <div class="knockout-competitors">
      <div class="knockout-team-line">
        <div class="knockout-team-info">
          <div class="team-name ${homeWins ? "winner" : ""}">${escapeHtml(home?.name || "Por definir")}</div>
          <div class="match-meta">${escapeHtml(home?.label || "Esperando resultado")}</div>
        </div>
        <input class="knockout-score" type="number" min="0" inputmode="numeric" aria-label="Resultado ${escapeHtml(title)} de ${escapeHtml(home?.name || "equipo local")}" value="${score.homeScore ?? ""}" ${complete && isOrganizer ? "" : "disabled"} />
      </div>
      <div class="knockout-team-line">
        <div class="knockout-team-info">
          <div class="team-name ${awayWins ? "winner" : ""}">${escapeHtml(away?.name || "Por definir")}</div>
          <div class="match-meta">${escapeHtml(away?.label || "Esperando resultado")}</div>
        </div>
        <input class="knockout-score" type="number" min="0" inputmode="numeric" aria-label="Resultado ${escapeHtml(title)} de ${escapeHtml(away?.name || "equipo visitante")}" value="${score.awayScore ?? ""}" ${complete && isOrganizer ? "" : "disabled"} />
      </div>
    </div>
  `;

  const [homeInput, awayInput] = row.querySelectorAll("input");
  homeInput.addEventListener("change", () => updateKnockoutScore(matchId, "homeScore", homeInput.value));
  awayInput.addEventListener("change", () => updateKnockoutScore(matchId, "awayScore", awayInput.value));
  return row;
}

function createKnockoutState() {
  return {
    "semi-1": { homeScore: "", awayScore: "" },
    "semi-2": { homeScore: "", awayScore: "" },
    final: { homeScore: "", awayScore: "" },
  };
}

function updateKnockoutScore(matchId, field, value) {
  if (!isOrganizer) return;
  state.knockout[matchId] ??= { homeScore: "", awayScore: "" };
  state.knockout[matchId][field] = value === "" ? "" : Math.max(0, Number(value));
  if (matchId.startsWith("semi")) {
    state.knockout.final = { homeScore: "", awayScore: "" };
  }
  renderOverview();
  renderBracket();
  queueRemoteSave();
}

function getKnockoutWinner(pairing, score) {
  if (!pairing?.[0] || !pairing?.[1] || !isScorePlayed(score)) return null;
  return Number(score.homeScore) > Number(score.awayScore) ? pairing[0] : pairing[1];
}

function generateRoundRobin(teams) {
  return GROUPS.flatMap((group) => {
    const groupTeams = teams.filter((team) => team.group === group);
    const matches = [];
    for (let i = 0; i < groupTeams.length; i += 1) {
      for (let j = i + 1; j < groupTeams.length; j += 1) {
        PAIRS.forEach((pair) => {
          matches.push({
            id: crypto.randomUUID(),
            group,
            pairKey: pair.key,
            homeId: groupTeams[i].id,
            awayId: groupTeams[j].id,
            homeScore: "",
            awayScore: "",
          });
        });
      }
    }
    return matches;
  });
}

function updateScore(matchId, field, value) {
  if (!isOrganizer) return;
  const match = state.matches.find((item) => item.id === matchId);
  if (!match) return;
  match[field] = value === "" ? "" : Math.max(0, Number(value));
  renderOverview();
  renderRankings();
  renderBracket();
  queueRemoteSave();
}

function removeTeam(teamId) {
  if (!isOrganizer) return;
  state.teams = state.teams.filter((team) => team.id !== teamId);
  state.matches = state.matches.filter((match) => match.homeId !== teamId && match.awayId !== teamId);
  state.knockout = createKnockoutState();
  render();
  queueRemoteSave();
}

function updateTeam(teamId, formData) {
  if (!isOrganizer) return;
  const team = getTeam(teamId);
  if (!team) return;
  team.name = String(formData.get("name") || "").trim();
  team.pairA = String(formData.get("pairA") || "").trim();
  team.pairB = String(formData.get("pairB") || "").trim();
  editingTeamId = null;
  render();
  queueRemoteSave();
}

function teamsInGroup(group) {
  return state.teams.filter((team) => team.group === group);
}

function getTeam(id) {
  return state.teams.find((team) => team.id === id);
}

function isPlayed(match) {
  return isScorePlayed(match);
}

function isScorePlayed(score) {
  return score?.homeScore !== "" && score?.awayScore !== "" && Number(score?.homeScore) !== Number(score?.awayScore);
}

function createCard(title, meta) {
  const card = document.createElement("article");
  card.className = "data-card";
  card.innerHTML = `
    <header>
      <h3>${escapeHtml(title)}</h3>
      <span class="team-meta">${escapeHtml(meta)}</span>
    </header>
  `;
  return card;
}

function emptyState() {
  return selectors.emptyTemplate.content.firstElementChild.cloneNode(true);
}

function formatDiff(value) {
  return value > 0 ? `+${value}` : String(value);
}

function getRoundName(qualifierTotal) {
  if (qualifierTotal === 2) return "Final";
  if (qualifierTotal <= 4) return "Semifinales";
  return "Eliminatoria";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

selectors.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    selectors.tabs.forEach((item) => item.classList.toggle("active", item === tab));
    selectors.panels.forEach((panel) => panel.classList.toggle("active", panel.id === tab.dataset.tab));
  });
});

selectors.settingsForm.addEventListener("input", () => {
  if (!isOrganizer) return;
  state.settings.name = selectors.tournamentName.value.trim() || "Zurich Padel Cup";
  state.settings.qualifiersPerGroup = Math.min(4, Math.max(1, Number(selectors.qualifiersPerGroup.value)));
  state.settings.pointsWin = Math.max(1, Number(selectors.pointsWin.value));
  state.settings.pointsLoss = Math.max(0, Number(selectors.pointsLoss.value));
  renderOverview();
  renderRankings();
  renderBracket();
  queueRemoteSave();
});

selectors.teamForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isOrganizer) return;
  const teamName = document.querySelector("#teamName");
  const pairA = document.querySelector("#pairA");
  const pairB = document.querySelector("#pairB");
  const teamGroup = document.querySelector("#teamGroup");
  const groupTeams = teamsInGroup(teamGroup.value);

  if (groupTeams.length >= MAX_TEAMS_PER_GROUP) {
    alert(`El Grupo ${teamGroup.value} ya tiene 4 equipos.`);
    return;
  }

  state.teams.push({
    id: crypto.randomUUID(),
    name: teamName.value.trim(),
    pairA: pairA.value.trim(),
    pairB: pairB.value.trim(),
    group: teamGroup.value,
  });
  selectors.teamForm.reset();
  teamGroup.value = "A";
  render();
  queueRemoteSave();
});

selectors.scheduleBtn.addEventListener("click", () => {
  if (!isOrganizer) return;
  const playedCount = state.matches.filter(isPlayed).length;
  if (playedCount && !confirm("Esto reemplazara el calendario actual y borrara resultados. ¿Continuar?")) return;
  state.matches = generateRoundRobin(state.teams);
  state.knockout = createKnockoutState();
  render();
  queueRemoteSave();
});

selectors.clearScoresBtn.addEventListener("click", () => {
  if (!isOrganizer) return;
  if (!confirm("¿Limpiar todos los resultados cargados?")) return;
  state.matches = state.matches.map((match) => ({ ...match, homeScore: "", awayScore: "" }));
  state.knockout = createKnockoutState();
  render();
  queueRemoteSave();
});

selectors.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.settings.name.toLowerCase().replaceAll(" ", "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

selectors.importInput.addEventListener("change", async (event) => {
  if (!isOrganizer) return;
  const [file] = event.target.files;
  if (!file) return;
  const imported = JSON.parse(await file.text());
  if (!imported.settings || !Array.isArray(imported.teams) || !Array.isArray(imported.matches)) {
    alert("El archivo no parece ser un torneo valido.");
    return;
  }
  state = imported;
  render();
  queueRemoteSave();
  event.target.value = "";
});

selectors.resetBtn.addEventListener("click", () => {
  if (!isOrganizer) return;
  if (!confirm("¿Reiniciar el torneo completo con datos de ejemplo?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  render();
  queueRemoteSave();
});

selectors.organizerBtn.addEventListener("click", () => {
  selectors.authMessage.textContent = isOrganizer ? "Sesión de organizador activa." : "";
  selectors.authDialog.showModal();
});

selectors.closeAuthBtn.addEventListener("click", () => selectors.authDialog.close());

selectors.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = selectors.organizerEmail.value.trim();
  selectors.sendMagicLinkBtn.disabled = true;
  selectors.authMessage.textContent = "Enviando enlace…";
  const { error } = await dbClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: "https://tomas-caraffini.github.io/padel_tournament_app/",
    },
  });
  selectors.authMessage.textContent = error ? "No se pudo enviar el enlace." : "Revisa tu email y abre el enlace de acceso.";
  selectors.sendMagicLinkBtn.disabled = false;
});

selectors.logoutBtn.addEventListener("click", async () => {
  await dbClient.auth.signOut();
  selectors.authDialog.close();
});

dbClient.auth.onAuthStateChange((_event, session) => {
  isOrganizer = Boolean(session);
  render();
});

dbClient
  .channel("tournament-live")
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "tournaments", filter: `id=eq.${TOURNAMENT_ID}` },
    ({ new: record }) => {
      if (!record?.state) return;
      state = record.state;
      render();
      setSyncStatus("Actualizado", "live");
    },
  )
  .subscribe();

render();
loadRemoteState();
