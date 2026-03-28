/**
 * discourse-patterns.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Research-grade comprehensive pattern data for 談話文法 (Discourse Grammar)
 * detection in spoken Japanese (YTranscript / conversational).
 *
 * ALL detection is performed against TinySegmenter morpheme token sequences,
 * NOT raw string matching.  Each entry is stored as an array of morpheme
 * tokens so the engine can match them in sequence.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Split a Japanese surface string into likely morpheme tokens using simple rules.
 *  Full splitting is done at runtime by TinySegmenter; this list is used as
 *  pre-tokenised reference strings for matching. */
function t(s: string): string[] { return [s]; }
function tt(...tokens: string[]): string[] { return tokens; }

// ─── Category 1: 発話冒頭表現 (Utterance-Opening Markers) ────────────────────

/** 1a. Topic Management / Discourse Organization (話題管理) */
export const OPENING_TOPIC_MANAGEMENT: string[][] = [
    t('結局'), t('要するに'), t('つまり'), t('まあ'), t('ていうか'), t('っていうか'),
    t('なんか'), t('やっぱり'), t('やっぱ'), t('ほら'), t('あのね'), t('でね'),
    t('それで'), t('そしたら'), t('じゃあ'), t('ところが'), t('だから'), t('というのは'),
    t('実は'), t('正直'), t('逆に'), t('むしろ'), t('ちなみに'), t('そもそも'),
    t('基本的に'), t('要は'), t('というか'), t('ていうかさ'), t('まず'), t('それに'),
    t('しかも'), t('おまけに'), t('その上'), t('それどころか'), t('一方で'), t('他方'),
    t('反対に'), t('対して'), t('それにしても'), t('いずれにしても'), t('いずれにせよ'),
    t('とにかく'), t('ともかく'), t('どっちにしろ'), t('どっちにしても'),
    t('何にしても'), t('何にせよ'), t('いわば'), t('いわゆる'), t('言ってみれば'),
    t('ぶっちゃけ'), t('端的に言うと'), t('率直に言うと'), t('はっきり言って'),
    t('正直に言うと'), t('強いて言えば'), t('あえて言えば'), t('言い換えれば'),
    t('別の言い方をすれば'), t('もっと言うと'), t('さっき言った'),
    t('前に言った'), t('最初に言った'),
];

/** 1b. Sequence / Narrative Progression (展開標識) */
export const OPENING_SEQUENCE: string[][] = [
    t('それで'), t('それから'), t('そして'), t('その後'), t('そしたら'),
    t('そしたらさ'), t('で'), t('でね'), t('でさ'), t('じゃあ'), t('じゃ'),
    t('んで'), t('んでね'), t('したら'), t('そうしたら'), t('その結果'),
    t('結果的に'), t('最終的に'), t('最初は'), t('初めは'), t('始めは'),
    t('まず'), t('次に'), t('その次に'), t('さらに'), t('加えて'), t('続いて'),
    t('引き続き'), t('同時に'), t('その間'), t('そのうちに'), t('やがて'),
    t('ついに'), t('とうとう'), t('いよいよ'), t('結局のところ'),
];

/** 1c. Hedges / Fillers / Hesitation (フィラー・言い淀み) */
export const OPENING_FILLERS: string[][] = [
    t('えーと'), t('えっと'), t('あのー'), t('あの'), t('うーん'), t('うん'),
    t('まあ'), t('なんか'), t('なんだろう'), t('なんていうか'), t('なんていうかな'),
    t('なんていうんだろう'), t('何て言うのかな'), t('ちょっと'), t('一応'),
    t('多分'), t('恐らく'), t('たぶん'), t('おそらく'), t('もしかしたら'),
    t('もしかして'), t('ひょっとしたら'), t('ひょっとして'), t('どうだろう'),
    t('どうかな'), t('何だっけ'), t('あれ'), t('あれだ'), t('あれなんだけど'),
    t('そのー'), t('こうー'), t('えーっと'), t('あーね'), t('うーんと'),
    t('ほら'), t('ほらほら'), t('あのさ'), t('ねえ'), t('ねえねえ'),
    t('あのですね'), t('えーとですね'), t('まあね'), t('まあさ'),
];

/** 1d. Attention-Getting / Turn-Taking Devices (注意喚起・ターン取り) */
export const OPENING_ATTENTION: string[][] = [
    t('ねえ'), t('ねえねえ'), t('あのさ'), t('あのね'), t('ほら'), t('ほらほら'),
    t('ちょっと'), t('ちょっとちょっと'), t('聞いて'), t('聞いてよ'), t('見て'),
    t('見てみて'), t('知ってる'), t('知ってた'), t('考えてみて'), t('想像してみて'),
    t('これ見て'), t('すみません'), t('ごめん'), t('ごめんね'), t('あ'), t('あっ'),
    t('おっ'), t('うわ'), t('うわー'), t('え'), t('ええ'), t('へえ'), t('ほんと'),
    t('マジで'), t('マジ'), t('本当に'), t('嘘でしょ'),
];

/** 1e. Concession / Contrast Starters (譲歩・対比の導入) */
export const OPENING_CONCESSION: string[][] = [
    t('確かに'), t('もちろん'), t('たしかに'), t('なるほど'),
    t('それはそうだけど'), t('それはそうなんだけど'), t('そうは言っても'),
    t('そうかもしれないけど'), t('一見'), t('一見すると'), t('表面的には'),
    t('まあそうなんだけど'), t('わかるんだけど'), t('言いたいことはわかるけど'),
    t('認めるけど'), t('否定はしないけど'), t('そこは認めるけど'),
];

// ─── Category 2: 発話末表現 (Utterance-Closing Markers) ─────────────────────

