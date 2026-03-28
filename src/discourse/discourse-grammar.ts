// Discourse pattern detection engine for Japanese

export type DiscourseCategory =
    | '話題開始'
    | '理由・説明'
    | '文末モダリティ'
    | '接続・展開'
    | '確認・同意要求'
    | '言い換え・修正'
    | 'フィラー・ヘッジ'
    | '引用・伝聞';

export type MarkerPosition = 'initial' | 'medial' | 'final' | 'any';
export type RegisterLevel = 'casual' | 'neutral' | 'formal';
export type PragmaticFunction =
    | 'explain'
    | 'hedge'
    | 'assert'
    | 'seek-agreement'
    | 'rephrase'
    | 'initiate'
    | 'connect'
    | 'quote'
    | 'fill';

export interface DiscoursePattern {
    id: string;
    pattern: string | RegExp;
    category: DiscourseCategory;
    position: MarkerPosition;
    coOccurrences: string[];
    registerLevel: RegisterLevel;
    pragmaticFunction: PragmaticFunction;
    description: string;
}

export interface DetectedMarker {
    patternId: string;
    pattern: DiscoursePattern;
    matchedText: string;
    startIndex: number;
    endIndex: number;
    position: MarkerPosition;
}

export const DISCOURSE_PATTERNS: DiscoursePattern[] = [
    // ─── 話題開始 ────────────────────────────────────────────────────────────
    { id: "topic-kekkyoku", pattern: "結局", category: "話題開始", position: "initial", coOccurrences: ["topic-yousuruni", "topic-tsumari"], registerLevel: "casual", pragmaticFunction: "initiate", description: "Signals summing up or returning to point" },
    { id: "topic-maa", pattern: "まあ", category: "話題開始", position: "initial", coOccurrences: ["filler-nanka", "topic-jitsuwa"], registerLevel: "casual", pragmaticFunction: "initiate", description: "Soft topic opener / hedging opener" },
    { id: "topic-yousuruni", pattern: "要するに", category: "話題開始", position: "initial", coOccurrences: ["topic-tsumari", "topic-kekkyoku"], registerLevel: "neutral", pragmaticFunction: "initiate", description: "In short / to put it briefly" },
    { id: "topic-tsumari", pattern: "つまり", category: "話題開始", position: "initial", coOccurrences: ["topic-yousuruni", "topic-kekkyoku"], registerLevel: "neutral", pragmaticFunction: "initiate", description: "That is to say / in other words" },
    { id: "topic-somosomo", pattern: "そもそも", category: "話題開始", position: "initial", coOccurrences: ["reason-nazenara", "reason-toiuwa"], registerLevel: "neutral", pragmaticFunction: "initiate", description: "In the first place / to begin with" },
    { id: "topic-kihonteki", pattern: "基本的に", category: "話題開始", position: "initial", coOccurrences: ["topic-jissai"], registerLevel: "neutral", pragmaticFunction: "initiate", description: "Basically / fundamentally" },
    { id: "topic-shoujiki", pattern: "正直", category: "話題開始", position: "initial", coOccurrences: ["topic-bucchake", "filler-chotto"], registerLevel: "casual", pragmaticFunction: "initiate", description: "Honestly speaking" },
    { id: "topic-bucchake", pattern: "ぶっちゃけ", category: "話題開始", position: "initial", coOccurrences: ["topic-shoujiki"], registerLevel: "casual", pragmaticFunction: "initiate", description: "Frankly / to be blunt (very casual)" },
    { id: "topic-jitsuwa", pattern: "実は", category: "話題開始", position: "initial", coOccurrences: ["topic-jissai", "topic-maa"], registerLevel: "neutral", pragmaticFunction: "initiate", description: "Actually / the truth is" },
    { id: "topic-jissai", pattern: "実際", category: "話題開始", position: "initial", coOccurrences: ["topic-jitsuwa", "topic-kihonteki"], registerLevel: "neutral", pragmaticFunction: "initiate", description: "In reality / actually" },
    { id: "topic-sate", pattern: "さて", category: "話題開始", position: "initial", coOccurrences: ["topic-tokorode", "topic-soredewa"], registerLevel: "neutral", pragmaticFunction: "initiate", description: "Well then / now then (topic shift)" },
    { id: "topic-tokorode", pattern: "ところで", category: "話題開始", position: "initial", coOccurrences: ["topic-sate", "connect-tokoro"], registerLevel: "neutral", pragmaticFunction: "initiate", description: "By the way (topic change)" },
    { id: "topic-chinami", pattern: "ちなみに", category: "話題開始", position: "initial", coOccurrences: ["topic-jitsuwa"], registerLevel: "neutral", pragmaticFunction: "initiate", description: "Incidentally / by the way (add info)" },
    { id: "topic-sorede", pattern: "それで", category: "話題開始", position: "initial", coOccurrences: ["connect-sorede", "reason-sorede"], registerLevel: "casual", pragmaticFunction: "initiate", description: "So / and then (narrative continuer)" },
    { id: "topic-toiukotode", pattern: "ということで", category: "話題開始", position: "initial", coOccurrences: ["reason-toiuwa", "topic-sate"], registerLevel: "neutral", pragmaticFunction: "initiate", description: "So / with that in mind" },
    { id: "topic-ippou", pattern: "一方", category: "話題開始", position: "initial", coOccurrences: ["connect-ippouwa", "connect-shikamo"], registerLevel: "formal", pragmaticFunction: "initiate", description: "On the other hand / meanwhile" },
    { id: "topic-ippouwa", pattern: "一方で", category: "話題開始", position: "initial", coOccurrences: ["topic-ippou"], registerLevel: "formal", pragmaticFunction: "initiate", description: "On the other hand" },
    { id: "topic-aratamete", pattern: "改めて", category: "話題開始", position: "initial", coOccurrences: ["topic-sate"], registerLevel: "formal", pragmaticFunction: "initiate", description: "Once more / to revisit" },
    { id: "topic-soredewa", pattern: "それでは", category: "話題開始", position: "initial", coOccurrences: ["topic-sate"], registerLevel: "neutral", pragmaticFunction: "initiate", description: "Well then / in that case" },

    // ─── 理由・説明 ──────────────────────────────────────────────────────────
    { id: "reason-wakedakara", pattern: "わけだから", category: "理由・説明", position: "medial", coOccurrences: ["reason-wakede", "reason-toiuwa"], registerLevel: "casual", pragmaticFunction: "explain", description: "That is why / because of that reason" },
    { id: "reason-wakede", pattern: "わけで", category: "理由・説明", position: "medial", coOccurrences: ["reason-wakedakara"], registerLevel: "casual", pragmaticFunction: "explain", description: "So / that is why" },
    { id: "reason-wakenandayo", pattern: "わけなんですよ", category: "理由・説明", position: "final", coOccurrences: ["reason-wakedakara", "modal-ndesyone"], registerLevel: "casual", pragmaticFunction: "explain", description: "That is the reason / that is what it means" },
    { id: "reason-toiuwa", pattern: "というのは", category: "理由・説明", position: "initial", coOccurrences: ["reason-nazenara", "topic-somosomo"], registerLevel: "neutral", pragmaticFunction: "explain", description: "The reason being / that is because" },
    { id: "reason-nazekatoiuto", pattern: "なぜかというと", category: "理由・説明", position: "initial", coOccurrences: ["reason-nazenara", "reason-datte"], registerLevel: "neutral", pragmaticFunction: "explain", description: "The reason why is / because" },
    { id: "reason-datte", pattern: "だって", category: "理由・説明", position: "initial", coOccurrences: ["reason-sorya", "filler-maa"], registerLevel: "casual", pragmaticFunction: "explain", description: "Because / well (casual explanation)" },
    { id: "reason-sorya", pattern: "そりゃ", category: "理由・説明", position: "initial", coOccurrences: ["reason-datte"], registerLevel: "casual", pragmaticFunction: "explain", description: "Of course / well naturally" },
    { id: "reason-toiukotowa", pattern: "ということは", category: "理由・説明", position: "initial", coOccurrences: ["topic-tsumari", "reason-toiuwa"], registerLevel: "neutral", pragmaticFunction: "explain", description: "That means / which means" },
    { id: "reason-nande", pattern: "なんで", category: "理由・説明", position: "initial", coOccurrences: ["reason-nazenara"], registerLevel: "casual", pragmaticFunction: "explain", description: "Why / the reason is (casual)" },
    { id: "reason-nazenara", pattern: "なぜなら", category: "理由・説明", position: "initial", coOccurrences: ["reason-toiuwa", "topic-somosomo"], registerLevel: "formal", pragmaticFunction: "explain", description: "Because / the reason is (formal)" },
    { id: "reason-toiuwakede", pattern: "というわけで", category: "理由・説明", position: "initial", coOccurrences: ["reason-soiuwakenandaga", "reason-toiuwa"], registerLevel: "neutral", pragmaticFunction: "explain", description: "So / for that reason" },
    { id: "reason-soiuwakenandaga", pattern: "というわけなんですが", category: "理由・説明", position: "medial", coOccurrences: ["reason-toiuwakede"], registerLevel: "neutral", pragmaticFunction: "explain", description: "That is the reason / that being the case" },
    { id: "reason-soiuwakede", pattern: "そういうわけで", category: "理由・説明", position: "initial", coOccurrences: ["reason-toiuwakede"], registerLevel: "neutral", pragmaticFunction: "explain", description: "For that reason / so" },
    { id: "reason-sorede", pattern: "それで", category: "理由・説明", position: "initial", coOccurrences: ["connect-sorede"], registerLevel: "casual", pragmaticFunction: "explain", description: "So / therefore (causal)" },
    { id: "reason-katoiuto", pattern: "かというと", category: "理由・説明", position: "medial", coOccurrences: ["reason-nazekatoiuto"], registerLevel: "neutral", pragmaticFunction: "explain", description: "If I were to say why" },

    // ─── 文末モダリティ ──────────────────────────────────────────────────────
    { id: "modal-hazunandesyone", pattern: "はずなんですよね", category: "文末モダリティ", position: "final", coOccurrences: ["modal-ndesyone", "confirm-desyone"], registerLevel: "casual", pragmaticFunction: "assert", description: "It should be (seeking confirmation)" },
    { id: "modal-njanaideska", pattern: "んじゃないですか", category: "文末モダリティ", position: "final", coOccurrences: ["confirm-janaidesuka", "modal-ndesyone"], registerLevel: "casual", pragmaticFunction: "assert", description: "Is it not? / don't you think?" },
    { id: "modal-toomoundesukedo", pattern: "と思うんですけど", category: "文末モダリティ", position: "final", coOccurrences: ["modal-toomounkesukedo", "filler-maa"], registerLevel: "casual", pragmaticFunction: "hedge", description: "I think / I believe (hedged)" },
    { id: "modal-kamoshirenaikedo", pattern: "かもしれないけど", category: "文末モダリティ", position: "final", coOccurrences: ["modal-toomoundesukedo", "filler-tabun"], registerLevel: "casual", pragmaticFunction: "hedge", description: "It might be / maybe (hedged)" },
    { id: "modal-ndesyone", pattern: "んですよね", category: "文末モダリティ", position: "final", coOccurrences: ["confirm-desyone", "modal-hazunandesyone"], registerLevel: "casual", pragmaticFunction: "seek-agreement", description: "You know / right? (explanation + agreement)" },
    { id: "modal-wakesuyо", pattern: "わけですよ", category: "文末モダリティ", position: "final", coOccurrences: ["reason-wakedakara"], registerLevel: "casual", pragmaticFunction: "assert", description: "That is why / that is how it is" },
    { id: "modal-mitayna", pattern: "みたいな", category: "文末モダリティ", position: "final", coOccurrences: ["filler-nanka", "quote-mitai"], registerLevel: "casual", pragmaticFunction: "hedge", description: "Like / sort of (casual vague marker)" },
    { id: "modal-tteyuka", pattern: "っていうか", category: "文末モダリティ", position: "any", coOccurrences: ["rephrase-toiuka", "rephrase-iyaa"], registerLevel: "casual", pragmaticFunction: "rephrase", description: "Or rather / I mean" },
    { id: "modal-ndesukedo", pattern: "んですけど", category: "文末モダリティ", position: "final", coOccurrences: ["modal-ndesuga", "modal-toomoundesukedo"], registerLevel: "casual", pragmaticFunction: "hedge", description: "Though / but (soft sentence ender)" },
    { id: "modal-ndesuga", pattern: "んですが", category: "文末モダリティ", position: "final", coOccurrences: ["modal-ndesukedo"], registerLevel: "neutral", pragmaticFunction: "hedge", description: "Though / but (polite hedged ending)" },
    { id: "modal-wakejanaidesuka", pattern: "わけじゃないですか", category: "文末モダリティ", position: "final", coOccurrences: ["modal-njanaideska", "confirm-janaidesuka"], registerLevel: "casual", pragmaticFunction: "seek-agreement", description: "Is it not the case that / right?" },
    { id: "modal-datoomoundesayo", pattern: "だと思うんですよ", category: "文末モダリティ", position: "final", coOccurrences: ["modal-toomoundesukedo"], registerLevel: "casual", pragmaticFunction: "assert", description: "I think it is / I believe" },
    { id: "modal-janaikanatoomou", pattern: "じゃないかなと思う", category: "文末モダリティ", position: "final", coOccurrences: ["modal-datoomoundesayo", "filler-tabun"], registerLevel: "casual", pragmaticFunction: "hedge", description: "I wonder if it is / I kind of think" },
    { id: "modal-toomoimasu", pattern: "と思います", category: "文末モダリティ", position: "final", coOccurrences: ["modal-deshoune"], registerLevel: "formal", pragmaticFunction: "assert", description: "I think / I believe (polite)" },
    { id: "modal-masyone", pattern: "ますよね", category: "文末モダリティ", position: "final", coOccurrences: ["confirm-desyone", "modal-deshoune"], registerLevel: "neutral", pragmaticFunction: "seek-agreement", description: "Right? / do you not agree? (polite)" },
    { id: "modal-deshoune", pattern: "でしょうね", category: "文末モダリティ", position: "final", coOccurrences: ["modal-toomoimasu", "confirm-desyone"], registerLevel: "neutral", pragmaticFunction: "hedge", description: "I suppose / probably (softened assertion)" },
    { id: "modal-kanatoomou", pattern: "かなと思う", category: "文末モダリティ", position: "final", coOccurrences: ["modal-janaikanatoomou", "filler-tabun"], registerLevel: "casual", pragmaticFunction: "hedge", description: "I kind of think / I wonder" },

    // ─── 接続・展開 ──────────────────────────────────────────────────────────
    { id: "connect-sorede", pattern: "それで", category: "接続・展開", position: "initial", coOccurrences: ["connect-soshitara", "connect-dakara"], registerLevel: "casual", pragmaticFunction: "connect", description: "And so / and then (narrative)" },
    { id: "connect-soshitara", pattern: "そしたら", category: "接続・展開", position: "initial", coOccurrences: ["connect-sorede", "connect-dakara"], registerLevel: "casual", pragmaticFunction: "connect", description: "And then / if that happens" },
    { id: "connect-dakara", pattern: "だから", category: "接続・展開", position: "initial", coOccurrences: ["connect-sorede", "reason-toiuwakede"], registerLevel: "casual", pragmaticFunction: "connect", description: "So / therefore" },
    { id: "connect-demo", pattern: "でも", category: "接続・展開", position: "initial", coOccurrences: ["connect-tada", "connect-tokoroga"], registerLevel: "casual", pragmaticFunction: "connect", description: "But / however" },
    { id: "connect-tada", pattern: "ただ", category: "接続・展開", position: "initial", coOccurrences: ["connect-demo", "connect-tokoroga"], registerLevel: "neutral", pragmaticFunction: "connect", description: "However / only (restrictive)" },
    { id: "connect-tokoroga", pattern: "ところが", category: "接続・展開", position: "initial", coOccurrences: ["connect-demo", "connect-tada"], registerLevel: "neutral", pragmaticFunction: "connect", description: "However / but (contrastive surprise)" },
    { id: "connect-shikamo", pattern: "しかも", category: "接続・展開", position: "initial", coOccurrences: ["connect-sonoue", "connect-soreni"], registerLevel: "neutral", pragmaticFunction: "connect", description: "Moreover / on top of that" },
    { id: "connect-sonoue", pattern: "その上", category: "接続・展開", position: "initial", coOccurrences: ["connect-shikamo", "connect-sarani"], registerLevel: "neutral", pragmaticFunction: "connect", description: "Furthermore / in addition" },
    { id: "connect-ippouwa", pattern: "一方で", category: "接続・展開", position: "initial", coOccurrences: ["topic-ippou", "connect-mushiro"], registerLevel: "formal", pragmaticFunction: "connect", description: "On the other hand" },
    { id: "connect-mushiro", pattern: "むしろ", category: "接続・展開", position: "initial", coOccurrences: ["connect-ippouwa", "rephrase-toiuka"], registerLevel: "neutral", pragmaticFunction: "connect", description: "Rather / on the contrary" },
    { id: "connect-soreni", pattern: "それに", category: "接続・展開", position: "initial", coOccurrences: ["connect-shikamo", "connect-sonoue"], registerLevel: "casual", pragmaticFunction: "connect", description: "Besides / furthermore" },
    { id: "connect-sonotame", pattern: "そのため", category: "接続・展開", position: "initial", coOccurrences: ["connect-shitagatte"], registerLevel: "formal", pragmaticFunction: "connect", description: "For that reason / therefore" },
    { id: "connect-shitagatte", pattern: "したがって", category: "接続・展開", position: "initial", coOccurrences: ["connect-sonotame"], registerLevel: "formal", pragmaticFunction: "connect", description: "Therefore / consequently (formal)" },
    { id: "connect-nimokakawarazu", pattern: "にもかかわらず", category: "接続・展開", position: "medial", coOccurrences: ["connect-tokoroga"], registerLevel: "formal", pragmaticFunction: "connect", description: "Despite / in spite of" },
    { id: "connect-sokode", pattern: "そこで", category: "接続・展開", position: "initial", coOccurrences: ["connect-sorede", "connect-dakara"], registerLevel: "neutral", pragmaticFunction: "connect", description: "So / thereupon" },
    { id: "connect-tokoro", pattern: "ところで", category: "接続・展開", position: "initial", coOccurrences: ["topic-tokorode"], registerLevel: "neutral", pragmaticFunction: "connect", description: "By the way (digression)" },
    { id: "connect-ato", pattern: "あと", category: "接続・展開", position: "initial", coOccurrences: ["connect-soreni", "connect-sarani"], registerLevel: "casual", pragmaticFunction: "connect", description: "Also / additionally (casual)" },
    { id: "connect-sarani", pattern: "さらに", category: "接続・展開", position: "initial", coOccurrences: ["connect-sonoue", "connect-shikamo"], registerLevel: "neutral", pragmaticFunction: "connect", description: "Furthermore / even more" },
    { id: "connect-mata", pattern: "また", category: "接続・展開", position: "initial", coOccurrences: ["connect-sarani", "connect-soreni"], registerLevel: "neutral", pragmaticFunction: "connect", description: "Also / again / furthermore" },
    { id: "connect-soshite", pattern: "そして", category: "接続・展開", position: "initial", coOccurrences: ["connect-mata", "connect-sorede"], registerLevel: "neutral", pragmaticFunction: "connect", description: "And / then (sequential)" },

    // ─── 確認・同意要求 ──────────────────────────────────────────────────────
    { id: "confirm-deshou", pattern: "でしょう", category: "確認・同意要求", position: "final", coOccurrences: ["confirm-desyone", "confirm-youna"], registerLevel: "neutral", pragmaticFunction: "seek-agreement", description: "Right? / is it not? (confirmation)" },
    { id: "confirm-yone", pattern: "よね", category: "確認・同意要求", position: "final", coOccurrences: ["confirm-desyone", "confirm-ne"], registerLevel: "casual", pragmaticFunction: "seek-agreement", description: "Right? / you agree, right?" },
    { id: "confirm-janaidesuka", pattern: "じゃないですか", category: "確認・同意要求", position: "final", coOccurrences: ["confirm-jankai", "modal-njanaideska"], registerLevel: "casual", pragmaticFunction: "seek-agreement", description: "Is it not? / don't you think?" },
    { id: "confirm-jankai", pattern: "じゃん", category: "確認・同意要求", position: "final", coOccurrences: ["confirm-janaidesuka"], registerLevel: "casual", pragmaticFunction: "seek-agreement", description: "Right? / is it not? (very casual)" },
    { id: "confirm-darou", pattern: "だろう", category: "確認・同意要求", position: "final", coOccurrences: ["confirm-deshou", "confirm-youna"], registerLevel: "casual", pragmaticFunction: "seek-agreement", description: "Probably / right? (masculine)" },
    { id: "confirm-desyone", pattern: "ですよね", category: "確認・同意要求", position: "final", coOccurrences: ["confirm-yone", "modal-ndesyone"], registerLevel: "neutral", pragmaticFunction: "seek-agreement", description: "Right? / is that not so? (polite)" },
    { id: "confirm-youna", pattern: "よな", category: "確認・同意要求", position: "final", coOccurrences: ["confirm-yone", "confirm-darou"], registerLevel: "casual", pragmaticFunction: "seek-agreement", description: "Right? (masculine casual)" },
    { id: "confirm-wakarimasu", pattern: "わかります", category: "確認・同意要求", position: "final", coOccurrences: ["confirm-desyone"], registerLevel: "neutral", pragmaticFunction: "seek-agreement", description: "Do you understand? / you know what I mean" },
    { id: "confirm-ne", pattern: "ね", category: "確認・同意要求", position: "final", coOccurrences: ["confirm-yone", "confirm-desyone"], registerLevel: "casual", pragmaticFunction: "seek-agreement", description: "Right? / is it not? (particle)" },
    { id: "confirm-desyo", pattern: "でしょ", category: "確認・同意要求", position: "final", coOccurrences: ["confirm-deshou", "confirm-janaidesuka"], registerLevel: "casual", pragmaticFunction: "seek-agreement", description: "Right? / see? (casual confirmation)" },
    { id: "confirm-desuyо", pattern: "ですよ", category: "確認・同意要求", position: "final", coOccurrences: ["confirm-desyone"], registerLevel: "neutral", pragmaticFunction: "assert", description: "It is! / you know (assertive)" },

    // ─── 言い換え・修正 ──────────────────────────────────────────────────────
    { id: "rephrase-toiuka", pattern: "というか", category: "言い換え・修正", position: "any", coOccurrences: ["rephrase-tteyuka", "rephrase-toiuyoriiwa"], registerLevel: "casual", pragmaticFunction: "rephrase", description: "Or rather / well actually" },
    { id: "rephrase-tteyuka", pattern: "っていうか", category: "言い換え・修正", position: "any", coOccurrences: ["rephrase-toiuka", "rephrase-iyaa"], registerLevel: "casual", pragmaticFunction: "rephrase", description: "Or rather / I mean (very casual)" },
    { id: "rephrase-toiuyoriiwa", pattern: "というよりは", category: "言い換え・修正", position: "medial", coOccurrences: ["rephrase-toiuka", "connect-mushiro"], registerLevel: "neutral", pragmaticFunction: "rephrase", description: "Rather than saying / more like" },
    { id: "rephrase-mushiro", pattern: "むしろ", category: "言い換え・修正", position: "initial", coOccurrences: ["rephrase-toiuyoriiwa", "connect-mushiro"], registerLevel: "neutral", pragmaticFunction: "rephrase", description: "Rather / more accurately" },
    { id: "rephrase-iyaa", pattern: "いや", category: "言い換え・修正", position: "initial", coOccurrences: ["rephrase-tteyuka", "rephrase-janakute"], registerLevel: "casual", pragmaticFunction: "rephrase", description: "No / actually (self-correction)" },
    { id: "rephrase-teyuka", pattern: "ていうか", category: "言い換え・修正", position: "any", coOccurrences: ["rephrase-toiuka", "rephrase-tteyuka"], registerLevel: "casual", pragmaticFunction: "rephrase", description: "Or rather / well (casual)" },
    { id: "rephrase-toiuyori", pattern: "というより", category: "言い換え・修正", position: "medial", coOccurrences: ["rephrase-toiuyoriiwa", "rephrase-mushiro"], registerLevel: "neutral", pragmaticFunction: "rephrase", description: "Rather than / more than saying" },
    { id: "rephrase-janakute", pattern: "じゃなくて", category: "言い換え・修正", position: "medial", coOccurrences: ["rephrase-iyaa", "rephrase-toiuka"], registerLevel: "casual", pragmaticFunction: "rephrase", description: "Not X but / correction marker" },
    { id: "rephrase-tsumari", pattern: "つまり", category: "言い換え・修正", position: "initial", coOccurrences: ["topic-tsumari", "rephrase-yosuruniwa"], registerLevel: "neutral", pragmaticFunction: "rephrase", description: "That is to say / in other words" },
    { id: "rephrase-yosuruniwa", pattern: "要は", category: "言い換え・修正", position: "initial", coOccurrences: ["rephrase-tsumari", "topic-yousuruni"], registerLevel: "casual", pragmaticFunction: "rephrase", description: "Basically / the point is" },
    { id: "rephrase-yousuruni", pattern: "要するに", category: "言い換え・修正", position: "initial", coOccurrences: ["rephrase-yosuruniwa", "topic-yousuruni"], registerLevel: "neutral", pragmaticFunction: "rephrase", description: "In short / to sum up (rephrase)" },
    { id: "rephrase-iikaereba", pattern: "言い換えれば", category: "言い換え・修正", position: "initial", coOccurrences: ["rephrase-tsumari", "rephrase-yousuruni"], registerLevel: "formal", pragmaticFunction: "rephrase", description: "In other words / rephrasing" },

    // ─── フィラー・ヘッジ ────────────────────────────────────────────────────
    { id: "filler-maa", pattern: "まあ", category: "フィラー・ヘッジ", position: "any", coOccurrences: ["filler-nanka", "filler-chotto"], registerLevel: "casual", pragmaticFunction: "fill", description: "Well / I mean (filler / hedger)" },
    { id: "filler-nanka", pattern: "なんか", category: "フィラー・ヘッジ", position: "any", coOccurrences: ["filler-maa", "filler-chotto"], registerLevel: "casual", pragmaticFunction: "fill", description: "Like / sort of (filler)" },
    { id: "filler-chotto", pattern: "ちょっと", category: "フィラー・ヘッジ", position: "any", coOccurrences: ["filler-maa", "filler-ichiou"], registerLevel: "casual", pragmaticFunction: "hedge", description: "A little / kind of (hedger)" },
    { id: "filler-ichiou", pattern: "一応", category: "フィラー・ヘッジ", position: "any", coOccurrences: ["filler-chotto", "filler-tabun"], registerLevel: "casual", pragmaticFunction: "hedge", description: "Just in case / more or less" },
    { id: "filler-tabun", pattern: "多分", category: "フィラー・ヘッジ", position: "initial", coOccurrences: ["filler-tabun2", "modal-kamoshirenaikedo"], registerLevel: "casual", pragmaticFunction: "hedge", description: "Probably / maybe" },
    { id: "filler-tabun2", pattern: "たぶん", category: "フィラー・ヘッジ", position: "initial", coOccurrences: ["filler-tabun", "modal-kamoshirenaikedo"], registerLevel: "casual", pragmaticFunction: "hedge", description: "Probably / maybe (hiragana)" },
    { id: "filler-nanteiyuka", pattern: "何て言うか", category: "フィラー・ヘッジ", position: "initial", coOccurrences: ["filler-douebaika", "filler-nanteyuuka"], registerLevel: "casual", pragmaticFunction: "fill", description: "How should I say / what do you call it" },
    { id: "filler-douebaika", pattern: "どう言えばいいか", category: "フィラー・ヘッジ", position: "initial", coOccurrences: ["filler-nanteiyuka"], registerLevel: "casual", pragmaticFunction: "fill", description: "How should I put it" },
    { id: "filler-ano", pattern: "あの", category: "フィラー・ヘッジ", position: "initial", coOccurrences: ["filler-etto", "filler-ee"], registerLevel: "casual", pragmaticFunction: "fill", description: "Um / uh (filler)" },
    { id: "filler-etto", pattern: "えっと", category: "フィラー・ヘッジ", position: "initial", coOccurrences: ["filler-ano", "filler-ee"], registerLevel: "casual", pragmaticFunction: "fill", description: "Uh / um (hesitation filler)" },
    { id: "filler-ee", pattern: "えー", category: "フィラー・ヘッジ", position: "initial", coOccurrences: ["filler-etto", "filler-uun"], registerLevel: "casual", pragmaticFunction: "fill", description: "Uh / er (filler)" },
    { id: "filler-uun", pattern: "うーん", category: "フィラー・ヘッジ", position: "initial", coOccurrences: ["filler-ee", "filler-etto"], registerLevel: "casual", pragmaticFunction: "fill", description: "Hmm (thinking filler)" },
    { id: "filler-nanteyuuka", pattern: "なんていうか", category: "フィラー・ヘッジ", position: "initial", coOccurrences: ["filler-nanteiyuka", "filler-nanka"], registerLevel: "casual", pragmaticFunction: "fill", description: "I mean / how to say it" },
    { id: "filler-mitainakanjide", pattern: "みたいな感じ", category: "フィラー・ヘッジ", position: "final", coOccurrences: ["modal-mitayna", "filler-nanka"], registerLevel: "casual", pragmaticFunction: "hedge", description: "Like / sort of feeling" },
    { id: "filler-nantonaku", pattern: "なんとなく", category: "フィラー・ヘッジ", position: "any", coOccurrences: ["filler-tabun", "filler-ichiou"], registerLevel: "casual", pragmaticFunction: "hedge", description: "Somehow / vaguely / for some reason" },
    { id: "filler-doumo", pattern: "どうも", category: "フィラー・ヘッジ", position: "initial", coOccurrences: ["filler-maa", "filler-nantonaku"], registerLevel: "casual", pragmaticFunction: "fill", description: "Somehow / for some reason (vague)" },

    // ─── 引用・伝聞 ──────────────────────────────────────────────────────────
    { id: "quote-tte", pattern: "って", category: "引用・伝聞", position: "medial", coOccurrences: ["quote-tteyuu", "quote-rashii"], registerLevel: "casual", pragmaticFunction: "quote", description: "Quotative particle (casual)" },
    { id: "quote-tteyuu", pattern: "っていう", category: "引用・伝聞", position: "medial", coOccurrences: ["quote-tte", "quote-toiwareteiru"], registerLevel: "casual", pragmaticFunction: "quote", description: "Called / said to be" },
    { id: "quote-toiwareteiru", pattern: "と言われている", category: "引用・伝聞", position: "final", coOccurrences: ["quote-rashii", "quote-souddesu"], registerLevel: "neutral", pragmaticFunction: "quote", description: "It is said that / reportedly" },
    { id: "quote-rashii", pattern: "らしい", category: "引用・伝聞", position: "final", coOccurrences: ["quote-mitai", "quote-souddesu"], registerLevel: "casual", pragmaticFunction: "quote", description: "Apparently / it seems (hearsay)" },
    { id: "quote-mitai", pattern: "みたい", category: "引用・伝聞", position: "final", coOccurrences: ["quote-rashii", "quote-souddesu"], registerLevel: "casual", pragmaticFunction: "quote", description: "It seems / apparently (resemblance / hearsay)" },
    { id: "quote-souddesu", pattern: "そうです", category: "引用・伝聞", position: "final", coOccurrences: ["quote-dasouddesu", "quote-rashii"], registerLevel: "neutral", pragmaticFunction: "quote", description: "I hear / it seems (hearsay polite)" },
    { id: "quote-dasouddesu", pattern: "だそうです", category: "引用・伝聞", position: "final", coOccurrences: ["quote-souddesu", "quote-tonokoto"], registerLevel: "neutral", pragmaticFunction: "quote", description: "Apparently / I heard that" },
    { id: "quote-tonokoto", pattern: "とのこと", category: "引用・伝聞", position: "final", coOccurrences: ["quote-dasouddesu", "quote-toiwareteiru"], registerLevel: "neutral", pragmaticFunction: "quote", description: "Reportedly / according to them" },
    { id: "quote-toiukotorashii", pattern: "ということらしい", category: "引用・伝聞", position: "final", coOccurrences: ["quote-rashii", "quote-tonokoto"], registerLevel: "casual", pragmaticFunction: "quote", description: "Apparently it seems that" },
    { id: "quote-ttekiita", pattern: "って聞いた", category: "引用・伝聞", position: "final", coOccurrences: ["quote-tte", "quote-rashii"], registerLevel: "casual", pragmaticFunction: "quote", description: "I heard that / they said" },
    { id: "quote-niyoruto", pattern: "によると", category: "引用・伝聞", position: "initial", coOccurrences: ["quote-nohanasiwa", "quote-toiwareteiru"], registerLevel: "neutral", pragmaticFunction: "quote", description: "According to" },
    { id: "quote-nohanasiwa", pattern: "の話では", category: "引用・伝聞", position: "initial", coOccurrences: ["quote-niyoruto"], registerLevel: "neutral", pragmaticFunction: "quote", description: "According to / the story goes" },
];

