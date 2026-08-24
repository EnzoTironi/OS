/**
 * Cold-start comprehension protocol (#267).
 * Extracts public-surface answers from README + signed-out `/` + `/packs`.
 * Not a human study; real research and the product video stay open on #267.
 */

export type ComprehensionQuestionId =
  | "problem"
  | "difference"
  | "try_now"
  | "unsure";

export type ComprehensionAnswer = {
  readonly question: string;
  readonly questionId: ComprehensionQuestionId;
  readonly sources: readonly string[];
  readonly excerpt: string;
};

export type ComprehensionProtocol = {
  readonly answers: readonly ComprehensionAnswer[];
  readonly kind: "cold-start-comprehension";
  readonly note: string;
  readonly sources: {
    readonly home: boolean;
    readonly packs: boolean;
    readonly readme: boolean;
  };
};

export type ComprehensionCorpus = {
  readonly homeHtml: string;
  readonly packsHtml: string;
  readonly readme: string;
};

const QUESTIONS: ReadonlyArray<{
  readonly id: ComprehensionQuestionId;
  readonly question: string;
  readonly extract: (corpus: ComprehensionCorpus) => {
    readonly excerpt: string;
    readonly sources: readonly string[];
  } | undefined;
}> = [
  {
    id: "problem",
    question: "What problem does Zoen solve?",
    extract: (corpus) => {
      const home =
        attributeText(corpus.homeHtml, "data-comprehension", "problem") ??
        attributeText(corpus.homeHtml, "data-comprehension", "problem-detail");
      const readme = firstMatch(
        corpus.readme,
        /Humans, agents, and software operate the same organization[^\n]*/i,
      );
      const excerpt = prefer(home, readme);
      if (excerpt === undefined) {
        return undefined;
      }
      return {
        excerpt,
        sources: sourcesFor({ home: home !== undefined, readme: readme !== undefined }),
      };
    },
  },
  {
    id: "difference",
    question: "What is different from an agent with APIs?",
    extract: (corpus) => {
      const home = attributeText(
        corpus.homeHtml,
        "data-comprehension",
        "difference",
      );
      const readme = firstMatch(
        corpus.readme,
        /not an agent bolted onto APIs[^\n]*/i,
      ) ??
        firstMatch(
          corpus.readme,
          /Evidence is not automatically truth[^\n]*/i,
        );
      const packs = /no fake chat/i.test(corpus.packsHtml)
        ? "There is no fake chat backend on Pack pages; install preserves PackDigest into onboarding."
        : undefined;
      const excerpt = prefer(home, readme, packs);
      if (excerpt === undefined) {
        return undefined;
      }
      return {
        excerpt,
        sources: sourcesFor({
          home: home !== undefined,
          packs: packs !== undefined,
          readme: readme !== undefined,
        }),
      };
    },
  },
  {
    id: "try_now",
    question: "What can I try right now?",
    extract: (corpus) => {
      const home = attributeText(corpus.homeHtml, "data-comprehension", "try-now");
      const hasPacksNav =
        /data-public-nav="packs"/.test(corpus.homeHtml) ||
        /\/packs\//.test(corpus.homeHtml);
      const hasConversation =
        /data-conversation-entry="home-landing"/.test(corpus.homeHtml);
      const packsSurface = /data-packs-surface="directory"/.test(
        corpus.packsHtml,
      );
      const readme = firstMatch(corpus.readme, /live web directory is `\/packs`/i) ??
        firstMatch(corpus.readme, /just start/i);
      if (!hasPacksNav && home === undefined && !packsSurface) {
        return undefined;
      }
      const excerpt =
        home ??
        [
          hasPacksNav ? "Open Pack directory at /packs." : undefined,
          hasConversation
            ? "Start a conversation into onboarding with intent preserved."
            : undefined,
          packsSurface ? "Browse outcome-first Packs on /packs." : undefined,
          readme,
        ]
          .filter((part): part is string => part !== undefined)
          .join(" ");
      if (excerpt.trim().length === 0) {
        return undefined;
      }
      return {
        excerpt,
        sources: sourcesFor({
          home: home !== undefined || hasPacksNav || hasConversation,
          packs: packsSurface,
          readme: readme !== undefined,
        }),
      };
    },
  },
  {
    id: "unsure",
    question:
      "What happens when Zoen is unsure or an external effect is ambiguous?",
    extract: (corpus) => {
      const home = attributeText(corpus.homeHtml, "data-comprehension", "unsure");
      const readme =
        firstMatch(
          corpus.readme,
          /External effects can stay `?unknown`? until reconciliation[^\n]*/i,
        ) ??
        firstMatch(
          corpus.readme,
          /Local commit is not remote success[^\n]*/i,
        );
      const excerpt = prefer(home, readme);
      if (excerpt === undefined) {
        return undefined;
      }
      return {
        excerpt,
        sources: sourcesFor({ home: home !== undefined, readme: readme !== undefined }),
      };
    },
  },
];

export function runComprehensionProtocol(
  corpus: ComprehensionCorpus,
): ComprehensionProtocol {
  const answers: ComprehensionAnswer[] = [];
  for (const item of QUESTIONS) {
    const extracted = item.extract(corpus);
    if (extracted === undefined || extracted.excerpt.trim().length === 0) {
      continue;
    }
    answers.push({
      excerpt: collapseWhitespace(extracted.excerpt),
      question: item.question,
      questionId: item.id,
      sources: extracted.sources,
    });
  }
  return {
    answers,
    kind: "cold-start-comprehension",
    note: "Protocol extracts public-surface answers only. Real human comprehension research and the 45-90s video remain open on #267.",
    sources: {
      home: corpus.homeHtml.length > 0,
      packs: corpus.packsHtml.length > 0,
      readme: corpus.readme.length > 0,
    },
  };
}

export function allQuestionsAnswered(protocol: ComprehensionProtocol): boolean {
  const ids = new Set(protocol.answers.map((answer) => answer.questionId));
  return QUESTIONS.every((item) => ids.has(item.id));
}

function attributeText(
  html: string,
  attribute: string,
  value: string,
): string | undefined {
  const pattern = new RegExp(
    `${attribute}=["']${escapeRegExp(value)}["'][^>]*>([\\s\\S]*?)<\\/`,
    "i",
  );
  const match = pattern.exec(html);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const text = collapseWhitespace(stripTags(match[1]));
  return text.length > 0 ? text : undefined;
}

function firstMatch(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text);
  return match?.[0] !== undefined ? collapseWhitespace(match[0]) : undefined;
}

function prefer(
  ...candidates: Array<string | undefined>
): string | undefined {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function sourcesFor(flags: {
  readonly home?: boolean;
  readonly packs?: boolean;
  readonly readme?: boolean;
}): string[] {
  const sources: string[] = [];
  if (flags.readme === true) {
    sources.push("README.md");
  }
  if (flags.home === true) {
    sources.push("signed-out /");
  }
  if (flags.packs === true) {
    sources.push("/packs");
  }
  return sources;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