/** 2a. のだ/んだ System (Explanatory Modality) */
export const CLOSING_NODA: string[][] = [
    tt('ん', 'です'), tt('の', 'です'), tt('ん', 'だ'), tt('の', 'だ'),
    tt('ん', 'です', 'よ'), tt('の', 'です', 'よ'), tt('ん', 'だ', 'よ'),
    tt('ん', 'です', 'ね'), tt('の', 'です', 'ね'), tt('ん', 'だ', 'ね'),
    tt('ん', 'です', 'けど'), tt('の', 'です', 'けど'), tt('ん', 'だ', 'けど'),
    tt('ん', 'です', 'が'), tt('の', 'です', 'が'), tt('ん', 'だ', 'が'),
    tt('ん', 'です', 'よ', 'ね'), tt('の', 'です', 'よ', 'ね'), tt('ん', 'だ', 'よ', 'ね'),
    tt('ん', 'です', 'けど', 'ね'), tt('ん', 'だ', 'けど', 'ね'),
    tt('ん', 'です', 'けれども'), tt('の', 'です', 'けれども'), tt('ん', 'だ', 'けれども'),
    tt('ん', 'です', 'もの'), tt('ん', 'だ', 'もの'),
    tt('ん', 'です', 'もん'), tt('ん', 'だ', 'もん'),
    tt('ん', 'じゃ', 'ない', 'です', 'か'), tt('ん', 'じゃ', 'ない', 'か', 'な'),
    tt('ん', 'じゃ', 'ない'),
    tt('ん', 'だ', 'って'), tt('の', 'だ', 'って'), tt('ん', 'です', 'って'),
    tt('ん', 'だ', 'そう', 'です'), tt('ん', 'だ', 'と', 'か'), tt('ん', 'だ', 'と', 'さ'),
    // Surface single-token forms that appear in raw transcript
    t('んです'), t('のです'), t('んだ'), t('のだ'),
    t('んですよ'), t('のですよ'), t('んだよ'),
    t('んですね'), t('のですね'), t('んだね'),
    t('んですけど'), t('のですけど'), t('んだけど'),
    t('んですが'), t('のですが'), t('んだが'),
    t('んですよね'), t('のですよね'), t('んだよね'),
    t('んですけどね'), t('んだけどね'),
    t('んですもの'), t('んだもの'), t('んですもん'), t('んだもん'),
    t('んじゃないですか'), t('んじゃないかな'), t('んじゃない'),
    t('んだって'), t('のだって'), t('んですって'),
    t('んだそうです'), t('んだとか'), t('んだとさ'),
];

/** 2b. わけ System (Reasoning/Explanation) */
export const CLOSING_WAKE: string[][] = [
    t('わけだ'), t('わけです'), t('わけだから'), t('わけですから'),
    t('わけなんだ'), t('わけなんです'), t('わけだよ'), t('わけですよ'),
    t('わけだね'), t('わけですね'), t('わけだよね'), t('わけですよね'),
    t('わけなんだよ'), t('わけなんですよ'), t('わけなんだよね'), t('わけなんですよね'),
    t('わけで'), t('わけでして'), t('わけだけど'), t('わけですけど'),
    t('わけなんだけど'), t('わけなんですけど'), t('わけじゃない'),
    t('わけではない'), t('わけじゃないんだけど'), t('わけじゃないんですけど'),
    t('わけがない'), t('わけないでしょ'), t('というわけで'),
    t('というわけだから'), t('そういうわけで'), t('そういうわけだから'),
    t('ってわけ'), t('ってわけじゃない'), t('ってわけでもない'),
    // Multi-token forms
    tt('わけ', 'だ'), tt('わけ', 'です'), tt('わけ', 'だ', 'から'),
    tt('わけ', 'です', 'から'), tt('わけ', 'なん', 'だ'), tt('わけ', 'なん', 'です'),
    tt('わけ', 'だ', 'よ'), tt('わけ', 'です', 'よ'), tt('わけ', 'だ', 'ね'),
    tt('わけ', 'です', 'ね'), tt('わけ', 'だ', 'よ', 'ね'), tt('わけ', 'です', 'よ', 'ね'),
    tt('わけ', 'なん', 'だ', 'よ'), tt('わけ', 'なん', 'です', 'よ'),
    tt('わけ', 'なん', 'だ', 'よ', 'ね'), tt('わけ', 'なん', 'です', 'よ', 'ね'),
    tt('わけ', 'で'), tt('わけ', 'だ', 'けど'), tt('わけ', 'です', 'けど'),
    tt('わけ', 'なん', 'だ', 'けど'), tt('わけ', 'なん', 'です', 'けど'),
    tt('わけ', 'じゃ', 'ない'), tt('わけ', 'では', 'ない'),
    tt('わけ', 'が', 'ない'), tt('と', 'いう', 'わけ', 'で'),
    tt('そう', 'いう', 'わけ', 'で'), tt('って', 'わけ'),
    tt('って', 'わけ', 'じゃ', 'ない'), tt('って', 'わけ', 'でも', 'ない'),
];

/** 2c. はず System (Expectation/Assumption) */
export const CLOSING_HAZU: string[][] = [
    t('はずだ'), t('はずです'), t('はずだった'), t('はずでした'),
    t('はずなんだ'), t('はずなんです'), t('はずだよ'), t('はずですよ'),
    t('はずだね'), t('はずですね'), t('はずだよね'), t('はずですよね'),
    t('はずなんだよ'), t('はずなんですよ'), t('はずなんだよね'), t('はずなんですよね'),
    t('はずだけど'), t('はずですけど'), t('はずなんだけど'), t('はずなんですけど'),
    t('はずだから'), t('はずですから'), t('はずなのに'), t('はずだったのに'),
    t('はずがない'), t('はずないでしょ'),
    // Multi-token
    tt('はず', 'だ'), tt('はず', 'です'), tt('はず', 'だっ', 'た'),
    tt('はず', 'でし', 'た'), tt('はず', 'なん', 'だ'), tt('はず', 'なん', 'です'),
    tt('はず', 'だ', 'よ'), tt('はず', 'です', 'よ'), tt('はず', 'だ', 'ね'),
    tt('はず', 'です', 'ね'), tt('はず', 'だ', 'よ', 'ね'), tt('はず', 'です', 'よ', 'ね'),
    tt('はず', 'なん', 'だ', 'よ'), tt('はず', 'なん', 'です', 'よ'),
    tt('はず', 'なん', 'だ', 'よ', 'ね'), tt('はず', 'なん', 'です', 'よ', 'ね'),
    tt('はず', 'だ', 'けど'), tt('はず', 'です', 'けど'),
    tt('はず', 'なん', 'だ', 'けど'), tt('はず', 'なん', 'です', 'けど'),
    tt('はず', 'だ', 'から'), tt('はず', 'です', 'から'),
    tt('はず', 'な', 'のに'), tt('はず', 'だっ', 'た', 'のに'),
    tt('はず', 'が', 'ない'),
];

