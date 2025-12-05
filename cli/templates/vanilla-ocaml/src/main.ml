open Brr
open Rcade

let ( !! ) = Jstr.v
let app = El.find_first_by_selector !!"#app" |> Option.get

let () =
  Jv.set (El.to_jv app) "innerHTML"
  @@ Jv.of_string
       {|
  <h1>{{Short Name}}</h1>
  <p id="status">Press 1P START</p>
  <div id="controls"></div>
|}

let controls = El.find_first_by_selector !!"#controls" |> Option.get

let rec loop update time =
  let (`Continue_with c) = update time in
  let _id = G.request_animation_frame (fun time -> loop c time) in
  ()

let rec main_loop _time =
  let all_inputs =
    [
      ("↑", Player1.Dpad.up ());
      ("↓", Player1.Dpad.down ());
      ("←", Player1.Dpad.left ());
      ("→", Player1.Dpad.right ());
      ("A", Player1.a ());
      ("B", Player1.b ());
    ]
  in
  let remaining_update =
    List.filter_map (fun (s, b) -> if b then Some s else None) all_inputs
  in
  let s =
    match remaining_update with
    | [] -> "-"
    | _ :: _ -> String.concat " " remaining_update
  in
  El.set_children controls [ Brr.El.txt' s ];
  `Continue_with main_loop

let rec start_loop _time =
  if System.one_player () then `Continue_with main_loop
  else `Continue_with start_loop

let () = loop start_loop 0.
