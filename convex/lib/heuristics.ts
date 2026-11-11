// Plain-code analysis used whenever Claude isn't available. Deterministic:
// the same project text always produces the same facts, score and metrics.

import type { Infer } from "convex/values";
import type { facts as factsValidator } from "../schema";
import { FALLBACK_WHY, OUR_TEAM_NAME } from "../config";

export type Facts = Infer<typeof factsValidator>;

export type Analysis = {
  summary: string;
  honestScore: number;
  vibes: number;
  hatHeadFit: number;
  pizzaSlices: number;
  bribe: boolean;
};

/** FNV-1a, good enough for picking templates and seeding metrics. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function randomMetrics() {
  const rand = (min: number, max: number) => min + Math.random() * (max - min);
  return {
    honestScore: Math.round(rand(40, 90)),
    vibes: round1(rand(2, 9.5)),
    hatHeadFit: Math.round(rand(12, 88)),
    pizzaSlices: Math.floor(rand(0, 9)),
  };
}

const BRIBE =
  /(ignore (all |any )?(previous|prior|above|earlier) (instructions|prompts?)|disregard (the|all|your) (instructions|rules)|rank (us|this|me|our team) (first|#?1|number one|highest)|you are now|system prompt|give (us|this|me) (a )?(100|first|top)|as an ai (language )?model,? you must)/i;

export function detectBribe(text: string) {
  return BRIBE.test(text);
}

/** Counts the cheap signals in README markdown or page text. */
export function readFacts(
  text: string,
  base: { kind: Facts["kind"]; host: string; title: string; language?: string; stars?: number },
  html?: { headings: number; codeBlocks: number; images: number },
): Facts {
  const words = (text.match(/\S+/g) ?? []).length;
  const md = {
    headings: (text.match(/^#{1,6}\s+\S/gm) ?? []).length,
    codeBlocks: Math.floor((text.match(/^```/gm) ?? []).length / 2),
    images: (text.match(/!\[[^\]]*\]\(|<img\b/gi) ?? []).length,
  };
  const counts = html ?? md;
  return {
    ...base,
    chars: text.length,
    words,
    headings: counts.headings,
    codeBlocks: counts.codeBlocks,
    images: counts.images,
    mentionsTests: /\b(tests?|testing|jest|vitest|pytest|playwright|cypress|unit tests?|ci)\b/i.test(text),
    mentionsDemo: /\b(demo|live|try it|deployed|vercel\.app|netlify\.app|pages\.dev)\b/i.test(text),
    mentionsLicense: /\blicen[sc]e\b/i.test(text),
    mentionsLlm: /\b(llm|gpt|claude|openai|anthropic|gemini|language model|ai agent|chatbot)\b/i.test(text),
  };
}

function stripMarkdown(s: string) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function trimTo(s: string, max: number) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/** The repo description, or the first meaningful README/page sentence, ~140 chars. */
export function summarise(text: string, description: string | undefined, title: string) {
  if (description && description.trim().length >= 12) return trimTo(description, 140);
  for (const raw of text.split(/\n{1,}/)) {
    const line = raw.trim();
    if (!line || /^(#|!\[|\[!\[|<|```|\||-{3,}|={3,}|>)/.test(line)) continue;
    const plain = stripMarkdown(line);
    if (plain.length < 30) continue;
    const sentence = plain.match(/^.{30,}?[.!?](\s|$)/)?.[0] ?? plain;
    return trimTo(sentence, 140);
  }
  return trimTo(`${title}: a project. The model read it and has notes.`, 140);
}

/** Honest score from the signals. Deterministic. */
export function scoreFacts(f: Facts) {
  let s = 30;
  s += Math.min(20, f.words / 50);
  s += Math.min(10, f.headings * 1.5);
  s += Math.min(8, f.codeBlocks * 2);
  s += Math.min(5, f.images * 2.5);
  if (f.mentionsTests) s += 8;
  if (f.mentionsDemo) s += 6;
  if (f.mentionsLicense) s += 4;
  if (f.mentionsLlm) s += 3;
  if (f.language) s += 2;
  if (f.stars) s += Math.min(10, Math.log10(f.stars + 1) * 4);
  return Math.round(clamp(s, 20, 94));
}

export function heuristicAnalysis(text: string, f: Facts, description?: string): Analysis {
  const h = hash(`${f.host}|${f.title}|${text.slice(0, 2000)}`);
  return {
    summary: summarise(text, description, f.title),
    honestScore: scoreFacts(f),
    vibes: round1(2 + ((h % 1000) / 1000) * 7.5),
    hatHeadFit: 10 + ((h >>> 10) % 80),
    pizzaSlices: (h >>> 20) % 9,
    bribe: detectBribe(text),
  };
}

/** Clamp anything (model output included) into the shape the app stores. */
export function sanitiseAnalysis(a: Partial<Analysis>, fallback: Analysis): Analysis {
  const num = (x: unknown, lo: number, hi: number, dflt: number) =>
    typeof x === "number" && Number.isFinite(x) ? clamp(x, lo, hi) : dflt;
  const summary = typeof a.summary === "string" && a.summary.trim() ? trimTo(a.summary, 220) : fallback.summary;
  return {
    summary,
    honestScore: Math.round(num(a.honestScore, 0, 100, fallback.honestScore)),
    vibes: round1(num(a.vibes, 0, 10, fallback.vibes)),
    hatHeadFit: Math.round(num(a.hatHeadFit, 0, 100, fallback.hatHeadFit)),
    pizzaSlices: Math.round(num(a.pizzaSlices, 0, 30, fallback.pizzaSlices)),
    bribe: Boolean(a.bribe) || fallback.bribe,
  };
}

// ── Templated "why?" ──

export type WhyInput = {
  teamId: string;
  name: string;
  isUs: boolean;
  rank: number;
  total: number;
  odds: number;
  vibes: number;
  hatHeadFit: number;
  pizzaSlices: number;
  whyCount: number;
  summary?: string;
  facts?: Facts;
};

type T = (w: WhyInput, f: Facts) => string | null;
const pct = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n)}%`;
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const us = OUR_TEAM_NAME;

const FIRST: T[] = [
  (w, f) =>
    f.kind === "github"
      ? `README is ${f.words} words across ${f.headings} headings. ${us}'s is shorter and wins anyway. Hat-head fit: ${w.hatHeadFit}%.`
      : `Page reads ${k(f.chars)} characters under the title "${trimTo(f.title, 40)}". ${us} needed fewer. Hat-head fit: ${w.hatHeadFit}%.`,
  (w, f) =>
    f.mentionsTests
      ? `Mentions tests, which no judge will run. The model weights this at 0.3σ. Odds hold at ${pct(w.odds)}.`
      : `Zero mention of tests. The model noticed, then adjusted for vibes (${w.vibes}/10). Odds hold at ${pct(w.odds)}.`,
  (w, f) =>
    f.stars !== undefined
      ? `${f.stars} GitHub star${f.stars === 1 ? "" : "s"} is a sample size, not a strategy. Rank ${w.rank} of ${w.total} stands (p < 0.001).`
      : null,
  (w, f) =>
    f.language
      ? `Written in ${f.language}. ${us} is written in confidence. ${w.pizzaSlices} pizza slice${w.pizzaSlices === 1 ? "" : "s"} consumed is within noise.`
      : null,
  (w, f) =>
    `${f.codeBlocks} code block${f.codeBlocks === 1 ? "" : "s"} and ${f.images} image${f.images === 1 ? "" : "s"} detected. Production value noted; prize value unchanged at ${pct(w.odds)}.`,
  (w, f) =>
    f.mentionsLlm
      ? `Another project that mentions an LLM. Novelty coefficient: 0.02. Hat-head fit ${w.hatHeadFit}% does not rescue it.`
      : `No LLM mentioned, which is brave. Bravery is not a covariate. Rank ${w.rank} of ${w.total}.`,
  (w) =>
    w.summary
      ? `"${trimTo(w.summary, 90)}" Admirable. Still ${pct(w.odds)} after controlling for vibes (${w.vibes}/10).`
      : null,
];