/** 2d. もの/もん System (Emotional Justification) */
export const CLOSING_MONO: string[][] = [
    t('ものだ'), t('ものです'), t('もんだ'), t('もんです'),
    t('ものだから'), t('もんだから'), t('ものですから'), t('もんですから'),
    t('ものね'), t('もんね'), t('ものな'), t('もんな'),
    t('ものだね'), t('もんだね'), t('ものですよ'), t('もんですよ'),
    t('ものじゃない'), t('もんじゃない'), t('ものか'), t('もんか'),
    t('ものですか'), t('もんですか'),
    // Multi-token
    tt('もの', 'だ'), tt('もの', 'です'), tt('もん', 'だ'), tt('もん', 'です'),
    tt('もの', 'だ', 'から'), tt('もん', 'だ', 'から'), tt('もの', 'です', 'から'),
    tt('もん', 'です', 'から'), tt('もの', 'ね'), tt('もん', 'ね'),
    tt('もの', 'な'), tt('もん', 'な'), tt('もの', 'だ', 'ね'), tt('もん', 'だ', 'ね'),
    tt('もの', 'です', 'よ'), tt('もん', 'です', 'よ'),
    tt('もの', 'じゃ', 'ない'), tt('もん', 'じゃ', 'ない'),
    tt('もの', 'か'), tt('もん', 'か'),
];

/** 2e. Confirmation-Seeking / Tag Endings (確認要求) */
export const CLOSING_CONFIRMATION: string[][] = [
    t('でしょう'), t('でしょ'), t('だろう'), t('だろ'), t('よね'), t('ですよね'),
    t('だよね'), t('じゃないですか'), t('じゃないか'), t('じゃん'), t('じゃないの'),
    t('でしょうが'), t('だろうが'), t('ですよねえ'), t('だよねえ'),
    t('だと思うんですけど'), t('と思うんだけど'), t('じゃないかと思うんだけど'),
    t('んじゃないかな'), t('なんじゃないかな'), t('かなと思って'), t('かなって'),
    t('って思って'), t('と思いません'), t('と思わない'), t('違います'), t('違う'),
    t('知ってますよね'), t('わかりますよね'),
    // Multi-token
    tt('で', 'しょう'), tt('だ', 'ろう'), tt('よ', 'ね'), tt('です', 'よ', 'ね'),
    tt('だ', 'よ', 'ね'), tt('じゃ', 'ない', 'です', 'か'), tt('じゃ', 'ない', 'か'),
    tt('じゃ', 'ん'), tt('と', '思い', 'ませ', 'ん'), tt('と', '思わ', 'ない'),
    tt('か', 'な', 'と', '思っ', 'て'), tt('か', 'な', 'って'),
    tt('って', '思っ', 'て'),
];

/** 2f. Hearsay / Evidentiality (伝聞・証拠性) */
export const CLOSING_HEARSAY: string[][] = [
    t('そうだ'), t('そうです'), t('だそうだ'), t('だそうです'),
    t('とのことだ'), t('とのことです'), t('らしい'), t('らしいです'),
    t('みたいだ'), t('みたいです'), t('ようだ'), t('ようです'),
    t('って'), t('っていう'), t('っていうか'), t('って言ってた'), t('って聞いた'),
    t('って話だ'), t('ということだ'), t('ということです'), t('とか言ってた'),
    t('とか聞いた'), t('って噂だ'), t('という話だ'), t('という話です'),
    t('だったらしい'), t('だったみたい'),
    // Multi-token
    tt('そう', 'だ'), tt('そう', 'です'), tt('だ', 'そう', 'だ'), tt('だ', 'そう', 'です'),
    tt('と', 'の', 'こと', 'だ'), tt('と', 'の', 'こと', 'です'),
    tt('らし', 'い'), tt('みたい', 'だ'), tt('みたい', 'です'),
    tt('よう', 'だ'), tt('よう', 'です'),
    tt('って', '言っ', 'て', 'た'), tt('って', '聞い', 'た'),
    tt('と', 'いう', 'こと', 'だ'), tt('と', 'いう', 'こと', 'です'),
    tt('とか', '言っ', 'て', 'た'), tt('とか', '聞い', 'た'),
    tt('だっ', 'た', 'らし', 'い'), tt('だっ', 'た', 'みたい'),
];

/** 2g. Assertion / Emphasis (主張・強調) */
export const CLOSING_ASSERTION: string[][] = [
    t('よ'), t('ぞ'), t('ぜ'), t('さ'), t('わ'), t('もの'), t('もん'),
    t('って'), t('ったら'), t('ってば'), t('んだよ'), t('んですよ'),
    t('んだぞ'), t('んだから'), t('んですから'), t('のよ'), t('んだわ'),
    t('なんだって'), t('なんですって'), t('んだってば'), t('絶対'), t('本当に'),
    t('マジで'), t('間違いない'), t('間違いなく'),
    // Multi-token
    tt('ん', 'だ', 'よ'), tt('ん', 'です', 'よ'), tt('ん', 'だ', 'ぞ'),
    tt('ん', 'だ', 'から'), tt('ん', 'です', 'から'), tt('の', 'よ'),
    tt('ん', 'だ', 'わ'), tt('なん', 'だ', 'って'), tt('なん', 'です', 'って'),
];

