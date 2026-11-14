/**
 * Parser pour le code texte colle dans /password par structure.
 *
 * Format accepte (toutes structures) :
 *   Stage 1            (uniquement pour "stages", ignorable sinon)
 *   Round 1            (ou "Group A", "Quarter-finals", "QF", "SF", "GF"...)
 *   1 - Team A vs Team B
 *   2. Team C vs Team D
 *   - Team E vs Team F
 *
 * Tolere : "1.", "1 -", "1)", "-", "*", "•", pas de puce.
 * Noms d'equipes bruts tels qu'ecrits (resolution contre la DB se fait apres).
 *
 * Retourne :
 *   {
 *     stages: [
 *       {
 *         name: "Stage 1",
 *         rounds: [
 *           { name: "Round 1", matches: [{ idx:1, team1:"...", team2:"..." }, ...] },
 *           ...
 *         ]
 *       },
 *       ...
 *     ]
 *   }
 *
 * Pour Group / Playin / Playoffs : 1 seul stage (name: "") contenant les rounds
 * ("Group A", "Group B", "Quarter-finals", "Semi-finals"...).
 */

const RE_STAGE   = /^\s*stage\s+(\d+|[A-Z0-9]+)\s*$/i;
const RE_ROUND   = /^\s*(round\s+\d+|group\s+[A-Z]|quarter[-\s]?finals?|semi[-\s]?finals?|grand\s+final|grand[-\s]?final|final|3rd\s+place|third\s+place|qf|sf|gf|upper[-\s]?bracket|lower[-\s]?bracket|ub[-\s]?round\s+\d+|lb[-\s]?round\s+\d+)\s*:?\s*$/i;
const RE_MATCH   = /^\s*(?:\d+\s*[-.)]\s*|[-*•]\s+)?(.+?)\s+vs\.?\s+(.+?)\s*$/i;

function normalizeLabel(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

export function parseBracketCode(text) {
  const lines = String(text || "").split(/\r?\n/);
  const stages = [];
  let currentStage = null;
  let currentRound = null;

  function ensureStage() {
    if (!currentStage) {
      currentStage = { name: "", rounds: [] };
      stages.push(currentStage);
    }
    return currentStage;
  }
  function ensureRound(name) {
    ensureStage();
    currentRound = { name: normalizeLabel(name), matches: [] };
    currentStage.rounds.push(currentRound);
    return currentRound;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const mStage = line.match(RE_STAGE);
    if (mStage) {
      currentStage = { name: normalizeLabel(line), rounds: [] };
      stages.push(currentStage);
      currentRound = null;
      continue;
    }

    const mRound = line.match(RE_ROUND);
    if (mRound) {
      ensureRound(mRound[1]);
      continue;
    }

    const mMatch = line.match(RE_MATCH);
    if (mMatch) {
      if (!currentRound) ensureRound("Round 1");
      const team1 = normalizeLabel(mMatch[1]).replace(/^\d+\s*[-.)]\s*/, "");
      const team2 = normalizeLabel(mMatch[2]);
      currentRound.matches.push({
        idx: currentRound.matches.length + 1,
        team1,
        team2,
      });
      continue;
    }
    // ligne inconnue : on ignore silencieusement (commentaires, titres)
  }

  // Si tout est vide, renvoie structure vide
  if (!stages.length) return { stages: [] };
  return { stages };
}

/**
 * Validation legere : chaque round doit avoir au moins 1 match, chaque match
 * doit avoir 2 noms non vides. Retourne { ok: true } ou { ok: false, errors: [...] }.
 */
export function validateParsedCode(parsed) {
  const errors = [];
  if (!parsed || !Array.isArray(parsed.stages) || parsed.stages.length === 0) {
    return { ok: false, errors: ["Aucun stage/round detecte"] };
  }
  for (const [si, s] of parsed.stages.entries()) {
    if (!s.rounds.length) errors.push(`Stage ${si + 1} (${s.name || "sans nom"}) : aucun round`);
    for (const [ri, r] of s.rounds.entries()) {
      if (!r.matches.length) errors.push(`${s.name || "Stage ?"} > ${r.name || "Round ?"} : aucun match`);
      for (const [mi, m] of r.matches.entries()) {
        if (!m.team1 || !m.team2) errors.push(`${s.name || "?"} > ${r.name || "?"} > match ${mi + 1} : equipe manquante`);
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}
