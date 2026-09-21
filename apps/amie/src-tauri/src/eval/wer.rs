use serde::Serialize;

/// Normalized ASR evaluation report.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WerReport {
    pub reference_words: usize,
    pub hypothesis_words: usize,
    pub substitutions: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub wer: f64,
    pub duplicate_bigram_count: usize,
    pub normalized_reference: String,
    pub normalized_hypothesis: String,
}

/// Lowercase, strip punctuation, collapse whitespace.
pub fn normalize(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last_was_space = false;

    for ch in text.chars() {
        if ch.is_alphanumeric() {
            out.extend(ch.to_lowercase());
            last_was_space = false;
        } else if ch.is_whitespace() {
            if !last_was_space && !out.is_empty() {
                out.push(' ');
                last_was_space = true;
            }
        }
    }

    out.trim().to_string()
}

/// Word-level WER via Levenshtein alignment on token sequences.
pub fn evaluate(reference: &str, hypothesis: &str) -> WerReport {
    let ref_norm = normalize(reference);
    let hyp_norm = normalize(hypothesis);
    let ref_words: Vec<&str> = ref_norm.split_whitespace().collect();
    let hyp_words: Vec<&str> = hyp_norm.split_whitespace().collect();

    let (subs, ins, dels) = word_edit_counts(&ref_words, &hyp_words);
    let ref_len = ref_words.len().max(1);
    let wer = (subs + ins + dels) as f64 / ref_len as f64;

    WerReport {
        reference_words: ref_words.len(),
        hypothesis_words: hyp_words.len(),
        substitutions: subs,
        insertions: ins,
        deletions: dels,
        wer,
        duplicate_bigram_count: count_duplicate_bigrams(&hyp_words),
        normalized_reference: ref_norm,
        normalized_hypothesis: hyp_norm,
    }
}

fn word_edit_counts(reference: &[&str], hypothesis: &[&str]) -> (usize, usize, usize) {
    let n = reference.len();
    let m = hypothesis.len();
    let mut dp = vec![vec![0usize; m + 1]; n + 1];

    for i in 0..=n {
        dp[i][0] = i;
    }
    for j in 0..=m {
        dp[0][j] = j;
    }

    for i in 1..=n {
        for j in 1..=m {
            let cost = if reference[i - 1] == hypothesis[j - 1] {
                0
            } else {
                1
            };
            dp[i][j] = (dp[i - 1][j] + 1)
                .min(dp[i][j - 1] + 1)
                .min(dp[i - 1][j - 1] + cost);
        }
    }

    let mut i = n;
    let mut j = m;
    let mut subs = 0usize;
    let mut ins = 0usize;
    let mut dels = 0usize;

    while i > 0 || j > 0 {
        if i > 0 && j > 0 && reference[i - 1] == hypothesis[j - 1] {
            i -= 1;
            j -= 1;
        } else if i > 0 && j > 0 && dp[i][j] == dp[i - 1][j - 1] + 1 {
            subs += 1;
            i -= 1;
            j -= 1;
        } else if j > 0 && dp[i][j] == dp[i][j - 1] + 1 {
            ins += 1;
            j -= 1;
        } else {
            dels += 1;
            i -= 1;
        }
    }

    (subs, ins, dels)
}

fn count_duplicate_bigrams(words: &[&str]) -> usize {
    if words.len() < 4 {
        return 0;
    }

    let mut count = 0usize;
    for i in 0..words.len().saturating_sub(3) {
        if words[i] == words[i + 2] && words[i + 1] == words[i + 3] {
            count += 1;
        }
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_punctuation_and_case() {
        let n = normalize("Hello, World! 20%");
        assert_eq!(n, "hello world 20");
    }

    #[test]
    fn identical_text_has_zero_wer() {
        let report = evaluate("hello world", "hello world");
        assert_eq!(report.wer, 0.0);
    }

    #[test]
    fn deletion_increases_wer() {
        let report = evaluate("one two three", "one three");
        assert!(report.deletions >= 1);
        assert!(report.wer > 0.0);
    }
}