/** 2h. Softening / Mitigation (緩和・配慮表現) */
export const CLOSING_SOFTENING: string[][] = [
    t('んですけど'), t('んだけど'), t('んですけれども'), t('んだけれども'),
    t('んですが'), t('んだが'), t('かなと思って'), t('かなって思って'),
    t('という感じで'), t('って感じで'), t('みたいな'), t('みたいな感じ'),
    t('っぽい'), t('感じがする'), t('気がする'), t('かもしれない'),
    t('かもしれません'), t('かもしれないけど'), t('かもしれないですけど'),
    t('ないかなと'), t('ないかなって'), t('と思うんですけど'), t('と思うんだけど'),
    t('じゃないかと'), t('ではないかと'),
    // Multi-token
    tt('ん', 'です', 'けど'), tt('ん', 'だ', 'けど'), tt('ん', 'です', 'が'),
    tt('ん', 'だ', 'が'), tt('か', 'な', 'と', '思っ', 'て'),
    tt('か', 'な', 'って', '思っ', 'て'),
    tt('という', '感じ', 'で'), tt('って', '感じ', 'で'),
    tt('みたい', 'な'), tt('みたい', 'な', '感じ'),
    tt('かも', 'しれ', 'ない'), tt('かも', 'しれ', 'ませ', 'ん'),
    tt('気', 'が', 'する'), tt('感じ', 'が', 'する'),
    tt('と', '思う', 'ん', 'です', 'けど'), tt('と', '思う', 'ん', 'だ', 'けど'),
];

/** 2i. Desire / Intention / Volition (意志・願望) */
export const CLOSING_DESIRE: string[][] = [
    t('たい'), t('たいです'), t('たいんだ'), t('たいんです'), t('たいんだけど'),
    t('たいんですけど'), t('たいな'), t('たいなあ'), t('たいよね'), t('たいですよね'),
    t('つもりだ'), t('つもりです'), t('ようと思って'), t('ようと思ってる'),
    t('ようかなと'), t('ようかなって'), t('ことにした'), t('ことにしました'),
    t('ことにする'), t('ことにしよう'), t('てほしい'), t('てほしいんだけど'),
    t('てほしいんですけど'), t('てもらいたい'), t('てくれない'), t('てくれませんか'),
    // Multi-token
    tt('たい'), tt('たい', 'です'), tt('たい', 'ん', 'だ'), tt('たい', 'ん', 'です'),
    tt('たい', 'ん', 'だ', 'けど'), tt('たい', 'ん', 'です', 'けど'),
    tt('たい', 'な'), tt('たい', 'なあ'), tt('たい', 'よ', 'ね'),
    tt('たい', 'です', 'よ', 'ね'), tt('つもり', 'だ'), tt('つもり', 'です'),
    tt('よう', 'と', '思っ', 'て'), tt('よう', 'と', '思っ', 'てる'),
    tt('こと', 'に', 'し', 'た'), tt('こと', 'に', 'し', 'まし', 'た'),
    tt('こと', 'に', 'する'), tt('こと', 'に', 'しよう'),
    tt('て', 'ほし', 'い'), tt('て', 'もらい', 'たい'),
    tt('て', 'くれ', 'ない'), tt('て', 'くれ', 'ませ', 'ん', 'か'),
];

/** 2j. Prohibition / Obligation / Permission (禁止・義務・許可) */
export const CLOSING_OBLIGATION: string[][] = [
    t('てはいけない'), t('てはだめ'), t('ちゃだめ'), t('ちゃいけない'),
    t('てはなりません'), t('なければならない'), t('なきゃいけない'),
    t('なくちゃいけない'), t('ないといけない'), t('なければなりません'),
    t('なきゃだめ'), t('なくちゃだめ'), t('ざるを得ない'), t('てもいい'),
    t('てもいいです'), t('てもかまわない'), t('てもかまいません'),
    t('なくてもいい'), t('なくてもかまわない'), t('しなくていい'),
    // Multi-token
    tt('て', 'は', 'いけ', 'ない'), tt('て', 'は', 'だめ'), tt('ちゃ', 'だめ'),
    tt('ちゃ', 'いけ', 'ない'), tt('て', 'は', 'なり', 'ませ', 'ん'),
    tt('なけれ', 'ば', 'なら', 'ない'), tt('なきゃ', 'いけ', 'ない'),
    tt('なく', 'ちゃ', 'いけ', 'ない'), tt('ない', 'と', 'いけ', 'ない'),
    tt('なければ', 'なり', 'ませ', 'ん'), tt('なきゃ', 'だめ'),
    tt('なく', 'ちゃ', 'だめ'), tt('ざる', 'を', 'え', 'ない'),
    tt('て', 'も', 'いい'), tt('て', 'も', 'いい', 'です'),
    tt('て', 'も', 'かまわ', 'ない'), tt('なく', 'て', 'も', 'いい'),
    tt('なく', 'て', 'も', 'かまわ', 'ない'), tt('し', 'なく', 'て', 'いい'),
];

/** 2k. Conditional / Hypothetical Endings (条件・仮定) */
export const CLOSING_CONDITIONAL: string[][] = [
    t('たら'), t('ば'), t('なら'), t('と'), t('としたら'), t('とすれば'),
    t('とすると'), t('だったら'), t('であれば'), t('ならば'), t('んだったら'),
    t('んであれば'), t('ようものなら'), t('かのように'), t('かと思ったら'),
    t('かと思うと'), t('た途端に'), t('矢先に'),
    // Multi-token
    tt('と', 'し', 'たら'), tt('と', 'すれ', 'ば'), tt('と', 'する', 'と'),
    tt('だっ', 'たら'), tt('で', 'あれ', 'ば'), tt('なら', 'ば'),
    tt('ん', 'だっ', 'たら'), tt('ん', 'で', 'あれ', 'ば'),
    tt('よう', 'もの', 'なら'), tt('か', 'の', 'よう', 'に'),
    tt('か', 'と', '思っ', 'たら'), tt('か', 'と', '思う', 'と'),
    tt('た', '途端', 'に'), tt('矢先', 'に'),
];

