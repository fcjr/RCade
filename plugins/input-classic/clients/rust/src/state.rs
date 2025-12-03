#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ControllerState {
    pub connected: bool,
    pub system_one_player: bool,
    pub system_two_player: bool,
    pub player1_up: bool,
    pub player1_down: bool,
    pub player1_left: bool,
    pub player1_right: bool,
    pub player1_a: bool,
    pub player1_b: bool,
    pub player2_up: bool,
    pub player2_down: bool,
    pub player2_left: bool,
    pub player2_right: bool,
    pub player2_a: bool,
    pub player2_b: bool,
}