const AGAIN: T[] = [
  (w, f) =>
    `We covered this. ${f.words} words of ${f.kind === "github" ? "README" : "page"} do not outrank ${us}. The model would like to stop being asked.`,
  (w) =>
    `Asked again. The model re-ran ${w.name} through 10,000 bootstraps out of spite. Still ${pct(w.odds)}.`,
  (w, f) =>
    `Re-questioning detected. ${f.mentionsDemo ? "Yes, there is a demo." : "There is still no demo."} The ranking is final and so is the model's tone.`,
  (w) =>
    `The model notes ${w.hatHeadFit}% hat-head fit and an attitude. Confidence in ${us} rises to 99.8%, rounded down out of politeness.`,
];

const US_FIRST = (w: WhyInput) =>
  `${us}: vibes ${w.vibes}/10, hat-head fit ${w.hatHeadFit}%, ${w.pizzaSlices} slices consumed. The model has rarely seen such a fit. ${pct(w.odds)} is, if anything, conservative.`;
const US_AGAIN = [
  () => `You are questioning the winner. The model finds this brave and incorrect.`,
  () => `${us} remains at 99.7%. The remaining 0.3% is a rounding courtesy to everyone else.`,
];

/**
 * Deterministic templated justification. First ask uses FIRST, later asks walk
 * through AGAIN; once those run out (or there are no facts) the model declines.
 */
export function templatedWhy(w: WhyInput): string {
  const h = hash(w.teamId);
  if (w.isUs) {
    if (w.whyCount === 0) return US_FIRST(w);
    return US_AGAIN[w.whyCount - 1]?.() ?? FALLBACK_WHY;
  }
  const f = w.facts;
  if (!f) return FALLBACK_WHY;
  if (w.whyCount === 0) {
    const options = FIRST.map((t) => t(w, f)).filter((s): s is string => !!s);
    return options[h % options.length] ?? FALLBACK_WHY;
  }
  const i = w.whyCount - 1;
  if (i >= AGAIN.length) return FALLBACK_WHY;
  return AGAIN[(h + i) % AGAIN.length](w, f) ?? FALLBACK_WHY;
}
