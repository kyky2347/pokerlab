//! Frozen pre-optimization evaluator, used only as a regression oracle.
//! Keep this independent of the production rank histogram and straight detector.

use super::*;
use std::collections::HashMap;

fn reference_straight(ranks: impl Iterator<Item = u8>) -> Option<u8> {
    let mut unique: Vec<u8> = ranks.collect::<HashSet<_>>().into_iter().collect();
    if unique.contains(&14) {
        unique.push(1);
    }
    unique.sort_unstable();
    let mut run = 1;
    let mut best = None;
    for pair in unique.windows(2) {
        if pair[1] == pair[0] + 1 {
            run += 1;
            if run >= 5 {
                best = Some(pair[1]);
            }
        } else {
            run = 1;
        }
    }
    best
}

fn reference_five(cards: &[Card]) -> HandRank {
    let mut counts: HashMap<u8, u8> = HashMap::new();
    for card in cards {
        *counts.entry(card.rank).or_default() += 1;
    }
    let mut grouped: Vec<(u8, u8)> = counts.iter().map(|(&rank, &count)| (count, rank)).collect();
    grouped.sort_unstable_by(|a, b| b.cmp(a));
    let flush = cards.iter().all(|card| card.suit == cards[0].suit);
    let straight = reference_straight(cards.iter().map(|card| card.rank));
    if let (true, Some(high)) = (flush, straight) {
        return vec![8, high];
    }
    if grouped[0].0 == 4 {
        return vec![7, grouped[0].1, grouped[1].1];
    }
    if grouped[0].0 == 3 && grouped[1].0 == 2 {
        return vec![6, grouped[0].1, grouped[1].1];
    }
    if flush {
        let mut ranks: Vec<u8> = cards.iter().map(|card| card.rank).collect();
        ranks.sort_unstable_by(|a, b| b.cmp(a));
        let mut result = vec![5];
        result.extend(ranks);
        return result;
    }
    if let Some(high) = straight {
        return vec![4, high];
    }
    if grouped[0].0 == 3 {
        let mut kickers: Vec<u8> = grouped[1..].iter().map(|group| group.1).collect();
        kickers.sort_unstable_by(|a, b| b.cmp(a));
        return vec![vec![3, grouped[0].1], kickers].concat();
    }
    let mut pairs: Vec<u8> = grouped.iter().filter(|g| g.0 == 2).map(|g| g.1).collect();
    pairs.sort_unstable_by(|a, b| b.cmp(a));
    if pairs.len() == 2 {
        let kicker = grouped.iter().find(|g| g.0 == 1).unwrap().1;
        return vec![2, pairs[0], pairs[1], kicker];
    }
    if pairs.len() == 1 {
        let mut kickers: Vec<u8> = grouped.iter().filter(|g| g.0 == 1).map(|g| g.1).collect();
        kickers.sort_unstable_by(|a, b| b.cmp(a));
        return vec![vec![1, pairs[0]], kickers].concat();
    }
    let mut ranks: Vec<u8> = cards.iter().map(|card| card.rank).collect();
    ranks.sort_unstable_by(|a, b| b.cmp(a));
    vec![vec![0], ranks].concat()
}

fn deck_cards() -> Vec<Card> {
    (2..=14)
        .flat_map(|rank| (0..4).map(move |suit| Card { rank, suit }))
        .collect()
}

#[test]
fn exhaustive_five_card_ranks_match_original_including_all_kickers() {
    let deck = deck_cards();
    let mut checked = 0;
    for a in 0..48 {
        for b in a + 1..49 {
            for c in b + 1..50 {
                for d in c + 1..51 {
                    for e in d + 1..52 {
                        let hand = [deck[a], deck[b], deck[c], deck[d], deck[e]];
                        assert_eq!(evaluate_five_cards(&hand).unwrap(), reference_five(&hand));
                        checked += 1;
                    }
                }
            }
        }
    }
    assert_eq!(checked, 2_598_960);
}

#[test]
fn every_rank_subset_has_the_same_straight_high() {
    for mask in 0_u16..(1 << 13) {
        let ranks: Vec<u8> = (2..=14)
            .filter(|rank| mask & (1 << (rank - 2)) != 0)
            .collect();
        assert_eq!(
            straight_high(ranks.iter().copied()),
            reference_straight(ranks.into_iter())
        );
    }
}

#[test]
fn seven_card_boundary_rejects_every_duplicate_position_pair() {
    let cards = deck_cards();
    for first in 0..7 {
        for second in first + 1..7 {
            let mut hand = cards[..7].to_vec();
            hand[second] = hand[first];
            assert!(evaluate_seven_cards(&hand).is_err());
        }
    }
}

#[test]
fn seven_card_boundary_rejects_wrong_lengths() {
    let cards = deck_cards();
    for count in [0, 1, 2, 3, 4, 5, 6, 8, 9, 52] {
        assert!(evaluate_seven_cards(&cards[..count]).is_err());
    }
}

#[test]
fn parser_rejects_malformed_tokens_without_panicking() {
    for token in [
        "", "A", "10s", "Asx", "1s", "Xs", "Ax", "♠", "Ａs", "A♠", "\0s",
    ] {
        assert!(Card::parse(token).is_err(), "accepted {token:?}");
    }
    assert_eq!(Card::parse("aS"), Card::parse("As"));
}

#[test]
fn showdown_rejects_every_duplicate_position_pair_across_players_and_board() {
    let deck = deck_cards();
    for first in 0..9 {
        for second in first + 1..9 {
            let mut deal = deck[..9].to_vec();
            deal[second] = deal[first];
            assert!(showdown_cards(&deal[..2], &deal[2..4], &deal[4..]).is_err());
        }
    }
}

#[test]
fn showdown_requires_two_two_five_geometry() {
    let deck = deck_cards();
    for hero_count in 0..=9 {
        for villain_count in 0..=9 - hero_count {
            let split = hero_count + villain_count;
            let result = showdown_cards(
                &deck[..hero_count],
                &deck[hero_count..split],
                &deck[split..9],
            );
            assert_eq!(result.is_ok(), hero_count == 2 && villain_count == 2);
        }
    }
    for count in [0, 1, 2, 3, 4, 6, 7, 8] {
        assert!(showdown_cards(&deck[..2], &deck[2..4], &deck[4..4 + count]).is_err());
    }
}

#[test]
fn showdown_compares_full_ranks_with_the_original_ranker() {
    // Deterministic full-deck windows, plus separate Python tests for seeded
    // full-deck draws, permutations and explicit edge cases.
    let deck = deck_cards();
    for offset in 0..52 {
        let deal: Vec<_> = (0..9).map(|i| deck[(offset + i * 5) % 52]).collect();
        let reference = |hand: &[Card]| {
            let seven = [hand, &deal[4..]].concat();
            let mut ranks = Vec::new();
            for first in 0..7 {
                for second in first + 1..7 {
                    let five: Vec<_> = seven
                        .iter()
                        .enumerate()
                        .filter(|(i, _)| *i != first && *i != second)
                        .map(|(_, card)| *card)
                        .collect();
                    ranks.push(reference_five(&five));
                }
            }
            ranks.into_iter().max().unwrap()
        };
        let expected = match reference(&deal[..2]).cmp(&reference(&deal[2..4])) {
            std::cmp::Ordering::Greater => 1.0,
            std::cmp::Ordering::Equal => 0.5,
            std::cmp::Ordering::Less => 0.0,
        };
        assert_eq!(
            showdown_cards(&deal[..2], &deal[2..4], &deal[4..]).unwrap(),
            expected
        );
    }
}
