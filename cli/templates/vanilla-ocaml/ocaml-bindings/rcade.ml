module type Player = sig
  module Dpad : sig
    val up : unit -> bool
    val down : unit -> bool
    val left : unit -> bool
    val right : unit -> bool
  end

  val a : unit -> bool
  val b : unit -> bool
end

let rcade = Jv.get Jv.global "rcade"

module Make (S : sig
  val player_name : string
end) : Player = struct
  let player = Jv.get rcade S.player_name

  module Dpad = struct
    let dpad = Jv.get player "DPAD"
    let up () = Jv.get dpad "up" |> Jv.to_bool
    let down () = Jv.get dpad "down" |> Jv.to_bool
    let left () = Jv.get dpad "left" |> Jv.to_bool
    let right () = Jv.get dpad "right" |> Jv.to_bool
  end

  let a () = Jv.get player "A" |> Jv.to_bool
  let b () = Jv.get player "B" |> Jv.to_bool
end

module Player1 = Make (struct
  let player_name = "PLAYER_1"
end)

module Player2 = Make (struct
  let player_name = "PLAYER_2"
end)

module System = struct
  let system = Jv.get rcade "SYSTEM"
  let one_player () = Jv.get system "ONE_PLAYER" |> Jv.to_bool
  let two_player () = Jv.get system "TWO_PLAYER" |> Jv.to_bool
end