// ─── Category 3: 論理展開パターン (Logical Flow Patterns) ────────────────────

export interface LogicalFlowPattern {
    id: string;
    name: string;
    /** Each step is an array of alternative surface tokens that match this position */
    steps: string[][];
    description: string;
}

export const LOGICAL_FLOW_PATTERNS: LogicalFlowPattern[] = [
    // Cause → Result
    {
        id: 'cause-result-kara',
        name: '原因→結果 (から)',
        steps: [['から'], ['わけで', 'だから', 'それで', 'ので', 'ということだ']],
        description: 'から → わけで / だから / それで',
    },
    {
        id: 'cause-result-node',
        name: '原因→結果 (ので)',
        steps: [['ので'], ['だから', 'それで', 'そういうわけで', 'というわけで']],
        description: 'ので → だから / それで',
    },
    // Contrast
    {
        id: 'contrast-kedo',
        name: '対比 (けど)',
        steps: [['けど', 'けれども'], ['でも', 'しかし', 'ところが'], ['んですよ', 'のに']],
        description: 'けど → でも / しかし / ところが',
    },
    {
        id: 'contrast-ippou',
        name: '対比 (一方で)',
        steps: [['一方で'], ['他方', '反対に', 'それに対して']],
        description: '一方で → 他方 / 反対に',
    },
    // Concession
    {
        id: 'concession-tashikani',
        name: '譲歩 (確かに)',
        steps: [['確かに'], ['けど', 'でも', 'しかし'], ['んですよ', 'と思う']],
        description: '確かに → けど → んですよ',
    },
    {
        id: 'concession-mochiron',
        name: '譲歩 (もちろん)',
        steps: [['もちろん'], ['だけど', 'けれども'], ['わけじゃない']],
        description: 'もちろん → だけど → わけじゃない',
    },
    // Elaboration
    {
        id: 'elaboration-toiunowa',
        name: '詳述 (というのは)',
        steps: [['というのは'], ['つまり'], ['ということ']],
        description: 'というのは → つまり → ということ',
    },
    // Exemplification
    {
        id: 'exemplification-tatoeba',
        name: '例示 (たとえば)',
        steps: [['たとえば'], ['みたいな', 'のような'], ['という感じ', 'って感じ']],
        description: 'たとえば → みたいな → という感じ',
    },
    // Summary / Conclusion
    {
        id: 'summary-kekkyoku',
        name: '要約 (結局)',
        steps: [['結局'], ['わけで'], ['ということだ', 'というわけです']],
        description: '結局 → わけで → ということだ',
    },
    {
        id: 'summary-yousuruni',
        name: '要約 (要するに)',
        steps: [['要するに'], ['つまり'], ['ということ', 'というわけ']],
        description: '要するに → つまり → ということ',
    },
    // Conditional → consequence
    {
        id: 'conditional-consequence-moshi',
        name: '条件→帰結 (もし)',
        steps: [['もし'], ['たら', 'ば'], ['んだけど', 'かもしれない']],
        description: 'もし → たら / ば → んだけど',
    },
    {
        id: 'conditional-consequence-kari',
        name: '条件→帰結 (仮に)',
        steps: [['仮に'], ['としたら', 'とすれば'], ['ことになる', 'わけだ']],
        description: '仮に → としたら → ことになる',
    },
    // Escalation
    {
        id: 'escalation',
        name: '追加・強調 (しかも)',
        steps: [['しかも'], ['おまけに'], ['さらに'], ['結局']],
        description: 'しかも → おまけに → さらに → 結局',
    },
    // Repair / Self-correction
    {
        id: 'repair-tteiuka',
        name: '修復 (っていうか)',
        steps: [['っていうか', 'ていうか'], ['むしろ'], ['というか'], ['つまり']],
        description: 'っていうか → むしろ → つまり',
    },
    {
        id: 'repair-janakute',
        name: '修復 (じゃなくて)',
        steps: [['じゃなくて'], ['っていうか', 'ていうか'], ['要するに']],
        description: 'じゃなくて → っていうか → 要するに',
    },
    // Quotation → Evaluation
    {
        id: 'quotation-evaluation',
        name: '引用→評価 (って)',
        steps: [['って'], ['言ってた'], ['けど'], ['と思う', 'わけだ']],
        description: 'って → 言ってた → けど → と思う',
    },
    {
        id: 'quotation-toiu',
        name: '引用→評価 (という)',
        steps: [['という'], ['ことだ', 'わけだ', 'らしい']],
        description: 'という → ことだ / わけだ / らしい',
    },
    // Topic chain
    {
        id: 'topic-chain',
        name: '話題連鎖',
        steps: [['について'], ['で'], ['って'], ['というのは'], ['つまり']],
        description: 'について → で → って → というのは → つまり',
    },
];

// ─── Category 4: 談話境界標識 (Discourse Boundary Markers) ───────────────────

/** 4a. Topic Shift (話題転換) */
export const BOUNDARY_TOPIC_SHIFT: string[][] = [
    t('ところで'), t('そういえば'), t('話変わるけど'), t('話変わるんだけど'),
    t('それはそうと'), t('そうだ'), t('あ思い出した'), t('そうそう'), t('あそうだ'),
    t('ついでに'), t('ついでに言うと'), t('別の話なんだけど'),
    t('全然違う話なんだけど'), t('関係ないんだけど'), t('余談だけど'),
    t('余談ですが'), t('脱線するけど'), t('横道にそれるけど'), t('ふと思ったんだけど'),
];

/** 4b. Topic Return (話題復帰) */
export const BOUNDARY_TOPIC_RETURN: string[][] = [
    t('で'), t('さっきの話に戻ると'), t('話を戻すと'), t('元に戻ると'),
    t('本題に戻ると'), t('さっき言ってた'), t('さっきの話だけど'),
    t('もとの話だけど'), t('何の話だっけ'), t('どこまで話したっけ'),
    t('何を言いたかったかというと'), t('そもそもの話だけど'), t('最初の話に戻るけど'),
];

