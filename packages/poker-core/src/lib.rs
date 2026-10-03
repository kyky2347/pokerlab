#![cfg_attr(not(any(feature = "python", test)), allow(dead_code))]

#[cfg(test)]
mod evaluator_tests;

#[cfg(feature = "python")]
use pyo3::exceptions::PyValueError;
#[cfg(feature = "python")]
use pyo3::prelude::*;
use std::collections::HashSet;

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
struct Card {
    rank: u8,
    suit: u8,
}

impl Card {
    fn parse(token: &str) -> Result<Self, String> {
        let bytes = token.as_bytes();
        if bytes.len() != 2 {
            return Err(format!("card must have two characters: {token}"));
        }
        let rank = match bytes[0].to_ascii_uppercase() {
            b'2'..=b'9' => bytes[0] - b'0',
            b'T' => 10,
            b'J' => 11,
            b'Q' => 12,
            b'K' => 13,
            b'A' => 14,
            _ => return Err(format!("invalid rank: {token}")),
        };
        let suit = match bytes[1].to_ascii_lowercase() {
            b'c' => 0,
            b'd' => 1,
            b'h' => 2,
            b's' => 3,
            _ => return Err(format!("invalid suit: {token}")),
        };
        Ok(Self { rank, suit })
    }

    #[cfg_attr(not(feature = "python"), allow(dead_code))]
    fn token(self) -> String {
        let rank = b"--23456789TJQKA"[self.rank as usize] as char;
        let suit = b"cdhs"[self.suit as usize] as char;
        format!("{rank}{suit}")
    }
}

type HandRank = Vec<u8>;

fn straight_high(ranks: impl Iterator<Item = u8>) -> Option<u8> {
    let mut mask = ranks.fold(0_u16, |mask, rank| mask | (1 << rank));
    // Ace is also rank one for the wheel; retain rank fourteen for Broadway.
    if mask & (1 << 14) != 0 {
        mask |= 1 << 1;
    }
    (5_u8..=14).rev().find(|high| {
        let window = 0b11111_u16 << (high - 4);
        mask & window == window
    })
}

#[cfg(test)]
fn evaluate_five_cards(cards: &[Card]) -> Result<HandRank, String> {
    if cards.len() != 5 || cards.iter().copied().collect::<HashSet<_>>().len() != 5 {
        return Err("five unique cards are required".into());
    }
    Ok(rank_five_unique(cards.try_into().unwrap()))
}

// Private hot path: callers supply five distinct indices of a validated hand.
// Do not expose this helper at the Python/domain boundary without validation.
fn rank_five_unique(cards: &[Card; 5]) -> HandRank {
    let mut counts = [0_u8; 15];
    for card in cards {
        counts[card.rank as usize] += 1;
    }
    let mut groups = [(0_u8, 0_u8); 5];
    let mut group_count = 0;
    for rank in 2..=14 {
        if counts[rank] != 0 {
            groups[group_count] = (counts[rank], rank as u8);
            group_count += 1;
        }
    }
    let grouped = &mut groups[..group_count];
    grouped.sort_unstable_by(|a, b| b.cmp(a));
    let flush = cards.iter().all(|card| card.suit == cards[0].suit);
    let straight = straight_high(cards.iter().map(|card| card.rank));
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
        let mut ranks = cards.map(|card| card.rank);
        ranks.sort_unstable_by(|a, b| b.cmp(a));
        let mut result = Vec::with_capacity(6);
        result.push(5);
        result.extend(ranks);
        return result;
    }
    if let Some(high) = straight {
        return vec![4, high];
    }
    if grouped[0].0 == 3 {
        return vec![3, grouped[0].1, grouped[1].1, grouped[2].1];
    }
    if grouped[0].0 == 2 && grouped[1].0 == 2 {
        return vec![2, grouped[0].1, grouped[1].1, grouped[2].1];
    }
    if grouped[0].0 == 2 {
        return vec![1, grouped[0].1, grouped[1].1, grouped[2].1, grouped[3].1];
    }
    let mut ranks = cards.map(|card| card.rank);
    ranks.sort_unstable_by(|a, b| b.cmp(a));
    let mut result = Vec::with_capacity(6);
    result.push(0);
    result.extend(ranks);
    result
}

fn evaluate_seven_cards(cards: &[Card]) -> Result<HandRank, String> {
    if cards.len() != 7 || cards.iter().copied().collect::<HashSet<_>>().len() != 7 {
        return Err("seven unique cards are required".into());
    }
    let mut best: Option<HandRank> = None;
    for a in 0..3 {
        for b in (a + 1)..4 {
            for c in (b + 1)..5 {
                for d in (c + 1)..6 {
                    for e in (d + 1)..7 {
                        let rank =
                            rank_five_unique(&[cards[a], cards[b], cards[c], cards[d], cards[e]]);
                        if best.as_ref().is_none_or(|current| rank > *current) {
                            best = Some(rank);
                        }
                    }
                }
            }
        }
    }
    Ok(best.expect("seven cards produce combinations"))
}

#[cfg(feature = "python")]
#[pyfunction]
fn evaluate_seven(cards: Vec<String>) -> PyResult<Vec<u8>> {
    let parsed = cards
        .iter()
        .map(|token| Card::parse(token))
        .collect::<Result<Vec<_>, _>>()
        .map_err(PyValueError::new_err)?;
    evaluate_seven_cards(&parsed).map_err(PyValueError::new_err)
}

#[cfg(feature = "python")]
#[pyfunction]
fn deck() -> Vec<String> {
    (2..=14)
        .flat_map(|rank| (0..4).map(move |suit| Card { rank, suit }.token()))
        .collect()
}

#[cfg(feature = "python")]
#[pymodule]
fn poker_core_rs(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(evaluate_seven, module)?)?;
    module.add_function(wrap_pyfunction!(deck, module)?)?;
    module.add("__version__", "1.0.0")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cards(tokens: &[&str]) -> Vec<Card> {
        tokens
            .iter()
            .map(|token| Card::parse(token).unwrap())
            .collect()
    }

    #[test]
    fn deck_is_unique() {
        let all: Vec<Card> = (2..=14)
            .flat_map(|rank| (0..4).map(move |suit| Card { rank, suit }))
            .collect();
        assert_eq!(all.len(), 52);
        assert_eq!(all.iter().copied().collect::<HashSet<_>>().len(), 52);
    }

    #[test]
    fn straight_flush_beats_quads() {
        let straight_flush =
            evaluate_seven_cards(&cards(&["As", "Ks", "Qs", "Js", "Ts", "2d", "3c"])).unwrap();
        let quads =
            evaluate_seven_cards(&cards(&["Ah", "Ad", "Ac", "As", "Kh", "2d", "3c"])).unwrap();
        assert!(straight_flush > quads);
    }

    #[test]
    fn wheel_straight_is_five_high() {
        let rank =
            evaluate_seven_cards(&cards(&["As", "2d", "3c", "4h", "5s", "Kd", "Qc"])).unwrap();
        assert_eq!(rank, vec![4, 5]);
    }
}
