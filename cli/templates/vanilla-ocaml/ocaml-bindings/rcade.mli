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

module Player1 : Player
module Player2 : Player

module System : sig
  val one_player : unit -> bool
  val two_player : unit -> bool
end