/** 4c. Summary / Wrap-up (要約・まとめ) */
export const BOUNDARY_SUMMARY: string[][] = [
    t('結局'), t('要は'), t('要するに'), t('まとめると'), t('つまり'),
    t('ということで'), t('というわけで'), t('結論としては'), t('結論から言うと'),
    t('一言で言うと'), t('簡単に言うと'), t('まあそういうことで'), t('とにかく'),
    t('ともかく'), t('いずれにしても'), t('最終的には'), t('結局のところ'),
    t('要点は'), t('ポイントは'),
];

/** 4d. Discourse Segment Boundaries (段落境界) */
export const BOUNDARY_SEGMENT: string[][] = [
    t('さて'), t('では'), t('それでは'), t('じゃあ'), t('じゃ'), t('さてと'),
    t('よし'), t('そろそろ'), t('まあとにかく'), t('いずれにしても'),
    t('とりあえず'), t('次に'), t('次の話なんだけど'), t('もう一つ'),
    t('あともう一つ'), t('最後に'), t('最後なんだけど'), t('締めくくると'),
];

// ─── Category 5: 相互行為的表現 (Interactional Expressions) ─────────────────

/** 5a. Sentence-Final Particles (終助詞) */
export const INTERACTIONAL_SFPS: string[][] = [
    t('ね'), t('ねえ'), t('よ'), t('よね'), t('よねえ'), t('な'), t('なあ'),
    t('かな'), t('かなあ'), t('さ'), t('さあ'), t('ぞ'), t('ぜ'), t('わ'),
    t('の'), t('かしら'), t('だい'), t('かい'), t('もの'), t('もん'),
    t('って'), t('ってば'), t('ったら'), t('こと'),
];

/** 5b. Response / Agreement Tokens (応答・同意) */
export const INTERACTIONAL_RESPONSE: string[][] = [
    t('うん'), t('ああ'), t('そう'), t('そうそう'), t('そうだね'), t('そうですね'),
    t('なるほど'), t('なるほどね'), t('確かに'), t('確かにね'), t('本当だ'),
    t('本当ですね'), t('マジで'), t('マジか'), t('まじか'), t('へえ'),
    t('ほんとに'), t('ほんとだ'), t('わかる'), t('わかるわかる'), t('それな'),
    t('たしかに'), t('いいね'), t('すごい'), t('すごいね'), t('やばい'),
    t('やばいね'),
];

/** 5c. Comprehension Check / Repair (理解確認・修復) */
export const INTERACTIONAL_REPAIR: string[][] = [
    t('わかる'), t('わかった'), t('わかります'), t('大丈夫'), t('OK'), t('なんとなく'),
    t('言ってること分かる'), t('ちょっと待って'), t('もう一回'), t('もう一回言って'),
    t('え何'), t('何て'), t('何ていった'), t('つまりどういうこと'), t('どういう意味'),
    t('意味がわからない'),
];

/** 5d. Evaluative Expressions (評価表現) */
export const INTERACTIONAL_EVALUATIVE: string[][] = [
    t('いいね'), t('すごい'), t('すごいね'), t('やばい'), t('やばくない'), t('えぐい'),
    t('まじで'), t('本当に'), t('半端ない'), t('半端じゃない'), t('信じられない'),
    t('ありえない'), t('考えられない'), t('面白い'), t('面白いね'), t('おもろい'),
    t('ウケる'), t('最高'), t('最悪'), t('微妙'), t('微妙だね'), t('なかなか'),
    t('さすが'), t('さすがだね'), t('素晴らしい'),
];

// ─── Category 6: モダリティ表現 (Modality System) ────────────────────────────

/** 6a. Epistemic Modality (認識的モダリティ) */
export const MODALITY_EPISTEMIC: string[][] = [
    t('だろう'), t('でしょう'), t('かもしれない'), t('かもしれません'),
    t('に違いない'), t('にちがいない'), t('はずだ'), t('はずです'),
    t('そうだ'), t('ようだ'), t('みたいだ'), t('らしい'), t('っぽい'),
    t('と思う'), t('と思います'), t('と思うんだけど'), t('じゃないかと思う'),
    t('気がする'), t('感じがする'),
    // Multi-token
    tt('だ', 'ろう'), tt('で', 'しょう'), tt('かも', 'しれ', 'ない'),
    tt('かも', 'しれ', 'ませ', 'ん'), tt('に', '違い', 'ない'),
    tt('はず', 'だ'), tt('はず', 'です'),
    tt('そう', 'だ'), tt('よう', 'だ'), tt('みたい', 'だ'), tt('らし', 'い'),
    tt('と', '思う'), tt('と', '思い', 'ます'), tt('気', 'が', 'する'),
    tt('感じ', 'が', 'する'),
];

/** 6b. Deontic Modality (義務的モダリティ) */
export const MODALITY_DEONTIC: string[][] = [
    t('べきだ'), t('べきです'), t('なければならない'), t('なきゃいけない'),
    t('なくちゃいけない'), t('ないといけない'), t('ざるを得ない'), t('てはいけない'),
    t('ちゃいけない'), t('ちゃだめ'), t('てもいい'), t('なくてもいい'),
    t('しなくていい'), t('てもかまわない'), t('たほうがいい'), t('ないほうがいい'),
    t('てはならない'), t('べきではない'),
    // Multi-token
    tt('べき', 'だ'), tt('べき', 'です'), tt('なけれ', 'ば', 'なら', 'ない'),
    tt('なきゃ', 'いけ', 'ない'), tt('なく', 'ちゃ', 'いけ', 'ない'),
    tt('ない', 'と', 'いけ', 'ない'), tt('ざる', 'を', 'え', 'ない'),
    tt('て', 'は', 'いけ', 'ない'), tt('ちゃ', 'いけ', 'ない'), tt('ちゃ', 'だめ'),
    tt('て', 'も', 'いい'), tt('なく', 'て', 'も', 'いい'),
    tt('し', 'なく', 'て', 'いい'), tt('て', 'も', 'かまわ', 'ない'),
    tt('た', 'ほう', 'が', 'いい'), tt('ない', 'ほう', 'が', 'いい'),
    tt('て', 'は', 'なら', 'ない'), tt('べき', 'で', 'は', 'ない'),
];

