package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/binary"
	"errors"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/coder/websocket"
	rgbmatrix "github.com/fcjr/rgbmatrix-rpi"
)

//go:embed idle.gif
var idleGIF []byte

const (
	msgApply         byte = 0x00
	msgSetBrightness byte = 0x01
)

type display struct {
	inner rgbmatrix.Matrix
	w, h  int

	mu    sync.Mutex
	taken bool
}

func (d *display) tryTake() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.taken {
		return false
	}
	d.taken = true
	return true
}

func (d *display) release() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.taken = false
}

func (d *display) isTaken() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.taken
}

func (d *display) apply(pixels []color.Color) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.inner.Apply(pixels)
}

func (d *display) applyIfIdle(pixels []color.Color) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if !d.taken {
		_ = d.inner.Apply(pixels)
	}
}

func (d *display) setBrightness(b uint8) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.inner.SetBrightness(int(b) * 100 / 255)
}

func (d *display) handleMessage(msg []byte, cw, ch int) error {
	if len(msg) < 3 {
		return errors.New("message shorter than TLV header")
	}
	t := msg[0]
	length := binary.BigEndian.Uint16(msg[1:3])
	payload := msg[3:]
	if len(payload) != int(length) {
		return fmt.Errorf("TLV length mismatch: header=%d payload=%d", length, len(payload))
	}
	switch t {
	case msgApply:
		expected := cw * ch * 3
		if len(payload) != expected {
			return fmt.Errorf("apply: expected %d bytes, got %d", expected, len(payload))
		}
		img := image.NewRGBA(image.Rect(0, 0, cw, ch))
		for i := 0; i < cw*ch; i++ {
			o := i * 3
			img.Pix[i*4+0] = payload[o+0]
			img.Pix[i*4+1] = payload[o+1]
			img.Pix[i*4+2] = payload[o+2]
			img.Pix[i*4+3] = 255
		}
		return d.apply(toPixels(img, d.w, d.h))
	case msgSetBrightness:
		if len(payload) != 1 {
			return fmt.Errorf("setBrightness: expected 1 byte, got %d", len(payload))
		}
		d.setBrightness(payload[0])
		return nil
	default:
		return fmt.Errorf("unknown message type 0x%02x", t)
	}
}

func handleTake(d *display) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cw, err := strconv.Atoi(r.URL.Query().Get("w"))
		if err != nil || cw <= 0 {
			http.Error(w, "bad or missing 'w'", http.StatusBadRequest)
			return
		}
		ch, err := strconv.Atoi(r.URL.Query().Get("height"))
		if err != nil || ch <= 0 {
			http.Error(w, "bad or missing 'height'", http.StatusBadRequest)
			return
		}

		if !d.tryTake() {
			http.Error(w, "display in use", http.StatusConflict)
			return
		}

		c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if err != nil {
			d.release()
			log.Printf("ws accept error: %v", err)
			return
		}
		log.Printf("client connected (%dx%d)", cw, ch)
		defer func() {
			c.CloseNow()
			d.release()
			log.Printf("client disconnected (%dx%d)", cw, ch)
		}()

		ctx := r.Context()
		for {
			typ, data, err := c.Read(ctx)
			if err != nil {
				return
			}
			if typ != websocket.MessageBinary {
				c.Close(websocket.StatusUnsupportedData, "expected binary")
				return
			}
			if err := d.handleMessage(data, cw, ch); err != nil {
				log.Printf("message error: %v", err)
				c.Close(websocket.StatusUnsupportedData, err.Error())
				return
			}
		}
	}
}

func runIdleLoop(ctx context.Context, d *display) {
	g, err := gif.DecodeAll(bytes.NewReader(idleGIF))
	if err != nil {
		log.Printf("idle gif decode error (idle display disabled): %v", err)
		return
	}
	canvas := image.NewRGBA(image.Rect(0, 0, g.Config.Width, g.Config.Height))
	i := 0
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		if d.isTaken() {
			i = 0
			draw.Draw(canvas, canvas.Bounds(), image.Black, image.Point{}, draw.Src)
			time.Sleep(100 * time.Millisecond)
			continue
		}
		frame := g.Image[i]
		draw.Draw(canvas, frame.Bounds(), frame, frame.Bounds().Min, draw.Over)
		d.applyIfIdle(toPixels(canvas, d.w, d.h))
		delay := time.Duration(g.Delay[i]) * 10 * time.Millisecond
		if delay < 50*time.Millisecond {
			delay = 50 * time.Millisecond
		}
		i = (i + 1) % len(g.Image)
		time.Sleep(delay)
	}
}

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

var (
	gpioSpeed = flag.Int("gpio-speed", 4, "GPIO speed value for matrix timing")
	addr      = flag.String("addr", ":8080", "websocket listen address")
)

func main() {
	flag.Parse()

	hc := &rgbmatrix.HardwareConfig{
		HardwareMapping:   "adafruit-hat-pwm",
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
		DropPrivileges: 0,
		DoGPIOInit:     true,
	}

	log.Printf("HardwareConfig: %+v", hc)
	log.Printf("RuntimeOptions: %+v", rc)

	m, err := rgbmatrix.NewRGBLedMatrix(hc, rc)
	if err != nil {
		log.Printf("NewRGBLedMatrix error: %v", err)
		return
	}
	defer m.Close()

	w, h := m.Geometry()
	d := &display{inner: m, w: w, h: h}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go runIdleLoop(ctx, d)

	mux := http.NewServeMux()
	mux.HandleFunc("/take", handleTake(d))

	log.Printf("marquee-display websocket listening on %s/take (display %dx%d)", *addr, w, h)
	log.Fatal(http.ListenAndServe(*addr, mux))
}
