package main

import (
	"bytes"
	_ "embed"
	"flag"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"log"
	"sync"
	"time"

	rgbmatrix "github.com/fcjr/rgbmatrix-rpi"
)

//go:embed idle.gif
var idleGIF []byte

const idleTimeout = 5 * time.Second

type idleMatrix struct {
	inner      rgbmatrix.Matrix
	mu         sync.Mutex
	lastClient time.Time // zero = never; start idle immediately
}

func (m *idleMatrix) Geometry() (int, int)       { return m.inner.Geometry() }
func (m *idleMatrix) At(pos int) color.Color     { return m.inner.At(pos) }
func (m *idleMatrix) Set(pos int, c color.Color) { m.inner.Set(pos, c) }
func (m *idleMatrix) Render() error              { return m.inner.Render() }
func (m *idleMatrix) Close() error               { return m.inner.Close() }
func (m *idleMatrix) SetBrightness(b int)        { m.inner.SetBrightness(b) }

// Apply is called by RPC clients — intercept to track last activity.
func (m *idleMatrix) Apply(leds []color.Color) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lastClient = time.Now()
	return m.inner.Apply(leds)
}

func (m *idleMatrix) isIdle() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lastClient.IsZero() || time.Since(m.lastClient) > idleTimeout
}

// applyIdle sends a frame only if no client has been active recently.
func (m *idleMatrix) applyIdle(leds []color.Color) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.lastClient.IsZero() || time.Since(m.lastClient) > idleTimeout {
		m.inner.Apply(leds) //nolint:errcheck
	}
}

func runIdleLoop(m *idleMatrix) {
	g, err := gif.DecodeAll(bytes.NewReader(idleGIF))
	if err != nil {
		log.Printf("idle gif decode error (idle display disabled): %v", err)
		return
	}
	w, h := m.inner.Geometry()
	canvas := image.NewRGBA(image.Rect(0, 0, g.Config.Width, g.Config.Height))
	i := 0
	for {
		if !m.isIdle() {
			// Client active — reset GIF so it plays fresh on resume.
			i = 0
			draw.Draw(canvas, canvas.Bounds(), image.Black, image.Point{}, draw.Src)
			time.Sleep(250 * time.Millisecond)
			continue
		}
		frame := g.Image[i]
		draw.Draw(canvas, frame.Bounds(), frame, frame.Bounds().Min, draw.Over)
		m.applyIdle(toPixels(canvas, w, h))
		delay := time.Duration(g.Delay[i]) * 10 * time.Millisecond
		if delay < 50*time.Millisecond {
			delay = 50 * time.Millisecond
		}
		i = (i + 1) % len(g.Image)
		time.Sleep(delay)
	}
}

// toPixels converts src to a flat []color.Color scaled to (w, h) via nearest-neighbor.
func toPixels(src image.Image, w, h int) []color.Color {
	sw, sh := src.Bounds().Dx(), src.Bounds().Dy()
	ox, oy := src.Bounds().Min.X, src.Bounds().Min.Y
	p := make([]color.Color, w*h)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			sx := x * sw / w
			sy := y * sh / h
			r, g, b, a := src.At(ox+sx, oy+sy).RGBA()
			p[y*w+x] = color.RGBA{R: uint8(r >> 8), G: uint8(g >> 8), B: uint8(b >> 8), A: uint8(a >> 8)}
		}
	}
	return p
}

var gpioSpeed = flag.Int("gpio-speed", 4, "GPIO speed value for matrix timing")

func main() {
	flag.Parse()

	hc := &rgbmatrix.HardwareConfig{
		HardwareMapping:   "adafruit-hat",
		Rows:              32,
		Cols:              64,
		ChainLength:       2,
		Parallel:          1,
		PWMBits:           11,
		PWMLSBNanoseconds: 130,
		Brightness:        50,
		ScanMode:          rgbmatrix.Progressive,
	}
	rc := &rgbmatrix.RuntimeOptions{
		GPIOSlowdown:   *gpioSpeed,
		Daemon:         0,
		DropPrivileges: 0, //1, // ask library to drop privileges after init
		DoGPIOInit:     true,
	}

	// Diagnostics: log configs so journalctl shows what we passed in
	log.Printf("HardwareConfig: %+v", hc)
	log.Printf("RuntimeOptions: %+v", rc)

	m, err := rgbmatrix.NewRGBLedMatrix(hc, rc)
	if err != nil {
		log.Printf("NewRGBLedMatrix error: %v", err)
		return
	}

	//Note: Trying out a basic implementation without RPC for now, to isolate issues with the display itself before adding RPC into the mix. Once we confirm the display is working reliably, we can re-enable the RPC server code below.

	c := rgbmatrix.NewCanvas(m)
	defer c.Close()

	// Debug: fill entire display solid red, render once, then block.
	bounds := c.Bounds()
	log.Printf("Canvas bounds: %v", bounds)
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			c.Set(x, y, color.RGBA{255, 0, 0, 255})
		}
	}
	if err := c.Render(); err != nil {
		log.Printf("Render error: %v", err)
	}
	log.Println("Render called — display should be solid red. Blocking.")
	select {} // block forever so the display stays lit

	// Note: Below is code to run RPC Server
	// defer m.Close()

	// im := &idleMatrix{inner: m}
	// go runIdleLoop(im)

	// log.Println("marquee-display RPC server listening on :1234")
	// rpc.Serve(im) // blocks; systemd Restart=on-failure handles crashes
}