/** 6c. Dynamic Modality (動態的モダリティ) */
export const MODALITY_DYNAMIC: string[][] = [
    t('ことができる'), t('られる'), t('れる'), t('える'), t('うる'), t('かねる'),
    t('かねない'), t('てしまう'), t('ちゃう'), t('じゃう'), t('てしまった'),
    t('ちゃった'), t('じゃった'), t('ようとする'), t('ようとした'), t('かける'),
    t('かけた'), t('そうになる'), t('そうになった'),
    // Multi-token
    tt('こと', 'が', 'でき', 'る'), tt('られ', 'る'), tt('れ', 'る'),
    tt('かね', 'る'), tt('かね', 'ない'), tt('て', 'しまう'), tt('ちゃ', 'う'),
    tt('じゃ', 'う'), tt('て', 'しまっ', 'た'), tt('ちゃっ', 'た'),
    tt('よう', 'と', 'する'), tt('よう', 'と', 'し', 'た'),
    tt('かけ', 'る'), tt('かけ', 'た'), tt('そう', 'に', 'なる'),
    tt('そう', 'に', 'なっ', 'た'),
];

// ─── Category 7: 引用・伝達表現 (Quotation/Reported Speech) ──────────────────

export const QUOTATION_MARKERS: string[][] = [
    t('って'), t('という'), t('っていう'), t('と言う'), t('って言う'),
    t('って言ってた'), t('って聞いた'), t('と思う'), t('と思った'), t('と思って'),
    t('と考える'), t('と感じる'), t('と感じた'), t('みたいなこと言ってた'),
    t('的なこと言ってた'), t('って感じのこと'), t('ようなことを言ってた'),
    t('とかなんとか'), t('とかって'), t('とかいう'), t('曰く'),
    t('によると'), t('によれば'), t('の話では'), t('の話だと'),
    // Multi-token
    tt('と', '言う'), tt('って', '言う'), tt('って', '言っ', 'て', 'た'),
    tt('って', '聞い', 'た'), tt('と', '思う'), tt('と', '思っ', 'た'),
    tt('と', '思っ', 'て'), tt('と', '考え', 'る'), tt('と', '感じ', 'る'),
    tt('と', '感じ', 'た'), tt('と', 'か', 'なん', 'と', 'か'),
    tt('と', 'か', 'って'), tt('と', 'か', 'いう'), tt('に', 'よる', 'と'),
    tt('に', 'よれ', 'ば'), tt('の', '話', 'で', 'は'), tt('の', '話', 'だ', 'と'),
];

// ─── Category 8: テンス・アスペクト (Tense/Aspect in Discourse) ───────────────

export const TENSE_ASPECT_MARKERS: string[][] = [
    t('ている'), t('てる'), t('ていた'), t('てた'), t('ていく'), t('てく'),
    t('てくる'), t('てきた'), t('たことがある'), t('たことある'), t('ことがある'),
    t('ことある'), t('ようになった'), t('ようになる'), t('つつある'), t('つつあった'),
    t('始める'), t('始めた'), t('終わる'), t('終わった'), t('続ける'), t('続けている'),
    t('ばかりだ'), t('ばかりです'), t('ばっかり'), t('ところだ'), t('ところです'),
    // Multi-token
    tt('て', 'いる'), tt('て', 'る'), tt('て', 'いた'), tt('て', 'た'),
    tt('て', 'いく'), tt('て', 'く'), tt('て', 'くる'), tt('て', 'き', 'た'),
    tt('た', 'こと', 'が', 'ある'), tt('こと', 'が', 'ある'),
    tt('よう', 'に', 'なっ', 'た'), tt('よう', 'に', 'なる'),
    tt('つつ', 'ある'), tt('つつ', 'あっ', 'た'),
    tt('始め', 'る'), tt('始め', 'た'), tt('終わ', 'る'), tt('終わっ', 'た'),
    tt('続け', 'る'), tt('続け', 'て', 'いる'),
    tt('ばかり', 'だ'), tt('ばかり', 'です'), tt('ばっ', 'かり'),
    tt('ところ', 'だ'), tt('ところ', 'です'),
];

// ─── Category 9: 待遇表現 (Politeness/Register) ──────────────────────────────

export const POLITENESS_FORMAL: string[][] = [
    t('です'), t('ます'), t('ございます'), t('でございます'), t('いたします'),
    t('させていただく'), t('くださる'), t('いただく'), t('おっしゃる'), t('なさる'),
    t('でいらっしゃる'),
    // Multi-token
    tt('で', 'ござい', 'ます'), tt('いたし', 'ます'), tt('させ', 'て', 'いただく'),
    tt('くださ', 'る'), tt('いただ', 'く'), tt('おっしゃ', 'る'), tt('なさ', 'る'),
    tt('で', 'いらっしゃ', 'る'),
];

export const POLITENESS_CASUAL: string[][] = [
    t('じゃん'), t('だよ'), t('だぜ'), t('だぞ'), t('じゃねえ'), t('ねえよ'),
    t('ないよ'), t('ないっすよ'), t('すか'), t('っす'), t('ないっす'), t('だっけ'),
    // Multi-token
    tt('じゃ', 'ん'), tt('だ', 'よ'), tt('だ', 'ぜ'), tt('だ', 'ぞ'),
    tt('じゃ', 'ねえ'), tt('ねえ', 'よ'), tt('ない', 'よ'),
    tt('ない', 'っす', 'よ'), tt('っす'), tt('ない', 'っす'), tt('だっ', 'け'),
];

