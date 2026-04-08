import gleam/int
import gleam/list
import gleam_community/colour
import lustre
import lustre/attribute as a
import lustre/effect
import lustre/element as el
import lustre/element/html as h
import lustre/event as e
import paint as p
import paint/canvas
import paint/encode
import rcade/inputs.{type Player1Inputs, type Player2Inputs}
import rcade/inputs/controls.{type Controls}

pub fn main() {
  canvas.define_web_component()
  let app = lustre.application(init, update, view)

  let assert Ok(_) = lustre.start(app, "#app", Nil)

  Nil
}

type Model {
  Model(n: Int, offset_x: Float, offset_y: Float)
}

fn init(_flags) {
  let model = Model(n: 0, offset_x: 0.0, offset_y: 0.0)
  let effects =
    effect.batch([
      inputs.poll(every: 16, with: fn(p1, p2, _system) { Controls(p1, p2) }),
    ])
  #(model, effects)
}

type Msg {
  Incr
  Decr
  Controls(p1: Player1Inputs, p2: Player2Inputs)
}

const move_speed = 4.0

fn update(model: Model, msg: Msg) {
  case msg {
    Incr -> #(Model(..model, n: model.n + 1), effect.none())
    Decr -> #(Model(..model, n: model.n - 1), effect.none())
    Controls(p1, p2) -> {
      let #(p1_dx, p1_dy) = joystick(p1.controls)
      let #(p2_dx, p2_dy) = joystick(p2.controls)
      let dx = p1_dx +. p2_dx
      let dy = p1_dy +. p2_dy

      // Both spinners/buttons affect Incr/Decr
      let spin_delta = p1.spinner.step_delta + p2.spinner.step_delta
      let button_delta = case
        p1.controls.b || p2.controls.b,
        p1.controls.a || p2.controls.a
      {
        True, _ -> 1
        _, True -> -1
        _, _ -> 0
      }

      #(
        Model(
          n: model.n + spin_delta + button_delta,
          offset_x: model.offset_x +. dx,
          offset_y: model.offset_y +. dy,
        ),
        effect.none(),
      )
    }
  }
}

fn move(lhs: Bool, rhs: Bool) {
  case lhs, rhs {
    True, False -> 0.0 -. move_speed
    False, True -> move_speed
    _, _ -> 0.0
  }
}

fn joystick(state: Controls) -> #(Float, Float) {
  let horizontal = move(state.left, state.right)
  let vertical = move(state.up, state.down)

  #(horizontal, vertical)
}

fn picture(model: Model) -> p.Picture {
  let center_x = int.to_float(window_inner_width()) /. 2.0 +. model.offset_x
  let center_y = int.to_float(window_inner_height()) /. 2.0 +. model.offset_y

  list.repeat(p.circle, model.n)
  |> list.index_map(fn(pic, i) {
    let hue = int.to_float(i * 10 % 360) /. 360.0
    let assert Ok(col) = colour.from_hsla(h: hue, s: 1.0, l: 0.7, a: 0.2)
    pic(5.5 +. 0.6 *. int.to_float(i))
    |> p.translate_y(75.0)
    |> p.rotate(p.angle_deg(10.0 *. int.to_float(i)))
    |> p.fill(col)
  })
  |> p.combine
  |> p.translate_xy(center_x, center_y)
  |> p.concat(
    p.text(int.to_string(model.n), px: 12) |> p.translate_xy(15.0, 20.0),
  )
}

fn canvas(picture: p.Picture, attributes: List(a.Attribute(a))) {
  el.element(
    "paint-canvas",
    [a.attribute("picture", encode.to_string(picture)), ..attributes],
    [],
  )
}

fn view(model: Model) {
  h.div([], [
    canvas(picture(model), [
      a.height(window_inner_height()),
      a.width(window_inner_width()),
      a.style("background", "#f5f5f5"),
      a.style("line-height", "0"),
      e.on_click(Incr),
    ]),
  ])
}

@external(javascript, "./window_ffi.mjs", "windowInnerHeight")
fn window_inner_height() -> Int

@external(javascript, "./window_ffi.mjs", "windowInnerWidth")
fn window_inner_width() -> Int