/**
 * Detect all discourse markers in the given text.
 * Returns matches sorted by startIndex.
 */
export function detectDiscourseMarkers(text: string): DetectedMarker[] {
    const results: DetectedMarker[] = [];

    for (const dp of DISCOURSE_PATTERNS) {
        if (dp.pattern instanceof RegExp) {
            const flags = dp.pattern.flags.includes('g') ? dp.pattern.flags : dp.pattern.flags + 'g';
            const re = new RegExp(dp.pattern.source, flags);
            let m: RegExpExecArray | null;
            while ((m = re.exec(text)) !== null) {
                const start = m.index;
                const end = start + m[0].length;
                results.push({
                    patternId: dp.id,
                    pattern: dp,
                    matchedText: m[0],
                    startIndex: start,
                    endIndex: end,
                    position: resolvePosition(start, text.length),
                });
            }
        } else {
            const needle = dp.pattern;
            let idx = 0;
            while (true) {
                const pos = text.indexOf(needle, idx);
                if (pos === -1) break;
                results.push({
                    patternId: dp.id,
                    pattern: dp,
                    matchedText: needle,
                    startIndex: pos,
                    endIndex: pos + needle.length,
                    position: resolvePosition(pos, text.length),
                });
                idx = pos + 1;
            }
        }
    }

    results.sort((a, b) => a.startIndex - b.startIndex);
    return results;
}

function resolvePosition(matchStart: number, textLength: number): MarkerPosition {
    if (textLength === 0) return 'any';
    if (matchStart < textLength * 0.25) return 'initial';
    if (matchStart > textLength * 0.75) return 'final';
    return 'medial';
}