// ─── Master export: all opening/closing sets with metadata ───────────────────

export interface PatternSet {
    id: string;
    category: 'opening' | 'closing' | 'boundary' | 'interactional' | 'modality' | 'quotation' | 'tense' | 'politeness';
    subcategory: string;
    label: string;
    patterns: string[][];
    /** Colour used for overlay annotation */
    color: string;
}

export const ALL_PATTERN_SETS: PatternSet[] = [
    // Opening
    { id: 'opening-topic', category: 'opening', subcategory: 'topic-management', label: '話題管理', patterns: OPENING_TOPIC_MANAGEMENT, color: '#4fc3f7' },
    { id: 'opening-seq', category: 'opening', subcategory: 'sequence', label: '展開標識', patterns: OPENING_SEQUENCE, color: '#81c784' },
    { id: 'opening-filler', category: 'opening', subcategory: 'filler', label: 'フィラー', patterns: OPENING_FILLERS, color: '#ffb74d' },
    { id: 'opening-attention', category: 'opening', subcategory: 'attention', label: '注意喚起', patterns: OPENING_ATTENTION, color: '#f06292' },
    { id: 'opening-concession', category: 'opening', subcategory: 'concession', label: '譲歩', patterns: OPENING_CONCESSION, color: '#ba68c8' },
    // Closing
    { id: 'closing-noda', category: 'closing', subcategory: 'noda', label: 'んだ系', patterns: CLOSING_NODA, color: '#4dd0e1' },
    { id: 'closing-wake', category: 'closing', subcategory: 'wake', label: 'わけ系', patterns: CLOSING_WAKE, color: '#aed581' },
    { id: 'closing-hazu', category: 'closing', subcategory: 'hazu', label: 'はず系', patterns: CLOSING_HAZU, color: '#ffcc02' },
    { id: 'closing-mono', category: 'closing', subcategory: 'mono', label: 'もの系', patterns: CLOSING_MONO, color: '#ff8a65' },
    { id: 'closing-conf', category: 'closing', subcategory: 'confirmation', label: '確認要求', patterns: CLOSING_CONFIRMATION, color: '#e57373' },
    { id: 'closing-hearsay', category: 'closing', subcategory: 'hearsay', label: '伝聞', patterns: CLOSING_HEARSAY, color: '#9575cd' },
    { id: 'closing-assert', category: 'closing', subcategory: 'assertion', label: '主張', patterns: CLOSING_ASSERTION, color: '#f44336' },
    { id: 'closing-soft', category: 'closing', subcategory: 'softening', label: '緩和', patterns: CLOSING_SOFTENING, color: '#26c6da' },
    { id: 'closing-desire', category: 'closing', subcategory: 'desire', label: '意志・願望', patterns: CLOSING_DESIRE, color: '#ec407a' },
    { id: 'closing-oblig', category: 'closing', subcategory: 'obligation', label: '義務・許可', patterns: CLOSING_OBLIGATION, color: '#ef5350' },
    { id: 'closing-cond', category: 'closing', subcategory: 'conditional', label: '条件・仮定', patterns: CLOSING_CONDITIONAL, color: '#78909c' },
    // Boundary
    { id: 'boundary-shift', category: 'boundary', subcategory: 'topic-shift', label: '話題転換', patterns: BOUNDARY_TOPIC_SHIFT, color: '#ff7043' },
    { id: 'boundary-return', category: 'boundary', subcategory: 'topic-return', label: '話題復帰', patterns: BOUNDARY_TOPIC_RETURN, color: '#66bb6a' },
    { id: 'boundary-summary', category: 'boundary', subcategory: 'summary', label: '要約', patterns: BOUNDARY_SUMMARY, color: '#42a5f5' },
    { id: 'boundary-segment', category: 'boundary', subcategory: 'segment', label: '段落境界', patterns: BOUNDARY_SEGMENT, color: '#ab47bc' },
    // Interactional
    { id: 'inter-sfp', category: 'interactional', subcategory: 'sfp', label: '終助詞', patterns: INTERACTIONAL_SFPS, color: '#26a69a' },
    { id: 'inter-response', category: 'interactional', subcategory: 'response', label: '応答・同意', patterns: INTERACTIONAL_RESPONSE, color: '#8d6e63' },
    { id: 'inter-repair', category: 'interactional', subcategory: 'repair', label: '理解確認', patterns: INTERACTIONAL_REPAIR, color: '#5c6bc0' },
    { id: 'inter-eval', category: 'interactional', subcategory: 'evaluative', label: '評価表現', patterns: INTERACTIONAL_EVALUATIVE, color: '#d4e157' },
    // Modality
    { id: 'mod-epistemic', category: 'modality', subcategory: 'epistemic', label: '認識的モダリティ', patterns: MODALITY_EPISTEMIC, color: '#29b6f6' },
    { id: 'mod-deontic', category: 'modality', subcategory: 'deontic', label: '義務的モダリティ', patterns: MODALITY_DEONTIC, color: '#ef5350' },
    { id: 'mod-dynamic', category: 'modality', subcategory: 'dynamic', label: '動態的モダリティ', patterns: MODALITY_DYNAMIC, color: '#66bb6a' },
    // Quotation
    { id: 'quotation', category: 'quotation', subcategory: 'reported-speech', label: '引用・伝達', patterns: QUOTATION_MARKERS, color: '#ffa726' },
    // Tense/Aspect
    { id: 'tense-aspect', category: 'tense', subcategory: 'tense-aspect', label: 'テンス・アスペクト', patterns: TENSE_ASPECT_MARKERS, color: '#7e57c2' },
    // Politeness
    { id: 'politeness-formal', category: 'politeness', subcategory: 'formal', label: '丁寧語', patterns: POLITENESS_FORMAL, color: '#4db6ac' },
    { id: 'politeness-casual', category: 'politeness', subcategory: 'casual', label: 'カジュアル', patterns: POLITENESS_CASUAL, color: '#ff8a65' },
];
